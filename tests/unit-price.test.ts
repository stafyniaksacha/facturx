import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { check, invoiceToXml, xmlToInvoice } from '@stafyniaksacha/facturx'
import { AmountType, IndicatorType, TradeAllowanceChargeType } from '@stafyniaksacha/facturx/models'
import { XmlDocument } from 'libxml2-wasm'
import { describe, expect, it } from 'vitest'

// CG-01: only the *Amount* data type is limited to 2 decimals; *Unit Price Amount* (BT-146,
// BT-147, BT-148, BT-X-35, BT-X-301, BT-X-302) has no limit (§7.1.5 p.35, e.g. `1000.3454`).
const SOURCE_XML = resolve(import.meta.dirname, '../examples/Facture_FR_EN16931.xml')
const NS = { ram: 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100' }
const LINE = '/*/*/ram:IncludedSupplyChainTradeLineItem'

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
  return { invoice, lines }
}

describe('unit prices (CG-01)', () => {
  it('writes item net/gross prices and the price discount with all their decimals', async () => {
    const { invoice, lines } = await model()
    const agreement = lines[0].specifiedLineTradeAgreement!
    agreement.grossPriceProductTradePrice!.chargeAmount.value = 1000.3456
    agreement.grossPriceProductTradePrice!.appliedTradeAllowanceCharge![0].actualAmount.value = 0.0002
    agreement.netPriceProductTradePrice!.chargeAmount.value = 1000.3454
    lines[1].specifiedLineTradeAgreement!.netPriceProductTradePrice!.chargeAmount.value = 0.3456
    lines[1].specifiedLineTradeAgreement!.grossPriceProductTradePrice!.chargeAmount.value = 0.3456

    const xml = (await invoiceToXml(invoice)).toString()

    expect(texts(xml, `${LINE}[1]//ram:GrossPriceProductTradePrice/ram:ChargeAmount`)).toEqual(['1000.3456'])
    expect(texts(xml, `${LINE}[1]//ram:GrossPriceProductTradePrice/ram:AppliedTradeAllowanceCharge/ram:ActualAmount`)).toEqual(['0.0002'])
    expect(texts(xml, `${LINE}[1]//ram:NetPriceProductTradePrice/ram:ChargeAmount`)).toEqual(['1000.3454'])
    expect(texts(xml, `${LINE}[2]//ram:NetPriceProductTradePrice/ram:ChargeAmount`)).toEqual(['0.3456'])

    const result = await check({ xml, schematron: true })
    expect(result.errors).toEqual([])
    expect(result.schematronErrors).toEqual([])

    // Read back: the same values, and the same XML once more.
    const after = await xmlToInvoice(xml)
    expect(after).toEqual(invoice)
    expect((await invoiceToXml(after)).toString()).toBe(xml)
  })

  it('writes price-level base amounts unrounded and never in exponent notation', async () => {
    const { invoice, lines } = await model()
    const gross = lines[0].specifiedLineTradeAgreement!.grossPriceProductTradePrice!
    gross.chargeAmount.value = 0.0000001
    gross.appliedTradeAllowanceCharge![0].basisAmount = new AmountType({ value: 4.123456789 })
    gross.appliedTradeAllowanceCharge![0].actualAmount.value = 1.5e-7

    const xml = (await invoiceToXml(invoice)).toString()

    expect(texts(xml, `${LINE}[1]//ram:GrossPriceProductTradePrice/ram:ChargeAmount`)).toEqual(['0.0000001'])
    expect(texts(xml, `${LINE}[1]//ram:GrossPriceProductTradePrice/ram:AppliedTradeAllowanceCharge/ram:BasisAmount`)).toEqual(['4.123456789'])
    expect(texts(xml, `${LINE}[1]//ram:GrossPriceProductTradePrice/ram:AppliedTradeAllowanceCharge/ram:ActualAmount`)).toEqual(['0.00000015'])
    // xs:decimal has no exponent: the XSD would reject `1e-7`.
    expect((await check({ xml, level: 'extended' })).errors).toEqual([])
  })

  it('still writes *Amount*s (line, document, allowances outside a price) with 2 decimals', async () => {
    const { invoice, lines } = await model()
    lines[0].specifiedLineTradeSettlement.specifiedTradeSettlementLineMonetarySummation!.lineTotalAmount.value = 81.9049
    invoice.supplyChainTradeTransaction.applicableHeaderTradeSettlement.specifiedTradeAllowanceCharge = [
      new TradeAllowanceChargeType({
        chargeIndicator: new IndicatorType({ indicator: false }),
        basisAmount: new AmountType({ value: 100.0049 }),
        actualAmount: new AmountType({ value: 1.2345 }),
      }),
    ]

    const xml = (await invoiceToXml(invoice)).toString()

    expect(texts(xml, `${LINE}[1]//ram:LineTotalAmount`)).toEqual(['81.90'])
    expect(texts(xml, '/*/*/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge/ram:BasisAmount')).toEqual(['100.00'])
    expect(texts(xml, '/*/*/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge/ram:ActualAmount')).toEqual(['1.23'])
  })
})
