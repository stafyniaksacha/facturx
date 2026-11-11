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

// Compressed input fed to zlib per attempt, and the most it may produce. Deflate expands at most
// about 1032:1, so the output, and the memory, stay bounded even for a crafted bomb.
const MAX_COMPRESSED_INPUT = 64 * 1024
const MAX_INFLATED_OUTPUT = 8 * 1024 * 1024

/**
 * The embedded file streams of a file specification (`/EF` `/F` and `/UF`, which readers may pick
 * either of), and whether its `/EF` is malformed: present but not a dictionary, or an entry that is
 * not a stream. A file specification without `/EF` embeds nothing.
 */
export function embeddedFileStreams(fileSpec: PDFDict): { streams: PDFRawStream[], malformed: boolean } {
  if (!fileSpec.has(PDFName.of('EF')))
    return { streams: [], malformed: false }
  const ef = fileSpec.lookup(PDFName.of('EF'))
  if (!(ef instanceof PDFDict))
    return { streams: [], malformed: true }

  const streams: PDFRawStream[] = []
  let malformed = false
  for (const key of ['F', 'UF']) {
    if (!ef.has(PDFName.of(key)))
      continue
    const stream = ef.lookup(PDFName.of(key))
    if (!(stream instanceof PDFRawStream))
      malformed = true
    else if (!streams.includes(stream))
      streams.push(stream)
  }
  return { streams, malformed }
}

/**
 * At most `maxBytes` bytes from the start of an embedded file stream, or undefined when it cannot
 * be read within bounded work. Only unfiltered and `/FlateDecode`
 * streams are read (pdf-lib's attach() writes the latter); for any other filter or filter chain
 * it returns undefined. Flate data is inflated by node:zlib from a bounded slice of the compressed input with a
 * capped output, never through pdf-lib's decoder, which inflates whole deflate blocks.
 */
export function readEmbeddedFilePrefix(stream: PDFRawStream, maxBytes: number): Uint8Array | undefined {
  const filter = stream.dict.lookup(PDFName.of('Filter'))
  const filters = filter instanceof PDFArray ? filter.asArray() : filter === undefined ? [] : [filter]
  if (filters.length === 0)
    return stream.contents.subarray(0, maxBytes)
  if (filters.length !== 1 || stream.dict.lookup(PDFName.of('DecodeParms')) !== undefined
    || stream.dict.context.lookup(filters[0]) !== PDFName.of('FlateDecode')) {
    return undefined
  }

  // Shrink the compressed slice until its output fits the cap: only a stream far more compressible
  // than any real XML (a bomb) needs more than one attempt.
  if (stream.contents.length === 0)
    return new Uint8Array(0)
  let input = Math.min(stream.contents.length, MAX_COMPRESSED_INPUT)
  while (input > 0) {
    try {
      const inflated = inflateSync(stream.contents.subarray(0, input), {
        finishFlush: zlibConstants.Z_SYNC_FLUSH, // tolerate the cut-off end of the slice
        maxOutputLength: MAX_INFLATED_OUTPUT,
      })
      return new Uint8Array(inflated.buffer, inflated.byteOffset, Math.min(inflated.byteLength, maxBytes))
    }
    catch (error) {
      if ((error as { code?: string }).code !== 'ERR_BUFFER_TOO_LARGE')
        return undefined // Not valid zlib data.
      input = input >= 4096 ? Math.floor(input / 4) : 0
    }
  }
  return undefined
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
