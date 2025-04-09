import { describe, expect, test } from 'vitest'
import { check, invoiceToXml } from '../src'
import { getBasicFacturXModel } from './fixtures/model-basic'
import { getBasicWLFacturXModel } from './fixtures/model-basic-wl'
import { getEN16931FacturXModel } from './fixtures/model-en16931'
import { getExtendedFacturXModel } from './fixtures/model-extended'
import { getMinimalFacturXModel } from './fixtures/model-minimal'

describe('invoiceToXml', () => {
  test('should generate valid basic model', async () => {
    const model = getBasicFacturXModel()
    const xml = await invoiceToXml(model, 'basic')
    const options = {
      xml: xml.toString(),
      flavor: 'facturx',
      level: 'basic'
    }
    const result = await check(options)

    expect(result.errors).toStrictEqual([])
    expect(result.valid).toBe(true)
    expect(result.flavor).toBe('facturx')
    expect(result.level).toBe('basic')
  })

  test('should generate valid basic WL model', async () => {
    const model = getBasicWLFacturXModel()
    const xml = await invoiceToXml(model, 'basic-wl')
    const options = {
      xml: xml.toString(),
      flavor: 'facturx',
      level: 'basic-wl'
    }
    const result = await check(options)

    expect(result.errors).toStrictEqual([])
    expect(result.valid).toBe(true)
    expect(result.flavor).toBe('facturx')
    expect(result.level).toBe('basic-wl')
  })

  test('should generate valid en16931 model', async () => {
    const model = getEN16931FacturXModel()
    const xml = await invoiceToXml(model, 'en16931')
    const options = {
      xml: xml.toString(),
      flavor: 'facturx',
      level: 'en16931'
    }
    const result = await check(options)

    expect(result.errors).toStrictEqual([])
    expect(result.valid).toBe(true)
    expect(result.flavor).toBe('facturx')
    expect(result.level).toBe('en16931')
  })
  
  test('should generate valid extended model', async () => {
    const model = getExtendedFacturXModel()
    const xml = await invoiceToXml(model, 'extended')
    const options = {
      xml: xml.toString(),
      flavor: 'facturx',
      level: 'extended'
    }
    const result = await check(options)

    expect(result.errors).toStrictEqual([])
    expect(result.valid).toBe(true)
    expect(result.flavor).toBe('facturx')
    expect(result.level).toBe('extended')
  })

  test('should not validate invalid extended model', async () => {
    const model = getMinimalFacturXModel()
    const xml = await invoiceToXml(model, 'extended')
    const options = {
      xml: xml.toString(),
      flavor: 'facturx',
      level: 'extended'
    }
    const result = await check(options)

    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.flavor).toBe('facturx')
    expect(result.level).toBe('extended')
  })
})
