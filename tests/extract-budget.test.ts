import type { PDFObject, PDFRef } from 'pdf-lib'
import { Buffer } from 'node:buffer'
import { deflateSync } from 'node:zlib'
import { extract } from '@stafyniaksacha/facturx'
import { PDFDocument, PDFName, PDFString } from 'pdf-lib'
import { beforeAll, describe, expect, it } from 'vitest'
import { getEN16931XML } from './fixtures/xml'

// CG-29: extract() used to decode every EmbeddedFiles entry with pdf-lib before matching the file
// name, with no dedup, cap or budget. A 53 KB PDF of 100 file specifications sharing one 50 MB Flate
// stream cost ~7 s and ~2 GB. It now matches on names, then decodes only the match, once, capped.

const MIB = 1024 * 1024
const XML = getEN16931XML()

// Data that is not a zlib stream at all: decoding it as Flate throws, so a test that still succeeds
// with such streams in the tree proves they were never decoded.
const NOT_FLATE = Buffer.from('this is not a zlib stream')

let bomb: Buffer // 129 MiB of zeros, just over the 128 MiB cap, compressed to ~130 KB.
beforeAll(() => {
  bomb = deflateSync(Buffer.alloc(129 * MIB))
})

interface Entry {
  key: string
  /** /F and /UF, the key when omitted. */
  name?: string
  /** The /EF /F stream; none means no /EF at all. */
  stream?: PDFRef
}

function rawStream(pdf: PDFDocument, contents: Uint8Array | string, filter?: string | string[], parms?: Record<string, unknown>): PDFRef {
  const dict: Record<string, unknown> = { Type: 'EmbeddedFile' }
  if (filter)
    dict.Filter = filter
  if (parms)
    dict.DecodeParms = parms
  return pdf.context.register(pdf.context.stream(contents, dict as never))
}

/**
 * A PDF whose EmbeddedFiles name tree holds `entries`, spread over `leaves` /Kids leaves when given
 * (Factur-X §6.2.2 p.27 allows one or two /Kids levels), else one flat /Names array.
 */
async function pdfWith(build: (pdf: PDFDocument) => Entry[], leaves = 0): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  pdf.addPage()
  const pairs: PDFObject[][] = build(pdf).map(({ key, name, stream }) => {
    const spec: Record<string, unknown> = { Type: 'Filespec', F: PDFString.of(name ?? key), UF: PDFString.of(name ?? key) }
    if (stream)
      spec.EF = { F: stream }
    return [PDFString.of(key), pdf.context.register(pdf.context.obj(spec as never))]
  })
  let tree: PDFObject
  if (leaves === 0) {
    tree = pdf.context.obj({ Names: pairs.flat() })
  }
  else {
    const size = Math.ceil(pairs.length / leaves)
    const kids = Array.from({ length: leaves }, (_, idx) =>
      pdf.context.register(pdf.context.obj({ Names: pairs.slice(idx * size, (idx + 1) * size).flat() })))
    tree = pdf.context.obj({ Kids: kids })
  }
  pdf.catalog.set(PDFName.of('Names'), pdf.context.obj({ EmbeddedFiles: tree }))
  return Buffer.from(await pdf.save())
}

describe('extract() decodes only the matching attachment (CG-29)', () => {
  it('never decodes the other entries, however many share one stream', async () => {
    const pdf = await pdfWith((doc) => {
      const shared = rawStream(doc, NOT_FLATE, 'FlateDecode')
      const others = Array.from({ length: 500 }, (_, idx) => ({ key: `other-${idx}.xml`, stream: shared }))
      return [...others, { key: 'factur-x.xml', stream: rawStream(doc, deflateSync(XML), 'FlateDecode') }]
    }, 2)
    const result = await extract({ pdf })
    expect(result.filename).toBe('factur-x.xml')
    expect(Buffer.from(result.bytes).toString('utf8')).toBe(XML)
  })

  it('answers No attachment found without decoding a shared bomb (the CG-29 probe)', async () => {
    const pdf = await pdfWith((doc) => {
      const shared = rawStream(doc, bomb, 'FlateDecode')
      return Array.from({ length: 100 }, (_, idx) => ({ key: `attachment-${idx}.bin`, stream: shared }))
    }, 2)
    const started = performance.now()
    await expect(extract({ pdf })).rejects.toThrow('No attachment found')
    // Was ~7 s and ~2 GB; nothing is inflated now. Generous bound for slow CI.
    expect(performance.now() - started).toBeLessThan(2000)
  })

  it('skips a non-matching file specification without /EF', async () => {
    const pdf = await pdfWith(doc => [
      { key: 'a.txt' },
      { key: 'factur-x.xml', stream: rawStream(doc, deflateSync(XML), 'FlateDecode') },
    ])
    await expect(extract({ pdf })).resolves.toMatchObject({ filename: 'factur-x.xml' })
  })
})

describe('extract() limits and errors on the matching attachment (CG-29)', () => {
  it.each([0, 1, 2])('refuses an invoice over 128 MiB once inflated (%i /Kids leaves)', async (leaves) => {
    const pdf = await pdfWith(doc => [{ key: 'factur-x.xml', stream: rawStream(doc, bomb, 'FlateDecode') }], leaves)
    await expect(extract({ pdf })).rejects.toThrow('The embedded file factur-x.xml is too large: more than 128 MiB once decoded')
  })

  it('refuses an unfiltered invoice over 128 MiB', async () => {
    const pdf = await pdfWith(doc => [{ key: 'factur-x.xml', stream: rawStream(doc, new Uint8Array(128 * MIB + 1)) }])
    await expect(extract({ pdf })).rejects.toThrow('The embedded file factur-x.xml is too large')
  })

  it('throws a library error for a matching file specification without /EF', async () => {
    const pdf = await pdfWith(() => [{ key: 'factur-x.xml' }])
    await expect(extract({ pdf })).rejects.toThrow('Malformed embedded file factur-x.xml: its file specification has no embedded file stream (/EF)')
  })

  it('throws a library error for data that does not inflate', async () => {
    const pdf = await pdfWith(doc => [{ key: 'factur-x.xml', stream: rawStream(doc, NOT_FLATE, 'FlateDecode') }])
    await expect(extract({ pdf })).rejects.toThrow('Cannot decode the embedded file factur-x.xml: invalid zlib header')
  })

  it('throws a library error for an unknown filter or a predictor', async () => {
    const unknown = await pdfWith(doc => [{ key: 'factur-x.xml', stream: rawStream(doc, XML, 'DCTDecode') }])
    await expect(extract({ pdf: unknown })).rejects.toThrow('Cannot decode the embedded file factur-x.xml: unsupported stream filter')
    const predictor = await pdfWith(doc => [{ key: 'factur-x.xml', stream: rawStream(doc, deflateSync(XML), 'FlateDecode', { Predictor: 12 }) }])
    await expect(extract({ pdf: predictor })).rejects.toThrow('Cannot decode the embedded file factur-x.xml: a /Predictor is not supported')
  })

  // pdf-lib decoded these before; they still decode, stage by stage, within the cap.
  it('still decodes the other standard filters and filter chains', async () => {
    const hex = `${Buffer.from(XML).toString('hex')}>`
    const pdf = await pdfWith(doc => [{ key: 'factur-x.xml', stream: rawStream(doc, hex, 'ASCIIHexDecode') }])
    expect(Buffer.from((await extract({ pdf })).bytes).toString('utf8')).toBe(XML)
    const chained = await pdfWith(doc => [{
      key: 'factur-x.xml',
      stream: rawStream(doc, `${deflateSync(XML).toString('hex')}>`, ['ASCIIHexDecode', 'FlateDecode'], { Predictor: 1 }),
    }])
    expect(Buffer.from((await extract({ pdf: chained })).bytes).toString('utf8')).toBe(XML)
  })

  it('refuses a chain whose later stage goes over the cap', async () => {
    const pdf = await pdfWith(doc => [{
      key: 'factur-x.xml',
      stream: rawStream(doc, `${bomb.toString('hex')}>`, ['ASCIIHexDecode', 'FlateDecode']),
    }])
    await expect(extract({ pdf })).rejects.toThrow('The embedded file factur-x.xml is too large')
  })
})

describe('extract() matches /F and /UF after the tree keys (CG-29)', () => {
  it('finds the invoice by /F or /UF when no tree key matches', async () => {
    const pdf = await pdfWith(doc => [
      { key: 'attachment-1', name: 'factur-x.xml', stream: rawStream(doc, deflateSync(XML), 'FlateDecode') },
    ])
    await expect(extract({ pdf })).resolves.toMatchObject({ filename: 'factur-x.xml', flavor: 'facturx' })
  })

  it('prefers a tree key over an earlier /F or /UF', async () => {
    const pdf = await pdfWith(doc => [
      { key: 'attachment-1', name: 'order-x.xml', stream: rawStream(doc, NOT_FLATE, 'FlateDecode') },
      { key: 'factur-x.xml', stream: rawStream(doc, deflateSync(XML), 'FlateDecode') },
    ])
    await expect(extract({ pdf })).resolves.toMatchObject({ filename: 'factur-x.xml', flavor: 'facturx' })
  })
})
