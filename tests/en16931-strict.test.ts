import type { Invoice } from '@stafyniaksacha/facturx/en16931'
import type { CrossIndustryInvoiceType } from '@stafyniaksacha/facturx/models'
import { readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { check, EN16931, extract, fromCii, invoiceToXml, toCii, xmlToInvoice } from '@stafyniaksacha/facturx'
import { describe, expect, it } from 'vitest'

/**
 * What `toCii()` refuses and what `dropped` reports exactly (review fixes of PR ②): reordered repeated
 * groups are matched by value, the identifiers a level can't carry, the mandatory terms of the header
 * groups, and the *Amount* decimals rule (spec §7.1.5).
 */

const CORPUS_DIR = resolve(import.meta.dirname, '../spec/factur-x-1.09/distribution/5. FACTUR-X 1.09 - Examples/_Factur-X_1.08-Exemples_CS')
const AGREEMENT = '/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement'

async function corpus(folder: string, name: string): Promise<CrossIndustryInvoiceType> {
  const dir = join(CORPUS_DIR, folder)
  const file = readdirSync(dir).find(f => f.endsWith('.pdf') && f.includes(name))!
  const { xml } = await extract({ pdf: await readFile(join(dir, file)) })
  return xmlToInvoice(xml)
}

const agreement = (c: CrossIndustryInvoiceType) => c.supplyChainTradeTransaction.applicableHeaderTradeAgreement
const settlement = (c: CrossIndustryInvoiceType) => c.supplyChainTradeTransaction.applicableHeaderTradeSettlement

describe('en 16931 model: dropped matches repeated elements by value, then by position', () => {
  it('keeps a reordered tax registration (FC before VA) out of dropped', async () => {
    const cii = await corpus('3.EN16931', 'F20260025')
    const registrations = agreement(cii).sellerTradeParty.specifiedTaxRegistration!
    registrations.unshift({ id: { value: 'FR-TAX-1', schemeID: 'FC' } } as never)
    const { invoice, dropped } = fromCii(cii)
    expect(dropped).toEqual([])
    expect(invoice.seller.taxRegistrationIdentifier).toBe('FR-TAX-1')
  })

  it('keeps additional documents the writer reorders (type 50 before 916) out of dropped', async () => {
    const cii = await corpus('3.EN16931', 'F20260025')
    agreement(cii).additionalReferencedDocument = [
      { issuerAssignedID: { value: 'LOT-1' }, typeCode: { value: '50' }, name: [] },
      { issuerAssignedID: { value: 'DOC-1' }, typeCode: { value: '916' }, name: [{ value: 'desc' }] },
    ] as never
    expect(fromCii(cii).dropped).toEqual([])
  })

  it('reports exactly the lost additional document, not the kept one with the same reference', async () => {
    const cii = await corpus('3.EN16931', 'F20260025')
    agreement(cii).additionalReferencedDocument = [
      { issuerAssignedID: { value: 'DOC-1' }, typeCode: { value: '751' }, name: [] },
      { issuerAssignedID: { value: 'DOC-1' }, typeCode: { value: '916' }, name: [] },
    ] as never
    expect(fromCii(cii).dropped).toEqual([
      `${AGREEMENT}/ram:AdditionalReferencedDocument[1]/ram:IssuerAssignedID`,
      `${AGREEMENT}/ram:AdditionalReferencedDocument[1]/ram:TypeCode`,
    ])
  })

  it('keeps interleaved allowances and charges out of dropped', async () => {
    const cii = await corpus('3.EN16931', 'F20260023')
    const all = settlement(cii).specifiedTradeAllowanceCharge!
    const allowances = all.filter(a => !a.chargeIndicator.indicator)
    const charges = all.filter(a => a.chargeIndicator.indicator)
    expect(allowances.length).toBeGreaterThan(1)
    settlement(cii).specifiedTradeAllowanceCharge = allowances.flatMap((a, i) => [charges[i]!, a]).concat(charges.slice(allowances.length))
    const { dropped } = fromCii(cii)
    expect(dropped).toEqual([])
  })

  it('keeps BT-111 written before BT-110 out of dropped', () => {
    const invoice = new EN16931.Invoice({
      number: 'F-1',
      issueDate: '2025-07-01',
      typeCode: '380',
      currencyCode: 'EUR',
      vatAccountingCurrencyCode: 'USD',
      seller: new EN16931.Seller({ name: 'S', vatIdentifier: 'FR12345678901', address: new EN16931.PostalAddress({ countryCode: 'FR' }) }),
      buyer: new EN16931.Buyer({ name: 'B', address: new EN16931.PostalAddress({ countryCode: 'FR' }) }),
      totals: new EN16931.DocumentTotals({ sumOfInvoiceLineNetAmount: 100, invoiceTotalAmountWithoutVat: 100, invoiceTotalVatAmount: 20, invoiceTotalVatAmountInAccountingCurrency: 22, invoiceTotalAmountWithVat: 120, amountDueForPayment: 120 }),
      vatBreakdown: [new EN16931.VatBreakdown({ categoryTaxableAmount: 100, categoryTaxAmount: 20, categoryCode: 'S', categoryRate: 20 })],
      lines: [new EN16931.InvoiceLine({ identifier: '1', invoicedQuantity: 1, invoicedQuantityUnitCode: 'C62', netAmount: 100, price: new EN16931.PriceDetails({ netPrice: 100 }), vat: new EN16931.LineVat({ categoryCode: 'S', rate: 20 }), item: new EN16931.Item({ name: 'I' }) })],
    })
    const cii = toCii(invoice, { level: 'extended' })
    const sum = settlement(cii).specifiedTradeSettlementHeaderMonetarySummation
    expect(sum.taxTotalAmount).toHaveLength(2)
    sum.taxTotalAmount!.reverse()
    expect(fromCii(cii).dropped).toEqual([])
  })
})

async function enInvoice(): Promise<Invoice> {
  const invoice = fromCii(await corpus('3.EN16931', 'F20260025')).invoice
  invoice.specificationIdentifier = undefined
  return invoice
}

describe('en 16931 model: identifiers a level cannot carry', () => {
  const ids = (...values: [string, string?][]) => values.map(([value, schemeId]) => new EN16931.Identifier({ value, schemeId }))

  it.each(['basic', 'en16931', 'extended'] as const)('refuses several buyer private identifiers (BT-46) at %s', async (level) => {
    const invoice = await enInvoice()
    invoice.buyer.identifiers = ids(['B1'], ['B2'])
    expect(() => toCii(invoice, { level })).toThrow(/BT-46 \(buyer identifier\)/)
  })

  it.each(['basic', 'en16931'] as const)('refuses several buyer global identifiers (BT-46-0) at %s, EXTENDED allows them', async (level) => {
    const invoice = await enInvoice()
    invoice.buyer.identifiers = ids(['G1', '0088'], ['G2', '0009'])
    expect(() => toCii(invoice, { level })).toThrow(/BT-46-0/)
    expect(() => toCii(invoice, { level: 'extended' })).not.toThrow()
  })

  it.each(['en16931', 'extended'] as const)('refuses several payee identifiers (BT-60) at %s', async (level) => {
    const invoice = await enInvoice()
    invoice.payee = new EN16931.Payee({ name: 'P', identifiers: ids(['P1'], ['P2']) })
    expect(() => toCii(invoice, { level })).toThrow(/BT-60 \(payee identifier\)/)
  })

  it('accepts several at extended-ctc-fr and writes a document that passes the level checks', async () => {
    const invoice = await enInvoice()
    invoice.buyer.identifiers = ids(['B1'], ['B2'], ['G1', '0088'], ['G2', '0009'])
    invoice.payee = new EN16931.Payee({ name: 'P', identifiers: ids(['P1'], ['P2']) })
    const xml = (await invoiceToXml(toCii(invoice, { level: 'extended-ctc-fr' }))).toString()
    const result = await check({ xml, schematron: true })
    expect(result.errors).toEqual([])
    expect(result.schematronErrors).toEqual([])
  })

  it('accepts one of each at en16931 and writes a valid document', async () => {
    const invoice = await enInvoice()
    invoice.buyer.identifiers = ids(['B1'], ['G1', '0088'])
    invoice.payee = new EN16931.Payee({ name: 'P', identifiers: ids(['P1'], ['P2', '0088']) })
    const xml = (await invoiceToXml(toCii(invoice, { level: 'en16931' }))).toString()
    expect((await check({ xml, schematron: true })).schematronErrors).toEqual([])
  })
})

describe('en 16931 model: mandatory terms of the header groups', () => {
  const cases: [string, RegExp, (i: Invoice) => void][] = [
    ['BT-25 empty in a BG-3', /BT-25.*BR-55/, (i) => { i.precedingInvoiceReferences = [new EN16931.PrecedingInvoiceReference({ reference: '' })] }],
    ['BT-122 empty in a BG-24', /BT-122.*BR-52/, (i) => { i.additionalDocuments = [new EN16931.AdditionalSupportingDocument({ reference: '' })] }],
    ['BT-22 missing in a BG-1', /BT-22/, (i) => { i.notes = [new EN16931.InvoiceNote({ subjectCode: 'AAI' })] }],
    ['BG-14 without BT-73 or BT-74', /BG-14.*BR-CO-19/, (i) => { i.invoicingPeriod = new EN16931.InvoicingPeriod({}) }],
    ['BT-18 empty', /BT-18/, (i) => { i.invoicedObjectIdentifiers = [new EN16931.Identifier({ value: '' })] }],
    ['BT-17 empty', /BT-17/, (i) => { i.tenderOrLotReference = '' }],
  ]

  it.each(cases)('throws, naming the term, for %s', async (_name, message, mutate) => {
    const invoice = await enInvoice()
    mutate(invoice)
    expect(() => toCii(invoice, { level: 'en16931' })).toThrow(message)
  })

  it('accepts a BG-14 with only an end date and never quotes content', async () => {
    const invoice = await enInvoice()
    invoice.invoicingPeriod = new EN16931.InvoicingPeriod({ endDate: '2026-01-31' })
    expect(() => toCii(invoice, { level: 'en16931' })).not.toThrow()
    invoice.notes = [new EN16931.InvoiceNote({ subjectCode: 'SECRET-CODE' })]
    expect(() => toCii(invoice, { level: 'en16931' })).toThrow(/^(?:(?!SECRET-CODE).)*$/)
  })

  it('still reads a document that lacks them (fromCii stays tolerant)', async () => {
    const cii = await corpus('3.EN16931', 'F20260025')
    cii.exchangedDocument.includedNote = [{ subjectCode: { value: 'AAI' } } as never]
    expect(() => fromCii(cii)).not.toThrow()
  })
})

describe('en 16931 model: an Amount has at most 2 decimals', () => {
  it('throws, naming BT-110, on a VAT total with 3 decimals', async () => {
    const invoice = await enInvoice()
    invoice.totals.invoiceTotalVatAmount = 20.125
    expect(() => toCii(invoice, { level: 'en16931' })).toThrow(/BT-110.*2 decimals/)
  })

  it('names the line amount, the document allowance and the VAT breakdown', async () => {
    const line = await enInvoice()
    line.lines[0]!.netAmount = 100.001
    expect(() => toCii(line, { level: 'en16931' })).toThrow(/BT-131/)
    const vat = await enInvoice()
    vat.vatBreakdown[0]!.categoryTaxableAmount = 10.005
    expect(() => toCii(vat, { level: 'en16931' })).toThrow(/BT-116/)
    const allowance = await enInvoice()
    allowance.allowances = [new EN16931.DocumentAllowance({ amount: 1.234, vatCategoryCode: 'S', vatRate: 20, reason: 'r' })]
    expect(() => toCii(allowance, { level: 'en16931' })).toThrow(/BT-92/)
  })

  it('does not limit unit prices, quantities, percentages and rates, and ignores floating point noise', async () => {
    const invoice = await enInvoice()
    const l = invoice.lines[0]!
    l.price!.netPrice = 489.05712
    l.price!.grossPrice = 489.05712
    l.invoicedQuantity = 1.23456789
    invoice.totals.invoiceTotalVatAmount = 0.1 + 0.2
    const cii = toCii(invoice, { level: 'en16931' })
    expect(cii.supplyChainTradeTransaction.includedSupplyChainTradeLineItem![0]!.specifiedLineTradeAgreement!.netPriceProductTradePrice!.chargeAmount.value).toBe(489.05712)
  })

  it('accepts a 5-decimal price discount on the gross price (BT-147)', async () => {
    const invoice = await enInvoice()
    const price = invoice.lines[0]!.price!
    price.grossPrice = price.netPrice + 0.12345
    price.priceDiscount = 0.12345
    expect(() => toCii(invoice, { level: 'en16931' })).not.toThrow()
  })
})
