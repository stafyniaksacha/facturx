import type { CrossIndustryInvoiceType, TradeTaxType } from '@stafyniaksacha/facturx/models'
import { readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import * as api from '@stafyniaksacha/facturx'
import { EN16931, extract, fromCii, toCii, xmlToInvoice } from '@stafyniaksacha/facturx'
import * as subpath from '@stafyniaksacha/facturx/en16931'
import { describe, expect, it } from 'vitest'
// Internal: the `dropped` algorithm is not public API, so it is tested from the source.
import { diffPaths } from '../src/lib/mapping/cii/dropped'

const CORPUS_DIR = resolve(import.meta.dirname, '../spec/factur-x-1.09/distribution/5. FACTUR-X 1.09 - Examples/_Factur-X_1.08-Exemples_CS')
const ANNEX_B_DIR = resolve(import.meta.dirname, '../spec/afnor-xp-z12-012-1.4/distribution/XP_Z12-012_Annexe_B_EXEMPLES_V1.4/Factures')
const ROOT = '/rsm:CrossIndustryInvoice'

function pdfs(folder: string): string[] {
  const dir = join(CORPUS_DIR, folder)
  return readdirSync(dir).filter(f => f.endsWith('.pdf')).sort().map(f => join(dir, f))
}

async function ciiFromPdf(file: string): Promise<CrossIndustryInvoiceType> {
  const { xml } = await extract({ pdf: await readFile(file) })
  return xmlToInvoice(xml)
}

// Annex B commented CII documents at the two profiles the design says must map losslessly.
const annexBCii = readdirSync(ANNEX_B_DIR, { withFileTypes: true, recursive: true })
  .filter(e => e.isFile() && /_(?:EN16931_FX|EXTENDED-CTC-FR)_CII_Commentee\.xml$/.test(e.name))
  .map(e => join(e.parentPath ?? (e as { path?: string }).path ?? '', e.name))
  .sort()

// The CII parts the header mapping of this module owns. BT-7 / BT-8 live in the VAT breakdown
// entries (ApplicableTradeTax) and BT-20 next to BT-9: those subtrees belong to the settlement
// mapping, so only BT-9 is compared there.
function headerOf(cii: CrossIndustryInvoiceType): unknown {
  const t = cii.supplyChainTradeTransaction
  const a = t.applicableHeaderTradeAgreement
  const d = t.applicableHeaderTradeDelivery
  const s = t.applicableHeaderTradeSettlement
  return {
    context: cii.exchangedDocumentContext,
    document: cii.exchangedDocument,
    agreement: {
      buyerReference: a.buyerReference,
      sellerOrderReferencedDocument: a.sellerOrderReferencedDocument,
      buyerOrderReferencedDocument: a.buyerOrderReferencedDocument,
      contractReferencedDocument: a.contractReferencedDocument,
      additionalReferencedDocument: a.additionalReferencedDocument,
      specifiedProcuringProject: a.specifiedProcuringProject,
    },
    delivery: {
      despatchAdviceReferencedDocument: d.despatchAdviceReferencedDocument,
      receivingAdviceReferencedDocument: d.receivingAdviceReferencedDocument,
    },
    settlement: {
      taxCurrencyCode: s.taxCurrencyCode,
      invoiceCurrencyCode: s.invoiceCurrencyCode,
      billingSpecifiedPeriod: s.billingSpecifiedPeriod,
      invoiceReferencedDocument: s.invoiceReferencedDocument,
      receivableSpecifiedTradeAccountingAccount: s.receivableSpecifiedTradeAccountingAccount,
      paymentDueDates: (s.specifiedTradePaymentTerms ?? []).map((p: { dueDateDateTime?: unknown }) => p.dueDateDateTime).filter(Boolean),
    },
  }
}

function iso(dateTimeString: string): string {
  return `${dateTimeString.slice(0, 4)}-${dateTimeString.slice(4, 6)}-${dateTimeString.slice(6, 8)}`
}

describe('en 16931 model: header terms', () => {
  it('maps the header terms of the EN 16931 corpus example both ways', async () => {
    const cii = await ciiFromPdf(pdfs('3.EN16931').find(f => f.includes('F20260023'))!)
    const { invoice } = fromCii(cii)

    expect(invoice).toBeInstanceOf(EN16931.Invoice)
    expect(invoice.number).toBe(cii.exchangedDocument.id.value)
    expect(invoice.issueDate).toBe(iso(cii.exchangedDocument.issueDateTime.dateTimeString))
    expect(invoice.issueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(invoice.typeCode).toBe(cii.exchangedDocument.typeCode.value)
    expect(invoice.currencyCode).toBe(cii.supplyChainTradeTransaction.applicableHeaderTradeSettlement.invoiceCurrencyCode.value)
    expect(invoice.specificationIdentifier).toBe('urn:cen.eu:en16931:2017')
    // This example has BG-1, BG-24 with BT-17 and BT-18, BT-11 and BT-8.
    expect(invoice.notes.length).toBeGreaterThan(0)
    expect(invoice.additionalDocuments.map(d => d.reference)).toEqual(['SUPPort doc'])
    expect(invoice.tenderOrLotReference).toBe('TENDER-002')
    expect(invoice.invoicedObjectIdentifiers).toEqual([{ value: 'REFCLI0215', schemeId: 'IT' }])
    expect(invoice.projectReference).toBe('PROJET2547')
    // BT-8 is held as UNTDID 2005 (EN 16931); CII writes UNTDID 2475 72 "payment date" ⇔ 432.
    expect(invoice.valueAddedTaxPointDateCode).toBe('432')

    expect(headerOf(toCii(invoice, { level: 'en16931' }))).toEqual(headerOf(cii))
  })

  it.each([...pdfs('2.BASIC'), ...pdfs('3.EN16931')].map(f => [f.split('/').pop()!, f]))(
    'round-trips the header subtrees of corpus %s',
    async (_name, file) => {
      const cii = await ciiFromPdf(file)
      const level = file.includes('/2.BASIC/') ? 'basic' : 'en16931'
      const { invoice } = fromCii(cii)
      expect(headerOf(toCii(invoice, { level }))).toEqual(headerOf(cii))
    },
  )

  it.each(annexBCii.map(f => [f.split('/').pop()!, f]))('round-trips the header subtrees of annex B %s', async (_name, file) => {
    const cii = await xmlToInvoice(await readFile(file))
    const level = file.includes('EXTENDED-CTC-FR') ? 'extended-ctc-fr' : 'en16931'
    const { invoice } = fromCii(cii)
    expect(headerOf(toCii(invoice, { level }))).toEqual(headerOf(cii))
  })

  it('round-trips every header term, the EXT-FR-FE ones included, with nothing dropped', () => {
    const invoice = new EN16931.Invoice({
      number: 'F-1 & <2>',
      issueDate: '2025-07-01',
      typeCode: '384',
      currencyCode: 'EUR',
      vatAccountingCurrencyCode: 'USD',
      paymentDueDate: '2025-08-31',
      buyerReference: 'Réf. acheteur €',
      projectReference: 'PRJ-1',
      contractReference: 'CT-9',
      contractCodeType: 'CT',
      contractDate: '2024-12-31',
      purchaseOrderReference: 'PO-7',
      orderDate: '2025-06-01',
      salesOrderReference: 'SO-3',
      receivingAdviceReference: 'RCV-2',
      despatchAdviceReference: 'DSP-4',
      despatchAdviceDate: '2025-06-15',
      tenderOrLotReference: 'LOT-5',
      invoicedObjectIdentifiers: [new EN16931.Identifier({ value: 'OBJ-1', schemeId: 'AOP' }), new EN16931.Identifier({ value: 'OBJ-2' })],
      buyerAccountingReference: 'ACC-1',
      businessProcessType: 'B1',
      notes: [new EN16931.InvoiceNote({ subjectCode: 'AAI', note: 'Line 1\n“quoted” <&>' }), new EN16931.InvoiceNote({ note: 'second' })],
      precedingInvoiceReferences: [new EN16931.PrecedingInvoiceReference({ reference: 'F-0', issueDate: '2025-06-30', typeCode: '380' })],
      invoicingPeriod: new EN16931.InvoicingPeriod({ startDate: '2025-06-01', endDate: '2025-06-30' }),
      additionalDocuments: [
        new EN16931.AdditionalSupportingDocument({
          reference: 'DOC-1',
          description: 'Timesheet',
          externalLocation: 'https://example.invalid/doc-1',
          attachedDocument: new EN16931.AttachedDocument({ content: 'JVBERi0xLjQK', mimeCode: 'application/pdf', filename: 'doc-1.pdf' }),
        }),
        new EN16931.AdditionalSupportingDocument({ reference: 'DOC-2' }),
      ],
    })

    const cii = toCii(invoice, { level: 'extended-ctc-fr' })
    const back = fromCii(cii)
    expect(back.dropped).toEqual([])
    expect(back.invoice).toEqual(new EN16931.Invoice({
      ...invoice,
      specificationIdentifier: 'urn:cen.eu:en16931:2017#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr',
    }))
  })
})

describe('en 16931 model: VAT point date (BT-7, BT-8)', () => {
  const header = { number: 'A', issueDate: '2025-07-01', typeCode: '380', currencyCode: 'EUR' }
  function withTaxes(...taxes: object[]): CrossIndustryInvoiceType {
    const cii = toCii(new EN16931.Invoice(header), { level: 'en16931' })
    cii.supplyChainTradeTransaction.applicableHeaderTradeSettlement.applicableTradeTax = taxes as TradeTaxType[]
    return cii
  }

  it('reads BT-8 from the VAT breakdown entries as UNTDID 2005', () => {
    // CII uses UNTDID 2475 (5, 29, 72), UBL and EN 16931 UNTDID 2005 (3, 35, 432): Factur-X matrix
    // BT-8 usage note, annex A Flux_2_UBL BT-8 usage note, annex B UC1 CII 72 / UBL 432.
    for (const [cii, en] of [['5', '3'], ['29', '35'], ['72', '432']]) {
      const { invoice } = fromCii(withTaxes({ dueDateTypeCode: { value: cii } }, {}))
      expect(invoice.valueAddedTaxPointDateCode).toBe(en)
    }
  })

  it('reads BT-7 and BT-8 when every carrying entry agrees, and leaves them to dropped otherwise', () => {
    const agree = fromCii(withTaxes({ taxPointDate: { dateString: '20250630', format: '102' } }, { taxPointDate: { dateString: '20250630', format: '102' } }))
    expect(agree.invoice.valueAddedTaxPointDate).toBe('2025-06-30')

    const disagree = fromCii(withTaxes({ dueDateTypeCode: { value: '5' } }, { dueDateTypeCode: { value: '72' } }))
    expect(disagree.invoice.valueAddedTaxPointDateCode).toBeUndefined()
    expect(disagree.dropped).toEqual(expect.arrayContaining([
      `${ROOT}/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax[1]/ram:DueDateTypeCode`,
      `${ROOT}/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax[2]/ram:DueDateTypeCode`,
    ]))

    const unknown = fromCii(withTaxes({ dueDateTypeCode: { value: '999' } }))
    expect(unknown.invoice.valueAddedTaxPointDateCode).toBeUndefined()
  })

  it('rejects a BT-8 code outside UNTDID 2005 3 / 35 / 432 and BT-7 at basic', () => {
    expect(() => toCii(new EN16931.Invoice({ ...header, valueAddedTaxPointDateCode: '72' }), { level: 'en16931' })).toThrow(/BT-8/)
    expect(() => toCii(new EN16931.Invoice({ ...header, valueAddedTaxPointDate: '2025-06-30' }), { level: 'basic' })).toThrow(/BT-7/)
  })
})

describe('en 16931 model: levels', () => {
  it('rejects MINIMUM and BASIC WL', async () => {
    for (const folder of ['0.MINIMUM', '1.BASIC WL']) {
      const cii = await ciiFromPdf(pdfs(folder)[0])
      expect(() => fromCii(cii)).toThrow(/not an EN 16931 invoice/)
    }
  })

  const base = { number: 'SECRET-NUMBER', issueDate: '2025-07-01', typeCode: '380', currencyCode: 'EUR' }

  it('throws when toCii gets an EXT-FR-FE value at en16931', () => {
    const invoice = new EN16931.Invoice({ ...base, contractReference: 'SECRET-CONTRACT', contractCodeType: 'SECRET-TYPE' })
    for (const level of ['basic', 'en16931'] as const) {
      let message = ''
      try {
        toCii(invoice, { level })
      }
      catch (error) {
        message = (error as Error).message
      }
      expect(message).toMatch(/EXT-FR-FE-01/)
      expect(message).toContain(level)
      // Thrown messages never quote invoice content.
      expect(message).not.toMatch(/SECRET/)
    }
    expect(() => toCii(invoice, { level: 'extended' })).not.toThrow()
    expect(() => toCii(invoice, { level: 'extended-ctc-fr' })).not.toThrow()

    const preceding = new EN16931.Invoice({ ...base, precedingInvoiceReferences: [new EN16931.PrecedingInvoiceReference({ reference: 'F-0', typeCode: '380' })] })
    expect(() => toCii(preceding, { level: 'en16931' })).toThrow(/EXT-FR-FE-02/)
  })

  it('throws when toCii gets a term BASIC does not carry at basic', () => {
    const invoice = new EN16931.Invoice({ ...base, salesOrderReference: 'SO-1' })
    expect(() => toCii(invoice, { level: 'basic' })).toThrow(/BT-14/)
    expect(() => toCii(invoice, { level: 'en16931' })).not.toThrow()
  })

  it('throws without a valid level, and on a BT-24 of another level', () => {
    const invoice = new EN16931.Invoice(base)
    expect(() => toCii(invoice, undefined as never)).toThrow(/level/)
    expect(() => toCii(invoice, { level: 'basicwl' as never })).toThrow(/level/)
    const extended = new EN16931.Invoice({ ...base, specificationIdentifier: 'urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended' })
    expect(() => toCii(extended, { level: 'en16931' })).toThrow(/BT-24/)
    expect(toCii(extended, { level: 'extended' }).exchangedDocumentContext.guidelineSpecifiedDocumentContextParameter.id.value)
      .toBe('urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended')
  })

  it('writes BT-24 for the level when the invoice has none', () => {
    const ids = {
      'basic': 'urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic',
      'en16931': 'urn:cen.eu:en16931:2017',
      'extended': 'urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended',
      'extended-ctc-fr': 'urn:cen.eu:en16931:2017#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr',
    } as const
    for (const [level, id] of Object.entries(ids)) {
      const cii = toCii(new EN16931.Invoice(base), { level: level as keyof typeof ids })
      expect(cii.exchangedDocumentContext.guidelineSpecifiedDocumentContextParameter.id.value).toBe(id)
    }
  })

  it('rejects a date that is not ISO YYYY-MM-DD, naming the term', () => {
    expect(() => toCii(new EN16931.Invoice({ ...base, paymentDueDate: '20250701' }), { level: 'en16931' })).toThrow(/BT-9/)
  })
})

describe('en 16931 model: the dropped contract', () => {
  it('reports what it cannot map, and only that', async () => {
    const x = await ciiFromPdf(pdfs('3.EN16931').find(f => f.includes('F20260023'))!)
    expect(diffPaths(x, x)).toEqual([])

    const notes = x.exchangedDocument.includedNote!
    const n = notes.length
    expect(n).toBeGreaterThan(1)
    const without = structuredClone(x)
    without.exchangedDocument.includedNote = notes.slice(0, -1)
    const note = `${ROOT}/rsm:ExchangedDocument/ram:IncludedNote[${n}]`
    const last = notes[n - 1]
    expect(diffPaths(x, without)).toEqual([
      ...(last.contentCode ? [`${note}/ram:ContentCode`] : []),
      `${note}/ram:Content`,
      ...(last.subjectCode ? [`${note}/ram:SubjectCode`] : []),
    ])
    // Additions in the second model are not losses.
    expect(diffPaths(without, x)).toEqual([])
  })

  it('names attributes, dates and changed values by their XML path', () => {
    const a = toCii(new EN16931.Invoice({ number: 'A', issueDate: '2025-07-01', typeCode: '380', currencyCode: 'EUR', precedingInvoiceReferences: [new EN16931.PrecedingInvoiceReference({ reference: 'P', issueDate: '2025-01-02' })], invoicedObjectIdentifiers: [new EN16931.Identifier({ value: 'O', schemeId: 'S' })] }), { level: 'en16931' })
    const b = structuredClone(a)
    b.exchangedDocument.id.value = 'B'
    b.exchangedDocument.issueDateTime.format = '203'
    delete b.supplyChainTradeTransaction.applicableHeaderTradeSettlement.invoiceReferencedDocument![0].formattedIssueDateTime
    delete b.supplyChainTradeTransaction.applicableHeaderTradeAgreement.additionalReferencedDocument![0].referenceTypeCode
    expect(diffPaths(a, b)).toEqual([
      `${ROOT}/rsm:ExchangedDocument/ram:ID`,
      `${ROOT}/rsm:ExchangedDocument/ram:IssueDateTime/udt:DateTimeString/@format`,
      `${ROOT}/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement/ram:AdditionalReferencedDocument[1]/ram:ReferenceTypeCode`,
      `${ROOT}/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:InvoiceReferencedDocument[1]/ram:FormattedIssueDateTime/qdt:DateTimeString`,
      `${ROOT}/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:InvoiceReferencedDocument[1]/ram:FormattedIssueDateTime/qdt:DateTimeString/@format`,
    ])
  })

  it('lists in dropped the CII content the model has no term for', () => {
    const cii = toCii(new EN16931.Invoice({ number: 'A', issueDate: '2025-07-01', typeCode: '380', currencyCode: 'EUR' }), { level: 'en16931' })
    // BT-X-2 (document name) is a Factur-X field with no EN 16931 or EXT-FR-FE id.
    cii.exchangedDocument.name = { value: 'Name' }
    const { invoice, dropped } = fromCii(cii)
    expect(dropped).toEqual([`${ROOT}/rsm:ExchangedDocument/ram:Name`])
    expect(invoice.number).toBe('A')
  })

  it('drops a date that is not in format 102 instead of reformatting it', () => {
    const cii = toCii(new EN16931.Invoice({ number: 'A', issueDate: '2025-07-01', typeCode: '380', currencyCode: 'EUR', paymentDueDate: '2025-08-01' }), { level: 'en16931' })
    cii.supplyChainTradeTransaction.applicableHeaderTradeSettlement.specifiedTradePaymentTerms![0].dueDateDateTime = { dateTimeString: '202508', format: '610' }
    const { invoice, dropped } = fromCii(cii)
    expect(invoice.paymentDueDate).toBeUndefined()
    const terms = `${ROOT}/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradePaymentTerms[1]/ram:DueDateDateTime`
    expect(dropped).toEqual([`${terms}/udt:DateTimeString`, `${terms}/udt:DateTimeString/@format`])
  })
})

describe('en 16931 model: entry points', () => {
  it('exposes EN16931, fromCii and toCii from the root and the ./en16931 subpath', () => {
    expect(typeof api.fromCii).toBe('function')
    expect(typeof api.toCii).toBe('function')
    expect(typeof api.EN16931.Invoice).toBe('function')
    expect(subpath.fromCii).toBe(api.fromCii)
    expect(subpath.toCii).toBe(api.toCii)
    expect(subpath.Invoice).toBe(api.EN16931.Invoice)
    for (const name of ['Identifier', 'PostalAddress', 'Contact', 'InvoiceNote', 'PrecedingInvoiceReference', 'InvoicingPeriod', 'AdditionalSupportingDocument', 'AttachedDocument'])
      expect(typeof (subpath as Record<string, unknown>)[name]).toBe('function')
    // Object constructors, like the CII models: `new X({})` works for documentation walkers.
    for (const value of Object.values(api.EN16931)) {
      if (typeof value === 'function')
        expect(() => new (value as new (init: object) => object)({})).not.toThrow()
    }
  })
})
