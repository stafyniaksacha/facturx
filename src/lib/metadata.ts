import { format } from 'date-fns'

import { DOC_TYPE } from './constants'
import type { PdfMetadata, BaseInfo } from '../types'

export function baseInfo2PdfMetadata(info: BaseInfo): PdfMetadata {
  let title = ''
  let subject = ''
  let doc_x = ''
  let author = ''

  const doc_type_name = DOC_TYPE[info.docType] || 'Invoice'
  const date = format(info.date, 'yyyyMMdd')

  // Order Response
  if (info.docType === '231') {
    title = `${info.seller}: Order Response on Order ${info.number} from ${info.buyer}`
    subject = `Response of ${info.seller} on ${date} to order ${info.number} from ${info.buyer}`
    doc_x = `Order-X`
    author = info.seller
  }
  // Order & Order Change
  else if (['220', '230'].includes(info.docType)) {
    title = `${info.buyer}: ${doc_type_name} ${info.number}`
    subject = `${doc_type_name} ${info.number} issued by ${info.buyer} on ${date}`
    doc_x = `Order-X`
    author = info.buyer
  }
  // Invoice & Refund
  else {
    title = `${info.seller}: ${doc_type_name} ${info.number}`
    subject = `${doc_type_name} ${info.number} dated ${date} issued by ${info.seller}`
    doc_x = `Factur-X`
    author = info.seller
  }

  return {
    title,
    subject,
    author,
    keywords: [doc_type_name, doc_x],
    date: info.date,
  }
}