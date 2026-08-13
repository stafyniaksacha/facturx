import type { ParseOptions } from 'libxml2-wasm'
import type { LoadOptions } from 'pdf-lib'
import { Buffer } from 'node:buffer'
import { XmlDocument } from 'libxml2-wasm'
import { PDFDocument } from 'pdf-lib'

export async function resolveXml(
  xml: string | Buffer | XmlDocument,
  options: ParseOptions = {
    encoding: 'utf-8',
  },
): Promise<XmlDocument> {
  if (xml instanceof XmlDocument) {
    return xml
  }

  if (Buffer.isBuffer(xml)) {
    return XmlDocument.fromBuffer(xml, options)
  }

  return XmlDocument.fromString(xml, options)
}

export async function resolvePdf(
  pdf: string | Buffer | PDFDocument,
  options: LoadOptions = {},
): Promise<PDFDocument> {
  if (pdf instanceof PDFDocument) {
    return pdf
  }

  return await PDFDocument.load(pdf, options)
}
