import process from 'node:process'
import { generate } from '@stafyniaksacha/facturx'
import { XmlDocument } from 'libxml2-wasm'
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream, PDFStream, PDFString } from 'pdf-lib'
import { afterEach, describe, expect, it } from 'vitest'
import { getEN16931XML } from './fixtures/xml'

const XMP_NS = {
  pdf: 'http://ns.adobe.com/pdf/1.3/',
  xmp: 'http://ns.adobe.com/xap/1.0/',
  dc: 'http://purl.org/dc/elements/1.1/',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
}

async function blankPdf(): Promise<PDFDocument> {
  const pdf = await PDFDocument.create()
  pdf.addPage()
  return pdf
}

function xmpTexts(pdf: PDFDocument, xpath: string): string[] {
  const stream = pdf.context.lookup(pdf.catalog.get(PDFName.of('Metadata')))
  if (!(stream instanceof PDFRawStream))
    throw new Error('No XMP metadata stream')
  const doc = XmlDocument.fromBuffer(stream.getContents())
  try {
    return doc.find(xpath, XMP_NS).map(node => node.content)
  }
  finally {
    doc.dispose()
  }
}

function infoDict(pdf: PDFDocument): PDFDict {
  return pdf.context.lookup(pdf.context.trailerInfo.Info, PDFDict)
}

function text(value: unknown): string {
  if (value instanceof PDFString || value instanceof PDFHexString)
    return value.decodeText()
  throw new Error(`Not a string: ${value}`)
}

// `D:YYYYMMDDHHmmSSZ` (ISO 32000-1 §7.9.4) in UTC, as pdf-lib writes it.
function pdfDate(value: unknown): Date {
  const match = /^D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(text(value))
  if (!match)
    throw new Error(`Not a UTC PDF date: ${text(value)}`)
  const [, y, mo, d, h, mi, s] = match.map(Number)
  return new Date(Date.UTC(y, mo - 1, d, h, mi, s))
}

// The /Params dictionary of the embedded factur-x.xml stream (§6.2 p.25).
function params(pdf: PDFDocument): PDFDict {
  const af = pdf.catalog.lookup(PDFName.of('AF'), PDFArray)
  const stream = af.lookup(0, PDFDict).lookup(PDFName.of('EF'), PDFDict).lookup(PDFName.of('F'), PDFStream)
  return stream.dict.lookup(PDFName.of('Params'), PDFDict)
}

const ISSUE_DATE = /<udt:DateTimeString format="102">(\d{8})</.exec(getEN16931XML())![1]

describe('generate() dates (CG-25)', () => {
  const tz = process.env.TZ
  afterEach(() => {
    if (tz === undefined)
      delete process.env.TZ
    else
      process.env.TZ = tz
  })

  // Pacific/Kiritimati is UTC+14: a date taken at local midnight there was the previous day in UTC.
  it.each(['UTC', 'Europe/Paris', 'Pacific/Kiritimati'])('uses the generation time in UTC under TZ=%s', async (zone) => {
    process.env.TZ = zone
    const before = Math.floor(Date.now() / 1000) * 1000
    const bytes = await generate({ pdf: await blankPdf(), xml: getEN16931XML() })
    const after = Date.now()
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false })
    const info = infoDict(pdf)

    const created = pdfDate(info.get(PDFName.of('CreationDate')))
    expect(created.getTime()).toBeGreaterThanOrEqual(before)
    expect(created.getTime()).toBeLessThanOrEqual(after)
    expect(pdfDate(info.get(PDFName.of('ModDate')))).toEqual(created)

    // Embedded file /Params dates.
    expect(pdfDate(params(pdf).get(PDFName.of('CreationDate')))).toEqual(created)
    expect(pdfDate(params(pdf).get(PDFName.of('ModDate')))).toEqual(created)

    // XMP dates: the same instant, written in UTC.
    const iso = `${created.toISOString().split('.')[0]}Z`
    for (const property of ['CreateDate', 'ModifyDate', 'MetadataDate'])
      expect(xmpTexts(pdf, `//xmp:${property}`)).toEqual([iso])

    // The issue date (BT-2) stays a calendar date in the subject, whatever the time zone.
    expect(pdf.getSubject()).toContain(`dated ${ISSUE_DATE}`)
    expect(xmpTexts(pdf, '//dc:description/rdf:Alt/rdf:li')[0]).toContain(`dated ${ISSUE_DATE}`)
  })

  it('keeps a date passed in meta', async () => {
    const date = new Date(Date.UTC(2026, 0, 31, 12, 34, 56))
    const bytes = await generate({
      pdf: await blankPdf(),
      xml: getEN16931XML(),
      meta: { author: 'a', title: 't', subject: 's', keywords: [], date },
    })
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false })
    expect(pdfDate(infoDict(pdf).get(PDFName.of('CreationDate')))).toEqual(date)
    expect(xmpTexts(pdf, '//xmp:CreateDate')).toEqual(['2026-01-31T12:34:56Z'])
    expect(pdfDate(params(pdf).get(PDFName.of('ModDate')))).toEqual(date)
  })
})

// Info dictionary and XMP carry the same Producer and Keywords (CG-04).
describe('generate() Info / XMP consistency (CG-04)', () => {
  it('derived from the XML', async () => {
    const pdf = await PDFDocument.load(await generate({ pdf: await blankPdf(), xml: getEN16931XML() }), { updateMetadata: false })
    expect(pdf.getProducer()).toMatch(/^@stafyniaksacha\/facturx npm lib v/)
    expect(xmpTexts(pdf, '//pdf:Producer')).toEqual([pdf.getProducer()])
    expect(xmpTexts(pdf, '//xmp:CreatorTool')).toEqual([pdf.getCreator()])
    expect(pdf.getKeywords()).toBe('Invoice Factur-X')
    expect(xmpTexts(pdf, '//pdf:Keywords')).toEqual([pdf.getKeywords()])
  })

  it('with keywords that need escaping and are not ASCII', async () => {
    const keywords = ['Société', 'Dupont & Fils', '<SARL>', '€']
    const bytes = await generate({
      pdf: await blankPdf(),
      xml: getEN16931XML(),
      meta: { author: 'a', title: 't', subject: 's', keywords, date: new Date() },
    })
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false })
    expect(pdf.getKeywords()).toBe(keywords.join(' '))
    expect(xmpTexts(pdf, '//pdf:Keywords')).toEqual([keywords.join(' ')])
  })

  it('overrides the Producer of a PDFDocument pdf-lib already stamped', async () => {
    const source = await blankPdf()
    expect(source.getProducer()).toMatch(/pdf-lib/)
    const pdf = await PDFDocument.load(await generate({ pdf: source, xml: getEN16931XML() }), { updateMetadata: false })
    expect(pdf.getProducer()).toBe(xmpTexts(pdf, '//pdf:Producer')[0])
  })
})
