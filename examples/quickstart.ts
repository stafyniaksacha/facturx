// #region tour
import { readFile } from 'node:fs/promises'
import { check, extract, generate } from '@stafyniaksacha/facturx'

const sourcePdf = await readFile('source-invoice.pdf') // a plain PDF
const facturxPdf = await readFile('Facture_FR_EN16931.pdf') // a Factur-X PDF
const xml = await readFile('Facture_FR_EN16931.xml')

// 1. Generate a Factur-X PDF/A-3 by embedding the XML into the PDF
const generated = await generate({ pdf: sourcePdf, xml }) // → Uint8Array

// 2. Extract the XML back out of a Factur-X / Order-X / ZUGFeRD PDF
//    (the flavor comes from the attachment filename; the level is not detected here)
const { xml: extractedXml, flavor } = await extract({ pdf: facturxPdf })

// 3. Validate an XML invoice against the official XSD (flavor and level are detected from the XML)
const { valid, errors, level } = await check({ xml: extractedXml })

// …and additionally against the EN 16931 business rules (Factur-X only)
const result = await check({ xml, schematron: true })

console.log(generated.length, extractedXml.length, flavor, level, valid, errors.length, result.valid, result.schematronValid)
// #endregion tour
