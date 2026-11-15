import { Buffer } from 'node:buffer'
import { readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { extract, generate } from '@stafyniaksacha/facturx'
import { XmlDocument } from 'libxml2-wasm'
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream, PDFString } from 'pdf-lib'
import { describe, expect, it } from 'vitest'

// CG-26: generate({ preserveXmlBytes: true }) embeds the caller's bytes unchanged and extract()
// returns the attachment's bytes in `bytes`. The expected bytes are read here straight from the
// PDF with pdf-lib, never through extract(), so the library is not compared with itself.
const EXAMPLES_DIR = resolve(import.meta.dirname, '../spec/factur-x-1.09/distribution/5. FACTUR-X 1.09 - Examples')

const examples = readdirSync(EXAMPLES_DIR, { withFileTypes: true, recursive: true })
  .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.pdf'))
  .map(entry => join(entry.parentPath, entry.name))
  .sort()
  .map(file => ({ file, name: relative(EXAMPLES_DIR, file) }))

/** The decoded stream of the flat EmbeddedFiles entry named `name`. */
function embeddedBytes(pdf: PDFDocument, name: string): Uint8Array {
  const entries = pdf.catalog.lookup(PDFName.of('Names'), PDFDict)
    .lookup(PDFName.of('EmbeddedFiles'), PDFDict)
    .lookup(PDFName.of('Names'), PDFArray)
  for (let idx = 0; idx + 1 < entries.size(); idx += 2) {
    if (pdf.context.lookup(entries.get(idx), PDFString, PDFHexString).decodeText() !== name)
      continue
    const stream = entries.lookup(idx + 1, PDFDict).lookup(PDFName.of('EF'), PDFDict).lookup(PDFName.of('F'))
    if (!(stream instanceof PDFRawStream))
      throw new Error(`${name} has no raw stream`)
    return decodePDFRawStream(stream).decode()
  }
  throw new Error(`No embedded file named ${name}`)
}

/** The example with its attachments and /AF removed, a base generate() accepts. */
async function plainPdf(source: Buffer): Promise<PDFDocument> {
  const pdf = await PDFDocument.load(source)
  pdf.catalog.delete(PDFName.of('Names'))
  pdf.catalog.delete(PDFName.of('AF'))
  return pdf
}

describe('byte-exact XML pass-through (CG-26)', () => {
  it('finds the 56 official examples', () => {
    expect(examples).toHaveLength(56)
  })

  it.each(examples)('$name: extract() bytes and generate() pass-through are byte-identical', async ({ file }) => {
    const source = await readFile(file)
    const raw = embeddedBytes(await PDFDocument.load(source), 'factur-x.xml')

    const extracted = await extract({ pdf: source })
    expect(Buffer.from(extracted.bytes).equals(Buffer.from(raw))).toBe(true)
    // `xml` keeps its meaning: libxml2's re-serialization, which differs from the raw bytes.
    expect(Buffer.from(extracted.xml).equals(Buffer.from(raw))).toBe(false)

    const output = await generate({ pdf: await plainPdf(source), xml: Buffer.from(raw), preserveXmlBytes: true })
    const embedded = embeddedBytes(await PDFDocument.load(output), 'factur-x.xml')
    expect(Buffer.from(embedded).equals(Buffer.from(raw))).toBe(true)
  })

  it('embeds a string as its UTF-8 bytes, BOM included, and checks those bytes', async () => {
    const source = await readFile(examples[0].file)
    const raw = embeddedBytes(await PDFDocument.load(source), 'factur-x.xml')
    const text = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true }).decode(raw)

    const output = await generate({ pdf: await plainPdf(source), xml: text, preserveXmlBytes: true, check: true })
    const embedded = embeddedBytes(await PDFDocument.load(output), 'factur-x.xml')
    expect(Buffer.from(embedded).equals(Buffer.from(raw))).toBe(true)
    expect((await extract({ pdf: Buffer.from(output) })).bytes).toEqual(embedded)
  })

  it('still re-serializes without the option', async () => {
    const source = await readFile(examples[0].file)
    const raw = embeddedBytes(await PDFDocument.load(source), 'factur-x.xml')
    const output = await generate({ pdf: await plainPdf(source), xml: Buffer.from(raw) })
    const embedded = embeddedBytes(await PDFDocument.load(output), 'factur-x.xml')
    expect(Buffer.from(embedded).equals(Buffer.from(raw))).toBe(false)
  })

  describe('refuses input it cannot pass through safely', () => {
    const SOURCE_XML = resolve(import.meta.dirname, '../examples/Facture_FR_EN16931.xml')

    async function withProlog(prolog: string): Promise<string> {
      const xml = await readFile(SOURCE_XML, 'utf8')
      return xml.replace(/^(<\?xml[^?]*\?>)?/, match => `${match}${prolog}`)
    }

    it.each([
      ['an internal subset', '<!DOCTYPE rsm:CrossIndustryInvoice [<!ENTITY x "y">]>'],
      ['a SYSTEM id', '<!DOCTYPE rsm:CrossIndustryInvoice SYSTEM "file:///etc/passwd">'],
      ['a PUBLIC id', '<!DOCTYPE rsm:CrossIndustryInvoice PUBLIC "-//x//y" "http://example.invalid/y.dtd">'],
      ['no id', '<!DOCTYPE rsm:CrossIndustryInvoice>'],
    ])('a DOCTYPE with %s, as string and Buffer, before marking the PDF as used', async (_, doctype) => {
      const xml = await withProlog(doctype)
      const pdf = await plainPdf(await readFile(resolve(import.meta.dirname, '../examples/Facture_FR_EN16931.pdf')))
      await expect(generate({ pdf, xml, preserveXmlBytes: true })).rejects.toThrow('preserveXmlBytes refuses XML with a DOCTYPE')
      await expect(generate({ pdf, xml: Buffer.from(xml), preserveXmlBytes: true })).rejects.toThrow('preserveXmlBytes refuses XML with a DOCTYPE')
      // The same PDFDocument is still usable: nothing was attached or marked.
      await expect(generate({ pdf, xml: await readFile(SOURCE_XML, 'utf8'), preserveXmlBytes: true })).resolves.toBeInstanceOf(Uint8Array)
    })

    it('a DOCTYPE inside a comment is not one', async () => {
      const xml = await withProlog('<!-- <!DOCTYPE a> -->')
      const pdf = await plainPdf(await readFile(resolve(import.meta.dirname, '../examples/Facture_FR_EN16931.pdf')))
      const output = await generate({ pdf, xml, preserveXmlBytes: true })
      expect(new TextDecoder().decode(embeddedBytes(await PDFDocument.load(output), 'factur-x.xml'))).toBe(xml)
    })

    it.each(['ISO-8859-1', 'UTF-16', 'windows-1252'])('a declared encoding %s', async (encoding) => {
      const xml = (await readFile(SOURCE_XML, 'utf8')).replace(/^<\?xml[^?]*\?>/, `<?xml version="1.0" encoding="${encoding}"?>`)
      expect(xml).toContain(`encoding="${encoding}"`)
      const pdf = await plainPdf(await readFile(resolve(import.meta.dirname, '../examples/Facture_FR_EN16931.pdf')))
      await expect(generate({ pdf, xml, preserveXmlBytes: true })).rejects.toThrow(`preserveXmlBytes needs UTF-8 XML, but the XML declaration says encoding="${encoding}"`)
    })

    it.each(['UTF-8', 'utf-8', 'utf8'])('accepts a declared encoding %s', async (encoding) => {
      const xml = (await readFile(SOURCE_XML, 'utf8')).replace(/^<\?xml[^?]*\?>/, `<?xml version='1.0' encoding='${encoding}'?>`)
      const pdf = await plainPdf(await readFile(resolve(import.meta.dirname, '../examples/Facture_FR_EN16931.pdf')))
      const output = await generate({ pdf, xml, preserveXmlBytes: true })
      expect(new TextDecoder().decode(embeddedBytes(await PDFDocument.load(output), 'factur-x.xml'))).toBe(xml)
    })

    it('an XmlDocument, which has no original bytes', async () => {
      const doc = XmlDocument.fromString(await readFile(SOURCE_XML, 'utf8'))
      try {
        const pdf = await plainPdf(await readFile(resolve(import.meta.dirname, '../examples/Facture_FR_EN16931.pdf')))
        await expect(generate({ pdf, xml: doc, preserveXmlBytes: true })).rejects.toThrow('preserveXmlBytes needs the XML as a string or Buffer')
      }
      finally {
        doc.dispose()
      }
    })

    it('malformed XML', async () => {
      const pdf = await plainPdf(await readFile(resolve(import.meta.dirname, '../examples/Facture_FR_EN16931.pdf')))
      await expect(generate({ pdf, xml: '<rsm:CrossIndustryInvoice', preserveXmlBytes: true })).rejects.toThrow()
    })
  })
})
