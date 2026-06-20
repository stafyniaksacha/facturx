// #region main
import { readFile } from 'node:fs/promises'
import { check } from '@stafyniaksacha/facturx'

const xml = await readFile('Facture_FR_EN16931.xml')

// Structure only (XSD)
const { valid, errors } = await check({ xml })
if (!valid)
  errors.forEach(e => console.error(e.message))

// Full EN 16931 validation (Factur-X)
const result = await check({ xml, schematron: true })
console.log(result.valid) // XSD && Schematron
console.log(result.schematronValid) // Schematron alone
for (const e of result.schematronErrors ?? [])
  console.log(e.id, e.message)
// #endregion main
