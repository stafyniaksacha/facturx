/**
 * CrossIndustryInvoice classes for Factur-X
 * Based on urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100
 */

import * as udt from './unqualifiedTypes';
import * as qdt from './qualifiedTypes';
import * as ram from './reusableTypes';

/**
 * Exchanged document context type
 */
export class ExchangedDocumentContextType {
  constructor({
    testIndicator,
    businessProcessSpecifiedDocumentContextParameter,
    guidelineSpecifiedDocumentContextParameter
  }: {
    testIndicator?: udt.IndicatorType;
    businessProcessSpecifiedDocumentContextParameter?: ram.DocumentContextParameterType;
    guidelineSpecifiedDocumentContextParameter: ram.DocumentContextParameterType;
  }) {
    this.testIndicator = testIndicator;
    this.businessProcessSpecifiedDocumentContextParameter = businessProcessSpecifiedDocumentContextParameter;
    this.guidelineSpecifiedDocumentContextParameter = guidelineSpecifiedDocumentContextParameter;
  }

  testIndicator?: udt.IndicatorType;
  businessProcessSpecifiedDocumentContextParameter?: ram.DocumentContextParameterType;
  guidelineSpecifiedDocumentContextParameter: ram.DocumentContextParameterType;
}

/**
 * Exchanged document type
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
    effectiveSpecifiedPeriod
  }: {
    id: udt.IDType;
    name?: udt.TextType;
    typeCode: qdt.DocumentCodeType;
    issueDateTime: udt.DateTimeType;
    copyIndicator?: udt.IndicatorType;
    languageID?: udt.IDType[];
    includedNote?: ram.NoteType[];
    effectiveSpecifiedPeriod?: ram.SpecifiedPeriodType;
  }) {
    this.id = id;
    this.name = name;
    this.typeCode = typeCode;
    this.issueDateTime = issueDateTime;
    this.copyIndicator = copyIndicator;
    this.languageID = languageID;
    this.includedNote = includedNote;
    this.effectiveSpecifiedPeriod = effectiveSpecifiedPeriod;
  }

  id: udt.IDType;
  name?: udt.TextType;
  typeCode: qdt.DocumentCodeType;
  issueDateTime: udt.DateTimeType;
  copyIndicator?: udt.IndicatorType;
  languageID?: udt.IDType[];
  includedNote?: ram.NoteType[];
  effectiveSpecifiedPeriod?: ram.SpecifiedPeriodType;
}

/**
 * Header trade agreement type
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
    ultimateCustomerOrderReferencedDocument
  }: {
    buyerReference?: udt.TextType;
    sellerTradeParty: ram.TradePartyType;
    buyerTradeParty: ram.TradePartyType;
    salesAgentTradeParty?: ram.TradePartyType;
    buyerTaxRepresentativeTradeParty?: ram.TradePartyType;
    sellerTaxRepresentativeTradeParty?: ram.TradePartyType;
    productEndUserTradeParty?: ram.TradePartyType;
    applicableTradeDeliveryTerms?: ram.TradeDeliveryTermsType;
    sellerOrderReferencedDocument?: ram.ReferencedDocumentType;
    buyerOrderReferencedDocument?: ram.ReferencedDocumentType;
    quotationReferencedDocument?: ram.ReferencedDocumentType;
    contractReferencedDocument?: ram.ReferencedDocumentType;
    additionalReferencedDocument?: ram.ReferencedDocumentType[];
    buyerAgentTradeParty?: ram.TradePartyType;
    specifiedProcuringProject?: ram.ProcuringProjectType;
    ultimateCustomerOrderReferencedDocument?: ram.ReferencedDocumentType[];
  }) {
    this.buyerReference = buyerReference;
    this.sellerTradeParty = sellerTradeParty;
    this.buyerTradeParty = buyerTradeParty;
    this.salesAgentTradeParty = salesAgentTradeParty;
    this.buyerTaxRepresentativeTradeParty = buyerTaxRepresentativeTradeParty;
    this.sellerTaxRepresentativeTradeParty = sellerTaxRepresentativeTradeParty;
    this.productEndUserTradeParty = productEndUserTradeParty;
    this.applicableTradeDeliveryTerms = applicableTradeDeliveryTerms;
    this.sellerOrderReferencedDocument = sellerOrderReferencedDocument;
    this.buyerOrderReferencedDocument = buyerOrderReferencedDocument;
    this.quotationReferencedDocument = quotationReferencedDocument;
    this.contractReferencedDocument = contractReferencedDocument;
    this.additionalReferencedDocument = additionalReferencedDocument;
    this.buyerAgentTradeParty = buyerAgentTradeParty;
    this.specifiedProcuringProject = specifiedProcuringProject;
    this.ultimateCustomerOrderReferencedDocument = ultimateCustomerOrderReferencedDocument;
  }

  buyerReference?: udt.TextType;
  sellerTradeParty: ram.TradePartyType;
  buyerTradeParty: ram.TradePartyType;
  salesAgentTradeParty?: ram.TradePartyType;
  buyerTaxRepresentativeTradeParty?: ram.TradePartyType;
  sellerTaxRepresentativeTradeParty?: ram.TradePartyType;
  productEndUserTradeParty?: ram.TradePartyType;
  applicableTradeDeliveryTerms?: ram.TradeDeliveryTermsType;
  sellerOrderReferencedDocument?: ram.ReferencedDocumentType;
  buyerOrderReferencedDocument?: ram.ReferencedDocumentType;
  quotationReferencedDocument?: ram.ReferencedDocumentType;
  contractReferencedDocument?: ram.ReferencedDocumentType;
  additionalReferencedDocument?: ram.ReferencedDocumentType[];
  buyerAgentTradeParty?: ram.TradePartyType;
  specifiedProcuringProject?: ram.ProcuringProjectType;
  ultimateCustomerOrderReferencedDocument?: ram.ReferencedDocumentType[];
}

/**
 * Header trade delivery type
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
    deliveryNoteReferencedDocument
  }: {
    relatedSupplyChainConsignment?: ram.SupplyChainConsignmentType;
    shipToTradeParty?: ram.TradePartyType;
    ultimateShipToTradeParty?: ram.TradePartyType;
    shipFromTradeParty?: ram.TradePartyType;
    actualDeliverySupplyChainEvent?: ram.SupplyChainEventType;
    despatchAdviceReferencedDocument?: ram.ReferencedDocumentType;
    receivingAdviceReferencedDocument?: ram.ReferencedDocumentType;
    deliveryNoteReferencedDocument?: ram.ReferencedDocumentType;
  }) {
    this.relatedSupplyChainConsignment = relatedSupplyChainConsignment;
    this.shipToTradeParty = shipToTradeParty;
    this.ultimateShipToTradeParty = ultimateShipToTradeParty;
    this.shipFromTradeParty = shipFromTradeParty;
    this.actualDeliverySupplyChainEvent = actualDeliverySupplyChainEvent;
    this.despatchAdviceReferencedDocument = despatchAdviceReferencedDocument;
    this.receivingAdviceReferencedDocument = receivingAdviceReferencedDocument;
    this.deliveryNoteReferencedDocument = deliveryNoteReferencedDocument;
  }

  relatedSupplyChainConsignment?: ram.SupplyChainConsignmentType;
  shipToTradeParty?: ram.TradePartyType;
  ultimateShipToTradeParty?: ram.TradePartyType;
  shipFromTradeParty?: ram.TradePartyType;
  actualDeliverySupplyChainEvent?: ram.SupplyChainEventType;
  despatchAdviceReferencedDocument?: ram.ReferencedDocumentType;
  receivingAdviceReferencedDocument?: ram.ReferencedDocumentType;
  deliveryNoteReferencedDocument?: ram.ReferencedDocumentType;
}

/**
 * Header trade settlement type
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
    invoiceReferencedDocument,
    receivableSpecifiedTradeAccountingAccount,
    specifiedAdvancePayment
  }: {
    creditorReferenceID?: udt.IDType;
    paymentReference?: udt.TextType;
    taxCurrencyCode?: qdt.CurrencyCodeType;
    invoiceCurrencyCode: qdt.CurrencyCodeType;
    invoiceIssuerReference?: udt.TextType;
    invoicerTradeParty?: ram.TradePartyType;
    invoiceeTradeParty?: ram.TradePartyType;
    payeeTradeParty?: ram.TradePartyType;
    payerTradeParty?: ram.TradePartyType;
    taxApplicableTradeCurrencyExchange?: ram.TradeCurrencyExchangeType;
    specifiedTradeSettlementPaymentMeans?: ram.TradeSettlementPaymentMeansType[];
    applicableTradeTax: ram.TradeTaxType[];
    billingSpecifiedPeriod?: ram.SpecifiedPeriodType;
    specifiedTradeAllowanceCharge?: ram.TradeAllowanceChargeType[];
    specifiedLogisticsServiceCharge?: ram.LogisticsServiceChargeType[];
    specifiedTradePaymentTerms?: ram.TradePaymentTermsType[];
    specifiedTradeSettlementHeaderMonetarySummation: ram.TradeSettlementHeaderMonetarySummationType;
    invoiceReferencedDocument?: ram.ReferencedDocumentType;
    receivableSpecifiedTradeAccountingAccount?: ram.TradeAccountingAccountType[];
    specifiedAdvancePayment?: ram.AdvancePaymentType[];
  }) {
    this.creditorReferenceID = creditorReferenceID;
    this.paymentReference = paymentReference;
    this.taxCurrencyCode = taxCurrencyCode;
    this.invoiceCurrencyCode = invoiceCurrencyCode;
    this.invoiceIssuerReference = invoiceIssuerReference;
    this.invoicerTradeParty = invoicerTradeParty;
    this.invoiceeTradeParty = invoiceeTradeParty;
    this.payeeTradeParty = payeeTradeParty;
    this.payerTradeParty = payerTradeParty;
    this.taxApplicableTradeCurrencyExchange = taxApplicableTradeCurrencyExchange;
    this.specifiedTradeSettlementPaymentMeans = specifiedTradeSettlementPaymentMeans;
    this.applicableTradeTax = applicableTradeTax;
    this.billingSpecifiedPeriod = billingSpecifiedPeriod;
    this.specifiedTradeAllowanceCharge = specifiedTradeAllowanceCharge;
    this.specifiedLogisticsServiceCharge = specifiedLogisticsServiceCharge;
    this.specifiedTradePaymentTerms = specifiedTradePaymentTerms;
    this.specifiedTradeSettlementHeaderMonetarySummation = specifiedTradeSettlementHeaderMonetarySummation;
    this.invoiceReferencedDocument = invoiceReferencedDocument;
    this.receivableSpecifiedTradeAccountingAccount = receivableSpecifiedTradeAccountingAccount;
    this.specifiedAdvancePayment = specifiedAdvancePayment;
  }

  creditorReferenceID?: udt.IDType;
  paymentReference?: udt.TextType;
  taxCurrencyCode?: qdt.CurrencyCodeType;
  invoiceCurrencyCode: qdt.CurrencyCodeType;
  invoiceIssuerReference?: udt.TextType;
  invoicerTradeParty?: ram.TradePartyType;
  invoiceeTradeParty?: ram.TradePartyType;
  payeeTradeParty?: ram.TradePartyType;
  payerTradeParty?: ram.TradePartyType;
  taxApplicableTradeCurrencyExchange?: ram.TradeCurrencyExchangeType;
  specifiedTradeSettlementPaymentMeans?: ram.TradeSettlementPaymentMeansType[];
  applicableTradeTax: ram.TradeTaxType[];
  billingSpecifiedPeriod?: ram.SpecifiedPeriodType;
  specifiedTradeAllowanceCharge?: ram.TradeAllowanceChargeType[];
  specifiedLogisticsServiceCharge?: ram.LogisticsServiceChargeType[];
  specifiedTradePaymentTerms?: ram.TradePaymentTermsType[];
  specifiedTradeSettlementHeaderMonetarySummation: ram.TradeSettlementHeaderMonetarySummationType;
  invoiceReferencedDocument?: ram.ReferencedDocumentType;
  receivableSpecifiedTradeAccountingAccount?: ram.TradeAccountingAccountType[];
  specifiedAdvancePayment?: ram.AdvancePaymentType[];
}

/**
 * Supply chain trade transaction type
 */
export class SupplyChainTradeTransactionType {
  constructor({
    includedSupplyChainTradeLineItem,
    applicableHeaderTradeAgreement,
    applicableHeaderTradeDelivery,
    applicableHeaderTradeSettlement
  }: {
    includedSupplyChainTradeLineItem: ram.SupplyChainTradeLineItemType[];
    applicableHeaderTradeAgreement: HeaderTradeAgreementType;
    applicableHeaderTradeDelivery: HeaderTradeDeliveryType;
    applicableHeaderTradeSettlement: HeaderTradeSettlementType;
  }) {
    this.includedSupplyChainTradeLineItem = includedSupplyChainTradeLineItem;
    this.applicableHeaderTradeAgreement = applicableHeaderTradeAgreement;
    this.applicableHeaderTradeDelivery = applicableHeaderTradeDelivery;
    this.applicableHeaderTradeSettlement = applicableHeaderTradeSettlement;
  }

  includedSupplyChainTradeLineItem: ram.SupplyChainTradeLineItemType[];
  applicableHeaderTradeAgreement: HeaderTradeAgreementType;
  applicableHeaderTradeDelivery: HeaderTradeDeliveryType;
  applicableHeaderTradeSettlement: HeaderTradeSettlementType;
}

/**
 * Cross industry invoice type - the main class for Factur-X
 */
export class CrossIndustryInvoiceType {
  constructor({
    exchangedDocumentContext,
    exchangedDocument,
    supplyChainTradeTransaction
  }: {
    exchangedDocumentContext: ExchangedDocumentContextType;
    exchangedDocument: ExchangedDocumentType;
    supplyChainTradeTransaction: SupplyChainTradeTransactionType;
  }) {
    this.exchangedDocumentContext = exchangedDocumentContext;
    this.exchangedDocument = exchangedDocument;
    this.supplyChainTradeTransaction = supplyChainTradeTransaction;
  }

  exchangedDocumentContext: ExchangedDocumentContextType;
  exchangedDocument: ExchangedDocumentType;
  supplyChainTradeTransaction: SupplyChainTradeTransactionType;
} 