import type { Buffer } from 'node:buffer'
import type {
  PDFDocument,
} from 'pdf-lib'
import type { PdfMetadata } from '../types'

import { randomBytes } from 'node:crypto'

import { XmlDocument } from 'libxml2-wasm'
import {
  AFRelationship,
  PDFArray,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFString,
} from 'pdf-lib'
import pkg from '../../package.json' with { type: 'json' }

import { check } from './check'
import { FACTURX_CONFORMANCE_LEVEL, FACTURX_FILENAME, ORDERX_FILENAME, ZUGFERD_FILENAMES } from './constants'
import { baseInfo2PdfMetadata } from './metadata'
import { attachmentNames } from './pdf'

import { resolvePdf, resolveXml } from './resolve'
import { extractBaseInfo, getFlavor, getLevel } from './xml'
import { setPDFA3BMetadata } from './xmp'

// PDFDocument objects generate() has already attached an invoice to. pdf-lib only writes the
// attachment into the name tree on save(), so the tree alone cannot detect a reused document.
const generated = new WeakSet<PDFDocument>()

export async function generate(options: {
  pdf: string | Buffer | PDFDocument
  xml: string | Buffer | XmlDocument
  check?: boolean
  flavor?: string
  level?: string
  language?: string
  meta?: PdfMetadata
}): Promise<Uint8Array> {
  const xml = await resolveXml(options.xml)

  try {
    const flavor = options.flavor || getFlavor(xml)
    const level = options.level || getLevel(xml)

    if (options.check === true) {
      const result = await check({
        xml,
        flavor,
        level,
      })
      if (!result.valid) {
        throw new Error(`Invalid XML format (${flavor} - ${level})`)
      }
    }

    let meta = options.meta

    if (!meta) {
      const info = await extractBaseInfo(xml)
      meta = baseInfo2PdfMetadata(info)
    }
    meta.date ||= new Date()

    let description = ''
    let filename = ''
    let conformanceLevel = ''

    switch (flavor) {
      case 'facturx':
        filename = FACTURX_FILENAME
        description = 'Factur-X XML file'
        conformanceLevel = FACTURX_CONFORMANCE_LEVEL[level as keyof typeof FACTURX_CONFORMANCE_LEVEL] || ''
        break
      case 'orderx':
        filename = ORDERX_FILENAME
        description = 'Order-X XML file'
        break
      case 'zugferd':
        filename = ZUGFERD_FILENAMES[0]
        description = 'ZUGFeRD XML file'
        break
      default:
        throw new Error(`Unknown schema flavor: "${options.flavor}"`)
    }

    const pdf = await resolvePdf(options.pdf)

    assertEmbeddable(pdf)
    // Marked synchronously, before the first await below, so overlapping calls on the same
    // PDFDocument cannot both attach an invoice.
    generated.add(pdf)
    setDocumentId(pdf)

    const encoder = new TextEncoder()
    const uint8Array = encoder.encode(xml.toString())

    await pdf.attach(uint8Array, filename, {
      afRelationship: AFRelationship.Data,
      mimeType: 'text/xml',
      creationDate: meta.date,
      modificationDate: meta.date,
      description,
    })

    const creator = `${pkg.name} npm lib v${pkg.version} (https://github.com/${pkg.repository})`

    if (options.language) {
      pdf.setLanguage(options.language)
    }
    pdf.setCreationDate(meta.date)
    pdf.setModificationDate(meta.date)

    pdf.setTitle(meta.title)
    pdf.setSubject(meta.subject)
    pdf.setAuthor(meta.author)
    pdf.setKeywords(meta.keywords)
    pdf.setCreator(creator)

    setPDFA3BMetadata({
      ...meta,
      filename,
      conformanceLevel,
      producer: creator,
      creator,
    }, pdf)

    return await pdf.save()
  }
  finally {
    if (!(options.xml instanceof XmlDocument)) {
      // Dispose the XmlDocument instance if we created it within this function
      xml.dispose()
    }
  }
}

/**
 * Reject inputs that generate() cannot turn into a correct hybrid document. pdf-lib rewrites the
 * whole file and appends attachments without decrypting, re-signing or replacing anything.
 */
function assertEmbeddable(pdf: PDFDocument): void {
  // pdf-lib does not decrypt the source nor encrypt the attachment it adds.
  if (pdf.isEncrypted)
    throw new Error('Encrypted PDFs are not supported')

  // ISO 32000-1 §12.7.2, SigFlags bit 1 (SignaturesExist), and §12.8.4 /Perms (DocMDP): saving
  // rewrites the file, which would invalidate the signature. Sign after generate() instead.
  const acroForm = pdf.context.lookup(pdf.catalog.get(PDFName.of('AcroForm')))
  const sigFlags = acroForm instanceof PDFDict ? pdf.context.lookup(acroForm.get(PDFName.of('SigFlags'))) : undefined
  if ((sigFlags instanceof PDFNumber && (sigFlags.asNumber() & 1) === 1) || pdf.catalog.has(PDFName.of('Perms')))
    throw new Error('Signed PDFs are not supported: sign the document after generate()')

  // pdf-lib appends to the root /Names array of the EmbeddedFiles name tree. A root with /Kids
  // (ISO 32000-1 §7.9.6) would end up with both /Kids and /Names, which is invalid.
  const names = pdf.context.lookup(pdf.catalog.get(PDFName.of('Names')))
  const embeddedFiles = names instanceof PDFDict ? pdf.context.lookup(names.get(PDFName.of('EmbeddedFiles'))) : undefined
  if (embeddedFiles instanceof PDFDict && embeddedFiles.has(PDFName.of('Kids')))
    throw new Error('PDFs whose embedded files name tree has /Kids are not supported')

  // A second invoice would be appended next to the first, and extract() would return the old one.
  const invoiceNames = [FACTURX_FILENAME, ORDERX_FILENAME, ...ZUGFERD_FILENAMES]
  const existing = attachmentNames(pdf).find(name => invoiceNames.includes(name))
  if (existing || generated.has(pdf))
    throw new Error(`The PDF already has an embedded invoice${existing ? ` (${existing})` : ''}`)
}

/**
 * Set the trailer /ID for the file we are about to write. ISO 32000-1 §14.4: the first element is
 * a permanent identifier set when the file is created and kept across updates; the second changes
 * whenever the file is modified. Keep the source PDF's permanent identifier when it has one, and
 * always write a fresh second element since the output is a modified file.
 */
function setDocumentId(pdf: PDFDocument): void {
  const changing = PDFHexString.of(randomBytes(16).toString('hex'))
  const existing = pdf.context.lookup(pdf.context.trailerInfo.ID)
  const permanent = existing instanceof PDFArray ? pdf.context.lookup(existing.get(0)) : undefined

  if (permanent instanceof PDFHexString || permanent instanceof PDFString) {
    pdf.context.trailerInfo.ID = pdf.context.obj([permanent, changing])
  }
  else {
    // No /ID (or a malformed one): this file gets a new identity, both elements equal.
    pdf.context.trailerInfo.ID = pdf.context.obj([changing, changing])
  }
}
