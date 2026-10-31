import { readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { check, extract, invoiceToXml, xmlToInvoice } from '@stafyniaksacha/facturx'
import { describe, expect, it } from 'vitest'

// Official example invoices shipped with the Factur-X 1.09 distribution (see spec/README.md).
// They are the conformance corpus: every one must extract, validate (XSD + Schematron) at the
// level of its folder, and survive a model round-trip without losing data.
const EXAMPLES_DIR = resolve(import.meta.dirname, '../spec/factur-x-1.09/distribution/5. FACTUR-X 1.09 - Examples')

const LEVEL_BY_FOLDER: Record<string, string> = {
  '0.MINIMUM': 'minimum',
  '1.BASIC WL': 'basicwl',
  '2.BASIC': 'basic',
  '3.EN16931': 'en16931',
  '4.EXTENDED': 'extended',
}

function listExamples(dir: string): { file: string, name: string, level: string }[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.pdf'))
    .map((entry) => {
      const file = join(entry.parentPath, entry.name)
      const folder = Object.keys(LEVEL_BY_FOLDER).find(f => file.includes(`/${f}/`))
      return { file, name: relative(dir, file), level: folder ? LEVEL_BY_FOLDER[folder] : 'unknown' }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

const examples = listExamples(EXAMPLES_DIR)

describe('official Factur-X 1.09 examples', () => {
  it('finds the example corpus', () => {
    expect(examples.length).toBeGreaterThan(0)
    expect(examples.filter(e => e.level === 'unknown')).toEqual([])
  })

  it.each(examples)('$name', async ({ file, level }) => {
    const extracted = await extract({ pdf: await readFile(file) })
    expect(extracted.filename).toBe('factur-x.xml')
    expect(extracted.flavor).toBe('facturx')

    const result = await check({ xml: extracted.xml, schematron: true })
    expect(result.level).toBe(level)
    expect(result.errors).toEqual([])
    expect(result.schematronErrors).toEqual([])

    // Round-trip: parse → serialize must stay XSD-valid and must not lose data
    // (model equality makes a second, slow Schematron pass redundant).
    const model = await xmlToInvoice(extracted.xml)
    const serialized = (await invoiceToXml(model)).toString()
    const reparsed = await check({ xml: serialized, level })
    expect(reparsed.errors).toEqual([])
    expect(await xmlToInvoice(serialized)).toEqual(model)
  })
})
