import type { PDFRef } from 'pdf-lib'
import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { generate } from '@stafyniaksacha/facturx'
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib'
import { describe, expect, it } from 'vitest'

// CG-14: generate() looks for an existing invoice (§6 p.24: one invoice XML per PDF) in page-level
// associated files (§6.2.1 p.25: "the file specification dictionary can be found in either the
// Document dictionary or the Page dictionary"), in annotation /AF and in file attachment
// annotations (ISO 32000-1 §12.5.6.15), not only in the name tree and the catalog /AF.
const SOURCE_XML = resolve(import.meta.dirname, '../examples/Facture_FR_EN16931.xml')

async function setup(): Promise<{ pdf: PDFDocument, xml: string, invoiceSpec: (name: string) => PDFRef, pageDict: PDFDict }> {
  const xml = await readFile(SOURCE_XML, 'utf8')
  const pdf = await PDFDocument.create()
  const page = pdf.addPage()
  const invoiceSpec = (name: string): PDFRef => {
    const stream = pdf.context.register(pdf.context.flateStream(new TextEncoder().encode(xml), { Type: 'EmbeddedFile' }))
    return pdf.context.register(pdf.context.obj({ Type: 'Filespec', UF: PDFHexString.fromText(name), EF: { F: stream } }))
  }
  return { pdf, xml, invoiceSpec, pageDict: page.node }
}

async function save(pdf: PDFDocument): Promise<Buffer> {
  return Buffer.from(await pdf.save())
}

describe('existing invoice outside the name tree and catalog /AF (CG-14)', () => {
  it('in a page /AF', async () => {
    const { pdf, xml, invoiceSpec, pageDict } = await setup()
    pageDict.set(PDFName.of('AF'), pdf.context.obj([invoiceSpec('page.xml')]))
    await expect(generate({ pdf: await save(pdf), xml })).rejects.toThrow('already has an embedded invoice (page.xml)')
  })

  it('in a page /AF on the second page, under an intermediate /Pages node', async () => {
    const { pdf, xml, invoiceSpec } = await setup()
    const second = pdf.addPage()
    second.node.set(PDFName.of('AF'), pdf.context.obj([invoiceSpec('second.xml')]))
    // Move both pages under one intermediate node: Pages → Pages → Page.
    const root = pdf.catalog.lookup(PDFName.of('Pages'), PDFDict)
    const rootRef = pdf.catalog.get(PDFName.of('Pages')) as PDFRef
    const kids = root.lookup(PDFName.of('Kids'), PDFArray)
    const middle = pdf.context.obj({ Type: 'Pages', Parent: rootRef, Kids: kids, Count: kids.size() })
    const middleRef = pdf.context.register(middle)
    for (let idx = 0; idx < kids.size(); idx++)
      kids.lookup(idx, PDFDict).set(PDFName.of('Parent'), middleRef)
    root.set(PDFName.of('Kids'), pdf.context.obj([middleRef]))
    await expect(generate({ pdf: await save(pdf), xml })).rejects.toThrow('already has an embedded invoice (second.xml)')
  })

  it.each([
    ['indirect', true],
    ['direct', false],
  ])('in a file attachment annotation (%s annotation dictionary)', async (_, indirect) => {
    const { pdf, xml, invoiceSpec, pageDict } = await setup()
    const annot = pdf.context.obj({ Type: 'Annot', Subtype: 'FileAttachment', Rect: [0, 0, 10, 10], FS: invoiceSpec('attached.xml') })
    pageDict.set(PDFName.of('Annots'), pdf.context.obj([indirect ? pdf.context.register(annot) : annot]))
    await expect(generate({ pdf: await save(pdf), xml })).rejects.toThrow('already has an embedded invoice (attached.xml)')
  })

  it('in an annotation /AF', async () => {
    const { pdf, xml, invoiceSpec, pageDict } = await setup()
    const annot = pdf.context.register(pdf.context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [0, 0, 10, 10], AF: [invoiceSpec('note.xml')] }))
    pageDict.set(PDFName.of('Annots'), pdf.context.obj([annot]))
    await expect(generate({ pdf: await save(pdf), xml })).rejects.toThrow('already has an embedded invoice (note.xml)')
  })

  it('by name, in a file attachment annotation whose stream cannot be read', async () => {
    const { pdf, xml, pageDict } = await setup()
    const stream = pdf.context.register(pdf.context.stream(`${Buffer.from(xml).toString('hex')}>`, { Type: 'EmbeddedFile', Filter: 'ASCIIHexDecode' }))
    const fs = pdf.context.register(pdf.context.obj({ Type: 'Filespec', F: PDFString.of('factur-x.xml'), EF: { F: stream } }))
    pageDict.set(PDFName.of('Annots'), pdf.context.obj([pdf.context.obj({ Type: 'Annot', Subtype: 'FileAttachment', Rect: [0, 0, 10, 10], FS: fs })]))
    await expect(generate({ pdf: await save(pdf), xml })).rejects.toThrow('already has an embedded file named factur-x.xml')
  })

  it('still accepts other attachments there: a non-invoice file, an external file reference', async () => {
    const { pdf, xml, pageDict } = await setup()
    const png = pdf.context.register(pdf.context.flateStream(new Uint8Array([0x89, 0x50, 0x4E, 0x47]), { Type: 'EmbeddedFile' }))
    const pngSpec = pdf.context.register(pdf.context.obj({ Type: 'Filespec', F: PDFString.of('logo.png'), EF: { F: png } }))
    pageDict.set(PDFName.of('AF'), pdf.context.obj([pngSpec]))
    pageDict.set(PDFName.of('Annots'), pdf.context.obj([
      pdf.context.obj({ Type: 'Annot', Subtype: 'FileAttachment', Rect: [0, 0, 10, 10], FS: pngSpec }),
      pdf.context.obj({ Type: 'Annot', Subtype: 'FileAttachment', Rect: [0, 0, 10, 10], FS: PDFString.of('invoice.xml') }),
      pdf.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 10, 10] }),
    ]))
    await expect(generate({ pdf: await save(pdf), xml })).resolves.toBeInstanceOf(Uint8Array)
  })

  it('walks a page tree with a cycle once', async () => {
    const { pdf, xml, invoiceSpec, pageDict } = await setup()
    pageDict.set(PDFName.of('AF'), pdf.context.obj([invoiceSpec('cyclic.xml')]))
    const rootRef = pdf.catalog.get(PDFName.of('Pages')) as PDFRef
    // The page lists the root as a kid: a cycle pdf-lib's own traversal would not leave.
    pageDict.set(PDFName.of('Kids'), pdf.context.obj([rootRef]))
    const loaded = await PDFDocument.load(await save(pdf))
    await expect(generate({ pdf: loaded, xml })).rejects.toThrow('already has an embedded invoice (cyclic.xml)')
  }, 5000)

  it('refuses a PDF with more annotations than it checks', async () => {
    const { pdf, xml, pageDict } = await setup()
    const annot = pdf.context.register(pdf.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 1, 1] }))
    pageDict.set(PDFName.of('Annots'), pdf.context.obj(Array.from<PDFRef>({ length: 65537 }).fill(annot)))
    await expect(generate({ pdf, xml })).rejects.toThrow('The PDF has more than 65536 annotations: could not check it for an existing invoice')
  })

  it('refuses a PDF with more page tree nodes than it checks', async () => {
    const { pdf, xml } = await setup()
    const root = pdf.catalog.lookup(PDFName.of('Pages'), PDFDict)
    const leaf = pdf.context.register(pdf.context.obj({ Type: 'Pages', Kids: [], Count: 0 }))
    root.set(PDFName.of('Kids'), pdf.context.obj(Array.from<PDFRef>({ length: 65537 }).fill(leaf)))
    await expect(generate({ pdf, xml })).rejects.toThrow('The PDF has more than 65536 page tree nodes: could not check it for an existing invoice')
  })

  it('applies the same scan to Order-X: an order in a page /AF', async () => {
    const order = await readFile(resolve(import.meta.dirname, '../examples/ORDER-X_EX11_ORDER_PICK-UP-BASIC.xml'), 'utf8')
    const pdf = await PDFDocument.create()
    const page = pdf.addPage()
    const stream = pdf.context.register(pdf.context.flateStream(new TextEncoder().encode(order), { Type: 'EmbeddedFile' }))
    page.node.set(PDFName.of('AF'), pdf.context.obj([pdf.context.register(pdf.context.obj({ Type: 'Filespec', F: PDFString.of('po.xml'), EF: { F: stream } }))]))
    await expect(generate({ pdf: await save(pdf), xml: order })).rejects.toThrow('already has an embedded order (po.xml)')
  })
})
