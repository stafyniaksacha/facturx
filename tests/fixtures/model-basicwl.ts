import {
  AmountType,
  CountryIDType,
  CreditorFinancialAccountType,
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
  NoteType,
  PaymentMeansCodeType,
  SupplyChainTradeTransactionType,
  TaxCategoryCodeType,
  TaxRegistrationType,
  TaxTypeCodeType,
  TextType,
  TradeAddressType,
  TradePartyType,
  TradePaymentTermsType,
  TradeSettlementHeaderMonetarySummationType,
  TradeSettlementPaymentMeansType,
  TradeTaxType,
} from '../../src/models'

export function getBasicWLFacturXModel() {
  // Document context
  const guidelineID = new IDType({ value: 'urn:factur-x.eu:1p0:basicwl' })
  const guidelineParameter = new DocumentContextParameterType({ id: guidelineID })
  const documentContext = new ExchangedDocumentContextType({
    guidelineSpecifiedDocumentContextParameter: guidelineParameter,
  })

  // Document
  const invoiceID = new IDType({ value: 'INV-2023-002' })
  const typeCode = new DocumentCodeType({ value: '380' })
  const issueDT = new DateTimeType({ dateTimeString: '20230415', format: '102' })
  const document = new ExchangedDocumentType({
    id: invoiceID,
    typeCode,
    issueDateTime: issueDT,
    includedNote: [
      new NoteType({
        content: new TextType({ value: 'Basic WL profile invoice example' }),
      }),
    ],
  })

  // Seller and buyer
  const sellerName = new TextType({ value: 'Acme Corporation' })
  const sellerAddress = new TradeAddressType({
    postcodeCode: new TextType({ value: '75001' }),
    lineOne: new TextType({ value: '123 Main Street' }),
    cityName: new TextType({ value: 'Paris' }),
    countryID: new CountryIDType({ value: 'FR' }),
  })
  const sellerTaxRegistration = new TaxRegistrationType({
    id: new IDType({ value: 'FR12345678901', schemeID: 'VA' }),
  })
  const sellerParty = new TradePartyType({
    name: sellerName,
    postalTradeAddress: sellerAddress,
    specifiedTaxRegistration: [sellerTaxRegistration],
  })

  const buyerName = new TextType({ value: 'Sample Customer' })
  const buyerAddress = new TradeAddressType({
    postcodeCode: new TextType({ value: '69001' }),
    lineOne: new TextType({ value: '456 Customer Avenue' }),
    cityName: new TextType({ value: 'Lyon' }),
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

  // Payment means
  const paymentMeans = new TradeSettlementPaymentMeansType({
    typeCode: new PaymentMeansCodeType({ value: '30' }),
    payeePartyCreditorFinancialAccount: new CreditorFinancialAccountType({
      ibanID: new IDType({ value: 'FR7630006000011234567890189' }),
      proprietaryID: new IDType({ value: '1234567890' }),
    }),
  })

  // Trade settlement
  const currencyCode = new CurrencyCodeType({ value: 'EUR' })
  const tradeTax = new TradeTaxType({
    categoryCode: new TaxCategoryCodeType({ value: 'S' }),
    typeCode: new TaxTypeCodeType({ value: 'VAT' }),
    rateApplicablePercent: { value: 20 },
  })

  const lineTotalAmount = new AmountType({ value: 100, currencyID: 'EUR' })
  const chargeTotalAmount = new AmountType({ value: 0, currencyID: 'EUR' })
  const allowanceTotalAmount = new AmountType({ value: 0, currencyID: 'EUR' })
  const taxBasisTotalAmount = new AmountType({ value: 100, currencyID: 'EUR' })
  const taxTotalAmount = new AmountType({ value: 20, currencyID: 'EUR' })
  const grandTotalAmount = new AmountType({ value: 120, currencyID: 'EUR' })
  const duePayableAmount = new AmountType({ value: 120, currencyID: 'EUR' })

  const summation = new TradeSettlementHeaderMonetarySummationType({
    lineTotalAmount,
    chargeTotalAmount,
    allowanceTotalAmount,
    taxBasisTotalAmount: taxBasisTotalAmount,
    taxTotalAmount: [taxTotalAmount],
    grandTotalAmount: grandTotalAmount,
    duePayableAmount,
  })

  const paymentTerms = new TradePaymentTermsType({
    description: new TextType({ value: 'Payment due within 30 days' }),
    dueDateDateTime: new DateTimeType({ dateTimeString: '20230515', format: '102' }),
  })

  const tradeSettlement = new HeaderTradeSettlementType({
    invoiceCurrencyCode: currencyCode,
    specifiedTradeSettlementPaymentMeans: [paymentMeans],
    applicableTradeTax: [tradeTax],
    specifiedTradeSettlementHeaderMonetarySummation: summation,
    specifiedTradePaymentTerms: [paymentTerms],
  })

  // Supply chain transaction
  const transaction = new SupplyChainTradeTransactionType({
    includedSupplyChainTradeLineItem: [], // Empty line items for validation
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
