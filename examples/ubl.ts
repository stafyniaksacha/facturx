// #region main
import { readFile } from 'node:fs/promises'
import { check, dropUblUncarried, en16931ToXml, xmlToEn16931 } from '@stafyniaksacha/facturx'

// 1. Read a CII invoice (or a UBL one: the syntax comes from the root element) into the EN 16931 model.
const read = await xmlToEn16931(await readFile('Facture_FR_EN16931.xml'))

// 2. Remove what UBL has no place for (contact department names, a card, line grand totals, a CII BT-24 ...).
// `dropped` lists each removed value by model path: look at it, the UBL document will not hold them.
const { invoice, dropped } = dropUblUncarried(read.invoice, { level: 'en16931' })

// 3. Write it as UBL 2.1 (an `Invoice`, or a `CreditNote` for a credit note type code) at `en16931`.
const doc = await en16931ToXml(invoice, { syntax: 'ubl', level: 'en16931' })
let ubl: string
try {
  ubl = doc.toString()
}
finally {
  doc.dispose() // the document holds WebAssembly memory
}

// 4. Validate the UBL (XSD + EN 16931 UBL Schematron) and read it back.
const result = await check({ xml: ubl, schematron: true })
const back = await xmlToEn16931(ubl)

console.log(read.syntax, read.dropped.length, dropped, result.flavor, result.valid, back.syntax, back.invoice.number === invoice.number)
// #endregion main
