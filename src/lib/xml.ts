import type { Buffer } from 'node:buffer'
import type { BaseInfo } from '../types'
import type {
  DOC_TYPE_KEY,
} from './constants'
import { parse } from 'date-fns'
import { XmlDocument, XmlElement } from 'libxml2-wasm'
import {
  EXTENDED_CTC_FR_GUIDELINE_ID,
  FACTURX_SCHEMA,
  ORDERX_SCHEMA,
  UBL_CBC_NS,
  UBL_CREDITNOTE_NS,
  UBL_EN16931_CUSTOMIZATION_ID,
  UBL_EXTENDED_CTC_FR_CUSTOMIZATION_ID,
  UBL_INVOICE_NS,
} from './constants'
import { resolveXml } from './resolve'

export function getLevel(xmlDoc: XmlDocument): string {
  if (getFlavorOrUndefined(xmlDoc) === 'ubl')
    return getUblLevel(xmlDoc)

  // Match by local name: namespace prefixes are not significant (Namespaces in XML 1.0 §3), and an
  // invoice may bind the CII/Order-X/ZUGFeRD namespaces to prefixes other than rsm:/ram:. The root
  // element was already identified by getFlavor().
  const idPath = (context: string): string =>
    `//*[local-name()='${context}']/*[local-name()='GuidelineSpecifiedDocumentContextParameter']/*[local-name()='ID']`

  // Factur-X and Order-X
  let doc_id_xpath = xmlDoc.find(idPath('ExchangedDocumentContext'))

  if (!doc_id_xpath.length) {
    // ZUGFeRD 1.0
    doc_id_xpath = xmlDoc.find(idPath('SpecifiedExchangedDocumentContext'))
  }
  if (!doc_id_xpath.length) {
    throw new Error('No ID found in the document')
  }
  return levelFromGuidelineId(doc_id_xpath[0].content)
}

/**
 * Level from a guideline ID (BT-24), e.g. `urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended`.
 * The last `:` segment, or the one before it when the last is a date revision (Order-X, and plain
 * `urn:cen.eu:en16931:2017` for EN 16931).
 */
export function levelFromGuidelineId(id: string | undefined): string {
  // BT-24 is an xs:token (udt:IDType): surrounding whitespace is not significant.
  const value = id?.trim()
  if (!value) {
    throw new Error('No text found in the ID node')
  }

  const doc_id = value.split(':')
  let level = doc_id[doc_id.length - 1]

  const possibleValues = new Set([...Object.keys(FACTURX_SCHEMA), ...Object.keys(ORDERX_SCHEMA)])
  if (!possibleValues.has(level)) {
    // Order-X
    level = doc_id[doc_id.length - 2] // skip the last part (date revision)
  }
  if (!possibleValues.has(level)) {
    throw new Error(`Unknown level: "${level}"`)
  }
  // Nothing downstream checks BT-24 for this profile, so only its exact Annex A ID selects it.
  if (level === 'extended-ctc-fr' && value !== EXTENDED_CTC_FR_GUIDELINE_ID) {
    throw new Error(`Unknown level: "${value}" (EXTENDED-CTC-FR is ${EXTENDED_CTC_FR_GUIDELINE_ID})`)
  }
  return level
}

/**
 * Whether the document's BT-24 is the EXTENDED-CTC-FR guideline ID (exact Annex A value), whatever
 * level a caller passes. False when BT-24 is missing or names no known level.
 */
export function declaresExtendedCtcFr(xml: XmlDocument): boolean {
  try {
    return getLevel(xml) === 'extended-ctc-fr'
  }
  catch {
    return false
  }
}

/** `cbc:CustomizationID` (BT-24) of a UBL document, trimmed, or `undefined` when absent. */
function ublCustomizationId(xmlDoc: XmlDocument): string | undefined {
  // Direct child of the root only: a nested cbc:CustomizationID is not BT-24.
  for (let node = xmlDoc.root?.firstChild ?? null; node; node = node.next) {
    if (node instanceof XmlElement && node.name === 'CustomizationID' && node.namespaceUri === UBL_CBC_NS) {
      // BT-24 is an xs:normalizedString: surrounding whitespace is not significant here.
      return node.content.trim()
    }
  }
  return undefined
}

function ublLevelOfId(id: string): 'en16931' | 'extended-ctc-fr' | undefined {
  if (id === UBL_EXTENDED_CTC_FR_CUSTOMIZATION_ID)
    return 'extended-ctc-fr'
  if (id === UBL_EN16931_CUSTOMIZATION_ID)
    return 'en16931'
  // A CIUS (`…#compliant#X`) is validated as EN 16931. One followed by an extension
  // (`…#compliant#X#conformant#Y`, e.g. the XRechnung extension) is a different specification,
  // for which no rules are shipped: it is not mapped.
  const cius = `${UBL_EN16931_CUSTOMIZATION_ID}#compliant#`
  if (id.startsWith(cius) && !id.slice(cius.length).includes('#conformant#'))
    return 'en16931'
  return undefined
}

/**
 * Level a UBL document declares in `cbc:CustomizationID`, or `undefined` when it has none or an id
 * this package has no rules for. Never throws.
 */
export function getUblDeclaredLevel(xmlDoc: XmlDocument): 'en16931' | 'extended-ctc-fr' | undefined {
  const id = ublCustomizationId(xmlDoc)
  return id === undefined ? undefined : ublLevelOfId(id)
}

/**
 * Level of a UBL 2.1 Invoice/CreditNote from its `cbc:CustomizationID` (BT-24): `en16931` for the
 * core ID or a CIUS (`urn:cen.eu:en16931:2017#compliant#…`, with no `#conformant#` extension after
 * it), `extended-ctc-fr` for exactly its XP Z12-012 Annex A ID. The error never quotes anything but
 * the ID, which is not personal data.
 */
export function getUblLevel(xmlDoc: XmlDocument): 'en16931' | 'extended-ctc-fr' {
  const id = ublCustomizationId(xmlDoc)
  if (id === undefined)
    throw new Error('No cbc:CustomizationID found in the UBL document: cannot determine its level, pass the `level` option')
  const level = ublLevelOfId(id)
  if (level)
    return level
  throw new Error(`Unknown UBL CustomizationID: "${boundForMessage(id)}". Expected "${UBL_EN16931_CUSTOMIZATION_ID}", a CIUS "${UBL_EN16931_CUSTOMIZATION_ID}#compliant#…" (without a "#conformant#" extension) or "${UBL_EXTENDED_CTC_FR_CUSTOMIZATION_ID}"; pass the \`level\` option to override`)
}

/**
 * What an explicit UBL `level` may override. `en16931` may stand in for a missing or unsupported
 * `cbc:CustomizationID` (BR-01 then reports a missing one; no rule reports an unsupported one).
 * `extended-ctc-fr` never may: neither the XSD nor the dedicated Schematron checks the id, so the
 * document must declare exactly the Annex A one. Neither overrides a different level the document
 * declares. Throws otherwise; the message quotes at most the bounded id.
 */
export function assertUblLevelMatches(xmlDoc: XmlDocument, level: string): void {
  const declared = getUblDeclaredLevel(xmlDoc)
  if (declared === level)
    return
  if (level === 'extended-ctc-fr') {
    const id = ublCustomizationId(xmlDoc)
    throw new Error(`level "extended-ctc-fr" does not match the document: its CustomizationID (BT-24) must be ${UBL_EXTENDED_CTC_FR_CUSTOMIZATION_ID} (found ${id === undefined ? 'none' : `"${boundForMessage(id)}"`})`)
  }
  if (declared === undefined)
    return
  throw new Error(`level "${level}" does not match the document: its CustomizationID (BT-24) declares the EXTENDED-CTC-FR extension`)
}

/** Whether the root is a UBL 2.1 Invoice or CreditNote (name and namespace). Never throws. */
export function isUblDocument(fileDoc: XmlDocument): boolean {
  const root = fileDoc.root
  if (!root)
    return false
  return (root.name === 'Invoice' && root.namespaceUri === UBL_INVOICE_NS)
    || (root.name === 'CreditNote' && root.namespaceUri === UBL_CREDITNOTE_NS)
}

// Untrusted text in an error: no control characters, at most 100 characters.
function boundForMessage(value: string): string {
  // eslint-disable-next-line no-control-regex
  const clean = value.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
  return clean.length > 100 ? `${clean.slice(0, 100)}…` : clean
}

function getFlavorOrUndefined(fileDoc: XmlDocument): string | undefined {
  try {
    return getFlavor(fileDoc)
  }
  catch {
    return undefined
  }
}

export function getFlavor(fileDoc: XmlDocument): string {
  const tag = fileDoc.root?.name
  if (isUblDocument(fileDoc))
    return 'ubl'
  switch (tag) {
    case 'SCRDMCCBDACIOMessageStructure':
      return 'orderx'
    case 'CrossIndustryInvoice':
      return 'facturx'
    case 'CrossIndustryDocument':
      return 'zugferd'
  }
  throw new Error(`XML not recognized as Factur-X, Order-X or ZUGFeRD (or UBL 2.1 Invoice/CreditNote)`)
}

export async function extractBaseInfo(xml: string | Buffer | XmlDocument): Promise<BaseInfo> {
  const xmlDoc = await resolveXml(xml)

  try {
    const dateEl = findXPath(xmlDoc, '//rsm:ExchangedDocument/ram:IssueDateTime/udt:DateTimeString')
    const dateStr = dateEl.content
    const dateFormat = dateEl.attr('format')?.value || '102'
    const formatMap = {
      // eslint-disable-next-line style/quote-props
      '102': 'yyyyMMdd',
      // eslint-disable-next-line style/quote-props
      '203': 'yyyyMMddHHmm',
    } as const
    const date = dateStr ? parse(dateStr, formatMap[dateFormat as keyof typeof formatMap], new Date()) : new Date()

    const numberEl = findXPath(xmlDoc, '//rsm:ExchangedDocument/ram:ID')
    const number = numberEl.content || ''

    const sellerEl = findXPath(xmlDoc, '//ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:Name')
    const seller = sellerEl.content || ''

    const buyerEl = findXPath(xmlDoc, '//ram:ApplicableHeaderTradeAgreement/ram:BuyerTradeParty/ram:Name')
    const buyer = buyerEl.content || ''

    const docTypeEl = findXPath(xmlDoc, '//rsm:ExchangedDocument/ram:TypeCode')
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

/**
 * Find by local names: `//rsm:A/ram:B` matches `A`/`B` whatever prefix the document binds to their
 * namespaces (Namespaces in XML 1.0 §3: prefixes are not significant). The error keeps the readable path.
 */
function findXPath(fileDoc: XmlDocument, xpath: string): XmlElement {
  const byLocalName = xpath.replace(/(\/\/?)[a-z]+:([A-Za-z]+)/g, `$1*[local-name()='$2']`)
  const xpathNode = fileDoc.find(byLocalName)
  if (!xpathNode.length) {
    throw new Error(`No ${xpath} found in the document`)
  }
  return xpathNode[0] as XmlElement
}
