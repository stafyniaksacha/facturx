import { generate } from '@stafyniaksacha/facturx'
import { PDFArray, PDFDict, PDFDocument, PDFName } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { getEN16931XML, getMinimumXML, getOrderXBasicXML } from './fixtures/xml'

async function blankPdf(): Promise<PDFDocument> {
  const pdf = await PDFDocument.create()
  pdf.addPage()
  return pdf
}

// The /AFRelationship of the one file specification in the catalog /AF array (§6.2.2 p.27: the
// array AF sits directly under Root).
async function afRelationship(bytes: Uint8Array): Promise<string | undefined> {
  const pdf = await PDFDocument.load(bytes)
  const af = pdf.catalog.lookup(PDFName.of('AF'), PDFArray)
  expect(af.size()).toBe(1)
  const relationship = af.lookup(0, PDFDict).lookup(PDFName.of('AFRelationship'))
  return relationship instanceof PDFName ? relationship.decodeText() : undefined
}

// Factur-X §6.2.2 table p.27 (BR-HYBRID-11), France column: MINIMUM / BASIC WL Data only;
// BASIC / EN 16931 / EXTENDED Alternative, Source or Data.
describe('generate() afRelationship (CG-07)', () => {
  it('defaults to Data', async () => {
    const out = await generate({ pdf: await blankPdf(), xml: getEN16931XML() })
    expect(await afRelationship(out)).toBe('Data')
  })

  it.each(['Data', 'Alternative', 'Source'] as const)('writes %s for EN 16931', async (value) => {
    const out = await generate({ pdf: await blankPdf(), xml: getEN16931XML(), afRelationship: value })
    expect(await afRelationship(out)).toBe(value)
  })

  it('writes Data for MINIMUM', async () => {
    const out = await generate({ pdf: await blankPdf(), xml: getMinimumXML(), afRelationship: 'Data' })
    expect(await afRelationship(out)).toBe('Data')
  })

  it.each(['Alternative', 'Source'] as const)('rejects %s for MINIMUM', async (value) => {
    await expect(generate({ pdf: await blankPdf(), xml: getMinimumXML(), afRelationship: value }))
      .rejects
      .toThrow(`afRelationship "${value}" is not allowed for the minimum profile: use Data`)
  })

  it('rejects Alternative for an explicit basicwl level', async () => {
    await expect(generate({ pdf: await blankPdf(), xml: getEN16931XML().replace('urn:cen.eu:en16931:2017', 'urn:factur-x.eu:1p0:basicwl'), level: 'basicwl', afRelationship: 'Alternative' }))
      .rejects
      .toThrow('is not allowed for the')
  })

  it.each(['Supplement', 'Unspecified', 'data', ''])('rejects %j, which the table does not list', async (value) => {
    await expect(generate({ pdf: await blankPdf(), xml: getEN16931XML(), afRelationship: value as 'Data' }))
      .rejects
      .toThrow('Invalid afRelationship')
  })

  it('does not restrict Order-X, which has no vendored table', async () => {
    const out = await generate({ pdf: await blankPdf(), xml: getOrderXBasicXML(), afRelationship: 'Alternative' })
    expect(await afRelationship(out)).toBe('Alternative')
  })

  it('validates before touching the PDF', async () => {
    const pdf = await blankPdf()
    await expect(generate({ pdf, xml: getMinimumXML(), afRelationship: 'Source' })).rejects.toThrow('not allowed')
    // The PDFDocument was not marked as used, so a corrected call on it succeeds.
    const out = await generate({ pdf, xml: getMinimumXML() })
    expect(await afRelationship(out)).toBe('Data')
  })
})
