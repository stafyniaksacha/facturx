import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { extract, generate, xmlToInvoice } from '@stafyniaksacha/facturx'
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream, PDFString } from 'pdf-lib'
import { describe, expect, it } from 'vitest'

// A Factur-X PDF produced by an office suite: it carries a trailer /ID, like most real-world PDFs.
// It already embeds its invoice, so sourcePdf() strips that to get a plain PDF with an /ID.
const EXAMPLE_PDF = resolve(import.meta.dirname, '../examples/Facture_FR_EN16931.pdf')
const SOURCE_XML = resolve(import.meta.dirname, '../examples/Facture_FR_EN16931.xml')

// Fixed packet id from the XMP specification, as in the spec's reference packet
// `spec/factur-x-1.09/distribution/2. FACTUR-X_extension_schema_exemple.xmp.txt`.
const XMP_PACKET_ID = 'W5M0MpCehiHzreSzNTczkc9d'

function trailerId(pdf: PDFDocument): string[] {
  const id = pdf.context.trailerInfo.ID
  if (!(id instanceof PDFArray))
    return []
  return id.asArray().map((item) => {
    if (item instanceof PDFHexString || item instanceof PDFString)
      return Buffer.from(item.asBytes()).toString('hex')
    throw new Error(`Unexpected /ID element: ${item}`)
  })
}

async function sourcePdf(): Promise<Buffer> {
  const pdf = await PDFDocument.load(await readFile(EXAMPLE_PDF))
  pdf.catalog.delete(PDFName.of('Names'))
  pdf.catalog.delete(PDFName.of('AF'))
  return Buffer.from(await pdf.save())
}

function xmpPacket(pdf: PDFDocument): string {
  const stream = pdf.context.lookup(pdf.catalog.get(PDFName.of('Metadata')))
  if (!(stream instanceof PDFRawStream))
    throw new Error('No XMP metadata stream')
  return new TextDecoder().decode(stream.getContents())
}

describe('generate', () => {
  it('keeps the permanent /ID of a source PDF that already has one (#37)', async () => {
    const source = await sourcePdf()
    const xml = await readFile(SOURCE_XML, 'utf8')
    const sourceId = trailerId(await PDFDocument.load(source))
    expect(sourceId).toHaveLength(2)

    const output = await generate({ pdf: source, xml })

    // ISO 32000-1 §14.4: the first element is the permanent identifier, the second changes
    // whenever the file is updated.
    const outputId = trailerId(await PDFDocument.load(output))
    expect(outputId).toHaveLength(2)
    expect(outputId[0]).toBe(sourceId[0])
    expect(outputId[1]).not.toBe(sourceId[1])

    const extracted = await extract({ pdf: Buffer.from(output) })
    expect(extracted.filename).toBe('factur-x.xml')
    expect(extracted.flavor).toBe('facturx')
    // The XML is re-serialized by libxml2, so compare content rather than bytes.
    expect(await xmlToInvoice(extracted.xml)).toEqual(await xmlToInvoice(xml))
  })

  it('creates both /ID elements when the source PDF has none', async () => {
    const xml = await readFile(SOURCE_XML, 'utf8')
    const pdf = await PDFDocument.create()
    pdf.addPage()
    expect(pdf.context.trailerInfo.ID).toBeUndefined()

    const outputId = trailerId(await PDFDocument.load(await generate({ pdf, xml })))
    expect(outputId).toHaveLength(2)
    expect(outputId[0]).toMatch(/^[0-9A-F]{32}$/i)
    expect(outputId[1]).toBe(outputId[0])
  })

  it('keeps a permanent /ID element stored as an indirect object', async () => {
    const xml = await readFile(SOURCE_XML, 'utf8')
    const pdf = await PDFDocument.create()
    pdf.addPage()
    const permanent = PDFHexString.of('00112233445566778899aabbccddeeff')
    pdf.context.trailerInfo.ID = pdf.context.obj([pdf.context.register(permanent), PDFHexString.of('ff')])

    const outputId = trailerId(await PDFDocument.load(await generate({ pdf, xml })))
    expect(outputId[0]).toBe('00112233445566778899aabbccddeeff')
    expect(outputId[1]).not.toBe('ff')
  })

  describe('rejects inputs it cannot embed into correctly', () => {
    async function blankPdf(): Promise<PDFDocument> {
      const pdf = await PDFDocument.create()
      pdf.addPage()
      return pdf
    }

    it('encrypted', async () => {
      const source = await blankPdf()
      source.context.trailerInfo.Encrypt = source.context.register(source.context.obj({ Filter: 'Standard' }))
      const pdf = await PDFDocument.load(await source.save(), { ignoreEncryption: true })
      expect(pdf.isEncrypted).toBe(true)

      await expect(generate({ pdf, xml: await readFile(SOURCE_XML, 'utf8') })).rejects.toThrow('Encrypted')
    })

    it('signed (a signature field with a value)', async () => {
      const pdf = await blankPdf()
      const signature = pdf.context.register(pdf.context.obj({ Type: 'Sig', Filter: 'Adobe.PPKLite' }))
      const field = pdf.context.register(pdf.context.obj({ FT: 'Sig', T: PDFString.of('Signature1'), V: signature }))
      pdf.catalog.set(PDFName.of('AcroForm'), pdf.context.obj({ Fields: [field], SigFlags: 3 }))

      await expect(generate({ pdf, xml: await readFile(SOURCE_XML, 'utf8') })).rejects.toThrow('Signed')
    })

    it('signed (a kid with a value under an inherited /FT /Sig)', async () => {
      const pdf = await blankPdf()
      const signature = pdf.context.register(pdf.context.obj({ Type: 'Sig', Filter: 'Adobe.PPKLite' }))
      const parent = pdf.context.register(pdf.context.obj({ FT: 'Sig', T: PDFString.of('Signatures') }))
      const kid = pdf.context.register(pdf.context.obj({ Parent: parent, T: PDFString.of('Signature1'), V: signature }))
      pdf.context.lookup(parent, PDFDict).set(PDFName.of('Kids'), pdf.context.obj([kid]))
      pdf.catalog.set(PDFName.of('AcroForm'), pdf.context.obj({ Fields: [parent], SigFlags: 3 }))

      await expect(generate({ pdf, xml: await readFile(SOURCE_XML, 'utf8') })).rejects.toThrow('Signed')
    })

    it('signed (a /V inherited from the parent)', async () => {
      const pdf = await blankPdf()
      const signature = pdf.context.register(pdf.context.obj({ Type: 'Sig', Filter: 'Adobe.PPKLite' }))
      const parent = pdf.context.register(pdf.context.obj({ T: PDFString.of('Signatures'), V: signature }))
      const kid = pdf.context.register(pdf.context.obj({ Parent: parent, FT: 'Sig', T: PDFString.of('Signature1') }))
      pdf.context.lookup(parent, PDFDict).set(PDFName.of('Kids'), pdf.context.obj([kid]))
      pdf.catalog.set(PDFName.of('AcroForm'), pdf.context.obj({ Fields: [parent] }))

      await expect(generate({ pdf, xml: await readFile(SOURCE_XML, 'utf8') })).rejects.toThrow('Signed')
    })

    it('signed, deep in a field tree too deep for recursion', async () => {
      const pdf = await blankPdf()
      const signature = pdf.context.register(pdf.context.obj({ Type: 'Sig', Filter: 'Adobe.PPKLite' }))
      let node = pdf.context.register(pdf.context.obj({ FT: 'Sig', V: signature }))
      for (let i = 0; i < 20_000; i++)
        node = pdf.context.register(pdf.context.obj({ Kids: [node] }))
      pdf.catalog.set(PDFName.of('AcroForm'), pdf.context.obj({ Fields: [node] }))

      await expect(generate({ pdf, xml: await readFile(SOURCE_XML, 'utf8') })).rejects.toThrow('Signed')
    })

    it.each([
      ['direct', false],
      ['inherited', true],
    ])('signed (an indirect /FT /Sig, %s)', async (_, inherited) => {
      const pdf = await blankPdf()
      const signature = pdf.context.register(pdf.context.obj({ Type: 'Sig', Filter: 'Adobe.PPKLite' }))
      const sigType = pdf.context.register(PDFName.of('Sig'))
      const field = inherited
        ? pdf.context.obj({ FT: sigType, Kids: [pdf.context.obj({ V: signature })] })
        : pdf.context.obj({ FT: sigType, V: signature })
      pdf.catalog.set(PDFName.of('AcroForm'), pdf.context.obj({ Fields: [field] }))

      await expect(generate({ pdf, xml: await readFile(SOURCE_XML, 'utf8') })).rejects.toThrow('Signed')
    })

    it('signed, after 200,000 unsigned sibling fields', async () => {
      const pdf = await blankPdf()
      const signature = pdf.context.register(pdf.context.obj({ Type: 'Sig', Filter: 'Adobe.PPKLite' }))
      const kids = pdf.context.obj([])
      for (let i = 0; i < 200_000; i++)
        kids.push(pdf.context.obj({}))
      kids.push(pdf.context.obj({ V: signature }))
      pdf.catalog.set(PDFName.of('AcroForm'), pdf.context.obj({ Fields: [pdf.context.obj({ FT: 'Sig', Kids: kids })] }))

      await expect(generate({ pdf, xml: await readFile(SOURCE_XML, 'utf8') })).rejects.toThrow('Signed')
    })

    it('signed (/Perms)', async () => {
      const pdf = await blankPdf()
      pdf.catalog.set(PDFName.of('Perms'), pdf.context.obj({}))

      await expect(generate({ pdf, xml: await readFile(SOURCE_XML, 'utf8') })).rejects.toThrow('Signed')
    })

    it('embedded files name tree with /Kids', async () => {
      const pdf = await blankPdf()
      const leaf = pdf.context.register(pdf.context.obj({ Limits: [PDFString.of('a'), PDFString.of('a')], Names: [] }))
      pdf.catalog.set(PDFName.of('Names'), pdf.context.obj({ EmbeddedFiles: { Kids: [leaf] } }))

      await expect(generate({ pdf, xml: await readFile(SOURCE_XML, 'utf8') })).rejects.toThrow('/Kids')
    })

    it.each(['factur-x.xml', 'xrechnung.xml'])('already embeds %s', async (name) => {
      const pdf = await blankPdf()
      await pdf.attach(new TextEncoder().encode('<x/>'), name, { mimeType: 'text/xml' })

      await expect(generate({ pdf: Buffer.from(await pdf.save()), xml: await readFile(SOURCE_XML, 'utf8') }))
        .rejects
        .toThrow(`already has an embedded invoice (${name})`)
    })

    it('already has an invoice queued with attach() but not saved', async () => {
      const pdf = await blankPdf()
      await pdf.attach(new TextEncoder().encode('<x/>'), 'factur-x.xml', { mimeType: 'text/xml' })

      await expect(generate({ pdf, xml: await readFile(SOURCE_XML, 'utf8') }))
        .rejects
        .toThrow('already has an embedded invoice (factur-x.xml)')
    })

    it('already has an embedded invoice', async () => {
      const xml = await readFile(SOURCE_XML, 'utf8')
      const output = await generate({ pdf: await sourcePdf(), xml })

      await expect(generate({ pdf: Buffer.from(output), xml })).rejects.toThrow('already has an embedded invoice (factur-x.xml)')
    })

    it('the same PDFDocument used twice, even concurrently', async () => {
      const xml = await readFile(SOURCE_XML, 'utf8')
      const pdf = await blankPdf()

      const results = await Promise.allSettled([generate({ pdf, xml }), generate({ pdf, xml })])
      expect(results.map(r => r.status).sort()).toEqual(['fulfilled', 'rejected'])
      await expect(generate({ pdf, xml })).rejects.toThrow('already passed to generate()')
    })
  })

  it('keeps the embedded files name tree sorted (ISO 32000-1 §7.9.6)', async () => {
    const source = await PDFDocument.create()
    source.addPage()
    await source.attach(new TextEncoder().encode('z'), 'z.txt', { mimeType: 'text/plain' })
    await source.attach(new TextEncoder().encode('a'), 'a.txt', { mimeType: 'text/plain' })
    // Store the /Names array as an indirect object, as many producers do.
    await source.flush()
    const sourceTree = source.catalog.lookup(PDFName.of('Names'), PDFDict).lookup(PDFName.of('EmbeddedFiles'), PDFDict)
    sourceTree.set(PDFName.of('Names'), source.context.register(sourceTree.lookup(PDFName.of('Names'), PDFArray)))

    const output = await PDFDocument.load(await generate({ pdf: Buffer.from(await source.save()), xml: await readFile(SOURCE_XML, 'utf8') }))
    const tree = output.catalog.lookup(PDFName.of('Names'), PDFDict).lookup(PDFName.of('EmbeddedFiles'), PDFDict)
    const keys = tree.lookup(PDFName.of('Names'), PDFArray).asArray().filter((_, i) => i % 2 === 0).map(key => (key as PDFHexString | PDFString).decodeText())
    expect(keys).toEqual(['a.txt', 'factur-x.xml', 'z.txt'])
    // Sorted in place: no stale copy of the array left in the file.
    const arrays = output.context.enumerateIndirectObjects().filter(([, obj]) => obj instanceof PDFArray && obj.size() === 6)
    expect(arrays).toHaveLength(1)
    expect(tree.get(PDFName.of('Names'))).toBe(arrays[0][0])
  })

  it('accepts unsigned signature fields', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage()
    const field = pdf.context.register(pdf.context.obj({ FT: 'Sig', T: PDFString.of('Signature1') }))
    pdf.catalog.set(PDFName.of('AcroForm'), pdf.context.obj({ Fields: [field], SigFlags: 1 }))

    await expect(generate({ pdf, xml: await readFile(SOURCE_XML, 'utf8') })).resolves.toBeInstanceOf(Uint8Array)
  })

  it('accepts unsigned signature fields that inherit /FT /Sig', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage()
    const parent = pdf.context.register(pdf.context.obj({ FT: 'Sig', T: PDFString.of('Signatures') }))
    const kid = pdf.context.register(pdf.context.obj({ Parent: parent, T: PDFString.of('Signature1') }))
    pdf.context.lookup(parent, PDFDict).set(PDFName.of('Kids'), pdf.context.obj([kid]))
    pdf.catalog.set(PDFName.of('AcroForm'), pdf.context.obj({ Fields: [parent], SigFlags: 1 }))

    await expect(generate({ pdf, xml: await readFile(SOURCE_XML, 'utf8') })).resolves.toBeInstanceOf(Uint8Array)
  })

  it('writes the fixed XMP packet id, not the document ID (CG-06)', async () => {
    const xml = await readFile(SOURCE_XML, 'utf8')
    const output = await PDFDocument.load(await generate({ pdf: await sourcePdf(), xml }))

    expect(xmpPacket(output)).toMatch(new RegExp(`^<\\?xpacket begin="[^"]*" id="${XMP_PACKET_ID}"\\?>`))
  })
})
