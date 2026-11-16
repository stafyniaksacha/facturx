// #region main
import { readFile } from 'node:fs/promises'
import { check, en16931ToXml, xmlToEn16931 } from '@stafyniaksacha/facturx'

// 1. Read a CII invoice (or a UBL one: the syntax comes from the root element) into the EN 16931 model.
const { invoice, dropped, syntax } = await xmlToEn16931(await readFile('Facture_FR_EN16931.xml'))

// 2. Write it as UBL 2.1 (an `Invoice`, or a `CreditNote` for a credit note type code) at `en16931`.
// It throws, naming the business term, on a value UBL has no place for (a contact department name ...).
const doc = await en16931ToXml(invoice, { syntax: 'ubl', level: 'en16931' })
let ubl: string
try {
  ubl = doc.toString()
}
finally {
  doc.dispose() // the document holds WebAssembly memory
}

// 3. Validate the UBL (XSD + EN 16931 UBL Schematron) and read it back.
const result = await check({ xml: ubl, schematron: true })
const back = await xmlToEn16931(ubl)

console.log(syntax, dropped.length, result.flavor, result.valid, back.syntax, back.invoice.number === invoice.number, back.dropped.length)
// #endregion main
