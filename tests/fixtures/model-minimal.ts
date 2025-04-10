import {
  AmountType,
  CountryIDType,
  CrossIndustryInvoiceType,
  CurrencyCodeType,
  DateTimeType,
  DocumentCodeType,
  DocumentContextParameterType,
  ExchangedDocumentContextType,
  ExchangedDocumentType,
  HeaderTradeAgreementType,
  HeaderTradeDeliveryType,
  HeaderTradeSettlementType,
  IDType,
  SupplyChainTradeTransactionType,
  TaxCategoryCodeType,
  TaxTypeCodeType,
  TextType,
  TradeAddressType,
  TradePartyType,
  TradeSettlementHeaderMonetarySummationType,
  TradeTaxType,
} from '../../src/models'

export function getMinimalFacturXModel() {
  // Document context
  const guidelineID = new IDType({ value: 'urn:factur-x.eu:1p0:minimum' })
  const guidelineParameter = new DocumentContextParameterType({ id: guidelineID })
  const documentContext = new ExchangedDocumentContextType({
    guidelineSpecifiedDocumentContextParameter: guidelineParameter,
  })

  // Document
  const invoiceID = new IDType({ value: 'INV-2023-001' })
  const typeCode = new DocumentCodeType({ value: '380' })
  const issueDT = new DateTimeType({ dateTimeString: '20230415', format: '102' })
  const document = new ExchangedDocumentType({
    id: invoiceID,
    typeCode,
    issueDateTime: issueDT,
  })

  // Seller and buyer
  const sellerName = new TextType({ value: 'Acme Corporation' })
  const sellerAddress = new TradeAddressType({
    countryID: new CountryIDType({ value: 'FR' }),
  })
  const sellerParty = new TradePartyType({
    name: sellerName,
    postalTradeAddress: sellerAddress,
  })

  const buyerName = new TextType({ value: 'Sample Customer' })
  const buyerAddress = new TradeAddressType({
    countryID: new CountryIDType({ value: 'FR' }),
  })
  const buyerParty = new TradePartyType({
    name: buyerName,
    postalTradeAddress: buyerAddress,
  })

  // Trade agreement
  const tradeAgreement = new HeaderTradeAgreementType({
    sellerTradeParty: sellerParty,
    buyerTradeParty: buyerParty,
  })

  // Trade delivery
  const tradeDelivery = new HeaderTradeDeliveryType({})

  // Trade settlement
  const currencyCode = new CurrencyCodeType({ value: 'EUR' })
  const tradeTax = new TradeTaxType({
    categoryCode: new TaxCategoryCodeType({ value: 'S' }),
    typeCode: new TaxTypeCodeType({ value: 'VAT' }),
    rateApplicablePercent: { value: 20 },
  })

  const taxBasisTotalAmount = new AmountType({ value: 100, currencyID: 'EUR' })
  const taxTotalAmount = new AmountType({ value: 20, currencyID: 'EUR' })
  const grandTotalAmount = new AmountType({ value: 120, currencyID: 'EUR' })
  const duePayableAmount = new AmountType({ value: 120, currencyID: 'EUR' })

  const summation = new TradeSettlementHeaderMonetarySummationType({
    // lineTotalAmount: new AmountType({ value: 100, currencyID: 'EUR' }),
    taxBasisTotalAmount: [taxBasisTotalAmount],
    taxTotalAmount: [taxTotalAmount],
    grandTotalAmount: [grandTotalAmount],
    duePayableAmount,
  })

  const tradeSettlement = new HeaderTradeSettlementType({
    invoiceCurrencyCode: currencyCode,
    // applicableTradeTax: [tradeTax],
    specifiedTradeSettlementHeaderMonetarySummation: summation,
  })

  // Supply chain transaction
  const transaction = new SupplyChainTradeTransactionType({
    applicableHeaderTradeAgreement: tradeAgreement,
    applicableHeaderTradeDelivery: tradeDelivery,
    applicableHeaderTradeSettlement: tradeSettlement,
  })

  // Invoice
  const invoice = new CrossIndustryInvoiceType({
    exchangedDocumentContext: documentContext,
    exchangedDocument: document,
    supplyChainTradeTransaction: transaction,
  })

  return invoice
}
