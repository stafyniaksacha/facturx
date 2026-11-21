import { invoiceToXml } from '@stafyniaksacha/facturx'
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
  TextType,
  TradeAddressType,
  TradePartyType,
  TradeSettlementHeaderMonetarySummationType,
} from '@stafyniaksacha/facturx/models'

import { describe, expect, it } from 'vitest'

import { getMinimumXML } from './fixtures/xml'

describe('facturX XML Converter', () => {
  it('should convert a minimum Factur-X model to valid XML', async () => {
    // Create a minimal valid invoice model
    // Document context
    const guidelineID = new IDType({ value: 'urn:factur-x.eu:1p0:minimum' })
    const guidelineParameter = new DocumentContextParameterType({ id: guidelineID })
    const documentContext = new ExchangedDocumentContextType({
      guidelineSpecifiedDocumentContextParameter: guidelineParameter,
    })

    // Document
    const invoiceID = new IDType({ value: 'FA-2017-0010' })
    const typeCode = new DocumentCodeType({ value: '380' })
    const issueDT = new DateTimeType({ dateTimeString: '20171113', format: '102' })
    const document = new ExchangedDocumentType({
      id: invoiceID,
      typeCode,
      issueDateTime: issueDT,
    })

    // Seller and buyer
    const sellerName = new TextType({ value: 'Au bon moulin' })
    const sellerLegalID = new IDType({ value: '99999999800010', schemeID: '0002' })
    const sellerLegalOrg = { id: sellerLegalID }
    const sellerAddress = new TradeAddressType({
      countryID: new CountryIDType({ value: 'FR' }),
    })
    const sellerTaxID = new IDType({ value: 'FR11999999998', schemeID: 'VA' })
    const sellerTaxReg = [{ id: sellerTaxID }]
    const sellerParty = new TradePartyType({
      name: sellerName,
      specifiedLegalOrganization: sellerLegalOrg,
      postalTradeAddress: sellerAddress,
      specifiedTaxRegistration: sellerTaxReg,
    })

    const buyerName = new TextType({ value: 'Ma jolie boutique' })
    const buyerLegalID = new IDType({ value: '78787878400035', schemeID: '0002' })
    const buyerLegalOrg = { id: buyerLegalID }
    const buyerParty = new TradePartyType({
      name: buyerName,
      specifiedLegalOrganization: buyerLegalOrg,
    })

    // Buyer order reference
    const buyerOrderID = new IDType({ value: 'PO445' })
    const buyerOrderRef = { issuerAssignedID: buyerOrderID }

    // Trade agreement
    const tradeAgreement = new HeaderTradeAgreementType({
      sellerTradeParty: sellerParty,
      buyerTradeParty: buyerParty,
      buyerOrderReferencedDocument: buyerOrderRef,
    })

    // Trade delivery
    const tradeDelivery = new HeaderTradeDeliveryType({})

    // Trade settlement
    const currencyCode = new CurrencyCodeType({ value: 'EUR' })

    const lineTotalAmount = new AmountType({ value: 624.90 })
    const taxBasisAmount = new AmountType({ value: 624.90 })
    const taxAmount = new AmountType({ value: 46.25, currencyID: 'EUR' })
    const grandTotalAmount = new AmountType({ value: 671.15 })
    const duePayableAmount = new AmountType({ value: 470.15 })

    const summation = new TradeSettlementHeaderMonetarySummationType({
      lineTotalAmount,
      taxBasisTotalAmount: taxBasisAmount,
      taxTotalAmount: [taxAmount],
      grandTotalAmount,
      duePayableAmount,
    })

    const tradeSettlement = new HeaderTradeSettlementType({
      invoiceCurrencyCode: currencyCode,
      applicableTradeTax: [], // Simplified for test
      specifiedTradeSettlementHeaderMonetarySummation: summation,
    })

    // Supply chain transaction
    const transaction = new SupplyChainTradeTransactionType({
      includedSupplyChainTradeLineItem: [],
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

    // Convert to XML
    const xmlDoc = await invoiceToXml(invoice)
    const xmlString = xmlDoc.toString()

    // Verify basic structure elements are present
    expect(xmlString).toContain('<rsm:CrossIndustryInvoice')
    expect(xmlString).toContain('<rsm:ExchangedDocumentContext>')
    expect(xmlString).toContain('<ram:GuidelineSpecifiedDocumentContextParameter>')
    expect(xmlString).toContain('<ram:ID>urn:factur-x.eu:1p0:minimum</ram:ID>')
    expect(xmlString).toContain('<rsm:ExchangedDocument>')
    expect(xmlString).toContain('<ram:ID>FA-2017-0010</ram:ID>')
    expect(xmlString).toContain('<ram:TypeCode>380</ram:TypeCode>')
    expect(xmlString).toContain('<udt:DateTimeString format="102">20171113</udt:DateTimeString>')

    // Verify seller and buyer
    expect(xmlString).toContain('<ram:SellerTradeParty>')
    expect(xmlString).toContain('<ram:Name>Au bon moulin</ram:Name>')
    expect(xmlString).toContain('<ram:BuyerTradeParty>')
    expect(xmlString).toContain('<ram:Name>Ma jolie boutique</ram:Name>')

    // Verify monetary summation
    expect(xmlString).toContain('<ram:TaxBasisTotalAmount>624.90</ram:TaxBasisTotalAmount>')
    expect(xmlString).toContain('<ram:TaxTotalAmount currencyID="EUR">46.25</ram:TaxTotalAmount>')
    expect(xmlString).toContain('<ram:GrandTotalAmount>671.15</ram:GrandTotalAmount>')
    expect(xmlString).toContain('<ram:DuePayableAmount>470.15</ram:DuePayableAmount>')
  })

  it('should generate XML similar to reference XML', async () => {
    // Create a minimal invoice model
    const guidelineID = new IDType({ value: 'urn:factur-x.eu:1p0:minimum' })
    const guidelineParameter = new DocumentContextParameterType({ id: guidelineID })
    const documentContext = new ExchangedDocumentContextType({
      guidelineSpecifiedDocumentContextParameter: guidelineParameter,
    })

    const invoiceID = new IDType({ value: 'FA-2017-0010' })
    const typeCode = new DocumentCodeType({ value: '380' })
    const issueDT = new DateTimeType({ dateTimeString: '20171113', format: '102' })
    const document = new ExchangedDocumentType({
      id: invoiceID,
      typeCode,
      issueDateTime: issueDT,
    })

    // Create a minimal seller party
    const sellerName = new TextType({ value: 'Test Seller' })
    const sellerAddress = new TradeAddressType({
      countryID: new CountryIDType({ value: 'FR' }),
    })
    const sellerParty = new TradePartyType({
      name: sellerName,
      postalTradeAddress: sellerAddress,
    })

    // Create a minimal buyer party
    const buyerName = new TextType({ value: 'Test Buyer' })
    const buyerParty = new TradePartyType({
      name: buyerName,
    })

    // Create trade agreement
    const tradeAgreement = new HeaderTradeAgreementType({
      sellerTradeParty: sellerParty,
      buyerTradeParty: buyerParty,
    })

    // Create trade delivery
    const tradeDelivery = new HeaderTradeDeliveryType({})

    // Create trade settlement
    const currencyCode = new CurrencyCodeType({ value: 'EUR' })

    const lineTotalAmount = new AmountType({ value: 100 })
    const taxBasisAmount = new AmountType({ value: 100 })
    const taxAmount = new AmountType({ value: 20, currencyID: 'EUR' })
    const grandTotalAmount = new AmountType({ value: 120 })
    const duePayableAmount = new AmountType({ value: 120 })

    const summation = new TradeSettlementHeaderMonetarySummationType({
      lineTotalAmount,
      taxBasisTotalAmount: taxBasisAmount,
      taxTotalAmount: [taxAmount],
      grandTotalAmount,
      duePayableAmount,
    })

    const tradeSettlement = new HeaderTradeSettlementType({
      invoiceCurrencyCode: currencyCode,
      applicableTradeTax: [], // Simplified for test
      specifiedTradeSettlementHeaderMonetarySummation: summation,
    })

    // Create transaction and invoice
    const transaction = new SupplyChainTradeTransactionType({
      includedSupplyChainTradeLineItem: [],
      applicableHeaderTradeAgreement: tradeAgreement,
      applicableHeaderTradeDelivery: tradeDelivery,
      applicableHeaderTradeSettlement: tradeSettlement,
    })

    const invoice = new CrossIndustryInvoiceType({
      exchangedDocumentContext: documentContext,
      exchangedDocument: document,
      supplyChainTradeTransaction: transaction,
    })

    // Convert to XML
    const xmlDoc = await invoiceToXml(invoice)
    const xmlString = xmlDoc.toString()

    // Verify the XML string contains the expected elements
    expect(xmlString).toContain('urn:factur-x.eu:1p0:minimum')
    expect(xmlString).toContain('<ram:ID>FA-2017-0010</ram:ID>')
    expect(xmlString).toContain('<ram:TypeCode>380</ram:TypeCode>')
    expect(xmlString).toContain('<udt:DateTimeString format="102">20171113</udt:DateTimeString>')

    // Compare with the reference XML (basic check that essential elements match)
    expect(getMinimumXML()).toContain('urn:factur-x.eu:1p0:minimum')
    expect(getMinimumXML()).toContain('<ram:ID>FA-2017-0010</ram:ID>')
    expect(getMinimumXML()).toContain('<ram:TypeCode>380</ram:TypeCode>')
    expect(getMinimumXML()).toContain('<udt:DateTimeString format="102">20171113</udt:DateTimeString>')
  })
})

// CG-74 (closed): `addElement('ram:X')` alone names the element `ram:X` with no namespace in memory. The converter now
// creates every element through `qname()` (local name + namespace prefix), so its nodes carry the CII namespaces and
// the serialised text is unchanged; nothing is re-parsed.
describe('invoiceToXml: namespaces of the returned document (CG-74)', () => {
  const NS = {
    rsm: 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
    ram: 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
  }
  const UC1 = '../spec/afnor-xp-z12-012-1.4/distribution/XP_Z12-012_Annexe_B_EXEMPLES_V1.4/Factures/F202500003/_EN16931/UC1_F202500003_00-INV_20250701_EN16931_FX_CII_Commentee.xml'

  it('carries the CII namespaces in memory: namespace-bound XPath works, and check() reads it in place', async () => {
    const { check, xmlToInvoice } = await import('@stafyniaksacha/facturx')
    const { XmlDocument } = await import('libxml2-wasm')
    const { readFile } = await import('node:fs/promises')
    const { resolve } = await import('node:path')
    const doc = await invoiceToXml(await xmlToInvoice(await readFile(resolve(import.meta.dirname, UC1), 'utf8')))
    try {
      expect(doc.root.namespaceUri).toBe(NS.rsm)
      expect(doc.find('/rsm:CrossIndustryInvoice/rsm:ExchangedDocument/ram:ID', NS)).toHaveLength(1)
      const child = doc.get('/*/*') as unknown as { name: string, namespaceUri: string }
      expect([child.name, child.namespaceUri]).toEqual(['ExchangedDocumentContext', NS.rsm])
      // The text is the one written: re-parsing it again changes nothing.
      const again = XmlDocument.fromString(doc.toString())
      try {
        expect(again.toString()).toBe(doc.toString())
      }
      finally {
        again.dispose()
      }
      // The old in-memory shape had no namespaces, so `check()` on the document itself found no BT-24.
      const result = await check({ xml: doc, schematron: true })
      expect([result.valid, result.flavor, result.level]).toEqual([true, 'facturx', 'en16931'])
      expect(doc.root.name).toBe('CrossIndustryInvoice')
    }
    finally {
      doc.dispose()
    }
  })

  it('round-trips escaping, CR, tab and non-ASCII text', async () => {
    const { xmlToInvoice } = await import('@stafyniaksacha/facturx')
    const { readFile } = await import('node:fs/promises')
    const { resolve } = await import('node:path')
    const model = await xmlToInvoice(await readFile(resolve(import.meta.dirname, UC1), 'utf8'))
    const text = 'a & b < c > d " e \' f\r\ng\th é € 𝄞 ]]> &amp;'
    model.exchangedDocument.includedNote![0].content = new TextType({ value: text })
    const doc = await invoiceToXml(model)
    try {
      expect((await xmlToInvoice(doc.toString())).exchangedDocument.includedNote![0].content.value).toBe(text)
    }
    finally {
      doc.dispose()
    }
  })

  // CG-76 (open): libxml2's default limit (XML_MAX_TEXT_LENGTH, 10 MB per text node) without XML_PARSE_HUGE, which
  // AGENTS.md forbids for input documents, applies to every parse of a document. `invoiceToXml()` parses nothing, so it
  // writes such a value (a large BT-125 attachment, up to 100 MB in the Chorus Pro note of spec p.124); the readers,
  // and `invoiceToUbl()`, which re-parses for its attributes, refuse it.
  it('writes a text node over 10 MB, which the readers and invoiceToUbl refuse (CG-76)', async () => {
    const { check, dropUblUncarried, fromCii, generate, invoiceToUbl, ublToInvoice, xmlToInvoice } = await import('@stafyniaksacha/facturx')
    const { readFile } = await import('node:fs/promises')
    const { resolve } = await import('node:path')
    const { PDFDocument } = await import('pdf-lib')
    const A = 'A'.repeat(10 * 1024 * 1024 + 1)
    const source = await readFile(resolve(import.meta.dirname, UC1), 'utf8')
    const model = await xmlToInvoice(source)
    model.exchangedDocument.includedNote![0].content = new TextType({ value: A })
    const cii = await invoiceToXml(model)
    let big: string
    try {
      big = cii.toString()
      expect(big).toContain(A)
    }
    finally {
      cii.dispose()
    }
    await expect(xmlToInvoice(big)).rejects.toThrow(/Text node too long/)
    await expect(check({ xml: big })).rejects.toThrow(/Text node too long/)
    const pdf = await PDFDocument.create()
    pdf.addPage()
    await expect(generate({ pdf, xml: big })).rejects.toThrow(/Text node too long/)
    const { invoice } = dropUblUncarried(fromCii(await xmlToInvoice(source)).invoice, { level: 'en16931' })
    invoice.buyerReference = A
    await expect(invoiceToUbl(invoice, { level: 'en16931' })).rejects.toThrow(/Text node too long/)
    const ubl = (await readFile(resolve(import.meta.dirname, UC1.replace('_FX_CII_', '_UBL_')), 'utf8')).replace(/<cbc:BuyerReference>[^<]*</, `<cbc:BuyerReference>${A}<`)
    expect(ubl).toContain(A)
    await expect(ublToInvoice(ubl)).rejects.toThrow(/Text node too long/)
  }, 30_000)
})
