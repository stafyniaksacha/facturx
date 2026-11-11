import type { PDFObject } from 'pdf-lib'
import { Buffer } from 'node:buffer'
import { extract, generate } from '@stafyniaksacha/facturx'
import { PDFDocument, PDFName, PDFNull, PDFNumber, PDFString } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { getEN16931XML } from './fixtures/xml'

// A PDF whose catalog /Names /EmbeddedFiles /Names array holds exactly `entries`.
// Built in memory so no binary fixture is committed (issue #40).
async function pdfWithEmbeddedFilesNames(
  build: (pdf: PDFDocument) => PDFObject[],
): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  pdf.addPage()
  const entries = build(pdf)
  pdf.catalog.set(PDFName.of('Names'), pdf.context.obj({
    EmbeddedFiles: { Names: pdf.context.obj(entries) },
  }))
  return Buffer.from(await pdf.save())
}

function fileSpec(pdf: PDFDocument, name: string): PDFObject {
  const stream = pdf.context.flateStream('hello')
  return pdf.context.register(pdf.context.obj({
    Type: 'Filespec',
    F: PDFString.of(name),
    UF: PDFString.of(name),
    EF: { F: pdf.context.register(stream) },
  }))
}

// [label, entries, expected reason]. The reason never contains a key or value (personal data).
const malformed: [string, (pdf: PDFDocument) => PDFObject[], string][] = [
  ['an odd-length /Names array', () => [PDFString.of('orphan.txt')], '/Names has an odd number of entries (1)'],
  ['a value that is not a dictionary', () => [PDFString.of('a.txt'), PDFNumber.of(42)], 'value at index 1 is not a dictionary'],
  ['a null value', () => [PDFString.of('a.txt'), PDFNull], 'value at index 1 is not a dictionary'],
  // ISO 32000-1 §7.9.6: name-tree keys are strings, so a /Name key is rejected too.
  ['a /Name key', pdf => [PDFName.of('a.txt'), fileSpec(pdf, 'a.txt')], 'key at index 0 is not a string'],
  ['a number key', pdf => [PDFNumber.of(1), fileSpec(pdf, 'a.txt')], 'key at index 0 is not a string'],
]

describe('malformed EmbeddedFiles name tree (#40)', () => {
  for (const [label, build, reason] of malformed) {
    const message = `Malformed EmbeddedFiles name tree: ${reason}`

    it(`extract() rejects ${label} with a clear error`, async () => {
      const pdf = await pdfWithEmbeddedFilesNames(build)
      await expect(extract({ pdf })).rejects.toThrow(message)
    })

    it(`generate() rejects ${label} with a clear error`, async () => {
      const pdf = await pdfWithEmbeddedFilesNames(build)
      await expect(generate({ pdf, xml: getEN16931XML() })).rejects.toThrow(message)
    })
  }

  // The levels above the /Names array: catalog /Names, then /EmbeddedFiles.
  const malformedRoots: [string, (pdf: PDFDocument) => PDFObject, string][] = [
    ['a catalog /Names that is not a dictionary', () => PDFNumber.of(1), 'catalog /Names is not a dictionary'],
    ['an /EmbeddedFiles that is not a dictionary', pdf => pdf.context.obj({ EmbeddedFiles: [] }), '/EmbeddedFiles is not a dictionary'],
    ['a /Names that is not an array', pdf => pdf.context.obj({ EmbeddedFiles: { Names: 1 } }), '/Names is not an array'],
  ]
  for (const [label, build, reason] of malformedRoots) {
    const message = `Malformed EmbeddedFiles name tree: ${reason}`
    it(`extract() and generate() reject ${label} with a clear error`, async () => {
      const doc = await PDFDocument.create()
      doc.addPage()
      doc.catalog.set(PDFName.of('Names'), build(doc))
      const pdf = Buffer.from(await doc.save())
      await expect(extract({ pdf })).rejects.toThrow(message)
      await expect(generate({ pdf, xml: getEN16931XML() })).rejects.toThrow(message)
    })
  }

  it('extract() still reads a well-formed tree', async () => {
    const pdf = await pdfWithEmbeddedFilesNames(pdf => [PDFString.of('a.txt'), fileSpec(pdf, 'a.txt')])
    // The tree is read; it simply holds no Factur-X attachment.
    await expect(extract({ pdf })).rejects.toThrow('No attachment found')
  })

  it('generate() still attaches next to a well-formed tree', async () => {
    const pdf = await pdfWithEmbeddedFilesNames(pdf => [PDFString.of('a.txt'), fileSpec(pdf, 'a.txt')])
    const out = await generate({ pdf, xml: getEN16931XML() })
    const result = await extract({ pdf: Buffer.from(out) })
    expect(result.filename).toBe('factur-x.xml')
  })
})
