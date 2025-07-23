import { Buffer } from 'node:buffer'
import { check } from '@stafyniaksacha/facturx'
import { describe, expect, it, vi } from 'vitest'
import {
  getEN16931XML,
  getMinimumXML,
  getOrderXBasicXML,
} from './fixtures/xml'

describe('check', () => {
  it('should accept xml input', async () => {
    const checkSpy = vi.fn(check)
    const options = {
      xml: getMinimumXML(),
      flavor: '',
      level: '',
    }
    await checkSpy(options)

    expect(checkSpy).toHaveResolved()
  })

  it('should accept buffer input', async () => {
    const checkSpy = vi.fn(check)
    const options = {
      xml: Buffer.from(getMinimumXML()),
      flavor: '',
      level: '',
    }
    await checkSpy(options)

    expect(checkSpy).toHaveResolved()
  })

  it('should throw with non xml input', async () => {
    const options = {
      xml: 'not-xml',
      flavor: '',
      level: '',
    }

    await expect(() => check(options)).rejects.toThrowError('Start tag expected, \'<\' not found')
  })

  it('should throw with invalid xml', async () => {
    const options = {
      xml: '<?xml version="1.0" encoding="UTF-8"?><test></test>',
      flavor: '',
      level: '',
    }

    await expect(() => check(options)).rejects.toThrowError('XML not recognized as Factur-X, Order-X or ZUGFeRD')
  })

  it('should pass with proper flavor provided', async () => {
    const options = {
      xml: getMinimumXML(),
      flavor: 'facturx',
    }
    const result = await check(options)

    expect(result.valid).toBe(true)
  })

  it('should pass with proper flavor and level provided', async () => {
    const options = {
      xml: getEN16931XML(),
      flavor: 'facturx',
      level: 'en16931',
    }
    const result = await check(options)

    expect(result.valid).toBe(true)
  })

  it('should fail with invalid level', async () => {
    const options = {
      xml: getEN16931XML(),
      flavor: 'facturx',
      level: 'minimum',
    }
    const result = await check(options)

    expect(result.valid).toBe(false)
  })

  it('should fail with invalid flavor', async () => {
    const options = {
      xml: getEN16931XML(),
      flavor: 'orderx',
      level: 'basic',
    }
    const result = await check(options)

    expect(result.valid).toBe(false)
  })

  it('should throw if unknown flavor is provided', async () => {
    const options = {
      xml: getEN16931XML(),
      flavor: 'unknown',
    }

    await expect(() => check(options)).rejects.toThrowError('Unknown schema flavor: "unknown"')
  })

  it('should throw if unknown facturx level is provided', async () => {
    const options = {
      xml: getEN16931XML(),
      flavor: 'facturx',
      level: 'unknown',
    }

    await expect(() => check(options)).rejects.toThrowError('Unknown Factur-X level: "unknown"')
  })

  it('should throw if unknown orderx level is provided', async () => {
    const options = {
      xml: getEN16931XML(),
      flavor: 'orderx',
      level: 'unknown',
    }

    await expect(() => check(options)).rejects.toThrowError('Unknown Order-X level: "unknown"')
  })

  it('should autodetect facturx flavor and level', async () => {
    const options = {
      xml: getEN16931XML(),
      flavor: '',
      level: '',
    }
    const result = await check(options)

    expect(result.valid).toBe(true)
    expect(result.errors).toStrictEqual([])
    expect(result.flavor).toBe('facturx')
    expect(result.level).toBe('en16931')
  })

  it('should autodetect orderx flavor and level', async () => {
    const options = {
      xml: getOrderXBasicXML(),
      flavor: '',
      level: '',
    }
    const result = await check(options)

    expect(result.valid).toBe(true)
    expect(result.errors).toStrictEqual([])
    expect(result.flavor).toBe('orderx')
    expect(result.level).toBe('basic')
  })
})
