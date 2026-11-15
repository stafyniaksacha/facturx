import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import process from 'node:process'
import { check, validateSchematron } from '@stafyniaksacha/facturx'
import { describe, expect, it } from 'vitest'

const FACTURES = resolve(import.meta.dirname, '../spec/afnor-xp-z12-012-1.4/distribution/XP_Z12-012_Annexe_B_EXEMPLES_V1.4/Factures')

const CUSTOMIZATION = /<cbc:CustomizationID>[^<]*<\/cbc:CustomizationID>/

const examples = readdirSync(FACTURES, { withFileTypes: true, recursive: true })
  .filter(entry => entry.isFile() && entry.name.endsWith('_UBL_Commentee.xml'))
  // Dirent.parentPath only exists from Node 20.12; engines allows 20.11, which has `path`.
  .map(entry => ({ file: join(entry.parentPath ?? (entry as { path?: string }).path ?? FACTURES, entry.name), name: entry.name }))
  .sort((a, b) => a.file.localeCompare(b.file))
  .map(({ file, name }) => ({
    file,
    name: relative(FACTURES, file),
    level: /EXTENDED-CTC-FR/.test(name) ? 'extended-ctc-fr' : 'en16931',
  }))

const UC = examples[0].file

async function withId(id: string | null): Promise<string> {
  const xml = await readFile(UC, 'utf8')
  return xml.replace(CUSTOMIZATION, id === null ? '' : `<cbc:CustomizationID>${id}</cbc:CustomizationID>`)
}

describe('uBL detection and XSD validation', () => {
  it('finds the 12 annex B UBL examples (6 EN16931, 6 EXTENDED-CTC-FR, 1 CreditNote)', async () => {
    expect(examples).toHaveLength(12)
    expect(examples.filter(e => e.level === 'en16931')).toHaveLength(6)
    expect(examples.filter(e => e.level === 'extended-ctc-fr')).toHaveLength(6)
    const roots = await Promise.all(examples.map(async e => /<(?:\w+:)?(Invoice|CreditNote)[\s>]/.exec(await readFile(e.file, 'utf8'))?.[1]))
    expect(roots.filter(r => r === 'CreditNote')).toHaveLength(1)
    // The file name rule matches the CustomizationID of every example.
    for (const e of examples) {
      const id = CUSTOMIZATION.exec(await readFile(e.file, 'utf8'))?.[0] ?? ''
      expect(id.includes('extended-ctc-fr')).toBe(e.level === 'extended-ctc-fr')
    }
  })

  it.each(examples)('$name passes the UBL 2.1 XSD at its level', async ({ file, level }) => {
    const r = await check({ xml: await readFile(file) })
    expect(r).toMatchObject({ flavor: 'ubl', level, valid: true, errors: [] })
  })

  it('accepts a string with a BOM', async () => {
    const xml = await readFile(UC, 'utf8')
    expect(xml.charCodeAt(0)).toBe(0xFEFF)
    await expect(check({ xml })).resolves.toMatchObject({ flavor: 'ubl', valid: true })
  })

  it('rejects an Invoice root outside the UBL namespace', async () => {
    await expect(check({ xml: '<Invoice xmlns="urn:example"/>' })).rejects.toThrow(/not recognized/)
  })

  it('treats a CIUS CustomizationID as en16931', async () => {
    const xml = await withId('urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0')
    await expect(check({ xml })).resolves.toMatchObject({ flavor: 'ubl', level: 'en16931' })
  })

  it('rejects an unknown extension and names the level option', async () => {
    const xml = await withId('urn:cen.eu:en16931:2017#conformant#urn:example:1p0:other')
    await expect(check({ xml })).rejects.toThrow(/level/)
  })

  it('rejects a document without CustomizationID', async () => {
    await expect(check({ xml: await withId(null) })).rejects.toThrow(/CustomizationID/)
  })

  it('reports XSD errors for a structurally broken invoice', async () => {
    const xml = (await readFile(UC, 'utf8')).replace(/<cbc:ID>[^<]*<\/cbc:ID>/, '')
    const r = await check({ xml })
    expect(r.valid).toBe(false)
    expect(r.errors.length).toBeGreaterThan(0)
  })

  it('does not expand external entities', async () => {
    const raw = await readFile(UC, 'utf8')
    const xml = raw.slice(raw.charCodeAt(0) === 0xFEFF ? 1 : 0)
      .replace(/(<\?xml[^>]*\?>)?/, m => `${m}<!DOCTYPE Invoice [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>`)
      .replace(/<cbc:ID>/, '<cbc:Note>&xxe;</cbc:Note><cbc:ID>')
    // Positive control: the payload really declares the entity and uses it.
    expect(xml).toContain('<!ENTITY xxe SYSTEM "file:///etc/passwd">')
    expect(xml).toContain('&xxe;')
    let out: string
    let parsed = false
    try {
      const r = await check({ xml })
      parsed = r.flavor === 'ubl'
      out = JSON.stringify(r)
    }
    catch (error) {
      out = String(error)
    }
    // Reached validation (valid or XSD errors), and nothing from the file leaked.
    expect(parsed).toBe(true)
    expect(out).not.toContain('root:')
  })

  it('bounds an unknown CustomizationID in the error message', async () => {
    const id = `urn:cen.eu:en16931:2017#conformant#${'x'.repeat(500)}`
    const xml = await withId(id)
    const error = await check({ xml }).catch(e => e as Error)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain(`"${id.slice(0, 100)}…"`)
    expect((error as Error).message).not.toContain('x'.repeat(101))
  })

  it('rejects an explicit extended-ctc-fr level on an EN16931 UBL document', async () => {
    const en = examples.find(e => e.level === 'en16931')!
    await expect(check({ xml: await readFile(en.file), level: 'extended-ctc-fr' })).rejects.toThrow(/does not match the document/)
  })

  it('rejects an explicit ubl flavor on a CII document', async () => {
    const cii = await readFile(resolve(import.meta.dirname, '../examples/Facture_FR_EN16931.xml'))
    await expect(check({ xml: cii, flavor: 'ubl' })).rejects.toThrow(/does not match the "ubl" flavor/)
  })

  it('rejects an explicit en16931 level on an EXTENDED-CTC-FR UBL document', async () => {
    const ext = examples.find(e => e.level === 'extended-ctc-fr')!
    await expect(check({ xml: await readFile(ext.file), level: 'en16931', schematron: true })).rejects.toThrow(/does not match the document/)
    await expect(validateSchematron({ xml: await readFile(ext.file), flavor: 'ubl', level: 'en16931' })).rejects.toThrow(/does not match the document/)
  })
})

describe('uBL profile Schematron (step 2)', () => {
  const en = examples.find(e => e.level === 'en16931')!

  // CG-42: the EXTENDED-CTC-FR UBL example F202500001 raises the warning BR-FREXT-IC-08rev; the other 11 are clean.
  // `it.fails` turns green again (and so fails the run) as soon as the example starts passing.
  const cg42 = (name: string): boolean => name.includes('F202500001_INV_20250201_EXTENDED-CTC-FR_UBL')
  for (const { file, level, name } of examples) {
    const run = cg42(name) ? it.fails : it
    run(`${name} passes XSD + profile Schematron with no error and no warning${cg42(name) ? ' (CG-42)' : ''}`, async () => {
      const r = await check({ xml: await readFile(file), schematron: true })
      expect(r).toMatchObject({ flavor: 'ubl', level, valid: true, schematronErrors: [], schematronWarnings: [] })
    })
  }

  // Pins today's outcome of CG-42 (not `it.fails`): goes red when upstream fixes the rule or the
  // example, which is the cue to close CG-42 and drop the `it.fails` row above.
  it('cG-42: F202500001 is valid with no error and exactly the warning BR-FREXT-IC-08rev', async () => {
    const example = examples.find(e => cg42(e.name))!
    const r = await check({ xml: await readFile(example.file), schematron: true })
    expect(r).toMatchObject({ flavor: 'ubl', level: 'extended-ctc-fr', valid: true, errors: [], schematronErrors: [] })
    expect(r.schematronWarnings!.map(w => w.id ?? w.assertId)).toEqual(['BR-FREXT-IC-08rev'])
  })

  it('reports BR-CO-15 as an error when the totals do not add up', async () => {
    const xml = (await readFile(en.file, 'utf8')).replace(/(<cbc:TaxInclusiveAmount[^>]*>)[^<]*/, '$1999999.00')
    const r = await check({ xml, schematron: true })
    expect(r.valid).toBe(false)
    expect(r.errors).toEqual([])
    expect(r.schematronValid).toBe(false)
    expect(r.schematronErrors!.map(e => e.id)).toContain('BR-CO-15')
  })

  it('reports a UBL-CR restriction as a warning, not an error', async () => {
    // UBL-CR-005: the CEN binding does not use cbc:UUID (XSD-valid, after cbc:ID in the sequence).
    const xml = (await readFile(en.file, 'utf8')).replace('</cbc:ID>', '</cbc:ID><cbc:UUID>u</cbc:UUID>')
    const r = await check({ xml, schematron: true })
    expect(r).toMatchObject({ valid: true, errors: [], schematronValid: true, schematronErrors: [] })
    expect(r.schematronWarnings!.map(w => w.id ?? w.assertId)).toContain('UBL-CR-005')
    expect(r.schematronWarnings!.every(w => w.severity === 'warning')).toBe(true)
  })

  it('treats warnings as errors with warningsAsErrors', async () => {
    const xml = (await readFile(en.file, 'utf8')).replace('</cbc:ID>', '</cbc:ID><cbc:UUID>u</cbc:UUID>')
    const r = await check({ xml, schematron: true, warningsAsErrors: true })
    expect(r.valid).toBe(false)
    expect(r.schematronErrors!.map(w => w.id)).toContain('UBL-CR-005')
  })

  it('rejects an explicit level the document does not declare', async () => {
    await expect(check({ xml: await readFile(en.file), level: 'extended-ctc-fr', schematron: true })).rejects.toThrow(/does not match/)
  })

  it('keeps XSD errors when the profile rules cannot run on invalid data', async () => {
    const xml = (await readFile(en.file, 'utf8')).replace(/(<cbc:PayableAmount[^>]*>)[^<]*/, '$1abc')
    const r = await check({ xml, schematron: true })
    expect(r.valid).toBe(false)
    expect(r.errors.length).toBeGreaterThan(0)
    expect(r.schematronErrors![0].message).toMatch(/could not run/)
    expect(r.schematronErrors![0].message).not.toContain('abc')
  })

  it('validateSchematron routes flavor ubl and rejects an unknown level', async () => {
    const r = await validateSchematron({ xml: await readFile(en.file), flavor: 'ubl', level: 'en16931' })
    expect(r).toMatchObject({ valid: true, errors: [], warnings: [] })
    await expect(validateSchematron({ xml: await readFile(en.file), flavor: 'ubl', level: 'basic' })).rejects.toThrow(/level/)
  })
})

describe('uBL full sequence (XSD + profile + BR-FR)', () => {
  it.each(examples)('$name passes the BR-FR rules with no finding', async ({ file }) => {
    const r = await check({ xml: await readFile(file), schematron: true, frCtc: true })
    // CG-42: the profile Schematron may warn (BR-FREXT-IC-08rev); that lands in schematronWarnings.
    expect(r).toMatchObject({ valid: true, errors: [], schematronErrors: [], frCtcValid: true, frCtcErrors: [], frCtcWarnings: [] })
    // Three SEFs per document: <0.4 s alone, so 20 s is a loaded-machine margin, not the default 5 s.
  }, 20_000)
})

describe('facturx check on a UBL file', () => {
  const CLI = resolve(import.meta.dirname, '../bin/facturx.mjs')
  const run = (...args: string[]): { status: number | null, stdout: string, stderr: string } =>
    spawnSync(process.execPath, [CLI, 'check', ...args], { encoding: 'utf8' })

  it('validates a UBL example with the full sequence and names the flavor', () => {
    const { status, stdout } = run(UC, '--schematron', '--fr-ctc')
    expect(status).toBe(0)
    expect(stdout).toContain('Valid XML format (ubl - en16931, XSD + Schematron + BR-FR)')
  })

  it('exits 1 on a UBL invoice that breaks a business rule', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'facturx-ubl-'))
    try {
      const file = join(dir, 'bad.xml')
      writeFileSync(file, (await readFile(UC, 'utf8')).replace(/(<cbc:TaxInclusiveAmount[^>]*>)[^<]*/, '$1999999.00'))
      const { status, stderr } = run(file, '--schematron')
      expect(status).toBe(1)
      expect(stderr).toContain('[Schematron]')
      expect(stderr).toContain('BR-CO-15')
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
