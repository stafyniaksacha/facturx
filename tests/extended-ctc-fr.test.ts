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
  .map(entry => join(entry.parentPath ?? (entry as { path?: string }).path ?? '', entry.name))
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

  // CodeRabbit review: an explicit level must not skip the guideline ID check.
  it('rejects an explicit level extended-ctc-fr on a document with another guideline ID', async () => {
    const xml = (await readFile(F1, 'utf8')).replace(/urn:cen\.eu:en16931:2017#conformant#urn\.cpro\.gouv\.fr:1p0:extended-ctc-fr(?=<)/, 'urn:example:not-a-profile')
    await expect(check({ xml, level: 'extended-ctc-fr', schematron: true })).rejects.toThrow('level "extended-ctc-fr" does not match the document')
    await expect(check({ xml: await readFile(F1, 'utf8'), level: 'extended-ctc-fr' })).resolves.toMatchObject({ valid: true })
  })

  it('extract({ check: true, level: \'extended\' }) still refuses a factur-x.xml that declares EXTENDED-CTC-FR', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage()
    await pdf.attach(new TextEncoder().encode(await readFile(F1, 'utf8')), 'factur-x.xml', { mimeType: 'text/xml' })
    const bytes = Buffer.from(await pdf.save())
    await expect(extract({ pdf: bytes, check: true, level: 'extended' })).rejects.toThrow('declares EXTENDED-CTC-FR, a plain CII profile that is not a Factur-X profile')
  })

  // CG-40 (upstream): BR-EXT-CL-07's guard `not(self::ram:ContractReferencedDocument)` is always
  // true on a ram:ReferenceTypeCode, so the UNTDID 1153 check never runs. Pinned as shipped; the
  // Factur-X EXTENDED Schematron does reject the code.
  it('accepts, as a documented gap (CG-40), a ReferenceTypeCode outside UNTDID 1153', async () => {
    const xml = (await readFile(F1, 'utf8')).replace('<ram:ReferenceTypeCode>IT</ram:ReferenceTypeCode>', '<ram:ReferenceTypeCode>QQQ</ram:ReferenceTypeCode>')
    expect(xml).toContain('>QQQ<')
    const result = await validateSchematron({ xml, level: 'extended-ctc-fr' })
    expect(result.errors.filter(e => e.id === 'BR-EXT-CL-07')).toEqual([])
    const fx = await validateSchematron({ xml, level: 'extended' })
    expect(fx.errors.map(e => e.message)).toContain('Value of \'ram:ReferenceTypeCode\' is not allowed.')
  })

  // Spec review: a repeated BT-24 made the dedicated Schematron abort with a raw XPTY0004 quoting
  // document values; it is now the CII-SR-009 finding (BT-24 must occur once).
  it('reports a repeated guideline ID as CII-SR-009 instead of a Schematron crash', async () => {
    const xml = (await readFile(F1, 'utf8')).replace(/(<ram:GuidelineSpecifiedDocumentContextParameter>[\s\S]*?<\/ram:GuidelineSpecifiedDocumentContextParameter>)/, '$1<ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:junk</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter>')
    expect(xml).toContain('urn:junk')
    const result = await check({ xml, schematron: true })
    expect(result.valid).toBe(false)
    expect(result.schematronErrors?.map(e => e.id)).toEqual(['CII-SR-009'])
    expect(JSON.stringify(result.schematronErrors)).not.toContain('urn:junk')
  })

  it('validateSchematron({ level: \'extended-ctc-fr\' }) refuses a document with another guideline ID', async () => {
    const xml = (await readFile(F1, 'utf8')).replace(/urn:cen\.eu:en16931:2017#conformant#urn\.cpro\.gouv\.fr:1p0:extended-ctc-fr(?=<)/, 'urn:example:not-a-profile')
    await expect(validateSchematron({ xml, level: 'extended-ctc-fr' })).rejects.toThrow('level "extended-ctc-fr" does not match the document')
  })

  it('generate() refuses a flavor that contradicts the root element', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage()
    await expect(generate({ pdf, xml: await readFile(F1, 'utf8'), flavor: 'orderx' })).rejects.toThrow('does not match the "orderx" flavor')
    const invoice = await readFile(resolve(import.meta.dirname, '../examples/Facture_FR_EN16931.xml'), 'utf8')
    await expect(generate({ pdf, xml: invoice, flavor: 'orderx' })).rejects.toThrow('does not match the "orderx" flavor')
    const order = await readFile(resolve(import.meta.dirname, '../examples/ORDER-X_EX11_ORDER_PICK-UP-BASIC.xml'), 'utf8')
    await expect(generate({ pdf, xml: order, flavor: 'facturx' })).rejects.toThrow('does not match the "facturx" flavor')
    await expect(generate({ pdf, xml: invoice })).resolves.toBeInstanceOf(Uint8Array)
  })

  // CodeRabbit review: the precheck and the transform must see the same document, even if the
  // caller replaces `options.xml` while the precheck awaits.
  it('validateSchematron() runs the precheck and the transform on the same document', async () => {
    const good = await readFile(F1, 'utf8')
    const broken = good.replace('<ram:GrandTotalAmount>118.70<', '<ram:GrandTotalAmount>1.00<')
    const options = { xml: good, level: 'extended-ctc-fr' }
    const pending = validateSchematron(options)
    options.xml = broken
    await expect(pending).resolves.toMatchObject({ valid: true })
  })

  // CodeRabbit review: two IDs in one BT-24 container also made the transform abort.
  it('reports two guideline IDs in one container as CII-SR-010', async () => {
    const xml = (await readFile(F1, 'utf8')).replace(/(<ram:GuidelineSpecifiedDocumentContextParameter>\s*<ram:ID>[^<]*<\/ram:ID>)/, '$1<ram:ID>urn:junk</ram:ID>')
    expect(xml).toContain('urn:junk')
    const result = await validateSchematron({ xml, level: 'extended-ctc-fr' })
    expect(result.errors.map(e => e.id)).toEqual(['CII-SR-010'])
    expect(JSON.stringify(result.errors)).not.toContain('urn:junk')
  })

  // CodeRabbit review: a Buffer changed in place while the precheck awaits must not reach the
  // transform either.
  it('validateSchematron() copies a Buffer before the precheck', async () => {
    const good = Buffer.from(await readFile(F1, 'utf8'))
    const broken = Buffer.from((await readFile(F1, 'utf8')).replace('<ram:GrandTotalAmount>118.70<', '<ram:GrandTotalAmount>001.00<'))
    expect(broken.length).toBe(good.length)
    const pending = validateSchematron({ xml: good, level: 'extended-ctc-fr' })
    broken.copy(good)
    await expect(pending).resolves.toMatchObject({ valid: true })
  })
})
