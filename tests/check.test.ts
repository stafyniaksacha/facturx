import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
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

// CG-12 (partial): reference profile XRECHNUNG (§7.7 p.69). No XRechnung is vendored, so the XML is
// examples/Facture_FR_EN16931.xml with BT-24 set to a KoSIT XRechnung guideline ID.
describe('check() on an XRechnung (CG-12)', () => {
  const CIUS = 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0'
  const EXTENSION = `${CIUS}#conformant#urn:xeinkauf.de:kosit:extension:xrechnung_3.0`
  async function xrechnung(id: string): Promise<string> {
    const xml = (await readFile(resolve(import.meta.dirname, '../examples/Facture_FR_EN16931.xml'), 'utf8'))
      .replace('<ram:ID>urn:cen.eu:en16931:2017</ram:ID>', `<ram:ID>${id}</ram:ID>`)
    expect(xml).toContain(`<ram:ID>${id}</ram:ID>`)
    return xml
  }

  it.each(['xrechnung_2.3', 'xrechnung_3.0'])('validates a CIUS %s as EN 16931', async (version) => {
    const result = await check({ xml: await xrechnung(CIUS.replace('xrechnung_3.0', version)) })
    expect(result).toMatchObject({ valid: true, errors: [], flavor: 'facturx', level: 'en16931' })
  })

  // The Factur-X EN 16931 Schematron only accepts `urn:cen.eu:en16931:2017` as BT-24 (codedb list 1),
  // so it reports the XRechnung ID. Kept as reported: the KoSIT rules that do accept it are not vendored.
  it('reports the XRechnung BT-24 under the Factur-X EN 16931 Schematron', async () => {
    const result = await check({ xml: await xrechnung(CIUS), schematron: true })
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(false)
    expect(result.schematronErrors?.map(e => e.assertId)).toEqual(['FX-SCH-A-000556'])
  })

  it('refuses an XRechnung extension, which is not EN 16931', async () => {
    await expect(check({ xml: await xrechnung(EXTENSION) })).rejects.toThrow('an XRechnung extension is not')
  })
})
