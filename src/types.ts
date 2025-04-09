import { DOC_TYPE_KEY } from "./lib/constants"

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
  date: Date;
}
export interface XmpMetadata extends PdfMetadata {
  producer: string;
  creator: string;
  documentId: string;
  filename: string;
  conformanceLevel: string;
}
