import { readdirSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { check, invoiceToXml, xmlToInvoice } from '@stafyniaksacha/facturx'
import { XmlDocument, XmlElement } from 'libxml2-wasm'
import { describe, expect, it } from 'vitest'

// CG-18, data part: the French extension fields `EXT-FR-FE-*` of the plain-CII EXTENDED-CTC-FR profile
// (XP Z12-012 v1.4 Annex A, `annex-a--CII_D22B_FX_EXT-CTC-FR.csv`) survive `xmlToInvoice()` then
// `invoiceToXml()`. Almost all of them are Factur-X EXTENDED fields (`BT-X-*`) re-labelled by Annex A.
//
// The comparison is between the original XML and the re-serialized XML, by element and attribute path
// with multiplicity: comparing models only would hide fields the parser drops (CG-32).
const SPEC = resolve(import.meta.dirname, '../spec/afnor-xp-z12-012-1.4')
const ANNEX_A = join(SPEC, 'text/annex-a--CII_D22B_FX_EXT-CTC-FR.csv')
const ANNEX_B = join(SPEC, 'distribution/XP_Z12-012_Annexe_B_EXEMPLES_V1.4')

const NS = {
  rsm: 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
  ram: 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
  udt: 'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100',
  qdt: 'urn:un:unece:uncefact:data:standard:QualifiedDataType:100',
}

// Elements of a decimal data type (Amount, Quantity, Measure, Percent, Rate, Numeric) that
// `invoiceToXml()` writes: the converter writes `60.0000` back as `60`, the same `xs:decimal`. Every
// other text (identifiers such as `LineID`, codes, postcodes) is compared exactly.
const DECIMAL_ELEMENTS = new Set([
  'ActualAmount',
  'ActualDiscountAmount',
  'ActualPenaltyAmount',
  'AllowanceChargeBasisAmount',
  'AllowanceTotalAmount',
  'AppliedAmount',
  'BasisAmount',
  'BasisPeriodMeasure',
  'BasisQuantity',
  'BilledQuantity',
  'CalculatedAmount',
  'CalculationPercent',
  'ChargeAmount',
  'ChargeFreeQuantity',
  'ChargeTotalAmount',
  'ConversionRate',
  'DuePayableAmount',
  'GrandTotalAmount',
  'LineTotalAmount',
  'LineTotalBasisAmount',
  'PackageQuantity',
  'PaidAmount',
  'PartialPaymentAmount',
  'PerPackageUnitQuantity',
  'RateApplicablePercent',
  'RoundingAmount',
  'SequenceNumeric',
  'TaxBasisTotalAmount',
  'TaxTotalAmount',
  'TotalAllowanceChargeAmount',
  'TotalPrepaidAmount',
  'UnitQuantity',
  'ValueMeasure',
])

/** Canonical `xs:decimal` lexical form, by string (no float rounding): `060.500` → `60.5`, `-0.0` → `0`. */
function canonicalDecimal(text: string): string {
  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(text)
  if (!match || (match[2] === '' && !match[3]))
    return text
  const int = match[2].replace(/^0+(?=\d)/, '') || '0'
  const frac = (match[3] ?? '').replace(/0+$/, '')
  const body = frac ? `${int}.${frac}` : int
  return match[1] === '-' && body !== '0' ? `-${body}` : body
}

/**
 * Every leaf element of the document as one record, `path[@attr=value …]=text` (attributes sorted), with
 * its count; an element with child elements gives a record only if it has attributes. Keeping the
 * attributes and the text in one record means a value that moves to a sibling with another `schemeID`,
 * `currencyID` or `unitCode` is a difference.
 */
function pathValues(xml: string): Map<string, number> {
  const doc = XmlDocument.fromString(xml)
  const out = new Map<string, number>()
  const add = (key: string) => out.set(key, (out.get(key) ?? 0) + 1)
  const walk = (el: XmlElement, parent: string) => {
    const path = `${parent}/${el.prefix}:${el.name}`
    const attrs = el.attrs.map(a => `@${a.name}=${a.value}`).sort().join(' ')
    const record = attrs ? `${path}[${attrs}]` : path
    let leaf = true
    for (let child = el.firstChild; child; child = child.next) {
      if (child instanceof XmlElement) {
        leaf = false
        walk(child, path)
      }
    }
    if (leaf) {
      const text = el.content.trim()
      add(`${record}=${DECIMAL_ELEMENTS.has(el.name) ? canonicalDecimal(text) : text}`)
    }
    else if (attrs) {
      add(record)
    }
  }
  try {
    walk(doc.root, '')
  }
  finally {
    doc.dispose()
  }
  return out
}

/** Element paths and attribute paths (`path/@name`) present in the document. */
function pathsOf(xml: string): Set<string> {
  const doc = XmlDocument.fromString(xml)
  const out = new Set<string>()
  const walk = (el: XmlElement, parent: string) => {
    const path = `${parent}/${el.prefix}:${el.name}`
    out.add(path)
    for (const a of el.attrs) out.add(`${path}/@${a.name}`)
    for (let child = el.firstChild; child; child = child.next) {
      if (child instanceof XmlElement)
        walk(child, path)
    }
  }
  try {
    walk(doc.root, '')
  }
  finally {
    doc.dispose()
  }
  return out
}

/** Paths whose count differs between the two documents (`path=value: before → after`). */
function pathDiff(before: string, after: string): string[] {
  const a = pathValues(before)
  const b = pathValues(after)
  const diff: string[] = []
  for (const key of new Set([...a.keys(), ...b.keys()])) {
    if ((a.get(key) ?? 0) !== (b.get(key) ?? 0))
      diff.push(`${key}: ${a.get(key) ?? 0} → ${b.get(key) ?? 0}`)
  }
  return diff
}

async function roundTrip(xml: string): Promise<string> {
  const doc = await invoiceToXml(await xmlToInvoice(xml))
  try {
    return doc.toString()
  }
  finally {
    doc.dispose()
  }
}

/** Values of the elements (text) or attributes at `xpath`, in document order. */
function valuesAt(xml: string, xpath: string): string[] {
  const doc = XmlDocument.fromString(xml)
  try {
    const match = /^(.*)\/@([\w:]+)$/.exec(xpath)
    const nodes = doc.find(match ? match[1] : xpath, NS) as XmlElement[]
    return nodes.map(n => (match ? n.attr(match[2])?.value ?? '' : n.content))
  }
  finally {
    doc.dispose()
  }
}

// ---------------------------------------------------------------------------
// Synthetic EXTENDED-CTC-FR invoice: a minimal valid document (uncoupled CII D22B XSD) with one slot
// per field group, filled in XSD sequence order. Text values carry `&`, `<`, `>` and non-ASCII.
// ---------------------------------------------------------------------------

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const T = (tag: string, value: string, attrs = '') => `<${tag}${attrs}>${esc(value)}</${tag}>`
const DATE = (tag: string, value: string, prefix = 'qdt') => `<${tag}><${prefix}:DateTimeString format="102">${value}</${prefix}:DateTimeString></${tag}>`

/** A complete EXTENDED trade party (agent, invoicer, invoicee, payer, line seller...). */
function party(tag: string, who: string, { roleCode = true, contact = true } = {}): string {
  return `<ram:${tag}>
    ${T('ram:GlobalID', `${who}-GLN-1`, ' schemeID="0088"')}
    ${T('ram:GlobalID', `${who}-GLN-2`, ' schemeID="0060"')}
    ${T('ram:Name', `${who} Société & Fils <SARL> Œuvre`)}
    ${roleCode ? T('ram:RoleCode', 'AB') : ''}
    <ram:SpecifiedLegalOrganization>
      ${T('ram:ID', '100000009', ' schemeID="0002"')}
      ${T('ram:TradingBusinessName', `${who} Enseigne « Ça & Là »`)}
    </ram:SpecifiedLegalOrganization>
    ${contact ? partyContacts(who) : ''}
    <ram:PostalTradeAddress>
      ${T('ram:PostcodeCode', '75018')}
      ${T('ram:LineOne', `${who} 1 rue de l'Église & <bis>`)}
      ${T('ram:LineTwo', 'Bâtiment Ä')}
      ${T('ram:LineThree', 'Étage 3')}
      ${T('ram:CityName', 'Paris Œ')}
      ${T('ram:CountryID', 'FR')}
      ${T('ram:CountrySubDivisionName', 'Île-de-France')}
    </ram:PostalTradeAddress>
    <ram:URIUniversalCommunication>${T('ram:URIID', `${who.toLowerCase()}@exemple.fr`, ' schemeID="EM"')}</ram:URIUniversalCommunication>
    <ram:SpecifiedTaxRegistration>${T('ram:ID', 'FR88100000009', ' schemeID="VA"')}</ram:SpecifiedTaxRegistration>
    <ram:SpecifiedTaxRegistration>${T('ram:ID', `${who}-FISC-1`, ' schemeID="FC"')}</ram:SpecifiedTaxRegistration>
  </ram:${tag}>`
}

function partyContacts(who: string): string {
  return [1, 2].map(n => `<ram:DefinedTradeContact>
      ${T('ram:PersonName', `${who} Contact ${n} Zoë & <Chloé>`)}
      <ram:TelephoneUniversalCommunication>${T('ram:CompleteNumber', `+33 1 00 00 00 0${n}`)}</ram:TelephoneUniversalCommunication>
      <ram:EmailURIUniversalCommunication>${T('ram:URIID', `contact${n}@exemple.fr`)}</ram:EmailURIUniversalCommunication>
    </ram:DefinedTradeContact>`).join('\n')
}

type Slot
  = | 'lineDocument' | 'lineCharacteristic' | 'lineDeliveryTerms' | 'lineSellerOrder' | 'lineBuyerOrder'
    | 'lineGrossAllowance' | 'lineItemSeller' | 'linePerPackage' | 'lineShipTo' | 'lineActualDelivery'
    | 'lineDespatch' | 'lineReceiving' | 'lineTax' | 'lineTaxTotals' | 'lineInvoiceRef'
    | 'salesAgent' | 'deliveryTerms' | 'buyerOrderDate' | 'contract' | 'buyerAgent'
    | 'despatchDate' | 'invoicer' | 'invoicee' | 'payee' | 'payer' | 'currencyExchange' | 'allowanceChargeTax' | 'invoiceRefType'

type Slots = Partial<Record<Slot, string>>

function invoice(s: Slots): string {
  const lineSummation = s.lineTaxTotals ?? T('ram:LineTotalAmount', '100.00')
  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="${NS.rsm}" xmlns:qdt="${NS.qdt}" xmlns:ram="${NS.ram}" xmlns:udt="${NS.udt}">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>${T('ram:ID', 'urn:cen.eu:en16931:2017#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr')}</ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    ${T('ram:ID', 'F-EXT-FR-1')}
    ${T('ram:TypeCode', '380')}
    ${DATE('ram:IssueDateTime', '20250201', 'udt')}
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>
        ${T('ram:LineID', '1')}
        ${s.lineDocument ?? ''}
      </ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>
        ${T('ram:Name', 'Article')}
        ${s.lineCharacteristic ?? ''}
      </ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        ${s.lineDeliveryTerms ?? ''}
        ${s.lineSellerOrder ?? ''}
        ${s.lineBuyerOrder ?? ''}
        ${s.lineGrossAllowance ?? ''}
        <ram:NetPriceProductTradePrice>${T('ram:ChargeAmount', '100')}</ram:NetPriceProductTradePrice>
        ${s.lineItemSeller ?? ''}
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        ${T('ram:BilledQuantity', '1', ' unitCode="C62"')}
        ${s.linePerPackage ?? ''}
        ${s.lineShipTo ?? ''}
        ${s.lineActualDelivery ?? ''}
        ${s.lineDespatch ?? ''}
        ${s.lineReceiving ?? ''}
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        ${s.lineTax ?? `<ram:ApplicableTradeTax>${T('ram:TypeCode', 'VAT')}${T('ram:CategoryCode', 'S')}${T('ram:RateApplicablePercent', '20')}</ram:ApplicableTradeTax>`}
        <ram:SpecifiedTradeSettlementLineMonetarySummation>${lineSummation}</ram:SpecifiedTradeSettlementLineMonetarySummation>
        ${s.lineInvoiceRef ?? ''}
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>${T('ram:Name', 'Vendeur')}</ram:SellerTradeParty>
      <ram:BuyerTradeParty>${T('ram:Name', 'Acheteur')}</ram:BuyerTradeParty>
      ${s.salesAgent ?? ''}
      ${s.deliveryTerms ?? ''}
      ${s.buyerOrderDate ?? ''}
      ${s.contract ?? ''}
      ${s.buyerAgent ?? ''}
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery>
      ${s.despatchDate ?? ''}
    </ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      ${T('ram:InvoiceCurrencyCode', 'EUR')}
      ${s.invoicer ?? ''}
      ${s.invoicee ?? ''}
      ${s.payee ?? ''}
      ${s.payer ?? ''}
      ${s.currencyExchange ?? ''}
      <ram:ApplicableTradeTax>
        ${T('ram:CalculatedAmount', '20.00', ' currencyID="EUR"')}
        ${T('ram:TypeCode', 'VAT')}
        ${T('ram:BasisAmount', '100.00')}
        ${T('ram:CategoryCode', 'S')}
        ${T('ram:RateApplicablePercent', '20')}
      </ram:ApplicableTradeTax>
      ${s.allowanceChargeTax ?? ''}
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        ${T('ram:LineTotalAmount', '100.00')}
        ${T('ram:TaxBasisTotalAmount', '100.00')}
        ${T('ram:TaxTotalAmount', '20.00', ' currencyID="EUR"')}
        ${T('ram:GrandTotalAmount', '120.00')}
        ${T('ram:DuePayableAmount', '120.00')}
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
      ${s.invoiceRefType ?? ''}
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`
}

const LINE = '/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:IncludedSupplyChainTradeLineItem'
const AGREEMENT = '/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement'
const DELIVERY = '/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeDelivery'
const SETTLEMENT = '/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement'

interface Group {
  name: string
  slots: Slots
  /** A few `[EXT-FR-FE id, XPath, expected values]` checks that the values sit at their Annex A XPath. */
  at: [string, string, string[]][]
}

const GROUPS: Group[] = [
  {
    name: 'line document (parent line, sub-type, note subject)',
    slots: {
      lineDocument: `${T('ram:ParentLineID', '0')}${T('ram:LineStatusReasonCode', 'DETAIL')}<ram:IncludedNote>${T('ram:Content', 'Note « ligne » & <détail>')}${T('ram:SubjectCode', 'AAI')}</ram:IncludedNote>`,
    },
    at: [
      ['EXT-FR-FE-162', `${LINE}/ram:AssociatedDocumentLineDocument/ram:ParentLineID`, ['0']],
      ['EXT-FR-FE-163', `${LINE}/ram:AssociatedDocumentLineDocument/ram:LineStatusReasonCode`, ['DETAIL']],
      ['EXT-FR-FE-183', `${LINE}/ram:AssociatedDocumentLineDocument/ram:IncludedNote/ram:SubjectCode`, ['AAI']],
    ],
  },
  {
    name: 'line item attribute code and measured value',
    slots: {
      lineCharacteristic: `<ram:ApplicableProductCharacteristic>${T('ram:TypeCode', 'CO2')}${T('ram:Description', 'Émissions <CO₂> & co')}${T('ram:ValueMeasure', '12.5', ' unitCode="GRM"')}${T('ram:Value', '12,5 g')}</ram:ApplicableProductCharacteristic>`,
    },
    at: [
      ['EXT-FR-FE-159', `${LINE}/ram:SpecifiedTradeProduct/ram:ApplicableProductCharacteristic/ram:TypeCode`, ['CO2']],
      ['EXT-FR-FE-160', `${LINE}/ram:SpecifiedTradeProduct/ram:ApplicableProductCharacteristic/ram:ValueMeasure`, ['12.5']],
      ['EXT-FR-FE-161', `${LINE}/ram:SpecifiedTradeProduct/ram:ApplicableProductCharacteristic/ram:ValueMeasure/@unitCode`, ['GRM']],
    ],
  },
  {
    name: 'line agreement: delivery terms, seller order, buyer order date, gross price discount reason',
    slots: {
      lineDeliveryTerms: `<ram:ApplicableTradeDeliveryTerms>${T('ram:DeliveryTypeCode', 'DAP')}<ram:RelevantTradeLocation>${T('ram:Name', 'Entrepôt « Nord » & <quai 2>')}</ram:RelevantTradeLocation></ram:ApplicableTradeDeliveryTerms>`,
      lineSellerOrder: `<ram:SellerOrderReferencedDocument>${T('ram:IssuerAssignedID', 'CV-2025/001 & Ü')}${T('ram:LineID', '7')}</ram:SellerOrderReferencedDocument>`,
      lineBuyerOrder: `<ram:BuyerOrderReferencedDocument>${T('ram:IssuerAssignedID', 'BC-<42>')}${T('ram:LineID', '3')}${DATE('ram:FormattedIssueDateTime', '20250115')}</ram:BuyerOrderReferencedDocument>`,
      lineGrossAllowance: `<ram:GrossPriceProductTradePrice>${T('ram:ChargeAmount', '110')}<ram:AppliedTradeAllowanceCharge><ram:ChargeIndicator><udt:Indicator>false</udt:Indicator></ram:ChargeIndicator>${T('ram:ActualAmount', '10')}${T('ram:ReasonCode', '95')}${T('ram:Reason', 'Remise « fidélité » & <VIP>')}</ram:AppliedTradeAllowanceCharge></ram:GrossPriceProductTradePrice>`,
    },
    at: [
      ['EXT-FR-FE-193', `${LINE}/ram:SpecifiedLineTradeAgreement/ram:ApplicableTradeDeliveryTerms/ram:DeliveryTypeCode`, ['DAP']],
      ['EXT-FR-FE-194', `${LINE}/ram:SpecifiedLineTradeAgreement/ram:ApplicableTradeDeliveryTerms/ram:RelevantTradeLocation/ram:Name`, ['Entrepôt « Nord » & <quai 2>']],
      ['EXT-FR-FE-144', `${LINE}/ram:SpecifiedLineTradeAgreement/ram:SellerOrderReferencedDocument/ram:IssuerAssignedID`, ['CV-2025/001 & Ü']],
      ['EXT-FR-FE-145', `${LINE}/ram:SpecifiedLineTradeAgreement/ram:SellerOrderReferencedDocument/ram:LineID`, ['7']],
      ['EXT-FR-FE-135', `${LINE}/ram:SpecifiedLineTradeAgreement/ram:BuyerOrderReferencedDocument/ram:IssuerAssignedID`, ['BC-<42>']],
      ['EXT-FR-FE-200', `${LINE}/ram:SpecifiedLineTradeAgreement/ram:BuyerOrderReferencedDocument/ram:FormattedIssueDateTime/qdt:DateTimeString`, ['20250115']],
      ['EXT-FR-FE-196', `${LINE}/ram:SpecifiedLineTradeAgreement/ram:GrossPriceProductTradePrice/ram:AppliedTradeAllowanceCharge/ram:ReasonCode`, ['95']],
      ['EXT-FR-FE-195', `${LINE}/ram:SpecifiedLineTradeAgreement/ram:GrossPriceProductTradePrice/ram:AppliedTradeAllowanceCharge/ram:Reason`, ['Remise « fidélité » & <VIP>']],
    ],
  },
  {
    name: 'line seller (multi-vendor)',
    slots: { lineItemSeller: party('ItemSellerTradeParty', 'LineSeller', { roleCode: false, contact: false }) },
    at: [
      ['EXT-FR-FE-166', `${LINE}/ram:SpecifiedLineTradeAgreement/ram:ItemSellerTradeParty/ram:GlobalID`, ['LineSeller-GLN-1', 'LineSeller-GLN-2']],
      ['EXT-FR-FE-164', `${LINE}/ram:SpecifiedLineTradeAgreement/ram:ItemSellerTradeParty/ram:Name`, ['LineSeller Société & Fils <SARL> Œuvre']],
      ['EXT-FR-FE-167-1', `${LINE}/ram:SpecifiedLineTradeAgreement/ram:ItemSellerTradeParty/ram:SpecifiedLegalOrganization/ram:ID/@schemeID`, ['0002']],
      ['EXT-FR-FE-176', `${LINE}/ram:SpecifiedLineTradeAgreement/ram:ItemSellerTradeParty/ram:PostalTradeAddress/ram:CountrySubDivisionName`, ['Île-de-France']],
      ['EXT-FR-FE-170', `${LINE}/ram:SpecifiedLineTradeAgreement/ram:ItemSellerTradeParty/ram:URIUniversalCommunication/ram:URIID`, ['lineseller@exemple.fr']],
      ['EXT-FR-FE-168-1', `${LINE}/ram:SpecifiedLineTradeAgreement/ram:ItemSellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID/@schemeID`, ['VA', 'FC']],
    ],
  },
  {
    name: 'line delivery: per-package quantity, ship-to, actual delivery, despatch and receiving advice',
    slots: {
      linePerPackage: T('ram:PerPackageUnitQuantity', '6', ' unitCode="C62"'),
      lineShipTo: `<ram:ShipToTradeParty>${T('ram:GlobalID', 'SHIP-1', ' schemeID="0088"')}${T('ram:GlobalID', 'SHIP-2', ' schemeID="0088"')}${T('ram:Name', 'Livré à « Zoé » & <Cie>')}<ram:PostalTradeAddress>${T('ram:PostcodeCode', '69001')}${T('ram:LineOne', 'Quai Ä')}${T('ram:LineTwo', 'Porte 2')}${T('ram:LineThree', 'Cour')}${T('ram:CityName', 'Lyon')}${T('ram:CountryID', 'FR')}${T('ram:CountrySubDivisionName', 'Rhône')}</ram:PostalTradeAddress></ram:ShipToTradeParty>`,
      lineActualDelivery: `<ram:ActualDeliverySupplyChainEvent>${DATE('ram:OccurrenceDateTime', '20250120', 'udt')}</ram:ActualDeliverySupplyChainEvent>`,
      lineDespatch: `<ram:DespatchAdviceReferencedDocument>${T('ram:IssuerAssignedID', 'BL-&-1')}${T('ram:LineID', '2')}${DATE('ram:FormattedIssueDateTime', '20250118')}</ram:DespatchAdviceReferencedDocument>`,
      lineReceiving: `<ram:ReceivingAdviceReferencedDocument>${T('ram:IssuerAssignedID', 'BR-<9>')}${T('ram:LineID', '4')}</ram:ReceivingAdviceReferencedDocument>`,
    },
    at: [
      ['EXT-FR-FE-191', `${LINE}/ram:SpecifiedLineTradeDelivery/ram:PerPackageUnitQuantity`, ['6']],
      ['EXT-FR-FE-146', `${LINE}/ram:SpecifiedLineTradeDelivery/ram:ShipToTradeParty/ram:GlobalID`, ['SHIP-1', 'SHIP-2']],
      ['EXT-FR-FE-149', `${LINE}/ram:SpecifiedLineTradeDelivery/ram:ShipToTradeParty/ram:Name`, ['Livré à « Zoé » & <Cie>']],
      ['EXT-FR-FE-158', `${LINE}/ram:SpecifiedLineTradeDelivery/ram:ActualDeliverySupplyChainEvent/ram:OccurrenceDateTime/udt:DateTimeString`, ['20250120']],
      ['EXT-FR-FE-201', `${LINE}/ram:SpecifiedLineTradeDelivery/ram:DespatchAdviceReferencedDocument/ram:FormattedIssueDateTime/qdt:DateTimeString`, ['20250118']],
      ['EXT-FR-FE-142', `${LINE}/ram:SpecifiedLineTradeDelivery/ram:ReceivingAdviceReferencedDocument/ram:IssuerAssignedID`, ['BR-<9>']],
    ],
  },
  {
    name: 'line VAT: exemption, due date code, VAT totals in two currencies, total with VAT',
    slots: {
      lineTax: `<ram:ApplicableTradeTax>${T('ram:TypeCode', 'VAT')}${T('ram:ExemptionReason', 'Exonération « art. 262 » & <ter>')}${T('ram:CategoryCode', 'E')}${T('ram:ExemptionReasonCode', 'VATEX-EU-132')}${T('ram:DueDateTypeCode', '72')}${T('ram:RateApplicablePercent', '0')}</ram:ApplicableTradeTax>`,
      lineTaxTotals: `${T('ram:LineTotalAmount', '100.00')}${T('ram:TaxTotalAmount', '20.00', ' currencyID="EUR"')}${T('ram:TaxTotalAmount', '21.70', ' currencyID="CHF"')}${T('ram:GrandTotalAmount', '120.00')}`,
    },
    at: [
      ['EXT-FR-FE-178', `${LINE}/ram:SpecifiedLineTradeSettlement/ram:ApplicableTradeTax/ram:ExemptionReason`, ['Exonération « art. 262 » & <ter>']],
      ['EXT-FR-FE-179', `${LINE}/ram:SpecifiedLineTradeSettlement/ram:ApplicableTradeTax/ram:ExemptionReasonCode`, ['VATEX-EU-132']],
      ['EXT-FR-FE-180', `${LINE}/ram:SpecifiedLineTradeSettlement/ram:ApplicableTradeTax/ram:DueDateTypeCode`, ['72']],
      ['EXT-FR-FE-181/182', `${LINE}/ram:SpecifiedLineTradeSettlement/ram:SpecifiedTradeSettlementLineMonetarySummation/ram:TaxTotalAmount`, ['20.00', '21.70']],
      ['EXT-FR-FE-181-1/182-1', `${LINE}/ram:SpecifiedLineTradeSettlement/ram:SpecifiedTradeSettlementLineMonetarySummation/ram:TaxTotalAmount/@currencyID`, ['EUR', 'CHF']],
      ['EXT-FR-FE-184', `${LINE}/ram:SpecifiedLineTradeSettlement/ram:SpecifiedTradeSettlementLineMonetarySummation/ram:GrandTotalAmount`, ['120.00']],
    ],
  },
  {
    name: 'line reference to a previous invoice',
    slots: {
      lineInvoiceRef: `<ram:InvoiceReferencedDocument>${T('ram:IssuerAssignedID', 'F-2024/<99> & co')}${T('ram:LineID', '5')}${T('ram:TypeCode', '380')}${DATE('ram:FormattedIssueDateTime', '20241231')}</ram:InvoiceReferencedDocument>`,
    },
    at: [
      ['EXT-FR-FE-136', `${LINE}/ram:SpecifiedLineTradeSettlement/ram:InvoiceReferencedDocument/ram:IssuerAssignedID`, ['F-2024/<99> & co']],
      ['EXT-FR-FE-139', `${LINE}/ram:SpecifiedLineTradeSettlement/ram:InvoiceReferencedDocument/ram:LineID`, ['5']],
      ['EXT-FR-FE-137', `${LINE}/ram:SpecifiedLineTradeSettlement/ram:InvoiceReferencedDocument/ram:TypeCode`, ['380']],
      ['EXT-FR-FE-138', `${LINE}/ram:SpecifiedLineTradeSettlement/ram:InvoiceReferencedDocument/ram:FormattedIssueDateTime/qdt:DateTimeString`, ['20241231']],
    ],
  },
  {
    name: 'seller agent',
    slots: { salesAgent: party('SalesAgentTradeParty', 'SalesAgent') },
    at: [
      ['EXT-FR-FE-69', `${AGREEMENT}/ram:SalesAgentTradeParty/ram:GlobalID/@schemeID`, ['0088', '0060']],
      ['EXT-FR-FE-67', `${AGREEMENT}/ram:SalesAgentTradeParty/ram:RoleCode`, ['AB']],
      ['EXT-FR-FE-68', `${AGREEMENT}/ram:SalesAgentTradeParty/ram:SpecifiedLegalOrganization/ram:TradingBusinessName`, ['SalesAgent Enseigne « Ça & Là »']],
      ['EXT-FR-FE-86', `${AGREEMENT}/ram:SalesAgentTradeParty/ram:DefinedTradeContact/ram:PersonName`, ['SalesAgent Contact 1 Zoë & <Chloé>', 'SalesAgent Contact 2 Zoë & <Chloé>']],
      ['EXT-FR-FE-73', `${AGREEMENT}/ram:SalesAgentTradeParty/ram:SpecifiedTaxRegistration/ram:ID`, ['FR88100000009', 'SalesAgent-FISC-1']],
    ],
  },
  {
    name: 'header agreement: delivery terms, buyer order date, contract type and date',
    slots: {
      deliveryTerms: `<ram:ApplicableTradeDeliveryTerms>${T('ram:DeliveryTypeCode', 'EXW')}<ram:RelevantTradeLocation>${T('ram:Name', 'Usine « Sud » & <B>')}</ram:RelevantTradeLocation></ram:ApplicableTradeDeliveryTerms>`,
      buyerOrderDate: `<ram:BuyerOrderReferencedDocument>${T('ram:IssuerAssignedID', 'PO-&-77')}${DATE('ram:FormattedIssueDateTime', '20250110')}</ram:BuyerOrderReferencedDocument>`,
      contract: `<ram:ContractReferencedDocument>${T('ram:IssuerAssignedID', 'CT-« 2025 »')}${T('ram:ReferenceTypeCode', 'CT')}${DATE('ram:FormattedIssueDateTime', '20240101')}</ram:ContractReferencedDocument>`,
    },
    at: [
      ['EXT-FR-FE-185', `${AGREEMENT}/ram:ApplicableTradeDeliveryTerms/ram:DeliveryTypeCode`, ['EXW']],
      ['EXT-FR-FE-186', `${AGREEMENT}/ram:ApplicableTradeDeliveryTerms/ram:RelevantTradeLocation/ram:Name`, ['Usine « Sud » & <B>']],
      ['EXT-FR-FE-197', `${AGREEMENT}/ram:BuyerOrderReferencedDocument/ram:FormattedIssueDateTime/qdt:DateTimeString`, ['20250110']],
      ['EXT-FR-FE-01', `${AGREEMENT}/ram:ContractReferencedDocument/ram:ReferenceTypeCode`, ['CT']],
      ['EXT-FR-FE-199', `${AGREEMENT}/ram:ContractReferencedDocument/ram:FormattedIssueDateTime/qdt:DateTimeString`, ['20240101']],
    ],
  },
  {
    name: 'buyer agent',
    slots: { buyerAgent: party('BuyerAgentTradeParty', 'BuyerAgent') },
    at: [
      ['EXT-FR-FE-03', `${AGREEMENT}/ram:BuyerAgentTradeParty/ram:Name`, ['BuyerAgent Société & Fils <SARL> Œuvre']],
      ['EXT-FR-FE-24', `${AGREEMENT}/ram:BuyerAgentTradeParty/ram:DefinedTradeContact/ram:TelephoneUniversalCommunication/ram:CompleteNumber`, ['+33 1 00 00 00 01', '+33 1 00 00 00 02']],
      ['EXT-FR-FE-15', `${AGREEMENT}/ram:BuyerAgentTradeParty/ram:PostalTradeAddress/ram:LineOne`, ['BuyerAgent 1 rue de l\'Église & <bis>']],
      ['EXT-FR-FE-13', `${AGREEMENT}/ram:BuyerAgentTradeParty/ram:URIUniversalCommunication/ram:URIID/@schemeID`, ['EM']],
    ],
  },
  {
    name: 'header despatch advice date',
    slots: {
      despatchDate: `<ram:DespatchAdviceReferencedDocument>${T('ram:IssuerAssignedID', 'AE-<1>')}${DATE('ram:FormattedIssueDateTime', '20250119')}</ram:DespatchAdviceReferencedDocument>`,
    },
    at: [['EXT-FR-FE-198', `${DELIVERY}/ram:DespatchAdviceReferencedDocument/ram:FormattedIssueDateTime/qdt:DateTimeString`, ['20250119']]],
  },
  {
    name: 'invoicer (billing service)',
    slots: { invoicer: party('InvoicerTradeParty', 'Invoicer') },
    at: [
      ['EXT-FR-FE-112', `${SETTLEMENT}/ram:InvoicerTradeParty/ram:Name`, ['Invoicer Société & Fils <SARL> Œuvre']],
      ['EXT-FR-FE-113', `${SETTLEMENT}/ram:InvoicerTradeParty/ram:RoleCode`, ['AB']],
      ['EXT-FR-FE-134', `${SETTLEMENT}/ram:InvoicerTradeParty/ram:DefinedTradeContact/ram:EmailURIUniversalCommunication/ram:URIID`, ['contact1@exemple.fr', 'contact2@exemple.fr']],
    ],
  },
  {
    name: 'invoicee (addressed to)',
    slots: { invoicee: party('InvoiceeTradeParty', 'Invoicee') },
    at: [
      ['EXT-FR-FE-89', `${SETTLEMENT}/ram:InvoiceeTradeParty/ram:Name`, ['Invoicee Société & Fils <SARL> Œuvre']],
      ['EXT-FR-FE-104', `${SETTLEMENT}/ram:InvoiceeTradeParty/ram:PostalTradeAddress/ram:CityName`, ['Paris Œ']],
      ['EXT-FR-FE-96', `${SETTLEMENT}/ram:InvoiceeTradeParty/ram:SpecifiedTaxRegistration/ram:ID/@schemeID`, ['VA', 'FC']],
    ],
  },
  {
    name: 'payee extras (role, contact, address, electronic address, tax registration)',
    slots: { payee: party('PayeeTradeParty', 'Payee') },
    at: [
      ['EXT-FR-FE-26', `${SETTLEMENT}/ram:PayeeTradeParty/ram:RoleCode`, ['AB']],
      ['EXT-FR-FE-40', `${SETTLEMENT}/ram:PayeeTradeParty/ram:DefinedTradeContact/ram:PersonName`, ['Payee Contact 1 Zoë & <Chloé>', 'Payee Contact 2 Zoë & <Chloé>']],
      ['EXT-FR-FE-38', `${SETTLEMENT}/ram:PayeeTradeParty/ram:PostalTradeAddress/ram:CountryID`, ['FR']],
      ['EXT-FR-FE-29', `${SETTLEMENT}/ram:PayeeTradeParty/ram:URIUniversalCommunication/ram:URIID`, ['payee@exemple.fr']],
    ],
  },
  {
    name: 'payer',
    slots: { payer: party('PayerTradeParty', 'Payer') },
    at: [
      ['EXT-FR-FE-46', `${SETTLEMENT}/ram:PayerTradeParty/ram:GlobalID`, ['Payer-GLN-1', 'Payer-GLN-2']],
      ['EXT-FR-FE-48', `${SETTLEMENT}/ram:PayerTradeParty/ram:SpecifiedLegalOrganization/ram:ID`, ['100000009']],
      ['EXT-FR-FE-57', `${SETTLEMENT}/ram:PayerTradeParty/ram:PostalTradeAddress/ram:LineThree`, ['Étage 3']],
    ],
  },
  {
    name: 'VAT currency exchange and its date',
    slots: {
      currencyExchange: `<ram:TaxApplicableTradeCurrencyExchange>${T('ram:SourceCurrencyCode', 'EUR')}${T('ram:TargetCurrencyCode', 'CHF')}${T('ram:ConversionRate', '0.937512')}${DATE('ram:ConversionRateDateTime', '20250131', 'udt')}</ram:TaxApplicableTradeCurrencyExchange>`,
    },
    at: [
      ['EXT-FR-FE-192', `${SETTLEMENT}/ram:TaxApplicableTradeCurrencyExchange/ram:ConversionRateDateTime/udt:DateTimeString`, ['20250131']],
      ['EXT-FR-FE-192-1', `${SETTLEMENT}/ram:TaxApplicableTradeCurrencyExchange/ram:ConversionRateDateTime/udt:DateTimeString/@format`, ['102']],
    ],
  },
  {
    name: 'document allowance and charge VAT exemption',
    slots: {
      allowanceChargeTax: ['false', 'true'].map(charge => `<ram:SpecifiedTradeAllowanceCharge><ram:ChargeIndicator><udt:Indicator>${charge}</udt:Indicator></ram:ChargeIndicator>${T('ram:ActualAmount', '0.00')}${T('ram:Reason', 'Ajustement')}<ram:CategoryTradeTax>${T('ram:TypeCode', 'VAT')}${T('ram:ExemptionReason', `Exonération ${charge} « É » & <x>`)}${T('ram:CategoryCode', 'E')}${T('ram:ExemptionReasonCode', 'VATEX-EU-132')}${T('ram:RateApplicablePercent', '0')}</ram:CategoryTradeTax></ram:SpecifiedTradeAllowanceCharge>`).join(''),
    },
    at: [
      ['EXT-FR-FE-187/189', `${SETTLEMENT}/ram:SpecifiedTradeAllowanceCharge/ram:CategoryTradeTax/ram:ExemptionReason`, ['Exonération false « É » & <x>', 'Exonération true « É » & <x>']],
      ['EXT-FR-FE-188/190', `${SETTLEMENT}/ram:SpecifiedTradeAllowanceCharge/ram:CategoryTradeTax/ram:ExemptionReasonCode`, ['VATEX-EU-132', 'VATEX-EU-132']],
    ],
  },
  {
    name: 'previous invoice type',
    slots: {
      invoiceRefType: `<ram:InvoiceReferencedDocument>${T('ram:IssuerAssignedID', 'F-<0> & 1')}${T('ram:TypeCode', '386')}${DATE('ram:FormattedIssueDateTime', '20241201')}</ram:InvoiceReferencedDocument>`,
    },
    at: [['EXT-FR-FE-02', `${SETTLEMENT}/ram:InvoiceReferencedDocument/ram:TypeCode`, ['386']]],
  },
]

const ALL_SLOTS: Slots = Object.assign({}, ...GROUPS.map(g => g.slots))

// The comparison must itself catch the losses it is meant to find.
describe('path comparison helper', () => {
  const agent = invoice({ salesAgent: party('SalesAgentTradeParty', 'SalesAgent') })

  it('sees a value that moves to a sibling with another schemeID', () => {
    const swapped = agent
      .replace('>SalesAgent-GLN-1<', '>__SWAP__<')
      .replace('>SalesAgent-GLN-2<', '>SalesAgent-GLN-1<')
      .replace('>__SWAP__<', '>SalesAgent-GLN-2<')
    expect(swapped).not.toBe(agent)
    expect(pathDiff(agent, swapped)).not.toEqual([])
  })

  it('compares identifiers exactly and decimals by value, without float rounding', () => {
    expect(pathDiff(agent, agent.replace('<ram:LineID>1</ram:LineID>', '<ram:LineID>1.0</ram:LineID>'))).not.toEqual([])
    expect(pathDiff(agent, agent.replace('<ram:LineTotalAmount>100.00</ram:LineTotalAmount>', '<ram:LineTotalAmount>0100.0</ram:LineTotalAmount>'))).toEqual([])
    const long = (v: string) => agent.replace('<ram:ChargeAmount>100</ram:ChargeAmount>', `<ram:ChargeAmount>${v}</ram:ChargeAmount>`)
    expect(pathDiff(long('12345678901234567.1'), long('12345678901234567.2'))).not.toEqual([])
  })
})

describe('eXTENDED-CTC-FR fields (EXT-FR-FE-*) round trip (CG-18)', () => {
  it.each(GROUPS)('$name', async ({ slots, at }) => {
    const xml = invoice(slots)
    // The input itself is valid against the uncoupled CII D22B XSD (so the values are well placed).
    const input = await check({ xml })
    expect(input.level).toBe('extended-ctc-fr')
    expect(input.errors).toEqual([])
    for (const [, xpath, values] of at)
      expect(valuesAt(xml, xpath)).toEqual(values)

    const out = await roundTrip(xml)
    expect(pathDiff(xml, out)).toEqual([])
    for (const [, xpath, values] of at)
      expect(valuesAt(out, xpath)).toEqual(values)
    // invoiceToXml() writes each field at its XSD sequence position.
    expect((await check({ xml: out })).errors).toEqual([])
  })

  it('all groups together survive two round trips and stay XSD valid', async () => {
    const xml = invoice(ALL_SLOTS)
    expect((await check({ xml })).errors).toEqual([])
    const once = await roundTrip(xml)
    expect(pathDiff(xml, once)).toEqual([])
    expect(await roundTrip(once)).toBe(once)
    expect((await check({ xml: once })).errors).toEqual([])
  })

  // Every one of these fields is a Factur-X EXTENDED element: the same document declared as Factur-X
  // EXTENDED is valid against the Factur-X 1.09.2 EXTENDED XSD.
  it('all groups together are also valid as a Factur-X EXTENDED document', async () => {
    const xml = invoice(ALL_SLOTS).replace('urn.cpro.gouv.fr:1p0:extended-ctc-fr', 'urn:factur-x.eu:1p0:extended')
    const result = await check({ xml })
    expect(result.level).toBe('extended')
    expect(result.errors).toEqual([])
  })

  it('the second line TaxTotalAmount is read into taxTotalAmountInAccountingCurrency', async () => {
    const model = await xmlToInvoice(invoice({ lineTaxTotals: GROUPS.find(g => g.slots.lineTaxTotals)!.slots.lineTaxTotals }))
    const sum = model.supplyChainTradeTransaction.includedSupplyChainTradeLineItem![0].specifiedLineTradeSettlement.specifiedTradeSettlementLineMonetarySummation!
    expect(sum.taxTotalAmount).toMatchObject({ value: 20, currencyID: 'EUR' })
    expect(sum.taxTotalAmountInAccountingCurrency).toMatchObject({ value: 21.7, currencyID: 'CHF' })
  })
})

// ---------------------------------------------------------------------------
// Traceability: every EXT-FR-FE XPath of Annex A occurs in the all-groups document.
// ---------------------------------------------------------------------------

/** Minimal RFC 4180 reader (quoted fields may hold commas, quotes and newlines). */
function readCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      }
      else if (c === '"') {
        quoted = false
      }
      else {
        field += c
      }
    }
    else if (c === '"') {
      quoted = true
    }
    else if (c === ',') {
      row.push(field)
      field = ''
    }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n')
        i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    }
    else {
      field += c
    }
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

// Column 4 (index 3) is the EXT-FR-FE id, column 42 (index 41) the normalized XPath.
// Annex A gives a few rows the XPath of a neighbouring row (CG-39), e.g. the contract type code
// EXT-FR-FE-01 (BT-X-405) on the contract date's XPath. They are existing EXTENDED elements; the header
// agreement group also covers the matrix XPath of EXT-FR-FE-01, `ContractReferencedDocument/ReferenceTypeCode`.
const ANNEX_A_ROWS = readCsv(readFileSync(ANNEX_A, 'utf8'))
  .filter(r => r.length > 41 && r[3].startsWith('EXT-FR-FE-'))
  .map(r => ({ id: r[3], xpath: r[41].replace(/\s+/g, '') }))

describe('annex A EXT-FR-FE traceability', () => {
  it('reads the 240 EXT-FR-FE rows of Annex A', () => {
    expect(ANNEX_A_ROWS).toHaveLength(240)
  })

  it('every Annex A EXT-FR-FE XPath is in the all-groups document', () => {
    const paths = pathsOf(invoice(ALL_SLOTS))
    // Exact element or attribute path (group rows are element paths too).
    const missing = ANNEX_A_ROWS.filter(r => !paths.has(r.xpath))
    expect(missing).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Annex B: the 6 EXTENDED-CTC-FR CII examples, re-serialized, keep every element and attribute and
// still pass the XSD, the EXTENDED-CTC-FR Schematron and BR-FR.
// ---------------------------------------------------------------------------

const examples = readdirSync(ANNEX_B, { withFileTypes: true, recursive: true })
  .filter(entry => entry.isFile() && /_EXTENDED-CTC-FR_CII_.*\.xml$/.test(entry.name))
  .map(entry => join(entry.parentPath, entry.name))
  .sort()
  .map(file => ({ file, name: relative(ANNEX_B, file) }))

describe('annex B EXTENDED-CTC-FR examples through xmlToInvoice() and invoiceToXml()', () => {
  it('finds the 6 examples', () => {
    expect(examples).toHaveLength(6)
  })

  it.each(examples)('$name keeps every path and stays valid', async ({ file }) => {
    const xml = await readFile(file, 'utf8')
    const out = await roundTrip(xml)
    expect(pathDiff(xml, out)).toEqual([])
    const result = await check({ xml: out, schematron: true, frCtc: true })
    expect(result.level).toBe('extended-ctc-fr')
    expect(result.errors).toEqual([])
    expect(result.schematronErrors).toEqual([])
    expect(result.frCtcErrors).toEqual([])
    expect(result.valid).toBe(true)
  })
})
