/**
 * UBL 2.1 (`Invoice` or `CreditNote`) → EN 16931 model: the inverse of `invoiceToUbl()` (`converters/ubl.ts`),
 * place for place. The writer is the specification of every path read here; where UBL repeats what the model
 * holds once, the reader takes the occurrence the writer would write and leaves the others to `dropped`.
 *
 * Elements are found by what identifies them, not by position alone: a `cac:TaxTotal` by its `@currencyID`
 * (BT-5 / BT-6), the line status `cac:BillingReference` by its document id equal to BT-1, a
 * `cac:AdditionalDocumentReference` by its `cbc:DocumentTypeCode` (130 invoiced object; 50 project reference, in a
 * `CreditNote` only), a `cac:PartyTaxScheme` by `VAT` or anything else, BT-90 by `@schemeID="SEPA"`.
 *
 * Parsing uses the default libxml2 options only: no entity expansion, DTD loading or XInclude (AGENTS.md).
 */

import type { XmlElement as El } from 'libxml2-wasm'
import type { Buffer } from 'node:buffer'
import type { UBL_ROOT } from '../constants'
import type { UblLevel } from '../converters/ubl'
import { XmlDocument } from 'libxml2-wasm'
import { buildUbl, UBL_NOTE_PATTERN } from '../converters/ubl'
import { BillingParty, BuyerAgent, Invoicee, Payee, Payer, SellerAgent } from '../models/en16931/additional-parties'
import { Contact, Identifier, PostalAddress } from '../models/en16931/common'
import { AdditionalSupportingDocument, AttachedDocument, Invoice, InvoiceNote, InvoicingPeriod, PrecedingInvoiceReference } from '../models/en16931/invoice'
import { LineActualDelivery, LineDeliverTo, LineDeliveryTerms, LineDespatchAdviceReference, LinePrecedingInvoiceReference, LineReceivingAdviceReference, LineSeller, LineSellerOrderReference } from '../models/en16931/line-extensions'
import { Item, ItemAttribute, ItemClassification, LineVat, PriceDetails } from '../models/en16931/line-item'
import { InvoiceLine, LineAllowance, LineCharge, LineNote, LinePeriod } from '../models/en16931/lines'
import { Buyer, Delivery, DeliveryTerms, Seller, SellerTaxRepresentative } from '../models/en16931/parties'
import { CreditTransfer, DirectDebit, DocumentAllowance, DocumentCharge, DocumentTotals, PaymentCard, PaymentInstructions, VatBreakdown, VatCurrencyExchange } from '../models/en16931/settlement'
import { getUblDeclaredLevel, inputHasDoctype, isUblDocument } from '../xml'
import { ublDiffPaths } from './ubl-dropped'

/** What `ublToInvoice()` returns. */
export interface UblToInvoiceResult {
  /** The invoice, keyed by EN 16931 business term. */
  invoice: Invoice
  /**
   * XPath-like paths (`/Invoice/cac:X/cbc:Y`, `/@attr`; `[n]` only on a name the source repeats under one
   * parent) of every value of the source with no equal counterpart once the invoice is written back as UBL:
   * what the model has no place for (a `cbc:IssueTime`, the card network id, a second `cac:Delivery` ...).
   * Positions only, never the values.
   *
   * The write-back used for this difference skips every check of `invoiceToUbl()`: ISO dates, BR-DEC Amount
   * decimals, what the level carries (an EXTENDED-CTC-FR term in an `en16931` document), the UBL structure rules.
   * A value the model holds is therefore not in `dropped` even when the level cannot carry it: it stays in the
   * invoice, and `invoiceToUbl()` throws on it later. Empty `dropped` does not mean `invoiceToUbl()` accepts the
   * invoice (a CIUS BT-24, BG-18 (CG-61), an EXTENDED-CTC-FR term at `en16931` ...).
   */
  dropped: string[]
}

const NAMESPACES = {
  cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
}

type InvoiceFields = ConstructorParameters<typeof Invoice>[0]
type HeaderFields = Pick<InvoiceFields, 'number' | 'issueDate' | 'typeCode' | 'currencyCode' | 'vatAccountingCurrencyCode' | 'valueAddedTaxPointDate'
  | 'valueAddedTaxPointDateCode' | 'paymentDueDate' | 'buyerReference' | 'projectReference' | 'projectName' | 'contractReference' | 'contractCodeType'
  | 'contractDate' | 'purchaseOrderReference' | 'orderDate' | 'salesOrderReference' | 'receivingAdviceReference' | 'despatchAdviceReference'
  | 'despatchAdviceDate' | 'tenderOrLotReference' | 'invoicedObjectIdentifiers' | 'buyerAccountingReference' | 'businessProcessType'
  | 'specificationIdentifier' | 'notes' | 'precedingInvoiceReferences' | 'invoicingPeriod' | 'additionalDocuments'>

/** The content of a `cac:Party`. */
interface UblParty {
  electronicAddress?: Identifier
  roleCode?: string
  identifiers: Identifier[]
  tradingName?: string
  address?: PostalAddress
  vatIdentifier?: string
  taxRegistrationIdentifier?: string
  registrationName?: string
  legalRegistrationIdentifier?: Identifier
  legalForm?: string
  contact?: Contact
}

interface UblTaxCategory {
  code?: string
  rate?: number
  exemptionReasonCode?: string
  exemptionReason?: string
}

const VAT = 'VAT'
const SEPA = 'SEPA'

/**
 * Whether a `cac:PartyTaxScheme` is the VAT one: both UBL Schematrons test `normalize-space(upper-case(cbc:ID)) = 'VAT'`
 * on `cac:PartyTaxScheme` (the BT-31 / BT-63 / BT-48 contexts), so `vat` or ` VAT ` is VAT too.
 */
function isVatScheme(scheme: El): boolean {
  return (text(scheme, 'cac:TaxScheme/cbc:ID') ?? '').replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '').toUpperCase() === VAT
}

const INVOICED_OBJECT = '130'
const PROJECT_REFERENCE = '50'
const NON_VAT_TAX_LIST = '5153'

// ---------------------------------------------------------------------------
// Value readers
// ---------------------------------------------------------------------------

function first(node: El | undefined, xpath: string): El | undefined {
  return node ? (node.get(xpath, NAMESPACES) as El | null) ?? undefined : undefined
}

function all(node: El | undefined, xpath: string): El[] {
  return node ? (node.find(xpath, NAMESPACES) as El[]) : []
}

function attr(node: El | undefined, name: string): string | undefined {
  return node?.attr(name)?.value ?? undefined
}

/** The text of an element, `undefined` when it is absent (present and empty reads `''`, as the writer wrote it). */
function text(node: El | undefined, xpath: string): string | undefined {
  return first(node, xpath)?.content
}

/** A strict `xs:decimal` (`Number()` would read `''` as 0 and `1e3` as 1000); anything else is NaN, never a value. */
function parseDecimal(value: string): number {
  const trimmed = value.trim()
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(trimmed) ? Number(trimmed) : Number.NaN
}

function decimal(node: El | undefined, xpath: string): number | undefined {
  const element = first(node, xpath)
  return element ? parseDecimal(element.content) : undefined
}

/** A mandatory number of the model: left `undefined` when the source lacks it, as `fromCii()` does. */
function required(node: El | undefined, xpath: string): number {
  return decimal(node, xpath) as number
}

function quantity(node: El | undefined, xpath: string): [number | undefined, string | undefined] {
  const element = first(node, xpath)
  return element ? [parseDecimal(element.content), attr(element, 'unitCode')] : [undefined, undefined]
}

function identifier(node: El | undefined, xpath: string): Identifier | undefined {
  const element = first(node, xpath)
  return element ? new Identifier({ value: element.content, schemeId: attr(element, 'schemeID') }) : undefined
}

function isTrue(node: El | undefined, xpath: string): boolean {
  const value = text(node, xpath)?.trim()
  return value === 'true' || value === '1'
}

/** A note: a leading `#code#` is the subject code (annex A BT-21, EXT-FR-FE-183; `UBL_NOTE_PATTERN`). */
function note(content: string): { subjectCode?: string, note?: string } {
  const match = UBL_NOTE_PATTERN.exec(content)
  if (match)
    return { subjectCode: match[1], note: match[2] === '' ? undefined : match[2] }
  return { note: content === '' ? undefined : content }
}

// ---------------------------------------------------------------------------
// Parties
// ---------------------------------------------------------------------------

function address(node: El | undefined): PostalAddress | undefined {
  if (!node)
    return undefined
  return new PostalAddress({
    addressLine1: text(node, 'cbc:StreetName'),
    addressLine2: text(node, 'cbc:AdditionalStreetName'),
    addressLine3: text(node, 'cac:AddressLine/cbc:Line'),
    city: text(node, 'cbc:CityName'),
    postCode: text(node, 'cbc:PostalZone'),
    countrySubdivision: text(node, 'cbc:CountrySubentity'),
    countryCode: text(node, 'cac:Country/cbc:IdentificationCode') ?? '',
  })
}

function contact(node: El | undefined): Contact | undefined {
  const element = first(node, 'cac:Contact')
  const point = text(element, 'cbc:Name')
  const telephoneNumber = text(element, 'cbc:Telephone')
  const emailAddress = text(element, 'cbc:ElectronicMail')
  if (point === undefined && telephoneNumber === undefined && emailAddress === undefined)
    return undefined
  return new Contact({ point, telephoneNumber, emailAddress })
}

/** The content of a `cac:Party` as the writer's `party()` writes it. */
function party(node: El): UblParty {
  const schemes = all(node, 'cac:PartyTaxScheme')
  const legal = first(node, 'cac:PartyLegalEntity')
  return {
    electronicAddress: identifier(node, 'cbc:EndpointID'),
    roleCode: text(node, 'cbc:IndustryClassificationCode'),
    identifiers: all(node, 'cac:PartyIdentification/cbc:ID').map(id => new Identifier({ value: id.content, schemeId: attr(id, 'schemeID') })),
    tradingName: text(node, 'cac:PartyName/cbc:Name'),
    address: address(first(node, 'cac:PostalAddress')),
    vatIdentifier: text(schemes.find(isVatScheme), 'cbc:CompanyID'),
    // BT-32: the writer's scheme is `LOC` (annex A BT-32-2); any non-VAT tax scheme is a tax registration.
    taxRegistrationIdentifier: text(schemes.find(s => !isVatScheme(s)), 'cbc:CompanyID'),
    registrationName: text(legal, 'cbc:RegistrationName'),
    legalRegistrationIdentifier: identifier(legal, 'cbc:CompanyID'),
    legalForm: text(legal, 'cbc:CompanyLegalForm'),
    contact: contact(node),
  }
}

/** The agents, invoicee, billing party and payer (the writer's `extraParty()`). */
function extraParty<T>(node: El | undefined, Type: new (fields: any) => T): T | undefined {
  if (!node)
    return undefined
  const p = party(node)
  return new Type({
    identifiers: p.identifiers,
    name: p.registrationName ?? '',
    roleCode: p.roleCode,
    tradingName: p.tradingName,
    legalRegistrationIdentifier: p.legalRegistrationIdentifier,
    electronicAddress: p.electronicAddress,
    vatIdentifier: p.vatIdentifier,
    address: p.address,
    contact: p.contact,
  })
}

/** Removes and returns BT-90: the first `@schemeID="SEPA"` identifier (UBL-SR-29 compares it upper-cased). */
function takeCreditorIdentifier(identifiers: Identifier[]): string | undefined {
  const index = identifiers.findIndex(i => i.schemeId?.toUpperCase() === SEPA)
  return index < 0 ? undefined : identifiers.splice(index, 1)[0].value
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

function taxAmountCurrency(total: El): string | undefined {
  return attr(first(total, 'cbc:TaxAmount'), 'currencyID')
}

/**
 * The `cac:TaxTotal` holding BT-110 (or the line EXT-FR-FE-181) and the one holding BT-111 (EXT-FR-FE-182), as the
 * writer writes them: the first in the document currency, then one in the VAT accounting currency (BT-6), which
 * has no breakdown. Without BT-6 there is no second one.
 */
function taxTotals(totals: El[], currency: string | undefined, accountingCurrency: string | undefined): [El | undefined, El | undefined] {
  const withBreakdown = totals.find(t => first(t, 'cac:TaxSubtotal'))
  if (accountingCurrency === undefined)
    return [withBreakdown ?? totals[0], undefined]
  const main = accountingCurrency === currency
    ? withBreakdown ?? totals[0]
    : withBreakdown ?? totals.find(t => taxAmountCurrency(t) !== accountingCurrency)
  const accounting = totals.find(t => t !== main && !first(t, 'cac:TaxSubtotal') && taxAmountCurrency(t) === accountingCurrency)
  return [main, accounting]
}

function header(root: El, creditNote: boolean): HeaderFields {
  const number = text(root, 'cbc:ID') ?? ''
  const period = first(root, 'cac:InvoicePeriod')
  const startDate = text(period, 'cbc:StartDate')
  const endDate = text(period, 'cbc:EndDate')
  const order = first(root, 'cac:OrderReference')
  const despatch = first(root, 'cac:DespatchDocumentReference')
  const contract = first(root, 'cac:ContractDocumentReference')
  const documents = all(root, 'cac:AdditionalDocumentReference')
  const typeOf = (d: El): string | undefined => text(d, 'cbc:DocumentTypeCode')
  // A CreditNote has no `cac:ProjectReference`: BT-11 is the additional document of type 50 (UBL-SR-43).
  const project = creditNote ? documents.find(d => typeOf(d) === PROJECT_REFERENCE) : undefined
  return {
    number,
    issueDate: text(root, 'cbc:IssueDate') ?? '',
    typeCode: text(root, creditNote ? 'cbc:CreditNoteTypeCode' : 'cbc:InvoiceTypeCode') ?? '',
    currencyCode: text(root, 'cbc:DocumentCurrencyCode') ?? '',
    vatAccountingCurrencyCode: text(root, 'cbc:TaxCurrencyCode'),
    valueAddedTaxPointDate: text(root, 'cbc:TaxPointDate'),
    valueAddedTaxPointDateCode: text(period, 'cbc:DescriptionCode'),
    // A CreditNote has BT-9 in the first `cac:PaymentMeans` (UBL-SR-45).
    paymentDueDate: creditNote ? text(root, 'cac:PaymentMeans[1]/cbc:PaymentDueDate') : text(root, 'cbc:DueDate'),
    buyerReference: text(root, 'cbc:BuyerReference'),
    projectReference: creditNote ? text(project, 'cbc:ID') : text(root, 'cac:ProjectReference/cbc:ID'),
    // BT-11-0 has no UBL place (CG-59): absent, as `fromCii()` reads the CII default name.
    projectName: undefined,
    contractReference: text(contract, 'cbc:ID'),
    contractCodeType: text(contract, 'cbc:DocumentType'),
    contractDate: text(contract, 'cbc:IssueDate'),
    purchaseOrderReference: text(order, 'cbc:ID'),
    orderDate: text(order, 'cbc:IssueDate'),
    salesOrderReference: text(order, 'cbc:SalesOrderID'),
    receivingAdviceReference: text(root, 'cac:ReceiptDocumentReference/cbc:ID'),
    despatchAdviceReference: text(despatch, 'cbc:ID'),
    despatchAdviceDate: text(despatch, 'cbc:IssueDate'),
    tenderOrLotReference: text(root, 'cac:OriginatorDocumentReference/cbc:ID'),
    invoicedObjectIdentifiers: documents.filter(d => typeOf(d) === INVOICED_OBJECT).map(d => identifier(d, 'cbc:ID') ?? new Identifier({ value: '' })),
    buyerAccountingReference: text(root, 'cbc:AccountingCost'),
    businessProcessType: text(root, 'cbc:ProfileID'),
    specificationIdentifier: text(root, 'cbc:CustomizationID'),
    notes: all(root, 'cbc:Note').map(n => new InvoiceNote(note(n.content))),
    precedingInvoiceReferences: all(root, 'cac:BillingReference/cac:InvoiceDocumentReference').map(d => new PrecedingInvoiceReference({
      reference: text(d, 'cbc:ID') ?? '',
      issueDate: text(d, 'cbc:IssueDate'),
      typeCode: text(d, 'cbc:DocumentTypeCode'),
    })),
    invoicingPeriod: startDate === undefined && endDate === undefined ? undefined : new InvoicingPeriod({ startDate, endDate }),
    // Every other additional document is BG-24; the writer writes it without `cbc:DocumentTypeCode`.
    additionalDocuments: documents.filter(d => typeOf(d) !== INVOICED_OBJECT && d !== project).map((d) => {
      const binary = first(d, 'cac:Attachment/cbc:EmbeddedDocumentBinaryObject')
      return new AdditionalSupportingDocument({
        reference: text(d, 'cbc:ID') ?? '',
        description: text(d, 'cbc:DocumentDescription'),
        externalLocation: text(d, 'cac:Attachment/cac:ExternalReference/cbc:URI'),
        attachedDocument: binary
          ? new AttachedDocument({ content: binary.content, mimeCode: attr(binary, 'mimeCode') ?? '', filename: attr(binary, 'filename') ?? '' })
          : undefined,
      })
    }),
  }
}

function parties(root: El): Pick<InvoiceFields, 'seller' | 'buyer' | 'payee' | 'sellerTaxRepresentative' | 'sellerAgent' | 'billingParty' | 'buyerAgent' | 'invoicee'> & { creditorIdentifier?: string } {
  const sellerNode = first(root, 'cac:AccountingSupplierParty/cac:Party')
  const buyerNode = first(root, 'cac:AccountingCustomerParty/cac:Party')
  const payeeNode = first(root, 'cac:PayeeParty')
  const representativeNode = first(root, 'cac:TaxRepresentativeParty')
  const s = sellerNode ? party(sellerNode) : undefined
  const b = buyerNode ? party(buyerNode) : undefined
  const p = payeeNode ? party(payeeNode) : undefined
  // BT-90 sits in the payee's identifiers when there is a payee, else the seller's (annex A), and only with a
  // `cac:PaymentMeans` to hold BG-19 (`invoiceToUbl()` writes it from the direct debit); else it stays an identifier.
  // With a payee whose identifiers have no `SEPA` one, the seller's is BT-90 too: annex A has both rows, and
  // UBL-SR-29 counts `SEPA` identifiers document-wide. The writer puts BT-90 with the payee (CG-72).
  const creditorIdentifier = first(root, 'cac:PaymentMeans')
    ? takeCreditorIdentifier(p?.identifiers ?? []) ?? takeCreditorIdentifier(s?.identifiers ?? [])
    : undefined
  return {
    creditorIdentifier,
    seller: new Seller({
      identifiers: s?.identifiers ?? [],
      name: s?.registrationName ?? '',
      tradingName: s?.tradingName,
      legalRegistrationIdentifier: s?.legalRegistrationIdentifier,
      additionalLegalInformation: s?.legalForm,
      electronicAddress: s?.electronicAddress,
      vatIdentifier: s?.vatIdentifier,
      taxRegistrationIdentifier: s?.taxRegistrationIdentifier,
      address: s?.address ?? new PostalAddress({ countryCode: '' }),
      contact: s?.contact,
    }),
    buyer: new Buyer({
      identifiers: b?.identifiers ?? [],
      name: b?.registrationName ?? '',
      tradingName: b?.tradingName,
      legalRegistrationIdentifier: b?.legalRegistrationIdentifier,
      electronicAddress: b?.electronicAddress,
      vatIdentifier: b?.vatIdentifier,
      address: b?.address ?? new PostalAddress({ countryCode: '' }),
      contact: b?.contact,
    }),
    // The payee's name is `cac:PartyName` (BT-59); its `cac:PartyLegalEntity` holds BT-61 only.
    payee: p
      ? new Payee({
          identifiers: p.identifiers,
          name: p.tradingName ?? '',
          roleCode: p.roleCode,
          legalRegistrationIdentifier: p.legalRegistrationIdentifier,
          electronicAddress: p.electronicAddress,
          vatIdentifier: p.vatIdentifier,
          address: p.address,
          contact: p.contact,
        })
      : undefined,
    sellerTaxRepresentative: representativeNode
      ? new SellerTaxRepresentative({
          name: text(representativeNode, 'cac:PartyName/cbc:Name') ?? '',
          address: address(first(representativeNode, 'cac:PostalAddress')) ?? new PostalAddress({ countryCode: '' }),
          vatIdentifier: text(all(representativeNode, 'cac:PartyTaxScheme').find(isVatScheme), 'cbc:CompanyID') ?? '',
        })
      : undefined,
    sellerAgent: extraParty(first(sellerNode, 'cac:AgentParty'), SellerAgent),
    billingParty: extraParty(first(sellerNode, 'cac:ServiceProviderParty/cac:Party'), BillingParty),
    buyerAgent: extraParty(first(buyerNode, 'cac:AgentParty'), BuyerAgent),
    invoicee: extraParty(first(buyerNode, 'cac:ServiceProviderParty/cac:Party'), Invoicee),
  }
}

function delivery(root: El): Pick<InvoiceFields, 'delivery' | 'deliveryTerms'> {
  const node = first(root, 'cac:Delivery')
  const name = text(node, 'cac:DeliveryParty/cac:PartyName/cbc:Name')
  const locationIdentifier = identifier(node, 'cac:DeliveryLocation/cbc:ID')
  const deliveryAddress = address(first(node, 'cac:DeliveryLocation/cac:Address'))
  const actualDeliveryDate = text(node, 'cbc:ActualDeliveryDate')
  const terms = first(root, 'cac:DeliveryTerms')
  return {
    delivery: [name, locationIdentifier, deliveryAddress, actualDeliveryDate].some(v => v !== undefined)
      ? new Delivery({ name, locationIdentifier, address: deliveryAddress, actualDeliveryDate })
      : undefined,
    deliveryTerms: terms ? new DeliveryTerms({ deliveryTypeCode: text(terms, 'cbc:ID') ?? '', locationName: text(terms, 'cac:DeliveryLocation/cbc:Name') }) : undefined,
  }
}

/**
 * BG-16 from the `cac:PaymentMeans` the writer writes: one per credit transfer, each repeating BT-81 and BT-83,
 * with BT-82, the card (BG-18), the mandate (BG-19) and a credit note's BT-9 in the first only (UBL-SR-46/-55/-45).
 * A further means whose BT-81 or BT-83 differs from the first is not read: the model has one BG-16 (CG-51), and
 * `dropped` reports it.
 */
function payment(root: El, creditorIdentifier: string | undefined): Pick<InvoiceFields, 'paymentInstructions' | 'payer'> {
  const means = all(root, 'cac:PaymentMeans')
  const head = means[0]
  if (!head)
    return { paymentInstructions: undefined, payer: undefined }
  const code = text(head, 'cbc:PaymentMeansCode')
  const remittance = text(head, 'cbc:PaymentID')
  const creditTransfers = means
    .filter(m => text(m, 'cbc:PaymentMeansCode') === code && text(m, 'cbc:PaymentID') === remittance)
    .flatMap((m) => {
      const account = first(m, 'cac:PayeeFinancialAccount')
      // UBL has one account `cbc:ID`: it is BT-84 (the writer writes BT-84-0 there only without BT-84, CG-64).
      return account
        ? [new CreditTransfer({ paymentAccountIdentifier: text(account, 'cbc:ID'), paymentAccountName: text(account, 'cbc:Name'), paymentServiceProviderIdentifier: text(account, 'cac:FinancialInstitutionBranch/cbc:ID') })]
        : []
    })
  const card = first(head, 'cac:CardAccount')
  const mandate = first(head, 'cac:PaymentMandate')
  const mandateReferenceIdentifier = text(mandate, 'cbc:ID')
  const debitedAccountIdentifier = text(mandate, 'cac:PayerFinancialAccount/cbc:ID')
  const debit = [mandateReferenceIdentifier, creditorIdentifier, debitedAccountIdentifier].some(v => v !== undefined)
  return {
    paymentInstructions: new PaymentInstructions({
      paymentMeansTypeCode: code ?? '',
      paymentMeansText: attr(first(head, 'cbc:PaymentMeansCode'), 'name'),
      remittanceInformation: remittance,
      creditTransfers,
      // BT-87-1 (`cbc:NetworkID`) has no model place: `dropped` reports it, and the writer refuses BG-18 (CG-61).
      card: card ? new PaymentCard({ primaryAccountNumber: text(card, 'cbc:PrimaryAccountNumberID') ?? '', holderName: text(card, 'cbc:HolderName') }) : undefined,
      directDebit: debit ? new DirectDebit({ mandateReferenceIdentifier, bankAssignedCreditorIdentifier: creditorIdentifier, debitedAccountIdentifier }) : undefined,
    }),
    payer: extraParty(first(mandate, 'cac:PayerParty'), Payer),
  }
}

function taxCategory(node: El | undefined): UblTaxCategory {
  return {
    code: text(node, 'cbc:ID'),
    rate: decimal(node, 'cbc:Percent'),
    exemptionReasonCode: text(node, 'cbc:TaxExemptionReasonCode'),
    exemptionReason: text(node, 'cbc:TaxExemptionReason'),
  }
}

/** `cbc:AllowanceChargeReasonCode`: with `@listID="5153"` on a charge it is BT-177 / BT-193, else BT-98 / BT-105 ... */
function reasonCodes(node: El, charge: boolean): { reasonCode?: string, nonVatTaxCode?: string } {
  const element = first(node, 'cbc:AllowanceChargeReasonCode')
  if (charge && element && attr(element, 'listID') === NON_VAT_TAX_LIST)
    return { nonVatTaxCode: element.content }
  return { reasonCode: element?.content }
}

function settlement(root: El, currency: string, accountingCurrency: string | undefined): Pick<InvoiceFields, 'paymentTerms' | 'allowances' | 'charges' | 'vatCurrencyExchange' | 'vatBreakdown' | 'totals'> {
  const allowances: DocumentAllowance[] = []
  const charges: DocumentCharge[] = []
  for (const node of all(root, 'cac:AllowanceCharge')) {
    const charge = isTrue(node, 'cbc:ChargeIndicator')
    const category = taxCategory(first(node, 'cac:TaxCategory'))
    const fields = {
      amount: required(node, 'cbc:Amount'),
      baseAmount: decimal(node, 'cbc:BaseAmount'),
      percentage: decimal(node, 'cbc:MultiplierFactorNumeric'),
      vatCategoryCode: category.code ?? '',
      vatRate: category.rate,
      reason: text(node, 'cbc:AllowanceChargeReason'),
      ...reasonCodes(node, charge),
      vatExemptionReason: category.exemptionReason,
      vatExemptionReasonCode: category.exemptionReasonCode,
    }
    if (charge)
      charges.push(new DocumentCharge(fields))
    else
      allowances.push(new DocumentAllowance(fields))
  }
  const [main, accounting] = taxTotals(all(root, 'cac:TaxTotal'), currency, accountingCurrency)
  const monetary = first(root, 'cac:LegalMonetaryTotal')
  const exchange = first(root, 'cac:TaxExchangeRate')
  return {
    paymentTerms: text(root, 'cac:PaymentTerms/cbc:Note'),
    allowances,
    charges,
    vatCurrencyExchange: exchange
      ? new VatCurrencyExchange({
          sourceCurrencyCode: text(exchange, 'cbc:SourceCurrencyCode') ?? '',
          targetCurrencyCode: text(exchange, 'cbc:TargetCurrencyCode') ?? '',
          exchangeRate: required(exchange, 'cbc:CalculationRate'),
          exchangeRateDate: text(exchange, 'cbc:Date'),
        })
      : undefined,
    vatBreakdown: all(main, 'cac:TaxSubtotal').map((subtotal) => {
      const category = taxCategory(first(subtotal, 'cac:TaxCategory'))
      return new VatBreakdown({
        categoryTaxableAmount: required(subtotal, 'cbc:TaxableAmount'),
        categoryTaxAmount: required(subtotal, 'cbc:TaxAmount'),
        categoryCode: category.code ?? '',
        categoryRate: category.rate,
        exemptionReasonText: category.exemptionReason,
        exemptionReasonCode: category.exemptionReasonCode,
      })
    }),
    totals: new DocumentTotals({
      sumOfInvoiceLineNetAmount: required(monetary, 'cbc:LineExtensionAmount'),
      sumOfAllowancesOnDocumentLevel: decimal(monetary, 'cbc:AllowanceTotalAmount'),
      sumOfChargesOnDocumentLevel: decimal(monetary, 'cbc:ChargeTotalAmount'),
      invoiceTotalAmountWithoutVat: required(monetary, 'cbc:TaxExclusiveAmount'),
      invoiceTotalVatAmount: decimal(main, 'cbc:TaxAmount'),
      invoiceTotalVatAmountInAccountingCurrency: decimal(accounting, 'cbc:TaxAmount'),
      roundingAmount: decimal(monetary, 'cbc:PayableRoundingAmount'),
      invoiceTotalAmountWithVat: required(monetary, 'cbc:TaxInclusiveAmount'),
      paidAmount: decimal(monetary, 'cbc:PrepaidAmount'),
      amountDueForPayment: required(monetary, 'cbc:PayableAmount'),
    }),
  }
}

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

function lineSeller(node: El | undefined): LineSeller | undefined {
  if (!node)
    return undefined
  const p = party(node)
  return new LineSeller({
    identifiers: p.identifiers,
    name: p.registrationName,
    tradingName: p.tradingName,
    legalRegistrationIdentifier: p.legalRegistrationIdentifier,
    electronicAddress: p.electronicAddress,
    vatIdentifier: p.vatIdentifier,
    taxRegistrationIdentifier: p.taxRegistrationIdentifier,
    address: p.address,
  })
}

function price(node: El | undefined): PriceDetails | undefined {
  if (!node)
    return undefined
  const [priceBaseQuantity, priceBaseQuantityUnitCode] = quantity(node, 'cbc:BaseQuantity')
  const discount = all(node, 'cac:AllowanceCharge').find(a => !isTrue(a, 'cbc:ChargeIndicator'))
  const grossPrice = decimal(discount, 'cbc:BaseAmount')
  const priceDiscount = decimal(discount, 'cbc:Amount')
  const priceDiscountReason = text(discount, 'cbc:AllowanceChargeReason')
  const priceDiscountReasonCode = text(discount, 'cbc:AllowanceChargeReasonCode')
  // A gross price without discount is written with a bare zero discount (annex B, CG-62): read back as no discount.
  // A zero discount with a reason (EXT-FR-FE-195) or reason code (EXT-FR-FE-196) is kept, so the reason is not left
  // without its discount (which `invoiceToUbl()` would refuse).
  const bareZero = priceDiscount === 0 && grossPrice !== undefined && priceDiscountReason === undefined && priceDiscountReasonCode === undefined
  return new PriceDetails({
    netPrice: required(node, 'cbc:PriceAmount'),
    priceBaseQuantity,
    priceBaseQuantityUnitCode,
    grossPrice,
    priceDiscount: bareZero ? undefined : priceDiscount,
    priceDiscountReason,
    priceDiscountReasonCode,
  })
}

function lineAllowancesCharges(node: El): { allowances: LineAllowance[], charges: LineCharge[] } {
  const allowances: LineAllowance[] = []
  const charges: LineCharge[] = []
  for (const entry of all(node, 'cac:AllowanceCharge')) {
    const charge = isTrue(entry, 'cbc:ChargeIndicator')
    const fields = {
      amount: required(entry, 'cbc:Amount'),
      baseAmount: decimal(entry, 'cbc:BaseAmount'),
      percentage: decimal(entry, 'cbc:MultiplierFactorNumeric'),
      reason: text(entry, 'cbc:AllowanceChargeReason'),
      ...reasonCodes(entry, charge),
    }
    if (charge)
      charges.push(new LineCharge(fields))
    else
      allowances.push(new LineAllowance(fields))
  }
  return { allowances, charges }
}

function line(node: El, invoiceNumber: string, creditNote: boolean, currency: string, accountingCurrency: string | undefined, level: UblLevel): InvoiceLine {
  const [invoicedQuantity, invoicedQuantityUnitCode] = quantity(node, creditNote ? 'cbc:CreditedQuantity' : 'cbc:InvoicedQuantity')
  const period = first(node, 'cac:InvoicePeriod')
  const startDate = text(period, 'cbc:StartDate')
  const endDate = text(period, 'cbc:EndDate')
  const vatPointDateCode = text(period, 'cbc:DescriptionCode')

  const orderLine = first(node, 'cac:OrderLineReference')
  const order = first(orderLine, 'cac:OrderReference')
  const salesOrderReference = text(order, 'cbc:SalesOrderID')
  const salesOrderLineReference = text(orderLine, 'cbc:SalesOrderLineID')
  const despatch = first(node, 'cac:DespatchLineReference')
  const receipt = first(node, 'cac:ReceiptLineReference')

  // The line status and the parent line sit in the `cac:BillingReference` whose document is BT-1 (annex B
  // UC10 ... UC13, EXTENDED-CTC-FR-UBL); the others are preceding invoice references of the line.
  let status: El | undefined
  const preceding: LinePrecedingInvoiceReference[] = []
  for (const billing of all(node, 'cac:BillingReference')) {
    const document = first(billing, 'cac:InvoiceDocumentReference')
    if (!document)
      continue
    if (!status && text(document, 'cbc:ID') === invoiceNumber) {
      status = billing
      continue
    }
    preceding.push(new LinePrecedingInvoiceReference({
      reference: text(document, 'cbc:ID'),
      lineReference: text(billing, 'cac:BillingReferenceLine/cbc:ID'),
      typeCode: text(document, 'cbc:DocumentTypeCode'),
      issueDate: text(document, 'cbc:IssueDate'),
    }))
  }

  const lineDelivery = first(node, 'cac:Delivery')
  const deliverToIdentifier = identifier(lineDelivery, 'cac:DeliveryLocation/cbc:ID')
  const deliverToAddress = address(first(lineDelivery, 'cac:DeliveryLocation/cac:Address'))
  const deliverToName = text(lineDelivery, 'cac:DeliveryParty/cac:PartyName/cbc:Name')
  const actualDeliveryDate = text(lineDelivery, 'cbc:ActualDeliveryDate')

  const [vatTotal, vatTotalInAccountingCurrency] = taxTotals(all(node, 'cac:TaxTotal'), currency, accountingCurrency)

  const item = first(node, 'cac:Item')
  const [unitsInParentLine, unitsInParentLineUnitCode] = quantity(item, 'cbc:PackQuantity')
  const category = first(item, 'cac:ClassifiedTaxCategory')
  const vat = category ? taxCategory(category) : undefined
  const terms = first(node, 'cac:DeliveryTerms')

  return new InvoiceLine({
    identifier: text(node, 'cbc:ID') ?? '',
    // EN 16931 has no line note subject code: at `en16931` a leading `#code#` is part of BT-127 (CG-70).
    notes: all(node, 'cbc:Note').map(n => new LineNote(level === 'en16931' ? { note: n.content === '' ? undefined : n.content } : note(n.content))),
    parentLineIdentifier: text(status, 'cac:BillingReferenceLine/cbc:ID'),
    statusReasonCode: text(status, 'cac:InvoiceDocumentReference/cbc:DocumentStatusCode'),
    objectIdentifiers: all(node, 'cac:DocumentReference').filter(d => text(d, 'cbc:DocumentTypeCode') === INVOICED_OBJECT).map(d => identifier(d, 'cbc:ID') ?? new Identifier({ value: '' })),
    purchaseOrderLineReference: text(orderLine, 'cbc:LineID'),
    buyerAccountingReference: text(node, 'cbc:AccountingCost'),
    invoicedQuantity,
    invoicedQuantityUnitCode,
    unitsInParentLine,
    unitsInParentLineUnitCode,
    netAmount: required(node, 'cbc:LineExtensionAmount'),
    vatAmount: decimal(vatTotal, 'cbc:TaxAmount'),
    vatAmountInAccountingCurrency: decimal(vatTotalInAccountingCurrency, 'cbc:TaxAmount'),
    period: startDate === undefined && endDate === undefined ? undefined : new LinePeriod({ startDate, endDate }),
    ...lineAllowancesCharges(node),
    price: price(first(node, 'cac:Price')),
    // EXT-FR-FE-180 is the line `cac:InvoicePeriod/cbc:DescriptionCode`, kept with the line VAT information.
    vat: vat || vatPointDateCode !== undefined
      ? new LineVat({ categoryCode: vat?.code, rate: vat?.rate, exemptionReason: vat?.exemptionReason, exemptionReasonCode: vat?.exemptionReasonCode, vatPointDateCode })
      : undefined,
    item: new Item({
      name: text(item, 'cbc:Name') ?? '',
      description: text(item, 'cbc:Description'),
      sellersIdentifier: text(item, 'cac:SellersItemIdentification/cbc:ID'),
      buyersIdentifier: text(item, 'cac:BuyersItemIdentification/cbc:ID'),
      standardIdentifier: identifier(item, 'cac:StandardItemIdentification/cbc:ID'),
      attributes: all(item, 'cac:AdditionalItemProperty').map((property) => {
        const [valueQuantity, valueQuantityUnitCode] = quantity(property, 'cbc:ValueQuantity')
        return new ItemAttribute({ name: text(property, 'cbc:Name') ?? '', value: text(property, 'cbc:Value'), typeCode: text(property, 'cbc:NameCode'), valueQuantity, valueQuantityUnitCode })
      }),
      classifications: all(item, 'cac:CommodityClassification/cbc:ItemClassificationCode').map(c => new ItemClassification({
        code: c.content,
        listId: attr(c, 'listID') ?? '',
        listVersionId: attr(c, 'listVersionID'),
      })),
      countryOfOrigin: text(item, 'cac:OriginCountry/cbc:IdentificationCode'),
    }),
    purchaseOrderReference: text(order, 'cbc:ID'),
    purchaseOrderDate: text(order, 'cbc:IssueDate'),
    sellerOrderReference: salesOrderReference === undefined && salesOrderLineReference === undefined
      ? undefined
      : new LineSellerOrderReference({ orderReference: salesOrderReference, orderLineReference: salesOrderLineReference }),
    despatchAdviceReference: despatch
      ? new LineDespatchAdviceReference({ reference: text(despatch, 'cac:DocumentReference/cbc:ID'), lineReference: text(despatch, 'cbc:LineID'), issueDate: text(despatch, 'cac:DocumentReference/cbc:IssueDate') })
      : undefined,
    receivingAdviceReference: receipt
      ? new LineReceivingAdviceReference({ reference: text(receipt, 'cac:DocumentReference/cbc:ID'), lineReference: text(receipt, 'cbc:LineID') })
      : undefined,
    precedingInvoiceReferences: preceding,
    deliverTo: deliverToIdentifier !== undefined || deliverToAddress !== undefined || deliverToName !== undefined
      ? new LineDeliverTo({ identifiers: deliverToIdentifier ? [deliverToIdentifier] : [], name: deliverToName, address: deliverToAddress })
      : undefined,
    actualDelivery: actualDeliveryDate === undefined ? undefined : new LineActualDelivery({ actualDeliveryDate }),
    seller: lineSeller(first(item, 'cac:ManufacturerParty')),
    deliveryTerms: terms ? new LineDeliveryTerms({ deliveryTypeCode: text(terms, 'cbc:ID') ?? '', locationName: text(terms, 'cac:DeliveryLocation/cbc:Name') }) : undefined,
  })
}

function read(root: El, rootName: UBL_ROOT, level: UblLevel): Invoice {
  const creditNote = rootName === 'CreditNote'
  const head = header(root, creditNote)
  const { creditorIdentifier, ...partyFields } = parties(root)
  const { paymentInstructions, payer } = payment(root, creditorIdentifier)
  return new Invoice({
    ...head,
    ...partyFields,
    ...delivery(root),
    paymentInstructions,
    payer,
    ...settlement(root, head.currencyCode, head.vatAccountingCurrencyCode),
    lines: all(root, creditNote ? 'cac:CreditNoteLine' : 'cac:InvoiceLine').map(l => line(l, head.number, creditNote, head.currencyCode, head.vatAccountingCurrencyCode, level)),
  })
}

/**
 * Read a UBL 2.1 `Invoice` or `CreditNote` into the EN 16931 model: the inverse of `invoiceToUbl()`. Accepts the
 * documents whose `cbc:CustomizationID` (BT-24) names EN 16931 (or a CIUS of it) or EXTENDED-CTC-FR, the levels
 * `invoiceToUbl()` writes. `dropped` lists every source value with no equal counterpart once the invoice is
 * written back as UBL at that level (see `UblToInvoiceResult`), computed by difference like `fromCii()`.
 *
 * An `XmlDocument` passed in stays the caller's (never disposed). Throws for a document that has a DOCTYPE (UBL
 * never uses one; an entity could hide or replace content the reader would then miss), that is not a UBL 2.1
 * Invoice or CreditNote, or whose BT-24 is missing or names another specification. Errors never quote text content;
 * a malformed input passes libxml2's parse error through, which can name elements.
 */
export async function ublToInvoice(xml: string | Buffer | XmlDocument): Promise<UblToInvoiceResult> {
  const owned = !(xml instanceof XmlDocument)
  const doc = xml instanceof XmlDocument ? xml : typeof xml === 'string' ? XmlDocument.fromString(xml) : XmlDocument.fromBuffer(xml)
  try {
    if (inputHasDoctype(xml, doc))
      throw new Error('ublToInvoice: the document has a DOCTYPE; UBL uses none, and its entities could hide or replace content, so it is refused')
    if (!isUblDocument(doc))
      throw new Error('ublToInvoice: not a UBL 2.1 Invoice or CreditNote (root element and namespace)')
    const level = getUblDeclaredLevel(doc)
    if (level === undefined)
      throw new Error('ublToInvoice: cbc:CustomizationID (BT-24) is missing or names no specification this package maps (EN 16931, a CIUS of it without extension, or EXTENDED-CTC-FR)')
    const rootName = doc.root.name as UBL_ROOT
    const invoice = read(doc.root, rootName, level)
    const written = buildUbl(invoice, level, rootName, { lenient: true })
    try {
      return { invoice, dropped: ublDiffPaths(doc, written) }
    }
    finally {
      written.dispose()
    }
  }
  finally {
    if (owned)
      doc.dispose()
  }
}
