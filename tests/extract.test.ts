import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { extract } from '@stafyniaksacha/facturx'
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString } from 'pdf-lib'
import { describe, expect, it } from 'vitest'

const EXAMPLE_PDF = resolve(import.meta.dirname, '../examples/Facture_FR_EN16931.pdf')

// The example with its factur-x.xml renamed to `name` in the name tree key, /F and /UF.
async function renamedExample(name: string): Promise<Buffer> {
  const pdf = await PDFDocument.load(await readFile(EXAMPLE_PDF))
  const names = pdf.catalog.lookup(PDFName.of('Names'), PDFDict)
    .lookup(PDFName.of('EmbeddedFiles'), PDFDict)
    .lookup(PDFName.of('Names'), PDFArray)
  let renamed = 0
  for (let idx = 0; idx < names.size(); idx += 2) {
    if (names.lookup(idx, PDFString).decodeText() !== 'factur-x.xml')
      continue
    names.set(idx, PDFString.of(name))
    const fileSpec = names.lookup(idx + 1, PDFDict)
    fileSpec.set(PDFName.of('F'), PDFString.of(name))
    fileSpec.set(PDFName.of('UF'), PDFString.of(name))
    renamed++
  }
  expect(renamed).toBe(1)
  return Buffer.from(await pdf.save())
}

// §6.2 p.25 and codelists--Filename.csv: the invoice is factur-x.xml or, for the reference
// profile XRECHNUNG (§7.7), xrechnung.xml. Both hold a CII invoice.
describe('extract() xrechnung.xml (CG-12)', () => {
  it('finds xrechnung.xml and reports the CII flavor', async () => {
    const original = await extract({ pdf: await readFile(EXAMPLE_PDF) })
    const result = await extract({ pdf: await renamedExample('xrechnung.xml') })
    expect(result.filename).toBe('xrechnung.xml')
    expect(result.flavor).toBe('facturx')
    expect(result.xml).toBe(original.xml)
  })

  it('accepts flavor facturx and rejects another flavor', async () => {
    const pdf = await renamedExample('xrechnung.xml')
    await expect(extract({ pdf, flavor: 'facturx' })).resolves.toMatchObject({ filename: 'xrechnung.xml' })
    await expect(extract({ pdf, flavor: 'orderx' })).rejects.toThrow('expected orderx but found facturx')
  })

  // The XML here keeps the example's EN 16931 guideline ID, so check() can validate it. A real
  // XRECHNUNG guideline ID is still not understood by getLevel() (CG-12).
  it('checks the extracted XML', async () => {
    const result = await extract({ pdf: await renamedExample('xrechnung.xml'), check: true })
    expect(result.flavor).toBe('facturx')
  })

  it('still ignores other XML file names', async () => {
    await expect(extract({ pdf: await renamedExample('invoice.xml') })).rejects.toThrow('No attachment found')
  })
})

// A PDF whose only attachment is `name` holding `xml`.
async function pdfWithAttachment(name: string, xml: string): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  pdf.addPage()
  await pdf.attach(Buffer.from(xml, 'utf8'), name, { mimeType: 'text/xml' })
  return Buffer.from(await pdf.save())
}

// #38: the ZUGFeRD file names (legacy ZUGFeRD 1.0 / 2.0 hybrids) give the flavor `zugferd`, for which
// there is no schema. check() validates what the XML is, read from its root element.
describe('extract({ check: true }) on a ZUGFeRD file name (#38)', () => {
  it.each(['zugferd-invoice.xml', 'ZUGFeRD-invoice.xml'])('validates a ZUGFeRD 2.x invoice in %s as facturx', async (name) => {
    const original = await extract({ pdf: await readFile(EXAMPLE_PDF) })
    const pdf = await renamedExample(name)
    const result = await extract({ pdf, check: true })
    expect(result.filename).toBe(name)
    // The reported flavor still comes from the file name, as without `check`.
    expect(result.flavor).toBe('zugferd')
    expect(result.xml).toBe(original.xml)
    await expect(extract({ pdf, check: true, flavor: 'zugferd' })).resolves.toMatchObject({ flavor: 'zugferd' })
  })

  // The legacy ZUGFeRD 2.0 guideline IDs are still in the 1.09 code lists, marked deprecated
  // (appendix-minimum.txt, `urn:zugferd.de:2p0:minimum`; EXTENDED codedb, `…#conformant#urn:zugferd.de:2p0:extended`).
  it.each([
    ['Facture_FR_MINIMUM.xml', 'urn:zugferd.de:2p0:minimum'],
    ['Facture_FR_EN16931.xml', 'urn:cen.eu:en16931:2017#conformant#urn:zugferd.de:2p0:extended'],
  ])('validates %s declaring the ZUGFeRD 2.0 ID %s', async (example, id) => {
    const source = await readFile(resolve(import.meta.dirname, '../examples', example), 'utf8')
    const xml = source.replace(/(<ram:GuidelineSpecifiedDocumentContextParameter>\s*<ram:ID>)[^<]*/, `$1${id}`)
    expect(xml).toContain(`<ram:ID>${id}</ram:ID>`)
    await expect(extract({ pdf: await pdfWithAttachment('zugferd-invoice.xml', xml), check: true }))
      .resolves
      .toMatchObject({ flavor: 'zugferd', filename: 'zugferd-invoice.xml' })
  })

  it('still rejects an invalid ZUGFeRD 2.x invoice', async () => {
    const original = await extract({ pdf: await readFile(EXAMPLE_PDF) })
    const broken = original.xml.replace(/<ram:TypeCode>380<\/ram:TypeCode>/, '<ram:Unknown>380</ram:Unknown>')
    expect(broken).not.toBe(original.xml)
    await expect(extract({ pdf: await pdfWithAttachment('zugferd-invoice.xml', broken), check: true })).rejects.toThrow('Invalid XML')
  })

  it('says ZUGFeRD 1.0 validation is not supported', async () => {
    const pdf = await pdfWithAttachment('ZUGFeRD-invoice.xml', '<rsm:CrossIndustryDocument xmlns:rsm="urn:ferd:CrossIndustryDocument:invoice:1p0"/>')
    await expect(extract({ pdf })).resolves.toMatchObject({ flavor: 'zugferd' })
    await expect(extract({ pdf, check: true })).rejects.toThrow('ZUGFeRD 1.0 validation is not supported')
  })

  it('rejects an Order-X order under a ZUGFeRD file name', async () => {
    const xml = await readFile(resolve(import.meta.dirname, '../examples/ORDER-X_EX11_ORDER_PICK-UP-BASIC.xml'), 'utf8')
    await expect(extract({ pdf: await pdfWithAttachment('zugferd-invoice.xml', xml), check: true }))
      .rejects
      .toThrow('holds an Order-X order, not an invoice')
  })

  it('keeps the EXTENDED-CTC-FR rejection for a ZUGFeRD file name', async () => {
    const original = await extract({ pdf: await readFile(EXAMPLE_PDF) })
    const ctcFr = original.xml.replace(
      /(<ram:GuidelineSpecifiedDocumentContextParameter>\s*<ram:ID>)[^<]*/,
      '$1urn:cen.eu:en16931:2017#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr',
    )
    expect(ctcFr).not.toBe(original.xml)
    await expect(extract({ pdf: await pdfWithAttachment('zugferd-invoice.xml', ctcFr), check: true }))
      .rejects
      .toThrow('EXTENDED-CTC-FR')
  })
})
