import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { check, extract, generate, xmlToInvoice } from '@stafyniaksacha/facturx'
import { XmlDocument } from 'libxml2-wasm'
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

const XMP_NS = {
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  dc: 'http://purl.org/dc/elements/1.1/',
  pdf: 'http://ns.adobe.com/pdf/1.3/',
  fx: 'urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#',
}

// Parses the /Metadata stream of a generated PDF and returns the texts of the properties the
// tests look at. Parsing fails on malformed XMP, which is what CG-03 produced.
function readXmp(pdf: PDFDocument): { title: string[], creator: string[], description: string[], producer: string[], documentType: string[], conformanceLevel: string[] } {
  const doc = XmlDocument.fromString(xmpPacket(pdf))
  try {
    const texts = (xpath: string): string[] => doc.find(xpath, XMP_NS).map(node => node.content)
    return {
      title: texts('//dc:title/rdf:Alt/rdf:li'),
      creator: texts('//dc:creator/rdf:Seq/rdf:li'),
      description: texts('//dc:description/rdf:Alt/rdf:li'),
      producer: texts('//pdf:Producer'),
      documentType: texts('//fx:DocumentType'),
      conformanceLevel: texts('//fx:ConformanceLevel'),
    }
  }
  finally {
    doc.dispose()
  }
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

  // Was rejected until CG-13: an empty leaf under a root /Kids (Factur-X §6.2.2 p.27, §6.4 p.31).
  // tests/name-tree.test.ts covers the other tree shapes.
  it('embeds into an embedded files name tree with /Kids (CG-13)', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage()
    const leaf = pdf.context.register(pdf.context.obj({ Limits: [PDFString.of('a'), PDFString.of('a')], Names: [] }))
    pdf.catalog.set(PDFName.of('Names'), pdf.context.obj({ EmbeddedFiles: { Kids: [leaf] } }))

    const bytes = await generate({ pdf, xml: await readFile(SOURCE_XML, 'utf8') })
    expect((await extract({ pdf: Buffer.from(bytes) })).filename).toBe('factur-x.xml')
    const output = await PDFDocument.load(bytes)
    const tree = output.catalog.lookup(PDFName.of('Names'), PDFDict).lookup(PDFName.of('EmbeddedFiles'), PDFDict)
    expect(tree.has(PDFName.of('Names'))).toBe(false)
    const outLeaf = tree.lookup(PDFName.of('Kids'), PDFArray).lookup(0, PDFDict)
    const key = (obj: unknown): string => (obj as PDFHexString | PDFString).decodeText()
    expect(outLeaf.lookup(PDFName.of('Names'), PDFArray).asArray().filter((_, i) => i % 2 === 0).map(key)).toEqual(['factur-x.xml'])
    expect(outLeaf.lookup(PDFName.of('Limits'), PDFArray).asArray().map(key)).toEqual(['factur-x.xml', 'factur-x.xml'])
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
  ])('accepts, without hanging, an XML file with %s', async (_, content) => {
    const source = await PDFDocument.create()
    source.addPage()
    await source.attach(new TextEncoder().encode(content), 'odd.xml', { mimeType: 'text/xml' })

    await expect(generate({ pdf: Buffer.from(await source.save()), xml: await readFile(SOURCE_XML, 'utf8') })).resolves.toBeInstanceOf(Uint8Array)
  }, 2000)

  it('rejects by name an invoice in a stream it cannot decode (/F zugferd-invoice.xml under another key)', async () => {
    const xml = await readFile(SOURCE_XML, 'utf8')
    const pdf = await PDFDocument.create()
    pdf.addPage()
    const hex = `${Buffer.from(xml).toString('hex')}>`
    const stream = pdf.context.register(pdf.context.stream(hex, { Type: 'EmbeddedFile', Filter: 'ASCIIHexDecode' }))
    const fileSpec = pdf.context.register(pdf.context.obj({ Type: 'Filespec', F: PDFString.of('zugferd-invoice.xml'), EF: { F: stream } }))
    pdf.catalog.set(PDFName.of('Names'), pdf.context.obj({ EmbeddedFiles: { Names: [PDFString.of('invoice-1'), fileSpec] } }))
    pdf.catalog.set(PDFName.of('AF'), pdf.context.obj([fileSpec]))

    await expect(generate({ pdf: Buffer.from(await pdf.save()), xml }))
      .rejects
      .toThrow('already has an embedded invoice (zugferd-invoice.xml)')
  })

  it.each([
    ['a comment written as <!-->', '<?xml version="1.0"?><!--><x/>-->'],
    ['a comment written as <!--->', '<?xml version="1.0"?><!---><x/>-->'],
  ])('detects an invoice behind %s', async (_, prolog) => {
    const xml = await readFile(SOURCE_XML, 'utf8')
    const pdf = await PDFDocument.create()
    pdf.addPage()
    await pdf.attach(new TextEncoder().encode(prolog + xml.replace(/^<\?xml[^>]*>/, '')), 'old.xml', { mimeType: 'text/xml' })

    await expect(generate({ pdf: Buffer.from(await pdf.save()), xml })).rejects.toThrow('already has an embedded invoice (old.xml)')
  })

  it.each([
    ['/F holds something else', true],
    ['/F is not a stream', false],
  ])('detects an invoice in /EF /UF when %s', async (_, fIsStream) => {
    const xml = await readFile(SOURCE_XML, 'utf8')
    const pdf = await PDFDocument.create()
    pdf.addPage()
    const invoice = pdf.context.register(pdf.context.flateStream(new TextEncoder().encode(xml), { Type: 'EmbeddedFile' }))
    const other = fIsStream ? pdf.context.register(pdf.context.flateStream(new Uint8Array([0x89, 0x50, 0x4E, 0x47]), { Type: 'EmbeddedFile' })) : 5
    const fileSpec = pdf.context.register(pdf.context.obj({ Type: 'Filespec', UF: PDFHexString.fromText('logo.png'), EF: { F: other, UF: invoice } }))
    pdf.catalog.set(PDFName.of('AF'), pdf.context.obj([fileSpec]))

    await expect(generate({ pdf: Buffer.from(await pdf.save()), xml })).rejects.toThrow('already has an embedded invoice (logo.png)')
  })

  it.each([
    ['a prolog longer than the examined prefix', async (pdf: PDFDocument, xml: string) => pdf.attach(new TextEncoder().encode(`<?xml version="1.0"?><!--${' '.repeat(70 * 1024)}-->${xml.replace(/^<\?xml[^>]*>/, '')}`), 'long.xml', { mimeType: 'text/xml' })],
    ['/DecodeParms on a /FlateDecode stream', async (pdf: PDFDocument, xml: string) => {
      const stream = pdf.context.register(pdf.context.flateStream(new TextEncoder().encode(xml), { Type: 'EmbeddedFile', DecodeParms: { Predictor: 12 } }))
      pdf.catalog.set(PDFName.of('AF'), pdf.context.obj([pdf.context.register(pdf.context.obj({ Type: 'Filespec', EF: { F: stream } }))]))
    }],
    ['corrupt /FlateDecode data', async (pdf: PDFDocument) => {
      const stream = pdf.context.register(pdf.context.stream(new Uint8Array([1, 2, 3, 4, 5, 6]), { Type: 'EmbeddedFile', Filter: 'FlateDecode' }))
      pdf.catalog.set(PDFName.of('AF'), pdf.context.obj([pdf.context.register(pdf.context.obj({ Type: 'Filespec', EF: { F: stream } }))]))
    }],
    ['an /EF that is not a dictionary', async (pdf: PDFDocument) => {
      pdf.catalog.set(PDFName.of('AF'), pdf.context.obj([pdf.context.register(pdf.context.obj({ Type: 'Filespec', EF: 5 }))]))
    }],
  ])('accepts, as a documented gap (CG-14), an unreadable invoice with no recognized name: %s', async (_, attach) => {
    const xml = await readFile(SOURCE_XML, 'utf8')
    const pdf = await PDFDocument.create()
    pdf.addPage()
    await attach(pdf, xml)

    await expect(generate({ pdf: Buffer.from(await pdf.save()), xml })).resolves.toBeInstanceOf(Uint8Array)
  })

  it.each([
    ['the name tree key', 'xrechnung.xml', undefined],
    ['/UF', undefined, 'ZUGFeRD-invoice.xml'],
  ])('rejects by name, through %s alone, a file whose content is not an invoice', async (_, key, uf) => {
    const pdf = await PDFDocument.create()
    pdf.addPage()
    const stream = pdf.context.register(pdf.context.flateStream(new TextEncoder().encode('not an invoice'), { Type: 'EmbeddedFile' }))
    const fileSpec = pdf.context.register(pdf.context.obj({ Type: 'Filespec', ...(uf ? { UF: PDFHexString.fromText(uf) } : {}), EF: { F: stream } }))
    pdf.catalog.set(PDFName.of('Names'), pdf.context.obj({ EmbeddedFiles: { Names: [PDFString.of(key ?? 'attachment-1'), fileSpec] } }))

    await expect(generate({ pdf: Buffer.from(await pdf.save()), xml: await readFile(SOURCE_XML, 'utf8') }))
      .rejects
      .toThrow(`already has an embedded invoice (${key ?? uf})`)
  })

  it('detects a UTF-8 invoice with a BOM', async () => {
    const xml = await readFile(SOURCE_XML, 'utf8')
    const pdf = await PDFDocument.create()
    pdf.addPage()
    await pdf.attach(Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(xml)]), 'bom.xml', { mimeType: 'text/xml' })

    await expect(generate({ pdf: Buffer.from(await pdf.save()), xml })).rejects.toThrow('already has an embedded invoice (bom.xml)')
  })

  it('rejects by name an unreadable order-x.xml when writing an order, accepts it when writing an invoice', async () => {
    const order = await readFile(resolve(import.meta.dirname, '../examples/ORDER-X_EX11_ORDER_PICK-UP-BASIC.xml'), 'utf8')
    const source = async (): Promise<Buffer> => {
      const pdf = await PDFDocument.create()
      pdf.addPage()
      const stream = pdf.context.register(pdf.context.stream(`${Buffer.from(order).toString('hex')}>`, { Type: 'EmbeddedFile', Filter: 'ASCIIHexDecode' }))
      pdf.catalog.set(PDFName.of('AF'), pdf.context.obj([pdf.context.register(pdf.context.obj({ Type: 'Filespec', F: PDFString.of('order-x.xml'), EF: { F: stream } }))]))
      return Buffer.from(await pdf.save())
    }

    await expect(generate({ pdf: await source(), xml: order })).rejects.toThrow('already has an embedded file named order-x.xml')
    await expect(generate({ pdf: await source(), xml: await readFile(SOURCE_XML, 'utf8') })).resolves.toBeInstanceOf(Uint8Array)
  })

  it('detects a UTF-16BE invoice with a BOM', async () => {
    const xml = await readFile(SOURCE_XML, 'utf8')
    const pdf = await PDFDocument.create()
    pdf.addPage()
    const le = Buffer.from(xml.replace('encoding="UTF-8"', 'encoding="UTF-16"'), 'utf16le')
    const be = Buffer.alloc(le.length)
    for (let i = 0; i + 1 < le.length; i += 2) {
      be[i] = le[i + 1]
      be[i + 1] = le[i]
    }
    await pdf.attach(Buffer.concat([Buffer.from([0xFE, 0xFF]), be]), 'invoice-be.xml', { mimeType: 'text/xml' })

    await expect(generate({ pdf: Buffer.from(await pdf.save()), xml })).rejects.toThrow('already has an embedded invoice (invoice-be.xml)')
  })

  it('accepts a stream whose later slice exceeds the per-attempt output cap', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage()
    // Incompressible start (several small attempts), then zeros that overflow the 2 MiB cap.
    const random = new Uint8Array(12 * 1024).map(() => Math.floor(Math.random() * 256))
    const content = Buffer.concat([Buffer.from(random), Buffer.alloc(60 * 1024 * 1024)])
    pdf.catalog.set(PDFName.of('AF'), pdf.context.obj([pdf.context.register(pdf.context.obj({
      Type: 'Filespec',
      EF: { F: pdf.context.register(pdf.context.flateStream(content, { Type: 'EmbeddedFile' })) },
    }))]))

    await expect(generate({ pdf: Buffer.from(await pdf.save()), xml: await readFile(SOURCE_XML, 'utf8') })).resolves.toBeInstanceOf(Uint8Array)
  })

  it('rejects by name an /AF file it cannot decode (xrechnung.xml, ASCIIHexDecode)', async () => {
    const xml = await readFile(SOURCE_XML, 'utf8')
    const pdf = await PDFDocument.create()
    pdf.addPage()
    const stream = pdf.context.register(pdf.context.stream(`${Buffer.from(xml).toString('hex')}>`, { Type: 'EmbeddedFile', Filter: 'ASCIIHexDecode' }))
    pdf.catalog.set(PDFName.of('AF'), pdf.context.obj([pdf.context.register(pdf.context.obj({ Type: 'Filespec', F: PDFString.of('xrechnung.xml'), EF: { F: stream } }))]))

    await expect(generate({ pdf: Buffer.from(await pdf.save()), xml })).rejects.toThrow('already has an embedded invoice (xrechnung.xml)')
  })

  it('detects an invoice stored only under a deprecated /EF key (/DOS)', async () => {
    const xml = await readFile(SOURCE_XML, 'utf8')
    const pdf = await PDFDocument.create()
    pdf.addPage()
    const stream = pdf.context.register(pdf.context.flateStream(new TextEncoder().encode(xml), { Type: 'EmbeddedFile' }))
    pdf.catalog.set(PDFName.of('AF'), pdf.context.obj([pdf.context.register(pdf.context.obj({ Type: 'Filespec', F: PDFString.of('INV.XML'), EF: { DOS: stream } }))]))

    await expect(generate({ pdf: Buffer.from(await pdf.save()), xml })).rejects.toThrow('already has an embedded invoice (INV.XML)')
  })

  // Inflating ~150 MiB to prove the 128 MiB budget is CPU-bound: about 2 s locally, but it went past
  // vitest's default 5 s timeout on slow CI runners (Node 20). The limit itself is unchanged.
  it('rejects a PDF whose embedded files would inflate past the per-PDF budget', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage()
    // 150 distinct streams, each inflating to about 1 MiB from its first 1 KiB: past the 128 MiB budget.
    const zeros = new Uint8Array(1536 * 1024)
    const specs = Array.from({ length: 150 }, () => pdf.context.register(pdf.context.obj({
      Type: 'Filespec',
      EF: { F: pdf.context.register(pdf.context.flateStream(zeros, { Type: 'EmbeddedFile' })) },
    })))
    pdf.catalog.set(PDFName.of('AF'), pdf.context.obj(specs))

    await expect(generate({ pdf, xml: await readFile(SOURCE_XML, 'utf8') })).rejects.toThrow('too large to check for an existing invoice')
  }, 30_000)

  it('says "order" when the document being written is an Order-X order', async () => {
    const order = await readFile(resolve(import.meta.dirname, '../examples/ORDER-X_EX11_ORDER_PICK-UP-BASIC.xml'), 'utf8')
    const pdf = await PDFDocument.create()
    pdf.addPage()
    await pdf.attach(new TextEncoder().encode(order), 'previous-order.xml', { mimeType: 'text/xml' })

    await expect(generate({ pdf: Buffer.from(await pdf.save()), xml: order })).rejects.toThrow('already has an embedded order (previous-order.xml)')
  })

  it('accepts attachments that are clearly not XML', async () => {
    const source = await PDFDocument.create()
    source.addPage()
    await source.attach(new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), 'logo.png', { mimeType: 'image/png' })
    await source.attach(new Uint8Array(0), 'empty.txt', { mimeType: 'text/plain' })
    await source.attach(new TextEncoder().encode('  plain text'), 'notes.txt', { mimeType: 'text/plain' })
    await source.attach(new TextEncoder().encode('<<Important>> pay soon'), 'reminder.txt', { mimeType: 'text/plain' })
    await source.attach(new TextEncoder().encode('<- see attached'), 'pointer.txt', { mimeType: 'text/plain' })
    await source.attach(new TextEncoder().encode(' \n\t '), 'blank.txt', { mimeType: 'text/plain' })
    const emptyFlate = source.context.register(source.context.stream(new Uint8Array(0), { Type: 'EmbeddedFile', Filter: 'FlateDecode' }))
    source.catalog.set(PDFName.of('AF'), source.context.obj([source.context.register(source.context.obj({ Type: 'Filespec', EF: { F: emptyFlate } }))]))

    await expect(generate({ pdf: Buffer.from(await source.save()), xml: await readFile(SOURCE_XML, 'utf8') })).resolves.toBeInstanceOf(Uint8Array)
  })

  it('reads a stream shared by many file specifications only once', async () => {
    const source = await PDFDocument.create()
    source.addPage()
    const stream = source.context.register(source.context.flateStream(new TextEncoder().encode('<timesheet/>'), { Type: 'EmbeddedFile' }))
    const specs = Array.from({ length: 5000 }, () => source.context.register(source.context.obj({ Type: 'Filespec', EF: { F: stream } })))
    source.catalog.set(PDFName.of('AF'), source.context.obj(specs))

    await expect(generate({ pdf: Buffer.from(await source.save()), xml: await readFile(SOURCE_XML, 'utf8') })).resolves.toBeInstanceOf(Uint8Array)
  })

  it('stops at the stream limit inside one huge /EF dictionary', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage()
    const ef = pdf.context.obj({})
    for (let i = 0; i < 20_000; i++)
      ef.set(PDFName.of(`S${i}`), pdf.context.register(pdf.context.stream('x', { Type: 'EmbeddedFile' })))
    pdf.catalog.set(PDFName.of('AF'), pdf.context.obj([pdf.context.register(pdf.context.obj({ Type: 'Filespec', EF: ef }))]))

    const started = Date.now()
    await expect(generate({ pdf, xml: await readFile(SOURCE_XML, 'utf8') })).rejects.toThrow('more than 256 distinct embedded file streams')
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('walks an /EF dictionary shared by many file specifications once', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage()
    const stream = pdf.context.register(pdf.context.stream('x', { Type: 'EmbeddedFile' }))
    const ef = pdf.context.obj({})
    for (let i = 0; i < 10_000; i++)
      ef.set(PDFName.of(`S${i}`), stream)
    const efRef = pdf.context.register(ef)
    const specs = Array.from({ length: 10_000 }, () => pdf.context.register(pdf.context.obj({ Type: 'Filespec', EF: efRef })))
    pdf.catalog.set(PDFName.of('AF'), pdf.context.obj(specs))

    const started = Date.now()
    await expect(generate({ pdf, xml: await readFile(SOURCE_XML, 'utf8') })).resolves.toBeInstanceOf(Uint8Array)
    expect(Date.now() - started).toBeLessThan(3000)
  })

  it('shows a document-controlled file name safely in the error', async () => {
    const xml = await readFile(SOURCE_XML, 'utf8')
    const pdf = await PDFDocument.create()
    pdf.addPage()
    await pdf.attach(new TextEncoder().encode(xml), `evil\n\u001B[31m${'x'.repeat(500)}`, { mimeType: 'text/xml' })

    const error = await generate({ pdf: Buffer.from(await pdf.save()), xml }).catch((e: Error) => e)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toMatch(/^The PDF already has an embedded invoice \(evil\[31mx+…\)$/)
    expect((error as Error).message.length).toBeLessThan(140)
  })

  it('detects an unfiltered invoice whose /Filter and /DecodeParms are indirect nulls (regression guard)', async () => {
    const xml = await readFile(SOURCE_XML, 'utf8')
    const pdf = await PDFDocument.create()
    pdf.addPage()
    // pdf-lib's dict.get() already drops a direct null; an indirect one resolves to PDFNull.
    const stream = pdf.context.register(pdf.context.stream(xml, { Type: 'EmbeddedFile', Filter: pdf.context.register(PDFNull), DecodeParms: pdf.context.register(PDFNull) }))
    pdf.catalog.set(PDFName.of('AF'), pdf.context.obj([pdf.context.register(pdf.context.obj({ Type: 'Filespec', F: PDFString.of('old.xml'), EF: { F: stream } }))]))

    await expect(generate({ pdf, xml })).rejects.toThrow('already has an embedded invoice (old.xml)')
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

  it('accepts an indirect null /Perms', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage()
    pdf.catalog.set(PDFName.of('Perms'), pdf.context.register(PDFNull))

    await expect(generate({ pdf, xml: await readFile(SOURCE_XML, 'utf8') })).resolves.toBeInstanceOf(Uint8Array)
  })

  it('checks a field DAG with many distinct inherited /FT values in linear time', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage()
    // 5 layers of 300 nodes, each linked to every node of the next layer, each with its own /FT:
    // keyed by the inherited /FT itself, the walk would visit each node once per parent (~10^8).
    let layer = Array.from({ length: 300 }, () => pdf.context.register(pdf.context.obj({ FT: 'Tx' })))
    const top = layer
    for (let depth = 1; depth < 5; depth++) {
      const next = Array.from({ length: 300 }, (_, i) => pdf.context.register(pdf.context.obj({ FT: `T${depth}_${i}` })))
      for (const ref of layer)
        pdf.context.lookup(ref, PDFDict).set(PDFName.of('Kids'), pdf.context.obj(next))
      layer = next
    }
    pdf.catalog.set(PDFName.of('AcroForm'), pdf.context.obj({ Fields: top }))

    const started = Date.now()
    await expect(generate({ pdf, xml: await readFile(SOURCE_XML, 'utf8') })).resolves.toBeInstanceOf(Uint8Array)
    expect(Date.now() - started).toBeLessThan(3000)
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

  it('escapes the values it writes into the XMP packet (CG-03)', async () => {
    // A seller name with markup, as it reads once the invoice XML is parsed: it must stay text
    // and must not add a second fx:ConformanceLevel.
    const seller = 'Dupont & Fils <x/> "A" \'B\' </rdf:li></rdf:Seq></dc:creator></rdf:Description><rdf:Description xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#" rdf:about=""><fx:ConformanceLevel>EXTENDED</fx:ConformanceLevel></rdf:Description><rdf:Description><dc:creator><rdf:Seq><rdf:li>'
    const escaped = seller.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const xml = (await readFile(SOURCE_XML, 'utf8')).replace('<ram:Name>Au bon moulin</ram:Name>', `<ram:Name>${escaped}</ram:Name>`)
    expect(xml).toContain(escaped)

    const output = await PDFDocument.load(await generate({ pdf: await sourcePdf(), xml }))
    const xmp = readXmp(output)

    expect(xmp.conformanceLevel).toEqual(['EN 16931'])
    expect(xmp.creator).toEqual([seller])
    expect(xmp.title).toHaveLength(1)
    expect(xmp.title[0]).toMatch(new RegExp(`^${seller.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: .* FA-2017-0010$`))
    expect(xmp.description[0]).toContain(seller)
  })

  it('escapes caller-supplied metadata and drops characters XML 1.0 cannot carry (CG-03)', async () => {
    const xml = await readFile(SOURCE_XML, 'utf8')
    const meta = {
      title: 'A & B <c> "d" \'e\'',
      subject: '</rdf:li><fx:ConformanceLevel>EXTENDED</fx:ConformanceLevel><rdf:li>',
      author: 'Ctrl\u0000\u0001\u001F char',
      keywords: [],
      date: new Date('2026-01-02T03:04:05Z'),
    }

    const output = await PDFDocument.load(await generate({ pdf: await sourcePdf(), xml, meta }))
    const xmp = readXmp(output)

    expect(xmp.conformanceLevel).toEqual(['EN 16931'])
    expect(xmp.title).toEqual([meta.title])
    expect(xmp.description).toEqual([meta.subject])
    expect(xmp.creator).toEqual(['Ctrl char'])
    // The Info dictionary carries the same value as the XMP.
    expect(output.getAuthor()).toBe('Ctrl char')
    expect(output.getTitle()).toBe(meta.title)
  })

  it('writes the XMP packet as UTF-8 (CG-02)', async () => {
    const seller = 'Société Énergie Dépôt — 0,25 € / kWh 𝄞'
    const xml = (await readFile(SOURCE_XML, 'utf8')).replace('<ram:Name>Au bon moulin</ram:Name>', `<ram:Name>${seller}</ram:Name>`)

    const output = await PDFDocument.load(await generate({ pdf: await sourcePdf(), xml }))
    const stream = output.context.lookup(output.catalog.get(PDFName.of('Metadata')))
    if (!(stream instanceof PDFRawStream))
      throw new Error('No XMP metadata stream')
    const bytes = stream.getContents()

    // Throws on any byte sequence that is not UTF-8 (the Latin-1 `0xE9` written before).
    const packet = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    expect(packet).toContain(seller)
    expect(stream.dict.get(PDFName.of('Length'))?.toString()).toBe(String(bytes.length))
    expect(readXmp(output).creator).toEqual([seller])
  })

  it('rejects the zugferd flavor before touching the PDF (CG-09)', async () => {
    const xml = await readFile(SOURCE_XML, 'utf8')
    const pdf = await PDFDocument.load(await sourcePdf())

    await expect(generate({ pdf, xml, flavor: 'zugferd' })).rejects.toThrow('Cannot generate the "zugferd" flavor')
    // Not marked as used: the same document still takes the invoice as Factur-X.
    await expect(generate({ pdf, xml })).resolves.toBeInstanceOf(Uint8Array)
  })

  it('rejects a ZUGFeRD 1.0 document, auto-detected or under an explicit facturx flavor (CG-09)', async () => {
    const xml = '<rsm:CrossIndustryDocument xmlns:rsm="urn:ferd:CrossIndustryDocument:invoice:1p0"/>'
    const meta = { title: 't', subject: 's', author: 'a', keywords: [], date: new Date('2026-01-02T03:04:05Z') }

    await expect(generate({ pdf: await sourcePdf(), xml })).rejects.toThrow('Cannot generate the "zugferd" flavor')
    await expect(generate({ pdf: await sourcePdf(), xml, flavor: 'facturx', level: 'en16931', meta })).rejects.toThrow('Cannot generate the "zugferd" flavor')
  })

  describe('fx:ConformanceLevel is never empty (BR-HYBRID-07, CG-30)', () => {
    const MINIMUM_XML = resolve(import.meta.dirname, '../examples/Facture_FR_MINIMUM.xml')
    // Each spelling is paired with an invoice whose BT-24 names that profile: an explicit level must
    // match it (BR-HYBRID-15, see the CG-42 tests below).
    async function invoiceFor(profile: string): Promise<string> {
      if (profile === 'minimum')
        return readFile(MINIMUM_XML, 'utf8')
      const xml = await readFile(SOURCE_XML, 'utf8')
      // BT-24 values of Factur-X 1.09 §7 (BASIC WL is not EN 16931 compliant, EXTENDED is conformant).
      const ids: Record<string, string> = { basicwl: 'urn:factur-x.eu:1p0:basicwl', extended: 'urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended' }
      return profile === 'en16931' ? xml : xml.replace('urn:cen.eu:en16931:2017', ids[profile]!)
    }

    it.each([
      ['minimum', 'minimum', 'MINIMUM'],
      ['MINIMUM', 'minimum', 'MINIMUM'],
      ['BASIC WL', 'basicwl', 'BASIC WL'],
      ['BASICWL', 'basicwl', 'BASIC WL'],
      ['basic_wl', 'basicwl', 'BASIC WL'],
      ['EN 16931', 'en16931', 'EN 16931'],
      [' Extended ', 'extended', 'EXTENDED'],
    ])('accepts the level %j (BT-24 %s) and writes %j', async (level, profile, expected) => {
      const xml = await invoiceFor(profile)
      const output = await PDFDocument.load(await generate({ pdf: await sourcePdf(), xml, level }))
      expect(readXmp(output).conformanceLevel).toEqual([expected])
    })

    it('treats a blank level like no level (auto-detected)', async () => {
      const output = await PDFDocument.load(await generate({ pdf: await sourcePdf(), xml: await readFile(SOURCE_XML, 'utf8'), level: '   ' }))
      expect(readXmp(output).conformanceLevel).toEqual(['EN 16931'])
    })

    it('rejects an auto-detected level the flavor has no conformance level for', async () => {
      const xml = (await readFile(SOURCE_XML, 'utf8')).replace('urn:cen.eu:en16931:2017', 'urn:factur-x.eu:1p0:comfort')
      await expect(generate({ pdf: await sourcePdf(), xml })).rejects.toThrow('Unknown level "comfort" for the facturx flavor')
    })

    it('rejects an unknown level before touching the PDF', async () => {
      const xml = await readFile(SOURCE_XML, 'utf8')
      const pdf = await PDFDocument.load(await sourcePdf())

      await expect(generate({ pdf, xml, level: 'comfort' })).rejects.toThrow('Unknown level "comfort" for the facturx flavor: expected one of basic, basicwl, en16931, extended, minimum')
      await expect(generate({ pdf, xml, level: 'XRECHNUNG' })).rejects.toThrow('Unknown level "xrechnung" for the facturx flavor')
      // Not marked as used: the same document still takes the invoice.
      const output = await PDFDocument.load(await generate({ pdf, xml }))
      expect(readXmp(output).conformanceLevel).toEqual(['EN 16931'])
    })

    it.each(['constructor', 'toString', '__proto__'])('reports an inherited property name as flavor %j as an unknown flavor', async (flavor) => {
      const xml = await readFile(SOURCE_XML, 'utf8')
      await expect(generate({ pdf: await sourcePdf(), xml, flavor, level: 'en16931' })).rejects.toThrow(`Unknown schema flavor: "${flavor}"`)
    })

    it('still refuses EXTENDED-CTC-FR, whatever its spelling', async () => {
      const xml = await readFile(SOURCE_XML, 'utf8')
      await expect(generate({ pdf: await sourcePdf(), xml, level: 'EXTENDED-CTC-FR' })).rejects.toThrow('Cannot generate a Factur-X PDF for the EXTENDED-CTC-FR profile')
    })
  })

  describe('an explicit level must match the guideline ID BT-24 (BR-HYBRID-15, CG-42)', () => {
    it('rejects a Factur-X level that contradicts BT-24, before touching the PDF', async () => {
      const xml = await readFile(SOURCE_XML, 'utf8')
      const pdf = await PDFDocument.load(await sourcePdf())

      await expect(generate({ pdf, xml, level: 'minimum' }))
        .rejects
        .toThrow('level "minimum" does not match the profile declared by the document ("en16931"): generate() writes fx:ConformanceLevel for the embedded XML\'s own profile (BR-HYBRID-15)')
      await expect(generate({ pdf, xml, level: 'BASIC WL' })).rejects.toThrow('level "basicwl" does not match the profile declared by the document ("en16931")')
      // Not marked as used: the matching level still works on the same document.
      const output = await PDFDocument.load(await generate({ pdf, xml, level: 'EN 16931' }))
      expect(readXmp(output).conformanceLevel).toEqual(['EN 16931'])
    })

    it('rejects an Order-X level that contradicts BT-24', async () => {
      const order = await readFile(resolve(import.meta.dirname, '../examples/ORDER-X_EX11_ORDER_PICK-UP-BASIC.xml'), 'utf8')
      const pdf = await PDFDocument.create()
      pdf.addPage()
      await expect(generate({ pdf, xml: order, level: 'comfort' })).rejects.toThrow('level "comfort" does not match the profile declared by the document ("basic")')
    })

    it('rejects an explicit level when BT-24 names no level it can be compared with', async () => {
      const xml = (await readFile(SOURCE_XML, 'utf8')).replace('urn:cen.eu:en16931:2017', 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0')
      await expect(generate({ pdf: await sourcePdf(), xml, level: 'en16931' })).rejects.toThrow('Unknown level: "kosit"')
    })

    it('rejects an explicit level when the document has no BT-24 at all', async () => {
      const xml = (await readFile(SOURCE_XML, 'utf8')).replace(/<ram:GuidelineSpecifiedDocumentContextParameter>[\s\S]*?<\/ram:GuidelineSpecifiedDocumentContextParameter>/, '')
      await expect(generate({ pdf: await sourcePdf(), xml, level: 'en16931' })).rejects.toThrow('No ID found in the document')
    })

    it.each([
      ['basic', 'urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic'],
      ['extended', 'urn:cen.eu:en16931:2017#conformant#urn:zugferd.de:2p0:extended'],
    ])('accepts the explicit level %j for BT-24 %s', async (level, id) => {
      const xml = (await readFile(SOURCE_XML, 'utf8')).replace('urn:cen.eu:en16931:2017', id)
      const output = await PDFDocument.load(await generate({ pdf: await sourcePdf(), xml, level }))
      expect(readXmp(output).conformanceLevel).toEqual([level.toUpperCase()])
    })

    // Every guideline ID (BT-24) the vendored code lists allow (`<cl id="1">` of each profile's codedb)
    // must be accepted with its matching explicit level, so the check never refuses a valid document.
    const CODEDB: Record<string, [string, string]> = {
      minimum: ['minimum/FACTUR-X_MINIMUM_codedb.xml', 'MINIMUM'],
      basicwl: ['basicwl/FACTUR-X_BASIC-WL_codedb.xml', 'BASIC WL'],
      basic: ['basic/FACTUR-X_BASIC_codedb.xml', 'BASIC'],
      en16931: ['en16931/FACTUR-X_EN16931_codedb.xml', 'EN 16931'],
      extended: ['extended/FACTUR-X_EXTENDED_codedb.xml', 'EXTENDED'],
    }
    it.each(Object.entries(CODEDB))('accepts every %s guideline ID of the vendored codedb with its matching level', async (level, [file, expected]) => {
      const doc = XmlDocument.fromString(await readFile(resolve(import.meta.dirname, '../src/lib/xsd/facturx', file), 'utf8'))
      let ids: string[]
      try {
        ids = doc.find('/codedb/cl[@id="1"]/enumeration/@value').map(node => node.content)
      }
      finally {
        doc.dispose()
      }
      expect(ids.length).toBeGreaterThan(0)
      const source = await readFile(SOURCE_XML, 'utf8')
      for (const id of ids) {
        expect(id).toMatch(/^urn:/)
        const xml = source.replace('urn:cen.eu:en16931:2017', id)
        const output = await PDFDocument.load(await generate({ pdf: await sourcePdf(), xml, level }))
        expect(readXmp(output).conformanceLevel, id).toEqual([expected])
      }
    })

    it('matches the level segment of BT-24 only: check: true (XSD) does not validate BT-24 itself', async () => {
      // BT-24 is an udt:IDType in the XSD; only the Schematron checks it against the profile's code list.
      const xml = (await readFile(resolve(import.meta.dirname, '../examples/Facture_FR_MINIMUM.xml'), 'utf8')).replace('urn:factur-x.eu:1p0:minimum', 'urn:example:minimum')
      const pdf = await PDFDocument.create()
      pdf.addPage()
      await expect(generate({ pdf, xml, level: 'minimum', check: true })).resolves.toBeInstanceOf(Uint8Array)
      expect((await check({ xml, schematron: true })).schematronErrors?.map(e => e.message)).toContain('Value of \'ram:ID\' is not allowed.')
    })

    it('still reports an unknown flavor as such, whatever the level', async () => {
      const xml = await readFile(SOURCE_XML, 'utf8')
      await expect(generate({ pdf: await sourcePdf(), xml, flavor: 'foo', level: 'x' })).rejects.toThrow('Unknown schema flavor: "foo"')
    })
  })

  describe('order-X hybrid metadata (BR-HYBRID-06/07, CG-08)', () => {
    const ORDER_XML = resolve(import.meta.dirname, '../examples/ORDER-X_EX11_ORDER_PICK-UP-BASIC.xml')

    async function orderPdf(xml: string, level?: string): Promise<PDFDocument> {
      const pdf = await PDFDocument.create()
      pdf.addPage()
      return PDFDocument.load(await generate({ pdf, xml, level }))
    }

    it('writes ORDER and the Order-X level detected from the guideline ID', async () => {
      const output = await orderPdf(await readFile(ORDER_XML, 'utf8'))
      const xmp = readXmp(output)
      expect(xmp.documentType).toEqual(['ORDER'])
      expect(xmp.conformanceLevel).toEqual(['BASIC'])
      expect((await extract({ pdf: Buffer.from(await output.save()) })).filename).toBe('order-x.xml')
    })

    it.each([
      ['230', 'ORDER_CHANGE'],
      ['231', 'ORDER_RESPONSE'],
    ])('writes the document type of message type code %s as %s', async (code, expected) => {
      const xml = (await readFile(ORDER_XML, 'utf8')).replace('<ram:TypeCode>220</ram:TypeCode>', `<ram:TypeCode>${code}</ram:TypeCode>`)
      expect(readXmp(await orderPdf(xml)).documentType).toEqual([expected])
    })

    it.each([
      ['comfort', 'comfort', 'COMFORT'],
      ['EXTENDED', 'extended', 'EXTENDED'],
      [' Basic ', 'basic', 'BASIC'],
    ])('writes an explicit Order-X level %j (BT-24 %s) as %j', async (level, profile, expected) => {
      const xml = (await readFile(ORDER_XML, 'utf8')).replace('urn:order-x.eu:1p0:basic', `urn:order-x.eu:1p0:${profile}`)
      expect(readXmp(await orderPdf(xml, level)).conformanceLevel).toEqual([expected])
    })

    it('rejects a Factur-X-only level and an unknown message type code before touching the PDF', async () => {
      const order = await readFile(ORDER_XML, 'utf8')
      const pdf = await PDFDocument.create()
      pdf.addPage()

      await expect(generate({ pdf, xml: order, level: 'en16931' })).rejects.toThrow('Unknown level "en16931" for the orderx flavor: expected one of basic, comfort, extended')
      await expect(generate({ pdf, xml: order.replace('<ram:TypeCode>220</ram:TypeCode>', '<ram:TypeCode>380</ram:TypeCode>') }))
        .rejects
        .toThrow('Cannot generate an Order-X PDF for the message type code "380"')
      // Not marked as used.
      await expect(generate({ pdf, xml: order })).resolves.toBeInstanceOf(Uint8Array)
    })

    it('still writes INVOICE for a Factur-X invoice', async () => {
      const output = await PDFDocument.load(await generate({ pdf: await sourcePdf(), xml: await readFile(SOURCE_XML, 'utf8') }))
      expect(readXmp(output).documentType).toEqual(['INVOICE'])
    })
  })
})
