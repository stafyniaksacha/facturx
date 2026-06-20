// #region main
import { readFile } from 'node:fs/promises'
import { invoiceToXml, xmlToInvoice } from '@stafyniaksacha/facturx'

const invoice = await xmlToInvoice(await readFile('Facture_FR_EN16931.xml'))

// …mutate the model…

const xml = (await invoiceToXml(invoice)).toString()
console.log(xml.length)
// #endregion main
