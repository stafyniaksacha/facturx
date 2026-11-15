import type { PDFObject } from 'pdf-lib'
import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { extract, generate } from '@stafyniaksacha/facturx'
import { PDFDict, PDFDocument, PDFName, PDFNull, PDFNumber, PDFString } from 'pdf-lib'
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

const EXAMPLE_PDF = resolve(import.meta.dirname, '../examples/Facture_FR_EN16931.pdf')

// Factur-X §6.2.2 p.27, §6.4 p.31: "one or two “/Kids” steps level between “/EmbeddedFiles” and
// “/Names”" are allowed. Each test moves the example's EmbeddedFiles /Names array into a leaf.
describe('embeddedFiles name tree with /Kids (CG-13)', () => {
  async function exampleWithKids(levels: number): Promise<Buffer> {
    const pdf = await PDFDocument.load(await readFile(EXAMPLE_PDF))
    const root = pdf.catalog.lookup(PDFName.of('Names'), PDFDict).lookup(PDFName.of('EmbeddedFiles'), PDFDict)
    const names = root.get(PDFName.of('Names'))
    root.delete(PDFName.of('Names'))
    let node = pdf.context.register(pdf.context.obj({ Limits: [PDFString.of('a'), PDFString.of('z')], Names: names }))
    for (let level = 1; level < levels; level++)
      node = pdf.context.register(pdf.context.obj({ Limits: [PDFString.of('a'), PDFString.of('z')], Kids: [node] }))
    root.set(PDFName.of('Kids'), pdf.context.obj([node]))
    return Buffer.from(await pdf.save())
  }

  it.each([1, 2])('extract() finds the invoice under %i /Kids level(s)', async (levels) => {
    const original = await extract({ pdf: await readFile(EXAMPLE_PDF) })
    const result = await extract({ pdf: await exampleWithKids(levels) })
    expect(result.filename).toBe('factur-x.xml')
    expect(result.xml).toBe(original.xml)
  })

  it('extract() refuses three /Kids levels', async () => {
    await expect(extract({ pdf: await exampleWithKids(3) }))
      .rejects
      .toThrow('Unsupported EmbeddedFiles name tree: more than 2 /Kids levels')
  })

  it('generate() still rejects a source whose tree has /Kids', async () => {
    await expect(generate({ pdf: await exampleWithKids(1), xml: getEN16931XML() })).rejects.toThrow('/Kids are not supported')
  })

  it('reads leaves in order across several kids', async () => {
    const doc = await PDFDocument.create()
    doc.addPage()
    const leaf = (name: string, spec = fileSpec(doc, name)): PDFObject => doc.context.register(doc.context.obj({ Names: [PDFString.of(name), spec] }))
    const invoice = doc.context.register(doc.context.obj({
      Type: 'Filespec',
      F: PDFString.of('factur-x.xml'),
      EF: { F: doc.context.register(doc.context.flateStream(new TextEncoder().encode(getEN16931XML()))) },
    }))
    doc.catalog.set(PDFName.of('Names'), doc.context.obj({
      EmbeddedFiles: { Kids: [leaf('a.txt'), doc.context.obj({ Kids: [leaf('b.txt'), leaf('factur-x.xml', invoice)] })] },
    }))
    const result = await extract({ pdf: Buffer.from(await doc.save()) })
    expect(result.filename).toBe('factur-x.xml')
    expect(result.flavor).toBe('facturx')
  })

  async function pdfWithEmbeddedFiles(build: (pdf: PDFDocument) => PDFObject): Promise<Buffer> {
    const doc = await PDFDocument.create()
    doc.addPage()
    doc.catalog.set(PDFName.of('Names'), doc.context.obj({ EmbeddedFiles: build(doc) }))
    return Buffer.from(await doc.save())
  }

  const rejected: [string, (pdf: PDFDocument) => PDFObject, string][] = [
    ['a node with both /Kids and /Names', pdf => pdf.context.obj({ Kids: [], Names: [] }), 'Malformed EmbeddedFiles name tree: a node has both /Kids and /Names'],
    ['a /Kids that is not an array', pdf => pdf.context.obj({ Kids: 1 }), 'Malformed EmbeddedFiles name tree: /Kids is not an array'],
    ['a kid that is not a dictionary', pdf => pdf.context.obj({ Kids: [1] }), 'Malformed EmbeddedFiles name tree: /Kids entry at index 0 is not a dictionary'],
    ['a malformed leaf', pdf => pdf.context.obj({ Kids: [pdf.context.obj({ Names: [PDFString.of('a.txt')] })] }), 'Malformed EmbeddedFiles name tree: /Names has an odd number of entries (1)'],
    ['a cycle', (pdf) => {
      const ref = pdf.context.nextRef()
      pdf.context.assign(ref, pdf.context.obj({ Kids: [ref] }))
      return ref
    }, 'Malformed EmbeddedFiles name tree: a node is reached twice'],
    ['a kid shared by two parents', (pdf) => {
      const leaf = pdf.context.register(pdf.context.obj({ Names: [] }))
      return pdf.context.obj({ Kids: [leaf, leaf] })
    }, 'Malformed EmbeddedFiles name tree: a node is reached twice'],
    ['more than 4096 nodes', pdf => pdf.context.obj({ Kids: Array.from({ length: 5000 }, () => pdf.context.obj({ Names: [] })) }), 'Unsupported EmbeddedFiles name tree: more than 4096 nodes'],
  ]
  for (const [label, build, message] of rejected) {
    it(`extract() and generate() reject ${label}`, async () => {
      const pdf = await pdfWithEmbeddedFiles(build)
      await expect(extract({ pdf })).rejects.toThrow(message)
      await expect(generate({ pdf, xml: getEN16931XML() })).rejects.toThrow(message)
    })
  }
})
