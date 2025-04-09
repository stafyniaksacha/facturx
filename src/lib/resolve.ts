import type { XMLParseOptions } from 'libxmljs'
import type { Buffer } from 'node:buffer'
import type { LoadOptions } from 'pdf-lib'
import { parseXmlAsync, XMLDocument } from 'libxmljs'
import { PDFDocument } from 'pdf-lib'

export async function resolveXml(
  xml: string | Buffer | XMLDocument,
  options: XMLParseOptions = {
    encoding: 'utf8',
  },
): Promise<XMLDocument> {
  if (xml instanceof XMLDocument) {
    return xml
  }

  return await parseXmlAsync(xml, options)
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
