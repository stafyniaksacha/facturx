/**
 * CrossIndustryInvoice classes for Factur-X
 * Based on urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100
 */

import type * as qdt from './qualifiedTypes'
import type * as ram from './reusableTypes'
import type * as udt from './unqualifiedTypes'

/**
 * Business context of the invoice, naming the Factur-X guideline (profile) it conforms to and the business process it belongs to.
 * @profile MINIMUM
 */
export class ExchangedDocumentContextType {
  constructor({
    testIndicator,
    businessProcessSpecifiedDocumentContextParameter,
    guidelineSpecifiedDocumentContextParameter,
  }: {
    testIndicator?: udt.IndicatorType
    businessProcessSpecifiedDocumentContextParameter?: ram.DocumentContextParameterType
    guidelineSpecifiedDocumentContextParameter: ram.DocumentContextParameterType
  }) {
    this.testIndicator = testIndicator
    this.businessProcessSpecifiedDocumentContextParameter = businessProcessSpecifiedDocumentContextParameter
    this.guidelineSpecifiedDocumentContextParameter = guidelineSpecifiedDocumentContextParameter
  }

  testIndicator?: udt.IndicatorType
  businessProcessSpecifiedDocumentContextParameter?: ram.DocumentContextParameterType
  guidelineSpecifiedDocumentContextParameter: ram.DocumentContextParameterType
}

/**
 * Document-level header of the invoice: its number, UNTDID 1001 type code, issue date and optional name, notes and language.
 * @profile MINIMUM
 */
export class ExchangedDocumentType {
  constructor({
    id,
    name,
    typeCode,
    issueDateTime,
    copyIndicator,
    languageID,
    includedNote,
    effectiveSpecifiedPeriod,
  }: {
    id: udt.IDType
    name?: udt.TextType
    typeCode: qdt.DocumentCodeType
    issueDateTime: udt.DateTimeType
    copyIndicator?: udt.IndicatorType
    languageID?: udt.IDType[]
    includedNote?: ram.NoteType[]
    effectiveSpecifiedPeriod?: ram.SpecifiedPeriodType
  }) {
    this.id = id
    this.name = name
    this.typeCode = typeCode
    this.issueDateTime = issueDateTime
    this.copyIndicator = copyIndicator
    this.languageID = languageID
    this.includedNote = includedNote
    this.effectiveSpecifiedPeriod = effectiveSpecifiedPeriod
  }

  id: udt.IDType
  name?: udt.TextType
  typeCode: qdt.DocumentCodeType
  issueDateTime: udt.DateTimeType
  copyIndicator?: udt.IndicatorType
  languageID?: udt.IDType[]
  includedNote?: ram.NoteType[]
  effectiveSpecifiedPeriod?: ram.SpecifiedPeriodType
}

/**
 * Document-level trade agreement covering the seller and buyer, their tax representatives and agents, and references to the order, contract, quotation and procuring project.
 * @profile MINIMUM
 */
export class HeaderTradeAgreementType {
  constructor({
    buyerReference,
    sellerTradeParty,
    buyerTradeParty,
    salesAgentTradeParty,
    buyerTaxRepresentativeTradeParty,
    sellerTaxRepresentativeTradeParty,
    productEndUserTradeParty,
    applicableTradeDeliveryTerms,
    sellerOrderReferencedDocument,
    buyerOrderReferencedDocument,
    quotationReferencedDocument,
    contractReferencedDocument,
    additionalReferencedDocument,
    buyerAgentTradeParty,
    specifiedProcuringProject,
    ultimateCustomerOrderReferencedDocument,
  }: {
    buyerReference?: udt.TextType
    sellerTradeParty: ram.TradePartyType
    buyerTradeParty: ram.TradePartyType
    salesAgentTradeParty?: ram.TradePartyType
    buyerTaxRepresentativeTradeParty?: ram.TradePartyType
    sellerTaxRepresentativeTradeParty?: ram.TradePartyType
    productEndUserTradeParty?: ram.TradePartyType
    applicableTradeDeliveryTerms?: ram.TradeDeliveryTermsType
    sellerOrderReferencedDocument?: ram.ReferencedDocumentType
    buyerOrderReferencedDocument?: ram.ReferencedDocumentType
    quotationReferencedDocument?: ram.ReferencedDocumentType
    contractReferencedDocument?: ram.ReferencedDocumentType
    additionalReferencedDocument?: ram.ReferencedDocumentType[]
    buyerAgentTradeParty?: ram.TradePartyType
    specifiedProcuringProject?: ram.ProcuringProjectType
    ultimateCustomerOrderReferencedDocument?: ram.ReferencedDocumentType[]
  }) {
    this.buyerReference = buyerReference
    this.sellerTradeParty = sellerTradeParty
    this.buyerTradeParty = buyerTradeParty
    this.salesAgentTradeParty = salesAgentTradeParty
    this.buyerTaxRepresentativeTradeParty = buyerTaxRepresentativeTradeParty
    this.sellerTaxRepresentativeTradeParty = sellerTaxRepresentativeTradeParty
    this.productEndUserTradeParty = productEndUserTradeParty
    this.applicableTradeDeliveryTerms = applicableTradeDeliveryTerms
    this.sellerOrderReferencedDocument = sellerOrderReferencedDocument
    this.buyerOrderReferencedDocument = buyerOrderReferencedDocument
    this.quotationReferencedDocument = quotationReferencedDocument
    this.contractReferencedDocument = contractReferencedDocument
    this.additionalReferencedDocument = additionalReferencedDocument
    this.buyerAgentTradeParty = buyerAgentTradeParty
    this.specifiedProcuringProject = specifiedProcuringProject
    this.ultimateCustomerOrderReferencedDocument = ultimateCustomerOrderReferencedDocument
  }

  buyerReference?: udt.TextType
  sellerTradeParty: ram.TradePartyType
  buyerTradeParty: ram.TradePartyType
  salesAgentTradeParty?: ram.TradePartyType
  buyerTaxRepresentativeTradeParty?: ram.TradePartyType
  sellerTaxRepresentativeTradeParty?: ram.TradePartyType
  productEndUserTradeParty?: ram.TradePartyType
  applicableTradeDeliveryTerms?: ram.TradeDeliveryTermsType
  sellerOrderReferencedDocument?: ram.ReferencedDocumentType
  buyerOrderReferencedDocument?: ram.ReferencedDocumentType
  quotationReferencedDocument?: ram.ReferencedDocumentType
  contractReferencedDocument?: ram.ReferencedDocumentType
  additionalReferencedDocument?: ram.ReferencedDocumentType[]
  buyerAgentTradeParty?: ram.TradePartyType
  specifiedProcuringProject?: ram.ProcuringProjectType
  ultimateCustomerOrderReferencedDocument?: ram.ReferencedDocumentType[]
}

/**
 * Document-level delivery information stating where and when the goods or services are delivered: ship-to/ship-from parties, the actual delivery event and despatch, receiving and delivery-note references.
 * @profile MINIMUM
 */
export class HeaderTradeDeliveryType {
  constructor({
    relatedSupplyChainConsignment,
    shipToTradeParty,
    ultimateShipToTradeParty,
    shipFromTradeParty,
    actualDeliverySupplyChainEvent,
    despatchAdviceReferencedDocument,
    receivingAdviceReferencedDocument,
    deliveryNoteReferencedDocument,
  }: {
    relatedSupplyChainConsignment?: ram.SupplyChainConsignmentType
    shipToTradeParty?: ram.TradePartyType
    ultimateShipToTradeParty?: ram.TradePartyType
    shipFromTradeParty?: ram.TradePartyType
    actualDeliverySupplyChainEvent?: ram.SupplyChainEventType
    despatchAdviceReferencedDocument?: ram.ReferencedDocumentType
    receivingAdviceReferencedDocument?: ram.ReferencedDocumentType
    deliveryNoteReferencedDocument?: ram.ReferencedDocumentType
  }) {
    this.relatedSupplyChainConsignment = relatedSupplyChainConsignment
    this.shipToTradeParty = shipToTradeParty
    this.ultimateShipToTradeParty = ultimateShipToTradeParty
    this.shipFromTradeParty = shipFromTradeParty
    this.actualDeliverySupplyChainEvent = actualDeliverySupplyChainEvent
    this.despatchAdviceReferencedDocument = despatchAdviceReferencedDocument
    this.receivingAdviceReferencedDocument = receivingAdviceReferencedDocument
    this.deliveryNoteReferencedDocument = deliveryNoteReferencedDocument
  }

  relatedSupplyChainConsignment?: ram.SupplyChainConsignmentType
  shipToTradeParty?: ram.TradePartyType
  ultimateShipToTradeParty?: ram.TradePartyType
  shipFromTradeParty?: ram.TradePartyType
  actualDeliverySupplyChainEvent?: ram.SupplyChainEventType
  despatchAdviceReferencedDocument?: ram.ReferencedDocumentType
  receivingAdviceReferencedDocument?: ram.ReferencedDocumentType
  deliveryNoteReferencedDocument?: ram.ReferencedDocumentType
}

/**
 * Document-level settlement covering invoice and VAT accounting currencies, payee/payer parties, payment means, the VAT breakdown, document-level allowances and charges, payment terms and the monetary totals.
 * @profile MINIMUM
 */
export class HeaderTradeSettlementType {
  constructor({
    creditorReferenceID,
    paymentReference,
    taxCurrencyCode,
    invoiceCurrencyCode,
    invoiceIssuerReference,
    invoicerTradeParty,
    invoiceeTradeParty,
    payeeTradeParty,
    payerTradeParty,
    taxApplicableTradeCurrencyExchange,
    specifiedTradeSettlementPaymentMeans,
    applicableTradeTax,
    billingSpecifiedPeriod,
    specifiedTradeAllowanceCharge,
    specifiedLogisticsServiceCharge,
    specifiedTradePaymentTerms,
    specifiedTradeSettlementHeaderMonetarySummation,
    specifiedFinancialAdjustment,
    invoiceReferencedDocument,
    receivableSpecifiedTradeAccountingAccount,
    specifiedAdvancePayment,
  }: {
    creditorReferenceID?: udt.IDType
    paymentReference?: udt.TextType
    taxCurrencyCode?: qdt.CurrencyCodeType
    invoiceCurrencyCode: qdt.CurrencyCodeType
    invoiceIssuerReference?: udt.TextType
    invoicerTradeParty?: ram.TradePartyType
    invoiceeTradeParty?: ram.TradePartyType
    payeeTradeParty?: ram.TradePartyType
    payerTradeParty?: ram.TradePartyType
    taxApplicableTradeCurrencyExchange?: ram.TradeCurrencyExchangeType
    specifiedTradeSettlementPaymentMeans?: ram.TradeSettlementPaymentMeansType[]
    applicableTradeTax?: ram.TradeTaxType[]
    billingSpecifiedPeriod?: ram.SpecifiedPeriodType
    specifiedTradeAllowanceCharge?: ram.TradeAllowanceChargeType[]
    specifiedLogisticsServiceCharge?: ram.LogisticsServiceChargeType[]
    specifiedTradePaymentTerms?: ram.TradePaymentTermsType[]
    specifiedTradeSettlementHeaderMonetarySummation: ram.TradeSettlementHeaderMonetarySummationType
    specifiedFinancialAdjustment?: ram.FinancialAdjustmentType[]
    invoiceReferencedDocument?: ram.ReferencedDocumentType[]
    receivableSpecifiedTradeAccountingAccount?: ram.TradeAccountingAccountType[]
    specifiedAdvancePayment?: ram.AdvancePaymentType[]
  }) {
    this.creditorReferenceID = creditorReferenceID
    this.paymentReference = paymentReference
    this.taxCurrencyCode = taxCurrencyCode
    this.invoiceCurrencyCode = invoiceCurrencyCode
    this.invoiceIssuerReference = invoiceIssuerReference
    this.invoicerTradeParty = invoicerTradeParty
    this.invoiceeTradeParty = invoiceeTradeParty
    this.payeeTradeParty = payeeTradeParty
    this.payerTradeParty = payerTradeParty
    this.taxApplicableTradeCurrencyExchange = taxApplicableTradeCurrencyExchange
    this.specifiedTradeSettlementPaymentMeans = specifiedTradeSettlementPaymentMeans
    this.applicableTradeTax = applicableTradeTax ?? []
    this.billingSpecifiedPeriod = billingSpecifiedPeriod
    this.specifiedTradeAllowanceCharge = specifiedTradeAllowanceCharge
    this.specifiedLogisticsServiceCharge = specifiedLogisticsServiceCharge
    this.specifiedTradePaymentTerms = specifiedTradePaymentTerms
    this.specifiedTradeSettlementHeaderMonetarySummation = specifiedTradeSettlementHeaderMonetarySummation
    this.specifiedFinancialAdjustment = specifiedFinancialAdjustment
    this.invoiceReferencedDocument = invoiceReferencedDocument
    this.receivableSpecifiedTradeAccountingAccount = receivableSpecifiedTradeAccountingAccount
    this.specifiedAdvancePayment = specifiedAdvancePayment
  }

  creditorReferenceID?: udt.IDType
  paymentReference?: udt.TextType
  taxCurrencyCode?: qdt.CurrencyCodeType
  invoiceCurrencyCode: qdt.CurrencyCodeType
  invoiceIssuerReference?: udt.TextType
  invoicerTradeParty?: ram.TradePartyType
  invoiceeTradeParty?: ram.TradePartyType
  payeeTradeParty?: ram.TradePartyType
  payerTradeParty?: ram.TradePartyType
  taxApplicableTradeCurrencyExchange?: ram.TradeCurrencyExchangeType
  specifiedTradeSettlementPaymentMeans?: ram.TradeSettlementPaymentMeansType[]
  applicableTradeTax: ram.TradeTaxType[]
  billingSpecifiedPeriod?: ram.SpecifiedPeriodType
  specifiedTradeAllowanceCharge?: ram.TradeAllowanceChargeType[]
  specifiedLogisticsServiceCharge?: ram.LogisticsServiceChargeType[]
  specifiedTradePaymentTerms?: ram.TradePaymentTermsType[]
  specifiedTradeSettlementHeaderMonetarySummation: ram.TradeSettlementHeaderMonetarySummationType
  specifiedFinancialAdjustment?: ram.FinancialAdjustmentType[]
  invoiceReferencedDocument?: ram.ReferencedDocumentType[]
  receivableSpecifiedTradeAccountingAccount?: ram.TradeAccountingAccountType[]
  specifiedAdvancePayment?: ram.AdvancePaymentType[]
}

/**
 * The trade transaction bundling the invoice line items with the document-level agreement, delivery and settlement headers.
 * @profile MINIMUM
 */
export class SupplyChainTradeTransactionType {
  constructor({
    includedSupplyChainTradeLineItem,
    applicableHeaderTradeAgreement,
    applicableHeaderTradeDelivery,
    applicableHeaderTradeSettlement,
  }: {
    includedSupplyChainTradeLineItem?: ram.SupplyChainTradeLineItemType[]
    applicableHeaderTradeAgreement: HeaderTradeAgreementType
    applicableHeaderTradeDelivery: HeaderTradeDeliveryType
    applicableHeaderTradeSettlement: HeaderTradeSettlementType
  }) {
    this.includedSupplyChainTradeLineItem = includedSupplyChainTradeLineItem
    this.applicableHeaderTradeAgreement = applicableHeaderTradeAgreement
    this.applicableHeaderTradeDelivery = applicableHeaderTradeDelivery
    this.applicableHeaderTradeSettlement = applicableHeaderTradeSettlement
  }

  includedSupplyChainTradeLineItem?: ram.SupplyChainTradeLineItemType[]
  applicableHeaderTradeAgreement: HeaderTradeAgreementType
  applicableHeaderTradeDelivery: HeaderTradeDeliveryType
  applicableHeaderTradeSettlement: HeaderTradeSettlementType
}

/**
 * Root of a Factur-X / UN/CEFACT CII invoice, bundling the document context, the document header and the trade transaction.
 * @profile MINIMUM
 */
export class CrossIndustryInvoiceType {
  constructor({
    exchangedDocumentContext,
    exchangedDocument,
    supplyChainTradeTransaction,
  }: {
    exchangedDocumentContext: ExchangedDocumentContextType
    exchangedDocument: ExchangedDocumentType
    supplyChainTradeTransaction: SupplyChainTradeTransactionType
  }) {
    this.exchangedDocumentContext = exchangedDocumentContext
    this.exchangedDocument = exchangedDocument
    this.supplyChainTradeTransaction = supplyChainTradeTransaction
  }

  exchangedDocumentContext: ExchangedDocumentContextType
  exchangedDocument: ExchangedDocumentType
  supplyChainTradeTransaction: SupplyChainTradeTransactionType
}
