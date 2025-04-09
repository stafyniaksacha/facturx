import {
  AmountType,
  IDType,
  TextType,
  DateTimeType,
  IndicatorType,
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
  NoteType,
  PaymentMeansCodeType,
  TradeSettlementPaymentMeansType,
  CreditorFinancialAccountType,
  SpecifiedPeriodType,
  TradeAllowanceChargeType,
  TradeCurrencyExchangeType,
  ReferencedDocumentType,
  SupplyChainEventType,
  LegalOrganizationType,
  AdvancePaymentType
} from '../../src/models';

export function getExtendedFacturXModel() {
  // Document context with test indicator
  const testIndicator = new IndicatorType({ indicator: false });
  const guidelineID = new IDType({ value: 'urn:factur-x.eu:1p0:extended' });
  const guidelineParameter = new DocumentContextParameterType({ id: guidelineID });
  const documentContext = new ExchangedDocumentContextType({
    testIndicator,
    guidelineSpecifiedDocumentContextParameter: guidelineParameter
  });

  // Document with copy indicator and language
  const invoiceID = new IDType({ value: 'INV-2023-003' });
  const invoiceName = new TextType({ value: 'Extended Profile Invoice' });
  const typeCode = new DocumentCodeType({ value: '380' });
  const issueDT = new DateTimeType({ dateTimeString: '20230415', format: '102' });
  const copyIndicator = new IndicatorType({ indicator: false });
  const languageID = new IDType({ value: 'EN' });
  
  const invoiceNote = new NoteType({
    content: new TextType({ value: 'This is an extended profile Factur-X invoice example' }),
    subjectCode: new TextType({ value: 'AAI' })
  });
  
  const effectivePeriod = new SpecifiedPeriodType({
    startDateTime: new DateTimeType({ dateTimeString: '20230401', format: '102' }),
    endDateTime: new DateTimeType({ dateTimeString: '20230430', format: '102' })
  });
  
  const document = new ExchangedDocumentType({
    id: invoiceID,
    name: invoiceName,
    typeCode,
    issueDateTime: issueDT,
    copyIndicator,
    languageID: [languageID],
    includedNote: [invoiceNote],
    effectiveSpecifiedPeriod: effectivePeriod
  });

  // Seller and buyer with more details
  const sellerName = new TextType({ value: 'Acme Corporation' });
  const sellerLegalOrg = new LegalOrganizationType({
    id: new IDType({ value: '123456789', schemeID: '0002' })
  });
  const sellerAddress = new TradeAddressType({
    postcodeCode: new TextType({ value: '75001' }),
    lineOne: new TextType({ value: '123 Main Street' }),
    lineTwo: new TextType({ value: 'Building A' }),
    cityName: new TextType({ value: 'Paris' }),
    countryID: new CountryIDType({ value: 'FR' }),
    countrySubDivisionName: [new TextType({ value: 'Île-de-France' })]
  });
  const sellerTaxRegistration = new TaxRegistrationType({
    id: new IDType({ value: 'FR12345678901', schemeID: 'VA' })
  });
  const sellerParty = new TradePartyType({
    name: sellerName,
    specifiedLegalOrganization: sellerLegalOrg,
    postalTradeAddress: sellerAddress,
    specifiedTaxRegistration: [sellerTaxRegistration]
  });

  const buyerName = new TextType({ value: 'Sample Customer' });
  const buyerLegalOrg = new LegalOrganizationType({
    id: new IDType({ value: '987654321', schemeID: '0002' })
  });
  const buyerAddress = new TradeAddressType({
    postcodeCode: new TextType({ value: '69001' }),
    lineOne: new TextType({ value: '456 Customer Avenue' }),
    cityName: new TextType({ value: 'Lyon' }),
    countryID: new CountryIDType({ value: 'FR' })
  });
  const buyerTaxRegistration = new TaxRegistrationType({
    id: new IDType({ value: 'FR98765432109', schemeID: 'VA' })
  });
  const buyerParty = new TradePartyType({
    name: buyerName,
    specifiedLegalOrganization: buyerLegalOrg,
    postalTradeAddress: buyerAddress,
    specifiedTaxRegistration: [buyerTaxRegistration]
  });

  // Referenced documents
  const orderReference = new ReferencedDocumentType({
    issuerAssignedID: new IDType({ value: 'PO-12345' })
  });

  // Trade agreement
  const tradeAgreement = new HeaderTradeAgreementType({
    sellerTradeParty: sellerParty,
    buyerTradeParty: buyerParty,
    buyerOrderReferencedDocument: orderReference
  });

  // Trade delivery with shipping info
  const deliveryEvent = new SupplyChainEventType({
    occurrenceDateTime: new DateTimeType({ dateTimeString: '20230410', format: '102' })
  });
  
  const shipToParty = new TradePartyType({
    name: new TextType({ value: 'Delivery Warehouse' }),
    postalTradeAddress: new TradeAddressType({
      postcodeCode: new TextType({ value: '69002' }),
      lineOne: new TextType({ value: '789 Warehouse Blvd' }),
      cityName: new TextType({ value: 'Lyon' }),
      countryID: new CountryIDType({ value: 'FR' })
    })
  });
  
  const tradeDelivery = new HeaderTradeDeliveryType({
    shipToTradeParty: shipToParty,
    actualDeliverySupplyChainEvent: deliveryEvent
  });

  // Payment means
  const paymentMeans = new TradeSettlementPaymentMeansType({
    typeCode: new PaymentMeansCodeType({ value: '30' }),
    payeePartyCreditorFinancialAccount: new CreditorFinancialAccountType({
      ibanID: new IDType({ value: 'FR7630006000011234567890189' }),
      accountName: new TextType({ value: 'Acme Corporation Account' }),
      proprietaryID: new IDType({ value: '1234567890' }) 
    })
  });

  // Additional taxes
  const vat20 = new TradeTaxType({
    categoryCode: new TaxCategoryCodeType({ value: 'S' }),
    typeCode: new TaxTypeCodeType({ value: 'VAT' }),
    rateApplicablePercent: { value: 20 }
  });
  
  const vat10 = new TradeTaxType({
    categoryCode: new TaxCategoryCodeType({ value: 'S' }),
    typeCode: new TaxTypeCodeType({ value: 'VAT' }),
    rateApplicablePercent: { value: 10 }
  });

  // Allowances and charges
  const headerAllowance = new TradeAllowanceChargeType({
    chargeIndicator: new IndicatorType({ indicator: false }),
    actualAmount: new AmountType({ value: 5, currencyID: 'EUR' }),
    reason: new TextType({ value: 'Customer loyalty discount' })
  });

  // Currency exchange info
  const currencyExchange = new TradeCurrencyExchangeType({
    sourceCurrencyCode: new TextType({ value: 'EUR' }),
    targetCurrencyCode: new TextType({ value: 'USD' }),
    conversionRate: { value: 1.1 }
  });

  // Trade settlement
  const currencyCode = new CurrencyCodeType({ value: 'EUR' });
  const taxCurrencyCode = new CurrencyCodeType({ value: 'EUR' });
  
  const lineTotalAmount = new AmountType({ value: 100, currencyID: 'EUR' });
  const chargeTotalAmount = new AmountType({ value: 0, currencyID: 'EUR' });
  const allowanceTotalAmount = new AmountType({ value: 5, currencyID: 'EUR' });
  const taxBasisTotalAmount = new AmountType({ value: 95, currencyID: 'EUR' });
  const taxTotalAmount = new AmountType({ value: 18, currencyID: 'EUR' });
  const grandTotalAmount = new AmountType({ value: 113, currencyID: 'EUR' });
  const totalPrepaidAmount = new AmountType({ value: 10, currencyID: 'EUR' });
  const duePayableAmount = new AmountType({ value: 103, currencyID: 'EUR' });
  
  const summation = new TradeSettlementHeaderMonetarySummationType({
    lineTotalAmount,
    chargeTotalAmount,
    allowanceTotalAmount,
    taxBasisTotalAmount: [taxBasisTotalAmount],
    taxTotalAmount: [taxTotalAmount],
    grandTotalAmount: [grandTotalAmount],
    totalPrepaidAmount,
    duePayableAmount
  });

  const paymentTerms = new TradePaymentTermsType({
    description: new TextType({ value: 'Payment due within 30 days' }),
    dueDateDateTime: new DateTimeType({ dateTimeString: '20230515', format: '102' })
  });
  
  // Advance payment info
  const advancePayment = new AdvancePaymentType({
    paidAmount: new AmountType({ value: 10, currencyID: 'EUR' }),
    includedTradeTax: [new TradeTaxType({
      categoryCode: new TaxCategoryCodeType({ value: 'S' }),
      typeCode: new TaxTypeCodeType({ value: 'VAT' }),
      rateApplicablePercent: { value: 20 }
    })]
  });
  
  const tradeSettlement = new HeaderTradeSettlementType({
    creditorReferenceID: new IDType({ value: 'REF-123' }),
    paymentReference: new TextType({ value: 'PAYMENT-INV-2023-003' }),
    invoiceCurrencyCode: currencyCode,
    taxCurrencyCode: taxCurrencyCode,
    specifiedTradeSettlementPaymentMeans: [paymentMeans],
    applicableTradeTax: [vat20, vat10],
    billingSpecifiedPeriod: effectivePeriod,
    specifiedTradeAllowanceCharge: [headerAllowance],
    taxApplicableTradeCurrencyExchange: currencyExchange,
    specifiedTradeSettlementHeaderMonetarySummation: summation,
    specifiedTradePaymentTerms: [paymentTerms],
    specifiedAdvancePayment: [advancePayment]
  });
  
  // Line items with more details
  const lineItem1 = new SupplyChainTradeLineItemType({
    associatedDocumentLineDocument: new DocumentLineDocumentType({
      lineID: new IDType({ value: '1' })
    }),
    specifiedTradeProduct: new TradeProductType({
      globalID: new IDType({ value: '1234567890123', schemeID: 'EAN' }),
      name: new TextType({ value: 'Product 1' })
    }),
    specifiedLineTradeAgreement: new LineTradeAgreementType({
      grossPriceProductTradePrice: new TradePriceType({
        chargeAmount: new AmountType({ value: 90, currencyID: 'EUR' })
      }),
      netPriceProductTradePrice: new TradePriceType({
        chargeAmount: new AmountType({ value: 80, currencyID: 'EUR' }),
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
        lineTotalAmount: new AmountType({ value: 80, currencyID: 'EUR' })
      })
    })
  });

  const lineItem2 = new SupplyChainTradeLineItemType({
    associatedDocumentLineDocument: new DocumentLineDocumentType({
      lineID: new IDType({ value: '2' })
    }),
    specifiedTradeProduct: new TradeProductType({
      globalID: new IDType({ value: '9876543210987', schemeID: 'EAN' }),
      name: new TextType({ value: 'Product 2' })
    }),
    specifiedLineTradeAgreement: new LineTradeAgreementType({
      netPriceProductTradePrice: new TradePriceType({
        chargeAmount: new AmountType({ value: 20, currencyID: 'EUR' }),
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
        rateApplicablePercent: { value: 10 }
      })],
      specifiedTradeSettlementLineMonetarySummation: new TradeSettlementLineMonetarySummationType({
        lineTotalAmount: new AmountType({ value: 20, currencyID: 'EUR' })
      })
    })
  });

  const transaction = new SupplyChainTradeTransactionType({
    includedSupplyChainTradeLineItem: [lineItem1, lineItem2],
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