import type { Buffer } from 'node:buffer'
import type {
  PDFDocument,
  PDFObject,
  PDFRawStream,
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
  PDFNull,
  PDFString,
} from 'pdf-lib'
import pkg from '../../package.json' with { type: 'json' }

import { check } from './check'
import { FACTURX_CONFORMANCE_LEVEL, FACTURX_FILENAME, ORDERX_FILENAME, ZUGFERD_FILENAMES } from './constants'
import { baseInfo2PdfMetadata } from './metadata'
import { embeddedFileSpecs, embeddedFileStreams, InflateBudget, InflateBudgetExceededError, readEmbeddedFilePrefix, readEmbeddedFilesNames } from './pdf'

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
    // Throws on a malformed tree, which pdf.attach() would otherwise append to and corrupt (#40).
    readEmbeddedFilesNames(pdf)

    assertEmbeddable(pdf)
    // Marked synchronously, before the first await below, so overlapping calls on the same
    // PDFDocument cannot both attach an invoice.
    generated.add(pdf)
    // Write attachments the caller queued with pdf-lib's attach() into the name tree, so the
    // check below sees them too.
    await pdf.flush()
    assertNoEmbeddedInvoice(pdf, filename, flavor)
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
    sortEmbeddedFiles(pdf, filename)

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

// Root elements (namespace URI, local name) of the documents generate() writes. CII D16B / D22B and
// Order-X from the vendored XSDs. ZUGFeRD 1.0 (`CrossIndustryDocument`) is not vendored: its URI is
// from the ZUGFeRD 1.0 schema and unverified here; a wrong URI only causes a missed detection.
const INVOICE_ROOTS = [
  ['urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100', 'CrossIndustryInvoice'],
  ['urn:ferd:CrossIndustryDocument:invoice:1p0', 'CrossIndustryDocument'],
]
const ORDER_ROOTS = [
  ['urn:un:unece:uncefact:data:SCRDMCCBDACIOMessageStructure:100', 'SCRDMCCBDACIOMessageStructure'],
]

// Names other tools give the invoice (codelists--Filename.csv, legacy ZUGFeRD) or the order. Only a
// backstop for files whose content cannot be read: detection is by content first.
const INVOICE_FILENAMES = [FACTURX_FILENAME, 'xrechnung.xml', ...ZUGFERD_FILENAMES]
const ORDER_FILENAMES = [ORDERX_FILENAME]

// The root start tag sits near the top of the file: only this much decoded text is examined.
const ROOT_SNIFF_BYTES = 64 * 1024
// Bounds on the work done per PDF, which is untrusted input. Past either, the PDF is rejected.
const MAX_SCANNED_FILES = 256
const MAX_INFLATED_BYTES = 64 * 1024 * 1024

/**
 * §6 p.24: only one invoice XML per document. A second one would sit next to the first, and
 * extract() could return the old one. Best effort, on every embedded file reachable from the name
 * tree or the catalog /AF. The source is rejected when a file:
 * - holds a document of the kind being written, detected by content since other tools name the
 *   file differently: the root element (namespace and name) of an invoice for Factur-X / ZUGFeRD,
 *   of an order for Order-X. Other XML, such as an Order-X purchase order supporting an invoice, is
 *   allowed (§6.4);
 * - has a name tree key, /F or /UF that other tools give such a document. This only backs up the
 *   content check, for files it cannot read (other filters, DOCTYPE, unusual encodings);
 * - already uses the name about to be written: two identical keys would be ambiguous.
 * A file that cannot be read and carries no such name is accepted (an open gap, see CONFORMANCE.md).
 */
function assertNoEmbeddedInvoice(pdf: PDFDocument, filename: string, flavor: string): void {
  const conflicting = flavor === 'orderx' ? ORDER_ROOTS : INVOICE_ROOTS
  const conflictingNames = flavor === 'orderx' ? ORDER_FILENAMES : INVOICE_FILENAMES
  const kind = flavor === 'orderx' ? 'order' : 'invoice'
  const specs = embeddedFileSpecs(pdf)

  // Each distinct stream is read once, and only so many are read and inflated: many file
  // specifications can share one expensive stream.
  const budget = new InflateBudget(MAX_INFLATED_BYTES)
  const contents = new Map<PDFRawStream, XmlContent>()
  for (const { names, fileSpec } of specs) {
    for (const stream of embeddedFileStreams(fileSpec)) {
      if (!contents.has(stream)) {
        if (contents.size >= MAX_SCANNED_FILES)
          throw new Error(`The PDF has more than ${MAX_SCANNED_FILES} distinct embedded file streams: could not check it for an existing ${kind}`)
        let prefix: Uint8Array | undefined
        try {
          prefix = readEmbeddedFilePrefix(stream, ROOT_SNIFF_BYTES, budget)
        }
        catch (error) {
          if (error instanceof InflateBudgetExceededError)
            throw new Error(`The PDF's embedded files are too large to check for an existing ${kind}`)
          throw error
        }
        contents.set(stream, prefix ? classifyContent(prefix) : 'undetermined')
      }
      const content = contents.get(stream)!
      if (typeof content === 'object' && conflicting.some(([ns, local]) => content.ns === ns && content.name === local))
        throw new Error(`The PDF already has an embedded ${kind} (${names[0] ?? 'unnamed file'})`)
    }
  }

  // Name checks, after content so that a real invoice is reported as one.
  if (specs.some(({ names }) => names.includes(filename)))
    throw new Error(`The PDF already has an embedded file named ${filename}`)
  for (const { names } of specs) {
    const known = names.find(name => conflictingNames.includes(name))
    if (known)
      throw new Error(`The PDF already has an embedded ${kind} (${known})`)
  }
}

/** Root element of an XML file, a file that is not XML, or XML whose root could not be found. */
type XmlContent = { ns: string, name: string } | 'not-xml' | 'undetermined'

/** Classify a decoded prefix of an embedded file by its root element. */
function classifyContent(prefix: Uint8Array): XmlContent {
  const startTag = rootStartTag(decodePrefix(prefix))
  if (startTag === 'not-xml' || startTag === 'undetermined')
    return startTag

  let doc: XmlDocument | undefined
  try {
    // Parse only the root start tag, closed: it carries the root's namespace declarations, and a
    // prefix cut mid-document would not parse. Default options: never NOENT, DTDLOAD, XINCLUDE or
    // HUGE on untrusted input (AGENTS.md "Security").
    doc = XmlDocument.fromString(startTag.replace(/\/?>$/, '/>'))
    const root = doc.root
    return root ? { ns: root.namespaceUri, name: root.name } : 'undetermined'
  }
  catch {
    return 'undetermined'
  }
  finally {
    doc?.dispose()
  }
}

/** Decode a prefix as text, following a UTF-16 / UTF-8 BOM or a UTF-16 '<' pattern, else UTF-8. */
function decodePrefix(prefix: Uint8Array): string {
  const [b0, b1] = prefix
  const encoding = (b0 === 0xFF && b1 === 0xFE) || (b0 === 0x3C && b1 === 0x00)
    ? 'utf-16le'
    : (b0 === 0xFE && b1 === 0xFF) || (b0 === 0x00 && b1 === 0x3C) ? 'utf-16be' : 'utf-8'
  return new TextDecoder(encoding).decode(prefix) // Drops a BOM; invalid bytes become U+FFFD.
}

/**
 * The root element's start tag, skipping the XML declaration, PIs and comments. 'not-xml' when the
 * text does not start with markup; 'undetermined' when it does but no root start tag can be found
 * (a DOCTYPE, an unterminated construct, or a prolog longer than the prefix).
 */
function rootStartTag(text: string): string | 'not-xml' | 'undetermined' {
  let idx = 0
  let sawMarkup = false
  while (idx < text.length) {
    while (/\s/.test(text[idx] ?? ''))
      idx++
    if (idx >= text.length)
      break
    if (text[idx] !== '<')
      return sawMarkup ? 'undetermined' : 'not-xml'
    // Before any markup, '<' followed by something that cannot open a PI, comment, DOCTYPE or
    // element name (an ASCII non-name character) is plain text, e.g. '<<Important>>' or '<- see'.
    const next = text[idx + 1] ?? ''
    if (!sawMarkup && !/[?!A-Z_:]/i.test(next) && next.charCodeAt(0) < 0x80)
      return 'not-xml'
    sawMarkup = true
    if (text.startsWith('<?', idx)) {
      idx = text.indexOf('?>', idx + 2) // after the opener: '<?>' does not close it
      if (idx < 0)
        return 'undetermined'
      idx += 2
    }
    else if (text.startsWith('<!--', idx)) {
      idx = text.indexOf('-->', idx + 4) // after the opener: '<!-->' and '<!--->' do not close it
      if (idx < 0)
        return 'undetermined'
      idx += 3
    }
    else if (text.startsWith('<!', idx)) {
      // DOCTYPE: quoted ids and an internal subset can hold '>' and ']', so it is not parsed here.
      // Real CII documents carry no DOCTYPE.
      return 'undetermined'
    }
    else {
      let quote = ''
      for (let end = idx + 1; end < text.length; end++) {
        const char = text[end]
        if (quote)
          quote = char === quote ? '' : quote
        else if (char === '"' || char === '\'')
          quote = char
        else if (char === '>')
          return text.slice(idx, end + 1)
      }
      return 'undetermined'
    }
  }
  return sawMarkup ? 'undetermined' : 'not-xml'
}

/**
 * pdf-lib appends new attachments at the end of the EmbeddedFiles /Names array, but name tree keys
 * must be sorted in lexical order (ISO 32000-1 §7.9.6) for readers that search the tree by key.
 * Keys are compared as bytes, so they must share one encoding: pdf-lib always writes UTF-16BE, so
 * the invoice key is rewritten as a PDFDocEncoded string when every source key uses that encoding.
 * assertEmbeddable() rejects a root with /Kids, so the tree is a single flat /Names array here.
 */
function sortEmbeddedFiles(pdf: PDFDocument, invoiceFilename: string): void {
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
      return // Validated by readEmbeddedFilesNames() first; leave anything unexpected untouched.
    pairs.push({ key: key.asBytes(), name, value: entries.get(i + 1) })
  }

  const isUtf16 = (bytes: Uint8Array): boolean => bytes[0] === 0xFE && bytes[1] === 0xFF
  const invoice = pairs.find(({ key, name }) => isUtf16(key) && (pdf.context.lookup(name) as PDFString).decodeText() === invoiceFilename)
  const others = pairs.filter(pair => pair !== invoice)
  // The invoice filenames are ASCII, which PDFDocEncoding encodes as the same bytes.
  if (invoice && others.length > 0 && !others.some(({ key }) => isUtf16(key))) {
    invoice.name = PDFString.of(invoiceFilename)
    invoice.key = (invoice.name as PDFString).asBytes()
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

    // A null value, direct, indirect or a reference to a missing object, is the same as an absent
    // entry (ISO 32000-1 §7.3.9, §7.3.10).
    const resolve = (key: string): PDFObject | undefined => {
      const value = pdf.context.lookup(dict.get(PDFName.of(key)))
      return value === PDFNull ? undefined : value
    }
    const type = resolve('FT') ?? inheritedType
    const hasValue = inheritedValue || resolve('V') !== undefined
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
