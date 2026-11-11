import type { DOC_TYPE_KEY } from './lib/constants'

export interface BaseInfo {
  seller: string
  buyer: string
  number: string
  date: Date
  docType: DOC_TYPE_KEY
}
export interface PdfMetadata {
  author: string
  title: string
  subject: string
  keywords: string[]
  date: Date
}
export interface XmpMetadata extends PdfMetadata {
  producer: string
  creator: string
  /**
   * @deprecated Ignored since the XMP packet uses the fixed id `W5M0MpCehiHzreSzNTczkc9d` (was
   * CG-06), and `generate()` keeps the source PDF's trailer `/ID` instead of creating one. Kept
   * optional so existing callers still compile; it will be removed in the next major version.
   */
  documentId?: string
  filename: string
  conformanceLevel: string
}
