// #region main
import { readFile, writeFile } from 'node:fs/promises'
import { generate } from '@stafyniaksacha/facturx'

const pdf = await readFile('source-invoice.pdf')
const xml = await readFile('Facture_FR_EN16931.xml')

const bytes = await generate({
  pdf,
  xml,
  // all optional:
  flavor: 'facturx',
  level: 'en16931',
  language: 'en-GB',
  meta: {
    author: 'Acme Corporation',
    title: 'Invoice INV-2023-001',
    subject: 'Invoice',
    keywords: ['invoice', 'factur-x'],
    date: new Date(),
  },
})

await writeFile('facturx.pdf', bytes)
// #endregion main
