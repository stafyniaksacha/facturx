import type { Invoice } from '@stafyniaksacha/facturx/en16931'
import { check, dropUblUncarried, EN16931, invoiceToUbl, xmlToEn16931 } from '@stafyniaksacha/facturx'
import * as Subpath from '@stafyniaksacha/facturx/en16931'
import { describe, expect, it } from 'vitest'
import { loadEn16931Corpus } from './fixtures/en16931-corpus'

const EXT_ID = 'urn:cen.eu:en16931:2017#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr'

/** A small valid invoice as a plain object (no class instances). */
function minimal(): Invoice {
  return {
    number: 'INV-1',
    issueDate: '2025-02-01',
    typeCode: '380',
    currencyCode: 'EUR',
    paymentDueDate: '2025-03-01',
    invoicedObjectIdentifiers: [],
    notes: [],
    precedingInvoiceReferences: [],
    additionalDocuments: [],
    seller: { identifiers: [], name: 'Seller', address: { countryCode: 'FR' }, vatIdentifier: 'FR88100000009' },
    buyer: { identifiers: [], name: 'Buyer', address: { countryCode: 'FR' } },
    allowances: [],
    charges: [],
    lines: [{
      identifier: '1',
      notes: [],
      objectIdentifiers: [],
      invoicedQuantity: 1,
      invoicedQuantityUnitCode: 'C62',
      netAmount: 100,
      allowances: [],
      charges: [],
      precedingInvoiceReferences: [],
      price: { netPrice: 100 },
      vat: { categoryCode: 'S', rate: 20 },
      item: { name: 'Item', attributes: [], classifications: [] },
    }],
    totals: { sumOfInvoiceLineNetAmount: 100, invoiceTotalAmountWithoutVat: 100, invoiceTotalVatAmount: 20, invoiceTotalAmountWithVat: 120, amountDueForPayment: 120 },
    vatBreakdown: [{ categoryTaxableAmount: 100, categoryTaxAmount: 20, categoryCode: 'S', categoryRate: 20 }],
  } as Invoice
}

const party = { identifiers: [], name: 'P', contact: { point: 'M. X', departmentName: 'D' } }

/** Each value the helper removes: the term, the path it reports, how to set it, the level it is written at. */
const REMOVABLE: { term: string, path: string, level: 'en16931' | 'extended-ctc-fr', refused: RegExp, set: (i: Invoice) => void }[] = [
  { term: 'BT-24', path: '.specificationIdentifier', level: 'en16931', refused: /BT-24/, set: (i) => { i.specificationIdentifier = 'urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic' } },
  { term: 'BT-11-0', path: '.projectName', level: 'en16931', refused: /BT-11-0/, set: i => Object.assign(i, { projectReference: 'PRJ', projectName: 'Name' }) },
  { term: 'BT-41-0', path: '.seller.contact.departmentName', level: 'en16931', refused: /BT-41-0/, set: (i) => { i.seller.contact = { point: 'A', departmentName: 'D' } } },
  { term: 'BT-56-0', path: '.buyer.contact.departmentName', level: 'en16931', refused: /BT-56-0/, set: (i) => { i.buyer.contact = { point: 'A', departmentName: 'D' } } },
  { term: 'department name', path: '.sellerAgent.contact.departmentName', level: 'extended-ctc-fr', refused: /department name/, set: (i) => { i.sellerAgent = structuredClone(party) } },
  { term: 'department name', path: '.billingParty.contact.departmentName', level: 'extended-ctc-fr', refused: /department name/, set: (i) => { i.billingParty = structuredClone(party) } },
  { term: 'department name', path: '.buyerAgent.contact.departmentName', level: 'extended-ctc-fr', refused: /department name/, set: (i) => { i.buyerAgent = structuredClone(party) } },
  { term: 'department name', path: '.invoicee.contact.departmentName', level: 'extended-ctc-fr', refused: /department name/, set: (i) => { i.invoicee = structuredClone(party) } },
  { term: 'department name', path: '.payee.contact.departmentName', level: 'extended-ctc-fr', refused: /department name/, set: (i) => { i.payee = { identifiers: [], name: 'PAYEE', contact: { departmentName: 'D' } } } },
  { term: 'BG-18', path: '.paymentInstructions.card', level: 'en16931', refused: /BG-18/, set: (i) => { i.paymentInstructions = { paymentMeansTypeCode: '48', creditTransfers: [], card: { primaryAccountNumber: '1234' } } } },
  { term: 'department name', path: '.payer.contact.departmentName', level: 'extended-ctc-fr', refused: /department name/, set: i => Object.assign(i, { paymentInstructions: { paymentMeansTypeCode: '59', creditTransfers: [], directDebit: { mandateReference: 'M' } }, payer: structuredClone(party) }) },
  { term: 'EXT-FR-FE-184', path: '.lines.0.grandTotalAmount', level: 'extended-ctc-fr', refused: /EXT-FR-FE-184/, set: (i) => { i.lines[0].grandTotalAmount = 120 } },
]

async function written(invoice: Invoice, level: 'en16931' | 'extended-ctc-fr'): Promise<string> {
  const doc = await invoiceToUbl(invoice, { level })
  try {
    return doc.toString()
  }
  finally {
    doc.dispose()
  }
}

describe('dropUblUncarried', () => {
  it('is exported from the root and the ./en16931 subpath', () => {
    expect(Subpath.dropUblUncarried).toBe(dropUblUncarried)
  })

  it.each(REMOVABLE)('$term ($path): refused by invoiceToUbl, removed and reported, then written', async ({ path, level, refused, set }) => {
    const invoice = minimal()
    set(invoice)
    await expect(invoiceToUbl(invoice, { level })).rejects.toThrow(refused)
    const before = structuredClone(invoice)
    const result = dropUblUncarried(invoice, { level })
    expect(result.dropped).toEqual([path])
    expect(invoice).toEqual(before) // input untouched
    const xml = await written(result.invoice, level)
    expect(dropUblUncarried(result.invoice, { level }).dropped).toEqual([]) // idempotent
    expect((await check({ xml, schematron: true })).errors).toEqual([])
  })

  it('resets BT-24 to the UBL id of the level, and keeps the level id, empty or unset', () => {
    const invoice = minimal()
    invoice.specificationIdentifier = 'urn:cen.eu:en16931:2017'
    expect(dropUblUncarried(invoice, { level: 'extended-ctc-fr' }).invoice.specificationIdentifier).toBe(EXT_ID)
    expect(dropUblUncarried(invoice, { level: 'en16931' }).dropped).toEqual([])
    invoice.specificationIdentifier = ''
    expect(dropUblUncarried(invoice, { level: 'en16931' }).dropped).toEqual([])
    invoice.specificationIdentifier = undefined
    expect(dropUblUncarried(invoice, { level: 'en16931' }).dropped).toEqual([])
  })

  it('keeps the default project name and does not report it', () => {
    const invoice = minimal()
    invoice.projectReference = 'PRJ'
    invoice.projectName = 'Project reference'
    const result = dropUblUncarried(invoice, { level: 'en16931' })
    expect(result.dropped).toEqual([])
    expect(result.invoice.projectName).toBe('Project reference')
  })

  it('returns an equal deep copy and nothing dropped for an invoice with none of them', () => {
    const invoice = minimal()
    const result = dropUblUncarried(invoice, { level: 'en16931' })
    expect(result.dropped).toEqual([])
    expect(result.invoice).toEqual(invoice)
    expect(result.invoice).not.toBe(invoice)
    expect(result.invoice.lines[0]).not.toBe(invoice.lines[0])
  })

  it('reports in UBL document order, every line, and keeps class instances', () => {
    const invoice = new EN16931.Invoice(minimal() as ConstructorParameters<typeof EN16931.Invoice>[0])
    invoice.lines.push({ ...structuredClone(invoice.lines[0]), identifier: '2', grandTotalAmount: 1 })
    invoice.lines[0].grandTotalAmount = 1
    invoice.buyer.contact = { departmentName: 'D' }
    invoice.seller.contact = { departmentName: 'D' }
    invoice.specificationIdentifier = 'x'
    const before = structuredClone(invoice)
    const result = dropUblUncarried(invoice, { level: 'extended-ctc-fr' })
    expect(result.dropped).toEqual(['.specificationIdentifier', '.seller.contact.departmentName', '.buyer.contact.departmentName', '.lines.0.grandTotalAmount', '.lines.1.grandTotalAmount'])
    expect(result.invoice).toBeInstanceOf(EN16931.Invoice)
    expect(structuredClone(invoice)).toEqual(before)
  })

  it('leaves what is not a missing UBL place to invoiceToUbl: an EXTENDED-CTC-FR term at en16931 still throws', async () => {
    const invoice = minimal()
    invoice.lines[0].grandTotalAmount = 120
    invoice.lines[0].vat!.exemptionReason = 'R' // EXT-FR-FE-178
    const { invoice: stripped, dropped } = dropUblUncarried(invoice, { level: 'en16931' })
    expect(dropped).toEqual(['.lines.0.grandTotalAmount'])
    await expect(invoiceToUbl(stripped, { level: 'en16931' })).rejects.toThrow(/EXT-FR-FE-178/)
  })

  it('throws a named error for an invoice that is not an object', () => {
    for (const bad of [undefined, null, 'INV-1', 42, []])
      expect(() => dropUblUncarried(bad as unknown as Invoice, { level: 'en16931' })).toThrow(/^dropUblUncarried: invoice must be an EN 16931 invoice object$/)
  })

  it('throws for a level without a UBL binding', () => {
    expect(() => dropUblUncarried(minimal(), { level: 'extended' as 'en16931' })).toThrow(/options.level/)
  })
})

// Factur-X BASIC and EN 16931 sources are written at `en16931`. Factur-X EXTENDED and EXTENDED-CTC-FR sources are
// written at `extended-ctc-fr`: most hold EXTENDED-CTC-FR terms (line VAT exemption reasons, several line notes or
// object identifiers, group lines without VAT) that `en16931` cannot carry, and stripping those is a level choice the
// helper leaves to the caller.
const corpus = await loadEn16931Corpus()
const ublLevel = (level: string): 'en16931' | 'extended-ctc-fr' => level === 'basic' || level === 'en16931' ? 'en16931' : 'extended-ctc-fr'

describe('dropUblUncarried: every official CII invoice converts to valid UBL', () => {
  it('covers the 64 documents of the two corpora', () => {
    expect(corpus).toHaveLength(64)
  })

  it.each(corpus)('$name ($level)', async ({ xml, level }) => {
    const { invoice, syntax } = await xmlToEn16931(xml)
    expect(syntax).toBe('cii')
    const target = ublLevel(level)
    const result = dropUblUncarried(invoice, { level: target })
    const ubl = await written(result.invoice, target)
    const checked = await check({ xml: ubl, schematron: true })
    expect(checked.errors).toEqual([])
    expect(checked.schematronErrors).toEqual([])
    expect(checked.valid).toBe(true)
    expect(checked.level).toBe(target)
  })
})
