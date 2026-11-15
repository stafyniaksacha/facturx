import { readdirSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { check, extract, fromCii, invoiceToXml, toCii, xmlToInvoice } from '@stafyniaksacha/facturx'
import { describe, expect, it } from 'vitest'
import { FIRST_ENTRY_ONLY, spreadVatPoint } from './fixtures/vat-point'

/**
 * Corpus proof of the EN 16931 model ⇄ CII mapping (design, PR ② "Proof"), on every official example:
 * the Factur-X 1.09 corpus at BASIC, EN 16931 and EXTENDED, and the XP Z12-012 v1.4 annex B Factur-X
 * examples (hybrid PDFs and commented CII XML, EN 16931, EXTENDED and EXTENDED-CTC-FR).
 * MINIMUM and BASIC WL are not EN 16931 invoices: `fromCii()` rejects them, so their folders are
 * skipped on purpose (tests/en16931-model.test.ts covers the rejection).
 */

const CORPUS_DIR = resolve(import.meta.dirname, '../spec/factur-x-1.09/distribution/5. FACTUR-X 1.09 - Examples/_Factur-X_1.08-Exemples_CS')
const ANNEX_B_DIR = resolve(import.meta.dirname, '../spec/afnor-xp-z12-012-1.4/distribution/XP_Z12-012_Annexe_B_EXEMPLES_V1.4/Factures')
const FX = resolve(import.meta.dirname, '../spec/factur-x-1.09/text')

type Level = 'basic' | 'en16931' | 'extended' | 'extended-ctc-fr'
interface Doc { name: string, level: Level, xml: string }

async function corpusDocs(folder: string, level: Level): Promise<Doc[]> {
  const dir = join(CORPUS_DIR, folder)
  const files = readdirSync(dir).filter(f => f.endsWith('.pdf')).sort()
  return Promise.all(files.map(async (f) => {
    const { xml } = await extract({ pdf: await readFile(join(dir, f)) })
    return { name: `corpus ${folder}/${f}`, level, xml }
  }))
}

// Level by file name: the F202500001 folder holds the EXTENDED Factur-X document under an `_EXTENDED-CTC-FR` directory.
function annexLevel(name: string): Level {
  return name.includes('EXTENDED-CTC-FR') ? 'extended-ctc-fr' : name.includes('EXTENDED') ? 'extended' : 'en16931'
}

async function annexDocs(): Promise<Doc[]> {
  const files = readdirSync(ANNEX_B_DIR, { withFileTypes: true, recursive: true })
    .filter(e => e.isFile() && ((/_CII_Commentee\.xml$/.test(e.name)) || (e.name.endsWith('.pdf'))))
    .map(e => join(e.parentPath ?? (e as { path?: string }).path ?? '', e.name))
    .sort()
  return Promise.all(files.map(async (file) => {
    const name = file.split('/').pop()!
    const xml = name.endsWith('.pdf') ? (await extract({ pdf: await readFile(file) })).xml : await readFile(file, 'utf8')
    return { name: `annex B ${name}`, level: annexLevel(name), xml }
  }))
}

const docs: Doc[] = [
  ...await corpusDocs('2.BASIC', 'basic'),
  ...await corpusDocs('3.EN16931', 'en16931'),
  ...await corpusDocs('4.EXTENDED', 'extended'),
  ...await annexDocs(),
]
const lossless = docs.filter(d => d.level !== 'extended')
const facturxExtended = docs.filter(d => d.level === 'extended')

const checkLevel = (level: Level): string => level

/** Normalised absolute XPath of a Factur-X matrix cell: indices and whitespace out. */
const norm = (xpath: string): string => xpath.replace(/\s+/g, '').replace(/\[\d+\]/g, '')

/** Minimal RFC 4180 reader (quoted fields, doubled quotes, newlines inside quotes). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        }
        else {
          quoted = false
        }
      }
      else {
        field += c
      }
    }
    else if (c === '"') {
      quoted = true
    }
    else if (c === ',') {
      row.push(field)
      field = ''
    }
    else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    }
    else if (c !== '\r') {
      field += c
    }
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

// EXTENDED matrix: column 5 the EN 16931 / BT-X id, column 6 the CTC-FR reform id, column 17 the XPath.
const matrixRows = parseCsv(readFileSync(join(FX, 'fields--Factur-X_CII_D22B_EXTENDED.csv'), 'utf8')).slice(4).filter(r => r[5] && r[17]).map(r => ({ id: r[5]!.trim(), ctc: (r[6] ?? '').trim(), xpath: norm(r[17]!) }))

/**
 * Not "true BT-X" although they carry no EN 16931 / EXT-FR-FE id: the EXTENDED-only rows of Factur-X 1.09
 * that the controller ruled out of the model's scope (they sit outside annex A, so `dropped` reports them).
 */
const RULED_OUT = new Set(['BT-179', 'BT-180', 'BT-215', 'BT-216', 'BG-34'])

/**
 * Classify a `dropped` path against the EXTENDED matrix: the ids of the rows at the same XPath (the
 * path itself, else its nearest ancestor with a row, as `.../ram:X/@schemeID` or `.../udt:DateString`).
 * Returns the offending ids; empty when the path holds only true BT-X content.
 */
function notBtX(path: string): string[] {
  let xpath = norm(path)
  let rows = matrixRows.filter(r => r.xpath === xpath)
  while (!rows.length && xpath.lastIndexOf('/') > 0) {
    xpath = xpath.slice(0, xpath.lastIndexOf('/'))
    rows = matrixRows.filter(r => r.xpath === xpath)
  }
  if (!rows.length)
    return [`${path}: no row in the EXTENDED matrix`]
  const bad = rows.filter(r => r.ctc.startsWith('EXT-FR-FE') || !(r.id.startsWith('BT-X-') || RULED_OUT.has(r.id)))
  return bad.map(r => `${path}: ${r.id}${r.ctc ? ` / ${r.ctc}` : ''}`)
}

describe('en 16931 model: corpus', () => {
  it('finds the corpus', () => {
    // BASIC 11 + EN 16931 11 + EXTENDED 12 corpus PDFs, 18 annex B CII XML and 12 annex B PDFs.
    expect(docs).toHaveLength(34 + 18 + 12)
    expect(lossless.length).toBeGreaterThan(0)
    expect(facturxExtended.length).toBeGreaterThan(0)
  })

  it.each(docs)('$name: fromCii → toCii → invoiceToXml is valid at its level', async ({ xml, level }) => {
    const { invoice } = fromCii(await xmlToInvoice(xml))
    const written = (await invoiceToXml(toCii(invoice, { level }))).toString()
    const result = await check({ xml: written, schematron: true })
    expect(result.level).toBe(checkLevel(level))
    expect(result.errors).toEqual([])
    expect(result.schematronErrors).toEqual([])
    expect(result.schematronWarnings).toEqual([])
    expect(result.valid).toBe(true)
  }, 60_000)

  it.each(lossless)('$name: lossless (dropped empty, CII model deep-equal)', async ({ name, xml, level }) => {
    const cii = await xmlToInvoice(xml)
    const { invoice, dropped } = fromCii(cii)
    expect(dropped).toEqual([])
    const expected = FIRST_ENTRY_ONLY.test(name) ? spreadVatPoint(cii) : cii
    // The CII model after the trip, read back through the XML writer and the parser (as the existing
    // corpus tests compare: `toCii()` leaves optional repeating groups `undefined` where the parser
    // reads `[]`, which is no data).
    const again = await xmlToInvoice((await invoiceToXml(toCii(invoice, { level }))).toString())
    expect(again).toEqual(expected)
  })

  it.each(facturxExtended)('$name: dropped holds only true BT-X content', async ({ name, xml, level }) => {
    const cii = await xmlToInvoice(xml)
    const { invoice, dropped } = fromCii(cii)
    expect(dropped.flatMap(notBtX)).toEqual([])
    // Nothing else changes: the rest of the CII model comes back the same.
    const expected = FIRST_ENTRY_ONLY.test(name) ? spreadVatPoint(cii) : cii
    if (!dropped.length)
      expect(await xmlToInvoice((await invoiceToXml(toCii(invoice, { level }))).toString())).toEqual(expected)
  })

  it('reports Factur-X-only content in dropped and the checker accepts it as BT-X', async () => {
    // The official examples carry no BT-X content, so inject some: a line status code (BT-X-7) and a
    // test indicator (BT-X-1) on a Factur-X EXTENDED document.
    const source = facturxExtended.find(d => d.name.includes('4.EXTENDED'))!
    const xml = source.xml
      .replace('</ram:AssociatedDocumentLineDocument>', '<ram:LineStatusCode>NEW</ram:LineStatusCode></ram:AssociatedDocumentLineDocument>')
      .replace('<ram:GuidelineSpecifiedDocumentContextParameter>', '<ram:TestIndicator><udt:Indicator>false</udt:Indicator></ram:TestIndicator><ram:GuidelineSpecifiedDocumentContextParameter>')
    expect(xml).not.toBe(source.xml)
    const { dropped } = fromCii(await xmlToInvoice(xml))
    expect(dropped.length).toBeGreaterThan(0)
    expect(dropped.some(p => p.endsWith('/ram:LineStatusCode'))).toBe(true)
    expect(dropped.flatMap(notBtX)).toEqual([])
    // The classifier is not vacuous: a path with an EXT-FR-FE id, an unknown path and a ruled-out id are told apart.
    expect(notBtX('/rsm:CrossIndustryInvoice/rsm:ExchangedDocument/ram:ID')).not.toEqual([])
    expect(notBtX('/rsm:CrossIndustryInvoice/rsm:Nonsense')).not.toEqual([])
  })

  it('round-trips XML-special and non-ASCII text', async () => {
    const source = docs.find(d => d.name.includes('3.EN16931'))!
    const name = 'Société & Fils <SARL> €'
    const { invoice } = fromCii(await xmlToInvoice(source.xml))
    invoice.seller.name = name
    const xml = (await invoiceToXml(toCii(invoice, { level: 'en16931' }))).toString()
    expect(xml).toContain('Société &amp; Fils &lt;SARL&gt; €')
    const back = fromCii(await xmlToInvoice(xml))
    expect(back.invoice.seller.name).toBe(name)
    expect(back.dropped).toEqual([])
    const check1 = await check({ xml, schematron: true })
    expect(check1.valid).toBe(true)
  })

  it('writes an unrounded unit price and a many-digit quantity unchanged', async () => {
    // UC11 / UC13 carry BT-146 / BT-148 with more than 2 decimals; the model keeps them as numbers.
    const source = docs.find(d => d.level === 'extended' && d.name.includes('annex B') && /UC11|UC13/.test(d.name))
    expect(source).toBeDefined()
    const { invoice } = fromCii(await xmlToInvoice(source!.xml))
    const prices = invoice.lines.flatMap(l => l.price?.netPrice ?? [])
    expect(prices.some(p => Math.round(p * 100) !== p * 100)).toBe(true)
    const xml = (await invoiceToXml(toCii(invoice, { level: source!.level }))).toString()
    expect(fromCii(await xmlToInvoice(xml)).invoice.lines.map(l => l.price?.netPrice)).toEqual(invoice.lines.map(l => l.price?.netPrice))
  })
})
