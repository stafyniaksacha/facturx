import type { Invoice } from '@stafyniaksacha/facturx/en16931'
import type { CrossIndustryInvoiceType } from '@stafyniaksacha/facturx/models'
import { readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { check, EN16931, extract, fromCii, invoiceToXml, toCii, xmlToInvoice } from '@stafyniaksacha/facturx'
import { describe, expect, it } from 'vitest'
// `diffPaths` is the internal helper behind `dropped` (not exported): pairing is tested on it directly.
import { diffPaths } from '../src/lib/mapping/cii/dropped'

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

describe('en 16931 model: dropped pairs repeated elements by exact equality, in linear time', () => {
  const NOTE = '/rsm:CrossIndustryInvoice/rsm:ExchangedDocument/ram:IncludedNote'
  const LINE = '/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:IncludedSupplyChainTradeLineItem'
  const notes = (...n: object[]) => ({ exchangedDocument: { includedNote: n } }) as never

  it('blames the lost element, not a kept near-duplicate', () => {
    // [{X}, {X, AAI}] written as [{X, AAI}]: the first note is the lost one (a subset test blamed the second's code).
    const a = notes({ content: { value: 'X' } }, { content: { value: 'X' }, subjectCode: { value: 'AAI' } })
    const b = notes({ content: { value: 'X' }, subjectCode: { value: 'AAI' } })
    expect(diffPaths(a, b)).toEqual([`${NOTE}[1]/ram:Content`])
  })

  it('pairs duplicates with distinct elements and reports the one left over by position', () => {
    const x = { content: { value: 'X' } }
    expect(diffPaths(notes(x, x, x), notes(x, x))).toEqual([`${NOTE}[3]/ram:Content`])
    expect(diffPaths(notes({ content: { value: 'Y' } }, x), notes(x, { content: { value: 'Z' } }))).toEqual([`${NOTE}[1]/ram:Content`])
  })

  it('treats [] and undefined as no data, keeps 1 and "1" apart, and always reports a NaN leaf', () => {
    expect(diffPaths(notes({ content: { value: 'X' }, extra: [] }), notes({ content: { value: 'X' } }))).toEqual([])
    expect(diffPaths(notes({ content: { value: 1 } }), notes({ content: { value: '1' } }))).toEqual([`${NOTE}[1]/ram:Content`])
    const nan = { content: { value: Number.NaN } }
    expect(diffPaths(notes(nan), notes(nan))).toEqual([`${NOTE}[1]/ram:Content`])
  })

  // A line template replicated `n` times, each with its own BT-126 and, optionally, a BT-X-7 line status code.
  async function manyLines(n: number, status: boolean): Promise<CrossIndustryInvoiceType> {
    const cii = await corpus('4.EXTENDED', 'F20260023')
    const template = cii.supplyChainTradeTransaction.includedSupplyChainTradeLineItem![0]!
    cii.supplyChainTradeTransaction.includedSupplyChainTradeLineItem = Array.from({ length: n }, (_, i) => {
      const line = Object.setPrototypeOf(structuredClone(template), Object.getPrototypeOf(template)) as typeof template
      line.associatedDocumentLineDocument.lineID = { value: String(i + 1) } as never
      if (status)
        line.associatedDocumentLineDocument.lineStatusCode = { value: 'X' } as never
      return line
    })
    return cii
  }

  // Untrusted input must not make `fromCii()` quadratic (resource exhaustion): 5000 lines took minutes
  // with the earlier subset search (250 lines 1.8 s, 1000 lines 29.8 s); about 0.6 s now on a laptop.
  it('reads 5000 lines with one BT-X value each in well under a few seconds, reporting each exactly', async () => {
    const cii = await manyLines(5000, true)
    const start = performance.now()
    const { dropped } = fromCii(cii)
    const elapsed = performance.now() - start
    expect(dropped).toEqual(Array.from({ length: 5000 }, (_, i) => `${LINE}[${i + 1}]/ram:AssociatedDocumentLineDocument/ram:LineStatusCode`))
    expect(elapsed).toBeLessThan(5000)
  }, 30_000)

  it('reads 5000 clean lines in well under a few seconds, dropping nothing', async () => {
    const cii = await manyLines(5000, false)
    const start = performance.now()
    const { dropped } = fromCii(cii)
    const elapsed = performance.now() - start
    expect(dropped).toEqual([])
    expect(elapsed).toBeLessThan(5000)
  }, 30_000)
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

describe('en 16931 model: mandatory terms of credit transfers, attachments and line notes', () => {
  const transfer = (fields: ConstructorParameters<typeof EN16931.CreditTransfer>[0]) => new EN16931.PaymentInstructions({ paymentMeansTypeCode: '58', creditTransfers: [new EN16931.CreditTransfer(fields)] })

  it.each(['basic', 'en16931', 'extended', 'extended-ctc-fr'] as const)('throws on a credit transfer without BT-84 at %s (BR-50), never quoting content', async (level) => {
    const invoice = await enInvoice()
    invoice.paymentInstructions = transfer({ paymentAccountName: 'SECRET-NAME', paymentServiceProviderIdentifier: 'SECRET-BIC' })
    expect(() => toCii(invoice, { level })).toThrow(/^toCii: BT-84 \(payment account identifier\).*BR-50(?:(?!SECRET).)*$/)
    invoice.paymentInstructions = transfer({ paymentAccountIdentifier: '' })
    expect(() => toCii(invoice, { level })).toThrow(/BT-84/)
  })

  it('accepts an IBAN or a national account number (BT-84-0) as BT-84', async () => {
    const invoice = await enInvoice()
    invoice.paymentInstructions = transfer({ nationalAccountNumber: '12345-67' })
    expect(() => toCii(invoice, { level: 'en16931' })).not.toThrow()
    invoice.paymentInstructions = transfer({ paymentAccountIdentifier: 'FR7612345678901234567890123' })
    expect(() => toCii(invoice, { level: 'en16931' })).not.toThrow()
  })

  it('throws on an attached document without MIME code (BT-125-1) or filename (BT-125-2)', async () => {
    const invoice = await enInvoice()
    const attach = (mimeCode: string, filename: string) => [new EN16931.AdditionalSupportingDocument({ reference: 'D-1', attachedDocument: new EN16931.AttachedDocument({ content: 'JVBERi0=', mimeCode, filename }) })]
    invoice.additionalDocuments = attach('', 'SECRET.pdf')
    expect(() => toCii(invoice, { level: 'en16931' })).toThrow(/^toCii: BT-125-1(?:(?!SECRET).)*$/)
    invoice.additionalDocuments = attach('application/pdf', '')
    expect(() => toCii(invoice, { level: 'en16931' })).toThrow(/^toCii: BT-125-2/)
    invoice.additionalDocuments = attach('application/pdf', 'd.pdf')
    expect(() => toCii(invoice, { level: 'en16931' })).not.toThrow()
  })

  it.each(['basic', 'en16931'] as const)('throws on a missing or empty invoice note (BT-22) and line note (BT-127) at %s', async (level) => {
    for (const note of [undefined, '']) {
      const invoice = await enInvoice()
      invoice.notes = [new EN16931.InvoiceNote({ note })]
      expect(() => toCii(invoice, { level })).toThrow(/^toCii: BT-22 \(invoice note\) is mandatory and empty/)
      invoice.notes = []
      invoice.lines[0]!.notes = [new EN16931.LineNote({ note })]
      expect(() => toCii(invoice, { level })).toThrow(/^toCii: BT-127 \(invoice line note\) is mandatory and empty/)
    }
  })

  // The EXTENDED XSD `NoteType/Content` is minOccurs="0" and annex A gives BT-22 / BT-127 0..1 at EXTENDED-CTC-FR.
  it('writes notes with a subject code and no text without ram:Content at extended-ctc-fr, valid against the XSD and Schematron', async () => {
    const level = 'extended-ctc-fr'
    const invoice = await enInvoice()
    invoice.notes = [new EN16931.InvoiceNote({ subjectCode: 'AAI' }), new EN16931.InvoiceNote({ note: 'kept' })]
    invoice.lines[0]!.notes = [new EN16931.LineNote({ subjectCode: 'AAI' })]
    const cii = toCii(invoice, { level })
    expect(cii.exchangedDocument.includedNote![0]!.content).toBeUndefined()
    const xml = (await invoiceToXml(cii)).toString()
    expect(xml).toMatch(/<ram:IncludedNote>\s*<ram:SubjectCode>AAI<\/ram:SubjectCode>\s*<\/ram:IncludedNote>/)
    expect(xml.match(/<ram:IncludedNote>\s*<ram:SubjectCode>/g)).toHaveLength(2)
    const result = await check({ xml, schematron: true })
    expect(result.level).toBe(level)
    expect(result.errors).toEqual([])
    expect(result.schematronErrors).toEqual([])
    expect(result.valid).toBe(true)
    // Read back: no text, nothing dropped (the parser's empty stand-in, CG-37, is not reported).
    const back = fromCii(await xmlToInvoice(xml))
    expect(back.dropped).toEqual([])
    expect(back.invoice.notes[0]).toEqual(new EN16931.InvoiceNote({ subjectCode: 'AAI' }))
    expect(back.invoice.lines[0]!.notes).toEqual([new EN16931.LineNote({ subjectCode: 'AAI' })])
  })

  // Factur-X EXTENDED: BR-FXEXT-01 / -02 want the text (or the coded text BT-X-5 / BT-X-9, outside the model)
  // with a subject code.
  it('at extended, refuses a subject code without text (BR-FXEXT-01 / -02)', async () => {
    const header = await enInvoice()
    header.notes = [new EN16931.InvoiceNote({ subjectCode: 'AAI' })]
    expect(() => toCii(header, { level: 'extended' })).toThrow(/^toCii: BT-21 .*BT-22.*BR-FXEXT-01/)
    const line = await enInvoice()
    line.lines[0]!.notes = [new EN16931.LineNote({ subjectCode: 'AAI' })]
    expect(() => toCii(line, { level: 'extended' })).toThrow(/^toCii: EXT-FR-FE-183 .*BT-127.*BR-FXEXT-02/)
  })

  // A note with neither text nor subject code carries nothing and would write an empty `ram:IncludedNote`
  // (PEPPOL-EN16931-R008).
  it.each(['extended', 'extended-ctc-fr'] as const)('at %s, refuses a note with neither text nor subject code, never quoting content', async (level) => {
    for (const fields of [{}, { note: '' }, { note: ' \t\r\n' }]) {
      const header = await enInvoice()
      header.notes = [new EN16931.InvoiceNote(fields)]
      expect(() => toCii(header, { level })).toThrow(/^toCii: BG-1 \(invoice note\) needs BT-22 .*BT-21/)
      const line = await enInvoice()
      line.lines[0]!.notes = [new EN16931.LineNote(fields)]
      expect(() => toCii(line, { level })).toThrow(/^toCii: an invoice line note needs BT-127 .*EXT-FR-FE-183/)
    }
  })

  it('at extended-ctc-fr, a note with only a subject code still writes', async () => {
    const invoice = await enInvoice()
    invoice.notes = [new EN16931.InvoiceNote({ subjectCode: 'AAI' })]
    expect(() => toCii(invoice, { level: 'extended-ctc-fr' })).not.toThrow()
  })

  it('reads a note without text as undefined (fromCii stays tolerant)', async () => {
    const cii = await corpus('3.EN16931', 'F20260025')
    cii.exchangedDocument.includedNote = [{ content: { value: '' }, subjectCode: { value: 'AAI' } } as never]
    const { invoice, dropped } = fromCii(cii)
    expect(invoice.notes).toEqual([new EN16931.InvoiceNote({ subjectCode: 'AAI' })])
    expect(dropped).toEqual([])
  })
})

describe('en 16931 model: a plain-object invoice', () => {
  // A plain object with the optional repeatable groups left out, at every level they occur (BG-20 / BG-21
  // stay: leaving them out changes the totals; tests/en16931-settlement.test.ts covers them).
  async function plain(): Promise<Invoice> {
    const { notes, precedingInvoiceReferences, invoicedObjectIdentifiers, additionalDocuments, seller, buyer, lines, ...rest } = await enInvoice()
    const { identifiers: _s, ...plainSeller } = seller
    const { identifiers: _b, ...plainBuyer } = buyer
    return {
      ...rest,
      seller: plainSeller,
      buyer: plainBuyer,
      lines: lines.map(({ notes, objectIdentifiers, allowances, charges, precedingInvoiceReferences, item, ...line }) => {
        const { attributes, classifications, ...plainItem } = item
        return { ...line, item: plainItem }
      }),
    } as unknown as Invoice
  }

  it('reads the optional repeatable groups it leaves out as empty and writes a valid document', async () => {
    const invoice = await plain()
    const before = JSON.stringify(invoice)
    const xml = (await invoiceToXml(toCii(invoice, { level: 'en16931' }))).toString()
    expect(JSON.stringify(invoice)).toBe(before)
    const result = await check({ xml, schematron: true })
    expect(result.errors).toEqual([])
    expect(result.schematronErrors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('writes the same CII as class instances for the extended groups left without arrays (BG-17, payee, line deliver to and seller)', async () => {
    const withClasses = await enInvoice()
    withClasses.paymentInstructions = new EN16931.PaymentInstructions({ paymentMeansTypeCode: '30' })
    withClasses.payee = new EN16931.Payee({ name: 'P' })
    withClasses.lines[0]!.deliverTo = new EN16931.LineDeliverTo({ name: 'D' })
    withClasses.lines[0]!.seller = new EN16931.LineSeller({ name: 'S' })
    const { lines, ...rest } = withClasses
    const plainInvoice = {
      ...rest,
      paymentInstructions: { paymentMeansTypeCode: '30' },
      payee: { name: 'P' },
      lines: [{ ...lines[0]!, deliverTo: { name: 'D' }, seller: { name: 'S' } }, ...lines.slice(1)],
    } as unknown as Invoice
    expect(toCii(plainInvoice, { level: 'extended' })).toEqual(toCii(withClasses, { level: 'extended' }))
  })

  it('names the term for a group that is not an array, and the mandatory BG-23 and BG-25, never a TypeError', async () => {
    const message = (invoice: object): string => {
      try {
        toCii(invoice as Invoice, { level: 'en16931' })
      }
      catch (error) {
        expect(error).not.toBeInstanceOf(TypeError)
        return (error as Error).message
      }
      return ''
    }
    const invoice = await plain()
    expect(message({ ...invoice, notes: 'n' })).toBe('toCii: BG-1 (invoice notes) must be an array')
    expect(message({ ...invoice, seller: { ...invoice.seller, identifiers: {} } })).toMatch(/^toCii: BT-29 .* must be an array/)
    expect(message({ ...invoice, paymentInstructions: { paymentMeansTypeCode: '58', creditTransfers: 'x' } })).toMatch(/^toCii: BG-17 .* must be an array/)
    expect(message({ ...invoice, lines: [{ ...invoice.lines[0], notes: 1 }] })).toMatch(/^toCii: BT-127 .* must be an array/)
    expect(message({ ...invoice, lines: undefined })).toMatch(/^toCii: BG-25/)
    expect(message({ ...invoice, vatBreakdown: undefined })).toMatch(/^toCii: BG-23/)
  })
})

describe('en 16931 model: BT-11-0 default name', () => {
  it('reads the default project name toCii() writes as absent and writes it back (CII stays lossless)', async () => {
    const cii = await corpus('3.EN16931', 'F20260025')
    const agreement = cii.supplyChainTradeTransaction.applicableHeaderTradeAgreement
    agreement.specifiedProcuringProject = { id: { value: 'PRJ-1' }, name: { value: 'Project reference' } } as never
    const { invoice, dropped } = fromCii(cii)
    expect(invoice.projectReference).toBe('PRJ-1')
    expect(invoice.projectName).toBeUndefined()
    expect(dropped).toEqual([])
    expect(toCii(invoice, { level: 'en16931' }).supplyChainTradeTransaction.applicableHeaderTradeAgreement.specifiedProcuringProject?.name.value).toBe('Project reference')
  })

  it('keeps any other name, the "Project Reference" spelling of CG-49 included', async () => {
    const cii = await corpus('3.EN16931', 'F20260025')
    cii.supplyChainTradeTransaction.applicableHeaderTradeAgreement.specifiedProcuringProject = { id: { value: 'PRJ-1' }, name: { value: 'Project Reference' } } as never
    expect(fromCii(cii).invoice.projectName).toBe('Project Reference')
  })
})

describe('en 16931 model: an Amount has at most 2 decimals', () => {
  it('throws, naming BT-110, on a VAT total with 3 decimals', async () => {
    const invoice = await enInvoice()
    invoice.totals.invoiceTotalVatAmount = 20.125
    expect(() => toCii(invoice, { level: 'en16931' })).toThrow(/BT-110.*2 decimals/)
  })

  it('names a lone BT-111 by its currency, not its position', async () => {
    const invoice = await enInvoice()
    invoice.vatAccountingCurrencyCode = 'USD'
    invoice.totals.invoiceTotalVatAmount = undefined
    invoice.totals.invoiceTotalVatAmountInAccountingCurrency = 22.125
    expect(() => toCii(invoice, { level: 'en16931' })).toThrow(/^toCii: BT-111 \(invoice total VAT amount in accounting currency\) has more than 2 decimals/)
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

describe('en 16931 model: whitespace-only mandatory values count as empty', () => {
  // The Schematron tests presence with normalize-space(x) != '': space, tab, CR and LF only.
  const blank = ' \t\n'
  const cases: [string, RegExp, (i: Invoice) => void][] = [
    ['BT-1', /^toCii: BT-1 .*mandatory and empty/, (i) => { i.number = blank }],
    ['a party name (BT-27)', /^toCii: BT-27 .*mandatory and empty/, (i) => { i.seller.name = blank }],
    ['a line term (BT-126)', /^toCii: BT-126 .*mandatory and empty/, (i) => { i.lines[0]!.identifier = blank }],
    ['BT-84 in a credit transfer', /^toCii: BT-84 .*BR-50/, (i) => { i.paymentInstructions = new EN16931.PaymentInstructions({ paymentMeansTypeCode: '58', creditTransfers: [new EN16931.CreditTransfer({ paymentAccountIdentifier: blank })] }) }],
    ['BT-22 at en16931', /^toCii: BT-22 .*mandatory and empty/, (i) => { i.notes = [new EN16931.InvoiceNote({ note: blank })] }],
  ]

  it.each(cases)('throws for %s', async (_name, message, mutate) => {
    const invoice = await enInvoice()
    mutate(invoice)
    expect(() => toCii(invoice, { level: 'en16931' })).toThrow(message)
  })

  it('does not treat a no-break space as empty, and writes it untouched', async () => {
    const invoice = await enInvoice()
    invoice.number = '\u00A0'
    expect(() => toCii(invoice, { level: 'en16931' })).not.toThrow()
    expect(toCii(invoice, { level: 'en16931' }).exchangedDocument.id.value).toBe('\u00A0')
  })
})

describe('en 16931 model: BR-50 and the payment means type code (CG-58)', () => {
  // The vendored Schematron fires BR-50 only for TypeCode 30 or 58; toCii follows the rule text and
  // refuses any BG-17 without BT-84 / BT-84-0. Pinned so a change of either side is deliberate.
  it('refuses a credit transfer without BT-84 whatever the payment means type code', async () => {
    const invoice = await enInvoice()
    invoice.paymentInstructions = new EN16931.PaymentInstructions({ paymentMeansTypeCode: '42', creditTransfers: [new EN16931.CreditTransfer({ paymentAccountName: 'n', paymentServiceProviderIdentifier: 'BICXXXXX' })] })
    expect(() => toCii(invoice, { level: 'en16931' })).toThrow(/^toCii: BT-84 .*BR-50/)
  })
})
