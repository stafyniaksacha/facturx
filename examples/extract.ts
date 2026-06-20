// #region main
import { readFile, writeFile } from 'node:fs/promises'
import { extract } from '@stafyniaksacha/facturx'

const pdf = await readFile('Facture_FR_EN16931.pdf')

const { filename, xml, flavor } = await extract({ pdf })
console.log(`found ${filename} (${flavor})`)

await writeFile('factur-x.xml', xml)
// #endregion main
