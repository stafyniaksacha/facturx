import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { check, invoiceToXml, xmlToInvoice } from '@stafyniaksacha/facturx'
import { AmountType, CurrencyCodeType, IndicatorType, MeasureType, NumericType, PercentType, RateType, TradeAllowanceChargeType, TradeCurrencyExchangeType, TradePaymentPenaltyTermsType } from '@stafyniaksacha/facturx/models'
import { XmlDocument } from 'libxml2-wasm'
import { describe, expect, it } from 'vitest'

// CG-28: `xs:decimal` has no exponent notation, but `String()` writes values below 1e-6 as `1e-7`
// and values from 1e21 up as `1e+21`, and `toFixed()` does the same from 1e21 up. Quantities,
// measures, rates, percentages, numerics (§7.1.5 p.35: not limited to 2 decimals) and amounts must
// all be written as plain decimals, or the XSD rejects the invoice.
const SOURCE_XML = resolve(import.meta.dirname, '../examples/Facture_FR_EN16931.xml')
const NS = { ram: 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100' }
const LINE = '/*/*/ram:IncludedSupplyChainTradeLineItem'
const SETTLEMENT = '/*/*/ram:ApplicableHeaderTradeSettlement'

function texts(xml: string, xpath: string): string[] {
  const doc = XmlDocument.fromString(xml)
  try {
    return doc.find(xpath, NS).map(node => node.content)
  }
  finally {
    doc.dispose()
  }
}

async function model() {
  const invoice = await xmlToInvoice(await readFile(SOURCE_XML, 'utf8'))
  const lines = invoice.supplyChainTradeTransaction.includedSupplyChainTradeLineItem!
  return { invoice, lines, settlement: invoice.supplyChainTradeTransaction.applicableHeaderTradeSettlement }
}

describe('decimals are never written in exponent notation (CG-28)', () => {
  it('writes very small, very large and negative quantities, measures, rates, percentages and numerics as plain decimals', async () => {
    const { invoice, lines, settlement } = await model()
    lines[0].specifiedLineTradeDelivery!.billedQuantity!.value = 1e-7
    lines[1].specifiedLineTradeDelivery!.billedQuantity!.value = 1.2345678901234569e+23
    lines[2].specifiedLineTradeDelivery!.billedQuantity!.value = -1.5e-7
    lines[0].specifiedLineTradeSettlement.applicableTradeTax[0].rateApplicablePercent = new PercentType({ value: 2.5e-7 })
    settlement.taxCurrencyCode = new CurrencyCodeType({ value: 'USD' })
    settlement.taxApplicableTradeCurrencyExchange = new TradeCurrencyExchangeType({
      sourceCurrencyCode: new CurrencyCodeType({ value: 'EUR' }),
      targetCurrencyCode: new CurrencyCodeType({ value: 'USD' }),
      conversionRate: new RateType({ value: 0.0000001 }),
    })
    settlement.specifiedTradePaymentTerms![0].applicableTradePaymentPenaltyTerms = new TradePaymentPenaltyTermsType({
      basisPeriodMeasure: new MeasureType({ value: 1e-7, unitCode: 'DAY' }),
      calculationPercent: new PercentType({ value: 4e-7 }),
    })
    settlement.specifiedTradeAllowanceCharge = [
      new TradeAllowanceChargeType({
        chargeIndicator: new IndicatorType({ indicator: false }),
        sequenceNumeric: new NumericType({ value: 1e21 }),
        calculationPercent: new PercentType({ value: 3e-7 }),
        basisAmount: new AmountType({ value: 100 }),
        actualAmount: new AmountType({ value: 0 }),
      }),
    ]

    const xml = (await invoiceToXml(invoice)).toString()

    expect(texts(xml, `${LINE}[1]//ram:BilledQuantity`)).toEqual(['0.0000001'])
    expect(texts(xml, `${LINE}[2]//ram:BilledQuantity`)).toEqual(['123456789012345690000000'])
    expect(texts(xml, `${LINE}[3]//ram:BilledQuantity`)).toEqual(['-0.00000015'])
    expect(texts(xml, `${SETTLEMENT}/ram:SpecifiedTradePaymentTerms/ram:ApplicableTradePaymentPenaltyTerms/ram:BasisPeriodMeasure`)).toEqual(['0.0000001'])
    expect(texts(xml, `${SETTLEMENT}/ram:SpecifiedTradePaymentTerms/ram:ApplicableTradePaymentPenaltyTerms/ram:CalculationPercent`)).toEqual(['0.0000004'])
    expect(texts(xml, `${LINE}[1]//ram:ApplicableTradeTax/ram:RateApplicablePercent`)).toEqual(['0.00000025'])
    expect(texts(xml, `${SETTLEMENT}/ram:TaxApplicableTradeCurrencyExchange/ram:ConversionRate`)).toEqual(['0.0000001'])
    expect(texts(xml, `${SETTLEMENT}/ram:SpecifiedTradeAllowanceCharge/ram:SequenceNumeric`)).toEqual(['1000000000000000000000'])
    expect(texts(xml, `${SETTLEMENT}/ram:SpecifiedTradeAllowanceCharge/ram:CalculationPercent`)).toEqual(['0.0000003'])
    expect(xml).not.toMatch(/>-?\d+(?:\.\d+)?e[+-]?\d+</i)

    // The XSD is what CG-28 failed: `'1e-7' is not a valid value of the atomic type 'xs:decimal'`.
    expect((await check({ xml, level: 'extended' })).errors).toEqual([])

    // Read back: the same numbers, and the same XML once more.
    const after = await xmlToInvoice(xml)
    expect(after).toEqual(invoice)
    expect((await invoiceToXml(after)).toString()).toBe(xml)
  })

  it('writes an amount from 1e21 up without exponent notation and still with at most 2 decimals', async () => {
    const { invoice, lines } = await model()
    lines[0].specifiedLineTradeSettlement.specifiedTradeSettlementLineMonetarySummation!.lineTotalAmount!.value = 1e21
    lines[1].specifiedLineTradeSettlement.specifiedTradeSettlementLineMonetarySummation!.lineTotalAmount!.value = 1e-7

    const xml = (await invoiceToXml(invoice)).toString()

    expect(texts(xml, `${LINE}[1]//ram:LineTotalAmount`)).toEqual(['1000000000000000000000'])
    expect(texts(xml, `${LINE}[2]//ram:LineTotalAmount`)).toEqual(['0.00'])
    expect((await check({ xml, level: 'extended' })).errors).toEqual([])
  })
})
