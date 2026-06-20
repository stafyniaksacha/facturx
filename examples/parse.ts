// #region main
import { readFile } from 'node:fs/promises'
import { xmlToInvoice } from '@stafyniaksacha/facturx'

const invoice = await xmlToInvoice(await readFile('Facture_FR_EN16931.xml'))

const agreement = invoice.supplyChainTradeTransaction.applicableHeaderTradeAgreement
console.log(agreement.sellerTradeParty.name?.value)
console.log(invoice.supplyChainTradeTransaction.includedSupplyChainTradeLineItem?.length)
// #endregion main
