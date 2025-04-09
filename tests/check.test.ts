import { Buffer } from 'node:buffer'
import { describe, expect, test, vi } from 'vitest'
import { check } from '../dist/index.mjs'
import { 
  VALID_FACTURX_MINIMUM,
  VALID_FACTURX_EN16931,
  VALID_ORDERX_BASIC,
} from './fixtures'

describe('check', () => {
  test('should accept xml input', async () => {
    const checkSpy = vi.fn(check)
    const options = {
      xml: VALID_FACTURX_MINIMUM,
      flavor: '',
      level: ''
    }
    await checkSpy(options)

    expect(checkSpy).toHaveResolved()
  })
  
  test('should accept buffer input', async () => {
    const checkSpy = vi.fn(check)
    const options = {
      xml: Buffer.from(VALID_FACTURX_MINIMUM),
      flavor: '',
      level: ''
    }
    await checkSpy(options)

    expect(checkSpy).toHaveResolved()
  })
  
  test('should throw with non xml input', async () => {
    const options = {
      xml: 'not-xml',
      flavor: '',
      level: ''
    }

    await expect(() => check(options)).rejects.toThrowError("Start tag expected, '<' not found")
  })
  
  test('should throw with invalid xml', async () => {
    const options = {
      xml: '<?xml version="1.0" encoding="UTF-8"?><test></test>',
      flavor: '',
      level: ''
    }

    await expect(() => check(options)).rejects.toThrowError("XML not recognized as Factur-X, Order-X or ZUGFeRD")
  })

  test('should pass with proper flavor provided', async () => {
    const options = {
      xml: VALID_FACTURX_EN16931,
      flavor: 'facturx',
    }
    const valid = await check(options)

    expect(valid).toBe(true)
  })
  
  test('should pass with proper flavor and level provided', async () => {
    const options = {
      xml: VALID_FACTURX_EN16931,
      flavor: 'facturx',
      level: 'en16931'
    }
    const valid = await check(options)

    expect(valid).toBe(true)
  })

  test('should fail with invalid level', async () => {
    const options = {
      xml: VALID_FACTURX_EN16931,
      flavor: 'facturx',
      level: 'minimum'
    }
    const valid = await check(options)

    expect(valid).toBe(false)
  })

  test('should fail with invalid flavor', async () => {
    const options = {
      xml: VALID_FACTURX_EN16931,
      flavor: 'orderx',
      level: 'basic'
    }
    const valid = await check(options)

    expect(valid).toBe(false)
  })

  test('should throw if unknown flavor is provided', async () => {
    const options = {
      xml: VALID_FACTURX_EN16931,
      flavor: 'unknown'
    }

    await expect(() => check(options)).rejects.toThrowError('Unknown schema flavor: "unknown"')
  })

  test('should throw if unknown facturx level is provided', async () => {
    const options = {
      xml: VALID_FACTURX_EN16931,
      flavor: 'facturx',
      level: 'unknown'
    }

    await expect(() => check(options)).rejects.toThrowError('Unknown Factur-X level: "unknown"')
  })

  test('should throw if unknown orderx level is provided', async () => {
    const options = {
      xml: VALID_FACTURX_EN16931,
      flavor: 'orderx',
      level: 'unknown'
    }

    await expect(() => check(options)).rejects.toThrowError('Unknown Order-X level: "unknown"')
  })

  test('should autodetect facturx flavor and level', async () => {
    const options = {
      xml: VALID_FACTURX_EN16931,
      flavor: '',
      level: ''
    }
    const valid = await check(options)

    expect(valid).toBe(true)
    expect(options.flavor).toBe('facturx')
    expect(options.level).toBe('en16931')
  })

  test('should autodetect orderx flavor and level', async () => {
    const options = {
      xml: VALID_ORDERX_BASIC,
      flavor: '',
      level: ''
    }
    const valid = await check(options)

    expect(valid).toBe(true)
    expect(options.flavor).toBe('orderx')
    expect(options.level).toBe('basic')
  })
})
