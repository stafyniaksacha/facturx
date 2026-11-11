import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { extract, generate, xmlToInvoice } from '@stafyniaksacha/facturx'
import { PDFArray, PDFDocument, PDFHexString, PDFName, PDFRawStream, PDFString } from 'pdf-lib'
import { describe, expect, it } from 'vitest'

// A PDF produced by an office suite: it carries a trailer /ID, like most real-world PDFs.
const SOURCE_PDF = resolve(import.meta.dirname, '../examples/Facture_FR_EN16931.pdf')
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

function xmpPacket(pdf: PDFDocument): string {
  const stream = pdf.context.lookup(pdf.catalog.get(PDFName.of('Metadata')))
  if (!(stream instanceof PDFRawStream))
    throw new Error('No XMP metadata stream')
  return new TextDecoder().decode(stream.getContents())
}

describe('generate', () => {
  it('keeps the permanent /ID of a source PDF that already has one (#37)', async () => {
    const source = await readFile(SOURCE_PDF)
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

  it('writes the fixed XMP packet id, not the document ID (CG-06)', async () => {
    const xml = await readFile(SOURCE_XML, 'utf8')
    const output = await PDFDocument.load(await generate({ pdf: await readFile(SOURCE_PDF), xml }))

    expect(xmpPacket(output)).toMatch(new RegExp(`^<\\?xpacket begin="[^"]*" id="${XMP_PACKET_ID}"\\?>`))
  })
})
