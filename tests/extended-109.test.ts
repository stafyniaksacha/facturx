import type { CrossIndustryInvoiceType } from '@stafyniaksacha/facturx/models'
import { check, invoiceToXml, xmlToInvoice } from '@stafyniaksacha/facturx'
import {
  AllowanceChargeReasonCodeType,
  AmountType,
  CodeType,
  DebtorFinancialInstitutionType,
  IDType,
  IndicatorType,
  LogisticsServiceChargeType,
  TaxCategoryCodeType,
  TaxTypeCodeType,
  TextType,
  TradeAllowanceChargeType,
  TradeTaxType,
} from '@stafyniaksacha/facturx/models'
import { XmlDocument } from 'libxml2-wasm'
import { describe, expect, it } from 'vitest'
import { getExtendedFacturXModel } from './fixtures/model-extended'

// Fields added to EXTENDED by Factur-X 1.09 (§version history p.7), with their XPath and
// cardinality from spec/factur-x-1.09/text/fields--Factur-X_CII_D22B_EXTENDED.csv (all 0..1).
// BT-177 / BT-193 reuse the ReasonCode element of BT-105 / BT-145 with a UNTDID 5153 tax code.
const SETTLEMENT = '/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement'
const FIELDS: [string, string, string][] = [
  ['BT-173', `${SETTLEMENT}/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='false']/ram:CategoryTradeTax/ram:ExemptionReason`, 'Exonération remise & <test>'],
  ['BT-174', `${SETTLEMENT}/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='false']/ram:CategoryTradeTax/ram:ExemptionReasonCode`, 'VATEX-EU-132'],
  ['BT-175', `${SETTLEMENT}/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='true']/ram:CategoryTradeTax/ram:ExemptionReason`, 'Exonération frais'],
  ['BT-176', `${SETTLEMENT}/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='true']/ram:CategoryTradeTax/ram:ExemptionReasonCode`, 'VATEX-EU-143'],
  ['BT-177', `${SETTLEMENT}/ram:SpecifiedTradeAllowanceCharge[ram:ChargeIndicator/udt:Indicator='true']/ram:ReasonCode`, 'AAA'],
  ['BT-193', '/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:IncludedSupplyChainTradeLineItem[1]/ram:SpecifiedLineTradeSettlement/ram:SpecifiedTradeAllowanceCharge/ram:ReasonCode', 'ADK'],
  ['BT-215', `${SETTLEMENT}/ram:SpecifiedTradeSettlementPaymentMeans/ram:PayerSpecifiedDebtorFinancialInstitution/ram:BICID`, 'BNPAFRPP'],
  ['BT-216', `${SETTLEMENT}/ram:SpecifiedTradeSettlementPaymentMeans/ram:PayerPartyDebtorFinancialAccount/ram:AccountName`, 'Compte débiteur Œuvre'],
  ['BT-X-591', `${SETTLEMENT}/ram:SpecifiedLogisticsServiceCharge/ram:AppliedTradeTax/ram:ExemptionReason`, 'Exonération transport'],
]

const NS = {
  rsm: 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
  ram: 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
  udt: 'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100',
}

function exemptTax(reason: string, code: string): TradeTaxType {
  return new TradeTaxType({
    typeCode: new TaxTypeCodeType({ value: 'VAT' }),
    categoryCode: new TaxCategoryCodeType({ value: 'E' }),
    rateApplicablePercent: { value: 0 },
    exemptionReason: new TextType({ value: reason }),
    exemptionReasonCode: new CodeType({ value: code }),
  })
}

/** The EXTENDED fixture with every 1.09 EXTENDED addition set. */
function modelWith109Fields(): CrossIndustryInvoiceType {
  const model = getExtendedFacturXModel()
  const settlement = model.supplyChainTradeTransaction.applicableHeaderTradeSettlement
  const eur = (value: number) => new AmountType({ value, currencyID: 'EUR' })

  settlement.specifiedTradeAllowanceCharge = [
    new TradeAllowanceChargeType({
      chargeIndicator: new IndicatorType({ indicator: false }),
      actualAmount: eur(5),
      reason: new TextType({ value: 'Remise' }),
      categoryTradeTax: exemptTax('Exonération remise & <test>', 'VATEX-EU-132'),
    }),
    new TradeAllowanceChargeType({
      chargeIndicator: new IndicatorType({ indicator: true }),
      actualAmount: eur(2),
      reasonCode: new AllowanceChargeReasonCodeType({ value: 'AAA' }),
      categoryTradeTax: exemptTax('Exonération frais', 'VATEX-EU-143'),
    }),
  ]
  settlement.specifiedLogisticsServiceCharge = [
    new LogisticsServiceChargeType({
      description: new TextType({ value: 'Transport' }),
      appliedAmount: eur(3.5),
      appliedTradeTax: [exemptTax('Exonération transport', 'VATEX-EU-132')],
    }),
  ]
  const debit = settlement.specifiedTradeSettlementPaymentMeans!.find(m => m.payerPartyDebtorFinancialAccount)!
  debit.payerPartyDebtorFinancialAccount!.accountName = new TextType({ value: 'Compte débiteur Œuvre' })
  debit.payerSpecifiedDebtorFinancialInstitution = new DebtorFinancialInstitutionType({ bicID: new IDType({ value: 'BNPAFRPP' }) })

  model.supplyChainTradeTransaction.includedSupplyChainTradeLineItem![0].specifiedLineTradeSettlement.specifiedTradeAllowanceCharge = [
    new TradeAllowanceChargeType({
      chargeIndicator: new IndicatorType({ indicator: true }),
      actualAmount: eur(1),
      reasonCode: new AllowanceChargeReasonCodeType({ value: 'ADK' }),
    }),
  ]
  return model
}

describe('factur-X 1.09 EXTENDED additions: model, converter and parser in lockstep', () => {
  it('writes every field at its XSD position (EXTENDED XSD valid)', async () => {
    const xml = (await invoiceToXml(modelWith109Fields())).toString()
    const result = await check({ xml, level: 'extended' })
    expect(result.errors).toEqual([])

    const doc = XmlDocument.fromString(xml)
    try {
      for (const [bt, xpath, value] of FIELDS)
        expect([bt, doc.get(xpath, NS)?.content]).toEqual([bt, value])
    }
    finally {
      doc.dispose()
    }
  })

  it.each(FIELDS)('%s reads back through xmlToInvoice() and survives a second round trip', async (_, xpath, value) => {
    const first = (await invoiceToXml(modelWith109Fields())).toString()
    const parsed = await xmlToInvoice(first)
    const second = (await invoiceToXml(parsed)).toString()

    const doc = XmlDocument.fromString(second)
    try {
      expect(doc.get(xpath, NS)?.content).toBe(value)
    }
    finally {
      doc.dispose()
    }
    expect(await xmlToInvoice(second)).toEqual(parsed)
  })

  it('reads a logistics service charge back as a model (BT-X-271…275, BT-X-591)', async () => {
    const parsed = await xmlToInvoice((await invoiceToXml(modelWith109Fields())).toString())
    const [charge] = parsed.supplyChainTradeTransaction.applicableHeaderTradeSettlement.specifiedLogisticsServiceCharge ?? []
    expect(charge).toBeInstanceOf(LogisticsServiceChargeType)
    expect(charge.description.value).toBe('Transport')
    expect(charge.appliedAmount.value).toBe(3.5)
    expect(charge.appliedTradeTax?.[0].exemptionReason?.value).toBe('Exonération transport')
  })
})
