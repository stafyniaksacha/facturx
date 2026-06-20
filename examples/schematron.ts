// #region main
import { readFile } from 'node:fs/promises'
import { validateSchematron } from '@stafyniaksacha/facturx'

const xml = await readFile('Facture_FR_EN16931.xml')

const { valid, errors } = await validateSchematron({
  xml,
  flavor: 'facturx',
  level: 'en16931',
})

if (!valid) {
  for (const e of errors)
    console.log(`${e.id ?? '—'}: ${e.message}`)
}
// #endregion main
