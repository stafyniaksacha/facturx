import type { XmlDocument } from 'libxml2-wasm'
import type { PDFDict, PDFDocument } from 'pdf-lib'

import { Buffer } from 'node:buffer'

import { PDFHexString, PDFName, PDFString } from 'pdf-lib'

import { check } from './check'
import { FACTURX_FILENAME, ORDERX_FILENAME, XRECHNUNG_FILENAME, ZUGFERD_FILENAMES } from './constants'
import { decodeName, EmbeddedFileDecodeError, embeddedFileStream, EmbeddedFileTooLargeError, InflateBudget, InflateBudgetExceededError, readEmbeddedFile, readEmbeddedFilesNames } from './pdf'
import { resolvePdf, resolveXml } from './resolve'
import { declaresExtendedCtcFr, declaresXRechnung, getFlavor } from './xml'

/**
 * The flavor to validate an attachment with. `zugferd` comes from the legacy ZUGFeRD file names and
 * has no schema (#38), so read the XML's root instead: a ZUGFeRD 2.x invoice is a Factur-X
 * `CrossIndustryInvoice`; ZUGFeRD 1.0 (`CrossIndustryDocument`) has no vendored spec.
 */
function validationFlavor(flavor: string | undefined, xml: XmlDocument, filename: string): string | undefined {
  if (flavor !== 'zugferd')
    return flavor
  const root = getFlavor(xml)
  if (root === 'zugferd')
    throw new Error('ZUGFeRD 1.0 validation is not supported: no ZUGFeRD 1.0 schema is shipped. Use `check: false` (CLI: --no-check) to extract it')
  if (root === 'orderx')
    throw new Error(`Invalid XML: ${filename} holds an Order-X order, not an invoice`)
  return root
}

// The flavor of each recognized attachment name. xrechnung.xml holds a CII invoice too (§6.2 p.25,
// §7.7), so its flavor is facturx, the one getFlavor() gives its CrossIndustryInvoice root.
const FILE_FLAVORS = new Map<string, string>([
  [FACTURX_FILENAME, 'facturx'],
  [XRECHNUNG_FILENAME, 'facturx'],
  [ORDERX_FILENAME, 'orderx'],
  ...ZUGFERD_FILENAMES.map(name => [name, 'zugferd'] as [string, string]),
])

// The most bytes one invoice may decode to, and the inflate budget of one extract() call. An
// EXTENDED invoice of tens of thousands of lines stays far below it.
const MAX_EXTRACTED_BYTES = 128 * 1024 * 1024

interface InvoiceFile {
  filename: string
  flavor: string
  fileSpec: PDFDict
}

/**
 * The first EmbeddedFiles name tree entry with a recognized name, matched on names only, so no
 * other file is decoded (was CG-29: every entry was decoded first). Tree keys are tried first, in
 * tree order, as before; only when no key matches are the file specifications' `/F` and `/UF` tried
 * (ISO 32000-1 §7.11.3, not vendored: readers may name a file by either). `filename` is the name
 * that matched.
 */
function findInvoiceFile(pdf: PDFDocument): InvoiceFile | undefined {
  const entries = readEmbeddedFilesNames(pdf)
  for (const { fileName, fileSpec } of entries) {
    const name = decodeName(fileName)
    const flavor = FILE_FLAVORS.get(name)
    if (flavor)
      return { filename: name, flavor, fileSpec }
  }
  for (const { fileSpec } of entries) {
    for (const key of ['F', 'UF']) {
      const value = fileSpec.lookup(PDFName.of(key))
      if (!(value instanceof PDFString || value instanceof PDFHexString))
        continue
      const name = decodeName(value)
      const flavor = FILE_FLAVORS.get(name)
      if (flavor)
        return { filename: name, flavor, fileSpec }
    }
  }
  return undefined
}

/**
 * The decoded bytes of the matched file, read once (was CG-29). MAX_EXTRACTED_BYTES caps each filter
 * stage and, as one budget, the output of all stages together.
 */
function readInvoiceFile({ filename, fileSpec }: InvoiceFile): Uint8Array {
  const stream = embeddedFileStream(fileSpec)
  if (!stream)
    throw new Error(`Malformed embedded file ${filename}: its file specification has no embedded file stream (/EF)`)
  try {
    // An owned copy of exactly the decoded length: the decoder's result can be a view into the
    // caller's PDF bytes or into a larger zlib buffer holding unrelated memory.
    return new Uint8Array(readEmbeddedFile(stream, MAX_EXTRACTED_BYTES, new InflateBudget(MAX_EXTRACTED_BYTES)))
  }
  catch (error) {
    if (error instanceof EmbeddedFileTooLargeError || error instanceof InflateBudgetExceededError)
      throw new Error(`The embedded file ${filename} is too large: more than ${MAX_EXTRACTED_BYTES / 1024 / 1024} MiB once decoded`)
    if (error instanceof EmbeddedFileDecodeError)
      throw new Error(`Cannot decode the embedded file ${filename}: ${error.message}`)
    throw error
  }
}

interface ExtractResult {
  filename: string
  /** The XML as re-serialized by libxml2 (BOM, declaration and line endings may differ from the PDF's). */
  xml: string
  /**
   * The attachment's bytes exactly as embedded in the PDF, decoded from its stream filters only
   * (was CG-26). Use them to verify a hash or signature taken over the issued XML. They parsed as the
   * same XML as `xml`.
   */
  bytes: Uint8Array
  flavor?: string
  level?: string
}

export async function extract(options: {
  pdf: string | Buffer | PDFDocument
  check?: boolean
  level?: string
  flavor?: string
}): Promise<ExtractResult> {
  const pdf = await resolvePdf(options.pdf)

  const level = options.level
  const file = findInvoiceFile(pdf)
  if (!file) {
    throw new Error('No attachment found')
  }
  if (options.flavor && options.flavor !== file.flavor)
    throw new Error(`Invalid flavor, expected ${options.flavor} but found ${file.flavor}`)
  const flavor = file.flavor

  const data = readInvoiceFile(file)
  const xml = await resolveXml(Buffer.from(data))

  try {
    if (options.check === true) {
      const checkFlavor = validationFlavor(flavor, xml, file.filename)
      // A plain-CII EXTENDED-CTC-FR document is no Factur-X profile: a hybrid PDF cannot declare it
      // (BR-HYBRID-07/15). Read from the XML, so an explicit `level` cannot hide it.
      if (checkFlavor === 'facturx' && declaresExtendedCtcFr(xml))
        throw new Error('Invalid XML: the embedded invoice declares EXTENDED-CTC-FR, a plain CII profile that is not a Factur-X profile')
      // An XRechnung is embedded as xrechnung.xml, and factur-x.xml's conformance level MUST NOT be
      // XRECHNUNG (§7.7 p.69, codelists--Filename.csv). check() reads an XRechnung CIUS as en16931,
      // so this is refused here, by its BT-24.
      if (file.filename === FACTURX_FILENAME && declaresXRechnung(xml))
        throw new Error('Invalid XML: factur-x.xml holds an XRechnung, which must be embedded as xrechnung.xml')
      const result = await check({
        xml,
        flavor: checkFlavor,
        level,
      })
      if (!result.valid) {
        throw new Error('Invalid XML')
      }
      // An explicit `level: 'extended-ctc-fr'` on a document that does not declare it already
      // threw in check(); this keeps any other route to that level out of a hybrid PDF.
      if (result.level === 'extended-ctc-fr')
        throw new Error('Invalid XML: the embedded invoice declares EXTENDED-CTC-FR, a plain CII profile that is not a Factur-X profile')
    }

    return {
      filename: file.filename,
      xml: xml.toString(),
      bytes: data,
      flavor,
      level,
    }
  }
  finally {
    xml.dispose()
  }
}
