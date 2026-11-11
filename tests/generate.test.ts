import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { extract, generate, xmlToInvoice } from '@stafyniaksacha/facturx'
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNull, PDFRawStream, PDFString } from 'pdf-lib'
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

    it('signed (an indirect null /FT under a /FT /Sig parent)', async () => {
      const pdf = await blankPdf()
      const signature = pdf.context.register(pdf.context.obj({ Type: 'Sig', Filter: 'Adobe.PPKLite' }))
      const kid = pdf.context.obj({ FT: pdf.context.register(PDFNull), V: signature })
      pdf.catalog.set(PDFName.of('AcroForm'), pdf.context.obj({ Fields: [pdf.context.obj({ FT: 'Sig', Kids: [kid] })] }))

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

    // Detected by content, whatever the file is called: other tools use other names.
    it.each(['xrechnung.xml', 'invoice.xml', 'facture'])('already embeds an invoice named %s', async (name) => {
      const xml = await readFile(SOURCE_XML, 'utf8')
      const pdf = await blankPdf()
      await pdf.attach(new TextEncoder().encode(xml), name, { mimeType: 'text/xml' })

      await expect(generate({ pdf: Buffer.from(await pdf.save()), xml }))
        .rejects
        .toThrow(`already has an embedded invoice (${name})`)
    })

    it('already has an invoice associated only through /AF', async () => {
      const xml = await readFile(SOURCE_XML, 'utf8')
      const pdf = await blankPdf()
      const stream = pdf.context.register(pdf.context.flateStream(new TextEncoder().encode(xml), { Type: 'EmbeddedFile' }))
      const fileSpec = pdf.context.register(pdf.context.obj({ Type: 'Filespec', UF: PDFHexString.fromText('order.xml'), EF: { F: stream } }))
      pdf.catalog.set(PDFName.of('AF'), pdf.context.obj([fileSpec]))

      await expect(generate({ pdf: Buffer.from(await pdf.save()), xml })).rejects.toThrow('already has an embedded invoice (order.xml)')
    })

    it('already embeds a UTF-16LE invoice', async () => {
      const xml = await readFile(SOURCE_XML, 'utf8')
      const pdf = await blankPdf()
      const utf16 = Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(xml.replace('encoding="UTF-8"', 'encoding="UTF-16"'), 'utf16le')])
      await pdf.attach(utf16, 'invoice-utf16.xml', { mimeType: 'text/xml' })

      await expect(generate({ pdf: Buffer.from(await pdf.save()), xml })).rejects.toThrow('already has an embedded invoice (invoice-utf16.xml)')
    })

    it('already embeds an invoice larger than the decoded prefix', async () => {
      const xml = await readFile(SOURCE_XML, 'utf8')
      const pdf = await blankPdf()
      const large = xml.replace('</rsm:CrossIndustryInvoice>', `<!--${' '.repeat(1024 * 1024)}--></rsm:CrossIndustryInvoice>`)
      await pdf.attach(new TextEncoder().encode(large), 'large.xml', { mimeType: 'text/xml' })

      await expect(generate({ pdf: Buffer.from(await pdf.save()), xml })).rejects.toThrow('already has an embedded invoice (large.xml)')
    })

    it('already has an invoice queued with attach() but not saved', async () => {
      const xml = await readFile(SOURCE_XML, 'utf8')
      const pdf = await blankPdf()
      await pdf.attach(new TextEncoder().encode(xml), 'queued.xml', { mimeType: 'text/xml' })

      await expect(generate({ pdf, xml })).rejects.toThrow('already has an embedded invoice (queued.xml)')
    })

    it('already has a non-invoice file under the name it would write', async () => {
      const pdf = await blankPdf()
      await pdf.attach(new TextEncoder().encode('<x/>'), 'factur-x.xml', { mimeType: 'text/xml' })

      await expect(generate({ pdf: Buffer.from(await pdf.save()), xml: await readFile(SOURCE_XML, 'utf8') }))
        .rejects
        .toThrow('already has an embedded file named factur-x.xml')
    })

    it('already has that name as a file specification /F under another key', async () => {
      const pdf = await blankPdf()
      const fileSpec = pdf.context.register(pdf.context.obj({ Type: 'Filespec', F: PDFString.of('factur-x.xml') }))
      pdf.catalog.set(PDFName.of('Names'), pdf.context.obj({ EmbeddedFiles: { Names: [PDFString.of('attachment-1'), fileSpec] } }))

      await expect(generate({ pdf, xml: await readFile(SOURCE_XML, 'utf8') }))
        .rejects
        .toThrow('already has an embedded file named factur-x.xml')
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

  it('writes the invoice key in the encoding of the source keys before sorting', async () => {
    const source = await PDFDocument.create()
    source.addPage()
    await source.attach(new TextEncoder().encode('a'), 'a.txt', { mimeType: 'text/plain' })
    await source.attach(new TextEncoder().encode('z'), 'z.txt', { mimeType: 'text/plain' })
    await source.flush()
    // pdf-lib writes UTF-16BE keys; rewrite them as PDFDocEncoded literals, as many producers do.
    const sourceKeys = source.catalog.lookup(PDFName.of('Names'), PDFDict).lookup(PDFName.of('EmbeddedFiles'), PDFDict).lookup(PDFName.of('Names'), PDFArray)
    for (let i = 0; i < sourceKeys.size(); i += 2)
      sourceKeys.set(i, PDFString.of(sourceKeys.lookup(i, PDFHexString).decodeText()))

    const output = await PDFDocument.load(await generate({ pdf: Buffer.from(await source.save()), xml: await readFile(SOURCE_XML, 'utf8') }))
    const keys = output.catalog.lookup(PDFName.of('Names'), PDFDict).lookup(PDFName.of('EmbeddedFiles'), PDFDict).lookup(PDFName.of('Names'), PDFArray).asArray().filter((_, i) => i % 2 === 0)
    // Every key is a PDFDocEncoded literal (no UTF-16BE byte order mark), in byte order.
    expect(keys.map(key => Buffer.from((key as PDFString).asBytes()).toString('latin1'))).toEqual(['a.txt', 'factur-x.xml', 'z.txt'])
    expect((await extract({ pdf: Buffer.from(await output.save()) })).filename).toBe('factur-x.xml')
  })

  it('accepts supporting XML files that are not invoices (§6.4)', async () => {
    const source = await PDFDocument.create()
    source.addPage()
    await source.attach(new TextEncoder().encode('<?xml version="1.0"?><timesheet><day>1</day></timesheet>'), 'timesheet.xml', { mimeType: 'text/xml' })

    const output = await generate({ pdf: Buffer.from(await source.save()), xml: await readFile(SOURCE_XML, 'utf8') })
    expect((await extract({ pdf: Buffer.from(output) })).filename).toBe('factur-x.xml')
  })

  it.each([
    ['an Order-X purchase order', resolve(import.meta.dirname, '../examples/ORDER-X_EX11_ORDER_PICK-UP-BASIC.xml')],
    ['a look-alike root without the CII namespace', undefined],
  ])('accepts a supporting XML file that is %s (§6.4)', async (_, file) => {
    const content = file ? await readFile(file) : new TextEncoder().encode('<CrossIndustryInvoice/>')
    const source = await PDFDocument.create()
    source.addPage()
    await source.attach(content, 'supporting.xml', { mimeType: 'text/xml' })

    const output = await generate({ pdf: Buffer.from(await source.save()), xml: await readFile(SOURCE_XML, 'utf8') })
    expect((await extract({ pdf: Buffer.from(output) })).filename).toBe('factur-x.xml')
  })

  it.each([
    ['a DOCTYPE internal subset with no closing ]', '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "b">'],
    ['a DOCTYPE with a [ in a quoted system id', '<?xml version="1.0"?><!DOCTYPE x SYSTEM "a[b"><x/>'],
    ['an unterminated comment', '<?xml version="1.0"?><!-- no end'],
    ['a quoted > in a DOCTYPE system id', '<!DOCTYPE x SYSTEM "><rsm:CrossIndustryInvoice xmlns:rsm=\'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100\'>"><x/>'],
    ['an unterminated start tag', '<?xml version="1.0"?><x a="1'],
  ])('accepts, without hanging, a supporting file with %s', async (_, content) => {
    const source = await PDFDocument.create()
    source.addPage()
    await source.attach(new TextEncoder().encode(content), 'odd.xml', { mimeType: 'text/xml' })

    await expect(generate({ pdf: Buffer.from(await source.save()), xml: await readFile(SOURCE_XML, 'utf8') })).resolves.toBeInstanceOf(Uint8Array)
  }, 2000)

  it('reads a stream shared by many file specifications only once', async () => {
    const source = await PDFDocument.create()
    source.addPage()
    const stream = source.context.register(source.context.flateStream(new TextEncoder().encode('<timesheet/>'), { Type: 'EmbeddedFile' }))
    const specs = Array.from({ length: 5000 }, () => source.context.register(source.context.obj({ Type: 'Filespec', EF: { F: stream } })))
    source.catalog.set(PDFName.of('AF'), source.context.obj(specs))

    await expect(generate({ pdf: Buffer.from(await source.save()), xml: await readFile(SOURCE_XML, 'utf8') })).resolves.toBeInstanceOf(Uint8Array)
  })

  it('rejects a PDF with too many distinct embedded files to check', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage()
    const specs = Array.from({ length: 257 }, () => pdf.context.register(pdf.context.obj({
      Type: 'Filespec',
      EF: { F: pdf.context.register(pdf.context.stream('x', { Type: 'EmbeddedFile' })) },
    })))
    pdf.catalog.set(PDFName.of('AF'), pdf.context.obj(specs))

    await expect(generate({ pdf, xml: await readFile(SOURCE_XML, 'utf8') })).rejects.toThrow('could not check it')
  })

  it('reads only a bounded prefix of a highly compressed attachment', async () => {
    const source = await PDFDocument.create()
    source.addPage()
    // 64 MiB of zeros in ~64 KiB of zlib data: far more than the inflate cap allows.
    const bomb = source.context.register(source.context.flateStream(new Uint8Array(64 * 1024 * 1024), { Type: 'EmbeddedFile' }))
    const fileSpec = source.context.register(source.context.obj({ Type: 'Filespec', UF: PDFHexString.fromText('zeros.bin'), EF: { F: bomb } }))
    source.catalog.set(PDFName.of('AF'), source.context.obj([fileSpec]))

    await expect(generate({ pdf: Buffer.from(await source.save()), xml: await readFile(SOURCE_XML, 'utf8') })).resolves.toBeInstanceOf(Uint8Array)
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
