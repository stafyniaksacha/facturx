// #region main
import { readFile } from 'node:fs/promises'
import { check, EN16931, fromCii, invoiceToXml, toCii, xmlToInvoice } from '@stafyniaksacha/facturx'

// 1. Build an EN 16931 invoice by business term, then write it as CII at a level.
const invoice = new EN16931.Invoice({
  number: 'F-2026-001', // BT-1
  issueDate: '2026-01-15', // BT-2
  typeCode: '380', // BT-3
  currencyCode: 'EUR', // BT-5
  seller: new EN16931.Seller({
    name: 'Société Dupont & Fils', // BT-27
    vatIdentifier: 'FR12345678901', // BT-31
    address: new EN16931.PostalAddress({ countryCode: 'FR' }), // BG-5
  }),
  buyer: new EN16931.Buyer({
    name: 'Acheteur SAS', // BT-44
    address: new EN16931.PostalAddress({ countryCode: 'FR' }), // BG-8
  }),
  totals: new EN16931.DocumentTotals({ // BG-22
    sumOfInvoiceLineNetAmount: 100,
    invoiceTotalAmountWithoutVat: 100,
    invoiceTotalVatAmount: 20,
    invoiceTotalAmountWithVat: 120,
    amountDueForPayment: 120,
  }),
  vatBreakdown: [new EN16931.VatBreakdown({ // BG-23
    categoryTaxableAmount: 100,
    categoryTaxAmount: 20,
    categoryCode: 'S',
    categoryRate: 20,
  })],
  lines: [new EN16931.InvoiceLine({ // BG-25
    identifier: '1',
    invoicedQuantity: 1,
    invoicedQuantityUnitCode: 'C62',
    netAmount: 100,
    price: new EN16931.PriceDetails({ netPrice: 100 }), // BG-29
    vat: new EN16931.LineVat({ categoryCode: 'S', rate: 20 }), // BG-30
    item: new EN16931.Item({ name: 'Conseil' }), // BG-31
  })],
})

// `toCii` throws, naming the business term, when the invoice can't be written at that level.
const xml = (await invoiceToXml(toCii(invoice, { level: 'en16931' }))).toString()
const result = await check({ xml, schematron: true })

// 2. Read an existing CII invoice into the model: `dropped` lists what the model has no place for.
const source = await xmlToInvoice(await readFile('Facture_FR_EN16931.xml'))
const { invoice: read, dropped } = fromCii(source)

console.log(result.valid, read.seller.name, read.lines.length, dropped.length)
// #endregion main
