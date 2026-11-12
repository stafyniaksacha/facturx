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

  it('reports severity and keeps warnings out of validity by default', async () => {
    // PEPPOL-EN16931-R008 ("Document MUST not contain empty elements") is flagged
    // `warning` in the Factur-X 1.09 EN16931 Schematron.
    const xml = getEN16931XML().replace('<ram:Name>Au bon moulin</ram:Name>', '<ram:Name>Au bon moulin</ram:Name><ram:Description></ram:Description>')

    const lenient = await validateSchematron({ xml, flavor: 'facturx', level: 'en16931' })
    expect(lenient.warnings.map(w => w.id)).toContain('PEPPOL-EN16931-R008')
    expect(lenient.warnings.every(w => w.severity === 'warning' && w.flag === 'warning')).toBe(true)
    expect(lenient.errors.every(e => e.severity === 'error')).toBe(true)
    expect(lenient.valid).toBe(lenient.errors.length === 0)

    const strict = await validateSchematron({ xml, flavor: 'facturx', level: 'en16931', warningsAsErrors: true })
    expect(strict.valid).toBe(false)
    expect(strict.warnings).toEqual(lenient.warnings)
    expect(strict.errors.map(e => e.id)).toContain('PEPPOL-EN16931-R008')
    expect(strict.errors.length).toBe(lenient.errors.length + lenient.warnings.length)
  })

  it('check() forwards warningsAsErrors and always reports warnings', async () => {
    const xml = getEN16931XML().replace('<ram:Name>Au bon moulin</ram:Name>', '<ram:Name>Au bon moulin</ram:Name><ram:Description></ram:Description>')

    const lenient = await check({ xml, flavor: 'facturx', level: 'en16931', schematron: true })
    expect(lenient.schematronWarnings?.map(w => w.id)).toContain('PEPPOL-EN16931-R008')

    const strict = await check({ xml, flavor: 'facturx', level: 'en16931', schematron: true, warningsAsErrors: true })
    expect(strict.schematronValid).toBe(false)
    expect(strict.valid).toBe(false)
    expect(strict.schematronWarnings).toEqual(lenient.schematronWarnings)
  })

  it('reports fired Schematron reports, not only failed asserts', async () => {
    // The EN16931 Schematron forbids @schemeID on BT-1 with a <report>, not an <assert>.
    const xml = getEN16931XML().replace(/(<rsm:ExchangedDocument>\s*<ram:ID)>/, '$1 schemeID="0088">')
    expect(xml).toContain('schemeID="0088"')

    const result = await validateSchematron({ xml, flavor: 'facturx', level: 'en16931' })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.test === '@schemeID' && e.severity === 'error')).toBe(true)
  })

  it('does not expose internal Factur-X assert numbers as rule ids', async () => {
    const xml = getEN16931XML().replace('<ram:Name>Au bon moulin</ram:Name>', '<ram:Name>Au bon moulin</ram:Name><ram:Description></ram:Description>')
    const { warnings } = await validateSchematron({ xml, flavor: 'facturx', level: 'en16931' })
    const r008 = warnings.find(w => w.id === 'PEPPOL-EN16931-R008')
    expect(r008?.assertId).toMatch(/^FX-SCH-A-/)
    const all = (await validateSchematron({ xml: getEN16931XML().replace(/<ram:SellerTradeParty>[\s\S]*?<\/ram:SellerTradeParty>/, ''), flavor: 'facturx', level: 'en16931' })).errors
    expect(all.length).toBeGreaterThan(0)
    expect(all.every(e => !e.id?.startsWith('FX-SCH-'))).toBe(true)
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
