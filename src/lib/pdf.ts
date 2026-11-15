import type { Buffer } from 'node:buffer'
import type {
  PDFDocument,
} from 'pdf-lib'
import { inflateRawSync, inflateSync, constants as zlibConstants } from 'node:zlib'
import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFStream,
  PDFString,
} from 'pdf-lib'

// File names are compared with short known names (factur-x.xml, …) and shown at most 80 characters
// long, so a longer name is decoded only up to this many bytes. pdf-lib's decodeText() spreads the
// whole string into one call, which overflows the stack on names of a few hundred kilobytes.
const MAX_NAME_BYTES = 1024
const decodedNames = new WeakMap<PDFString | PDFHexString, string>()

/**
 * The text of a PDF string used as a file name, decoded once per string object (a shared /F must
 * not be decoded once per file specification). Names longer than 1024 bytes are decoded from their
 * first 1024 bytes only (UTF-16BE with a BOM, else Latin-1 as an approximation of PDFDocEncoding),
 * so they can never equal a known short name.
 */
export function decodeName(value: PDFString | PDFHexString): string {
  const cached = decodedNames.get(value)
  if (cached !== undefined)
    return cached
  const bytes = value.asBytes()
  let text: string
  if (bytes.length <= MAX_NAME_BYTES) {
    text = value.decodeText()
  }
  else {
    const head = bytes.subarray(0, MAX_NAME_BYTES)
    text = head[0] === 0xFE && head[1] === 0xFF
      ? new TextDecoder('utf-16be').decode(head.subarray(2))
      : new TextDecoder('latin1').decode(head)
  }
  decodedNames.set(value, text)
  return text
}

/**
 * The embedded file stream extract() reads from a file specification: `/EF /F`, else `/EF /UF`
 * (ISO 32000-1 §7.11.4, not vendored). Undefined when there is none, or it is not a stream.
 */
export function embeddedFileStream(fileSpec: PDFDict): PDFStream | undefined {
  const ef = fileSpec.lookup(PDFName.of('EF'))
  if (!(ef instanceof PDFDict))
    return undefined
  for (const key of ['F', 'UF']) {
    const stream = ef.lookup(PDFName.of(key))
    if (stream instanceof PDFStream)
      return stream
  }
  return undefined
}

export class EmbeddedFileTooLargeError extends Error {}
export class EmbeddedFileDecodeError extends Error {}

// pdf-lib's decoders for the filters other than Flate. Their output per block is small and
// bounded (LZW at most 512 codes of 4096 bytes), so they are read in slices against the cap.
const PDF_LIB_FILTERS = ['LZWDecode', 'ASCII85Decode', 'ASCIIHexDecode', 'RunLengthDecode']
const PDF_LIB_SLICE = 64 * 1024

/**
 * The whole decoded content of an embedded file stream, read once (was CG-29). Each filter of the
 * `/Filter` chain is applied in turn to the previous output, never lazily through a chain: Flate by
 * node:zlib with a capped output (raw inflate after the 2-byte zlib header, so the Adler-32 trailer
 * is not checked, like pdf-lib's own decoder), LZW, ASCII85, ASCIIHex and RunLength by pdf-lib in
 * slices. Each stage is capped at `maxBytes`, and every stage's output is charged to `budget`, so a
 * filter chain counts its intermediate outputs too. The result may be a view into a larger buffer.
 *
 * Throws EmbeddedFileTooLargeError when a stage would produce more than `maxBytes`,
 * InflateBudgetExceededError when the budget runs out, and EmbeddedFileDecodeError for invalid
 * compressed data (truncated deflate data included), an unknown filter, or a `/Predictor` other than 1 (pdf-lib
 * ignores predictors, so it would have returned wrong bytes).
 */
export function readEmbeddedFile(stream: PDFStream, maxBytes: number, budget: InflateBudget): Uint8Array {
  const { dict } = stream
  const context = dict.context
  const filter = dict.lookup(PDFName.of('Filter'))
  const filters = filter instanceof PDFArray ? filter.asArray() : filter === undefined ? [] : [filter]
  const parms = dict.lookup(PDFName.of('DecodeParms'))
  // A pdf-lib PDFFlateStream (a document built in memory) holds its encoded bytes behind
  // getContents(); a loaded document holds PDFRawStreams.
  let data = stream instanceof PDFRawStream ? stream.contents : stream.getContents()
  if (data.byteLength > maxBytes && filters.length === 0)
    throw new EmbeddedFileTooLargeError()

  for (let idx = 0; idx < filters.length; idx++) {
    const name = context.lookup(filters[idx])
    const parm = context.lookup(parms instanceof PDFArray ? parms.get(idx) : idx === 0 ? parms : undefined)
    if (parm instanceof PDFDict) {
      const predictor = parm.lookup(PDFName.of('Predictor'))
      if (predictor !== undefined && !(predictor instanceof PDFNumber && predictor.asNumber() === 1))
        throw new EmbeddedFileDecodeError('a /Predictor is not supported')
    }
    if (name === PDFName.of('FlateDecode'))
      data = inflateCapped(data, maxBytes, budget)
    else if (PDF_LIB_FILTERS.some(known => name === PDFName.of(known)))
      data = decodeCapped(PDFRawStream.of(context.obj(parm instanceof PDFDict ? { Filter: name as PDFName, DecodeParms: parm } : { Filter: name as PDFName }), data), maxBytes, budget)
    else
      throw new EmbeddedFileDecodeError('unsupported stream filter')
  }
  return data
}

function inflateCapped(data: Uint8Array, maxBytes: number, budget: InflateBudget): Uint8Array {
  // zlib header (RFC 1950): deflate method, a valid check value, no preset dictionary.
  if (data.byteLength < 2 || (data[0] & 0x0F) !== 8 || ((data[0] << 8) | data[1]) % 31 !== 0 || (data[1] & 0x20) !== 0)
    throw new EmbeddedFileDecodeError('invalid zlib header')
  const limit = Math.min(maxBytes, Math.max(budget.remaining, 0))
  let inflated: Buffer
  try {
    // Z_FINISH (the default): a deflate stream that does not reach its end is refused, as pdf-lib
    // refused it, instead of returning a silently truncated file. Bytes after the end are ignored.
    inflated = inflateRawSync(data.subarray(2), { maxOutputLength: Math.max(limit, 1) })
  }
  catch (error) {
    if ((error as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE') {
      budget.charge(limit + 1) // the cap was reached: past it, or past the budget
      throw new EmbeddedFileTooLargeError()
    }
    throw new EmbeddedFileDecodeError('invalid compressed data')
  }
  budget.charge(inflated.byteLength)
  return new Uint8Array(inflated.buffer, inflated.byteOffset, inflated.byteLength)
}

function decodeCapped(stream: PDFRawStream, maxBytes: number, budget: InflateBudget): Uint8Array {
  const decoder = decodePDFRawStream(stream)
  let total = 0
  try {
    // Read in slices only to enforce the cap and the budget while decoding: the decoder keeps all
    // its output in one buffer, which decode() returns once the stream has ended.
    for (;;) {
      const chunk = decoder.getBytes(PDF_LIB_SLICE)
      if (chunk.byteLength === 0)
        break
      total += chunk.byteLength
      budget.charge(chunk.byteLength)
      if (total > maxBytes)
        throw new EmbeddedFileTooLargeError()
    }
    return decoder.decode()
  }
  catch (error) {
    if (error instanceof EmbeddedFileTooLargeError || error instanceof InflateBudgetExceededError)
      throw error
    throw new EmbeddedFileDecodeError('invalid encoded data')
  }
}

// Bounds on the page tree and annotation walk, which reads untrusted input. Every distinct page
// tree node, annotation and array is read once, and past any bound embeddedFileSpecs() throws
// PageScanLimitError instead of reading on.
const MAX_PAGE_TREE_NODES = 65536
const MAX_ANNOTATIONS = 65536
// Entries of the /Kids, /Annots and /AF arrays read, all arrays together.
const MAX_SCAN_ENTRIES = 1024 * 1024
// pdf-lib counts pages recursively in save(): a page tree thousands of levels deep overflows the
// stack. Real page trees are a few levels deep.
const MAX_PAGE_TREE_DEPTH = 256

export class PageScanLimitError extends Error {}
export class MalformedPageTreeError extends Error {}

/**
 * Every embedded file the document references, once each:
 * - each EmbeddedFiles name tree entry (read through the validated reader below);
 * - each file specification in the catalog `/AF` array (PDF/A-3 associated files, document level);
 * - each one in a page's `/AF` array (page level, Factur-X §6.2.1 p.25), in an annotation's `/AF`
 *   (PDF 2.0 / PDF/A-3, not vendored), and the `/FS` of every `/FileAttachment` annotation
 *   (ISO 32000-1 §12.5.6.15, not vendored).
 *
 * `names` holds the tree key and the file specification's `/F` and `/UF`, which can all differ; a
 * file reached only through `/AF` or an annotation has no tree key. The page tree is walked without
 * pdf-lib's traversal, which has no guard against cycles. Each page tree node, annotation, `/AF`
 * array, file specification and file name string is read once, however many times it is
 * referenced, and long names are decoded from their first 1024 bytes only. A node reached twice
 * through `/Kids` throws MalformedPageTreeError: a cycle would overflow pdf-lib's recursive page
 * count in save(), and a shared intermediate node makes that count exponential in depth; ISO
 * 32000-1 §7.7.3 (not vendored) gives each page tree node one `/Parent`. pdf-lib's own addPage()
 * can list a page twice; such a PDF is rejected too. More than 65536 page tree nodes or annotations,
 * more than 1048576 array entries read, or a tree deeper than 256 levels throw PageScanLimitError.
 * Other malformed objects are skipped. A file specification given as a string (a reference to an
 * external file) embeds nothing and is ignored.
 */
export function embeddedFileSpecs(pdfDoc: PDFDocument): { names: string[], fileSpec: PDFDict }[] {
  const specs = new Map<PDFDict, Set<string>>()
  const add = (fileSpec: unknown, key?: PDFHexString | PDFString): void => {
    if (!(fileSpec instanceof PDFDict))
      return
    const known = specs.get(fileSpec)
    if (known) {
      if (key)
        known.add(decodeName(key))
      return
    }
    // The tree key first: error messages name a file by its first name.
    const names = new Set<string>(key ? [decodeName(key)] : [])
    for (const entry of ['F', 'UF']) {
      const name = fileSpec.lookup(PDFName.of(entry))
      if (name instanceof PDFString || name instanceof PDFHexString)
        names.add(decodeName(name))
    }
    specs.set(fileSpec, names)
  }

  for (const { fileName, fileSpec } of readEmbeddedFilesNames(pdfDoc))
    add(fileSpec, fileName)

  let entries = 0
  const charge = (count: number): void => {
    entries += count
    if (entries > MAX_SCAN_ENTRIES)
      throw new PageScanLimitError(`more than ${MAX_SCAN_ENTRIES} page tree, annotation and /AF entries`)
  }
  // One visited set per role: an array used both as an /AF and as an /Annots must be read as both
  // (each read is still charged to the shared budget).
  const seenAf = new Set<PDFArray>()
  const seenAnnots = new Set<PDFArray>()
  const addAf = (dict: PDFDict): void => {
    const af = dict.lookup(PDFName.of('AF'))
    if (!(af instanceof PDFArray) || seenAf.has(af))
      return
    seenAf.add(af)
    charge(af.size())
    for (let idx = 0; idx < af.size(); idx++)
      add(af.lookup(idx))
  }
  addAf(pdfDoc.catalog)

  // Page tree: iterative, /Kids of any node followed whatever its /Type claims.
  const root = pdfDoc.catalog.lookup(PDFName.of('Pages'))
  const pending: { node: unknown, depth: number }[] = [{ node: root, depth: 0 }]
  const reached = new Set<PDFDict>(root instanceof PDFDict ? [root] : [])
  const annotations = new Set<PDFDict>()
  while (pending.length > 0) {
    const { node, depth } = pending.pop()!
    if (!(node instanceof PDFDict))
      continue
    addAf(node)

    const annots = node.lookup(PDFName.of('Annots'))
    if (annots instanceof PDFArray && !seenAnnots.has(annots)) {
      seenAnnots.add(annots)
      charge(annots.size())
      for (let idx = 0; idx < annots.size(); idx++) {
        const annot = annots.lookup(idx)
        if (!(annot instanceof PDFDict) || annotations.has(annot))
          continue
        annotations.add(annot)
        if (annotations.size > MAX_ANNOTATIONS)
          throw new PageScanLimitError(`more than ${MAX_ANNOTATIONS} annotations`)
        addAf(annot)
        if (annot.lookup(PDFName.of('Subtype')) === PDFName.of('FileAttachment'))
          add(annot.lookup(PDFName.of('FS')))
      }
    }

    const kids = node.lookup(PDFName.of('Kids'))
    if (kids instanceof PDFArray) {
      charge(kids.size())
      if (kids.size() > 0 && depth >= MAX_PAGE_TREE_DEPTH)
        throw new PageScanLimitError(`a page tree deeper than ${MAX_PAGE_TREE_DEPTH} levels`)
      for (let idx = 0; idx < kids.size(); idx++) {
        const kid = kids.lookup(idx)
        if (!(kid instanceof PDFDict))
          continue
        if (reached.has(kid))
          throw new MalformedPageTreeError('a page tree node is reached twice')
        reached.add(kid)
        if (reached.size > MAX_PAGE_TREE_NODES)
          throw new PageScanLimitError(`more than ${MAX_PAGE_TREE_NODES} page tree nodes`)
        pending.push({ node: kid, depth: depth + 1 })
      }
    }
  }

  return [...specs].map(([fileSpec, names]) => ({ names: [...names], fileSpec }))
}

/**
 * Every embedded file stream of a file specification: all stream values of `/EF` (`/F`, `/UF`,
 * and the deprecated `/DOS`, `/Mac`, `/Unix`, any of which a reader may pick), each once. Entries
 * that are not streams are ignored. A file specification without `/EF` embeds nothing. Yielded one
 * at a time, so a caller enforcing a limit can stop before walking a huge untrusted `/EF`. An `/EF`
 * already in `walked` (shared by several file specifications) is skipped, then added to it.
 */
export function* embeddedFileStreams(fileSpec: PDFDict, walked: Set<PDFDict>): Generator<PDFRawStream> {
  const ef = fileSpec.lookup(PDFName.of('EF'))
  if (!(ef instanceof PDFDict) || walked.has(ef))
    return
  walked.add(ef)
  const seen = new Set<PDFRawStream>()
  for (const key of ef.keys()) {
    const stream = ef.lookup(key)
    if (stream instanceof PDFRawStream && !seen.has(stream)) {
      seen.add(stream)
      yield stream
    }
  }
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
  // PDFDict.lookup() already maps a null value, direct or indirect, to undefined (ISO 32000-1 §7.3.9).
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
const UNSUPPORTED_NAME_TREE = 'Unsupported EmbeddedFiles name tree'

// Factur-X §6.2.2 p.27 and §6.4 p.31 allow "one or two “/Kids” steps level between “/EmbeddedFiles”
// and “/Names”". The tree is untrusted input, so deeper trees and very wide ones are refused
// instead of walked.
const MAX_KIDS_LEVELS = 2
const MAX_NAME_TREE_NODES = 4096

interface EmbeddedFilesEntry {
  fileName: PDFHexString | PDFString
  fileSpec: PDFDict
}

/**
 * Read the catalog's EmbeddedFiles name tree as validated (key, file specification) pairs, in tree
 * order (ISO 32000-1 §7.9.6: keys are strings, a `/Names` array alternates key and value). The
 * root's own `/Names` array is read, or, when the root has `/Kids`, the `/Names` arrays of its
 * leaves, up to two `/Kids` levels deep (Factur-X §6.2.2 p.27, §6.4 p.31). `/Limits` is ignored.
 * Missing tree or a root with neither `/Names` nor `/Kids` gives `[]`.
 *
 * Throws `Malformed EmbeddedFiles name tree: …` when catalog `/Names` or `/EmbeddedFiles` is not
 * a dictionary, a node has both `/Kids` and `/Names`, `/Kids` is not an array of dictionaries, a
 * node is reached twice (a cycle or a shared kid), `/Names` is not an array or has an odd length, a
 * key is not a string (a `/Name` key is rejected too), or a value does not resolve to a dictionary,
 * instead of letting a raw pdf-lib error escape (#40). Throws `Unsupported EmbeddedFiles name tree:
 * …` past two `/Kids` levels or 4096 nodes. `generate()` calls it before attaching so pdf-lib never
 * appends to a broken array. The message never includes document content.
 */
export function readEmbeddedFilesNames(pdfDoc: PDFDocument): EmbeddedFilesEntry[] {
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

  const entries: EmbeddedFilesEntry[] = []
  readNameTreeNode(EmbeddedFiles, 0, new Set(), entries)
  return entries
}

function readNameTreeNode(node: PDFDict, level: number, visited: Set<PDFDict>, entries: EmbeddedFilesEntry[]): void {
  if (visited.has(node))
    throw new Error(`${MALFORMED_NAME_TREE}: a node is reached twice`)
  visited.add(node)
  if (visited.size > MAX_NAME_TREE_NODES)
    throw new Error(`${UNSUPPORTED_NAME_TREE}: more than ${MAX_NAME_TREE_NODES} nodes`)

  const hasKids = node.has(PDFName.of('Kids'))
  const hasNames = node.has(PDFName.of('Names'))
  // ISO 32000-1 §7.9.6 Table 36: a node has /Kids or /Names, never both.
  if (hasKids && hasNames)
    throw new Error(`${MALFORMED_NAME_TREE}: a node has both /Kids and /Names`)

  if (hasKids) {
    if (level >= MAX_KIDS_LEVELS)
      throw new Error(`${UNSUPPORTED_NAME_TREE}: more than ${MAX_KIDS_LEVELS} /Kids levels`)
    const kids = node.lookup(PDFName.of('Kids'))
    if (!(kids instanceof PDFArray))
      throw new Error(`${MALFORMED_NAME_TREE}: /Kids is not an array`)
    if (visited.size + kids.size() > MAX_NAME_TREE_NODES)
      throw new Error(`${UNSUPPORTED_NAME_TREE}: more than ${MAX_NAME_TREE_NODES} nodes`)
    for (let idx = 0; idx < kids.size(); idx++) {
      const kid = kids.lookup(idx)
      if (!(kid instanceof PDFDict))
        throw new Error(`${MALFORMED_NAME_TREE}: /Kids entry at index ${idx} is not a dictionary`)
      readNameTreeNode(kid, level + 1, visited, entries)
    }
    return
  }

  if (!hasNames)
    return
  const names = node.lookup(PDFName.of('Names'))
  if (!(names instanceof PDFArray))
    throw new Error(`${MALFORMED_NAME_TREE}: /Names is not an array`)

  const len = names.size()
  if (len % 2 !== 0)
    throw new Error(`${MALFORMED_NAME_TREE}: /Names has an odd number of entries (${len})`)

  for (let idx = 0; idx < len; idx += 2) {
    const fileName = names.lookup(idx)
    if (!(fileName instanceof PDFString || fileName instanceof PDFHexString))
      throw new Error(`${MALFORMED_NAME_TREE}: key at index ${idx} is not a string`)

    const fileSpec = names.lookup(idx + 1)
    if (!(fileSpec instanceof PDFDict))
      throw new Error(`${MALFORMED_NAME_TREE}: value at index ${idx + 1} is not a dictionary`)

    entries.push({ fileName, fileSpec })
  }
}
