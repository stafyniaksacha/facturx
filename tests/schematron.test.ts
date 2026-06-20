import { check, invoiceToXml, validateSchematron } from '@stafyniaksacha/facturx'
import { describe, expect, it } from 'vitest'

import { getExtendedFacturXModel } from './fixtures/model-extended'
import { getEN16931XML, getMinimumXML } from './fixtures/xml'

describe('schematron validation', () => {
  it('runs and returns a result shape', async () => {
    const result = await validateSchematron({ xml: getMinimumXML(), flavor: 'facturx', level: 'minimum' })

    expect(typeof result.valid).toBe('boolean')
    expect(Array.isArray(result.errors)).toBe(true)
  })

  it('flags invalid code-list values via the codedb', async () => {
    const bad = getEN16931XML().replace(/<ram:CategoryCode>S<\/ram:CategoryCode>/g, '<ram:CategoryCode>ZZ</ram:CategoryCode>')
    const result = await validateSchematron({ xml: bad, flavor: 'facturx', level: 'en16931' })

    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors.some(e => /CategoryCode/.test(e.message))).toBe(true)
  })

  it('runs the EXTENDED transform without SaxonJS type errors (regression: XPTY0004)', async () => {
    // The EXTENDED Schematron has FLWOR-based BR-CO rules over sum() that crashed
    // SaxonJS-HE before the sum()->xs:decimal() patch. This must not throw.
    const xml = (await invoiceToXml(getExtendedFacturXModel())).toString()
    const result = await validateSchematron({ xml, flavor: 'facturx', level: 'extended' })

    expect(typeof result.valid).toBe('boolean')
    expect(Array.isArray(result.errors)).toBe(true)
  })

  it('throws for non-facturx flavors (no Order-X Schematron shipped)', async () => {
    await expect(
      validateSchematron({ xml: '<x/>', flavor: 'orderx', level: 'basic' }),
    ).rejects.toThrow(/facturx/)
  })

  it('throws for an unknown level', async () => {
    await expect(
      validateSchematron({ xml: getMinimumXML(), flavor: 'facturx', level: 'nope' }),
    ).rejects.toThrow(/Schematron/)
  })

  it('check() exposes schematron results only when requested', async () => {
    const xsdOnly = await check({ xml: getMinimumXML(), flavor: 'facturx', level: 'minimum' })
    expect(xsdOnly.schematronValid).toBeUndefined()
    expect(xsdOnly.schematronErrors).toBeUndefined()

    const withSch = await check({ xml: getMinimumXML(), flavor: 'facturx', level: 'minimum', schematron: true })
    expect(typeof withSch.schematronValid).toBe('boolean')
    expect(Array.isArray(withSch.schematronErrors)).toBe(true)
    // combined validity reflects both XSD and Schematron
    expect(withSch.valid).toBe(withSch.schematronValid === false ? false : xsdOnly.valid && withSch.schematronValid!)
  })
})
