import {
  AmountType,
  CountryIDType,
  CrossIndustryInvoiceType,
  CurrencyCodeType,
  DateTimeType,
  DocumentCodeType,
  DocumentContextParameterType,
  DocumentLineDocumentType,
  ExchangedDocumentContextType,
  ExchangedDocumentType,
  HeaderTradeAgreementType,
  HeaderTradeDeliveryType,
  HeaderTradeSettlementType,
  IDType,
  IndicatorType,
  LineTradeAgreementType,
  LineTradeDeliveryType,
  LineTradeSettlementType,
  NoteType,
  SupplyChainTradeLineItemType,
  SupplyChainTradeTransactionType,
  TaxCategoryCodeType,
  TaxTypeCodeType,
  TextType,
  TradeAddressType,
  TradePartyType,
  TradePriceType,
  TradeProductType,
  TradeSettlementHeaderMonetarySummationType,
  TradeSettlementLineMonetarySummationType,
  TradeTaxType,
} from '@stafyniaksacha/facturx/models'

import { describe, expect, it } from 'vitest'

describe('factur-X model', () => {
  describe('unqualifiedDataTypes', () => {
    it('amountType should be correctly instantiated', () => {
      const amount = new AmountType({ value: 100.50, currencyID: 'EUR' })
      expect(amount.value).toBe(100.50)
      expect(amount.currencyID).toBe('EUR')
    })

    it('iDType should be correctly instantiated', () => {
      const id = new IDType({ value: 'INV-2023-001', schemeID: 'invoice-id' })
      expect(id.value).toBe('INV-2023-001')
      expect(id.schemeID).toBe('invoice-id')
    })

    it('textType should be correctly instantiated', () => {
      const text = new TextType({ value: 'Sample text' })
      expect(text.value).toBe('Sample text')
    })

    it('dateTimeType should be correctly instantiated', () => {
      const dateTime = new DateTimeType({ dateTimeString: '20230415', format: '102' })
      expect(dateTime.dateTimeString).toBe('20230415')
      expect(dateTime.format).toBe('102')
    })

    it('indicatorType should be correctly instantiated', () => {
      const indicator = new IndicatorType({ indicator: true })
      expect(indicator.indicator).toBe(true)
    })
  })

  describe('qualifiedDataTypes', () => {
    it('currencyCodeType should be correctly instantiated', () => {
      const currencyCode = new CurrencyCodeType({ value: 'EUR' })
      expect(currencyCode.value).toBe('EUR')
    })

    it('documentCodeType should be correctly instantiated', () => {
      const documentCode = new DocumentCodeType({ value: '380' })
      expect(documentCode.value).toBe('380')
    })

    it('countryIDType should be correctly instantiated', () => {
      const countryID = new CountryIDType({ value: 'FR' })
      expect(countryID.value).toBe('FR')
    })

    it('taxCategoryCodeType should be correctly instantiated', () => {
      const taxCategoryCode = new TaxCategoryCodeType({ value: 'S' })
      expect(taxCategoryCode.value).toBe('S')
    })

    it('taxTypeCodeType should be correctly instantiated', () => {
      const taxTypeCode = new TaxTypeCodeType({ value: 'VAT' })
      expect(taxTypeCode.value).toBe('VAT')
    })
  })

  describe('reusableAggregateBusinessInformationEntity', () => {
    it('documentContextParameterType should be correctly instantiated', () => {
      const id = new IDType({ value: 'urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:extended' })
      const documentContextParameter = new DocumentContextParameterType({ id })
      expect(documentContextParameter.id).toEqual(id)
    })

    it('noteType should be correctly instantiated', () => {
      const content = new TextType({ value: 'Invoice note text' })
      const note = new NoteType({ content })
      expect(note.content).toEqual(content)
    })

    it('tradeAddressType should be correctly instantiated', () => {
      const countryID = new CountryIDType({ value: 'FR' })
      const postalCode = new TextType({ value: '75001' })
      const cityName = new TextType({ value: 'Paris' })
      const lineOne = new TextType({ value: '123 Sample Street' })

      const address = new TradeAddressType({
        countryID,
        postcodeCode: postalCode,
        cityName,
        lineOne,
      })

      expect(address.countryID).toEqual(countryID)
      expect(address.postcodeCode).toEqual(postalCode)
      expect(address.cityName).toEqual(cityName)
      expect(address.lineOne).toEqual(lineOne)
    })

    it('tradeTaxType should be correctly instantiated', () => {
      const categoryCode = new TaxCategoryCodeType({ value: 'S' })
      const typeCode = new TaxTypeCodeType({ value: 'VAT' })
      const rateApplicablePercent = { value: 20 }

      const tradeTax = new TradeTaxType({
        categoryCode,
        typeCode,
        rateApplicablePercent,
      })

      expect(tradeTax.categoryCode).toEqual(categoryCode)
      expect(tradeTax.typeCode).toEqual(typeCode)
      expect(tradeTax.rateApplicablePercent).toEqual(rateApplicablePercent)
    })
  })

  describe('complete invoice model', () => {
    it('should create a minimal invoice', () => {
      // Document context
      const guidelineID = new IDType({ value: 'urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:extended' })
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

      const totalAmount = new AmountType({ value: 120, currencyID: 'EUR' })
      const taxBasisAmount = new AmountType({ value: 100, currencyID: 'EUR' })
      const taxAmount = new AmountType({ value: 20, currencyID: 'EUR' })

      const summation = new TradeSettlementHeaderMonetarySummationType({
        lineTotalAmount: totalAmount,
        taxBasisTotalAmount: [taxBasisAmount],
        taxTotalAmount: [taxAmount],
        grandTotalAmount: [totalAmount],
        duePayableAmount: totalAmount,
      })

      const tradeSettlement = new HeaderTradeSettlementType({
        invoiceCurrencyCode: currencyCode,
        applicableTradeTax: [tradeTax],
        specifiedTradeSettlementHeaderMonetarySummation: summation,
      })

      // Supply chain transaction
      const lineItem = new SupplyChainTradeLineItemType({
        associatedDocumentLineDocument: new DocumentLineDocumentType({
          lineID: new IDType({ value: '1' }),
        }),
        specifiedTradeProduct: new TradeProductType({
          name: new TextType({ value: 'Test Product' }),
        }),
        specifiedLineTradeAgreement: new LineTradeAgreementType({
          netPriceProductTradePrice: new TradePriceType({
            chargeAmount: new AmountType({ value: 100, currencyID: 'EUR' }),
            basisQuantity: { value: 1, unitCode: 'C62' },
          }),
        }),
        specifiedLineTradeDelivery: new LineTradeDeliveryType({
          billedQuantity: { value: 1, unitCode: 'C62' },
        }),
        specifiedLineTradeSettlement: new LineTradeSettlementType({
          applicableTradeTax: [new TradeTaxType({
            categoryCode: new TaxCategoryCodeType({ value: 'S' }),
            typeCode: new TaxTypeCodeType({ value: 'VAT' }),
            rateApplicablePercent: { value: 20 },
          })],
          specifiedTradeSettlementLineMonetarySummation: new TradeSettlementLineMonetarySummationType({
            lineTotalAmount: new AmountType({ value: 120, currencyID: 'EUR' }),
          }),
        }),
      })

      const transaction = new SupplyChainTradeTransactionType({
        includedSupplyChainTradeLineItem: [lineItem],
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

      // Assertions
      expect(invoice).toBeInstanceOf(CrossIndustryInvoiceType)
      expect(invoice.exchangedDocumentContext).toBe(documentContext)
      expect(invoice.exchangedDocument).toBe(document)
      expect(invoice.supplyChainTradeTransaction).toBe(transaction)
    })
  })
})
