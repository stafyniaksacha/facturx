import type { CrossIndustryInvoiceType } from '@stafyniaksacha/facturx/models'
import { check, invoiceToXml, xmlToInvoice } from '@stafyniaksacha/facturx'
import {
  AccountingAccountTypeCodeType,
  AdvancePaymentType,
  AllowanceChargeReasonCodeType,
  AmountType,
  CodeType,
  CurrencyCodeType,
  DateTimeType,
  DocumentCodeType,
  DocumentContextParameterType,
  FormattedDateTimeType,
  IDType,
  LogisticsTransportMovementType,
  MeasureType,
  NoteType,
  PartyRoleCodeType,
  PaymentMeansCodeType,
  ProcuringProjectType,
  ProductCharacteristicType,
  QuantityType,
  RateType,
  ReferencedDocumentType,
  ReferencedProductType,
  SupplyChainConsignmentType,
  TaxCategoryCodeType,
  TaxTypeCodeType,
  TextType,
  TradeAccountingAccountType,
  TradeCurrencyExchangeType,
  TradeProductInstanceType,
  TradeSettlementFinancialCardType,
  TradeSettlementLineMonetarySummationType,
  TradeSettlementPaymentMeansType,
  TradeTaxType,
  TransportModeCodeType,
} from '@stafyniaksacha/facturx/models'
import { describe, expect, it } from 'vitest'
import { getBasicFacturXModel } from './fixtures/model-basic'
import { getBasicWLFacturXModel } from './fixtures/model-basicwl'
import { getEN16931FacturXModel } from './fixtures/model-en16931'
import { getExtendedFacturXModel } from './fixtures/model-extended'
import { xmlPaths } from './fixtures/xml-paths'

// The parser must read back everything the converter writes (AGENTS.md lockstep convention). A model
// round trip cannot show a drop when both sides go through the parser, so these tests compare the
// element and attribute paths of the XML written before and after `xmlToInvoice()`.
// Cardinalities: spec/factur-x-1.09/text/fields--Factur-X_CII_D22B_EXTENDED.csv and the EXTENDED XSD.

const TRANSACTION = '/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction'
const SETTLEMENT = `${TRANSACTION}/ram:ApplicableHeaderTradeSettlement`
const PRODUCT = `${TRANSACTION}/ram:IncludedSupplyChainTradeLineItem/ram:SpecifiedTradeProduct`

const eur = (value: number) => new AmountType({ value, currencyID: 'EUR' })

/** The EXTENDED fixture with each subtree the parser used to drop set, every optional child included. */
function modelWithEverySubtree(): CrossIndustryInvoiceType {
  const model = getExtendedFacturXModel()
  const transaction = model.supplyChainTradeTransaction
  const settlement = transaction.applicableHeaderTradeSettlement
  const product = transaction.includedSupplyChainTradeLineItem![0].specifiedTradeProduct

  // BG-X-41 tax currency exchange (BT-X-258…261)
  settlement.taxApplicableTradeCurrencyExchange = new TradeCurrencyExchangeType({
    sourceCurrencyCode: new CurrencyCodeType({ value: 'EUR' }),
    targetCurrencyCode: new CurrencyCodeType({ value: 'CHF' }),
    conversionRate: new RateType({ value: 0.937512 }),
    conversionRateDateTime: new DateTimeType({ dateTimeString: '20230401', format: '102' }),
  })

  // BG-X-45 advance payment (BT-X-291…298, BG-X-85 BT-X-558…560)
  settlement.specifiedAdvancePayment = [
    new AdvancePaymentType({
      paidAmount: eur(10),
      formattedReceivedDateTime: new FormattedDateTimeType({ dateTimeString: '20230315', format: '102' }),
      includedTradeTax: [
        new TradeTaxType({
          calculatedAmount: eur(1.67),
          typeCode: new TaxTypeCodeType({ value: 'VAT' }),
          exemptionReason: new TextType({ value: 'Acompte & <reçu> à Zürich' }),
          categoryCode: new TaxCategoryCodeType({ value: 'S' }),
          exemptionReasonCode: new CodeType({ value: 'VATEX-EU-79-C' }),
          rateApplicablePercent: { value: 20 },
        }),
        new TradeTaxType({
          calculatedAmount: eur(0),
          typeCode: new TaxTypeCodeType({ value: 'VAT' }),
          categoryCode: new TaxCategoryCodeType({ value: 'S' }),
          rateApplicablePercent: { value: 10 },
        }),
      ],
      invoiceSpecifiedReferencedDocument: new ReferencedDocumentType({
        issuerAssignedID: new IDType({ value: 'ACOMPTE-001' }),
        typeCode: new DocumentCodeType({ value: '386' }),
        formattedIssueDateTime: new FormattedDateTimeType({ dateTimeString: '20230310', format: '102' }),
      }),
    }),
    new AdvancePaymentType({
      paidAmount: eur(0),
      includedTradeTax: [new TradeTaxType({
        calculatedAmount: eur(0),
        typeCode: new TaxTypeCodeType({ value: 'VAT' }),
        categoryCode: new TaxCategoryCodeType({ value: 'S' }),
        rateApplicablePercent: { value: 20 },
      })],
    }),
  ]

  // BG-X-24 consignment, BT-X-152 transport mode
  transaction.applicableHeaderTradeDelivery.relatedSupplyChainConsignment = new SupplyChainConsignmentType({
    specifiedLogisticsTransportMovement: [
      new LogisticsTransportMovementType({ modeCode: new TransportModeCodeType({ value: '3' }) }),
      new LogisticsTransportMovementType({ modeCode: new TransportModeCodeType({ value: '1' }) }),
    ],
  })

  // BG-X-84 item instances (BT-X-306, BT-X-307)
  product.individualTradeProductInstance = [
    new TradeProductInstanceType({
      batchID: new IDType({ value: 'LOT-Ä1' }),
      supplierAssignedSerialID: new IDType({ value: 'SN-0001', schemeID: 'S' }),
    }),
    new TradeProductInstanceType({ supplierAssignedSerialID: new IDType({ value: 'SN-0002' }) }),
  ]

  // BG-X-1 included items (BT-X-308, BT-X-15/15-1, BT-X-16, BT-X-17, BT-X-309, BT-X-18…20-1)
  product.includedReferencedProduct = [
    new ReferencedProductType({
      id: new IDType({ value: 'INC-1' }),
      globalID: [
        new IDType({ value: '4012345678901', schemeID: '0160' }),
        new IDType({ value: '0614141000012', schemeID: '0088' }),
      ],
      sellerAssignedID: new IDType({ value: 'S-INC-1' }),
      buyerAssignedID: new IDType({ value: 'B-INC-1' }),
      industryAssignedID: new IDType({ value: 'I-INC-1' }),
      name: new TextType({ value: 'Câble & <connecteur>' }),
      description: new TextType({ value: 'Œuvre incluse' }),
      unitQuantity: new QuantityType({ value: 2.5, unitCode: 'MTR' }),
    }),
    new ReferencedProductType({ name: new TextType({ value: 'Notice' }) }),
  ]

  // BG-32 item attributes, every child
  product.applicableProductCharacteristic = [
    new ProductCharacteristicType({
      typeCode: new CodeType({ value: 'COL' }),
      description: new TextType({ value: 'Couleur' }),
      valueMeasure: new MeasureType({ value: 0.125, unitCode: 'MMT' }),
      value: new TextType({ value: 'Rouge & <noir>' }),
    }),
  ]

  // Identifiers the converter writes with @schemeID: the parser must keep it.
  model.exchangedDocumentContext.businessProcessSpecifiedDocumentContextParameter = new DocumentContextParameterType({
    id: new IDType({ value: 'A1', schemeID: 'BP' }),
  })
  model.exchangedDocumentContext.guidelineSpecifiedDocumentContextParameter.id.schemeID = 'GL'
  model.exchangedDocument.id.schemeID = 'DOC'
  transaction.includedSupplyChainTradeLineItem![0].associatedDocumentLineDocument.lineID.schemeID = 'LN'
  transaction.applicableHeaderTradeAgreement.specifiedProcuringProject = new ProcuringProjectType({
    id: new IDType({ value: 'PRJ-1', schemeID: 'PJ' }),
    name: new TextType({ value: 'Projet Éole' }),
  })
  settlement.specifiedTradeSettlementPaymentMeans = [
    ...settlement.specifiedTradeSettlementPaymentMeans ?? [],
    new TradeSettlementPaymentMeansType({
      typeCode: new PaymentMeansCodeType({ value: '48' }),
      applicableTradeSettlementFinancialCard: new TradeSettlementFinancialCardType({
        id: new IDType({ value: '1234', schemeID: 'CARD' }),
        cardholderName: new TextType({ value: 'J. Dupont' }),
      }),
    }),
  ]
  settlement.specifiedTradeSettlementPaymentMeans
    .find(m => m.payerPartyDebtorFinancialAccount)!
    .payerPartyDebtorFinancialAccount!
    .ibanID
    .schemeID = 'IBAN'
  settlement.receivableSpecifiedTradeAccountingAccount = [
    new TradeAccountingAccountType({
      id: new IDType({ value: '411000', schemeID: 'ACC' }),
      typeCode: new AccountingAccountTypeCodeType({ value: '1' }),
    }),
  ]

  return model
}

// One path per field the test sets, so a subtree left unset cannot pass the comparison silently.
const EXPECTED_PATHS = [
  `${SETTLEMENT}/ram:TaxApplicableTradeCurrencyExchange/ram:SourceCurrencyCode`,
  `${SETTLEMENT}/ram:TaxApplicableTradeCurrencyExchange/ram:TargetCurrencyCode`,
  `${SETTLEMENT}/ram:TaxApplicableTradeCurrencyExchange/ram:ConversionRate`,
  `${SETTLEMENT}/ram:TaxApplicableTradeCurrencyExchange/ram:ConversionRateDateTime/udt:DateTimeString/@format`,
  `${SETTLEMENT}/ram:SpecifiedAdvancePayment/ram:PaidAmount/@currencyID`,
  `${SETTLEMENT}/ram:SpecifiedAdvancePayment/ram:FormattedReceivedDateTime/qdt:DateTimeString/@format`,
  `${SETTLEMENT}/ram:SpecifiedAdvancePayment/ram:IncludedTradeTax/ram:CalculatedAmount/@currencyID`,
  `${SETTLEMENT}/ram:SpecifiedAdvancePayment/ram:IncludedTradeTax/ram:TypeCode`,
  `${SETTLEMENT}/ram:SpecifiedAdvancePayment/ram:IncludedTradeTax/ram:ExemptionReason`,
  `${SETTLEMENT}/ram:SpecifiedAdvancePayment/ram:IncludedTradeTax/ram:CategoryCode`,
  `${SETTLEMENT}/ram:SpecifiedAdvancePayment/ram:IncludedTradeTax/ram:ExemptionReasonCode`,
  `${SETTLEMENT}/ram:SpecifiedAdvancePayment/ram:IncludedTradeTax/ram:RateApplicablePercent`,
  `${SETTLEMENT}/ram:SpecifiedAdvancePayment/ram:InvoiceSpecifiedReferencedDocument/ram:IssuerAssignedID`,
  `${SETTLEMENT}/ram:SpecifiedAdvancePayment/ram:InvoiceSpecifiedReferencedDocument/ram:TypeCode`,
  `${SETTLEMENT}/ram:SpecifiedAdvancePayment/ram:InvoiceSpecifiedReferencedDocument/ram:FormattedIssueDateTime/qdt:DateTimeString/@format`,
  `${TRANSACTION}/ram:ApplicableHeaderTradeDelivery/ram:RelatedSupplyChainConsignment/ram:SpecifiedLogisticsTransportMovement/ram:ModeCode`,
  `${PRODUCT}/ram:IndividualTradeProductInstance/ram:BatchID`,
  `${PRODUCT}/ram:IndividualTradeProductInstance/ram:SupplierAssignedSerialID/@schemeID`,
  `${PRODUCT}/ram:IncludedReferencedProduct/ram:ID`,
  `${PRODUCT}/ram:IncludedReferencedProduct/ram:GlobalID/@schemeID`,
  `${PRODUCT}/ram:IncludedReferencedProduct/ram:SellerAssignedID`,
  `${PRODUCT}/ram:IncludedReferencedProduct/ram:BuyerAssignedID`,
  `${PRODUCT}/ram:IncludedReferencedProduct/ram:IndustryAssignedID`,
  `${PRODUCT}/ram:IncludedReferencedProduct/ram:Name`,
  `${PRODUCT}/ram:IncludedReferencedProduct/ram:Description`,
  `${PRODUCT}/ram:IncludedReferencedProduct/ram:UnitQuantity/@unitCode`,
  `${PRODUCT}/ram:ApplicableProductCharacteristic/ram:TypeCode`,
  `${PRODUCT}/ram:ApplicableProductCharacteristic/ram:Description`,
  `${PRODUCT}/ram:ApplicableProductCharacteristic/ram:ValueMeasure/@unitCode`,
  `${PRODUCT}/ram:ApplicableProductCharacteristic/ram:Value`,
  '/rsm:CrossIndustryInvoice/rsm:ExchangedDocumentContext/ram:BusinessProcessSpecifiedDocumentContextParameter/ram:ID/@schemeID',
  '/rsm:CrossIndustryInvoice/rsm:ExchangedDocumentContext/ram:GuidelineSpecifiedDocumentContextParameter/ram:ID/@schemeID',
  '/rsm:CrossIndustryInvoice/rsm:ExchangedDocument/ram:ID/@schemeID',
  `${TRANSACTION}/ram:IncludedSupplyChainTradeLineItem/ram:AssociatedDocumentLineDocument/ram:LineID/@schemeID`,
  `${TRANSACTION}/ram:ApplicableHeaderTradeAgreement/ram:SpecifiedProcuringProject/ram:ID/@schemeID`,
  `${SETTLEMENT}/ram:SpecifiedTradeSettlementPaymentMeans/ram:ApplicableTradeSettlementFinancialCard/ram:ID/@schemeID`,
  `${SETTLEMENT}/ram:SpecifiedTradeSettlementPaymentMeans/ram:PayerPartyDebtorFinancialAccount/ram:IBANID/@schemeID`,
  `${SETTLEMENT}/ram:ReceivableSpecifiedTradeAccountingAccount/ram:ID/@schemeID`,
]

describe('xmlToInvoice reads back everything invoiceToXml writes', () => {
  it('keeps every element and attribute of the EXTENDED subtrees (path comparison both ways)', async () => {
    const written = (await invoiceToXml(modelWithEverySubtree())).toString()
    const paths = xmlPaths(written)
    expect(EXPECTED_PATHS.filter(p => !paths.includes(p))).toEqual([])

    // The input is a valid EXTENDED document, so the comparison is about data the spec allows.
    const xsd = await check({ xml: written, level: 'extended' })
    expect(xsd.errors).toEqual([])

    const parsed = await xmlToInvoice(written)
    const rewritten = (await invoiceToXml(parsed)).toString()
    // Same multiset of paths: nothing dropped (left) and nothing fabricated (right).
    expect(xmlPaths(rewritten)).toEqual(paths)
    // Values too: decimals, escaping and non-ASCII text survive unchanged.
    expect(rewritten).toBe(written)
    expect(await xmlToInvoice(rewritten)).toEqual(parsed)
  })

  it('reads the subtrees into the model', async () => {
    const parsed = await xmlToInvoice((await invoiceToXml(modelWithEverySubtree())).toString())
    const settlement = parsed.supplyChainTradeTransaction.applicableHeaderTradeSettlement
    const product = parsed.supplyChainTradeTransaction.includedSupplyChainTradeLineItem![0].specifiedTradeProduct

    expect(settlement.taxApplicableTradeCurrencyExchange?.conversionRate.value).toBe(0.937512)
    expect(settlement.taxApplicableTradeCurrencyExchange?.conversionRateDateTime?.dateTimeString).toBe('20230401')
    expect(settlement.specifiedAdvancePayment).toHaveLength(2)
    expect(settlement.specifiedAdvancePayment![0].paidAmount).toEqual(eur(10))
    expect(settlement.specifiedAdvancePayment![0].includedTradeTax[0].exemptionReason?.value).toBe('Acompte & <reçu> à Zürich')
    expect(settlement.specifiedAdvancePayment![0].invoiceSpecifiedReferencedDocument?.issuerAssignedID?.value).toBe('ACOMPTE-001')
    expect(parsed.supplyChainTradeTransaction.applicableHeaderTradeDelivery.relatedSupplyChainConsignment?.specifiedLogisticsTransportMovement?.map(m => m.modeCode.value)).toEqual(['3', '1'])
    expect(product.individualTradeProductInstance?.[0].batchID?.value).toBe('LOT-Ä1')
    expect(product.individualTradeProductInstance?.[0].supplierAssignedSerialID).toEqual(new IDType({ value: 'SN-0001', schemeID: 'S' }))
    expect(product.includedReferencedProduct?.[0].globalID?.map(g => g.schemeID)).toEqual(['0160', '0088'])
    expect(product.includedReferencedProduct?.[0].unitQuantity).toEqual(new QuantityType({ value: 2.5, unitCode: 'MTR' }))
    expect(parsed.exchangedDocument.id).toEqual(new IDType({ value: 'INV-2023-003', schemeID: 'DOC' }))
  })
})

describe('1.09 EXTENDED 0..1 fields stay absent (BT-131, BT-160, BT-161)', () => {
  /** A subline with no line net amount, and attributes with only a name, only a value, or neither. */
  function modelWithAbsentFields(): CrossIndustryInvoiceType {
    const model = getExtendedFacturXModel()
    const lines = model.supplyChainTradeTransaction.includedSupplyChainTradeLineItem!
    lines[1].associatedDocumentLineDocument.parentLineID = new IDType({ value: '1' })
    lines[1].specifiedLineTradeSettlement.specifiedTradeSettlementLineMonetarySummation = new TradeSettlementLineMonetarySummationType({})
    lines[1].specifiedTradeProduct.applicableProductCharacteristic = [
      new ProductCharacteristicType({ description: new TextType({ value: 'Taille' }) }),
      new ProductCharacteristicType({ value: new TextType({ value: 'XL' }) }),
      new ProductCharacteristicType({ typeCode: new CodeType({ value: 'WGT' }), valueMeasure: new MeasureType({ value: 1.5, unitCode: 'KGM' }) }),
      // Present but empty is kept as present.
      new ProductCharacteristicType({ description: new TextType({ value: '' }), value: new TextType({ value: '' }) }),
    ]
    return model
  }

  it('is XSD valid without them, and the round trip does not add them', async () => {
    const written = (await invoiceToXml(modelWithAbsentFields())).toString()
    expect((await check({ xml: written, level: 'extended' })).errors).toEqual([])
    expect(written).toContain('<ram:SpecifiedTradeSettlementLineMonetarySummation/>')

    const parsed = await xmlToInvoice(written)
    const line = parsed.supplyChainTradeTransaction.includedSupplyChainTradeLineItem![1]
    expect(line.specifiedLineTradeSettlement.specifiedTradeSettlementLineMonetarySummation?.lineTotalAmount).toBeUndefined()
    const characteristics = line.specifiedTradeProduct.applicableProductCharacteristic!
    expect(characteristics.map(c => [c.description?.value, c.value?.value])).toEqual([
      ['Taille', undefined],
      [undefined, 'XL'],
      [undefined, undefined],
      ['', ''],
    ])

    const rewritten = (await invoiceToXml(parsed)).toString()
    expect(xmlPaths(rewritten)).toEqual(xmlPaths(written))
    expect(rewritten).toBe(written)
  })
})

describe('present-but-empty optional elements stay present', () => {
  it('keeps an empty business process ID, party RoleCode and allowance ReasonCode', async () => {
    const model = getExtendedFacturXModel()
    model.exchangedDocumentContext.businessProcessSpecifiedDocumentContextParameter = new DocumentContextParameterType({
      id: new IDType({ value: '', schemeID: 'X' }),
    })
    model.supplyChainTradeTransaction.applicableHeaderTradeAgreement.sellerTradeParty.roleCode = new PartyRoleCodeType({ value: '' })
    model.supplyChainTradeTransaction.applicableHeaderTradeSettlement.specifiedTradeAllowanceCharge![0].reasonCode = new AllowanceChargeReasonCodeType({ value: '' })

    const written = (await invoiceToXml(model)).toString()
    expect((await check({ xml: written, level: 'extended' })).errors).toEqual([])
    const rewritten = (await invoiceToXml(await xmlToInvoice(written))).toString()
    expect(xmlPaths(rewritten)).toEqual(xmlPaths(written))
    expect(rewritten).toBe(written)
  })
})

// CG-37 (fixed): the EXTENDED XSD makes NoteType/Content optional (`minOccurs="0"`), so a note without
// Content stays without one. CG37_ROUND_TRIP_LOSS pinned the old loss (an empty Content written back).
const CG37_ROUND_TRIP_LOSS = false
const NOTE_CONTENT = '/rsm:CrossIndustryInvoice/rsm:ExchangedDocument/ram:IncludedNote/ram:Content'
const LINE_NOTE_CONTENT = '/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:IncludedSupplyChainTradeLineItem/ram:AssociatedDocumentLineDocument/ram:IncludedNote/ram:Content'

describe('a note without Content (CG-37)', () => {
  it('stays without Content on a round trip', async () => {
    const model = getExtendedFacturXModel()
    // BR-FXEXT-01: a subject code (BT-21) needs a content code (BT-X-5) or a content (BT-22).
    model.exchangedDocument.includedNote = [new NoteType({ contentCode: new CodeType({ value: 'X1' }), subjectCode: new CodeType({ value: 'AAI' }) })]
    // BT-127 (line note) goes through the same NoteType.
    model.supplyChainTradeTransaction.includedSupplyChainTradeLineItem![0].associatedDocumentLineDocument.includedNote = [new NoteType({ contentCode: new CodeType({ value: 'X1' }) })]
    const written = (await invoiceToXml(model)).toString()
    const checked = await check({ xml: written, level: 'extended', schematron: true })
    expect(checked.errors).toEqual([])
    expect(checked.schematronErrors?.filter(e => e.id === 'BR-FXEXT-01')).toEqual([])
    expect(xmlPaths(written)).not.toContain(NOTE_CONTENT)
    expect(xmlPaths(written)).not.toContain(LINE_NOTE_CONTENT)

    const parsed = await xmlToInvoice(written)
    expect(parsed.exchangedDocument.includedNote?.[0].content).toBeUndefined()
    expect(parsed.supplyChainTradeTransaction.includedSupplyChainTradeLineItem![0].associatedDocumentLineDocument.includedNote?.[0].content).toBeUndefined()
    const rewritten = (await invoiceToXml(parsed)).toString()
    if (CG37_ROUND_TRIP_LOSS) {
      expect(rewritten).toContain('<ram:IncludedNote><ram:Content></ram:Content><ram:SubjectCode>AAI</ram:SubjectCode></ram:IncludedNote>')
      expect(xmlPaths(rewritten).filter(p => !xmlPaths(written).includes(p))).toEqual([NOTE_CONTENT])
    }
    else {
      expect(xmlPaths(rewritten)).toEqual(xmlPaths(written))
      expect(rewritten).toBe(written)
    }
  })

  it('keeps a present but empty Content', async () => {
    const model = getExtendedFacturXModel()
    model.exchangedDocument.includedNote = [new NoteType({ content: new TextType({ value: '' }), subjectCode: new CodeType({ value: 'AAI' }) })]
    const written = (await invoiceToXml(model)).toString()
    expect(written).toContain('<ram:IncludedNote><ram:Content></ram:Content><ram:SubjectCode>AAI</ram:SubjectCode></ram:IncludedNote>')
    const parsed = await xmlToInvoice(written)
    expect(parsed.exchangedDocument.includedNote?.[0].content?.value).toBe('')
    expect((await invoiceToXml(parsed)).toString()).toBe(written)
  })

  // Only the EXTENDED XSD makes Content optional: BASIC WL, BASIC and EN 16931 still require it, and
  // check() still reports a note without Content there (the type change loosens no check).
  it.each([
    ['basicwl', getBasicWLFacturXModel],
    ['basic', getBasicFacturXModel],
    ['en16931', getEN16931FacturXModel],
  ] as const)('is still rejected by the %s XSD', async (level, getModel) => {
    const model = getModel()
    model.exchangedDocument.includedNote = [new NoteType({ subjectCode: new CodeType({ value: 'AAI' }) })]
    const written = (await invoiceToXml(model)).toString()
    const result = await check({ xml: written, level })
    expect(result.valid).toBe(false)
    expect(JSON.stringify(result.errors)).toMatch(/SubjectCode.*Expected is \( \{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100\}Content \)/s)
  })
})
