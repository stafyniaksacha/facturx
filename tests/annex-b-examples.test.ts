import { readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { check, extract, invoiceToXml, xmlToInvoice } from '@stafyniaksacha/facturx'
import { describe, expect, it } from 'vitest'

// Official example invoices of XP Z12-012 v1.4 annex B (see spec/README.md): the Factur-X ones
// (EN16931 and EXTENDED profiles, as hybrid PDF and as commented CII XML). They are the second
// conformance corpus, for the profiles moved to Factur-X 1.09.2.fixFR04: every one must pass the
// XSD and the profile Schematron of the level named in its file name, with no warning.
// The French BR-FR rules are not run here.
const EXAMPLES_DIR = resolve(import.meta.dirname, '../spec/afnor-xp-z12-012-1.4/distribution/XP_Z12-012_Annexe_B_EXEMPLES_V1.4/Factures')

// CG-01: these examples carry unit prices with more than 2 decimals (e.g. BT-148 489.057,
// BT-146 0.6925), which the converter rounds to 2. The round-trip is expected to lose them until
// CG-01 is fixed; this list then has to be emptied.
const CG01_ROUND_TRIP_LOSS = ['UC11_F202600022', 'UC13_AUTOF202600035']

function levelFromName(name: string): string {
  if (/EXTENDED/.test(name))
    return 'extended'
  if (/EN16931/.test(name))
    return 'en16931'
  return 'unknown'
}

function listExamples(dir: string): { file: string, name: string, level: string, kind: 'pdf' | 'xml' }[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter(entry => entry.isFile() && (entry.name.endsWith('.pdf') || entry.name.endsWith('_FX_CII_Commentee.xml')))
    .map((entry) => {
      const file = join(entry.parentPath, entry.name)
      return { file, name: relative(dir, file), level: levelFromName(entry.name), kind: entry.name.endsWith('.pdf') ? 'pdf' as const : 'xml' as const }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

const examples = listExamples(EXAMPLES_DIR)

describe('official XP Z12-012 v1.4 annex B Factur-X examples', () => {
  it('finds the example corpus', () => {
    expect(examples.filter(e => e.kind === 'pdf')).toHaveLength(12)
    expect(examples.filter(e => e.kind === 'xml')).toHaveLength(12)
    expect(examples.filter(e => e.level === 'unknown')).toEqual([])
  })

  it.each(examples)('$name', async ({ file, name, level, kind }) => {
    let xml: string
    if (kind === 'pdf') {
      const extracted = await extract({ pdf: await readFile(file) })
      expect(extracted.filename).toBe('factur-x.xml')
      expect(extracted.flavor).toBe('facturx')
      xml = extracted.xml
    }
    else {
      xml = await readFile(file, 'utf8')
    }

    const result = await check({ xml, schematron: true })
    expect(result.level).toBe(level)
    expect(result.errors).toEqual([])
    expect(result.schematronErrors).toEqual([])
    expect(result.schematronWarnings).toEqual([])

    const model = await xmlToInvoice(xml)
    const serialized = (await invoiceToXml(model)).toString()
    const reparsed = await check({ xml: serialized, level })
    expect(reparsed.errors).toEqual([])
    if (CG01_ROUND_TRIP_LOSS.some(id => name.includes(id)))
      expect(await xmlToInvoice(serialized)).not.toEqual(model)
    else
      expect(await xmlToInvoice(serialized)).toEqual(model)
  })
})
