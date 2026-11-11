import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import process from 'node:process'
import { check, extract, validateFrCtc } from '@stafyniaksacha/facturx'
import { describe, expect, it } from 'vitest'

import { getMinimumXML, getOrderXBasicXML } from './fixtures/xml'

// Rejected on the guideline ID alone, before any validation, so a relabelled MINIMUM is enough.
const getBasicXML = (): string => getMinimumXML().replace('urn:factur-x.eu:1p0:minimum', 'urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic')

// French CTC rules BR-FR-Flux2 (FNFE-MPE Schematrons FR CTC v1.4.0.04, XP Z12-012 v1.4.0).
// Assertions compare rule ids, never messages: BR-FR messages quote invoice values.

const ROOT = resolve(import.meta.dirname, '..')
const ANNEX_B = join(ROOT, 'spec/afnor-xp-z12-012-1.4/distribution/XP_Z12-012_Annexe_B_EXEMPLES_V1.4/Factures')
const FX_EXAMPLES = join(ROOT, 'spec/factur-x-1.09/distribution/5. FACTUR-X 1.09 - Examples')
const NEGATIVE = join(ROOT, 'examples/Facture_FR_EN16931.xml')
const CLI = join(ROOT, 'bin/facturx.mjs')

function listFiles(dir: string, keep: (name: string) => boolean): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter(entry => entry.isFile() && keep(entry.name))
    .map(entry => join(entry.parentPath, entry.name))
    .sort()
}

async function loadXml(file: string): Promise<string> {
  if (!file.endsWith('.pdf'))
    return readFile(file, 'utf8')
  return (await extract({ pdf: await readFile(file) })).xml.toString()
}

const assertIds = (errors: { assertId?: string }[]): (string | undefined)[] => errors.map(e => e.assertId)

describe('validateFrCtc', () => {
  it('pins the BR-FR rules failed by a non-French-reform invoice', async () => {
    // A valid EN16931 invoice that predates the reform: no PMT/PMD/AAB notes (BR-FR-05), no billing
    // mode BT-23 (BR-FR-08), no seller SIREN in BT-30 (BR-FR-10: a SIRET is given under scheme 0002,
    // which BR-FR-32 also rejects for the seller and the buyer), no electronic addresses (BR-FR-12/13).
    const result = await validateFrCtc({ xml: readFileSync(NEGATIVE, 'utf8'), level: 'en16931' })

    expect(result.valid).toBe(false)
    expect(result.warnings).toEqual([])
    expect(assertIds(result.errors)).toEqual([
      'BR-FR-05_BT-22_PMT',
      'BR-FR-05_BT-22_PMD',
      'BR-FR-05_BT-22_AAB',
      'BR-FR-08_BT-23',
      'BR-FR-10_BT-30',
      'BR-FR-12_BT-49',
      'BR-FR-13_BT-34',
      'BR-FR-32-LEGALID',
      'BR-FR-32-LEGALID',
    ])
    expect(result.errors.map(e => e.id)).toEqual([
      'BR-FR-05',
      'BR-FR-05',
      'BR-FR-05',
      'BR-FR-08',
      'BR-FR-10',
      'BR-FR-12',
      'BR-FR-13',
      'BR-FR-32',
      'BR-FR-32',
    ])
    expect(result.errors.every(e => e.severity === 'error' && e.flag === 'fatal')).toBe(true)
  })

  it('takes the rule id from the assert, not from a bracketed value in the message', async () => {
    // BR-FR-01: BT-1 is at most 35 characters; its message quotes the value ("Valeur actuelle : …").
    const xml = readFileSync(NEGATIVE, 'utf8').replace('<ram:ID>FA-2017-0010</ram:ID>', `<ram:ID>[ZZ-1]${'0'.repeat(40)}</ram:ID>`)
    const result = await validateFrCtc({ xml, level: 'en16931' })

    const br01 = result.errors.filter(e => e.assertId === 'BR-FR-01_BT-1')
    expect(br01).toHaveLength(1)
    expect(br01[0].id).toBe('BR-FR-01')
  })

  it('accepts the in-scope profiles and rejects the others before running', async () => {
    await expect(validateFrCtc({ xml: getMinimumXML(), level: 'minimum' })).rejects.toThrow(/BASIC WL, EN16931 and EXTENDED/)
    await expect(validateFrCtc({ xml: getBasicXML(), level: 'basic' })).rejects.toThrow(/BASIC WL, EN16931 and EXTENDED/)
    await expect(validateFrCtc({ xml: getOrderXBasicXML(), flavor: 'orderx', level: 'basic' })).rejects.toThrow(/Factur-X/)
    await expect(validateFrCtc({ xml: getMinimumXML(), level: '__proto__' })).rejects.toThrow(/BASIC WL/)
  })

  it('checks the document itself instead of trusting the caller', async () => {
    // The BR-FR transform finds nothing to check on a non-CII document and would pass it.
    await expect(validateFrCtc({ xml: getOrderXBasicXML(), level: 'en16931' })).rejects.toThrow(/got root element "SCRDMCCBDACIOMessageStructure"/)
    await expect(validateFrCtc({ xml: '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"/>', level: 'en16931' })).rejects.toThrow(/got root element "Invoice"/)
    // A MINIMUM invoice can't be passed off as EN16931, nor run without a level.
    await expect(validateFrCtc({ xml: getMinimumXML(), level: 'en16931' })).rejects.toThrow(/does not match the profile declared by the document \("minimum"\)/)
    await expect(validateFrCtc({ xml: getMinimumXML() })).rejects.toThrow(/got level "minimum"/)
    // Without a level, the declared profile is used.
    const result = await validateFrCtc({ xml: readFileSync(NEGATIVE, 'utf8') })
    expect(result.errors.length).toBe(9)
  })
})

describe('check({ frCtc })', () => {
  it('folds BR-FR into valid and reports it separately', async () => {
    const xml = readFileSync(NEGATIVE, 'utf8')

    const plain = await check({ xml })
    expect(plain.valid).toBe(true)
    expect(plain.frCtcValid).toBeUndefined()

    const result = await check({ xml, frCtc: true })
    expect(result.errors).toEqual([])
    expect(result.schematronValid).toBeUndefined() // frCtc does not imply schematron
    expect(result.frCtcValid).toBe(false)
    expect(result.valid).toBe(false)
    expect(result.frCtcWarnings).toEqual([])
    expect(new Set(result.frCtcErrors?.map(e => e.id))).toEqual(new Set(['BR-FR-05', 'BR-FR-08', 'BR-FR-10', 'BR-FR-12', 'BR-FR-13', 'BR-FR-32']))
  })

  it('throws for MINIMUM, BASIC and Order-X', async () => {
    await expect(check({ xml: getMinimumXML(), frCtc: true })).rejects.toThrow(/got level "minimum"/)
    await expect(check({ xml: getBasicXML(), frCtc: true })).rejects.toThrow(/got level "basic"/)
    await expect(check({ xml: getOrderXBasicXML(), frCtc: true })).rejects.toThrow(/got flavor "orderx"/)
  })
})

// XP Z12-012 v1.4 Annex B: the official examples of the French reform. They must pass the whole
// sequence of the release notes p.9: XSD, profile Schematron, then BR-FR.
describe('xP Z12-012 Annex B examples', () => {
  const factureX = listFiles(ANNEX_B, n => n.endsWith('.pdf') || /_FX_CII_.*\.xml$/.test(n))
  // Plain CII in the EXTENDED-CTC-FR profile: no Factur-X level to detect, and this package has no
  // EXTENDED-CTC-FR XSD/Schematron (CONFORMANCE.md CG-18). BR-FR applies to it the same way (p.9-10),
  // so check that step alone.
  const ctcFr = listFiles(ANNEX_B, n => /_EXTENDED-CTC-FR_CII_.*\.xml$/.test(n))

  it('finds the corpus', () => {
    expect(factureX.length).toBe(24)
    expect(ctcFr.length).toBe(6)
  })

  it.each(factureX.map(file => ({ file, name: relative(ANNEX_B, file) })))('$name', async ({ file }) => {
    const result = await check({ xml: await loadXml(file), schematron: true, frCtc: true })

    expect(['en16931', 'extended']).toContain(result.level)
    expect(result.errors).toEqual([])
    expect(assertIds(result.schematronErrors ?? [])).toEqual([])
    expect(assertIds(result.schematronWarnings ?? [])).toEqual([])
    expect(assertIds(result.frCtcErrors ?? [])).toEqual([])
    expect(assertIds(result.frCtcWarnings ?? [])).toEqual([])
    expect(result.valid).toBe(true)
  })

  it.each(ctcFr.map(file => ({ file, name: relative(ANNEX_B, file) })))('$name (BR-FR only)', async ({ file }) => {
    const result = await validateFrCtc({ xml: await loadXml(file), level: 'extended' })
    expect(assertIds(result.errors)).toEqual([])
    expect(result.valid).toBe(true)
  })
})

// Official Factur-X 1.09 examples: snapshot of what BR-FR says about them. Most predate the reform; the
// ones that fail break BR-FR-32 (a SIREN under scheme 0002 written with spaces) and BR-FR-CO-10 (the same
// GlobalID scheme 0088 twice for the seller), both genuine in the example data.
describe('official Factur-X 1.09 examples under BR-FR', () => {
  const LEVEL_BY_FOLDER: Record<string, string> = {
    '0.MINIMUM': 'minimum',
    '1.BASIC WL': 'basicwl',
    '2.BASIC': 'basic',
    '3.EN16931': 'en16931',
    '4.EXTENDED': 'extended',
  }
  const FAILING: Record<string, string[]> = Object.fromEntries([
    '1.BASIC WL/Facture_F20260030-LE_FOURNISSEUR-POUR-LE_CLIENT_BASIC_WL.pdf',
    '1.BASIC WL/Facture_F20260031-LE_FOURNISSEUR-POUR-LE_CLIENT_BASIC_WL.pdf',
    '3.EN16931/Facture_F20260030-LE_FOURNISSEUR-POUR-LE_CLIENT_EN_16931.pdf',
    '3.EN16931/Facture_F20260031-LE_FOURNISSEUR-POUR-LE_CLIENT_EN_16931.pdf',
    '4.EXTENDED/Facture_F20260030-LE_FOURNISSEUR-POUR-LE_CLIENT_EXTENDED.pdf',
    '4.EXTENDED/Facture_F20260031-LE_FOURNISSEUR-POUR-LE_CLIENT_EXTENDED.pdf',
  ].map(f => [`_Factur-X_1.08-Exemples_CS/${f}`, ['BR-FR-32-LEGALID', 'BR-FR-CO-10_BT-29-2']]))

  const examples = listFiles(FX_EXAMPLES, n => n.toLowerCase().endsWith('.pdf')).map((file) => {
    const name = relative(FX_EXAMPLES, file)
    const folder = Object.keys(LEVEL_BY_FOLDER).find(f => name.includes(`${f}/`))
    return { file, name, level: folder ? LEVEL_BY_FOLDER[folder] : 'unknown' }
  })
  const inScope = examples.filter(e => ['basicwl', 'en16931', 'extended'].includes(e.level))
  const outOfScope = examples.filter(e => ['minimum', 'basic'].includes(e.level))

  it('covers the corpus', () => {
    expect(examples.length).toBe(56)
    expect(inScope.length).toBe(34)
    expect(outOfScope.length).toBe(22)
    expect(Object.keys(FAILING).every(name => inScope.some(e => e.name === name))).toBe(true)
  })

  it.each(inScope)('$name', async ({ file, name, level }) => {
    const result = await validateFrCtc({ xml: await loadXml(file), level })
    expect(assertIds(result.errors)).toEqual(FAILING[name] ?? [])
  })

  it('rejects the MINIMUM and BASIC examples', async () => {
    for (const { file, level } of outOfScope)
      await expect(validateFrCtc({ xml: await loadXml(file), level })).rejects.toThrow(/BASIC WL, EN16931 and EXTENDED/)
  })
})

describe('facturx check --fr-ctc', () => {
  const run = (...args: string[]): { status: number | null, stdout: string, stderr: string } =>
    spawnSync(process.execPath, [CLI, 'check', ...args], { encoding: 'utf8' })

  it('exits 1 and lists the BR-FR rules', () => {
    const { status, stderr } = run('--schematron', '--fr-ctc', NEGATIVE)
    expect(status).toBe(1)
    expect(stderr.includes('XSD + Schematron + BR-FR')).toBe(true)
    for (const id of ['BR-FR-05_BT-22_PMT', 'BR-FR-08_BT-23', 'BR-FR-10_BT-30', 'BR-FR-32-LEGALID'])
      expect(stderr.includes(`[BR-FR] ${id}: `), id).toBe(true)
  })

  it('exits 0 on an official reform example', () => {
    const file = listFiles(ANNEX_B, n => n === 'UC4_F202500006_00-INV_20250701_EN16931_FX_CII_Commentee.xml')[0]
    const { status, stdout } = run('--schematron', '--fr-ctc', '-W', file)
    expect(status).toBe(0)
    expect(stdout.trim()).toBe('Valid XML format (facturx - en16931, XSD + Schematron + BR-FR)')
  })

  it('exits 1 with a clear message out of scope', () => {
    const { status, stderr } = run('--fr-ctc', join(ROOT, 'examples/Facture_FR_MINIMUM.xml'))
    expect(status).toBe(1)
    expect(stderr).toMatch(/BASIC WL, EN16931 and EXTENDED profiles only, got level "minimum"/)
  })
})
