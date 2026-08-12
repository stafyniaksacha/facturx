import type { XmlElement } from 'libxml2-wasm'
import type { Buffer } from 'node:buffer'
import { XmlDocument } from 'libxml2-wasm'
import {
  CrossIndustryInvoiceType,
  ExchangedDocumentContextType,
  ExchangedDocumentType,
  HeaderTradeAgreementType,
  HeaderTradeDeliveryType,
  HeaderTradeSettlementType,
  SupplyChainTradeTransactionType,
} from '../models/facturx/crossIndustryInvoice'
import * as qdt from '../models/facturx/qualifiedTypes'
import * as ram from '../models/facturx/reusableTypes'
import * as udt from '../models/facturx/unqualifiedTypes'

type NS = Record<string, string>

const NAMESPACES: NS = {
  rsm: 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
  ram: 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
  udt: 'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100',
  qdt: 'urn:un:unece:uncefact:data:standard:QualifiedDataType:100',
}

/**
 * Parse a Factur-X XML string into a CrossIndustryInvoiceType object.
 * Mirrors the converter: every aggregate emitted by invoiceToXml is read back here.
 */
export async function xmlToInvoice(xml: string | Buffer): Promise<CrossIndustryInvoiceType> {
  using doc = XmlDocument.fromString(xml.toString())
  const root = doc.root

  if (!root) {
    throw new Error('Invalid XML: no root element')
  }

  return new CrossIndustryInvoiceType({
    exchangedDocumentContext: parseExchangedDocumentContext(root),
    exchangedDocument: parseExchangedDocument(root),
    supplyChainTradeTransaction: parseSupplyChainTradeTransaction(root),
  })
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function get(node: XmlElement | undefined, xpath: string): XmlElement | undefined {
  if (!node) {
    return undefined
  }
  return (node.get(xpath, NAMESPACES) as XmlElement) ?? undefined
}

function findAll(node: XmlElement | undefined, xpath: string): XmlElement[] {
  if (!node) {
    return []
  }
  return (node.find(xpath, NAMESPACES) as XmlElement[]) ?? []
}

function attr(node: XmlElement | undefined, name: string): string | undefined {
  return node?.attr(name)?.value ?? undefined
}

function textOf(node: XmlElement | undefined): string | undefined {
  const t = node?.content
  return t === undefined || t === '' ? undefined : t
}

function parseID(node: XmlElement | undefined): udt.IDType | undefined {
  if (!node) {
    return undefined
  }
  return new udt.IDType({ value: node.content ?? '', schemeID: attr(node, 'schemeID') })
}

function parseText(node: XmlElement | undefined): udt.TextType | undefined {
  if (!node) {
    return undefined
  }
  return new udt.TextType({ value: node.content ?? '' })
}

function parseCode(node: XmlElement | undefined): udt.CodeType | undefined {
  if (!node) {
    return undefined
  }
  return new udt.CodeType({ value: node.content ?? '', listID: attr(node, 'listID'), listVersionID: attr(node, 'listVersionID') })
}

function parseAmount(node: XmlElement | undefined): udt.AmountType | undefined {
  if (!node) {
    return undefined
  }
  return new udt.AmountType({ value: Number.parseFloat(node.content || '0'), currencyID: attr(node, 'currencyID') })
}

function parseQuantity(node: XmlElement | undefined): udt.QuantityType | undefined {
  if (!node) {
    return undefined
  }
  return new udt.QuantityType({ value: Number.parseFloat(node.content || '0'), unitCode: attr(node, 'unitCode') })
}

function parseMeasure(node: XmlElement | undefined): udt.MeasureType | undefined {
  if (!node) {
    return undefined
  }
  return new udt.MeasureType({ value: Number.parseFloat(node.content || '0'), unitCode: attr(node, 'unitCode') })
}

function parsePercent(node: XmlElement | undefined): udt.PercentType | undefined {
  if (!node) {
    return undefined
  }
  return new udt.PercentType({ value: Number.parseFloat(node.content || '0') })
}

function parseIndicator(node: XmlElement | undefined): udt.IndicatorType | undefined {
  if (!node) {
    return undefined
  }
  return new udt.IndicatorType({ indicator: textOf(get(node, './udt:Indicator')) === 'true' })
}

/** udt:DateTimeString child with a format attribute. */
function parseDateTime(node: XmlElement | undefined): udt.DateTimeType | undefined {
  if (!node) {
    return undefined
  }
  const inner = get(node, './udt:DateTimeString')
  return new udt.DateTimeType({ dateTimeString: inner?.content ?? '', format: attr(inner, 'format') ?? '102' })
}

/** udt:DateString child with a format attribute. */
function parseDate(node: XmlElement | undefined): udt.DateType | undefined {
  if (!node) {
    return undefined
  }
  const inner = get(node, './udt:DateString')
  return new udt.DateType({ dateString: inner?.content ?? '', format: attr(inner, 'format') ?? '102' })
}

/** qdt:DateTimeString child (FormattedDateTimeType). */
function parseFormattedDateTime(node: XmlElement | undefined): qdt.FormattedDateTimeType | undefined {
  if (!node) {
    return undefined
  }
  const inner = get(node, './qdt:DateTimeString')
  return new qdt.FormattedDateTimeType({ dateTimeString: inner?.content ?? '', format: attr(inner, 'format') ?? '208' })
}

function parseBinaryObject(node: XmlElement | undefined): udt.BinaryObjectType | undefined {
  if (!node) {
    return undefined
  }
  return new udt.BinaryObjectType({
    value: node.content ?? '',
    mimeCode: attr(node, 'mimeCode') ?? '',
    filename: attr(node, 'filename') ?? '',
  })
}

// ---------------------------------------------------------------------------
// Document context / document
// ---------------------------------------------------------------------------

function parseExchangedDocumentContext(root: XmlElement): ExchangedDocumentContextType {
  const contextNode = get(root, './rsm:ExchangedDocumentContext')
  if (!contextNode) {
    throw new Error('Invalid XML: no ExchangedDocumentContext element')
  }

  const guidelineID = textOf(get(contextNode, './ram:GuidelineSpecifiedDocumentContextParameter/ram:ID')) ?? ''
  const businessID = textOf(get(contextNode, './ram:BusinessProcessSpecifiedDocumentContextParameter/ram:ID'))

  return new ExchangedDocumentContextType({
    testIndicator: parseIndicator(get(contextNode, './ram:TestIndicator')),
    businessProcessSpecifiedDocumentContextParameter: businessID
      ? new ram.DocumentContextParameterType({ id: new udt.IDType({ value: businessID }) })
      : undefined,
    guidelineSpecifiedDocumentContextParameter: new ram.DocumentContextParameterType({
      id: new udt.IDType({ value: guidelineID }),
    }),
  })
}

function parseExchangedDocument(root: XmlElement): ExchangedDocumentType {
  const node = get(root, './rsm:ExchangedDocument')
  if (!node) {
    throw new Error('Invalid XML: no ExchangedDocument element')
  }

  return new ExchangedDocumentType({
    id: new udt.IDType({ value: textOf(get(node, './ram:ID')) ?? '' }),
    name: parseText(get(node, './ram:Name')),
    typeCode: new qdt.DocumentCodeType({ value: textOf(get(node, './ram:TypeCode')) ?? '' }),
    issueDateTime: parseDateTime(get(node, './ram:IssueDateTime')) ?? new udt.DateTimeType({ dateTimeString: '', format: '102' }),
    copyIndicator: parseIndicator(get(node, './ram:CopyIndicator')),
    languageID: findAll(node, './ram:LanguageID').map(n => parseID(n)!).filter(Boolean),
    includedNote: findAll(node, './ram:IncludedNote').map(parseNote),
    effectiveSpecifiedPeriod: parseSpecifiedPeriod(get(node, './ram:EffectiveSpecifiedPeriod')),
  })
}

function parseNote(node: XmlElement): ram.NoteType {
  return new ram.NoteType({
    contentCode: parseCode(get(node, './ram:ContentCode')),
    content: parseText(get(node, './ram:Content')) ?? new udt.TextType({ value: '' }),
    subjectCode: parseCode(get(node, './ram:SubjectCode')),
  })
}

function parseSpecifiedPeriod(node: XmlElement | undefined): ram.SpecifiedPeriodType | undefined {
  if (!node) {
    return undefined
  }
  return new ram.SpecifiedPeriodType({
    description: parseText(get(node, './ram:Description')),
    startDateTime: parseDateTime(get(node, './ram:StartDateTime')),
    endDateTime: parseDateTime(get(node, './ram:EndDateTime')),
    completeDateTime: parseDateTime(get(node, './ram:CompleteDateTime')),
  })
}

// ---------------------------------------------------------------------------
// Transaction
// ---------------------------------------------------------------------------

function parseSupplyChainTradeTransaction(root: XmlElement): SupplyChainTradeTransactionType {
  const node = get(root, './rsm:SupplyChainTradeTransaction')
  if (!node) {
    throw new Error('Invalid XML: no SupplyChainTradeTransaction element')
  }

  return new SupplyChainTradeTransactionType({
    includedSupplyChainTradeLineItem: findAll(node, './ram:IncludedSupplyChainTradeLineItem').map(parseLineItem),
    applicableHeaderTradeAgreement: parseHeaderTradeAgreement(node),
    applicableHeaderTradeDelivery: parseHeaderTradeDelivery(node),
    applicableHeaderTradeSettlement: parseHeaderTradeSettlement(node),
  })
}

// ---------------------------------------------------------------------------
// Line items
// ---------------------------------------------------------------------------

function parseLineItem(node: XmlElement): ram.SupplyChainTradeLineItemType {
  const docLine = get(node, './ram:AssociatedDocumentLineDocument')
  const lineSettlement = get(node, './ram:SpecifiedLineTradeSettlement')

  return new ram.SupplyChainTradeLineItemType({
    associatedDocumentLineDocument: new ram.DocumentLineDocumentType({
      lineID: new udt.IDType({ value: textOf(get(docLine, './ram:LineID')) ?? '' }),
      parentLineID: parseID(get(docLine, './ram:ParentLineID')),
      lineStatusCode: textOf(get(docLine, './ram:LineStatusCode'))
        ? new qdt.LineStatusCodeType({ value: textOf(get(docLine, './ram:LineStatusCode'))! })
        : undefined,
      lineStatusReasonCode: parseCode(get(docLine, './ram:LineStatusReasonCode')),
      includedNote: findAll(docLine, './ram:IncludedNote').map(parseNote),
    }),
    specifiedTradeProduct: parseTradeProduct(get(node, './ram:SpecifiedTradeProduct')),
    specifiedLineTradeAgreement: parseLineTradeAgreement(get(node, './ram:SpecifiedLineTradeAgreement')),
    specifiedLineTradeDelivery: parseLineTradeDelivery(get(node, './ram:SpecifiedLineTradeDelivery')),
    specifiedLineTradeSettlement: parseLineTradeSettlement(lineSettlement),
  })
}

function parseTradeProduct(node: XmlElement | undefined): ram.TradeProductType {
  if (!node) {
    return new ram.TradeProductType({ name: new udt.TextType({ value: '' }) })
  }
  return new ram.TradeProductType({
    id: parseID(get(node, './ram:ID')),
    globalID: parseID(get(node, './ram:GlobalID')),
    sellerAssignedID: parseID(get(node, './ram:SellerAssignedID')),
    buyerAssignedID: parseID(get(node, './ram:BuyerAssignedID')),
    industryAssignedID: parseID(get(node, './ram:IndustryAssignedID')),
    modelID: parseID(get(node, './ram:ModelID')),
    name: parseText(get(node, './ram:Name')) ?? new udt.TextType({ value: '' }),
    description: parseText(get(node, './ram:Description')),
    batchID: findAll(node, './ram:BatchID').map(n => parseID(n)!),
    brandName: parseText(get(node, './ram:BrandName')),
    modelName: parseText(get(node, './ram:ModelName')),
    applicableProductCharacteristic: findAll(node, './ram:ApplicableProductCharacteristic').map(c => new ram.ProductCharacteristicType({
      typeCode: parseCode(get(c, './ram:TypeCode')),
      description: parseText(get(c, './ram:Description')) ?? new udt.TextType({ value: '' }),
      valueMeasure: parseMeasure(get(c, './ram:ValueMeasure')),
      value: parseText(get(c, './ram:Value')) ?? new udt.TextType({ value: '' }),
    })),
    designatedProductClassification: findAll(node, './ram:DesignatedProductClassification').map(c => new ram.ProductClassificationType({
      classCode: parseCode(get(c, './ram:ClassCode')),
      className: parseText(get(c, './ram:ClassName')),
    })),
    originTradeCountry: textOf(get(node, './ram:OriginTradeCountry/ram:ID'))
      ? new ram.TradeCountryType({ id: new qdt.CountryIDType({ value: textOf(get(node, './ram:OriginTradeCountry/ram:ID'))! }) })
      : undefined,
    manufacturerTradeParty: parseTradeParty(get(node, './ram:ManufacturerTradeParty')),
  })
}

function parseLineTradeAgreement(node: XmlElement | undefined): ram.LineTradeAgreementType | undefined {
  if (!node) {
    return undefined
  }
  return new ram.LineTradeAgreementType({
    applicableTradeDeliveryTerms: parseTradeDeliveryTerms(get(node, './ram:ApplicableTradeDeliveryTerms')),
    sellerOrderReferencedDocument: parseReferencedDocument(get(node, './ram:SellerOrderReferencedDocument')),
    buyerOrderReferencedDocument: parseReferencedDocument(get(node, './ram:BuyerOrderReferencedDocument')),
    quotationReferencedDocument: parseReferencedDocument(get(node, './ram:QuotationReferencedDocument')),
    contractReferencedDocument: parseReferencedDocument(get(node, './ram:ContractReferencedDocument')),
    additionalReferencedDocument: findAll(node, './ram:AdditionalReferencedDocument').map(n => parseReferencedDocument(n)!),
    grossPriceProductTradePrice: parseTradePrice(get(node, './ram:GrossPriceProductTradePrice')),
    netPriceProductTradePrice: parseTradePrice(get(node, './ram:NetPriceProductTradePrice')),
    itemSellerTradeParty: parseTradeParty(get(node, './ram:ItemSellerTradeParty')),
    ultimateCustomerOrderReferencedDocument: findAll(node, './ram:UltimateCustomerOrderReferencedDocument').map(n => parseReferencedDocument(n)!),
  })
}

function parseTradePrice(node: XmlElement | undefined): ram.TradePriceType | undefined {
  if (!node) {
    return undefined
  }
  return new ram.TradePriceType({
    chargeAmount: parseAmount(get(node, './ram:ChargeAmount')) ?? new udt.AmountType({ value: 0 }),
    basisQuantity: parseQuantity(get(node, './ram:BasisQuantity')),
    appliedTradeAllowanceCharge: findAll(node, './ram:AppliedTradeAllowanceCharge').map(parseAllowanceCharge),
    includedTradeTax: get(node, './ram:IncludedTradeTax') ? parseTradeTax(get(node, './ram:IncludedTradeTax')!) : undefined,
  })
}

function parseLineTradeDelivery(node: XmlElement | undefined): ram.LineTradeDeliveryType | undefined {
  if (!node) {
    return undefined
  }
  return new ram.LineTradeDeliveryType({
    billedQuantity: parseQuantity(get(node, './ram:BilledQuantity')),
    chargeFreeQuantity: parseQuantity(get(node, './ram:ChargeFreeQuantity')),
    packageQuantity: parseQuantity(get(node, './ram:PackageQuantity')),
    perPackageUnitQuantity: parseQuantity(get(node, './ram:PerPackageUnitQuantity')),
    shipToTradeParty: parseTradeParty(get(node, './ram:ShipToTradeParty')),
    ultimateShipToTradeParty: parseTradeParty(get(node, './ram:UltimateShipToTradeParty')),
    actualDeliverySupplyChainEvent: parseSupplyChainEvent(get(node, './ram:ActualDeliverySupplyChainEvent')),
    despatchAdviceReferencedDocument: parseReferencedDocument(get(node, './ram:DespatchAdviceReferencedDocument')),
    receivingAdviceReferencedDocument: parseReferencedDocument(get(node, './ram:ReceivingAdviceReferencedDocument')),
    deliveryNoteReferencedDocument: parseReferencedDocument(get(node, './ram:DeliveryNoteReferencedDocument')),
  })
}

function parseLineTradeSettlement(node: XmlElement | undefined): ram.LineTradeSettlementType {
  if (!node) {
    return new ram.LineTradeSettlementType({ applicableTradeTax: [] })
  }
  const sum = get(node, './ram:SpecifiedTradeSettlementLineMonetarySummation')
  return new ram.LineTradeSettlementType({
    applicableTradeTax: findAll(node, './ram:ApplicableTradeTax').map(parseTradeTax),
    billingSpecifiedPeriod: parseSpecifiedPeriod(get(node, './ram:BillingSpecifiedPeriod')),
    specifiedTradeAllowanceCharge: findAll(node, './ram:SpecifiedTradeAllowanceCharge').map(parseAllowanceCharge),
    specifiedTradeSettlementLineMonetarySummation: sum
      ? new ram.TradeSettlementLineMonetarySummationType({
          lineTotalAmount: parseAmount(get(sum, './ram:LineTotalAmount')) ?? new udt.AmountType({ value: 0 }),
          chargeTotalAmount: parseAmount(get(sum, './ram:ChargeTotalAmount')),
          allowanceTotalAmount: parseAmount(get(sum, './ram:AllowanceTotalAmount')),
          taxTotalAmount: parseAmount(get(sum, './ram:TaxTotalAmount')),
          grandTotalAmount: parseAmount(get(sum, './ram:GrandTotalAmount')),
          totalAllowanceChargeAmount: parseAmount(get(sum, './ram:TotalAllowanceChargeAmount')),
        })
      : undefined,
    invoiceReferencedDocument: parseReferencedDocument(get(node, './ram:InvoiceReferencedDocument')),
    additionalReferencedDocument: findAll(node, './ram:AdditionalReferencedDocument').map(n => parseReferencedDocument(n)!),
    receivableSpecifiedTradeAccountingAccount: findAll(node, './ram:ReceivableSpecifiedTradeAccountingAccount').map(parseAccountingAccount),
  })
}

// ---------------------------------------------------------------------------
// Header agreement / delivery / settlement
// ---------------------------------------------------------------------------

function parseHeaderTradeAgreement(node: XmlElement): HeaderTradeAgreementType {
  const agreement = get(node, './ram:ApplicableHeaderTradeAgreement')
  if (!agreement) {
    throw new Error('Invalid XML: no ApplicableHeaderTradeAgreement element')
  }

  return new HeaderTradeAgreementType({
    buyerReference: parseText(get(agreement, './ram:BuyerReference')),
    sellerTradeParty: parseTradeParty(get(agreement, './ram:SellerTradeParty'))!,
    buyerTradeParty: parseTradeParty(get(agreement, './ram:BuyerTradeParty'))!,
    salesAgentTradeParty: parseTradeParty(get(agreement, './ram:SalesAgentTradeParty')),
    buyerTaxRepresentativeTradeParty: parseTradeParty(get(agreement, './ram:BuyerTaxRepresentativeTradeParty')),
    sellerTaxRepresentativeTradeParty: parseTradeParty(get(agreement, './ram:SellerTaxRepresentativeTradeParty')),
    productEndUserTradeParty: parseTradeParty(get(agreement, './ram:ProductEndUserTradeParty')),
    applicableTradeDeliveryTerms: parseTradeDeliveryTerms(get(agreement, './ram:ApplicableTradeDeliveryTerms')),
    sellerOrderReferencedDocument: parseReferencedDocument(get(agreement, './ram:SellerOrderReferencedDocument')),
    buyerOrderReferencedDocument: parseReferencedDocument(get(agreement, './ram:BuyerOrderReferencedDocument')),
    quotationReferencedDocument: parseReferencedDocument(get(agreement, './ram:QuotationReferencedDocument')),
    contractReferencedDocument: parseReferencedDocument(get(agreement, './ram:ContractReferencedDocument')),
    additionalReferencedDocument: findAll(agreement, './ram:AdditionalReferencedDocument').map(n => parseReferencedDocument(n)!),
    buyerAgentTradeParty: parseTradeParty(get(agreement, './ram:BuyerAgentTradeParty')),
    specifiedProcuringProject: get(agreement, './ram:SpecifiedProcuringProject')
      ? new ram.ProcuringProjectType({
          id: new udt.IDType({ value: textOf(get(agreement, './ram:SpecifiedProcuringProject/ram:ID')) ?? '' }),
          name: new udt.TextType({ value: textOf(get(agreement, './ram:SpecifiedProcuringProject/ram:Name')) ?? '' }),
        })
      : undefined,
    ultimateCustomerOrderReferencedDocument: findAll(agreement, './ram:UltimateCustomerOrderReferencedDocument').map(n => parseReferencedDocument(n)!),
  })
}

function parseHeaderTradeDelivery(node: XmlElement): HeaderTradeDeliveryType {
  const delivery = get(node, './ram:ApplicableHeaderTradeDelivery')
  if (!delivery) {
    return new HeaderTradeDeliveryType({})
  }
  return new HeaderTradeDeliveryType({
    shipToTradeParty: parseTradeParty(get(delivery, './ram:ShipToTradeParty')),
    ultimateShipToTradeParty: parseTradeParty(get(delivery, './ram:UltimateShipToTradeParty')),
    shipFromTradeParty: parseTradeParty(get(delivery, './ram:ShipFromTradeParty')),
    actualDeliverySupplyChainEvent: parseSupplyChainEvent(get(delivery, './ram:ActualDeliverySupplyChainEvent')),
    despatchAdviceReferencedDocument: parseReferencedDocument(get(delivery, './ram:DespatchAdviceReferencedDocument')),
    receivingAdviceReferencedDocument: parseReferencedDocument(get(delivery, './ram:ReceivingAdviceReferencedDocument')),
    deliveryNoteReferencedDocument: parseReferencedDocument(get(delivery, './ram:DeliveryNoteReferencedDocument')),
  })
}

function parseSupplyChainEvent(node: XmlElement | undefined): ram.SupplyChainEventType | undefined {
  if (!node) {
    return undefined
  }
  const dt = parseDateTime(get(node, './ram:OccurrenceDateTime'))
  if (!dt) {
    return undefined
  }
  return new ram.SupplyChainEventType({ occurrenceDateTime: dt })
}

function parseHeaderTradeSettlement(node: XmlElement): HeaderTradeSettlementType {
  const settlement = get(node, './ram:ApplicableHeaderTradeSettlement')
  if (!settlement) {
    throw new Error('Invalid XML: no ApplicableHeaderTradeSettlement element')
  }

  const currency = textOf(get(settlement, './ram:InvoiceCurrencyCode')) ?? 'EUR'
  const sum = get(settlement, './ram:SpecifiedTradeSettlementHeaderMonetarySummation')

  return new HeaderTradeSettlementType({
    creditorReferenceID: parseID(get(settlement, './ram:CreditorReferenceID')),
    paymentReference: parseText(get(settlement, './ram:PaymentReference')),
    taxCurrencyCode: textOf(get(settlement, './ram:TaxCurrencyCode'))
      ? new qdt.CurrencyCodeType({ value: textOf(get(settlement, './ram:TaxCurrencyCode'))! })
      : undefined,
    invoiceCurrencyCode: new qdt.CurrencyCodeType({ value: currency }),
    invoiceIssuerReference: parseText(get(settlement, './ram:InvoiceIssuerReference')),
    invoicerTradeParty: parseTradeParty(get(settlement, './ram:InvoicerTradeParty')),
    invoiceeTradeParty: parseTradeParty(get(settlement, './ram:InvoiceeTradeParty')),
    payeeTradeParty: parseTradeParty(get(settlement, './ram:PayeeTradeParty')),
    payerTradeParty: parseTradeParty(get(settlement, './ram:PayerTradeParty')),
    specifiedTradeSettlementPaymentMeans: findAll(settlement, './ram:SpecifiedTradeSettlementPaymentMeans').map(parsePaymentMeans),
    applicableTradeTax: findAll(settlement, './ram:ApplicableTradeTax').map(parseTradeTax),
    billingSpecifiedPeriod: parseSpecifiedPeriod(get(settlement, './ram:BillingSpecifiedPeriod')),
    specifiedTradeAllowanceCharge: findAll(settlement, './ram:SpecifiedTradeAllowanceCharge').map(parseAllowanceCharge),
    specifiedTradePaymentTerms: findAll(settlement, './ram:SpecifiedTradePaymentTerms').map(parsePaymentTerms),
    specifiedTradeSettlementHeaderMonetarySummation: parseHeaderMonetarySummation(sum, currency),
    specifiedFinancialAdjustment: findAll(settlement, './ram:SpecifiedFinancialAdjustment').map(a => new ram.FinancialAdjustmentType({
      reason: parseText(get(a, './ram:Reason')) ?? new udt.TextType({ value: '' }),
      actualAmount: parseAmount(get(a, './ram:ActualAmount')) ?? new udt.AmountType({ value: 0 }),
    })),
    invoiceReferencedDocument: findAll(settlement, './ram:InvoiceReferencedDocument').map(n => parseReferencedDocument(n)!),
    receivableSpecifiedTradeAccountingAccount: findAll(settlement, './ram:ReceivableSpecifiedTradeAccountingAccount').map(parseAccountingAccount),
  })
}

function parseHeaderMonetarySummation(node: XmlElement | undefined, currency: string): ram.TradeSettlementHeaderMonetarySummationType {
  const zero = (): udt.AmountType => new udt.AmountType({ value: 0, currencyID: currency })
  if (!node) {
    return new ram.TradeSettlementHeaderMonetarySummationType({
      taxBasisTotalAmount: zero(),
      grandTotalAmount: zero(),
      duePayableAmount: zero(),
    })
  }
  return new ram.TradeSettlementHeaderMonetarySummationType({
    lineTotalAmount: parseAmount(get(node, './ram:LineTotalAmount')),
    chargeTotalAmount: parseAmount(get(node, './ram:ChargeTotalAmount')),
    allowanceTotalAmount: parseAmount(get(node, './ram:AllowanceTotalAmount')),
    taxBasisTotalAmount: parseAmount(get(node, './ram:TaxBasisTotalAmount')) ?? zero(),
    taxTotalAmount: findAll(node, './ram:TaxTotalAmount').map(n => parseAmount(n)!),
    roundingAmount: parseAmount(get(node, './ram:RoundingAmount')),
    grandTotalAmount: parseAmount(get(node, './ram:GrandTotalAmount')) ?? zero(),
    totalPrepaidAmount: parseAmount(get(node, './ram:TotalPrepaidAmount')),
    duePayableAmount: parseAmount(get(node, './ram:DuePayableAmount')) ?? zero(),
  })
}

// ---------------------------------------------------------------------------
// Shared aggregates
// ---------------------------------------------------------------------------

function parseTradeParty(node: XmlElement | undefined): ram.TradePartyType | undefined {
  if (!node) {
    return undefined
  }
  const legalOrg = get(node, './ram:SpecifiedLegalOrganization')
  return new ram.TradePartyType({
    id: findAll(node, './ram:ID').map(n => parseID(n)!),
    globalID: findAll(node, './ram:GlobalID').map(n => parseID(n)!),
    name: parseText(get(node, './ram:Name')),
    roleCode: textOf(get(node, './ram:RoleCode')) ? new qdt.PartyRoleCodeType({ value: textOf(get(node, './ram:RoleCode'))! }) : undefined,
    description: parseText(get(node, './ram:Description')),
    specifiedLegalOrganization: legalOrg
      ? new ram.LegalOrganizationType({
          id: parseID(get(legalOrg, './ram:ID')),
          tradingBusinessName: parseText(get(legalOrg, './ram:TradingBusinessName')),
          postalTradeAddress: parseTradeAddress(get(legalOrg, './ram:PostalTradeAddress')),
        })
      : undefined,
    definedTradeContact: findAll(node, './ram:DefinedTradeContact').map(parseTradeContact),
    postalTradeAddress: parseTradeAddress(get(node, './ram:PostalTradeAddress')),
    uriUniversalCommunication: parseUniversalCommunication(get(node, './ram:URIUniversalCommunication')),
    specifiedTaxRegistration: findAll(node, './ram:SpecifiedTaxRegistration').map(t => new ram.TaxRegistrationType({
      id: new udt.IDType({
        value: textOf(get(t, './ram:ID')) ?? '',
        schemeID: attr(get(t, './ram:ID'), 'schemeID'),
      }),
    })),
  })
}

function parseTradeContact(node: XmlElement): ram.TradeContactType {
  return new ram.TradeContactType({
    personName: parseText(get(node, './ram:PersonName')),
    departmentName: parseText(get(node, './ram:DepartmentName')),
    typeCode: textOf(get(node, './ram:TypeCode')) ? new qdt.ContactTypeCodeType({ value: textOf(get(node, './ram:TypeCode'))! }) : undefined,
    telephoneUniversalCommunication: parseUniversalCommunication(get(node, './ram:TelephoneUniversalCommunication')),
    faxUniversalCommunication: parseUniversalCommunication(get(node, './ram:FaxUniversalCommunication')),
    emailURIUniversalCommunication: parseUniversalCommunication(get(node, './ram:EmailURIUniversalCommunication')),
  })
}

function parseUniversalCommunication(node: XmlElement | undefined): ram.UniversalCommunicationType | undefined {
  if (!node) {
    return undefined
  }
  return new ram.UniversalCommunicationType({
    uriID: parseID(get(node, './ram:URIID')),
    completeNumber: parseText(get(node, './ram:CompleteNumber')),
  })
}

function parseTradeAddress(node: XmlElement | undefined): ram.TradeAddressType | undefined {
  if (!node) {
    return undefined
  }
  return new ram.TradeAddressType({
    postcodeCode: parseCode(get(node, './ram:PostcodeCode')),
    lineOne: parseText(get(node, './ram:LineOne')),
    lineTwo: parseText(get(node, './ram:LineTwo')),
    lineThree: parseText(get(node, './ram:LineThree')),
    cityName: parseText(get(node, './ram:CityName')),
    countryID: new qdt.CountryIDType({ value: textOf(get(node, './ram:CountryID')) ?? '' }),
    countrySubDivisionName: findAll(node, './ram:CountrySubDivisionName').map(n => parseText(n)!),
  })
}

function parseTradeDeliveryTerms(node: XmlElement | undefined): ram.TradeDeliveryTermsType | undefined {
  if (!node) {
    return undefined
  }
  const loc = get(node, './ram:RelevantTradeLocation')
  return new ram.TradeDeliveryTermsType({
    deliveryTypeCode: new qdt.DeliveryTermsCodeType({ value: textOf(get(node, './ram:DeliveryTypeCode')) ?? '' }),
    relevantTradeLocation: loc
      ? new ram.TradeLocationType({
          countryID: textOf(get(loc, './ram:CountryID')) ? new qdt.CountryIDType({ value: textOf(get(loc, './ram:CountryID'))! }) : undefined,
          name: parseText(get(loc, './ram:Name')),
        })
      : undefined,
  })
}

function parseTradeTax(node: XmlElement): ram.TradeTaxType {
  return new ram.TradeTaxType({
    calculatedAmount: parseAmount(get(node, './ram:CalculatedAmount')),
    typeCode: textOf(get(node, './ram:TypeCode')) ? new qdt.TaxTypeCodeType({ value: textOf(get(node, './ram:TypeCode'))! }) : undefined,
    exemptionReason: parseText(get(node, './ram:ExemptionReason')),
    basisAmount: parseAmount(get(node, './ram:BasisAmount')),
    lineTotalBasisAmount: parseAmount(get(node, './ram:LineTotalBasisAmount')),
    allowanceChargeBasisAmount: parseAmount(get(node, './ram:AllowanceChargeBasisAmount')),
    categoryCode: new qdt.TaxCategoryCodeType({ value: textOf(get(node, './ram:CategoryCode')) ?? '' }),
    exemptionReasonCode: parseCode(get(node, './ram:ExemptionReasonCode')),
    taxPointDate: parseDate(get(node, './ram:TaxPointDate')),
    dueDateTypeCode: textOf(get(node, './ram:DueDateTypeCode')) ? new qdt.TimeReferenceCodeType({ value: textOf(get(node, './ram:DueDateTypeCode'))! }) : undefined,
    rateApplicablePercent: parsePercent(get(node, './ram:RateApplicablePercent')),
  })
}

function parseAllowanceCharge(node: XmlElement): ram.TradeAllowanceChargeType {
  return new ram.TradeAllowanceChargeType({
    chargeIndicator: parseIndicator(get(node, './ram:ChargeIndicator')) ?? new udt.IndicatorType({ indicator: false }),
    sequenceNumeric: textOf(get(node, './ram:SequenceNumeric')) ? new udt.NumericType({ value: Number.parseFloat(textOf(get(node, './ram:SequenceNumeric'))!) }) : undefined,
    calculationPercent: parsePercent(get(node, './ram:CalculationPercent')),
    basisAmount: parseAmount(get(node, './ram:BasisAmount')),
    basisQuantity: parseQuantity(get(node, './ram:BasisQuantity')),
    actualAmount: parseAmount(get(node, './ram:ActualAmount')) ?? new udt.AmountType({ value: 0 }),
    reasonCode: textOf(get(node, './ram:ReasonCode')) ? new qdt.AllowanceChargeReasonCodeType({ value: textOf(get(node, './ram:ReasonCode'))! }) : undefined,
    reason: parseText(get(node, './ram:Reason')),
    categoryTradeTax: get(node, './ram:CategoryTradeTax') ? parseTradeTax(get(node, './ram:CategoryTradeTax')!) : undefined,
  })
}

function parsePaymentTerms(node: XmlElement): ram.TradePaymentTermsType {
  const penalty = get(node, './ram:ApplicableTradePaymentPenaltyTerms')
  const discount = get(node, './ram:ApplicableTradePaymentDiscountTerms')
  return new ram.TradePaymentTermsType({
    description: parseText(get(node, './ram:Description')),
    dueDateDateTime: parseDateTime(get(node, './ram:DueDateDateTime')),
    directDebitMandateID: parseID(get(node, './ram:DirectDebitMandateID')),
    partialPaymentAmount: parseAmount(get(node, './ram:PartialPaymentAmount')),
    applicableTradePaymentPenaltyTerms: penalty
      ? new ram.TradePaymentPenaltyTermsType({
          basisDateTime: parseDateTime(get(penalty, './ram:BasisDateTime')),
          basisPeriodMeasure: parseMeasure(get(penalty, './ram:BasisPeriodMeasure')),
          basisAmount: parseAmount(get(penalty, './ram:BasisAmount')),
          calculationPercent: parsePercent(get(penalty, './ram:CalculationPercent')),
          actualPenaltyAmount: parseAmount(get(penalty, './ram:ActualPenaltyAmount')),
        })
      : undefined,
    applicableTradePaymentDiscountTerms: discount
      ? new ram.TradePaymentDiscountTermsType({
          basisDateTime: parseDateTime(get(discount, './ram:BasisDateTime')),
          basisPeriodMeasure: parseMeasure(get(discount, './ram:BasisPeriodMeasure')),
          basisAmount: parseAmount(get(discount, './ram:BasisAmount')),
          calculationPercent: parsePercent(get(discount, './ram:CalculationPercent')),
          actualDiscountAmount: parseAmount(get(discount, './ram:ActualDiscountAmount')),
        })
      : undefined,
    payeeTradeParty: parseTradeParty(get(node, './ram:PayeeTradeParty')),
  })
}

function parsePaymentMeans(node: XmlElement): ram.TradeSettlementPaymentMeansType {
  const card = get(node, './ram:ApplicableTradeSettlementFinancialCard')
  const debtor = get(node, './ram:PayerPartyDebtorFinancialAccount')
  const creditor = get(node, './ram:PayeePartyCreditorFinancialAccount')
  const payerInst = get(node, './ram:PayerSpecifiedDebtorFinancialInstitution')
  const payeeInst = get(node, './ram:PayeeSpecifiedCreditorFinancialInstitution')

  return new ram.TradeSettlementPaymentMeansType({
    typeCode: new qdt.PaymentMeansCodeType({ value: textOf(get(node, './ram:TypeCode')) ?? '' }),
    information: parseText(get(node, './ram:Information')),
    applicableTradeSettlementFinancialCard: card
      ? new ram.TradeSettlementFinancialCardType({
          id: new udt.IDType({ value: textOf(get(card, './ram:ID')) ?? '' }),
          cardholderName: parseText(get(card, './ram:CardholderName')),
        })
      : undefined,
    payerPartyDebtorFinancialAccount: debtor
      ? new ram.DebtorFinancialAccountType({
          ibanID: new udt.IDType({ value: textOf(get(debtor, './ram:IBANID')) ?? '' }),
          accountName: parseText(get(debtor, './ram:AccountName')),
        })
      : undefined,
    payeePartyCreditorFinancialAccount: creditor
      ? new ram.CreditorFinancialAccountType({
          ibanID: parseID(get(creditor, './ram:IBANID')),
          accountName: parseText(get(creditor, './ram:AccountName')),
          proprietaryID: parseID(get(creditor, './ram:ProprietaryID')),
        })
      : undefined,
    payerSpecifiedDebtorFinancialInstitution: payerInst
      ? new ram.DebtorFinancialInstitutionType({ bicID: parseID(get(payerInst, './ram:BICID')) })
      : undefined,
    payeeSpecifiedCreditorFinancialInstitution: payeeInst && parseID(get(payeeInst, './ram:BICID'))
      ? new ram.CreditorFinancialInstitutionType({ bicID: parseID(get(payeeInst, './ram:BICID'))! })
      : undefined,
  })
}

function parseAccountingAccount(node: XmlElement): ram.TradeAccountingAccountType {
  return new ram.TradeAccountingAccountType({
    id: new udt.IDType({ value: textOf(get(node, './ram:ID')) ?? '' }),
    typeCode: textOf(get(node, './ram:TypeCode')) ? new qdt.AccountingAccountTypeCodeType({ value: textOf(get(node, './ram:TypeCode'))! }) : undefined,
  })
}

function parseReferencedDocument(node: XmlElement | undefined): ram.ReferencedDocumentType | undefined {
  if (!node) {
    return undefined
  }
  return new ram.ReferencedDocumentType({
    issuerAssignedID: parseID(get(node, './ram:IssuerAssignedID')),
    uriID: parseID(get(node, './ram:URIID')),
    lineID: parseID(get(node, './ram:LineID')),
    typeCode: textOf(get(node, './ram:TypeCode')) ? new qdt.DocumentCodeType({ value: textOf(get(node, './ram:TypeCode'))! }) : undefined,
    name: findAll(node, './ram:Name').map(n => parseText(n)!),
    attachmentBinaryObject: parseBinaryObject(get(node, './ram:AttachmentBinaryObject')),
    referenceTypeCode: textOf(get(node, './ram:ReferenceTypeCode')) ? new qdt.ReferenceCodeType({ value: textOf(get(node, './ram:ReferenceTypeCode'))! }) : undefined,
    formattedIssueDateTime: parseFormattedDateTime(get(node, './ram:FormattedIssueDateTime')),
  })
}
