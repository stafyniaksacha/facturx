import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { check, invoiceToXml, validateSchematron, xmlToInvoice } from '@stafyniaksacha/facturx'
import { describe, expect, it } from 'vitest'

import { getEN16931XML } from './fixtures/xml'

// What changes when BASIC WL, EN 16931 and EXTENDED move from Factur-X 1.09 FINAL to
// 1.09.2.fixFR04 (FNFE-MPE "Schematrons FR CTC" 1.4.0.04, release notes p.4-5). Test data are the
// official XP Z12-012 v1.4 annex B examples, comments stripped, with targeted mutations.
const ANNEX_B = resolve(import.meta.dirname, '../spec/afnor-xp-z12-012-1.4/distribution/XP_Z12-012_Annexe_B_EXEMPLES_V1.4/Factures')

function example(path: string): string {
  return readFileSync(resolve(ANNEX_B, path), 'utf8').replace(/<!--[\s\S]*?-->/g, '')
}

const UC1_EXTENDED = 'F202500003/_EXTENDED/UC1_F202500003_00-INV_20250701_EXTENDED_FX_CII_Commentee.xml'
const UC1_EN16931 = 'F202500003/_EN16931/UC1_F202500003_00-INV_20250701_EN16931_FX_CII_Commentee.xml'
const F1_EXTENDED = 'F202500001/_EXTENDED-CTC-FR/F202500001_INV_20250201_EXTENDED_FX_CII_Commentee.xml'
const UC12_EXTENDED = 'Facture Sous Ligne - Multi-Vendeur - Bidirectionnelle/_Sous-ligne/UC12_F202600025_SOUS-LIGNE_EXTENDED_FX_CII_Commentee.xml'

/** Replace the first match, failing loudly if the pattern no longer matches the example. */
function mutate(xml: string, pattern: RegExp, replacement: string): string {
  const out = xml.replace(pattern, replacement)
  expect(out).not.toBe(xml)
  return out
}

const ids = (errors: { id?: string }[]): string[] => errors.map(e => e.id ?? '')

// The INFORMATION sub-line (BT-X-8) of UC12 gets a line VAT block with only a due date code
// (EXT-FR-FE-180): the use case for which 1.09.2 makes TypeCode/CategoryCode 0..1.
function subLineWithoutCategory(): string {
  const xml = example(UC12_EXTENDED)
  const [head, tail] = xml.split('<ram:LineID>4</ram:LineID>')
  expect(tail).toBeDefined()
  return `${head}<ram:LineID>4</ram:LineID>${tail.replace(
    '<ram:SpecifiedTradeSettlementLineMonetarySummation>',
    '<ram:ApplicableTradeTax><ram:DueDateTypeCode>5</ram:DueDateTypeCode></ram:ApplicableTradeTax><ram:SpecifiedTradeSettlementLineMonetarySummation>',
  )}`
}

describe('factur-x 1.09.2.fixFR04: EXTENDED TradeTaxType codes are optional', () => {
  it('accepts an EXTENDED sub-line VAT block without TypeCode and CategoryCode (XSD + Schematron)', async () => {
    const xml = subLineWithoutCategory()
    const result = await check({ xml, schematron: true })
    expect(result.level).toBe('extended')
    expect(result.errors).toEqual([])
    expect(result.schematronErrors).toEqual([])
    expect(result.schematronWarnings).toEqual([])
  })

  it('round-trips a TradeTaxType without CategoryCode and emits no empty element', async () => {
    const xml = subLineWithoutCategory()
    const model = await xmlToInvoice(xml)
    const info = model.supplyChainTradeTransaction.includedSupplyChainTradeLineItem
      ?.find(line => line.associatedDocumentLineDocument.lineID.value === '4')
    const tax = info?.specifiedLineTradeSettlement.applicableTradeTax
    expect(tax).toHaveLength(1)
    expect(tax?.[0].categoryCode).toBeUndefined()
    expect(tax?.[0].typeCode).toBeUndefined()
    expect(tax?.[0].dueDateTypeCode?.value).toBe('5')

    const serialized = (await invoiceToXml(model)).toString()
    expect(serialized).not.toMatch(/<ram:CategoryCode\s*\/>|<ram:CategoryCode><\/ram:CategoryCode>/)
    expect((await check({ xml: serialized, level: 'extended' })).errors).toEqual([])
    expect(await xmlToInvoice(serialized)).toEqual(model)
  })

  it('keeps CategoryCode mandatory in the EN 16931 XSD, but not in the EXTENDED one', async () => {
    const xml = mutate(example(UC1_EN16931), /<ram:CategoryCode>S<\/ram:CategoryCode>/, '')

    const en16931 = await check({ xml, level: 'en16931' })
    expect(en16931.errors.some(e => /CategoryCode/.test(e.message))).toBe(true)

    const extended = await check({ xml, level: 'extended' })
    expect(extended.errors).toEqual([])
  })

  it('still requires CategoryCode on an EXTENDED detail line and on the VAT breakdown (Schematron)', async () => {
    const line = mutate(example(UC1_EXTENDED), /<ram:CategoryCode>S<\/ram:CategoryCode>/, '')
    const lineResult = await validateSchematron({ xml: line, flavor: 'facturx', level: 'extended' })
    expect(ids(lineResult.errors)).toContain('BR-FXEXT-CO-04')

    const header = mutate(
      example(UC1_EXTENDED),
      /(<ram:ApplicableHeaderTradeSettlement>[\s\S]*?<ram:ApplicableTradeTax>[\s\S]*?)<ram:CategoryCode>S<\/ram:CategoryCode>/,
      '$1',
    )
    const headerResult = await validateSchematron({ xml: header, flavor: 'facturx', level: 'extended' })
    expect(ids(headerResult.errors)).toContain('BR-47')
  })

  it('still requires TypeCode on an EXTENDED VAT breakdown and detail line (Schematron)', async () => {
    // The XSD no longer enforces BT-118-0 (1..1 in XP Z12-012 annex A); the profile Schematron
    // does, with an unnumbered structural assert on BG-23 and BR-FXEXT-CO-04 on detail lines.
    const header = mutate(
      example(UC1_EXTENDED),
      /(<ram:ApplicableHeaderTradeSettlement>[\s\S]*?<ram:ApplicableTradeTax>[\s\S]*?)<ram:TypeCode>VAT<\/ram:TypeCode>/,
      '$1',
    )
    const headerResult = await check({ xml: header, schematron: true })
    expect(headerResult.errors).toEqual([])
    expect(headerResult.schematronErrors?.map(e => e.test)).toContain('count(ram:TypeCode)=1')

    const line = mutate(example(UC1_EXTENDED), /<ram:TypeCode>VAT<\/ram:TypeCode>/, '')
    const lineResult = await validateSchematron({ xml: line, flavor: 'facturx', level: 'extended' })
    expect(ids(lineResult.errors)).toContain('BR-FXEXT-CO-04')

    // Document-level allowance/charge VAT block (BT-95-0 / BT-102-0).
    const allowance = mutate(
      example(F1_EXTENDED),
      /(<ram:ApplicableHeaderTradeSettlement>[\s\S]*?<ram:CategoryTradeTax>[\s\S]*?)<ram:TypeCode>VAT<\/ram:TypeCode>/,
      '$1',
    )
    const allowanceResult = await check({ xml: allowance, schematron: true })
    expect(allowanceResult.errors).toEqual([])
    expect(allowanceResult.schematronErrors?.map(e => e.test)).toContain('count(ram:TypeCode)=1')

    const allowanceCategory = mutate(
      example(F1_EXTENDED),
      /(<ram:ApplicableHeaderTradeSettlement>[\s\S]*?<ram:CategoryTradeTax>[\s\S]*?)<ram:CategoryCode>[A-Z]+<\/ram:CategoryCode>/,
      '$1',
    )
    const allowanceCategoryResult = await check({ xml: allowanceCategory, schematron: true })
    expect(allowanceCategoryResult.errors).toEqual([])
    expect(allowanceCategoryResult.schematronErrors?.map(e => e.test)).toContain('count(ram:CategoryCode)=1')
  })

  it('keeps a present-but-empty CategoryCode through the round trip', async () => {
    const xml = mutate(example(UC1_EN16931), /<ram:CategoryCode>S<\/ram:CategoryCode>/, '<ram:CategoryCode></ram:CategoryCode>')
    expect((await check({ xml, level: 'en16931' })).errors).toEqual([])
    const serialized = (await invoiceToXml(await xmlToInvoice(xml))).toString()
    expect((await check({ xml: serialized, level: 'en16931' })).errors).toEqual([])
  })
})

describe('factur-x 1.09.2.fixFR04: EXTENDED Schematron rule changes', () => {
  it('accepts several Standard-rated VAT breakdowns (as 1.09 FINAL already did)', async () => {
    const xml = example(F1_EXTENDED)
    const header = xml.slice(xml.indexOf('<ram:ApplicableHeaderTradeSettlement>'))
    expect(header.match(/<ram:CategoryCode>S<\/ram:CategoryCode>/g)?.length).toBeGreaterThanOrEqual(2)

    const result = await validateSchematron({ xml, flavor: 'facturx', level: 'extended' })
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
  })

  it('no longer reports BR-Z-01 for two Zero-rated breakdowns, but BR-FXEXT-Z-08b still does', async () => {
    // 1.09 FINAL's BR-Z-01 (and BR-E-01, …) required exactly one breakdown of the category;
    // BR-FXEXT-Z-01 requires at least one. The per-category basis rule still rejects the split.
    let xml = example(UC12_EXTENDED)
      .replaceAll('<ram:CategoryCode>S</ram:CategoryCode>', '<ram:CategoryCode>Z</ram:CategoryCode>')
      .replace(/<ram:RateApplicablePercent>(?:10|20)\.00<\/ram:RateApplicablePercent>/g, '<ram:RateApplicablePercent>0.00</ram:RateApplicablePercent>')
      .replace(/<ram:CalculatedAmount>(?:60|20)\.00<\/ram:CalculatedAmount>/g, '<ram:CalculatedAmount>0.00</ram:CalculatedAmount>')
    xml = mutate(xml, /(<ram:TaxTotalAmount currencyID="EUR">)80\.00/, '$10.00')
    xml = mutate(xml, /<ram:GrandTotalAmount>580\.00/, '<ram:GrandTotalAmount>500.00')
    xml = mutate(xml, /<ram:DuePayableAmount>580\.00/, '<ram:DuePayableAmount>500.00')
    expect(xml.slice(xml.indexOf('<ram:ApplicableHeaderTradeSettlement>')).match(/<ram:CategoryCode>Z<\/ram:CategoryCode>/g)).toHaveLength(2)

    const result = await validateSchematron({ xml, flavor: 'facturx', level: 'extended' })
    expect(ids(result.errors)).not.toContain('BR-Z-01')
    expect(ids(result.errors)).not.toContain('BR-FXEXT-Z-01')
    expect(ids(result.errors)).toContain('BR-FXEXT-Z-08b')
  })

  it('no longer reports BR-FXEXT-06 for a parent line without a sub-type (relaxed in 1.09.2)', async () => {
    // 1.09 FINAL also required BT-X-8 on a line other lines point to; 1.09.2 only checks lines
    // that carry a ParentLineID. Not in the release notes (CONFORMANCE.md CG-16).
    const xml = mutate(example(UC12_EXTENDED), /<ram:LineStatusReasonCode>GROUP<\/ram:LineStatusReasonCode>/, '')
    const result = await validateSchematron({ xml, flavor: 'facturx', level: 'extended' })
    expect(ids(result.errors)).not.toContain('BR-FXEXT-06')
    expect(ids(result.errors)).toContain('BR-FXEXT-CO-04')
  })

  it('reports BR-FXEXT-S-01 when Standard-rated detail lines have no S breakdown', async () => {
    // Two S lines and no S breakdown: 1.09 FINAL's BR-S-01 counted lines + breakdowns >= 2 and
    // let this through (only BR-47 fired); BR-FXEXT-S-01 requires an S breakdown.
    const xml = mutate(
      example(UC1_EXTENDED),
      /(<ram:ApplicableHeaderTradeSettlement>[\s\S]*?<ram:ApplicableTradeTax>[\s\S]*?)<ram:CategoryCode>S<\/ram:CategoryCode>/,
      '$1',
    )
    const result = await validateSchematron({ xml, flavor: 'facturx', level: 'extended' })
    expect(ids(result.errors)).toContain('BR-FXEXT-S-01')
    expect(ids(result.errors)).not.toContain('BR-S-01')
  })

  it('reports BR-FXEXT-BR-54-1 for an item attribute with neither name nor code (replaces BR-54)', async () => {
    const xml = mutate(
      example(UC1_EXTENDED),
      /(<ram:Description>Description<\/ram:Description>)/,
      '$1<ram:ApplicableProductCharacteristic><ram:Value>12</ram:Value></ram:ApplicableProductCharacteristic>',
    )
    const result = await validateSchematron({ xml, flavor: 'facturx', level: 'extended' })
    expect(ids(result.errors)).toEqual(['BR-FXEXT-BR-54-1'])
  })

  it('reports BR-FXEXT-BR-54-2 for an item attribute with both a value and a measured value', async () => {
    const xml = mutate(
      example(UC1_EXTENDED),
      /(<ram:Description>Description<\/ram:Description>)/,
      '$1<ram:ApplicableProductCharacteristic><ram:Description>Puissance</ram:Description><ram:ValueMeasure unitCode="KWT">22</ram:ValueMeasure><ram:Value>22</ram:Value></ram:ApplicableProductCharacteristic>',
    )
    const result = await validateSchematron({ xml, flavor: 'facturx', level: 'extended' })
    expect(ids(result.errors)).toEqual(['BR-FXEXT-BR-54-2'])
  })

  it('accepts an item attribute with a name and a value', async () => {
    const xml = mutate(
      example(UC1_EXTENDED),
      /(<ram:Description>Description<\/ram:Description>)/,
      '$1<ram:ApplicableProductCharacteristic><ram:Description>Puissance</ram:Description><ram:Value>22 kW</ram:Value></ram:ApplicableProductCharacteristic>',
    )
    const result = await validateSchematron({ xml, flavor: 'facturx', level: 'extended' })
    expect(result.errors).toEqual([])
  })
})

describe('factur-x 1.09.2.fixFR04: BR-CO-27 (IBAN or proprietary ID, BT-84)', () => {
  // 1.09 FINAL reported a payee account with both an IBAN and a proprietary ID as BR-CO-27.
  // 1.09.2.fixFR04 renames the rule CII-SR-470 (same context and test) in BASIC WL and EN 16931,
  // and drops it from EXTENDED (CONFORMANCE.md CG-16).
  const withBoth = (xml: string): string => mutate(xml, /(<ram:IBANID>[^<]*<\/ram:IBANID>)/, '$1<ram:ProprietaryID>ACC-1</ram:ProprietaryID>')

  it('is no longer reported in EXTENDED', async () => {
    const result = await validateSchematron({ xml: withBoth(example(UC1_EXTENDED)), flavor: 'facturx', level: 'extended' })
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
  })

  it.each(['en16931', 'basicwl'])('is reported as CII-SR-470 (error) in %s', async (level) => {
    const xml = level === 'en16931' ? withBoth(example(UC1_EN16931)) : withBoth(getEN16931XML())
    const result = await validateSchematron({ xml, flavor: 'facturx', level })
    const rule = result.errors.find(e => e.id === 'CII-SR-470')
    expect(rule?.severity).toBe('error')
    expect(ids(result.errors)).not.toContain('BR-CO-27')
  })
})

describe('vendored Factur-X Schematron severity inventory', () => {
  // Proof for the warning-flag list in CONFORMANCE.md (Verified, severity row).
  const XSD_DIR = resolve(import.meta.dirname, '../src/lib/xsd/facturx')

  function warningRules(level: string): string[] {
    const file = readdirSync(resolve(XSD_DIR, level)).find(f => f.endsWith('.xslt'))!
    const xslt = readFileSync(resolve(XSD_DIR, level, file), 'utf8')
    const out = new Set<string>()
    for (const m of xslt.matchAll(/<svrl:(failed-assert|successful-report)\b[\s\S]*?<\/svrl:\1>/g)) {
      const flag = m[0].match(/flag="(\w+)"|name="flag">(\w+)</)
      if (flag && ['warning', 'information'].includes(flag[1] ?? flag[2]))
        out.add(m[0].match(/\[([A-Z][\w-]+)\]/)?.[1] ?? '?')
    }
    return [...out].sort()
  }

  const pairs = (cats: string[]): string[] => cats.flatMap(c => [`BR-FXEXT-${c}-08ini`, `BR-FXEXT-${c}-08rev`])

  it.each([
    ['minimum', pairs(['G', 'IC', 'O', 'Z'])],
    ['basic', ['BR-FX-EN-04', 'BR-FXEXT-Z-08rev', 'PEPPOL-EN16931-R008']],
    ['basicwl', []],
    ['en16931', ['CII-SR-474', 'CII-SR-475', 'CII-SR-476', 'PEPPOL-EN16931-R008']],
    ['extended', ['BR-FXEXT-04', ...pairs(['AE', 'AF', 'AG', 'E', 'G', 'IC', 'O', 'S', 'Z']), 'CII-SR-475', 'CII-SR-476', 'PEPPOL-EN16931-R008']],
  ])('%s', (level, expected) => {
    expect(warningRules(level)).toEqual([...expected].sort())
  })
})
