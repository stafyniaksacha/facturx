import { readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { check } from '@stafyniaksacha/facturx'
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
    let out: string
    try {
      out = JSON.stringify(await check({ xml }))
    }
    catch (error) {
      out = String(error)
    }
    expect(out).not.toContain('root:')
  })
})
