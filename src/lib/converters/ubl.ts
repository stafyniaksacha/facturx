/**
 * EN 16931 model → UBL 2.1 (`Invoice` or `CreditNote`) at `en16931` or `extended-ctc-fr`.
 *
 * Mapping sources, in order: the vendored UBL 2.1 XSD (`src/lib/xsd/ubl/`, element order and
 * cardinality) and Schematrons (`EN16931-UBL-validation`, `EXTENDED-CTC-FR-UBL`, the `UBL-CR-*` rules
 * telling which places each level allows), then the XP Z12-012 annex B UBL examples, then annex A
 * (`annex-a--Flux_2_UBL_EN16931_FR.csv`, `annex-a--Flux_2_UBL_EXT-CTC-FR.csv`). Disagreements between
 * them are in `CONFORMANCE.md` (CG-59 onwards).
 *
 * Elements are written in the `xs:sequence` order of `UBL-Invoice-2.1.xsd` / `UBL-CreditNote-2.1.xsd`
 * and `UBL-CommonAggregateComponents-2.1.xsd`. A value the target cannot carry makes the writer throw,
 * naming the business term and never quoting invoice content: dropping it would lose data silently.
 */

import type { XmlElement } from 'libxml2-wasm'
import type { UBL_ROOT } from '../constants'
import type { BillingParty, BuyerAgent, Invoicee, Payer, SellerAgent } from '../models/en16931/additional-parties'
import type { Contact, Identifier, PostalAddress } from '../models/en16931/common'
import type { Invoice } from '../models/en16931/invoice'
import type { InvoiceLine, LineAllowance, LineCharge } from '../models/en16931/lines'
import type { CreditTransfer, DocumentAllowance, DocumentCharge, PaymentInstructions } from '../models/en16931/settlement'
import { XmlDocument } from 'libxml2-wasm'
import { UBL_CBC_NS, UBL_CREDITNOTE_NS, UBL_EN16931_CUSTOMIZATION_ID, UBL_EXTENDED_CTC_FR_CUSTOMIZATION_ID, UBL_INVOICE_NS, UBL_LEVELS } from '../constants'
import { hasMoreThanTwoDecimals } from '../mapping/cii/amounts'
import { assertHeaderComplete, DEFAULT_PROJECT_NAME, HEADER_GATES } from '../mapping/cii/header'
import { MANDATORY, withArrays } from '../mapping/cii/index'
import { assertLinesComplete, LINE_GATES } from '../mapping/cii/lines'
import { assertPartiesComplete, PARTY_GATES } from '../mapping/cii/parties'
import { assertSettlementComplete, SETTLEMENT_GATES } from '../mapping/cii/settlement'
import { isBlank, isCalendarDate } from '../mapping/cii/values'
import { formatDecimal } from './facturx'

/** The UBL levels `invoiceToUbl()` writes. */
export type UblLevel = typeof UBL_LEVELS[number]

/** Options of `invoiceToUbl()`. */
export interface InvoiceToUblOptions {
  /** The profile to write: decides BT-24 (`cbc:CustomizationID`) and which terms may be present. */
  level: UblLevel
  /**
   * The root element; by default `CreditNote` when BT-3 is in the credit note list of BR-CL-01 (`81`, `83`, `261`,
   * `262`, `296`, `308`, `381`, `396`, `420`, `458`, `502`, `503`, `532`), else `Invoice`. BT-3 must be in the
   * BR-CL-01 list of the root asked for (the invoice list or the credit note list of both UBL Schematrons).
   */
  root?: UBL_ROOT
}

/**
 * BT-3 codes written as a UBL `CreditNote` (`cbc:CreditNoteTypeCode`): the credit note list of BR-CL-01,
 * identical in `EN16931-UBL-validation` and `EXTENDED-CTC-FR-UBL`. `81` is in both the invoice and the
 * credit note lists of BR-CL-01; it is written as a credit note.
 */
export const UBL_CREDIT_NOTE_TYPE_CODES: ReadonlySet<string> = new Set(['81', '83', '261', '262', '296', '308', '381', '396', '420', '458', '502', '503', '532'])

/**
 * BT-3 codes BR-CL-01 allows in `cbc:InvoiceTypeCode`, identical in `EN16931-UBL-validation` (l.15088) and
 * `EXTENDED-CTC-FR-UBL`.
 */
export const UBL_INVOICE_TYPE_CODES: ReadonlySet<string> = new Set('71 80 81 82 84 102 130 202 203 204 211 218 219 295 325 326 331 380 382 383 384 385 386 387 388 389 390 393 394 395 456 457 471 472 473 500 501 527 553 575 623 633 751 780 817 870 875 876 877 935'.split(' '))

/**
 * How a note is read back from UBL `cbc:Note` (annex A BT-21: "Use #subject code#"): a leading `#code#`, the code
 * non-empty and without `#`, is the subject code (BT-21 / EXT-FR-FE-183), the rest the text (BT-22 / BT-127).
 * Line notes follow it at `extended-ctc-fr` only: EN 16931 has no line note subject code, so at `en16931` the
 * whole line note is BT-127 (CG-70). The writer refuses the notes this would read back differently.
 */
export const UBL_NOTE_PATTERN = /^#([^#]+)#([\s\S]*)$/

const PREFIX = 'invoiceToUbl'
const CUSTOMIZATION_IDS: Record<UblLevel, string> = {
  'en16931': UBL_EN16931_CUSTOMIZATION_ID,
  'extended-ctc-fr': UBL_EXTENDED_CTC_FR_CUSTOMIZATION_ID,
}
const LEVEL_LIST = UBL_LEVELS.map(l => `"${l}"`).join(', ')

const CAC = 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2'

/** `cac:TaxScheme/cbc:ID` of a VAT identifier (BT-31-2 ...) and of a tax registration identifier (BT-32-2: `LOC`, annex A). */
const VAT_SCHEME = 'VAT'
const TAX_REGISTRATION_SCHEME = 'LOC'
/** `@schemeID` of BT-90 in `cac:PartyIdentification` (annex A BT-90-1, UBL-SR-29). */
const SEPA = 'SEPA'
/** `cbc:DocumentTypeCode` of an invoiced object (BT-18, BT-128) and of a credit note's project reference (BT-11, UBL-SR-43). */
const INVOICED_OBJECT = '130'
const PROJECT_REFERENCE = '50'
/** `@listID` of a non-VAT tax code in `cbc:AllowanceChargeReasonCode` (BT-177-1, BT-193-1). */
const NON_VAT_TAX_LIST = '5153'

function fail(message: string): never {
  throw new Error(`${PREFIX}: ${message}`)
}

// The syntax-neutral checks of the CII mapping name the term the same way for both writers; only their
// prefix is CII's. Rewritten here so `toCii()` keeps its messages unchanged.
function reprefixed(check: () => void): void {
  try {
    check()
  }
  catch (error) {
    // A UBL level list has no "extended": point at the only UBL level that carries more.
    if (error instanceof Error && error.message.startsWith('toCii: '))
      fail(error.message.slice('toCii: '.length).replaceAll('level "extended" or "extended-ctc-fr"', 'level "extended-ctc-fr"'))
    throw error
  }
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

const lineSome = (invoice: Invoice, test: (line: InvoiceLine) => boolean): boolean => invoice.lines.some(test)

// Terms UBL cannot carry at any level: no element in the XSD, no Schematron place and no annex A UBL row
// (BT-11-0, BT-41-0, BT-56-0, EXT-FR-FE-184: CG-59, CG-60), more values than the UBL element holds
// (EXT-FR-FE-146, BT-149-1 / BT-150-1: CG-60, CG-62), or a group whose UBL element needs a sibling the model
// lacks (BG-18 needs BT-87-1: CG-61; BG-23 needs BT-110: CG-66).
function assertUblPlaces(invoice: Invoice): void {
  if (invoice.projectName !== undefined && invoice.projectName !== DEFAULT_PROJECT_NAME)
    fail('BT-11-0 (project name) has no UBL element (`cac:ProjectReference` holds only BT-11); clear it')
  if (invoice.seller.contact?.departmentName !== undefined)
    fail('BT-41-0 (seller contact department name) has no UBL element (`cac:Contact` has no department); clear it or put it in BT-41')
  if (invoice.buyer.contact?.departmentName !== undefined)
    fail('BT-56-0 (buyer contact department name) has no UBL element (`cac:Contact` has no department); clear it or put it in BT-56')
  if (lineSome(invoice, l => l.grandTotalAmount !== undefined))
    fail('EXT-FR-FE-184 (line grand total amount) has no UBL element (no annex A UBL row); clear it')
  if (invoice.paymentInstructions?.card)
    fail('BG-18 (payment card information) needs BT-87-1 (`cbc:NetworkID`, mandatory in UBL `cac:CardAccount`), which the model does not hold')
  for (const line of invoice.lines) {
    const price = line.price
    if (price && price.grossPriceBaseQuantity !== undefined && (price.grossPriceBaseQuantity !== price.priceBaseQuantity || (price.grossPriceBaseQuantityUnitCode ?? price.priceBaseQuantityUnitCode) !== price.priceBaseQuantityUnitCode))
      fail('BT-149-1 (item gross price base quantity) differs from BT-149: UBL has one `cbc:BaseQuantity` for the net and the gross price')
    if (price && price.grossPriceBaseQuantity === undefined && price.grossPriceBaseQuantityUnitCode !== undefined)
      fail('BT-150-1 (item gross price base quantity unit code) has no UBL element without BT-149-1')
    if ((line.deliverTo?.identifiers.length ?? 0) > 1)
      fail('EXT-FR-FE-146 (deliver to identifier of the line) is carried once in UBL (`cac:DeliveryLocation/cbc:ID`); the model has more')
  }
  // UBL holds the VAT breakdown inside `cac:TaxTotal`, whose `cbc:TaxAmount` (BT-110) is mandatory.
  if (invoice.totals.invoiceTotalVatAmount === undefined)
    fail('BT-110 (invoice total VAT amount) is mandatory in UBL: `cac:TaxTotal/cbc:TaxAmount` holds the VAT breakdown (BG-23)')
}

// The `UBL-CR-*` rules of `EN16931-UBL-validation` that `EXTENDED-CTC-FR-UBL` drops are exactly the places of
// the EXTENDED-CTC-FR terms, the ones the CII gates mark `extended`.
function assertLevelCarries(invoice: Invoice, level: UblLevel): void {
  if (level !== 'en16931')
    return
  for (const gate of [...HEADER_GATES, ...PARTY_GATES, ...SETTLEMENT_GATES, ...LINE_GATES]) {
    if (gate.from === 'extended' && gate.present(invoice))
      fail(`${gate.id} (${gate.term}) is not carried at level "en16931"; it needs level "extended-ctc-fr"`)
  }
}

// Cardinalities `EN16931-UBL-validation` restricts and `EXTENDED-CTC-FR-UBL` does not: UBL-SR-04 (BT-18),
// UBL-SR-16 (BT-46), UBL-SR-20 (BT-60); and UBL-SR-29 (one `SEPA` identifier, BT-90) at both levels.
function assertUblCounts(invoice: Invoice, level: UblLevel): void {
  if (level === 'en16931') {
    if (invoice.invoicedObjectIdentifiers.length > 1)
      fail('BT-18 (invoiced object identifier) is carried once at level "en16931" (UBL-SR-04); several need level "extended-ctc-fr"')
    if (invoice.buyer.identifiers.length > 1)
      fail('BT-46 (buyer identifier) is carried once at level "en16931" (UBL-SR-16); several need level "extended-ctc-fr"')
    // UBL-SR-20 counts `cbc:ID[upper-case(@schemeID) != 'SEPA']`: a schemeless ID counts too (`upper-case(())`
    // is ''); only the BT-90 the writer adds is left out.
    if ((invoice.payee?.identifiers ?? []).length > 1)
      fail('BT-60 (payee identifier) is carried once at level "en16931" (UBL-SR-20); several need level "extended-ctc-fr"')
  }
  // `@schemeID="SEPA"` marks BT-90 (UBL-SR-29): a party identifier with that scheme would read back as BT-90.
  for (const [id, identifiers] of [['BT-29', invoice.seller.identifiers], ['BT-60', invoice.payee?.identifiers ?? []]] as const) {
    if (identifiers.some(i => i.schemeId?.toUpperCase() === SEPA))
      fail(`${id} uses the scheme "SEPA", which UBL reserves for BT-90 (bank assigned creditor identifier)`)
  }
}

// A UBL element whose identifier child is mandatory cannot hold its other terms alone.
function assertUblNesting(invoice: Invoice): void {
  const needs = (present: boolean, id: string, term: string, other: string, otherTerm: string): void => {
    if (present)
      fail(`${id} (${term}) needs ${other} (${otherTerm}): UBL writes it in the element ${other} identifies`)
  }
  needs(invoice.salesOrderReference !== undefined && invoice.purchaseOrderReference === undefined, 'BT-14', 'sales order reference', 'BT-13', 'purchase order reference')
  needs(invoice.orderDate !== undefined && invoice.purchaseOrderReference === undefined, 'EXT-FR-FE-197', 'order date', 'BT-13', 'purchase order reference')
  needs(invoice.despatchAdviceDate !== undefined && invoice.despatchAdviceReference === undefined, 'EXT-FR-FE-198', 'despatch advice date', 'BT-16', 'despatch advice reference')
  needs(invoice.contractCodeType !== undefined && invoice.contractReference === undefined, 'EXT-FR-FE-01', 'contract code type', 'BT-12', 'contract reference')
  needs(invoice.contractDate !== undefined && invoice.contractReference === undefined, 'EXT-FR-FE-199', 'contract date', 'BT-12', 'contract reference')
  for (const line of invoice.lines) {
    const order = line.sellerOrderReference
    const lineReference = line.purchaseOrderLineReference !== undefined
    needs(!lineReference && line.purchaseOrderReference !== undefined, 'EXT-FR-FE-135', 'purchase order reference of the line', 'BT-132', 'referenced purchase order line reference')
    needs(!lineReference && order?.orderLineReference !== undefined, 'EXT-FR-FE-145', 'sales order line identifier', 'BT-132', 'referenced purchase order line reference')
    needs(line.purchaseOrderReference === undefined && order?.orderReference !== undefined, 'EXT-FR-FE-144', 'sales order reference of the line', 'EXT-FR-FE-135', 'purchase order reference of the line')
    needs(line.purchaseOrderReference === undefined && line.purchaseOrderDate !== undefined, 'EXT-FR-FE-200', 'purchase order date of the line', 'EXT-FR-FE-135', 'purchase order reference of the line')
    const despatch = line.despatchAdviceReference
    needs(despatch !== undefined && despatch.lineReference === undefined, 'EXT-FR-FE-BG-07', 'despatch advice reference of the line', 'EXT-FR-FE-141', 'despatch advice line identifier')
    needs(despatch?.issueDate !== undefined && despatch.reference === undefined, 'EXT-FR-FE-201', 'despatch advice issue date of the line', 'EXT-FR-FE-140', 'despatch advice reference of the line')
    const receipt = line.receivingAdviceReference
    needs(receipt !== undefined && receipt.lineReference === undefined, 'EXT-FR-FE-BG-08', 'receiving advice reference of the line', 'EXT-FR-FE-143', 'receiving advice line identifier')
    // Annex A: EXT-FR-FE-BG-06 is `0..2`, EXT-FR-FE-136 `1..1` in it.
    if (line.precedingInvoiceReferences.length > 2)
      fail('EXT-FR-FE-BG-06 (preceding invoice reference of the line) occurs at most twice in UBL (annex A)')
    for (const reference of line.precedingInvoiceReferences) {
      if (isBlank(reference.reference))
        fail('EXT-FR-FE-136 (preceding invoice reference of the line) is mandatory and empty in each EXT-FR-FE-BG-06')
      // EXTENDED-CTC-FR-UBL finds the line status by `cac:InvoiceDocumentReference/cbc:ID = BT-1`.
      if (reference.reference === invoice.number)
        fail('EXT-FR-FE-136 (preceding invoice reference of the line) equals BT-1: UBL keeps that reference for the line status (EXT-FR-FE-163)')
    }
  }
}

// Two terms in one UBL element. Run before the shared CII checks, whose message for BT-105 / BT-177 and
// BT-145 / BT-193 names the CII element.
function assertSharedElements(invoice: Invoice): void {
  for (const transfer of invoice.paymentInstructions?.creditTransfers ?? []) {
    if (transfer?.paymentAccountIdentifier !== undefined && transfer?.nationalAccountNumber !== undefined)
      fail('BT-84-0 (national account number) and BT-84 (payment account identifier) share one UBL `cbc:ID`: set only one')
  }
  for (const charge of invoice.charges) {
    if (charge?.reasonCode !== undefined && charge?.nonVatTaxCode !== undefined)
      fail('BT-105 (document level charge reason code) and BT-177 (document level non-VAT tax code) share one `cbc:AllowanceChargeReasonCode`: set only one')
  }
  for (const line of Array.isArray(invoice.lines) ? invoice.lines : []) {
    for (const charge of line?.charges ?? []) {
      if (charge?.reasonCode !== undefined && charge?.nonVatTaxCode !== undefined)
        fail('BT-145 (invoice line charge reason code) and BT-193 (invoice line level non-VAT tax code) share one `cbc:AllowanceChargeReasonCode`: set only one')
    }
  }
}

function assertCarriers(invoice: Invoice, root: UBL_ROOT): void {
  if (invoice.payer && !invoice.paymentInstructions)
    fail('EXT-FR-FE-BG-02 (payer) needs BG-16 (payment instructions): UBL writes it in `cac:PaymentMeans/cac:PaymentMandate`')
  if (root === 'CreditNote' && invoice.paymentDueDate !== undefined && !invoice.paymentInstructions)
    fail('BT-9 (payment due date) needs BG-16 (payment instructions) in a CreditNote: UBL writes it in `cac:PaymentMeans/cbc:PaymentDueDate`')
}

function assertRoot(invoice: Invoice, root: UBL_ROOT): void {
  const codes = root === 'CreditNote' ? UBL_CREDIT_NOTE_TYPE_CODES : UBL_INVOICE_TYPE_CODES
  if (!codes.has(invoice.typeCode))
    fail(`BT-3 (invoice type code) is not a ${root} type code of BR-CL-01; write it with the other root`)
}

// Line rules of the UBL Schematrons the shared CII checks do not know.
function assertUblLines(invoice: Invoice, level: UblLevel): void {
  for (const line of invoice.lines) {
    // UBL has EXT-FR-FE-180 in the line `cac:InvoicePeriod`, which BR-CO-20 (both UBL Schematrons) wants with a
    // start or end date (CG-68).
    if (line.vat?.vatPointDateCode !== undefined && line.period?.startDate === undefined && line.period?.endDate === undefined)
      fail('EXT-FR-FE-180 (line value added tax point date code) needs BT-134 or BT-135 (invoice line period) in UBL: it sits in `cac:InvoicePeriod` (BR-CO-20)')
    // EXTENDED-CTC-FR-UBL BR-FREXT-26 ([BR-26]), BR-FREXT-22, BR-FREXT-CO-04 and UBL-FREXT-SR-48: a line whose subtype EXT-FR-FE-163 is
    // `DETAIL` or not specified needs its net price, quantity and one VAT category (CG-69). Below
    // extended-ctc-fr the shared checks already require them.
    if (level === 'extended-ctc-fr' && (line.statusReasonCode === undefined || line.statusReasonCode === 'DETAIL')) {
      if (!line.price)
        fail('BG-29 (price details) is mandatory on a line whose EXT-FR-FE-163 (line status reason code) is "DETAIL" or not set (BR-26)')
      if (line.invoicedQuantity === undefined)
        fail('BT-129 (invoiced quantity) is mandatory on a line whose EXT-FR-FE-163 (line status reason code) is "DETAIL" or not set (BR-FREXT-22)')
      if (!line.vat)
        fail('BG-30 (line VAT information) is mandatory on a line whose EXT-FR-FE-163 (line status reason code) is "DETAIL" or not set (BR-FREXT-CO-04, UBL-FREXT-SR-48)')
    }
  }
}

// A note is written `#subject#text` or `text`; refuse what `UBL_NOTE_PATTERN` would read back differently.
function assertNote(subjectCode: string | undefined, content: string | undefined, ids: [string, string]): void {
  if (subjectCode !== undefined && (subjectCode === '' || subjectCode.includes('#')))
    fail(`${ids[0]} is written \`#code#\` in UBL \`cbc:Note\`: it cannot be empty or contain "#"`)
  if (subjectCode === undefined && content !== undefined && UBL_NOTE_PATTERN.test(content))
    fail(`${ids[1]} starts with "#...#", which UBL reads back as ${ids[0]}; set ${ids[0]} or change the text`)
}

function assertNotes(invoice: Invoice, level: UblLevel): void {
  for (const n of invoice.notes)
    assertNote(n.subjectCode, n.note, ['BT-21 (invoice note subject code)', 'BT-22 (invoice note)'])
  // EN 16931 has no line note subject code: at `en16931` the reader keeps a leading `#code#` in BT-127 (CG-70),
  // so such a text reads back unchanged. A subject code is refused there by the level gate.
  if (level === 'en16931')
    return
  for (const line of invoice.lines) {
    for (const n of line.notes)
      assertNote(n.subjectCode, n.note, ['EXT-FR-FE-183 (invoice line note subject code)', 'BT-127 (invoice line note)'])
  }
}

// The shared line checks of `toCii()` hold rules of the CII binding that UBL does not have. They run on a copy
// where those inputs are made acceptable to them, so UBL follows its own binding:
// - a second preceding invoice reference of the line: UBL repeats `cac:BillingReference` (annex A EXT-FR-FE-BG-06
//   `0..2`, counted by `assertUblNesting()`);
// - BT-147 without BT-148: CII holds the discount inside the gross price, UBL's `cbc:BaseAmount` is optional
//   (annex A BT-148 `0..1`);
// - EXT-FR-FE-166-1 (line seller identifier scheme) and EXT-FR-FE-148 (line deliver-to identifier scheme):
//   `@schemeID` is optional in the UBL XSD and in the level Schematrons.
// Policy: the writer gates what the UBL 2.1 XSD and the level Schematron (EN16931-UBL / EXTENDED-CTC-FR-UBL) reject,
// never the opt-in French rules. A schemeless EXT-FR-FE-148 is written, as the header BT-29 / BT-46 / BT-60 / BT-71
// are; the UBL BR-FR-CO-10 (`BR-FR-CO-10_EXT-FR-FE-146-1`) then reports it under `check({ frCtc: true })` (CG-63).
function ciiOnlyRulesLifted(line: InvoiceLine): InvoiceLine {
  if (!line || typeof line !== 'object')
    return line
  const price = line.price
  return {
    ...line,
    precedingInvoiceReferences: line.precedingInvoiceReferences.slice(0, 1),
    price: price && typeof price === 'object' && price.priceDiscount !== undefined && price.grossPrice === undefined ? { ...price, grossPrice: 0 } : price,
    seller: line.seller && typeof line.seller === 'object' ? { ...line.seller, identifiers: line.seller.identifiers.map(i => ({ ...i, schemeId: i?.schemeId ?? 'UBL' })) } : line.seller,
    deliverTo: line.deliverTo && typeof line.deliverTo === 'object' && Array.isArray(line.deliverTo.identifiers) ? { ...line.deliverTo, identifiers: line.deliverTo.identifiers.map(i => ({ ...i, schemeId: i?.schemeId ?? 'UBL' })) } : line.deliverTo,
  }
}

function assertSpecification(invoice: Invoice, level: UblLevel): void {
  const specification = invoice.specificationIdentifier
  if (specification !== undefined && specification !== '' && specification !== CUSTOMIZATION_IDS[level])
    fail(`BT-24 (specification identifier) is not the identifier of level "${level}"; clear it to write that identifier, or set ${CUSTOMIZATION_IDS[level]}`)
}

// ---------------------------------------------------------------------------
// Value writers
// ---------------------------------------------------------------------------

/**
 * Passed down the build. `lenient` is set only when `buildUbl()` runs for the reader (`ublToInvoice()`), which writes
 * the model it read back to compute `dropped`: an untrusted document may hold a bad date, an Amount with more
 * decimals or a non-number, which the writer refuses but the difference must report, not throw on.
 */
interface BuildContext {
  readonly lenient: boolean
}

/** A number as the lenient build writes it: every digit, `NaN` / `Infinity` as such (the source differs). */
function lenientNumber(value: number): string {
  return Number.isFinite(value) ? formatDecimal(value) : String(value)
}

function text(parent: XmlElement, name: string, value: string | undefined): void {
  if (value !== undefined)
    parent.addElement(name).addText(value)
}

function identifier(parent: XmlElement, name: string, value: Identifier | undefined): void {
  if (value === undefined)
    return
  const element = parent.addElement(name)
  element.addText(value.value)
  if (value.schemeId !== undefined)
    element.setAttr('schemeID', value.schemeId)
}

function date(ctx: BuildContext, parent: XmlElement, name: string, iso: string | undefined, term: string): void {
  if (iso === undefined)
    return
  if (!ctx.lenient && !isCalendarDate(iso))
    fail(`${term} must be an ISO date (YYYY-MM-DD)`)
  parent.addElement(name).addText(iso)
}

/** *Amount* (BR-DEC: at most 2 decimals), with its `@currencyID`. Throws, naming `term`, on more decimals. */
function amount(ctx: BuildContext, parent: XmlElement, name: string, value: number | undefined, currency: string | undefined, term: string): void {
  if (value === undefined)
    return
  if (ctx.lenient) {
    const element = parent.addElement(name)
    element.addText(lenientNumber(value))
    if (currency !== undefined)
      element.setAttr('currencyID', currency)
    return
  }
  if (!Number.isFinite(value))
    fail(`${term} must be a finite number`)
  if (hasMoreThanTwoDecimals(value))
    fail(`${term} has more than 2 decimals; an Amount is limited to 2 (BR-DEC), round it first`)
  const fixed = value.toFixed(2)
  const element = parent.addElement(name)
  // `toFixed()` switches to exponent notation from 1e21 up, which `xs:decimal` rejects (CG-28).
  element.addText(/e/i.test(fixed) ? formatDecimal(value) : fixed)
  element.setAttr('currencyID', currency!)
}

/** *Unit Price Amount* (BT-146, BT-147, BT-148): every digit kept (no decimals limit, CG-01). */
function unitPrice(ctx: BuildContext, parent: XmlElement, name: string, value: number, currency: string, term: string): void {
  if (!ctx.lenient && !Number.isFinite(value))
    fail(`${term} must be a finite number`)
  const element = parent.addElement(name)
  element.addText(lenientNumber(value))
  element.setAttr('currencyID', currency)
}

function decimal(ctx: BuildContext, parent: XmlElement, name: string, value: number | undefined, term: string): void {
  if (value === undefined)
    return
  if (!ctx.lenient && !Number.isFinite(value))
    fail(`${term} must be a finite number`)
  parent.addElement(name).addText(lenientNumber(value))
}

function quantity(ctx: BuildContext, parent: XmlElement, name: string, value: number | undefined, unitCode: string | undefined, term: string): void {
  if (value === undefined)
    return
  if (!ctx.lenient && !Number.isFinite(value))
    fail(`${term} must be a finite number`)
  const element = parent.addElement(name)
  element.addText(lenientNumber(value))
  if (unitCode !== undefined)
    element.setAttr('unitCode', unitCode)
}

/** A note: UBL has one `cbc:Note`, the subject code written in front between `#` (annex A BT-21, EXT-FR-FE-183). */
function note(parent: XmlElement, subjectCode: string | undefined, content: string | undefined): void {
  parent.addElement('cbc:Note').addText(subjectCode === undefined ? (content ?? '') : `#${subjectCode}#${content ?? ''}`)
}

// ---------------------------------------------------------------------------
// Parties
// ---------------------------------------------------------------------------

function address(parent: XmlElement, name: string, value: PostalAddress | undefined): void {
  if (value === undefined)
    return
  const element = parent.addElement(name)
  text(element, 'cbc:StreetName', value.addressLine1)
  text(element, 'cbc:AdditionalStreetName', value.addressLine2)
  text(element, 'cbc:CityName', value.city)
  text(element, 'cbc:PostalZone', value.postCode)
  text(element, 'cbc:CountrySubentity', value.countrySubdivision)
  if (value.addressLine3 !== undefined)
    element.addElement('cac:AddressLine').addElement('cbc:Line').addText(value.addressLine3)
  element.addElement('cac:Country').addElement('cbc:IdentificationCode').addText(value.countryCode)
}

function taxScheme(parent: XmlElement, companyId: string | undefined, scheme: string): void {
  if (companyId === undefined)
    return
  const element = parent.addElement('cac:PartyTaxScheme')
  element.addElement('cbc:CompanyID').addText(companyId)
  element.addElement('cac:TaxScheme').addElement('cbc:ID').addText(scheme)
}

function contact(parent: XmlElement, value: Contact | undefined): void {
  if (value === undefined || (value.point === undefined && value.telephoneNumber === undefined && value.emailAddress === undefined))
    return
  const element = parent.addElement('cac:Contact')
  text(element, 'cbc:Name', value.point)
  text(element, 'cbc:Telephone', value.telephoneNumber)
  text(element, 'cbc:ElectronicMail', value.emailAddress)
}

/** The content of a `cac:Party` (UBL `PartyType`), in its sequence order. */
interface PartyContent {
  endpoint?: Identifier
  roleCode?: string
  identifiers?: Identifier[]
  tradingName?: string
  address?: PostalAddress
  vatIdentifier?: string
  taxRegistrationIdentifier?: string
  registrationName?: string
  legalRegistrationIdentifier?: Identifier
  legalForm?: string
  contact?: Contact
  agent?: PartyContent
  serviceProvider?: PartyContent
}

function party(element: XmlElement, content: PartyContent): void {
  identifier(element, 'cbc:EndpointID', content.endpoint)
  text(element, 'cbc:IndustryClassificationCode', content.roleCode)
  for (const id of content.identifiers ?? [])
    identifier(element.addElement('cac:PartyIdentification'), 'cbc:ID', id)
  if (content.tradingName !== undefined)
    element.addElement('cac:PartyName').addElement('cbc:Name').addText(content.tradingName)
  address(element, 'cac:PostalAddress', content.address)
  taxScheme(element, content.vatIdentifier, VAT_SCHEME)
  taxScheme(element, content.taxRegistrationIdentifier, TAX_REGISTRATION_SCHEME)
  if (content.registrationName !== undefined || content.legalRegistrationIdentifier !== undefined || content.legalForm !== undefined) {
    const legal = element.addElement('cac:PartyLegalEntity')
    text(legal, 'cbc:RegistrationName', content.registrationName)
    identifier(legal, 'cbc:CompanyID', content.legalRegistrationIdentifier)
    text(legal, 'cbc:CompanyLegalForm', content.legalForm)
  }
  contact(element, content.contact)
  if (content.agent)
    party(element.addElement('cac:AgentParty'), content.agent)
  if (content.serviceProvider)
    party(element.addElement('cac:ServiceProviderParty').addElement('cac:Party'), content.serviceProvider)
}

type ExtraParty = BuyerAgent | SellerAgent | Invoicee | Payer | BillingParty

function extraParty(value: ExtraParty | undefined): PartyContent | undefined {
  if (!value)
    return undefined
  return {
    endpoint: value.electronicAddress,
    roleCode: value.roleCode,
    identifiers: value.identifiers,
    tradingName: value.tradingName,
    address: value.address,
    vatIdentifier: value.vatIdentifier,
    registrationName: value.name,
    legalRegistrationIdentifier: value.legalRegistrationIdentifier,
    contact: value.contact,
  }
}

/** BT-90 (bank assigned creditor identifier): in the payee's identifiers when there is a payee, else the seller's (annex A). */
function creditorIdentifier(invoice: Invoice): Identifier[] {
  const id = invoice.paymentInstructions?.directDebit?.bankAssignedCreditorIdentifier
  return id === undefined ? [] : [{ value: id, schemeId: SEPA }]
}

function parties(root: XmlElement, invoice: Invoice): void {
  const { seller, buyer, payee, sellerTaxRepresentative: representative } = invoice
  party(root.addElement('cac:AccountingSupplierParty').addElement('cac:Party'), {
    endpoint: seller.electronicAddress,
    identifiers: [...seller.identifiers, ...(payee ? [] : creditorIdentifier(invoice))],
    tradingName: seller.tradingName,
    address: seller.address,
    vatIdentifier: seller.vatIdentifier,
    taxRegistrationIdentifier: seller.taxRegistrationIdentifier,
    registrationName: seller.name,
    legalRegistrationIdentifier: seller.legalRegistrationIdentifier,
    legalForm: seller.additionalLegalInformation,
    contact: seller.contact,
    agent: extraParty(invoice.sellerAgent),
    serviceProvider: extraParty(invoice.billingParty),
  })
  party(root.addElement('cac:AccountingCustomerParty').addElement('cac:Party'), {
    endpoint: buyer.electronicAddress,
    identifiers: buyer.identifiers,
    tradingName: buyer.tradingName,
    address: buyer.address,
    vatIdentifier: buyer.vatIdentifier,
    registrationName: buyer.name,
    legalRegistrationIdentifier: buyer.legalRegistrationIdentifier,
    contact: buyer.contact,
    agent: extraParty(invoice.buyerAgent),
    serviceProvider: extraParty(invoice.invoicee),
  })
  if (payee) {
    // The payee's name is `cac:PartyName` (BT-59); its `cac:PartyLegalEntity` holds BT-61 only.
    party(root.addElement('cac:PayeeParty'), {
      endpoint: payee.electronicAddress,
      roleCode: payee.roleCode,
      identifiers: [...payee.identifiers, ...creditorIdentifier(invoice)],
      tradingName: payee.name,
      address: payee.address,
      vatIdentifier: payee.vatIdentifier,
      legalRegistrationIdentifier: payee.legalRegistrationIdentifier,
      contact: payee.contact,
    })
  }
  if (representative) {
    party(root.addElement('cac:TaxRepresentativeParty'), {
      tradingName: representative.name,
      address: representative.address,
      vatIdentifier: representative.vatIdentifier,
    })
  }
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function period(ctx: BuildContext, parent: XmlElement, start: string | undefined, end: string | undefined, descriptionCode: string | undefined, terms: [string, string]): void {
  if (start === undefined && end === undefined && descriptionCode === undefined)
    return
  const element = parent.addElement('cac:InvoicePeriod')
  date(ctx, element, 'cbc:StartDate', start, terms[0])
  date(ctx, element, 'cbc:EndDate', end, terms[1])
  text(element, 'cbc:DescriptionCode', descriptionCode)
}

function documentReference(ctx: BuildContext, parent: XmlElement, name: string, id: string | undefined, issueDate: string | undefined, issueDateTerm: string, documentType?: string): void {
  if (id === undefined)
    return
  const element = parent.addElement(name)
  element.addElement('cbc:ID').addText(id)
  date(ctx, element, 'cbc:IssueDate', issueDate, issueDateTerm)
  text(element, 'cbc:DocumentType', documentType)
}

function additionalDocuments(root: XmlElement, invoice: Invoice, creditNote: boolean): void {
  for (const document of invoice.additionalDocuments) {
    const element = root.addElement('cac:AdditionalDocumentReference')
    element.addElement('cbc:ID').addText(document.reference)
    text(element, 'cbc:DocumentDescription', document.description)
    if (document.attachedDocument !== undefined || document.externalLocation !== undefined) {
      const attachment = element.addElement('cac:Attachment')
      if (document.attachedDocument) {
        const binary = attachment.addElement('cbc:EmbeddedDocumentBinaryObject')
        binary.addText(document.attachedDocument.content)
        binary.setAttr('mimeCode', document.attachedDocument.mimeCode)
        binary.setAttr('filename', document.attachedDocument.filename)
      }
      if (document.externalLocation !== undefined)
        attachment.addElement('cac:ExternalReference').addElement('cbc:URI').addText(document.externalLocation)
    }
  }
  for (const object of invoice.invoicedObjectIdentifiers) {
    const element = root.addElement('cac:AdditionalDocumentReference')
    identifier(element, 'cbc:ID', object)
    element.addElement('cbc:DocumentTypeCode').addText(INVOICED_OBJECT)
  }
  // A UBL CreditNote has no `cac:ProjectReference`: BT-11 is an additional document of type 50 (UBL-SR-43, annex A).
  if (creditNote && invoice.projectReference !== undefined) {
    const element = root.addElement('cac:AdditionalDocumentReference')
    element.addElement('cbc:ID').addText(invoice.projectReference)
    element.addElement('cbc:DocumentTypeCode').addText(PROJECT_REFERENCE)
  }
}

function delivery(ctx: BuildContext, root: XmlElement, invoice: Invoice): void {
  const value = invoice.delivery
  if (value) {
    const element = root.addElement('cac:Delivery')
    date(ctx, element, 'cbc:ActualDeliveryDate', value.actualDeliveryDate, 'BT-72 (actual delivery date)')
    if (value.locationIdentifier !== undefined || value.address !== undefined) {
      const location = element.addElement('cac:DeliveryLocation')
      identifier(location, 'cbc:ID', value.locationIdentifier)
      address(location, 'cac:Address', value.address)
    }
    if (value.name !== undefined)
      element.addElement('cac:DeliveryParty').addElement('cac:PartyName').addElement('cbc:Name').addText(value.name)
  }
  deliveryTerms(root, invoice.deliveryTerms)
}

function deliveryTerms(parent: XmlElement, value: { deliveryTypeCode: string, locationName?: string } | undefined): void {
  if (!value)
    return
  const element = parent.addElement('cac:DeliveryTerms')
  element.addElement('cbc:ID').addText(value.deliveryTypeCode)
  if (value.locationName !== undefined)
    element.addElement('cac:DeliveryLocation').addElement('cbc:Name').addText(value.locationName)
}

// One `cac:PaymentMeans` per credit transfer (UBL has one `cac:PayeeFinancialAccount` per payment means), one
// when there is none, each with BT-81 and BT-83 (UBL-SR-47 / -44 accept them repeated with one value). BT-82
// (`@name`, UBL-SR-46), the payment mandate BG-19 (UBL-SR-55) and the credit note's BT-9 (UBL-SR-45) may occur
// once in the document: they go in the first.
function paymentMeans(ctx: BuildContext, root: XmlElement, invoice: Invoice, creditNote: boolean): void {
  const instructions: PaymentInstructions | undefined = invoice.paymentInstructions
  if (!instructions)
    return
  const transfers: (CreditTransfer | undefined)[] = instructions.creditTransfers.length > 0 ? instructions.creditTransfers : [undefined]
  transfers.forEach((transfer, index) => {
    const first = index === 0
    const element = root.addElement('cac:PaymentMeans')
    const code = element.addElement('cbc:PaymentMeansCode')
    code.addText(instructions.paymentMeansTypeCode)
    if (first && instructions.paymentMeansText !== undefined)
      code.setAttr('name', instructions.paymentMeansText)
    if (first && creditNote)
      date(ctx, element, 'cbc:PaymentDueDate', invoice.paymentDueDate, 'BT-9 (payment due date)')
    text(element, 'cbc:PaymentID', instructions.remittanceInformation)
    // Reached only by the reader's difference: the writer refuses BG-18 before building (CG-61). Without
    // BT-87-1 the written `cac:CardAccount` lacks its mandatory `cbc:NetworkID`, which `dropped` then reports.
    if (first && instructions.card) {
      const card = element.addElement('cac:CardAccount')
      text(card, 'cbc:PrimaryAccountNumberID', instructions.card.primaryAccountNumber)
      text(card, 'cbc:HolderName', instructions.card.holderName)
    }
    if (transfer) {
      const account = element.addElement('cac:PayeeFinancialAccount')
      // UBL has one account `cbc:ID`: BT-84, else the national account number BT-84-0 (EN 16931 BT-84 is any
      // account identifier; CII alone splits IBANID / ProprietaryID). Both set is refused (CG-64).
      text(account, 'cbc:ID', transfer.paymentAccountIdentifier ?? transfer.nationalAccountNumber)
      text(account, 'cbc:Name', transfer.paymentAccountName)
      if (transfer.paymentServiceProviderIdentifier !== undefined)
        account.addElement('cac:FinancialInstitutionBranch').addElement('cbc:ID').addText(transfer.paymentServiceProviderIdentifier)
    }
    const debit = instructions.directDebit
    if (first && (debit?.mandateReferenceIdentifier !== undefined || debit?.debitedAccountIdentifier !== undefined || invoice.payer)) {
      const mandate = element.addElement('cac:PaymentMandate')
      text(mandate, 'cbc:ID', debit?.mandateReferenceIdentifier)
      const payer = extraParty(invoice.payer)
      if (payer)
        party(mandate.addElement('cac:PayerParty'), payer)
      if (debit?.debitedAccountIdentifier !== undefined)
        mandate.addElement('cac:PayerFinancialAccount').addElement('cbc:ID').addText(debit.debitedAccountIdentifier)
    }
  })
}

function taxCategory(ctx: BuildContext, parent: XmlElement, name: string, code: string | undefined, rate: number | undefined, exemptionCode: string | undefined, exemption: string | undefined, rateTerm: string): void {
  const element = parent.addElement(name)
  text(element, 'cbc:ID', code)
  decimal(ctx, element, 'cbc:Percent', rate, rateTerm)
  text(element, 'cbc:TaxExemptionReasonCode', exemptionCode)
  text(element, 'cbc:TaxExemptionReason', exemption)
  element.addElement('cac:TaxScheme').addElement('cbc:ID').addText(VAT_SCHEME)
}

function documentAllowanceCharge(ctx: BuildContext, root: XmlElement, entry: DocumentAllowance | DocumentCharge, charge: boolean, currency: string): void {
  const ids = charge
    ? { amount: 'BT-99', base: 'BT-100', percentage: 'BT-101', rate: 'BT-103', term: 'document level charge' }
    : { amount: 'BT-92', base: 'BT-93', percentage: 'BT-94', rate: 'BT-96', term: 'document level allowance' }
  const element = root.addElement('cac:AllowanceCharge')
  element.addElement('cbc:ChargeIndicator').addText(String(charge))
  const nonVatTaxCode = charge ? (entry as DocumentCharge).nonVatTaxCode : undefined
  if (nonVatTaxCode !== undefined) {
    const code = element.addElement('cbc:AllowanceChargeReasonCode')
    code.addText(nonVatTaxCode)
    code.setAttr('listID', NON_VAT_TAX_LIST)
  }
  else {
    text(element, 'cbc:AllowanceChargeReasonCode', entry.reasonCode)
  }
  text(element, 'cbc:AllowanceChargeReason', entry.reason)
  decimal(ctx, element, 'cbc:MultiplierFactorNumeric', entry.percentage, `${ids.percentage} (${ids.term} percentage)`)
  amount(ctx, element, 'cbc:Amount', entry.amount, currency, `${ids.amount} (${ids.term} amount)`)
  amount(ctx, element, 'cbc:BaseAmount', entry.baseAmount, currency, `${ids.base} (${ids.term} base amount)`)
  taxCategory(ctx, element, 'cac:TaxCategory', entry.vatCategoryCode, entry.vatRate, entry.vatExemptionReasonCode, entry.vatExemptionReason, `${ids.rate} (${ids.term} VAT rate)`)
}

function taxExchangeRate(ctx: BuildContext, root: XmlElement, invoice: Invoice): void {
  const exchange = invoice.vatCurrencyExchange
  if (!exchange)
    return
  const element = root.addElement('cac:TaxExchangeRate')
  element.addElement('cbc:SourceCurrencyCode').addText(exchange.sourceCurrencyCode)
  element.addElement('cbc:TargetCurrencyCode').addText(exchange.targetCurrencyCode)
  decimal(ctx, element, 'cbc:CalculationRate', exchange.exchangeRate, 'BT-167 (VAT currency exchange rate)')
  date(ctx, element, 'cbc:Date', exchange.exchangeRateDate, 'EXT-FR-FE-192 (exchange rate date)')
}

function taxTotals(ctx: BuildContext, root: XmlElement, invoice: Invoice): void {
  const currency = invoice.currencyCode
  const total = root.addElement('cac:TaxTotal')
  amount(ctx, total, 'cbc:TaxAmount', invoice.totals.invoiceTotalVatAmount, currency, 'BT-110 (invoice total VAT amount)')
  for (const breakdown of invoice.vatBreakdown) {
    const subtotal = total.addElement('cac:TaxSubtotal')
    amount(ctx, subtotal, 'cbc:TaxableAmount', breakdown.categoryTaxableAmount, currency, 'BT-116 (VAT category taxable amount)')
    amount(ctx, subtotal, 'cbc:TaxAmount', breakdown.categoryTaxAmount, currency, 'BT-117 (VAT category tax amount)')
    taxCategory(ctx, subtotal, 'cac:TaxCategory', breakdown.categoryCode, breakdown.categoryRate, breakdown.exemptionReasonCode, breakdown.exemptionReasonText, 'BT-119 (VAT category rate)')
  }
  // BT-111 is a second `cac:TaxTotal` in the VAT accounting currency, without breakdown (annex A BT-111-00).
  if (invoice.totals.invoiceTotalVatAmountInAccountingCurrency !== undefined) {
    amount(ctx, root.addElement('cac:TaxTotal'), 'cbc:TaxAmount', invoice.totals.invoiceTotalVatAmountInAccountingCurrency, invoice.vatAccountingCurrencyCode!, 'BT-111 (invoice total VAT amount in accounting currency)')
  }
}

function monetaryTotal(ctx: BuildContext, root: XmlElement, invoice: Invoice): void {
  const { totals, currencyCode: currency } = invoice
  const element = root.addElement('cac:LegalMonetaryTotal')
  amount(ctx, element, 'cbc:LineExtensionAmount', totals.sumOfInvoiceLineNetAmount, currency, 'BT-106 (sum of invoice line net amount)')
  amount(ctx, element, 'cbc:TaxExclusiveAmount', totals.invoiceTotalAmountWithoutVat, currency, 'BT-109 (invoice total amount without VAT)')
  amount(ctx, element, 'cbc:TaxInclusiveAmount', totals.invoiceTotalAmountWithVat, currency, 'BT-112 (invoice total amount with VAT)')
  amount(ctx, element, 'cbc:AllowanceTotalAmount', totals.sumOfAllowancesOnDocumentLevel, currency, 'BT-107 (sum of allowances on document level)')
  amount(ctx, element, 'cbc:ChargeTotalAmount', totals.sumOfChargesOnDocumentLevel, currency, 'BT-108 (sum of charges on document level)')
  amount(ctx, element, 'cbc:PrepaidAmount', totals.paidAmount, currency, 'BT-113 (paid amount)')
  amount(ctx, element, 'cbc:PayableRoundingAmount', totals.roundingAmount, currency, 'BT-114 (rounding amount)')
  amount(ctx, element, 'cbc:PayableAmount', totals.amountDueForPayment, currency, 'BT-115 (amount due for payment)')
}

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

function lineAllowanceCharge(ctx: BuildContext, parent: XmlElement, entry: LineAllowance | LineCharge, charge: boolean, currency: string): void {
  const ids = charge
    ? { amount: 'BT-141', base: 'BT-142', percentage: 'BT-143', term: 'invoice line charge' }
    : { amount: 'BT-136', base: 'BT-137', percentage: 'BT-138', term: 'invoice line allowance' }
  const element = parent.addElement('cac:AllowanceCharge')
  element.addElement('cbc:ChargeIndicator').addText(String(charge))
  const nonVatTaxCode = charge ? (entry as LineCharge).nonVatTaxCode : undefined
  if (nonVatTaxCode !== undefined) {
    const code = element.addElement('cbc:AllowanceChargeReasonCode')
    code.addText(nonVatTaxCode)
    code.setAttr('listID', NON_VAT_TAX_LIST)
  }
  else {
    text(element, 'cbc:AllowanceChargeReasonCode', entry.reasonCode)
  }
  text(element, 'cbc:AllowanceChargeReason', entry.reason)
  decimal(ctx, element, 'cbc:MultiplierFactorNumeric', entry.percentage, `${ids.percentage} (${ids.term} percentage)`)
  amount(ctx, element, 'cbc:Amount', entry.amount, currency, `${ids.amount} (${ids.term} amount)`)
  amount(ctx, element, 'cbc:BaseAmount', entry.baseAmount, currency, `${ids.base} (${ids.term} base amount)`)
}

function lineTaxTotals(ctx: BuildContext, parent: XmlElement, line: InvoiceLine, invoice: Invoice): void {
  if (line.vatAmount !== undefined)
    amount(ctx, parent.addElement('cac:TaxTotal'), 'cbc:TaxAmount', line.vatAmount, invoice.currencyCode, 'EXT-FR-FE-181 (line total VAT amount)')
  if (line.vatAmountInAccountingCurrency !== undefined)
    amount(ctx, parent.addElement('cac:TaxTotal'), 'cbc:TaxAmount', line.vatAmountInAccountingCurrency, invoice.vatAccountingCurrencyCode!, 'EXT-FR-FE-182 (line total VAT amount in accounting currency)')
}

function lineAllowancesCharges(ctx: BuildContext, parent: XmlElement, line: InvoiceLine, currency: string): void {
  for (const allowance of line.allowances)
    lineAllowanceCharge(ctx, parent, allowance, false, currency)
  for (const charge of line.charges)
    lineAllowanceCharge(ctx, parent, charge, true, currency)
}

function item(ctx: BuildContext, parent: XmlElement, line: InvoiceLine): void {
  const value = line.item
  const element = parent.addElement('cac:Item')
  text(element, 'cbc:Description', value.description)
  quantity(ctx, element, 'cbc:PackQuantity', line.unitsInParentLine, line.unitsInParentLineUnitCode, 'EXT-FR-FE-191 (number of units in a parent line unit)')
  element.addElement('cbc:Name').addText(value.name)
  if (value.buyersIdentifier !== undefined)
    element.addElement('cac:BuyersItemIdentification').addElement('cbc:ID').addText(value.buyersIdentifier)
  if (value.sellersIdentifier !== undefined)
    element.addElement('cac:SellersItemIdentification').addElement('cbc:ID').addText(value.sellersIdentifier)
  if (value.standardIdentifier !== undefined)
    identifier(element.addElement('cac:StandardItemIdentification'), 'cbc:ID', value.standardIdentifier)
  if (value.countryOfOrigin !== undefined)
    element.addElement('cac:OriginCountry').addElement('cbc:IdentificationCode').addText(value.countryOfOrigin)
  for (const classification of value.classifications) {
    const code = element.addElement('cac:CommodityClassification').addElement('cbc:ItemClassificationCode')
    code.addText(classification.code)
    code.setAttr('listID', classification.listId)
    if (classification.listVersionId !== undefined)
      code.setAttr('listVersionID', classification.listVersionId)
  }
  if (line.vat)
    taxCategory(ctx, element, 'cac:ClassifiedTaxCategory', line.vat.categoryCode, line.vat.rate, line.vat.exemptionReasonCode, line.vat.exemptionReason, 'BT-152 (invoiced item VAT rate)')
  for (const attribute of value.attributes) {
    const property = element.addElement('cac:AdditionalItemProperty')
    property.addElement('cbc:Name').addText(attribute.name)
    text(property, 'cbc:NameCode', attribute.typeCode)
    text(property, 'cbc:Value', attribute.value)
    quantity(ctx, property, 'cbc:ValueQuantity', attribute.valueQuantity, attribute.valueQuantityUnitCode, 'EXT-FR-FE-160 (item attribute value quantity)')
  }
  const seller = line.seller
  if (seller) {
    party(element.addElement('cac:ManufacturerParty'), {
      endpoint: seller.electronicAddress,
      identifiers: seller.identifiers,
      tradingName: seller.tradingName,
      address: seller.address,
      vatIdentifier: seller.vatIdentifier,
      taxRegistrationIdentifier: seller.taxRegistrationIdentifier,
      registrationName: seller.name,
      legalRegistrationIdentifier: seller.legalRegistrationIdentifier,
    })
  }
}

function price(ctx: BuildContext, parent: XmlElement, line: InvoiceLine, currency: string): void {
  const value = line.price
  if (!value)
    return
  const element = parent.addElement('cac:Price')
  unitPrice(ctx, element, 'cbc:PriceAmount', value.netPrice, currency, 'BT-146 (item net price)')
  quantity(ctx, element, 'cbc:BaseQuantity', value.priceBaseQuantity, value.priceBaseQuantityUnitCode, 'BT-149 (item price base quantity)')
  // BT-148 sits in the price allowance, whose amount BT-147 is mandatory: a gross price without discount
  // is written with a zero discount, as annex B does (CG-62). A discount without gross price has no
  // `cbc:BaseAmount` (optional in UBL, annex A BT-148 `0..1`).
  if (value.grossPrice !== undefined || value.priceDiscount !== undefined) {
    const discount = element.addElement('cac:AllowanceCharge')
    discount.addElement('cbc:ChargeIndicator').addText('false')
    text(discount, 'cbc:AllowanceChargeReasonCode', value.priceDiscountReasonCode)
    text(discount, 'cbc:AllowanceChargeReason', value.priceDiscountReason)
    unitPrice(ctx, discount, 'cbc:Amount', value.priceDiscount ?? 0, currency, 'BT-147 (item price discount)')
    if (value.grossPrice !== undefined)
      unitPrice(ctx, discount, 'cbc:BaseAmount', value.grossPrice, currency, 'BT-148 (item gross price)')
  }
}

function lineReferences(ctx: BuildContext, element: XmlElement, line: InvoiceLine, invoice: Invoice): void {
  if (line.purchaseOrderLineReference !== undefined) {
    const reference = element.addElement('cac:OrderLineReference')
    reference.addElement('cbc:LineID').addText(line.purchaseOrderLineReference)
    text(reference, 'cbc:SalesOrderLineID', line.sellerOrderReference?.orderLineReference)
    if (line.purchaseOrderReference !== undefined) {
      const order = reference.addElement('cac:OrderReference')
      order.addElement('cbc:ID').addText(line.purchaseOrderReference)
      text(order, 'cbc:SalesOrderID', line.sellerOrderReference?.orderReference)
      date(ctx, order, 'cbc:IssueDate', line.purchaseOrderDate, 'EXT-FR-FE-200 (purchase order date of the line)')
    }
  }
  const despatch = line.despatchAdviceReference
  if (despatch) {
    const reference = element.addElement('cac:DespatchLineReference')
    reference.addElement('cbc:LineID').addText(despatch.lineReference ?? '')
    if (despatch.reference !== undefined) {
      const document = reference.addElement('cac:DocumentReference')
      document.addElement('cbc:ID').addText(despatch.reference)
      date(ctx, document, 'cbc:IssueDate', despatch.issueDate, 'EXT-FR-FE-201 (despatch advice issue date of the line)')
    }
  }
  const receipt = line.receivingAdviceReference
  if (receipt) {
    const reference = element.addElement('cac:ReceiptLineReference')
    reference.addElement('cbc:LineID').addText(receipt.lineReference ?? '')
    if (receipt.reference !== undefined)
      reference.addElement('cac:DocumentReference').addElement('cbc:ID').addText(receipt.reference)
  }
  for (const preceding of line.precedingInvoiceReferences) {
    const billing = element.addElement('cac:BillingReference')
    const document = billing.addElement('cac:InvoiceDocumentReference')
    document.addElement('cbc:ID').addText(preceding.reference ?? '')
    date(ctx, document, 'cbc:IssueDate', preceding.issueDate, 'EXT-FR-FE-138 (preceding invoice issue date of the line)')
    text(document, 'cbc:DocumentTypeCode', preceding.typeCode)
    if (preceding.lineReference !== undefined)
      billing.addElement('cac:BillingReferenceLine').addElement('cbc:ID').addText(preceding.lineReference)
  }
  // Annex A / annex B UC10 ... UC13: the line status and the parent line sit in a `cac:BillingReference` whose
  // document is the invoice itself (BT-1), which is how EXTENDED-CTC-FR-UBL finds them.
  if (line.statusReasonCode !== undefined || line.parentLineIdentifier !== undefined) {
    const billing = element.addElement('cac:BillingReference')
    const document = billing.addElement('cac:InvoiceDocumentReference')
    document.addElement('cbc:ID').addText(invoice.number)
    text(document, 'cbc:DocumentStatusCode', line.statusReasonCode)
    if (line.parentLineIdentifier !== undefined)
      billing.addElement('cac:BillingReferenceLine').addElement('cbc:ID').addText(line.parentLineIdentifier)
  }
  for (const object of line.objectIdentifiers) {
    const document = element.addElement('cac:DocumentReference')
    identifier(document, 'cbc:ID', object)
    document.addElement('cbc:DocumentTypeCode').addText(INVOICED_OBJECT)
  }
}

function lineDelivery(ctx: BuildContext, element: XmlElement, line: InvoiceLine): void {
  const { deliverTo, actualDelivery } = line
  if (!deliverTo && !actualDelivery)
    return
  const delivery = element.addElement('cac:Delivery')
  date(ctx, delivery, 'cbc:ActualDeliveryDate', actualDelivery?.actualDeliveryDate, 'EXT-FR-FE-158 (actual delivery date of the line)')
  if (deliverTo && (deliverTo.identifiers.length > 0 || deliverTo.address !== undefined)) {
    const location = delivery.addElement('cac:DeliveryLocation')
    identifier(location, 'cbc:ID', deliverTo.identifiers[0])
    address(location, 'cac:Address', deliverTo.address)
  }
  if (deliverTo?.name !== undefined)
    delivery.addElement('cac:DeliveryParty').addElement('cac:PartyName').addElement('cbc:Name').addText(deliverTo.name)
}

function invoiceLine(ctx: BuildContext, root: XmlElement, line: InvoiceLine, invoice: Invoice, creditNote: boolean): void {
  const currency = invoice.currencyCode
  const element = root.addElement(creditNote ? 'cac:CreditNoteLine' : 'cac:InvoiceLine')
  element.addElement('cbc:ID').addText(line.identifier)
  for (const lineNote of line.notes)
    note(element, lineNote.subjectCode, lineNote.note)
  quantity(ctx, element, creditNote ? 'cbc:CreditedQuantity' : 'cbc:InvoicedQuantity', line.invoicedQuantity, line.invoicedQuantityUnitCode, 'BT-129 (invoiced quantity)')
  amount(ctx, element, 'cbc:LineExtensionAmount', line.netAmount, currency, 'BT-131 (invoice line net amount)')
  text(element, 'cbc:AccountingCost', line.buyerAccountingReference)
  period(ctx, element, line.period?.startDate, line.period?.endDate, line.vat?.vatPointDateCode, ['BT-134 (invoice line period start date)', 'BT-135 (invoice line period end date)'])
  lineReferences(ctx, element, line, invoice)
  lineDelivery(ctx, element, line)
  // `InvoiceLineType` has AllowanceCharge before TaxTotal, `CreditNoteLineType` the reverse.
  if (creditNote) {
    lineTaxTotals(ctx, element, line, invoice)
    lineAllowancesCharges(ctx, element, line, currency)
  }
  else {
    lineAllowancesCharges(ctx, element, line, currency)
    lineTaxTotals(ctx, element, line, invoice)
  }
  item(ctx, element, line)
  price(ctx, element, line, currency)
  deliveryTerms(element, line.deliveryTerms)
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

function header(ctx: BuildContext, root: XmlElement, invoice: Invoice, level: UblLevel, creditNote: boolean): void {
  root.addElement('cbc:UBLVersionID').addText('2.1')
  // The checked writer accepts only the level's id (or none); the reader's build keeps what the model holds.
  root.addElement('cbc:CustomizationID').addText(invoice.specificationIdentifier || CUSTOMIZATION_IDS[level])
  text(root, 'cbc:ProfileID', invoice.businessProcessType)
  root.addElement('cbc:ID').addText(invoice.number)
  date(ctx, root, 'cbc:IssueDate', invoice.issueDate, 'BT-2 (invoice issue date)')
  if (creditNote) {
    date(ctx, root, 'cbc:TaxPointDate', invoice.valueAddedTaxPointDate, 'BT-7 (value added tax point date)')
    root.addElement('cbc:CreditNoteTypeCode').addText(invoice.typeCode)
  }
  else {
    date(ctx, root, 'cbc:DueDate', invoice.paymentDueDate, 'BT-9 (payment due date)')
    root.addElement('cbc:InvoiceTypeCode').addText(invoice.typeCode)
  }
  for (const invoiceNote of invoice.notes)
    note(root, invoiceNote.subjectCode, invoiceNote.note)
  if (!creditNote)
    date(ctx, root, 'cbc:TaxPointDate', invoice.valueAddedTaxPointDate, 'BT-7 (value added tax point date)')
  root.addElement('cbc:DocumentCurrencyCode').addText(invoice.currencyCode)
  text(root, 'cbc:TaxCurrencyCode', invoice.vatAccountingCurrencyCode)
  text(root, 'cbc:AccountingCost', invoice.buyerAccountingReference)
  text(root, 'cbc:BuyerReference', invoice.buyerReference)
  period(ctx, root, invoice.invoicingPeriod?.startDate, invoice.invoicingPeriod?.endDate, invoice.valueAddedTaxPointDateCode, ['BT-73 (invoicing period start date)', 'BT-74 (invoicing period end date)'])
  if (invoice.purchaseOrderReference !== undefined) {
    const order = root.addElement('cac:OrderReference')
    order.addElement('cbc:ID').addText(invoice.purchaseOrderReference)
    text(order, 'cbc:SalesOrderID', invoice.salesOrderReference)
    date(ctx, order, 'cbc:IssueDate', invoice.orderDate, 'EXT-FR-FE-197 (order date)')
  }
  for (const preceding of invoice.precedingInvoiceReferences) {
    const document = root.addElement('cac:BillingReference').addElement('cac:InvoiceDocumentReference')
    document.addElement('cbc:ID').addText(preceding.reference)
    date(ctx, document, 'cbc:IssueDate', preceding.issueDate, 'BT-26 (preceding invoice issue date)')
    text(document, 'cbc:DocumentTypeCode', preceding.typeCode)
  }
  documentReference(ctx, root, 'cac:DespatchDocumentReference', invoice.despatchAdviceReference, invoice.despatchAdviceDate, 'EXT-FR-FE-198 (despatch advice date)')
  documentReference(ctx, root, 'cac:ReceiptDocumentReference', invoice.receivingAdviceReference, undefined, '')
  // `OriginatorDocumentReference` precedes the contract in `Invoice`, follows the additional documents in `CreditNote`.
  if (!creditNote)
    documentReference(ctx, root, 'cac:OriginatorDocumentReference', invoice.tenderOrLotReference, undefined, '')
  documentReference(ctx, root, 'cac:ContractDocumentReference', invoice.contractReference, invoice.contractDate, 'EXT-FR-FE-199 (contract date)', invoice.contractCodeType)
  additionalDocuments(root, invoice, creditNote)
  if (creditNote)
    documentReference(ctx, root, 'cac:OriginatorDocumentReference', invoice.tenderOrLotReference, undefined, '')
  else if (invoice.projectReference !== undefined)
    root.addElement('cac:ProjectReference').addElement('cbc:ID').addText(invoice.projectReference)
}

/**
 * Write an EN 16931 invoice as UBL 2.1 at `level` (`en16931` or `extended-ctc-fr`): the root `options.root`
 * names, else a `CreditNote` when BT-3 is a credit note code of BR-CL-01 (see `InvoiceToUblOptions.root`) and an
 * `Invoice` otherwise. BT-3 must be in the BR-CL-01 list of that root (`81` is in both). The caller owns the returned document: serialise it with `.toString()`, then
 * `dispose()` it. Its nodes carry the UBL namespaces (namespace-bound XPath works on it).
 *
 * Throws, naming the business term (never quoting invoice content), for everything `toCii()` refuses that
 * is not CII-specific (mandatory terms, BR-DEC Amount decimals, dates, plain-object arrays ...), and when:
 * - a term has no UBL place: BT-11-0 (other than the CII default), BT-41-0, BT-56-0, EXT-FR-FE-184, BG-18
 *   (UBL needs the network id BT-87-1, absent from the model), a BT-149-1 / BT-150-1 that differs from
 *   BT-149 / BT-150;
 * - BT-110 is missing (UBL holds BG-23 in the `cac:TaxTotal` whose amount it is);
 * - an `EXT-FR-FE` term, or more than one BT-18, BT-46 or BT-60, is written at `en16931` (UBL-CR-*,
 *   UBL-SR-04, -16, -20; a hint naming a CII-only level is rewritten to `"extended-ctc-fr"`);
 * - a term needs the identifier of the UBL element it sits in (BT-14 without BT-13, EXT-FR-FE-144 without
 *   EXT-FR-FE-135 ...), or two terms share one UBL element (BT-84 and BT-84-0, BT-105 and BT-177, BT-145
 *   and BT-193);
 * - BT-9 of a credit note, or the payer, has no `cac:PaymentMeans` to sit in;
 * - BT-24 is set to anything but the `cbc:CustomizationID` of `level`;
 * - EXT-FR-FE-180 is set without a line period (BR-CO-20), or, at `extended-ctc-fr`, a line whose EXT-FR-FE-163 is
 *   `DETAIL` or unset lacks BG-29, BT-129 or BG-30 (BR-26, BR-FREXT-22, BR-FREXT-CO-04 / UBL-FREXT-SR-48);
 * - a note would read back differently from `#subject#text` (`UBL_NOTE_PATTERN`; line notes at `extended-ctc-fr`
 *   only, CG-70).
 */
export async function invoiceToUbl(invoice: Invoice, options: InvoiceToUblOptions): Promise<XmlDocument> {
  const level = options?.level
  if (!(UBL_LEVELS as readonly string[]).includes(level))
    fail(`options.level must be one of ${LEVEL_LIST}`)
  if (options.root !== undefined && options.root !== 'Invoice' && options.root !== 'CreditNote')
    fail('options.root must be "Invoice" or "CreditNote"')

  let full!: Invoice
  reprefixed(() => {
    full = withArrays(invoice)
  })
  for (const [id, term, get] of MANDATORY) {
    if (isBlank(get(full)))
      fail(`${id} (${term}) is mandatory and empty`)
  }
  assertSharedElements(full)
  reprefixed(() => {
    assertHeaderComplete(full, level)
    assertPartiesComplete(full)
    assertSettlementComplete(full)
  })
  reprefixed(() => assertLinesComplete({ ...full, lines: Array.isArray(full.lines) ? full.lines.map(ciiOnlyRulesLifted) : full.lines } as Invoice, level))
  const root = options.root ?? (UBL_CREDIT_NOTE_TYPE_CODES.has(full.typeCode) ? 'CreditNote' : 'Invoice')
  assertCarriers(full, root)
  assertRoot(full, root)
  assertUblPlaces(full)
  assertLevelCarries(full, level)
  assertUblCounts(full, level)
  assertUblNesting(full)
  assertSpecification(full, level)
  assertUblLines(full, level)
  assertNotes(full, level)

  return buildUbl(full, level, root)
}

/**
 * The document of an invoice the checks of `invoiceToUbl()` have passed, or, with `options.lenient`, of any
 * invoice `ublToInvoice()` read (bad dates, Amount decimals and non-numbers written as they are, BT-24 and BG-18
 * written from the model), to compute its `dropped`. Not exported from the package. The caller owns the result.
 */
export function buildUbl(full: Invoice, level: UblLevel, root: UBL_ROOT, options: { lenient?: boolean } = {}): XmlDocument {
  const built = build({ lenient: options.lenient === true }, full, level, root)
  // `addElement('cbc:X')` names the element `cbc:X` in the root's namespace in memory; only the serialisation
  // carries the UBL namespaces. Re-parsed (default options) so the returned nodes are in their real namespaces
  // and namespace-bound XPath works on them.
  let serialised: string
  try {
    serialised = built.toString()
  }
  finally {
    built.dispose()
  }
  return XmlDocument.fromString(serialised)
}

function build(ctx: BuildContext, full: Invoice, level: UblLevel, root: UBL_ROOT): XmlDocument {
  const creditNote = root === 'CreditNote'
  const doc = XmlDocument.fromString(`<?xml version="1.0" encoding="UTF-8"?>
<${root} xmlns="${creditNote ? UBL_CREDITNOTE_NS : UBL_INVOICE_NS}" xmlns:cac="${CAC}" xmlns:cbc="${UBL_CBC_NS}"/>`)
  try {
    const element = doc.root
    header(ctx, element, full, level, creditNote)
    parties(element, full)
    delivery(ctx, element, full)
    paymentMeans(ctx, element, full, creditNote)
    if (full.paymentTerms !== undefined)
      element.addElement('cac:PaymentTerms').addElement('cbc:Note').addText(full.paymentTerms)
    if (creditNote)
      taxExchangeRate(ctx, element, full)
    for (const allowance of full.allowances)
      documentAllowanceCharge(ctx, element, allowance, false, full.currencyCode)
    for (const charge of full.charges)
      documentAllowanceCharge(ctx, element, charge, true, full.currencyCode)
    if (!creditNote)
      taxExchangeRate(ctx, element, full)
    taxTotals(ctx, element, full)
    monetaryTotal(ctx, element, full)
    for (const line of full.lines)
      invoiceLine(ctx, element, line, full, creditNote)
  }
  catch (error) {
    // The caller owns the returned document, but only on success.
    doc.dispose()
    throw error
  }
  return doc
}
