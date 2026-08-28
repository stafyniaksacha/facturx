import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import fontkit from '@pdf-lib/fontkit'
import { generate, invoiceToXml } from '@stafyniaksacha/facturx'
import { PageSizes, PDFDocument, PDFName, PDFString } from 'pdf-lib'
import { getMinimalFacturXModel } from '../fixtures/model-minimal'
// import { getEN16931FacturXModel } from '../fixtures/model-en16931'

async function main(): Promise<void> {
  // Create a new PDF document
  const pdf = await PDFDocument.create()

  // // Set document ID
  // const documentId = randomBytes(16).toString('hex')
  // const id = PDFHexString.of(documentId)
  // pdf.context.trailerInfo.ID = pdf.context.obj([id, id]);

  // Embed fonts (required for PDF/A-3B compliance)
  pdf.registerFontkit(fontkit)
  const fontBuffer = await readFile(resolve(import.meta.dirname, './roboto-latin-400-normal.ttf'))
  const font = await pdf.embedFont(fontBuffer)

  // Embed ICC profile (required for PDF/A-3B compliance)
  // They can be found here: https://www.color.org/srgbprofiles.xalter
  const icc = await readFile(resolve(import.meta.dirname, './sRGB2014.icc'))
  const iccStream = pdf.context.stream(icc, {
    Length: icc.length,
  })
  const outputIntent = pdf.context.obj({
    Type: 'OutputIntent',
    S: 'GTS_PDFA1',
    OutputConditionIdentifier: PDFString.of('sRGB'),
    DestOutputProfile: pdf.context.register(iccStream),
  })
  const outputIntentRef = pdf.context.register(outputIntent)
  pdf.catalog.set(PDFName.of('OutputIntents'), pdf.context.obj([outputIntentRef]))

  const page = pdf.addPage(PageSizes.A4)
  // Trim box (required for PDF/A-3B compliance)
  page.setTrimBox(0, 0, PageSizes.A4[0], PageSizes.A4[1])

  page.drawText('DEMO', {
    x: 70,
    y: PageSizes.A4[1] - 300,
    size: 32,
    font,
    opacity: 0.05,
  })

  const invoice = getMinimalFacturXModel()
  const xml = await invoiceToXml(invoice)

  try {
    await writeFile(resolve(import.meta.dirname, './output.xml'), xml.toString({ format: false }))

    // const output = await pdf.save()
    const output = await generate({
      pdf,
      // @Todo: check why xpath is not working with direct xml object
      // xml,
      xml: xml.toString(),
    })

    await writeFile(resolve(import.meta.dirname, './output.pdf'), output)
  }
  finally {
    xml.dispose()
  }
}

main().catch(console.error)
