import { readdirSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { check, extract, fromCii, invoiceToXml, toCii, xmlToInvoice } from '@stafyniaksacha/facturx'
import { describe, expect, it } from 'vitest'
// `diffPaths` is the internal helper behind `dropped` (not exported): the tests compare in both directions with it.
import { diffPaths } from '../src/lib/mapping/cii/dropped'
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
const agreementOf = (cii: Awaited<ReturnType<typeof xmlToInvoice>>) => cii.supplyChainTradeTransaction.applicableHeaderTradeAgreement

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
    expect(diffPaths(again, expected)).toEqual([])
    expect(again).toEqual(expected)
    // The BT-11-0 default `toCii()` writes reads back as no project name (and is written again above).
    if (agreementOf(cii).specifiedProcuringProject?.name.value === 'Project reference')
      expect(invoice.projectName).toBeUndefined()
  })

  it.each(facturxExtended)('$name: dropped holds only true BT-X content, nothing else changes either way', async ({ name, xml, level }) => {
    const cii = await xmlToInvoice(xml)
    const { invoice, dropped } = fromCii(cii)
    expect(dropped.flatMap(notBtX)).toEqual([])
    // Nothing else changes: the values of the source missing after the trip are exactly the dropped
    // ones, and the trip adds or changes no value (the reverse diff); deep equality when nothing is
    // dropped, which is the case for every official Factur-X EXTENDED example.
    const expected = FIRST_ENTRY_ONLY.test(name) ? spreadVatPoint(cii) : cii
    const again = await xmlToInvoice((await invoiceToXml(toCii(invoice, { level }))).toString())
    expect(diffPaths(expected, again)).toEqual(dropped)
    expect(diffPaths(again, expected)).toEqual([])
    if (!dropped.length)
      expect(again).toEqual(expected)
  })

  it('reports exactly the injected Factur-X-only content in dropped, and the checker accepts it as BT-X', async () => {
    // The official examples carry no BT-X content, so inject some kinds into the F20260023 Factur-X
    // EXTENDED document: a test indicator (BT-X-1), a line status code (BT-X-7), a header party extra
    // (seller role code, BT-X-543), a charge on the gross price (BT-X-302-02 / BT-X-302), and a
    // sequence number (BT-X-265) on a document charge moved before the allowances, so the writer
    // reorders the group and pairing goes by value first.
    const source = facturxExtended.find(d => d.name.includes('4.EXTENDED') && d.name.includes('F20260023'))!
    const settlementAt = source.xml.indexOf('<ram:ApplicableHeaderTradeSettlement>')
    const header = source.xml.slice(settlementAt)
    const blocks = [...header.matchAll(/<ram:SpecifiedTradeAllowanceCharge>[\s\S]*?<\/ram:SpecifiedTradeAllowanceCharge>/g)].map(m => m[0])
    const firstCharge = blocks.findIndex(b => /<udt:Indicator>true</.test(b))
    expect(firstCharge).toBeGreaterThan(0)
    const moved = blocks[firstCharge + 1]!
    const numbered = moved.replace('</ram:ChargeIndicator>', '</ram:ChargeIndicator><ram:SequenceNumeric>7</ram:SequenceNumeric>')
    const reordered = header.replace(moved, '').replace(blocks[0]!, numbered + blocks[0]!)
    const xml = (source.xml.slice(0, settlementAt) + reordered)
      .replace('<ram:GuidelineSpecifiedDocumentContextParameter>', '<ram:TestIndicator><udt:Indicator>false</udt:Indicator></ram:TestIndicator><ram:GuidelineSpecifiedDocumentContextParameter>')
      .replace('</ram:AssociatedDocumentLineDocument>', '<ram:LineStatusCode>NEW</ram:LineStatusCode></ram:AssociatedDocumentLineDocument>')
      .replace(/(<ram:SellerTradeParty>[\s\S]*?<\/ram:Name>)/, '$1<ram:RoleCode>DL</ram:RoleCode>')
      .replace(/(<ram:GrossPriceProductTradePrice>[\s\S]*?<\/ram:AppliedTradeAllowanceCharge>)/, '$1<ram:AppliedTradeAllowanceCharge><ram:ChargeIndicator><udt:Indicator>true</udt:Indicator></ram:ChargeIndicator><ram:ActualAmount>1.50</ram:ActualAmount></ram:AppliedTradeAllowanceCharge>')
    const cii = await xmlToInvoice(xml)
    // Each injection reached the CII model.
    const lines = cii.supplyChainTradeTransaction.includedSupplyChainTradeLineItem!
    const grossLine = lines.findIndex(l => l.specifiedLineTradeAgreement?.grossPriceProductTradePrice)
    expect(cii.exchangedDocumentContext.testIndicator?.indicator).toBe(false)
    expect(lines[0]!.associatedDocumentLineDocument.lineStatusCode?.value).toBe('NEW')
    expect(agreementOf(cii).sellerTradeParty.roleCode?.value).toBe('DL')
    expect(lines[grossLine]!.specifiedLineTradeAgreement!.grossPriceProductTradePrice!.appliedTradeAllowanceCharge).toHaveLength(2)
    const allowanceCharges = cii.supplyChainTradeTransaction.applicableHeaderTradeSettlement.specifiedTradeAllowanceCharge!
    expect(allowanceCharges[0]!.chargeIndicator.indicator).toBe(true)
    expect(allowanceCharges[0]!.sequenceNumeric?.value).toBe(7)

    const { invoice, dropped } = fromCii(cii)
    const TRANSACTION = '/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction'
    const gross = `${TRANSACTION}/ram:IncludedSupplyChainTradeLineItem[${grossLine + 1}]/ram:SpecifiedLineTradeAgreement/ram:GrossPriceProductTradePrice/ram:AppliedTradeAllowanceCharge[2]`
    expect([...dropped].sort()).toEqual([
      '/rsm:CrossIndustryInvoice/rsm:ExchangedDocumentContext/ram:TestIndicator/udt:Indicator',
      `${TRANSACTION}/ram:IncludedSupplyChainTradeLineItem[1]/ram:AssociatedDocumentLineDocument/ram:LineStatusCode`,
      `${gross}/ram:ChargeIndicator/udt:Indicator`,
      `${gross}/ram:ActualAmount`,
      `${TRANSACTION}/ram:ApplicableHeaderTradeAgreement/ram:SellerTradeParty/ram:RoleCode`,
      `${TRANSACTION}/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradeAllowanceCharge[1]/ram:SequenceNumeric`,
    ].sort())
    // Everything else comes back: the values missing after the trip are exactly the dropped ones, and
    // nothing is added or changed on write (BT-7 / BT-8 spread on every VAT entry is the one normalisation).
    const expected = FIRST_ENTRY_ONLY.test(source.name) ? spreadVatPoint(cii) : cii
    const again = await xmlToInvoice((await invoiceToXml(toCii(invoice, { level: source.level }))).toString())
    expect(diffPaths(expected, again)).toEqual(dropped)
    expect(diffPaths(again, expected)).toEqual([])
    // The gross price charge shares its XPath with the BT-147 discount (the matrix tells them apart by the
    // ChargeIndicator value, `true` for BT-X-302-02), which the XPath classifier can't see: check it apart.
    expect(dropped.filter(p => !p.startsWith(gross)).flatMap(notBtX)).toEqual([])
    const btX302 = (id: string, path: string) => matrixRows.some(r => r.id === id && !r.ctc.startsWith('EXT-FR-FE') && r.xpath === norm(path))
    expect(btX302('BT-X-302', `${gross}/ram:ActualAmount`)).toBe(true)
    expect(btX302('BT-X-302-02', `${gross}/ram:ChargeIndicator/udt:Indicator`)).toBe(true)
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
