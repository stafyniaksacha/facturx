import type { XmlElement } from 'libxml2-wasm'
import type { Buffer } from 'node:buffer'
import type { BaseInfo } from '../types'
import type {
  DOC_TYPE_KEY,
} from './constants'
import { parse } from 'date-fns'
import { XmlDocument } from 'libxml2-wasm'
import {
  FACTURX_SCHEMA,
  ORDERX_SCHEMA,
} from './constants'
import { resolveXml } from './resolve'

export function extractNamespaces(fileDoc: XmlDocument): Record<string, string> {
  return fileDoc.root.namespaces
}

export function getLevel(xmlDoc: XmlDocument): string {
  const namespaces = extractNamespaces(xmlDoc)

  // Factur-X and Order-X
  let doc_id_xpath = xmlDoc.find([
    '//rsm:ExchangedDocumentContext',
    '/ram:GuidelineSpecifiedDocumentContextParameter',
    '/ram:ID',
  ].join(''), namespaces)

  if (!doc_id_xpath.length) {
    // ZUGFeRD 1.0
    doc_id_xpath = xmlDoc.find([
      '//rsm:SpecifiedExchangedDocumentContext',
      '/ram:GuidelineSpecifiedDocumentContextParameter',
      '/ram:ID',
    ].join(''), namespaces)
  }
  if (!doc_id_xpath.length) {
    throw new Error('No ID found in the document')
  }
  const xpathNode = doc_id_xpath[0]

  if (!xpathNode.content) {
    throw new Error('No text found in the ID node')
  }

  const doc_id = xpathNode?.content?.split(':')
  let level = doc_id[doc_id.length - 1]

  const possibleValues = new Set([...Object.keys(FACTURX_SCHEMA), ...Object.keys(ORDERX_SCHEMA)])
  if (!possibleValues.has(level)) {
    // Order-X
    level = doc_id[doc_id.length - 2] // skip the last part (date revision)
  }
  if (!possibleValues.has(level)) {
    throw new Error(`Unknown level: "${level}"`)
  }
  return level
}

export function getFlavor(fileDoc: XmlDocument): string {
  const tag = fileDoc.root?.name
  switch (tag) {
    case 'SCRDMCCBDACIOMessageStructure':
      return 'orderx'
    case 'CrossIndustryInvoice':
      return 'facturx'
    case 'CrossIndustryDocument':
      return 'zugferd'
  }
  throw new Error(`XML not recognized as Factur-X, Order-X or ZUGFeRD`)
}

export async function extractBaseInfo(xml: string | Buffer | XmlDocument): Promise<BaseInfo> {
  const xmlDoc = await resolveXml(xml)

  try {
    const namespaces = extractNamespaces(xmlDoc)

    const dateEl = findXPath(xmlDoc, '//rsm:ExchangedDocument/ram:IssueDateTime/udt:DateTimeString', namespaces)
    const dateStr = dateEl.content
    const dateFormat = dateEl.attr('format')?.value || '102'
    const formatMap = {
      // eslint-disable-next-line style/quote-props
      '102': 'yyyyMMdd',
      // eslint-disable-next-line style/quote-props
      '203': 'yyyyMMddHHmm',
    } as const
    const date = dateStr ? parse(dateStr, formatMap[dateFormat as keyof typeof formatMap], new Date()) : new Date()

    const numberEl = findXPath(xmlDoc, '//rsm:ExchangedDocument/ram:ID', namespaces)
    const number = numberEl.content || ''

    const sellerEl = findXPath(xmlDoc, '//ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:Name', namespaces)
    const seller = sellerEl.content || ''

    const buyerEl = findXPath(xmlDoc, '//ram:ApplicableHeaderTradeAgreement/ram:BuyerTradeParty/ram:Name', namespaces)
    const buyer = buyerEl.content || ''

    const docTypeEl = findXPath(xmlDoc, '//rsm:ExchangedDocument/ram:TypeCode', namespaces)
    const docType = docTypeEl.content as DOC_TYPE_KEY || ''

    return {
      seller,
      buyer,
      number,
      date,
      docType,
    }
  }
  finally {
    if (!(xml instanceof XmlDocument)) {
      // Dispose the XmlDocument instance if we created it within this function
      xmlDoc.dispose()
    }
  }
}
// export function getOrderXLevel(fileDoc) {
//   // segfault - https://github.com/libxmljs/libxmljs/issues/649
//   // const namespaces = fileDoc.namespaces()
//   const namespaces = {
//     rsm: 'urn:un:unece:uncefact:data:SCRDMCCBDACIOMessageStructure:100',
//     udt: 'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:128',
//     qdt: 'urn:un:unece:uncefact:data:standard:QualifiedDataType:128',
//     ram: 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:128',
//     xsi: 'http://www.w3.org/2001/XMLSchema-instance',
//   }

//   const type_code_xpath = fileDoc.find([
//     "/rsm:SCRDMCCBDACIOMessageStructure",
//     "/rsm:ExchangedDocument",
//     "/ram:TypeCode",
//   ].join(''), namespaces)

//   if (!type_code_xpath.length) {
//     throw new Error('No Type Code found in the document')
//   }

//   const type_code = type_code_xpath[0].text().split(':')
//   console.log('type_code', type_code)

//   let level = type_code[type_code.length - 1]
//   // if (!doc_id_xpath.length) {
//   //   throw new Error('No ID found in the document')
//   // }
//   // const doc_id = doc_id_xpath[0].text().split(':')
//   // let level = doc_id[doc_id.length - 1]

//   // const possibleValues = Object.keys(facturx)
//   // if (!possibleValues.includes(level)) {
//   //   level = doc_id[doc_id.length - 2]
//   // }
//   // if (!possibleValues.includes(level)) {
//   //   throw new Error(`Unknown level: "${level}"`)
//   // }
//   return level
// }

function findXPath(fileDoc: XmlDocument, xpath: string, namespaces: Record<string, string>): XmlElement {
  const xpathNode = fileDoc.find(xpath, namespaces)
  if (!xpathNode.length) {
    throw new Error(`No ${xpath} found in the document`)
  }
  return xpathNode[0] as XmlElement
}
