import type { Buffer } from 'node:buffer'
import type {
  PDFDocument,
  PDFObject,
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
  PDFString,
} from 'pdf-lib'
import pkg from '../../package.json' with { type: 'json' }

import { check } from './check'
import { FACTURX_CONFORMANCE_LEVEL, FACTURX_FILENAME, ORDERX_FILENAME, XRECHNUNG_FILENAME, ZUGFERD_FILENAMES } from './constants'
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
    // Write attachments the caller queued with pdf-lib's attach() into the name tree, so the
    // check below sees them too.
    await pdf.flush()
    assertNoEmbeddedInvoice(pdf)
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

    await pdf.flush()
    sortEmbeddedFiles(pdf)

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
  // §6.1 p.25: a Factur-X document must not be encrypted, and pdf-lib would not encrypt the
  // attachment it adds anyway.
  if (pdf.isEncrypted)
    throw new Error('Encrypted PDFs are not supported')

  // Saving rewrites the whole file, which invalidates any signature. A signed signature field has
  // a /V value (ISO 32000-1 §12.7.4.5); /Perms (§12.8.4) holds DocMDP or UR3 signatures. Unsigned
  // signature fields are left alone. Factur-X §4 p.21 applies the signature to the finished PDF envelope.
  if (pdf.catalog.has(PDFName.of('Perms')) || hasSignedField(pdf))
    throw new Error('Signed PDFs are not supported: sign the document after generate()')

  // pdf-lib appends to the root /Names array of the EmbeddedFiles name tree. A root with /Kids
  // (ISO 32000-1 §7.9.6) would end up with both /Kids and /Names, which is invalid.
  const names = pdf.context.lookup(pdf.catalog.get(PDFName.of('Names')))
  const embeddedFiles = names instanceof PDFDict ? pdf.context.lookup(names.get(PDFName.of('EmbeddedFiles'))) : undefined
  if (embeddedFiles instanceof PDFDict && embeddedFiles.has(PDFName.of('Kids')))
    throw new Error('PDFs whose embedded files name tree has /Kids are not supported')

  if (generated.has(pdf))
    throw new Error('This PDFDocument was already passed to generate(): load a new one for each call')
}

/**
 * §6 p.24: only one invoice XML per document. A second one would be appended next to the first,
 * and extract() would return the old one. Names: codelists--Filename.csv plus legacy ZUGFeRD.
 */
function assertNoEmbeddedInvoice(pdf: PDFDocument): void {
  const invoiceNames = [FACTURX_FILENAME, XRECHNUNG_FILENAME, ORDERX_FILENAME, ...ZUGFERD_FILENAMES]
  const existing = attachmentNames(pdf).find(name => invoiceNames.includes(name))
  if (existing)
    throw new Error(`The PDF already has an embedded invoice (${existing})`)
}

/**
 * pdf-lib appends new attachments at the end of the EmbeddedFiles /Names array, but name tree keys
 * must be sorted in lexical order (ISO 32000-1 §7.9.6) for readers that search the tree by key.
 * assertEmbeddable() rejects a root with /Kids, so the tree is a single flat /Names array here.
 */
function sortEmbeddedFiles(pdf: PDFDocument): void {
  const names = pdf.context.lookup(pdf.catalog.get(PDFName.of('Names')))
  const embeddedFiles = names instanceof PDFDict ? pdf.context.lookup(names.get(PDFName.of('EmbeddedFiles'))) : undefined
  if (!(embeddedFiles instanceof PDFDict))
    return
  const entries = pdf.context.lookup(embeddedFiles.get(PDFName.of('Names')))
  if (!(entries instanceof PDFArray))
    return

  const pairs: { key: Uint8Array, name: PDFObject, value: PDFObject }[] = []
  for (let i = 0; i + 1 < entries.size(); i += 2) {
    const name = entries.get(i)
    const key = pdf.context.lookup(name)
    if (!(key instanceof PDFHexString || key instanceof PDFString))
      return // Not a well-formed name tree: leave it as it is rather than guess.
    pairs.push({ key: key.asBytes(), name, value: entries.get(i + 1) })
  }
  pairs.sort((a, b) => compareBytes(a.key, b.key))

  // In place: the array may be an indirect object, and a replacement would leave the old one behind.
  pairs.forEach(({ name, value }, i) => {
    entries.set(2 * i, name)
    entries.set(2 * i + 1, value)
  })
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i])
      return a[i] - b[i]
  }
  return a.length - b.length
}

function hasSignedField(pdf: PDFDocument): boolean {
  const acroForm = pdf.context.lookup(pdf.catalog.get(PDFName.of('AcroForm')))
  if (!(acroForm instanceof PDFDict))
    return false

  // /FT and /V are both inheritable (ISO 32000-1 §12.7.3.1, Table 220), so carry them down the
  // field tree. Iterative, since the tree comes from an untrusted PDF and can be arbitrarily deep.
  const fields = pdf.context.lookup(acroForm.get(PDFName.of('Fields')))
  if (!(fields instanceof PDFArray))
    return false

  const stack = fields.asArray().map(field => ({ field, type: undefined as PDFObject | undefined, hasValue: false }))
  // Keyed by what the node inherits too, so a malformed kid shared by several parents is checked
  // under each; still bounded, a node can only be reached with a few distinct inherited states.
  const seen = new Map<PDFDict, Set<string>>()
  while (stack.length > 0) {
    const { field, type: inheritedType, hasValue: inheritedValue } = stack.pop()!
    const dict = pdf.context.lookup(field)
    if (!(dict instanceof PDFDict))
      continue
    const key = `${inheritedType}|${inheritedValue}`
    const states = seen.get(dict) ?? new Set<string>()
    if (states.has(key))
      continue
    seen.set(dict, states.add(key))

    const type = pdf.context.lookup(dict.get(PDFName.of('FT'))) ?? inheritedType
    const hasValue = inheritedValue || dict.has(PDFName.of('V'))
    if (type === PDFName.of('Sig') && hasValue)
      return true
    const kids = pdf.context.lookup(dict.get(PDFName.of('Kids')))
    // One push per kid: spreading a very wide /Kids array would exceed the argument limit.
    if (kids instanceof PDFArray) {
      for (const kid of kids.asArray())
        stack.push({ field: kid, type, hasValue })
    }
  }
  return false
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
