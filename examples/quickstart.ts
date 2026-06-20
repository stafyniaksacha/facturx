// #region tour
import { readFile } from 'node:fs/promises'
import { check, extract, generate } from '@stafyniaksacha/facturx'

const sourcePdf = await readFile('source-invoice.pdf') // a plain PDF
const facturxPdf = await readFile('Facture_FR_EN16931.pdf') // a Factur-X PDF
const xml = await readFile('Facture_FR_EN16931.xml')

// 1. Generate a Factur-X PDF/A-3 by embedding the XML into the PDF
const generated = await generate({ pdf: sourcePdf, xml }) // → Uint8Array

// 2. Extract the XML back out of a Factur-X / Order-X / ZUGFeRD PDF
const { xml: extractedXml, flavor, level } = await extract({ pdf: facturxPdf })

// 3. Validate an XML invoice against the official XSD
const { valid, errors } = await check({ xml })

// …and additionally against the EN 16931 business rules (Factur-X only)
const result = await check({ xml, schematron: true })

console.log(generated.length, extractedXml.length, flavor, level, valid, errors.length, result.valid, result.schematronValid)
// #endregion tour
