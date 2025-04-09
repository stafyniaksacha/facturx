import {
  AmountType,
  IDType,
  TextType,
  DateTimeType,
  CurrencyCodeType,
  DocumentCodeType,
  CountryIDType,
  TaxCategoryCodeType,
  TaxTypeCodeType,
  DocumentContextParameterType,
  TradePartyType,
  TradeAddressType,
  TradeTaxType,
  TradeSettlementHeaderMonetarySummationType,
  CrossIndustryInvoiceType,
  ExchangedDocumentContextType,
  ExchangedDocumentType,
  HeaderTradeAgreementType,
  HeaderTradeDeliveryType,
  HeaderTradeSettlementType,
  SupplyChainTradeTransactionType,
  SupplyChainTradeLineItemType,
  DocumentLineDocumentType,
  TradeProductType,
  LineTradeAgreementType,
  LineTradeDeliveryType,
  LineTradeSettlementType,
  TradeSettlementLineMonetarySummationType,
  TradePriceType,
  TradePaymentTermsType,
  TaxRegistrationType,
  NoteType
} from '../../src/models';

export function getBasicFacturXModel() {
  // Document context
  const guidelineID = new IDType({ value: 'urn:factur-x.eu:1p0:basic' });
  const guidelineParameter = new DocumentContextParameterType({ id: guidelineID });
  const documentContext = new ExchangedDocumentContextType({
    guidelineSpecifiedDocumentContextParameter: guidelineParameter
  });

  // Document 
  const invoiceID = new IDType({ value: 'INV-2023-001' });
  const typeCode = new DocumentCodeType({ value: '380' });
  const issueDT = new DateTimeType({ dateTimeString: '20230415', format: '102' });
  const document = new ExchangedDocumentType({
    id: invoiceID,
    typeCode,
    issueDateTime: issueDT,
    includedNote: [
      new NoteType({
        content: new TextType({ value: 'Basic profile invoice example' })
      })
    ]
  });

  // Seller and buyer
  const sellerName = new TextType({ value: 'Acme Corporation' });
  const sellerAddress = new TradeAddressType({
    postcodeCode: new TextType({ value: '75001' }),
    lineOne: new TextType({ value: '123 Main Street' }),
    cityName: new TextType({ value: 'Paris' }),
    countryID: new CountryIDType({ value: 'FR' })
  });
  const sellerTaxRegistration = new TaxRegistrationType({
    id: new IDType({ value: 'FR12345678901', schemeID: 'VA' })
  });
  const sellerParty = new TradePartyType({
    name: sellerName,
    postalTradeAddress: sellerAddress,
    specifiedTaxRegistration: [sellerTaxRegistration]
  });

  const buyerName = new TextType({ value: 'Sample Customer' });
  const buyerAddress = new TradeAddressType({
    postcodeCode: new TextType({ value: '69001' }),
    lineOne: new TextType({ value: '456 Customer Avenue' }),
    cityName: new TextType({ value: 'Lyon' }),
    countryID: new CountryIDType({ value: 'FR' })
  });
  const buyerParty = new TradePartyType({
    name: buyerName,
    postalTradeAddress: buyerAddress
  });

  // Trade agreement
  const tradeAgreement = new HeaderTradeAgreementType({
    sellerTradeParty: sellerParty,
    buyerTradeParty: buyerParty
  });

  // Trade delivery
  const tradeDelivery = new HeaderTradeDeliveryType({});

  // Trade settlement
  const currencyCode = new CurrencyCodeType({ value: 'EUR' });
  const tradeTax = new TradeTaxType({
    categoryCode: new TaxCategoryCodeType({ value: 'S' }),
    typeCode: new TaxTypeCodeType({ value: 'VAT' }),
    rateApplicablePercent: { value: 20 }
  });
  
  const lineTotalAmount = new AmountType({ value: 100, currencyID: 'EUR' });
  const chargeTotalAmount = new AmountType({ value: 0, currencyID: 'EUR' });
  const allowanceTotalAmount = new AmountType({ value: 0, currencyID: 'EUR' });
  const taxBasisTotalAmount = new AmountType({ value: 100, currencyID: 'EUR' });
  const taxTotalAmount = new AmountType({ value: 20, currencyID: 'EUR' });
  const grandTotalAmount = new AmountType({ value: 120, currencyID: 'EUR' });
  const duePayableAmount = new AmountType({ value: 120, currencyID: 'EUR' });
  
  const summation = new TradeSettlementHeaderMonetarySummationType({
    lineTotalAmount,
    chargeTotalAmount,
    allowanceTotalAmount,
    taxBasisTotalAmount: [taxBasisTotalAmount],
    taxTotalAmount: [taxTotalAmount],
    grandTotalAmount: [grandTotalAmount],
    duePayableAmount
  });

  const paymentTerms = new TradePaymentTermsType({
    description: new TextType({ value: 'Payment due within 30 days' })
  });
  
  const tradeSettlement = new HeaderTradeSettlementType({
    invoiceCurrencyCode: currencyCode,
    applicableTradeTax: [tradeTax],
    specifiedTradeSettlementHeaderMonetarySummation: summation,
    specifiedTradePaymentTerms: [paymentTerms]
  });
  
  // Supply chain transaction
  const lineItem = new SupplyChainTradeLineItemType({
    associatedDocumentLineDocument: new DocumentLineDocumentType({
      lineID: new IDType({ value: '1' })
    }),
    specifiedTradeProduct: new TradeProductType({
      name: new TextType({ value: 'Test Product' })
    }),
    specifiedLineTradeAgreement: new LineTradeAgreementType({
      netPriceProductTradePrice: new TradePriceType({
        chargeAmount: new AmountType({ value: 100, currencyID: 'EUR' }),
        basisQuantity: { value: 1, unitCode: 'C62' }
      })
    }),
    specifiedLineTradeDelivery: new LineTradeDeliveryType({
      billedQuantity: { value: 1, unitCode: 'C62' }
    }),
    specifiedLineTradeSettlement: new LineTradeSettlementType({
      applicableTradeTax: [new TradeTaxType({
        categoryCode: new TaxCategoryCodeType({ value: 'S' }),
        typeCode: new TaxTypeCodeType({ value: 'VAT' }),
        rateApplicablePercent: { value: 20 }
      })],
      specifiedTradeSettlementLineMonetarySummation: new TradeSettlementLineMonetarySummationType({
        lineTotalAmount: new AmountType({ value: 100, currencyID: 'EUR' })
      })
    })
  });

  const transaction = new SupplyChainTradeTransactionType({
    includedSupplyChainTradeLineItem: [lineItem],
    applicableHeaderTradeAgreement: tradeAgreement,
    applicableHeaderTradeDelivery: tradeDelivery,
    applicableHeaderTradeSettlement: tradeSettlement
  });

  // Invoice
  const invoice = new CrossIndustryInvoiceType({
    exchangedDocumentContext: documentContext,
    exchangedDocument: document,
    supplyChainTradeTransaction: transaction
  });
  
  return invoice;
} 