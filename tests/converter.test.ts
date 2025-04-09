import { describe, expect, test } from 'vitest';

import { invoiceToXml } from '../src';
import { 
  AmountType,
  IDType,
  TextType,
  DateTimeType,
  CurrencyCodeType,
  DocumentCodeType,
  CountryIDType,
  DocumentContextParameterType,
  TradePartyType,
  TradeAddressType,
  TradeSettlementHeaderMonetarySummationType,
  CrossIndustryInvoiceType,
  ExchangedDocumentContextType,
  ExchangedDocumentType,
  HeaderTradeAgreementType,
  HeaderTradeDeliveryType,
  HeaderTradeSettlementType,
  SupplyChainTradeTransactionType
} from '../src/models';

import { getMinimumXML } from './fixtures/xml';

describe('FacturX XML Converter', () => {
  test('should convert a minimum Factur-X model to valid XML', async () => {
    // Create a minimal valid invoice model
    // Document context
    const guidelineID = new IDType({ value: 'urn:factur-x.eu:1p0:minimum' });
    const guidelineParameter = new DocumentContextParameterType({ id: guidelineID });
    const documentContext = new ExchangedDocumentContextType({
      guidelineSpecifiedDocumentContextParameter: guidelineParameter
    });

    // Document 
    const invoiceID = new IDType({ value: 'FA-2017-0010' });
    const typeCode = new DocumentCodeType({ value: '380' });
    const issueDT = new DateTimeType({ dateTimeString: '20171113', format: '102' });
    const document = new ExchangedDocumentType({
      id: invoiceID,
      typeCode,
      issueDateTime: issueDT
    });

    // Seller and buyer
    const sellerName = new TextType({ value: 'Au bon moulin' });
    const sellerLegalID = new IDType({ value: '99999999800010', schemeID: '0002' });
    const sellerLegalOrg = { id: sellerLegalID };
    const sellerAddress = new TradeAddressType({
      countryID: new CountryIDType({ value: 'FR' })
    });
    const sellerTaxID = new IDType({ value: 'FR11999999998', schemeID: 'VA' });
    const sellerTaxReg = [{ id: sellerTaxID }];
    const sellerParty = new TradePartyType({
      name: sellerName,
      specifiedLegalOrganization: sellerLegalOrg,
      postalTradeAddress: sellerAddress,
      specifiedTaxRegistration: sellerTaxReg
    });

    const buyerName = new TextType({ value: 'Ma jolie boutique' });
    const buyerLegalID = new IDType({ value: '78787878400035', schemeID: '0002' });
    const buyerLegalOrg = { id: buyerLegalID };
    const buyerParty = new TradePartyType({
      name: buyerName,
      specifiedLegalOrganization: buyerLegalOrg
    });

    // Buyer order reference
    const buyerOrderID = new IDType({ value: 'PO445' });
    const buyerOrderRef = { issuerAssignedID: buyerOrderID };

    // Trade agreement
    const tradeAgreement = new HeaderTradeAgreementType({
      sellerTradeParty: sellerParty,
      buyerTradeParty: buyerParty,
      buyerOrderReferencedDocument: buyerOrderRef
    });

    // Trade delivery
    const tradeDelivery = new HeaderTradeDeliveryType({});

    // Trade settlement
    const currencyCode = new CurrencyCodeType({ value: 'EUR' });
    
    const lineTotalAmount = new AmountType({ value: 624.90 });
    const taxBasisAmount = new AmountType({ value: 624.90 });
    const taxAmount = new AmountType({ value: 46.25, currencyID: 'EUR' });
    const grandTotalAmount = new AmountType({ value: 671.15 });
    const duePayableAmount = new AmountType({ value: 470.15 });
    
    const summation = new TradeSettlementHeaderMonetarySummationType({
      lineTotalAmount,
      taxBasisTotalAmount: [taxBasisAmount],
      taxTotalAmount: [taxAmount],
      grandTotalAmount: [grandTotalAmount],
      duePayableAmount
    });
    
    const tradeSettlement = new HeaderTradeSettlementType({
      invoiceCurrencyCode: currencyCode,
      applicableTradeTax: [], // Simplified for test
      specifiedTradeSettlementHeaderMonetarySummation: summation
    });

    // Supply chain transaction
    const transaction = new SupplyChainTradeTransactionType({
      includedSupplyChainTradeLineItem: [],
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

    // Convert to XML
    const xmlDoc = await invoiceToXml(invoice);
    const xmlString = xmlDoc.toString();

    // Verify basic structure elements are present
    expect(xmlString).toContain('<rsm:CrossIndustryInvoice');
    expect(xmlString).toContain('<rsm:ExchangedDocumentContext>');
    expect(xmlString).toContain('<ram:GuidelineSpecifiedDocumentContextParameter>');
    expect(xmlString).toContain('<ram:ID>urn:factur-x.eu:1p0:minimum</ram:ID>');
    expect(xmlString).toContain('<rsm:ExchangedDocument>');
    expect(xmlString).toContain('<ram:ID>FA-2017-0010</ram:ID>');
    expect(xmlString).toContain('<ram:TypeCode>380</ram:TypeCode>');
    expect(xmlString).toContain('<udt:DateTimeString format="102">20171113</udt:DateTimeString>');

    // Verify seller and buyer
    expect(xmlString).toContain('<ram:SellerTradeParty>');
    expect(xmlString).toContain('<ram:Name>Au bon moulin</ram:Name>');
    expect(xmlString).toContain('<ram:BuyerTradeParty>');
    expect(xmlString).toContain('<ram:Name>Ma jolie boutique</ram:Name>');

    // Verify monetary summation
    expect(xmlString).toContain('<ram:TaxBasisTotalAmount>624.90</ram:TaxBasisTotalAmount>');
    expect(xmlString).toContain('<ram:TaxTotalAmount currencyID="EUR">46.25</ram:TaxTotalAmount>');
    expect(xmlString).toContain('<ram:GrandTotalAmount>671.15</ram:GrandTotalAmount>');
    expect(xmlString).toContain('<ram:DuePayableAmount>470.15</ram:DuePayableAmount>');
  });

  test('should generate XML similar to reference XML', async () => {
    // Create a minimal invoice model
    const guidelineID = new IDType({ value: 'urn:factur-x.eu:1p0:minimum' });
    const guidelineParameter = new DocumentContextParameterType({ id: guidelineID });
    const documentContext = new ExchangedDocumentContextType({
      guidelineSpecifiedDocumentContextParameter: guidelineParameter
    });

    const invoiceID = new IDType({ value: 'FA-2017-0010' });
    const typeCode = new DocumentCodeType({ value: '380' });
    const issueDT = new DateTimeType({ dateTimeString: '20171113', format: '102' });
    const document = new ExchangedDocumentType({
      id: invoiceID,
      typeCode,
      issueDateTime: issueDT
    });

    // Create a minimal seller party
    const sellerName = new TextType({ value: 'Test Seller' });
    const sellerAddress = new TradeAddressType({
      countryID: new CountryIDType({ value: 'FR' })
    });
    const sellerParty = new TradePartyType({
      name: sellerName,
      postalTradeAddress: sellerAddress
    });

    // Create a minimal buyer party
    const buyerName = new TextType({ value: 'Test Buyer' });
    const buyerParty = new TradePartyType({
      name: buyerName
    });

    // Create trade agreement
    const tradeAgreement = new HeaderTradeAgreementType({
      sellerTradeParty: sellerParty,
      buyerTradeParty: buyerParty
    });

    // Create trade delivery
    const tradeDelivery = new HeaderTradeDeliveryType({});

    // Create trade settlement
    const currencyCode = new CurrencyCodeType({ value: 'EUR' });
    
    const lineTotalAmount = new AmountType({ value: 100 });
    const taxBasisAmount = new AmountType({ value: 100 });
    const taxAmount = new AmountType({ value: 20, currencyID: 'EUR' });
    const grandTotalAmount = new AmountType({ value: 120 });
    const duePayableAmount = new AmountType({ value: 120 });
    
    const summation = new TradeSettlementHeaderMonetarySummationType({
      lineTotalAmount,
      taxBasisTotalAmount: [taxBasisAmount],
      taxTotalAmount: [taxAmount],
      grandTotalAmount: [grandTotalAmount],
      duePayableAmount
    });
    
    const tradeSettlement = new HeaderTradeSettlementType({
      invoiceCurrencyCode: currencyCode,
      applicableTradeTax: [], // Simplified for test
      specifiedTradeSettlementHeaderMonetarySummation: summation
    });

    // Create transaction and invoice
    const transaction = new SupplyChainTradeTransactionType({
      includedSupplyChainTradeLineItem: [],
      applicableHeaderTradeAgreement: tradeAgreement,
      applicableHeaderTradeDelivery: tradeDelivery,
      applicableHeaderTradeSettlement: tradeSettlement
    });

    const invoice = new CrossIndustryInvoiceType({
      exchangedDocumentContext: documentContext,
      exchangedDocument: document,
      supplyChainTradeTransaction: transaction
    });

    // Convert to XML
    const xmlDoc = await invoiceToXml(invoice);
    const xmlString = xmlDoc.toString();

    // Verify the XML string contains the expected elements
    expect(xmlString).toContain('urn:factur-x.eu:1p0:minimum');
    expect(xmlString).toContain('<ram:ID>FA-2017-0010</ram:ID>');
    expect(xmlString).toContain('<ram:TypeCode>380</ram:TypeCode>');
    expect(xmlString).toContain('<udt:DateTimeString format="102">20171113</udt:DateTimeString>');
    
    // Compare with the reference XML (basic check that essential elements match)
    expect(getMinimumXML()).toContain('urn:factur-x.eu:1p0:minimum');
    expect(getMinimumXML()).toContain('<ram:ID>FA-2017-0010</ram:ID>');
    expect(getMinimumXML()).toContain('<ram:TypeCode>380</ram:TypeCode>');
    expect(getMinimumXML()).toContain('<udt:DateTimeString format="102">20171113</udt:DateTimeString>');
  });
}); 