import { check, invoiceToXml, xmlToInvoice } from '@stafyniaksacha/facturx'
import { describe, expect, it, vi } from 'vitest'
import { getBasicFacturXModel } from './fixtures/model-basic'
import { getBasicWLFacturXModel } from './fixtures/model-basicwl'
import { getEN16931FacturXModel } from './fixtures/model-en16931'
import { getExtendedFacturXModel } from './fixtures/model-extended'
import { getMinimalFacturXModel } from './fixtures/model-minimal'

describe('invoiceToXml', () => {
  it('should generate valid basic model', async () => {
    const checkSpy = vi.fn(check)

    const model = getBasicFacturXModel()
    const xml = await invoiceToXml(model)
    const options = {
      xml: xml.toString(),
      flavor: 'facturx',
      level: 'basic',
    }
    const result = await checkSpy(options)

    expect(checkSpy).toHaveResolved()
    expect(result.errors).toStrictEqual([])
    expect(result.valid).toBe(true)
    expect(result.flavor).toBe('facturx')
    expect(result.level).toBe('basic')
  })

  it('should generate valid basic WL model', async () => {
    const model = getBasicWLFacturXModel()
    const xml = await invoiceToXml(model)
    const options = {
      xml: xml.toString(),
      flavor: 'facturx',
      level: 'basicwl',
    }
    const result = await check(options)

    expect(result.errors).toStrictEqual([])
    expect(result.valid).toBe(true)
    expect(result.flavor).toBe('facturx')
    expect(result.level).toBe('basicwl')
  })

  it('should generate valid en16931 model', async () => {
    const model = getEN16931FacturXModel()
    const xml = await invoiceToXml(model)
    const options = {
      xml: xml.toString(),
      flavor: 'facturx',
      level: 'en16931',
    }
    const result = await check(options)

    expect(result.errors).toStrictEqual([])
    expect(result.valid).toBe(true)
    expect(result.flavor).toBe('facturx')
    expect(result.level).toBe('en16931')
  })

  it('should generate valid extended model', async () => {
    const model = getExtendedFacturXModel()
    const xml = await invoiceToXml(model)
    const options = {
      xml: xml.toString(),
      flavor: 'facturx',
      level: 'extended',
    }
    const result = await check(options)

    expect(result.errors).toStrictEqual([])
    expect(result.valid).toBe(true)
    expect(result.flavor).toBe('facturx')
    expect(result.level).toBe('extended')
  })

  it('should generate valid minimal model', async () => {
    const model = getMinimalFacturXModel()
    const xml = await invoiceToXml(model)
    const options = {
      xml: xml.toString(),
      flavor: 'facturx',
      level: 'minimum',
    }
    const result = await check(options)

    expect(result.errors).toStrictEqual([])
    expect(result.valid).toBe(true)
    expect(result.flavor).toBe('facturx')
    expect(result.level).toBe('minimum')
  })

  it('should emit fields that were previously silently dropped (en16931)', async () => {
    const model = getEN16931FacturXModel()
    const xml = (await invoiceToXml(model)).toString()

    // Payment terms (BT-20) — was destructured but never emitted
    expect(xml).toContain('<ram:SpecifiedTradePaymentTerms>')
    expect(xml).toContain('Payment due within 30 days')

    // Actual delivery date (BT-72) — delivery section only emitted ShipToTradeParty before
    expect(xml).toContain('<ram:ActualDeliverySupplyChainEvent>')
    expect(xml).toContain('<ram:OccurrenceDateTime>')

    // Tax BasisAmount (BT-116) — was explicitly omitted with a @TODO
    expect(xml).toContain('<ram:BasisAmount')

    // And the whole thing must still be schema-valid
    const result = await check({ xml, flavor: 'facturx', level: 'en16931' })
    expect(result.errors).toStrictEqual([])
    expect(result.valid).toBe(true)
  })

  it('should not validate invalid extended model', async () => {
    const model = getMinimalFacturXModel()
    const xml = await invoiceToXml(model)
    const options = {
      xml: xml.toString(),
      flavor: 'facturx',
      level: 'extended',
    }
    const result = await check(options)

    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.flavor).toBe('facturx')
    expect(result.level).toBe('extended')
  })

  it('should emit the EXTENDED-only aggregates and stay valid', async () => {
    const xml = (await invoiceToXml(getExtendedFacturXModel())).toString()

    // New 1.09 EXTENDED types added in this upgrade
    expect(xml).toContain('<ram:SpecifiedFinancialAdjustment>')
    expect(xml).toContain('<ram:PayerSpecifiedDebtorFinancialInstitution>')
    expect(xml).toContain('<ram:RelevantTradeLocation>')
    expect(xml).toContain('<ram:ManufacturerTradeParty>')
    expect(xml).toContain('<ram:BrandName>')
    expect(xml).toContain('<ram:ModelName>')
    expect(xml).toContain('<ram:ItemSellerTradeParty>')
    expect(xml).toContain('<ram:PerPackageUnitQuantity')
    expect(xml).toContain('<ram:ApplicableTradeDeliveryTerms>')

    const result = await check({ xml, flavor: 'facturx', level: 'extended' })
    expect(result.errors).toStrictEqual([])
    expect(result.valid).toBe(true)
  })
})

describe('round-trip fidelity (model → xml → model → xml)', () => {
  const cases: [string, () => any][] = [
    ['minimum', getMinimalFacturXModel],
    ['basicwl', getBasicWLFacturXModel],
    ['basic', getBasicFacturXModel],
    ['en16931', getEN16931FacturXModel],
    ['extended', getExtendedFacturXModel],
  ]

  const count = (s: string, tag: string): number => (s.match(new RegExp(`<ram:${tag}[ >]`, 'g')) || []).length

  it.each(cases)('round-trips a %s invoice without losing structure', async (level, factory) => {
    const xml1 = (await invoiceToXml(factory())).toString()
    const xml2 = (await invoiceToXml(await xmlToInvoice(xml1))).toString()

    // Re-parsed + re-serialised output must still validate at the same level
    const result = await check({ xml: xml2, flavor: 'facturx', level })
    expect(result.errors).toStrictEqual([])
    expect(result.valid).toBe(true)

    // Key repeating aggregates must survive the round-trip
    for (const tag of ['IncludedSupplyChainTradeLineItem', 'ApplicableTradeTax', 'SpecifiedTradePaymentTerms', 'SpecifiedTradeSettlementPaymentMeans']) {
      expect(count(xml2, tag)).toBe(count(xml1, tag))
    }
  })
})
