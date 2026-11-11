import type {
  PDFDocument,
} from 'pdf-lib'
import { inflateSync, constants as zlibConstants } from 'node:zlib'
import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFStream,
  PDFString,
} from 'pdf-lib'

export function extractAttachments(pdfDoc: PDFDocument): {
  name: string
  data: Uint8Array<ArrayBufferLike>
}[] {
  const rawAttachments = readEmbeddedFilesNames(pdfDoc)

  return rawAttachments.map(({ fileName, fileSpec }) => {
    const stream = fileSpec
      .lookup(PDFName.of('EF'), PDFDict)
      .lookup(PDFName.of('F'), PDFStream) as PDFRawStream

    return {
      name: fileName.decodeText(),
      data: decodePDFRawStream(stream).decode(),
    }
  })
}

/**
 * Every embedded file the document references: each EmbeddedFiles name tree entry (read through
 * the validated reader below) and each file specification in the catalog `/AF` array (PDF/A-3
 * associated files), once each. `names` holds the tree key and the file specification's `/F` and
 * `/UF`, which can all differ; a file associated only through `/AF` has no tree key.
 */
export function embeddedFileSpecs(pdfDoc: PDFDocument): { names: string[], fileSpec: PDFDict }[] {
  const specs = new Map<PDFDict, Set<string>>()
  const add = (fileSpec: unknown, key?: PDFHexString | PDFString): void => {
    if (!(fileSpec instanceof PDFDict))
      return
    const names = specs.get(fileSpec) ?? new Set<string>()
    if (key)
      names.add(key.decodeText())
    for (const entry of ['F', 'UF']) {
      const name = fileSpec.lookup(PDFName.of(entry))
      if (name instanceof PDFString || name instanceof PDFHexString)
        names.add(name.decodeText())
    }
    specs.set(fileSpec, names)
  }

  for (const { fileName, fileSpec } of readEmbeddedFilesNames(pdfDoc))
    add(fileSpec, fileName)

  const af = pdfDoc.catalog.lookup(PDFName.of('AF'))
  if (af instanceof PDFArray) {
    for (let idx = 0; idx < af.size(); idx++)
      add(af.lookup(idx))
  }

  return [...specs].map(([fileSpec, names]) => ({ names: [...names], fileSpec }))
}

/**
 * Every embedded file stream of a file specification: all stream values of `/EF` (`/F`, `/UF`,
 * and the deprecated `/DOS`, `/Mac`, `/Unix`, any of which a reader may pick). Entries that are not
 * streams are ignored. A file specification without `/EF` embeds nothing.
 */
export function embeddedFileStreams(fileSpec: PDFDict): PDFRawStream[] {
  const ef = fileSpec.lookup(PDFName.of('EF'))
  if (!(ef instanceof PDFDict))
    return []
  const streams: PDFRawStream[] = []
  for (const key of ef.keys()) {
    const stream = ef.lookup(key)
    if (stream instanceof PDFRawStream && !streams.includes(stream))
      streams.push(stream)
  }
  return streams
}

// Inflation is synchronous, so its total cost is bounded instead: each attempt inflates a slice of
// the compressed input (starting small, growing 4x only while the text is still shorter than
// needed) with a capped output, and every inflated byte is charged to a per-PDF budget. Deflate
// expands at most about 1032:1, so even a crafted bomb stays within these bounds.
const FIRST_COMPRESSED_INPUT = 1024
const MAX_COMPRESSED_INPUT = 64 * 1024
const MAX_ATTEMPT_OUTPUT = 2 * 1024 * 1024

export class InflateBudgetExceededError extends Error {
  constructor() {
    super('Inflate budget exceeded')
  }
}

/** Inflated bytes still allowed for one PDF; charging past it throws InflateBudgetExceededError. */
export class InflateBudget {
  constructor(public remaining: number) {}

  charge(bytes: number): void {
    this.remaining -= bytes
    if (this.remaining < 0)
      throw new InflateBudgetExceededError()
  }
}

/**
 * At most `maxBytes` bytes from the start of an embedded file stream, or undefined when it cannot
 * be read. Only unfiltered and `/FlateDecode` streams are read (pdf-lib's attach() writes the
 * latter); for any other filter or filter chain it returns undefined. Flate data is inflated by
 * node:zlib, never through pdf-lib's decoder, which inflates whole deflate blocks. Throws
 * InflateBudgetExceededError once the budget is spent.
 */
export function readEmbeddedFilePrefix(stream: PDFRawStream, maxBytes: number, budget: InflateBudget): Uint8Array | undefined {
  const filter = stream.dict.lookup(PDFName.of('Filter'))
  const filters = filter instanceof PDFArray ? filter.asArray() : filter === undefined ? [] : [filter]
  if (filters.length === 0)
    return stream.contents.subarray(0, maxBytes)
  if (filters.length !== 1 || stream.dict.lookup(PDFName.of('DecodeParms')) !== undefined
    || stream.dict.context.lookup(filters[0]) !== PDFName.of('FlateDecode')) {
    return undefined
  }

  const total = Math.min(stream.contents.length, MAX_COMPRESSED_INPUT)
  let input = Math.min(total, FIRST_COMPRESSED_INPUT)
  let best: Uint8Array | undefined = total === 0 ? new Uint8Array(0) : undefined
  while (input > 0) {
    try {
      const inflated = inflateSync(stream.contents.subarray(0, input), {
        finishFlush: zlibConstants.Z_SYNC_FLUSH, // tolerate the cut-off end of the slice
        maxOutputLength: MAX_ATTEMPT_OUTPUT,
      })
      budget.charge(inflated.byteLength)
      best = new Uint8Array(inflated.buffer, inflated.byteOffset, Math.min(inflated.byteLength, maxBytes))
    }
    catch (error) {
      if (error instanceof InflateBudgetExceededError)
        throw error
      // The output produced before a failure (over the cap, or invalid data after a valid start)
      // is not reported, so charge the most this attempt could have produced.
      budget.charge(Math.min(MAX_ATTEMPT_OUTPUT, input * 1032))
      return best // Keep the previous, shorter prefix, if any.
    }
    if (best.byteLength >= maxBytes || input >= total)
      return best
    input = Math.min(input * 4, total)
  }
  return best
}

const MALFORMED_NAME_TREE = 'Malformed EmbeddedFiles name tree'

/**
 * Read the `/Names` array of the catalog's EmbeddedFiles name tree as validated
 * (key, file specification) pairs (ISO 32000-1 §7.9.6: keys are strings, the array alternates
 * key and value). Missing tree or missing `/Names` array gives `[]`; a `/Kids`-only tree is
 * not walked.
 *
 * Throws `Malformed EmbeddedFiles name tree: …` when catalog `/Names` or `/EmbeddedFiles` is not
 * a dictionary, `/Names` is not an array or has an odd length, a key is not a string (a `/Name`
 * key is rejected too), or a value does not resolve to a dictionary, instead of letting a raw
 * pdf-lib error escape (#40). `generate()` calls it before attaching so pdf-lib never appends to a
 * broken array. The message never includes document content.
 */
export function readEmbeddedFilesNames(pdfDoc: PDFDocument): {
  fileName: PDFHexString | PDFString
  fileSpec: PDFDict
}[] {
  if (!pdfDoc.catalog.has(PDFName.of('Names')))
    return []
  const Names = pdfDoc.catalog.lookup(PDFName.of('Names'))
  if (!(Names instanceof PDFDict))
    throw new Error(`${MALFORMED_NAME_TREE}: catalog /Names is not a dictionary`)

  if (!Names.has(PDFName.of('EmbeddedFiles')))
    return []
  const EmbeddedFiles = Names.lookup(PDFName.of('EmbeddedFiles'))
  if (!(EmbeddedFiles instanceof PDFDict))
    throw new Error(`${MALFORMED_NAME_TREE}: /EmbeddedFiles is not a dictionary`)

  if (!EmbeddedFiles.has(PDFName.of('Names')))
    return []
  const EFNames = EmbeddedFiles.lookup(PDFName.of('Names'))
  if (!(EFNames instanceof PDFArray))
    throw new Error(`${MALFORMED_NAME_TREE}: /Names is not an array`)

  const len = EFNames.size()
  if (len % 2 !== 0)
    throw new Error(`${MALFORMED_NAME_TREE}: /Names has an odd number of entries (${len})`)

  const entries = [] as {
    fileName: PDFHexString | PDFString
    fileSpec: PDFDict
  }[]

  for (let idx = 0; idx < len; idx += 2) {
    const fileName = EFNames.lookup(idx)
    if (!(fileName instanceof PDFString || fileName instanceof PDFHexString))
      throw new Error(`${MALFORMED_NAME_TREE}: key at index ${idx} is not a string`)

    const fileSpec = EFNames.lookup(idx + 1)
    if (!(fileSpec instanceof PDFDict))
      throw new Error(`${MALFORMED_NAME_TREE}: value at index ${idx + 1} is not a dictionary`)

    entries.push({ fileName, fileSpec })
  }

  return entries
}
