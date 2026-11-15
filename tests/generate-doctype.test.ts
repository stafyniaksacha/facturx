import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { extract, generate } from '@stafyniaksacha/facturx'
import { XmlDocument } from 'libxml2-wasm'
import { PDFDocument, PDFName } from 'pdf-lib'
import { describe, expect, it } from 'vitest'

// Was CG-31: without preserveXmlBytes, generate() embedded libxml2's serialization, which keeps a
// DOCTYPE (internal subset, SYSTEM / PUBLIC id) and a version="1.1" declaration. The default path
// now refuses both, like pass-through, before the PDF is read or marked as used (AGENTS.md
// "Security"; CII documents carry no DOCTYPE, and libxml2 checked the document as XML 1.0).

const SOURCE_XML = resolve(import.meta.dirname, '../examples/Facture_FR_EN16931.xml')
const SOURCE_PDF = resolve(import.meta.dirname, '../examples/Facture_FR_EN16931.pdf')

// The example PDF without its invoice, so generate() can attach one.
async function plainPdf(): Promise<PDFDocument> {
  const pdf = await PDFDocument.load(await readFile(SOURCE_PDF))
  pdf.catalog.delete(PDFName.of('Names'))
  pdf.catalog.delete(PDFName.of('AF'))
  return pdf
}

async function withProlog(prolog: string): Promise<string> {
  const xml = await readFile(SOURCE_XML, 'utf8')
  return xml.replace(/^(<\?xml[^?]*\?>)?/, match => `${match}${prolog}`)
}

/** The same PDFDocument still takes a valid invoice: the refusal attached and marked nothing. */
async function expectUnused(pdf: PDFDocument): Promise<void> {
  const output = await generate({ pdf, xml: await readFile(SOURCE_XML, 'utf8') })
  const { xml } = await extract({ pdf: Buffer.from(output) })
  expect(xml).not.toContain('<!DOCTYPE')
}

describe('generate() refuses a DOCTYPE and XML 1.1 on the default path (was CG-31)', () => {
  it.each([
    ['a SYSTEM id', '<!DOCTYPE rsm:CrossIndustryInvoice SYSTEM "file:///etc/passwd">'],
    ['a PUBLIC id', '<!DOCTYPE rsm:CrossIndustryInvoice PUBLIC "-//x//y" "http://example.invalid/y.dtd">'],
    ['an internal subset', '<!DOCTYPE rsm:CrossIndustryInvoice [<!ENTITY x "y">]>'],
    ['no id', '<!DOCTYPE rsm:CrossIndustryInvoice>'],
  ])('a DOCTYPE with %s, as string and Buffer, with and without check', async (_, doctype) => {
    const xml = await withProlog(doctype)
    const pdf = await plainPdf()
    for (const input of [xml, Buffer.from(xml)]) {
      for (const check of [false, true])
        await expect(generate({ pdf, xml: input, check })).rejects.toThrow('generate() refuses XML with a DOCTYPE: remove the DOCTYPE')
    }
    await expectUnused(pdf)
  })

  it('an XmlDocument that carries a DOCTYPE, which stays the caller\'s', async () => {
    const doc = XmlDocument.fromString(await withProlog('<!DOCTYPE rsm:CrossIndustryInvoice SYSTEM "file:///etc/passwd">'))
    try {
      const pdf = await plainPdf()
      await expect(generate({ pdf, xml: doc })).rejects.toThrow('generate() refuses XML with a DOCTYPE')
      // Not disposed by generate(): still readable.
      expect(doc.root?.name).toBe('CrossIndustryInvoice')
      await expectUnused(pdf)
    }
    finally {
      doc.dispose()
    }
  })

  it.each(['string', 'Buffer', 'XmlDocument'])('an XML 1.1 declaration (%s)', async (kind) => {
    const xml = (await readFile(SOURCE_XML, 'utf8')).replace(/^<\?xml[^?]*\?>/, '<?xml version="1.1" encoding="UTF-8"?>')
    expect(xml).toContain('version="1.1"')
    const doc = kind === 'XmlDocument' ? XmlDocument.fromString(xml) : undefined
    try {
      const pdf = await plainPdf()
      await expect(generate({ pdf, xml: doc ?? (kind === 'string' ? xml : Buffer.from(xml)) }))
        .rejects
        .toThrow('generate() needs XML 1.0, but the XML declaration says version="1.1"')
      await expectUnused(pdf)
    }
    finally {
      doc?.dispose()
    }
  })

  it('still embeds XML 1.0 without a DOCTYPE, and a DOCTYPE inside a comment is not one', async () => {
    for (const xml of [await readFile(SOURCE_XML, 'utf8'), await withProlog('<!-- <!DOCTYPE a> -->')]) {
      const output = await generate({ pdf: await plainPdf(), xml, check: true })
      const { bytes } = await extract({ pdf: Buffer.from(output) })
      const text = new TextDecoder().decode(bytes)
      expect(text).toMatch(/^<\?xml version="1\.0"/)
      expect(text).not.toMatch(/^<!DOCTYPE/m)
    }
  })

  it('keeps the pass-through messages', async () => {
    const pdf = await plainPdf()
    const xml = await withProlog('<!DOCTYPE rsm:CrossIndustryInvoice SYSTEM "file:///etc/passwd">')
    await expect(generate({ pdf, xml, preserveXmlBytes: true })).rejects.toThrow('preserveXmlBytes refuses XML with a DOCTYPE: remove the DOCTYPE')
  })
})
