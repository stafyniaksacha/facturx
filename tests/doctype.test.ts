import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { check, extract, fromCii, generate, ublToInvoice, validateCdar, validateFrCtc, validateSchematron, xmlToEn16931, xmlToInvoice } from '@stafyniaksacha/facturx'
import { XmlDocument } from 'libxml2-wasm'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { prologHasDoctype } from '../src/lib/xml'
import { getOrderXBasicXML } from './fixtures/xml'

// CG-73 (closed): no CII invoice, Order-X order or UBL invoice uses a DOCTYPE, and with the default libxml2 parse
// options an internal entity stays an unexpanded reference, so the content it stands for is invisible to the readers.
// `xmlToInvoice()` refuses such a document; `check()` reports it as invalid (no throw), whatever the flavor.
const FACTURES = resolve(import.meta.dirname, '../spec/afnor-xp-z12-012-1.4/distribution/XP_Z12-012_Annexe_B_EXEMPLES_V1.4/Factures')
const CII = resolve(FACTURES, 'F202500003/_EN16931/UC1_F202500003_00-INV_20250701_EN16931_FX_CII_Commentee.xml')
const UBL = resolve(FACTURES, 'F202500003/_EN16931/UC1_F202500003_00-INV_20250701_EN16931_UBL_Commentee.xml')
const RAM = 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100'
const BUYER_REFERENCE = /<ram:BuyerReference>[^<]*<\/ram:BuyerReference>/
const DOCTYPE_ERROR = /^xmlToInvoice: the document has a DOCTYPE/

const source = async (file: string): Promise<string> => (await readFile(file, 'utf8')).replace(/^\uFEFF?<\?xml[^>]*\?>\s*/, '')
const withDoctype = (xml: string, root: string, subset: string): string => xml.replace(`<${root} `, `<!DOCTYPE ${root} [${subset}]>\n<${root} `)
const LOL = ['<!ENTITY l0 "lol">', ...Array.from({ length: 9 }, (_, i) => `<!ENTITY l${i + 1} "${`&l${i};`.repeat(10)}">`)].join('')

async function variants(): Promise<[string, string][]> {
  const cii = await source(CII)
  expect(cii).toMatch(BUYER_REFERENCE)
  return [
    ['an internal entity standing for BT-10', withDoctype(cii.replace(BUYER_REFERENCE, '&br;'), 'rsm:CrossIndustryInvoice', `<!ENTITY br "<ram:BuyerReference xmlns:ram='${RAM}'>BR-X</ram:BuyerReference>">`)],
    ['an external SYSTEM entity', withDoctype(cii.replace(BUYER_REFERENCE, '<ram:BuyerReference>&e;</ram:BuyerReference>'), 'rsm:CrossIndustryInvoice', '<!ENTITY e SYSTEM "file:///etc/hosts">')],
    ['a billion-laughs subset', withDoctype(cii.replace(BUYER_REFERENCE, '<ram:BuyerReference>&l9;</ram:BuyerReference>'), 'rsm:CrossIndustryInvoice', LOL)],
    ['a bare DOCTYPE', cii.replace('<rsm:CrossIndustryInvoice ', '<!DOCTYPE rsm:CrossIndustryInvoice>\n<rsm:CrossIndustryInvoice ')],
  ]
}

describe('xmlToInvoice refuses a DOCTYPE (CG-73)', () => {
  it('refuses each DOCTYPE variant as a string and a Buffer, quoting nothing', async () => {
    for (const [name, xml] of await variants()) {
      for (const input of [xml, Buffer.from(xml)]) {
        const error = await xmlToInvoice(input).then(() => undefined, (e: Error) => e)
        expect(error, name).toBeInstanceOf(Error)
        // libxml2 may reject the billion-laughs subset itself; otherwise the DOCTYPE check names the cause.
        if (!/laughs/.test(name))
          expect(error!.message, name).toMatch(DOCTYPE_ERROR)
        expect(error!.message).not.toMatch(/BR-X|lol|hosts/)
      }
    }
  })

  // Text input is judged on its raw prolog: XML declaration, whitespace, comments and processing instructions are
  // skipped, and a `<!DOCTYPE` before the root is refused. A caller's XmlDocument has no text: the fail-closed node
  // walk applies, which refuses anything but comments before the root.
  it('accepts a processing instruction and comments before the root of text input, refuses one in a caller XmlDocument', async () => {
    const cii = await source(CII)
    const pi = `<?xml version="1.0" encoding="UTF-8"?>\n<!-- a -->\n<?xml-stylesheet href="x.xsl"?>\n${cii}\n<!-- after -->`
    for (const input of [pi, Buffer.from(pi), Buffer.from(`\uFEFF${pi}`)])
      expect(fromCii(await xmlToInvoice(input)).invoice.buyerReference).toBeDefined()
    expect((await check({ xml: pi })).valid).toBe(true)
    expect((await xmlToEn16931(pi)).syntax).toBe('cii')
    const doc = XmlDocument.fromString(pi)
    try {
      expect((await check({ xml: doc })).errors).toEqual([{ message: expect.stringMatching(/^The document has a DOCTYPE/) }])
      await expect(xmlToEn16931(doc)).rejects.toThrow(/DOCTYPE/)
      expect(doc.root.name).toBe('CrossIndustryInvoice')
    }
    finally {
      doc.dispose()
    }
    const ubl = (await source(UBL)).replace('<Invoice ', '<?xml-stylesheet href="x.xsl"?>\n<Invoice ')
    expect((await ublToInvoice(ubl)).invoice.number).toBeTruthy()
    expect((await xmlToEn16931(ubl)).syntax).toBe('ubl')
    const pdf = await PDFDocument.create()
    pdf.addPage()
    expect((await generate({ pdf, xml: pi, check: true })).length).toBeGreaterThan(0)
  })

  it('refuses a DOCTYPE after comments and processing instructions, and ignores one inside a comment', async () => {
    const cii = await source(CII)
    const late = `<?xml version="1.0"?><!-- c --><?pi x?>\n<!DOCTYPE rsm:CrossIndustryInvoice>\n${cii}`
    await expect(xmlToInvoice(late)).rejects.toThrow(DOCTYPE_ERROR)
    expect((await check({ xml: late })).valid).toBe(false)
    expect(fromCii(await xmlToInvoice(`<!-- <!DOCTYPE x [<!ENTITY a "b">]> -->\n${cii}`)).invoice.buyerReference).toBeDefined()
  })

  // The scanner itself: what it reads, and where it hands over to the fail-closed node walk (`undefined`). No reader
  // of the package parses UTF-16 (the parse is UTF-8), so those cases are unit-tested here.
  it('scans an ASCII-compatible prolog, and hands anything else to the node walk', () => {
    expect(prologHasDoctype('<?xml version="1.0"?>\n<!-- c --><?pi?>\n<rsm:X/>')).toBe(false)
    expect(prologHasDoctype('\uFEFF<!DOCTYPE x>\n<x/>')).toBe(true)
    expect(prologHasDoctype('<!ELEMENT x ANY><x/>')).toBe(true)
    expect(prologHasDoctype(Buffer.from('\uFEFF<?xml version="1.0" encoding="ISO-8859-1"?><?pi?><x/>'))).toBe(false)
    expect(prologHasDoctype(Buffer.from([0xEF, 0xBB, 0xBF, ...Buffer.from('<!DOCTYPE x><x/>')]))).toBe(true)
    expect(prologHasDoctype(Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from('<x/>', 'utf16le')]))).toBeUndefined()
    expect(prologHasDoctype(Buffer.from('<x/>', 'utf16le'))).toBeUndefined()
    expect(prologHasDoctype('<?xml version="1.0" encoding="UTF-16"?><x/>')).toBeUndefined()
    expect(prologHasDoctype('<?xml version="1.0" encoding="EBCDIC-CP-US"?><x/>')).toBeUndefined()
    expect(prologHasDoctype('<!-- unterminated <x/>')).toBeUndefined()
    expect(prologHasDoctype('junk <x/>')).toBeUndefined()
  })
})

describe('check reports a DOCTYPE as invalid without throwing (CG-73)', () => {
  it('for a CII invoice, as a string, a Buffer and a caller XmlDocument it does not dispose', async () => {
    for (const [name, xml] of await variants()) {
      for (const input of [xml, Buffer.from(xml)]) {
        let result: Awaited<ReturnType<typeof check>> | undefined
        try {
          result = await check({ xml: input, schematron: true, frCtc: true })
        }
        catch (error) {
          // Only libxml2's own refusal of the billion-laughs subset may throw, and it is a parse error.
          expect(name).toMatch(/laughs/)
          expect(String(error)).not.toMatch(/DOCTYPE/)
          continue
        }
        expect(result.valid, name).toBe(false)
        expect(result.errors).toEqual([{ message: expect.stringMatching(/^The document has a DOCTYPE/) }])
        expect([result.flavor, result.level]).toEqual(['facturx', 'en16931'])
        expect(result.schematronValid).toBe(false)
        expect(result.schematronErrors).toEqual([{ message: 'Schematron was not run: the document has a DOCTYPE', severity: 'error' }])
        expect(result.frCtcValid).toBe(false)
        expect(JSON.stringify(result)).not.toMatch(/BR-X|lol|hosts/)
      }
    }
    const [, internal] = (await variants())[0]
    const doc = XmlDocument.fromString(internal)
    try {
      expect((await check({ xml: doc })).valid).toBe(false)
      expect(doc.root.name).toBe('CrossIndustryInvoice')
    }
    finally {
      doc.dispose()
    }
  })

  it('for a UBL invoice and an Order-X order, and keeps flavor and level best effort', async () => {
    const ubl = withDoctype(await source(UBL), 'Invoice', '<!ENTITY t "x">')
    const ublResult = await check({ xml: ubl, schematron: true })
    expect([ublResult.valid, ublResult.flavor, ublResult.level]).toEqual([false, 'ubl', 'en16931'])
    const order = getOrderXBasicXML().replace(/^<\?xml[^>]*\?>\s*/, '').replace('<rsm:SCRDMCCBDACIOMessageStructure', '<!DOCTYPE rsm:SCRDMCCBDACIOMessageStructure>\n<rsm:SCRDMCCBDACIOMessageStructure')
    expect(order).toContain('<!DOCTYPE')
    const orderResult = await check({ xml: order })
    expect([orderResult.valid, orderResult.flavor, orderResult.level]).toEqual([false, 'orderx', 'basic'])
    // An entity hiding BT-24: still no throw, the level is left empty.
    const hidden = withDoctype((await source(CII)).replace(/(<ram:GuidelineSpecifiedDocumentContextParameter>)[\s\S]*?(<\/ram:GuidelineSpecifiedDocumentContextParameter>)/, '$1&id;$2'), 'rsm:CrossIndustryInvoice', `<!ENTITY id "<ram:ID xmlns:ram='${RAM}'>urn:cen.eu:en16931:2017</ram:ID>">`)
    expect(await check({ xml: hidden })).toMatchObject({ valid: false, flavor: 'facturx', level: '' })
  })

  it('makes extract({ check: true }) refuse an attachment with a DOCTYPE', async () => {
    const [, internal] = (await variants())[0]
    const pdf = await PDFDocument.create()
    pdf.addPage()
    await pdf.attach(Buffer.from(internal), 'factur-x.xml', { mimeType: 'text/xml' })
    const bytes = await pdf.save()
    await expect(extract({ pdf: Buffer.from(bytes), check: true })).rejects.toThrow('Invalid XML')
    // Without check, extraction is unchanged: the bytes as stored.
    expect((await extract({ pdf: Buffer.from(bytes) })).xml).toContain('<!DOCTYPE')
  })
})

// The direct validators run a transform on the text: a used entity makes SaxonJS abort, a declared one would pass
// unseen. Each reports a DOCTYPE as an invalid result with one error, as `check()` does, and never passes it.
describe('the direct validators report a DOCTYPE as invalid (CG-73)', () => {
  const CDAR = resolve(import.meta.dirname, '../spec/afnor-xp-z12-012-1.4/distribution/XP_Z12-012_Annexe_B_EXEMPLES_V1.4/Cycle de Vie - CDAR/_Cas Nominal/UC1_F202500003_02-CDV-202_Recue.xml')
  const doctypes = (xml: string, root: string): [string, string][] => [
    ['a declared, unused internal entity', withDoctype(xml, root, '<!ENTITY t "x">')],
    ['a used internal entity', withDoctype(xml, root, '<!ENTITY t "x">').replace(/(<\/[\w:]+>)/, '&t;$1')],
    ['a bare DOCTYPE', xml.replace(`<${root} `, `<!DOCTYPE ${root}>\n<${root} `)],
  ]
  const MESSAGE = expect.stringMatching(/^The document has a DOCTYPE/)

  it('validateSchematron and validateFrCtc (CII and UBL)', async () => {
    const cii = await source(CII)
    const ubl = await source(UBL)
    for (const [name, xml] of doctypes(cii, 'rsm:CrossIndustryInvoice')) {
      expect(await validateSchematron({ xml, flavor: 'facturx', level: 'en16931' }), name).toEqual({ valid: false, errors: [{ message: MESSAGE, severity: 'error' }], warnings: [] })
      expect(await validateFrCtc({ xml }), name).toEqual({ valid: false, errors: [{ message: MESSAGE, severity: 'error' }], warnings: [] })
    }
    for (const [name, xml] of doctypes(ubl, 'Invoice')) {
      expect((await validateSchematron({ xml, level: 'en16931' })).valid, name).toBe(false)
      expect((await validateFrCtc({ xml })).valid, name).toBe(false)
    }
  })

  it('validateCdar', async () => {
    const cdar = (await source(CDAR)).replace('<rsm:CrossDomainAcknowledgementAndResponse\n', '<rsm:CrossDomainAcknowledgementAndResponse ')
    expect(cdar).toContain('<rsm:CrossDomainAcknowledgementAndResponse ')
    for (const [name, xml] of doctypes(cdar, 'rsm:CrossDomainAcknowledgementAndResponse'))
      expect(await validateCdar({ xml }), name).toEqual({ valid: false, errors: [{ message: MESSAGE }], schematronErrors: [], schematronWarnings: [] })
  })
})
