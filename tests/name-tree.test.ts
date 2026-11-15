import type { PDFObject, PDFRawStream } from 'pdf-lib'
import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { extract, generate } from '@stafyniaksacha/facturx'
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNull, PDFNumber, PDFString } from 'pdf-lib'
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

  it('generate() refuses a source with three /Kids levels', async () => {
    const doc = await PDFDocument.create()
    doc.addPage()
    let node = doc.context.register(doc.context.obj({ Names: [PDFString.of('a.txt'), fileSpec(doc, 'a.txt')] }))
    for (let level = 1; level < 3; level++)
      node = doc.context.register(doc.context.obj({ Kids: [node] }))
    doc.catalog.set(PDFName.of('Names'), doc.context.obj({ EmbeddedFiles: { Kids: [node] } }))
    await expect(generate({ pdf: Buffer.from(await doc.save()), xml: getEN16931XML() }))
      .rejects
      .toThrow('Unsupported EmbeddedFiles name tree: more than 2 /Kids levels')
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

// CG-13: generate() inserts the invoice into a leaf of a tree with one or two /Kids levels (Factur-X
// §6.2.2 p.27, §6.4 p.31) instead of appending a /Names array next to the root /Kids, and keeps the
// tree valid: sorted keys and /Limits = [least, greatest] on every leaf and intermediate node, none
// on the root (ISO 32000-1 §7.9.6 Table 36).
describe('generate() into a name tree with /Kids (CG-13)', () => {
  type Key = PDFString | PDFHexString
  interface TreeNode { keys: Key[], limits?: Key[], kids?: TreeNode[], dict: PDFDict }

  function readNode(pdf: PDFDocument, dict: PDFDict): TreeNode {
    const limits = dict.lookup(PDFName.of('Limits'))
    const node: TreeNode = { keys: [], dict, limits: limits instanceof PDFArray ? limits.asArray().map(k => pdf.context.lookup(k) as Key) : undefined }
    const kids = dict.lookup(PDFName.of('Kids'))
    if (kids instanceof PDFArray) {
      expect(dict.has(PDFName.of('Names'))).toBe(false)
      node.kids = kids.asArray().map(kid => readNode(pdf, pdf.context.lookup(kid) as PDFDict))
      node.keys = node.kids.flatMap(kid => kid.keys)
      return node
    }
    const names = dict.lookup(PDFName.of('Names'))
    if (names instanceof PDFArray) {
      for (let i = 0; i < names.size(); i += 2)
        node.keys.push(pdf.context.lookup(names.get(i)) as Key)
    }
    return node
  }

  const bytes = (key: Key): Buffer => Buffer.from(key.asBytes())

  // Every non-root node with keys has /Limits = [least, greatest] of its keys; the root has none;
  // keys are sorted (as bytes) in tree order. Returns the decoded keys, in tree order.
  async function validTree(output: Uint8Array): Promise<{ pdf: PDFDocument, root: TreeNode, keys: string[] }> {
    const pdf = await PDFDocument.load(output)
    const rootDict = pdf.catalog.lookup(PDFName.of('Names'), PDFDict).lookup(PDFName.of('EmbeddedFiles'), PDFDict)
    const root = readNode(pdf, rootDict)
    expect(root.limits).toBeUndefined()
    const check = (node: TreeNode): void => {
      if (node.keys.length > 0) {
        const sorted = [...node.keys].sort((a, b) => Buffer.compare(bytes(a), bytes(b)))
        expect(node.limits?.map(bytes)).toEqual([bytes(sorted[0]), bytes(sorted[sorted.length - 1])])
      }
      node.kids?.forEach(check)
    }
    root.kids?.forEach(check)
    const all = root.keys.map(bytes)
    expect(all).toEqual([...all].sort(Buffer.compare))
    return { pdf, root, keys: root.keys.map(key => key.decodeText()) }
  }

  // Every key resolves to a file specification whose embedded stream holds `content` (the leaf
  // contents of the source), so the other attachments stay reachable.
  function contentOf(pdf: PDFDocument, root: TreeNode, name: string): string {
    const leaves: TreeNode[] = []
    const collect = (node: TreeNode): void => {
      if (node.kids)
        node.kids.forEach(collect)
      else leaves.push(node)
    }
    collect(root)
    for (const leaf of leaves) {
      const names = leaf.dict.lookup(PDFName.of('Names'), PDFArray)
      for (let i = 0; i < names.size(); i += 2) {
        if ((pdf.context.lookup(names.get(i)) as Key).decodeText() === name) {
          const spec = pdf.context.lookup(names.get(i + 1), PDFDict)
          const stream = spec.lookup(PDFName.of('EF'), PDFDict).lookup(PDFName.of('F')) as PDFRawStream
          return Buffer.from(stream.getContents()).toString('latin1')
        }
      }
    }
    throw new Error(`${name} not found`)
  }

  const plainSpec = (doc: PDFDocument, name: string): PDFObject => doc.context.register(doc.context.obj({
    Type: 'Filespec',
    F: PDFString.of(name),
    UF: PDFString.of(name),
    EF: { F: doc.context.register(doc.context.stream(name)) },
  }))
  const leaf = (doc: PDFDocument, ...names: string[]): PDFObject => doc.context.register(doc.context.obj({
    // Deliberately wrong /Limits: the source's are untrusted and must be recomputed.
    Limits: [PDFString.of('a'), PDFString.of('z')],
    Names: names.flatMap(name => [PDFString.of(name), plainSpec(doc, name)]),
  }))
  const intermediate = (doc: PDFDocument, ...kids: PDFObject[]): PDFObject => doc.context.register(doc.context.obj({
    Limits: [PDFString.of('a'), PDFString.of('z')],
    Kids: kids,
  }))

  async function source(build: (doc: PDFDocument) => PDFObject[]): Promise<PDFDocument> {
    const doc = await PDFDocument.create()
    doc.addPage()
    doc.catalog.set(PDFName.of('Names'), doc.context.obj({ EmbeddedFiles: { Kids: build(doc) } }))
    return doc
  }

  async function generateInto(doc: PDFDocument): Promise<{ output: Uint8Array, pdf: PDFDocument, root: TreeNode, keys: string[] }> {
    const output = await generate({ pdf: Buffer.from(await doc.save()), xml: getEN16931XML() })
    // `check: true` throws unless the embedded invoice is XSD valid.
    const result = await extract({ pdf: Buffer.from(output), check: true })
    expect(result.filename).toBe('factur-x.xml')
    return { output, ...await validTree(output) }
  }

  it('one /Kids level: the last position of a leaf', async () => {
    const { pdf, root, keys } = await generateInto(await source(doc => [leaf(doc, 'a.txt', 'b.txt'), leaf(doc, 'y.txt', 'z.txt')]))
    expect(keys).toEqual(['a.txt', 'b.txt', 'factur-x.xml', 'y.txt', 'z.txt'])
    expect(root.kids!.map(kid => kid.keys.map(key => key.decodeText()))).toEqual([['a.txt', 'b.txt', 'factur-x.xml'], ['y.txt', 'z.txt']])
    for (const name of ['a.txt', 'b.txt', 'y.txt', 'z.txt'])
      expect(contentOf(pdf, root, name)).toBe(name)
  })

  it('one /Kids level: the first position of a leaf', async () => {
    const { root, keys } = await generateInto(await source(doc => [leaf(doc, 'g.txt', 'h.txt'), leaf(doc, 'x.txt')]))
    expect(keys).toEqual(['factur-x.xml', 'g.txt', 'h.txt', 'x.txt'])
    expect(root.kids![0].keys.map(key => key.decodeText())).toEqual(['factur-x.xml', 'g.txt', 'h.txt'])
  })

  it('two /Kids levels: the leaf and its intermediate node get correct /Limits', async () => {
    const { pdf, root, keys } = await generateInto(await source(doc => [
      intermediate(doc, leaf(doc, 'a.txt'), leaf(doc, 'c.txt')),
      intermediate(doc, leaf(doc, 'm.txt')),
    ]))
    expect(keys).toEqual(['a.txt', 'c.txt', 'factur-x.xml', 'm.txt'])
    expect(root.kids![0].kids![1].keys.map(key => key.decodeText())).toEqual(['c.txt', 'factur-x.xml'])
    expect(root.kids![0].limits!.map(key => key.decodeText())).toEqual(['a.txt', 'factur-x.xml'])
    for (const name of ['a.txt', 'c.txt', 'm.txt'])
      expect(contentOf(pdf, root, name)).toBe(name)
  })

  it('mixed depths: a leaf and an intermediate node under the root', async () => {
    const { keys } = await generateInto(await source(doc => [leaf(doc, 'a.txt'), intermediate(doc, leaf(doc, 'p.txt'))]))
    expect(keys).toEqual(['a.txt', 'factur-x.xml', 'p.txt'])
  })

  it('keeps the invoice in the /AF array (PDF/A-3, Factur-X §6.2.1 p.25)', async () => {
    const { pdf, root } = await generateInto(await source(doc => [leaf(doc, 'a.txt')]))
    const af = pdf.catalog.lookup(PDFName.of('AF'), PDFArray)
    const names = root.kids![0].dict.lookup(PDFName.of('Names'), PDFArray)
    const at = names.asArray().findIndex((key, i) => i % 2 === 0 && (pdf.context.lookup(key) as Key).decodeText() === 'factur-x.xml')
    const invoice = names.get(at + 1)
    expect(af.asArray()).toContainEqual(invoice)
    expect(pdf.context.lookup(invoice, PDFDict).get(PDFName.of('AFRelationship'))).toBe(PDFName.of('Data'))
  })

  it.each([
    ['an empty /Kids array', (_doc: PDFDocument) => [] as PDFObject[]],
    ['a kid with neither /Names nor /Kids', (doc: PDFDocument) => [doc.context.register(doc.context.obj({}))]],
    ['an empty leaf', (doc: PDFDocument) => [doc.context.register(doc.context.obj({ Limits: [PDFString.of('a'), PDFString.of('a')], Names: [] }))]],
    ['an intermediate node with an empty /Kids', (doc: PDFDocument) => [doc.context.obj({ Kids: [] })]],
    ['direct kids', (doc: PDFDocument) => [doc.context.obj({ Names: [PDFString.of('a.txt'), plainSpec(doc, 'a.txt')] })]],
  ])('%s', async (_, build) => {
    const { keys } = await generateInto(await source(build))
    expect(keys).toContain('factur-x.xml')
  })

  it('drops a /Limits the source put on the root', async () => {
    const doc = await source(d => [leaf(d, 'a.txt')])
    doc.catalog.lookup(PDFName.of('Names'), PDFDict).lookup(PDFName.of('EmbeddedFiles'), PDFDict).set(PDFName.of('Limits'), doc.context.obj([PDFString.of('a'), PDFString.of('z')]))
    const { keys } = await generateInto(doc) // validTree() expects no root /Limits.
    expect(keys).toEqual(['a.txt', 'factur-x.xml'])
  })

  it('drops a /Limits the source put on the root of a flat tree', async () => {
    const doc = await PDFDocument.create()
    doc.addPage()
    doc.catalog.set(PDFName.of('Names'), doc.context.obj({
      EmbeddedFiles: { Limits: [PDFString.of('a'), PDFString.of('z')], Names: [PDFString.of('a.txt'), plainSpec(doc, 'a.txt')] },
    }))
    const output = await PDFDocument.load(await generate({ pdf: Buffer.from(await doc.save()), xml: getEN16931XML() }))
    const root = output.catalog.lookup(PDFName.of('Names'), PDFDict).lookup(PDFName.of('EmbeddedFiles'), PDFDict)
    expect(root.has(PDFName.of('Limits'))).toBe(false)
  })

  it('writes the invoice key in the encoding of the other keys', async () => {
    // PDFDocEncoded source keys: the invoice key is written as one too, so keys compare as bytes.
    const plain = await generateInto(await source(doc => [leaf(doc, 'a.txt')]))
    expect(plain.root.keys.find(key => key.decodeText() === 'factur-x.xml')).toBeInstanceOf(PDFString)
    // UTF-16BE source keys: the invoice key stays UTF-16BE, as pdf-lib writes it.
    const utf16 = await generateInto(await source(doc => [doc.context.obj({
      Names: [PDFHexString.fromText('a.txt'), plainSpec(doc, 'a.txt'), PDFHexString.fromText('z.txt'), plainSpec(doc, 'z.txt')],
    })]))
    expect(utf16.keys).toEqual(['a.txt', 'factur-x.xml', 'z.txt'])
    const invoiceKey = utf16.root.keys.find(key => key.decodeText() === 'factur-x.xml')!
    expect([...invoiceKey.asBytes().subarray(0, 2)]).toEqual([0xFE, 0xFF])
  })

  it('moves attachments the caller queued with attach() into a leaf too', async () => {
    const doc = await source(d => [leaf(d, 'a.txt')])
    await doc.attach(new TextEncoder().encode('queued'), 'q.txt', { mimeType: 'text/plain' })
    const output = await generate({ pdf: doc, xml: getEN16931XML() })
    const { pdf, root, keys } = await validTree(output)
    expect(keys).toEqual(['a.txt', 'factur-x.xml', 'q.txt'].sort((a, b) => {
      // q.txt is UTF-16BE (pdf-lib), so it sorts after the PDFDocEncoded keys.
      const enc = (name: string): Buffer => name === 'q.txt' ? Buffer.from(PDFHexString.fromText(name).asBytes()) : Buffer.from(name, 'latin1')
      return Buffer.compare(enc(a), enc(b))
    }))
    expect((await extract({ pdf: Buffer.from(output) })).filename).toBe('factur-x.xml')
    expect(contentOf(pdf, root, 'a.txt')).toBe('a.txt')
  })

  // The reader bounds nodes, not keys: a leaf with 200000 keys (one shared file specification) must
  // not overflow the stack when the keys are collected (CodeRabbit on #75).
  it('handles a leaf with 200000 keys', async () => {
    const doc = await source((d) => {
      const spec = plainSpec(d, 'a.txt')
      const names: PDFObject[] = []
      for (let i = 0; i < 200_000; i++)
        names.push(PDFString.of(`k${String(i).padStart(6, '0')}`), spec)
      return [d.context.obj({ Names: names })]
    })
    const output = await generate({ pdf: Buffer.from(await doc.save()), xml: getEN16931XML() })
    expect((await extract({ pdf: Buffer.from(output) })).filename).toBe('factur-x.xml')
  })

  it('refuses to grow a tree past 4096 nodes, which extract() would refuse', async () => {
    // Root + 4095 intermediate nodes with an empty /Kids: a new leaf would be node 4097.
    const doc = await source(d => Array.from({ length: 4095 }, () => d.context.obj({ Kids: [] })))
    await expect(generate({ pdf: Buffer.from(await doc.save()), xml: getEN16931XML() }))
      .rejects
      .toThrow('Unsupported EmbeddedFiles name tree: more than 4096 nodes')
    // One node fewer: the new leaf is node 4096, which both accept.
    const { keys } = await generateInto(await source(d => Array.from({ length: 4094 }, () => d.context.obj({ Kids: [] }))))
    expect(keys).toEqual(['factur-x.xml'])
  })
})
