import type {
  PDFDocument,
  PDFRawStream,
} from 'pdf-lib'
import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFHexString,
  PDFName,
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
