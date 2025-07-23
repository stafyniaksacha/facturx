import { check, invoiceToXml } from '@stafyniaksacha/facturx'
import { describe, expect, it, vi } from 'vitest'
import { getBasicFacturXModel } from './fixtures/model-basic'
import { getBasicWLFacturXModel } from './fixtures/model-basic-wl'
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
      level: 'basic-wl',
    }
    const result = await check(options)

    expect(result.errors).toStrictEqual([])
    expect(result.valid).toBe(true)
    expect(result.flavor).toBe('facturx')
    expect(result.level).toBe('basic-wl')
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
})
