import type { Buffer } from 'node:buffer'
import type { BaseInfo } from '../types'
import type {
  DOC_TYPE_KEY,
} from './constants'
import { parse } from 'date-fns'
import { XmlComment, XmlDocument, XmlElement } from 'libxml2-wasm'
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

/**
 * Whether a parsed document may carry a DOCTYPE, checked fail-closed on the root element's siblings: before the root
 * only comments are accepted (a DTD, a processing instruction or any other node type is refused: libxml2-wasm 0.7.2
 * wraps DTD and PI nodes without `prev` / `next`, so nothing beyond them can be seen); after the root, where XML allows
 * no DOCTYPE, comments and processing instructions are accepted. A node the wrapper cannot read also counts. Used by
 * the readers that refuse DTDs, since an internal entity could hide or replace content.
 */
export function hasDoctype(doc: XmlDocument): boolean {
  const root = doc.root
  if (!root)
    return false
  try {
    for (let node = root.prev; node; node = node.prev) {
      if (!(node instanceof XmlComment))
        return true
    }
    // Typed `XmlTreeNode`, though a PI node is not one at runtime (no `next`): the walk stops on it.
    for (let node: object | null = root.next; node; node = (node as { next?: object | null }).next ?? null) {
      if (!(node instanceof XmlComment) && node.constructor.name !== 'XmlProcessingInstructionNode')
        return true
    }
  }
  catch {
    return true
  }
  return false
}

// Encodings whose bytes for the markup characters (`<`, `?`, `!`, `-`, `>`, letters, whitespace) are ASCII, so the
// prolog can be scanned byte by byte. Anything else declared (UTF-16, EBCDIC, ...) falls back to the node walk.
const ASCII_COMPATIBLE = /^(?:utf-?8|us-ascii|ascii|iso[-_]?8859-\d{1,2}|latin-?1|windows-125\d|cp125\d)$/i

/**
 * Whether text input declares a DOCTYPE before its root element, read from the raw prolog: after an optional UTF-8
 * BOM, the XML declaration, whitespace, comments and processing instructions are skipped; `<!DOCTYPE` (or any other
 * `<!` construct) before the root is `true`, the root's `<` is `false`. `undefined` when the text cannot be scanned
 * that way (a UTF-16 or other non-ASCII-compatible encoding, by BOM, byte pattern or declaration; an unterminated
 * construct; anything else before the root): callers then use the fail-closed node walk (`hasDoctype()`).
 */
export function prologHasDoctype(input: string | Uint8Array): boolean | undefined {
  let text: string
  if (typeof input === 'string') {
    text = input.charCodeAt(0) === 0xFEFF ? input.slice(1) : input
  }
  else {
    const b = input
    // UTF-16 / UTF-32 BOMs, BOM-less UTF-16 `<?` / `<` and EBCDIC `<?xm`: not ASCII-compatible.
    if ((b[0] === 0xFE && b[1] === 0xFF) || (b[0] === 0xFF && b[1] === 0xFE) || b[0] === 0x00 || (b[0] === 0x3C && b[1] === 0x00) || (b[0] === 0x4C && b[1] === 0x6F))
      return undefined
    const start = b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF ? 3 : 0
    // Latin-1 keeps every byte as one character: enough to read ASCII markup, whatever the text after it.
    text = Array.from(b.subarray(start, Math.min(b.length, start + 64 * 1024)), c => String.fromCharCode(c)).join('')
  }
  let pos = 0
  for (;;) {
    while (pos < text.length && ' \t\r\n'.includes(text[pos]))
      pos++
    if (text.startsWith('<?', pos)) {
      const end = text.indexOf('?>', pos + 2)
      if (end < 0)
        return undefined
      if (pos === 0 && /^<\?xml[ \t\r\n]/.test(text)) {
        const encoding = /\sencoding\s*=\s*(["'])([^"']*)\1/.exec(text.slice(0, end))?.[2]
        if (encoding !== undefined && !ASCII_COMPATIBLE.test(encoding))
          return undefined
      }
      pos = end + 2
    }
    else if (text.startsWith('<!--', pos)) {
      const end = text.indexOf('-->', pos + 4)
      if (end < 0)
        return undefined
      pos = end + 3
    }
    else if (text.startsWith('<!', pos)) {
      return true
    }
    else if (text[pos] === '<' && pos + 1 < text.length && (/[A-Z_]/i.test(text[pos + 1]) || text.charCodeAt(pos + 1) > 0x7F)) {
      return false
    }
    else {
      return undefined
    }
  }
}

/**
 * Whether a document parsed from `input` carries a DOCTYPE. For text (string, Buffer), libxml2's own record of a DTD
 * (`doc.dtd`) or the raw prolog (`prologHasDoctype()`) decides, so a processing instruction such as
 * `<?xml-stylesheet?>` before the root is accepted; when the prolog cannot be scanned, and for a caller's
 * `XmlDocument` (no text to read), the fail-closed node walk (`hasDoctype()`) decides.
 */
export function inputHasDoctype(input: string | Uint8Array | XmlDocument, doc: XmlDocument): boolean {
  if (input instanceof XmlDocument)
    return hasDoctype(doc)
  if (doc.dtd !== null)
    return true
  return prologHasDoctype(input) ?? hasDoctype(doc)
}

/** The finding `check()` and the direct validators report for a document with a DOCTYPE (was CG-73). */
export const DOCTYPE_MESSAGE = 'The document has a DOCTYPE: invoices, orders and lifecycle messages use none, and its entities could hide or replace content, so it is not validated'

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
