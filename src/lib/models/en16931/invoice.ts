/**
 * The EN 16931 invoice (BG-0) and its document-level groups.
 *
 * Properties are named after the EN 16931 business terms (`BT-1 Invoice number` → `number`), the
 * `EXT-FR-FE-*` fields of XP Z12-012 EXTENDED-CTC-FR after the English name the Factur-X EXTENDED
 * matrix gives the same element. Cardinality is the wider of EN 16931 and EXTENDED-CTC-FR: a
 * repeatable term is an array, a mandatory one a required property. Dates are ISO `YYYY-MM-DD`
 * strings; codes are strings, checked by the Schematron, not by the type system.
 */

import type { Identifier } from './common'
import type {
  BillingParty,
  Buyer,
  BuyerAgent,
  Delivery,
  DeliveryTerms,
  Invoicee,
  Payee,
  Payer,
  Seller,
  SellerAgent,
  SellerTaxRepresentative,
} from './parties'
import type {
  DocumentAllowance,
  DocumentCharge,
  DocumentTotals,
  PaymentInstructions,
  VatBreakdown,
  VatCurrencyExchange,
} from './settlement'

/**
 * A textual note on the invoice, with the subject it is about.
 * @bg BG-1
 */
export class InvoiceNote {
  constructor({ subjectCode, note }: { subjectCode?: string, note?: string }) {
    this.subjectCode = subjectCode
    this.note = note
  }

  /**
   * Invoice note subject code (UNTDID 4451).
   * @bt BT-21
   */
  subjectCode?: string
  /**
   * Invoice note. Mandatory in EN 16931, optional in EXTENDED-CTC-FR.
   * @bt BT-22
   */
  note?: string
}

/**
 * A reference to an invoice issued before this one (e.g. the invoice a credit note corrects).
 * @bg BG-3
 */
export class PrecedingInvoiceReference {
  constructor({ reference, issueDate, typeCode }: { reference: string, issueDate?: string, typeCode?: string }) {
    this.reference = reference
    this.issueDate = issueDate
    this.typeCode = typeCode
  }

  /**
   * Preceding invoice reference: the number of the preceding invoice.
   * @bt BT-25
   */
  reference: string
  /**
   * Preceding invoice issue date (ISO `YYYY-MM-DD`).
   * @bt BT-26
   */
  issueDate?: string
  /**
   * Preceding invoice type code (UNTDID 1001). EXTENDED-CTC-FR (Factur-X EXTENDED BT-X-555).
   * @ext EXT-FR-FE-02
   */
  typeCode?: string
}

/**
 * The period the invoice covers.
 * @bg BG-14
 */
export class InvoicingPeriod {
  constructor({ startDate, endDate }: { startDate?: string, endDate?: string }) {
    this.startDate = startDate
    this.endDate = endDate
  }

  /**
   * Invoicing period start date (ISO `YYYY-MM-DD`).
   * @bt BT-73
   */
  startDate?: string
  /**
   * Invoicing period end date (ISO `YYYY-MM-DD`).
   * @bt BT-74
   */
  endDate?: string
}

/**
 * A document embedded in the invoice: its base64 content, MIME code and filename (the value and
 * the two attributes of BT-125; the holding property names the terms).
 */
export class AttachedDocument {
  constructor({ content, mimeCode, filename }: { content: string, mimeCode: string, filename: string }) {
    this.content = content
    this.mimeCode = mimeCode
    this.filename = filename
  }

  /** The document, base64 encoded (BT-125). */
  content: string
  /** Its MIME code (BT-125-1). */
  mimeCode: string
  /** Its filename (BT-125-2). */
  filename: string
}

/**
 * A supporting document the invoice refers to or embeds.
 * @bg BG-24
 */
export class AdditionalSupportingDocument {
  constructor({
    reference,
    description,
    externalLocation,
    attachedDocument,
  }: {
    reference: string
    description?: string
    externalLocation?: string
    attachedDocument?: AttachedDocument
  }) {
    this.reference = reference
    this.description = description
    this.externalLocation = externalLocation
    this.attachedDocument = attachedDocument
  }

  /**
   * Supporting document reference.
   * @bt BT-122
   */
  reference: string
  /**
   * Supporting document description.
   * @bt BT-123
   */
  description?: string
  /**
   * External document location (a URL).
   * @bt BT-124
   */
  externalLocation?: string
  /**
   * Attached document (BT-125) with its MIME code (BT-125-1) and filename (BT-125-2).
   * @bt BT-125 BT-125-1 BT-125-2
   */
  attachedDocument?: AttachedDocument
}

/**
 * An EN 16931 invoice or credit note, keyed by business term, for CII (Factur-X / ZUGFeRD) and
 * UBL alike. Built directly, or read from CII with `fromCii()`; written with `toCii()`.
 * @bg BG-0
 */
export class Invoice {
  constructor({
    number,
    issueDate,
    typeCode,
    currencyCode,
    vatAccountingCurrencyCode,
    valueAddedTaxPointDate,
    valueAddedTaxPointDateCode,
    paymentDueDate,
    buyerReference,
    projectReference,
    projectName,
    contractReference,
    contractCodeType,
    contractDate,
    purchaseOrderReference,
    orderDate,
    salesOrderReference,
    receivingAdviceReference,
    despatchAdviceReference,
    despatchAdviceDate,
    tenderOrLotReference,
    invoicedObjectIdentifiers,
    buyerAccountingReference,
    businessProcessType,
    specificationIdentifier,
    notes,
    precedingInvoiceReferences,
    invoicingPeriod,
    additionalDocuments,
    seller,
    buyer,
    payee,
    sellerTaxRepresentative,
    delivery,
    sellerAgent,
    buyerAgent,
    invoicee,
    payer,
    billingParty,
    deliveryTerms,
    paymentTerms,
    paymentInstructions,
    allowances,
    charges,
    totals,
    vatBreakdown,
    vatCurrencyExchange,
  }: {
    number: string
    issueDate: string
    typeCode: string
    currencyCode: string
    vatAccountingCurrencyCode?: string
    valueAddedTaxPointDate?: string
    valueAddedTaxPointDateCode?: string
    paymentDueDate?: string
    buyerReference?: string
    projectReference?: string
    projectName?: string
    contractReference?: string
    contractCodeType?: string
    contractDate?: string
    purchaseOrderReference?: string
    orderDate?: string
    salesOrderReference?: string
    receivingAdviceReference?: string
    despatchAdviceReference?: string
    despatchAdviceDate?: string
    tenderOrLotReference?: string
    invoicedObjectIdentifiers?: Identifier[]
    buyerAccountingReference?: string
    businessProcessType?: string
    specificationIdentifier?: string
    notes?: InvoiceNote[]
    precedingInvoiceReferences?: PrecedingInvoiceReference[]
    invoicingPeriod?: InvoicingPeriod
    additionalDocuments?: AdditionalSupportingDocument[]
    seller: Seller
    buyer: Buyer
    payee?: Payee
    sellerTaxRepresentative?: SellerTaxRepresentative
    delivery?: Delivery
    sellerAgent?: SellerAgent
    buyerAgent?: BuyerAgent
    invoicee?: Invoicee
    payer?: Payer
    billingParty?: BillingParty
    deliveryTerms?: DeliveryTerms
    paymentTerms?: string
    paymentInstructions?: PaymentInstructions
    allowances?: DocumentAllowance[]
    charges?: DocumentCharge[]
    totals: DocumentTotals
    vatBreakdown?: VatBreakdown[]
    vatCurrencyExchange?: VatCurrencyExchange
  }) {
    this.number = number
    this.issueDate = issueDate
    this.typeCode = typeCode
    this.currencyCode = currencyCode
    this.vatAccountingCurrencyCode = vatAccountingCurrencyCode
    this.valueAddedTaxPointDate = valueAddedTaxPointDate
    this.valueAddedTaxPointDateCode = valueAddedTaxPointDateCode
    this.paymentDueDate = paymentDueDate
    this.buyerReference = buyerReference
    this.projectReference = projectReference
    this.projectName = projectName
    this.contractReference = contractReference
    this.contractCodeType = contractCodeType
    this.contractDate = contractDate
    this.purchaseOrderReference = purchaseOrderReference
    this.orderDate = orderDate
    this.salesOrderReference = salesOrderReference
    this.receivingAdviceReference = receivingAdviceReference
    this.despatchAdviceReference = despatchAdviceReference
    this.despatchAdviceDate = despatchAdviceDate
    this.tenderOrLotReference = tenderOrLotReference
    this.invoicedObjectIdentifiers = invoicedObjectIdentifiers ?? []
    this.buyerAccountingReference = buyerAccountingReference
    this.businessProcessType = businessProcessType
    this.specificationIdentifier = specificationIdentifier
    this.notes = notes ?? []
    this.precedingInvoiceReferences = precedingInvoiceReferences ?? []
    this.invoicingPeriod = invoicingPeriod
    this.additionalDocuments = additionalDocuments ?? []
    this.seller = seller
    this.buyer = buyer
    this.payee = payee
    this.sellerTaxRepresentative = sellerTaxRepresentative
    this.delivery = delivery
    this.sellerAgent = sellerAgent
    this.buyerAgent = buyerAgent
    this.invoicee = invoicee
    this.payer = payer
    this.billingParty = billingParty
    this.deliveryTerms = deliveryTerms
    this.paymentTerms = paymentTerms
    this.paymentInstructions = paymentInstructions
    this.allowances = allowances ?? []
    this.charges = charges ?? []
    this.totals = totals
    this.vatBreakdown = vatBreakdown ?? []
    this.vatCurrencyExchange = vatCurrencyExchange
  }

  /**
   * Invoice number. `fromCii()` yields `''` when the document has none; `toCii()` throws on `''`.
   * @bt BT-1
   */
  number: string
  /**
   * Invoice issue date (ISO `YYYY-MM-DD`). `fromCii()` yields `''` when the document has none or it
   * is not a format-102 date (the CII value is then in `dropped`); `toCii()` throws on `''`.
   * @bt BT-2
   */
  issueDate: string
  /**
   * Invoice type code (UNTDID 1001), e.g. `380` commercial invoice, `381` credit note. `fromCii()`
   * yields `''` when the document has none; `toCii()` throws on `''`.
   * @bt BT-3
   */
  typeCode: string
  /**
   * Invoice currency code (ISO 4217). `fromCii()` yields `''` when the document has none;
   * `toCii()` throws on `''`.
   * @bt BT-5
   */
  currencyCode: string
  /**
   * VAT accounting currency code (ISO 4217), when it differs from the invoice currency.
   * @bt BT-6
   */
  vatAccountingCurrencyCode?: string
  /**
   * Value added tax point date (ISO `YYYY-MM-DD`). Mutually exclusive with BT-8 (BR-CO-3).
   * Not in Factur-X BASIC.
   * @bt BT-7
   */
  valueAddedTaxPointDate?: string
  /**
   * Value added tax point date code, from UNTDID 2005 as EN 16931 defines it: `3` invoice date,
   * `35` delivery date, `432` payment date. The CII binding writes the UNTDID 2475 equivalent
   * (`5`, `29`, `72`). Mutually exclusive with BT-7 (BR-CO-3).
   * @bt BT-8
   */
  valueAddedTaxPointDateCode?: string
  /**
   * Payment due date (ISO `YYYY-MM-DD`).
   * @bt BT-9
   */
  paymentDueDate?: string
  /**
   * Buyer reference (e.g. the French public-sector "service exécutant").
   * @bt BT-10
   */
  buyerReference?: string
  /**
   * Project reference. Not in Factur-X BASIC.
   * @bt BT-11
   */
  projectReference?: string
  /**
   * Project name: the name of the project of BT-11, written only with BT-11. A Factur-X sub-term
   * (matrix "Project name", mandatory in CII when BT-11 is present); `toCii()` writes the Factur-X
   * default `Project reference` when unset (appendix EN 16931 p.38).
   * @bt BT-11-0
   */
  projectName?: string
  /**
   * Contract reference.
   * @bt BT-12
   */
  contractReference?: string
  /**
   * Contract code type: the type of the contract of BT-12. EXTENDED-CTC-FR (Factur-X EXTENDED
   * BT-X-405).
   * @ext EXT-FR-FE-01
   */
  contractCodeType?: string
  /**
   * Contract date: the date of the contract of BT-12 (ISO `YYYY-MM-DD`). EXTENDED-CTC-FR
   * (Factur-X EXTENDED BT-X-148).
   * @ext EXT-FR-FE-199
   */
  contractDate?: string
  /**
   * Purchase order reference.
   * @bt BT-13
   */
  purchaseOrderReference?: string
  /**
   * Order date: the date of the purchase order of BT-13 (ISO `YYYY-MM-DD`). EXTENDED-CTC-FR
   * (Factur-X EXTENDED BT-X-147).
   * @ext EXT-FR-FE-197
   */
  orderDate?: string
  /**
   * Sales order reference. Not in Factur-X BASIC.
   * @bt BT-14
   */
  salesOrderReference?: string
  /**
   * Receiving advice reference. Not in Factur-X BASIC.
   * @bt BT-15
   */
  receivingAdviceReference?: string
  /**
   * Despatch advice reference.
   * @bt BT-16
   */
  despatchAdviceReference?: string
  /**
   * Despatch advice date: the date of the despatch advice of BT-16 (ISO `YYYY-MM-DD`).
   * EXTENDED-CTC-FR (Factur-X EXTENDED BT-X-200).
   * @ext EXT-FR-FE-198
   */
  despatchAdviceDate?: string
  /**
   * Tender or lot reference. Not in Factur-X BASIC.
   * @bt BT-17
   */
  tenderOrLotReference?: string
  /**
   * Invoiced object identifiers (BT-18), each with its scheme (BT-18-1, UNTDID 1153). `0..1` in
   * EN 16931, `0..n` in EXTENDED-CTC-FR (FNFE-MPE CTC FR 1.4.0.04 release notes p.3: CII-SR-458 removed). Not in Factur-X
   * BASIC.
   * @bt BT-18 BT-18-1
   */
  invoicedObjectIdentifiers: Identifier[]
  /**
   * Buyer accounting reference.
   * @bt BT-19
   */
  buyerAccountingReference?: string
  /**
   * Business process type (in France, the "cadre de facturation").
   * @bt BT-23
   */
  businessProcessType?: string
  /**
   * Specification identifier, read verbatim by `fromCii()`. `toCii()` writes the identifier of its
   * `level` when this is unset or empty, accepts only that exact Factur-X / EXTENDED-CTC-FR identifier
   * otherwise, and throws on any other (another level, Order-X, a CIUS such as Peppol or XRechnung).
   * @bt BT-24
   */
  specificationIdentifier?: string
  /**
   * Invoice notes.
   * @bg BG-1
   */
  notes: InvoiceNote[]
  /**
   * Preceding invoice references.
   * @bg BG-3
   */
  precedingInvoiceReferences: PrecedingInvoiceReference[]
  /**
   * Invoicing period.
   * @bg BG-14
   */
  invoicingPeriod?: InvoicingPeriod
  /**
   * Additional supporting documents. Not in Factur-X BASIC.
   * @bg BG-24
   */
  additionalDocuments: AdditionalSupportingDocument[]
  /**
   * Seller. `fromCii()` stands in an empty seller (empty name and country) when the document has
   * none; `toCii()` throws on it.
   * @bg BG-4
   */
  seller: Seller
  /**
   * Buyer. `fromCii()` stands in an empty buyer (empty name and country) when the document has
   * none; `toCii()` throws on it.
   * @bg BG-7
   */
  buyer: Buyer
  /**
   * Payee, when different from the seller.
   * @bg BG-10
   */
  payee?: Payee
  /**
   * Seller tax representative.
   * @bg BG-11
   */
  sellerTaxRepresentative?: SellerTaxRepresentative
  /**
   * Delivery information.
   * @bg BG-13
   */
  delivery?: Delivery
  /**
   * Seller agent. EXTENDED-CTC-FR.
   * @ext EXT-FR-FE-BG-03
   */
  sellerAgent?: SellerAgent
  /**
   * Buyer agent. EXTENDED-CTC-FR.
   * @ext EXT-FR-FE-BG-01
   */
  buyerAgent?: BuyerAgent
  /**
   * Invoicee ("adressée à"). EXTENDED-CTC-FR.
   * @ext EXT-FR-FE-BG-04
   */
  invoicee?: Invoicee
  /**
   * Payer of the invoice. EXTENDED-CTC-FR.
   * @ext EXT-FR-FE-BG-02
   */
  payer?: Payer
  /**
   * Billing party ("tiers facturant"). EXTENDED-CTC-FR.
   * @ext EXT-FR-FE-BG-05
   */
  billingParty?: BillingParty
  /**
   * Delivery terms (Incoterms). EXTENDED-CTC-FR.
   * @ext EXT-FR-FE-BG-14
   */
  deliveryTerms?: DeliveryTerms
  /**
   * Payment terms.
   * @bt BT-20
   */
  paymentTerms?: string
  /**
   * Payment instructions.
   * @bg BG-16
   */
  paymentInstructions?: PaymentInstructions
  /**
   * Document level allowances.
   * @bg BG-20
   */
  allowances: DocumentAllowance[]
  /**
   * Document level charges.
   * @bg BG-21
   */
  charges: DocumentCharge[]
  /**
   * Document totals. `fromCii()` stands in `NaN` for a missing mandatory amount; `toCii()` throws on it
   * and on a missing group.
   * @bg BG-22
   */
  totals: DocumentTotals
  /**
   * VAT breakdown, one entry per VAT category (and rate or exemption reason), at least one.
   * @bg BG-23
   */
  vatBreakdown: VatBreakdown[]
  /**
   * VAT currency exchange: the rate BT-111 was converted at (CG-18). EXTENDED-CTC-FR.
   * @bt BT-167 BT-167-1 BT-167-2
   * @ext EXT-FR-FE-192
   */
  vatCurrencyExchange?: VatCurrencyExchange
}
