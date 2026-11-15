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
