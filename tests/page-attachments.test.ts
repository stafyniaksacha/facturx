import type { PDFRef } from 'pdf-lib'
import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { extract, generate } from '@stafyniaksacha/facturx'
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

  // The root /Pages lists itself as a kid: pdf-lib's own traversal (save() counts the pages) would
  // overflow the stack, so the walk rejects it with a library error first.
  it.each([
    ['with', true],
    ['without', false],
  ])('rejects a page tree cycle %s an invoice', async (_, withInvoice) => {
    const { pdf, xml, invoiceSpec, pageDict } = await setup()
    if (withInvoice)
      pageDict.set(PDFName.of('AF'), pdf.context.obj([invoiceSpec('cyclic.xml')]))
    const root = pdf.catalog.lookup(PDFName.of('Pages'), PDFDict)
    const rootRef = pdf.catalog.get(PDFName.of('Pages')) as PDFRef
    root.lookup(PDFName.of('Kids'), PDFArray).push(rootRef)
    await expect(generate({ pdf, xml })).rejects.toThrow('Malformed page tree: a page tree node is reached twice')
  }, 5000)

  it('rejects a page listed twice in /Kids', async () => {
    const { pdf, xml } = await setup()
    const root = pdf.catalog.lookup(PDFName.of('Pages'), PDFDict)
    const kids = root.lookup(PDFName.of('Kids'), PDFArray)
    kids.push(kids.get(0))
    await expect(generate({ pdf, xml })).rejects.toThrow('Malformed page tree: a page tree node is reached twice')
  })

  // Spec review probe: one /AF array of 1000 entries shared by an annotation listed 65536 times
  // took ~27 s when every reference re-read it. Each array and annotation is now read once.
  it('reads a shared /AF array and a repeated annotation once', async () => {
    const { pdf, xml, pageDict } = await setup()
    const png = pdf.context.register(pdf.context.flateStream(new Uint8Array([0x89, 0x50, 0x4E, 0x47]), { Type: 'EmbeddedFile' }))
    const fs = pdf.context.register(pdf.context.obj({ Type: 'Filespec', F: PDFString.of('logo.png'), EF: { F: png } }))
    const af = pdf.context.register(pdf.context.obj(Array.from<PDFRef>({ length: 1000 }).fill(fs)))
    const annot = pdf.context.register(pdf.context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [0, 0, 1, 1], AF: af }))
    pageDict.set(PDFName.of('Annots'), pdf.context.obj(Array.from<PDFRef>({ length: 65536 }).fill(annot)))
    pageDict.set(PDFName.of('AF'), af)
    const started = performance.now()
    await expect(generate({ pdf, xml })).resolves.toBeInstanceOf(Uint8Array)
    expect(performance.now() - started).toBeLessThan(5000)
  }, 10000)

  it.each([
    [65536, true],
    [65537, false],
  ])('%i distinct annotations: accepted %s', async (count, accepted) => {
    const { pdf, xml, pageDict } = await setup()
    pageDict.set(PDFName.of('Annots'), pdf.context.obj(Array.from({ length: count }, () => pdf.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 1, 1] }))))
    const result = generate({ pdf, xml })
    if (accepted)
      await expect(result).resolves.toBeInstanceOf(Uint8Array)
    else
      await expect(result).rejects.toThrow('The PDF has more than 65536 annotations: could not check it for an existing invoice')
  }, 30000)

  it('refuses a PDF with more distinct page tree nodes than it checks', async () => {
    const { pdf, xml } = await setup()
    const root = pdf.catalog.lookup(PDFName.of('Pages'), PDFDict)
    // The root plus 65536 distinct (empty) intermediate nodes.
    root.set(PDFName.of('Kids'), pdf.context.obj(Array.from({ length: 65536 }, () => pdf.context.obj({ Type: 'Pages', Kids: [], Count: 0 }))))
    await expect(generate({ pdf, xml })).rejects.toThrow('The PDF has more than 65536 page tree nodes: could not check it for an existing invoice')
  }, 30000)

  it('refuses a PDF with more array entries than it reads', async () => {
    const { pdf, xml, pageDict } = await setup()
    // 17 distinct /AF arrays of 65536 null entries each: 1114112 entries in all.
    const annots = Array.from({ length: 17 }, () => pdf.context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [0, 0, 1, 1], AF: pdf.context.obj(Array.from<null>({ length: 65536 }).fill(null)) }))
    pageDict.set(PDFName.of('Annots'), pdf.context.obj(annots))
    await expect(generate({ pdf, xml })).rejects.toThrow('The PDF has more than 1048576 page tree, annotation and /AF entries: could not check it for an existing invoice')
  }, 30000)

  // Second spec review probe: 4000 file specifications sharing one 50000-character /F and /UF took
  // ~8 s when the string was decoded once per specification.
  it('decodes a shared long file name once', async () => {
    const { pdf, xml, pageDict } = await setup()
    const name = pdf.context.register(PDFString.of('n'.repeat(50000)))
    const specs = Array.from({ length: 4000 }, () => pdf.context.register(pdf.context.obj({ Type: 'Filespec', F: name, UF: name })))
    pageDict.set(PDFName.of('AF'), pdf.context.obj(specs))
    const started = performance.now()
    await expect(generate({ pdf: await save(pdf), xml })).resolves.toBeInstanceOf(Uint8Array)
    expect(performance.now() - started).toBeLessThan(3000)
  }, 10000)

  it('handles a file name of 300000 characters without a stack overflow', async () => {
    const { pdf, xml } = await setup()
    await pdf.attach(new TextEncoder().encode('hello'), 'x'.repeat(300000), { mimeType: 'text/plain' })
    const bytes = await save(pdf)
    await expect(generate({ pdf: bytes, xml })).resolves.toBeInstanceOf(Uint8Array)
    await expect(extract({ pdf: bytes })).rejects.toThrow('No attachment found')
  }, 10000)

  it.each([
    [256, true],
    [257, false],
  ])('a page tree %i levels deep: accepted %s', async (levels, accepted) => {
    const { pdf, xml } = await setup()
    const root = pdf.catalog.lookup(PDFName.of('Pages'), PDFDict)
    let parent = root
    for (let level = 0; level < levels; level++) {
      const node = pdf.context.obj({ Type: 'Pages', Kids: [], Count: 0 })
      parent.set(PDFName.of('Kids'), pdf.context.obj([...parent.lookup(PDFName.of('Kids'), PDFArray).asArray(), pdf.context.register(node)]))
      parent = node
    }
    const result = generate({ pdf, xml })
    if (accepted)
      await expect(result).resolves.toBeInstanceOf(Uint8Array)
    else
      await expect(result).rejects.toThrow('The PDF has a page tree deeper than 256 levels: could not check it for an existing invoice')
  })

  // A consequence of the wider scan: the existing limit of 256 distinct embedded file streams now
  // counts the files of annotations and page /AF too.
  it('counts annotation files against the 256-stream limit', async () => {
    const { pdf, xml, pageDict } = await setup()
    const annots = Array.from({ length: 257 }, (_, i) => {
      const stream = pdf.context.register(pdf.context.flateStream(new TextEncoder().encode(`note ${i}`), { Type: 'EmbeddedFile' }))
      const fs = pdf.context.obj({ Type: 'Filespec', F: PDFString.of(`note-${i}.txt`), EF: { F: stream } })
      return pdf.context.obj({ Type: 'Annot', Subtype: 'FileAttachment', Rect: [0, 0, 1, 1], FS: fs })
    })
    pageDict.set(PDFName.of('Annots'), pdf.context.obj(annots))
    await expect(generate({ pdf, xml })).rejects.toThrow('The PDF has more than 256 distinct embedded file streams')
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
