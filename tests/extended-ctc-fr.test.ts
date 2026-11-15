import { Buffer } from 'node:buffer'
import { readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { check, extract, generate, validateFrCtc, validateSchematron } from '@stafyniaksacha/facturx'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'

// CG-18, validation part: plain CII invoices in the French EXTENDED-CTC-FR profile (XP Z12-012 v1.4, guideline ID
// `urn:cen.eu:en16931:2017#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr`) are detected as level
// `extended-ctc-fr` and validated by the sequence of the FNFE-MPE release notes p.9: the "uncoupled"
// CII D22B XSD (step 1), the dedicated EXTENDED-CTC-FR Schematron (step 2), BR-FR (step 3).
const ANNEX_B = resolve(import.meta.dirname, '../spec/afnor-xp-z12-012-1.4/distribution/XP_Z12-012_Annexe_B_EXEMPLES_V1.4')

const examples = readdirSync(ANNEX_B, { withFileTypes: true, recursive: true })
  .filter(entry => entry.isFile() && /_EXTENDED-CTC-FR_CII_.*\.xml$/.test(entry.name))
  .map(entry => join(entry.parentPath, entry.name))
  .sort()
  .map(file => ({ file, name: relative(ANNEX_B, file) }))

const F1 = examples.find(e => e.name.includes('F202500001_INV_20250201_EXTENDED-CTC-FR'))!.file

describe('eXTENDED-CTC-FR plain CII profile (CG-18 validation)', () => {
  it('finds the 6 Annex B examples', () => {
    expect(examples).toHaveLength(6)
  })

  it.each(examples)('$name passes XSD, the EXTENDED-CTC-FR Schematron and BR-FR with no finding', async ({ file }) => {
    const result = await check({ xml: await readFile(file, 'utf8'), schematron: true, frCtc: true })
    expect(result.flavor).toBe('facturx')
    expect(result.level).toBe('extended-ctc-fr')
    expect(result.errors).toEqual([])
    expect(result.schematronErrors).toEqual([])
    expect(result.schematronWarnings).toEqual([])
    expect(result.frCtcErrors).toEqual([])
    expect(result.frCtcWarnings).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('the Schematron catches broken totals', async () => {
    const xml = (await readFile(F1, 'utf8')).replace('<ram:GrandTotalAmount>118.70<', '<ram:GrandTotalAmount>1.00<')
    expect(xml).toContain('<ram:GrandTotalAmount>1.00<')
    const result = await validateSchematron({ xml, level: 'extended-ctc-fr' })
    expect(result.valid).toBe(false)
    expect(result.errors.map(e => e.id)).toEqual(expect.arrayContaining(['BR-FREXT-CO-15', 'BR-CO-16']))
  })

  it('the uncoupled CII XSD rejects an unknown element', async () => {
    const xml = (await readFile(F1, 'utf8')).replace('<ram:GrandTotalAmount>', '<ram:Bogus/><ram:GrandTotalAmount>')
    const result = await check({ xml })
    expect(result.level).toBe('extended-ctc-fr')
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toContain('Bogus')
  })

  // The Factur-X EXTENDED Schematron rejects this guideline ID (FX-SCH-A-000636, was CG-24). It stays
  // available with an explicit level, unchanged.
  it('still runs the Factur-X EXTENDED components with an explicit level: extended', async () => {
    const result = await check({ xml: await readFile(F1, 'utf8'), level: 'extended', schematron: true })
    expect(result.errors).toEqual([])
    expect(result.schematronErrors?.map(e => e.message)).toEqual(['Value of \'ram:ID\' is not allowed.'])
  })

  it('validateFrCtc() accepts level extended-ctc-fr, and extended as before', async () => {
    const xml = await readFile(F1, 'utf8')
    await expect(validateFrCtc({ xml })).resolves.toMatchObject({ valid: true })
    await expect(validateFrCtc({ xml, level: 'extended-ctc-fr' })).resolves.toMatchObject({ valid: true })
    await expect(validateFrCtc({ xml, level: 'extended' })).resolves.toMatchObject({ valid: true })
    await expect(validateFrCtc({ xml, level: 'en16931' })).rejects.toThrow('does not match the profile declared by the document ("extended-ctc-fr")')
  })

  // Not a HybridConformance value (codelists--HybridConformance.csv, BR-HYBRID-07): no Factur-X PDF
  // can declare it.
  it('generate() refuses the profile before touching the PDF', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage()
    const xml = await readFile(F1, 'utf8')
    await expect(generate({ pdf, xml })).rejects.toThrow('Cannot generate a Factur-X PDF for the EXTENDED-CTC-FR profile')
    await expect(generate({ pdf, xml, level: 'extended-ctc-fr' })).rejects.toThrow('Cannot generate a Factur-X PDF for the EXTENDED-CTC-FR profile')
    // An explicit Factur-X level would write fx:ConformanceLevel EXTENDED over this BT-24.
    await expect(generate({ pdf, xml, level: 'extended' })).rejects.toThrow('Cannot generate a Factur-X PDF for the EXTENDED-CTC-FR profile')
    // The PDFDocument was not marked as used.
    await expect(generate({ pdf, xml: await readFile(resolve(import.meta.dirname, '../examples/Facture_FR_EN16931.xml'), 'utf8') })).resolves.toBeInstanceOf(Uint8Array)
  })

  // Annex A defines one guideline ID for the profile, and its Schematron does not check BT-24, so
  // only that exact ID selects the level.
  it.each([
    'urn:example:not-a-profile:extended-ctc-fr',
    'urn:cen.eu:en16931:2017#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr:2026',
  ])('does not detect the level from %s', async (id) => {
    const xml = (await readFile(F1, 'utf8')).replace(/urn:cen\.eu:en16931:2017#conformant#urn\.cpro\.gouv\.fr:1p0:extended-ctc-fr(?=<)/, id)
    expect(xml).toContain(`>${id}<`)
    await expect(check({ xml, schematron: true, frCtc: true })).rejects.toThrow('Unknown level')
  })

  it('extract({ check: true }) refuses a factur-x.xml that declares EXTENDED-CTC-FR', async () => {
    const xml = await readFile(F1, 'utf8')
    const pdf = await PDFDocument.create()
    pdf.addPage()
    await pdf.attach(new TextEncoder().encode(xml), 'factur-x.xml', { mimeType: 'text/xml' })
    const bytes = Buffer.from(await pdf.save())
    await expect(extract({ pdf: bytes })).resolves.toMatchObject({ filename: 'factur-x.xml' })
    await expect(extract({ pdf: bytes, check: true })).rejects.toThrow('declares EXTENDED-CTC-FR, a plain CII profile that is not a Factur-X profile')
  })
})
