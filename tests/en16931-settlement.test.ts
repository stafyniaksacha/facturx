import type { Invoice } from '@stafyniaksacha/facturx/en16931'
import type { CrossIndustryInvoiceType } from '@stafyniaksacha/facturx/models'
import { readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { EN16931, extract, fromCii, toCii, xmlToInvoice } from '@stafyniaksacha/facturx'
import { describe, expect, it } from 'vitest'

const CORPUS_DIR = resolve(import.meta.dirname, '../spec/factur-x-1.09/distribution/5. FACTUR-X 1.09 - Examples/_Factur-X_1.08-Exemples_CS')
const ANNEX_B_DIR = resolve(import.meta.dirname, '../spec/afnor-xp-z12-012-1.4/distribution/XP_Z12-012_Annexe_B_EXEMPLES_V1.4/Factures')
const SETTLEMENT = `/rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement`

function pdfs(folder: string): string[] {
  const dir = join(CORPUS_DIR, folder)
  return readdirSync(dir).filter(f => f.endsWith('.pdf')).sort().map(f => join(dir, f))
}

async function ciiFromPdf(file: string): Promise<CrossIndustryInvoiceType> {
  const { xml } = await extract({ pdf: await readFile(file) })
  return xmlToInvoice(xml)
}

const annexBCii = readdirSync(ANNEX_B_DIR, { withFileTypes: true, recursive: true })
  .filter(e => e.isFile() && /_(?:EN16931_FX|EXTENDED-CTC-FR)_CII_Commentee\.xml$/.test(e.name))
  .map(e => join(e.parentPath ?? (e as { path?: string }).path ?? '', e.name))
  .sort()

// The header settlement elements the settlement mapping owns (the lines' own settlement is Task 4's).
function settlementOf(cii: CrossIndustryInvoiceType): unknown {
  const s = cii.supplyChainTradeTransaction.applicableHeaderTradeSettlement
  return {
    creditorReferenceID: s.creditorReferenceID,
    paymentReference: s.paymentReference,
    taxApplicableTradeCurrencyExchange: s.taxApplicableTradeCurrencyExchange,
    specifiedTradeSettlementPaymentMeans: s.specifiedTradeSettlementPaymentMeans,
    applicableTradeTax: s.applicableTradeTax,
    specifiedTradeAllowanceCharge: s.specifiedTradeAllowanceCharge,
    specifiedTradePaymentTerms: s.specifiedTradePaymentTerms,
    specifiedTradeSettlementHeaderMonetarySummation: s.specifiedTradeSettlementHeaderMonetarySummation,
  }
}

const OWNED = /\/ram:ApplicableHeaderTradeSettlement\/ram:(?:CreditorReferenceID|PaymentReference|TaxApplicableTradeCurrencyExchange|SpecifiedTradeSettlementPaymentMeans|ApplicableTradeTax|SpecifiedTradeAllowanceCharge|SpecifiedTradePaymentTerms|SpecifiedTradeSettlementHeaderMonetarySummation)\b/

// Corpus F20260023, F20260024 and F20260031 carry BT-7 / BT-8 on the first ApplicableTradeTax entry
// only; `toCii()` writes them on every entry (controller ruling, matches annex B). Every original
// value is still present in the regenerated CII (so `dropped` stays empty): only its placement differs.
// This is the only loosening of the subtree comparison.
const FIRST_ENTRY_ONLY = /F2026(?:0023|0024|0031)/
function spreadVatPoint(cii: CrossIndustryInvoiceType): CrossIndustryInvoiceType {
  const copy = structuredClone(cii)
  const taxes = copy.supplyChainTradeTransaction.applicableHeaderTradeSettlement.applicableTradeTax
  const date = taxes.find(t => t.taxPointDate)?.taxPointDate
  const code = taxes.find(t => t.dueDateTypeCode)?.dueDateTypeCode
  for (const t of taxes) {
    t.taxPointDate ??= date
    t.dueDateTypeCode ??= code
  }
  return copy
}

const PARTIES = {
  seller: new EN16931.Seller({ name: 'S', address: new EN16931.PostalAddress({ countryCode: 'FR' }) }),
  buyer: new EN16931.Buyer({ name: 'B', address: new EN16931.PostalAddress({ countryCode: 'FR' }) }),
}
function VAT() {
  return new EN16931.VatBreakdown({ categoryTaxableAmount: 100, categoryTaxAmount: 20, categoryCode: 'S', categoryRate: 20 })
}
function TOTALS() {
  return new EN16931.DocumentTotals({
    sumOfInvoiceLineNetAmount: 100,
    invoiceTotalAmountWithoutVat: 100,
    invoiceTotalVatAmount: 20,
    invoiceTotalAmountWithVat: 120,
    amountDueForPayment: 120,
  })
}
const base = {
  number: 'F-1',
  issueDate: '2025-07-01',
  typeCode: '380',
  currencyCode: 'EUR',
  ...PARTIES,
  totals: TOTALS(),
  vatBreakdown: [VAT()],
  lines: [new EN16931.InvoiceLine({ identifier: '1', invoicedQuantity: 1, invoicedQuantityUnitCode: 'C62', netAmount: 100, price: new EN16931.PriceDetails({ netPrice: 100 }), vat: new EN16931.LineVat({ categoryCode: 'S', rate: 20 }), item: new EN16931.Item({ name: 'Item' }) })],
}

const levelOf = (file: string) => file.includes('EXTENDED-CTC-FR') ? 'extended-ctc-fr' : 'en16931'
const corpusLevel = (file: string) => file.includes('/2.BASIC/') ? 'basic' : file.includes('/4.EXTENDED/') ? 'extended' : 'en16931'

describe('en 16931 model: settlement round trip', () => {
  it.each([...pdfs('2.BASIC'), ...pdfs('3.EN16931'), ...pdfs('4.EXTENDED')].map(f => [f.split('/').pop()!, f]))(
    'round-trips the settlement subtrees of corpus %s',
    async (name, file) => {
      const cii = await ciiFromPdf(file)
      const { invoice, dropped } = fromCii(cii)
      const expected = FIRST_ENTRY_ONLY.test(name) ? spreadVatPoint(cii) : cii
      if (FIRST_ENTRY_ONLY.test(name)) {
        // The normalisation is needed and changes nothing but placement.
        expect(cii.supplyChainTradeTransaction.applicableHeaderTradeSettlement.applicableTradeTax.some(t => !t.dueDateTypeCode)).toBe(true)
      }
      expect(settlementOf(toCii(invoice, { level: corpusLevel(file) }))).toEqual(settlementOf(expected))
      expect(dropped.filter(p => OWNED.test(p))).toEqual([])
    },
  )

  // Un-normalised: annex B writes BT-7 / BT-8 on every entry, which proves `toCii()` does too.
  it.each(annexBCii.map(f => [f.split('/').pop()!, f]))('round-trips the settlement subtrees of annex B %s', async (_name, file) => {
    const cii = await xmlToInvoice(await readFile(file))
    const { invoice, dropped } = fromCii(cii)
    expect(settlementOf(toCii(invoice, { level: levelOf(file) }))).toEqual(settlementOf(cii))
    expect(dropped.filter(p => OWNED.test(p))).toEqual([])
  })

  it('reads the settlement terms of a corpus invoice into the model', async () => {
    const cii = await ciiFromPdf(pdfs('3.EN16931').find(f => f.includes('F20260023'))!)
    const { invoice } = fromCii(cii)
    expect(invoice.totals).toBeInstanceOf(EN16931.DocumentTotals)
    expect(invoice.totals).toEqual(expect.objectContaining({
      sumOfInvoiceLineNetAmount: 95,
      sumOfChargesOnDocumentLevel: 14,
      sumOfAllowancesOnDocumentLevel: 9,
      invoiceTotalAmountWithoutVat: 100,
      invoiceTotalVatAmount: 4.9,
      roundingAmount: 0,
      invoiceTotalAmountWithVat: 104.9,
      paidAmount: 0,
      amountDueForPayment: 104.9,
    }))
    expect(invoice.vatBreakdown).toHaveLength(4)
    expect(invoice.vatBreakdown[1]).toEqual(new EN16931.VatBreakdown({
      categoryTaxableAmount: 60,
      categoryTaxAmount: 0,
      categoryCode: 'E',
      categoryRate: 0,
      exemptionReasonText: 'DEBOURS',
      exemptionReasonCode: 'VATEX-EU-79-C',
    }))
    expect(invoice.allowances).toHaveLength(4)
    expect(invoice.charges).toHaveLength(4)
    expect(invoice.allowances[0]).toBeInstanceOf(EN16931.DocumentAllowance)
    expect(invoice.allowances[0]).toEqual(expect.objectContaining({ amount: 5, reasonCode: '95', reason: 'REMISE COMMERCIALE', vatCategoryCode: 'S' }))
    expect(invoice.charges[2]).toEqual(expect.objectContaining({ amount: 2, reasonCode: 'FC', vatCategoryCode: 'K' }))
    expect(invoice.paymentTerms).toBe('PAIEMENT 30 JOURS NET')
    expect(invoice.paymentDueDate).toBe('2026-03-02')
    const payment = invoice.paymentInstructions!
    expect(payment).toBeInstanceOf(EN16931.PaymentInstructions)
    expect(payment.paymentMeansTypeCode).toBe('30')
    expect(payment.paymentMeansText).toBe('Virement')
    expect(payment.creditTransfers).toEqual([new EN16931.CreditTransfer({
      paymentAccountIdentifier: 'FR20 1254 2547 2569 8542 5874 698',
      paymentAccountName: 'MON COMPTE BANCAIRE',
      paymentServiceProviderIdentifier: 'BIC_MONCOMPTE',
    })])
    expect(payment.card).toEqual(new EN16931.PaymentCard({ primaryAccountNumber: '4970xx0265', holderName: 'MON NOM MA CARTE' }))
    expect(payment.directDebit).toEqual(new EN16931.DirectDebit({ mandateReferenceIdentifier: 'MANDATE PT', bankAssignedCreditorIdentifier: expect.any(String), debitedAccountIdentifier: 'FRDEBIT' }))
    expect(payment.remittanceInformation).toEqual(expect.any(String))
  })

  it('reads several VAT breakdowns of one category (annex B UC10, UC11, multi-vendor)', async () => {
    for (const uc of ['UC10', 'UC11']) {
      const files = annexBCii.filter(f => f.includes(`${uc}_`))
      expect(files.length).toBeGreaterThan(0)
      for (const file of files) {
        const cii = await xmlToInvoice(await readFile(file))
        const { invoice } = fromCii(cii)
        const categories = invoice.vatBreakdown.map(v => v.categoryCode)
        expect(invoice.vatBreakdown.length).toBeGreaterThan(1)
        expect(invoice.vatBreakdown.length).toBe(cii.supplyChainTradeTransaction.applicableHeaderTradeSettlement.applicableTradeTax.length)
        expect(new Set(categories).size).toBeLessThan(categories.length)
      }
    }
  })
})

function fullInvoice() {
  return new EN16931.Invoice({
    ...base,
    vatAccountingCurrencyCode: 'USD',
    paymentDueDate: '2025-08-31',
    valueAddedTaxPointDateCode: '35',
    paymentTerms: 'Net 30 « é » & <fin de mois>',
    paymentInstructions: new EN16931.PaymentInstructions({
      paymentMeansTypeCode: '58',
      paymentMeansText: 'Virement SEPA & <co>',
      remittanceInformation: 'FA-2025/1 « é »',
      creditTransfers: [
        new EN16931.CreditTransfer({ paymentAccountIdentifier: 'FR7612345678901234567890123', paymentAccountName: 'Compte & Co', nationalAccountNumber: '12345-67', paymentServiceProviderIdentifier: 'BNPAFRPP' }),
        new EN16931.CreditTransfer({ paymentAccountIdentifier: 'DE89370400440532013000' }),
      ],
      card: new EN16931.PaymentCard({ primaryAccountNumber: '1234', holderName: 'Zoë <Ng>' }),
      directDebit: new EN16931.DirectDebit({ mandateReferenceIdentifier: 'MANDAT-1', bankAssignedCreditorIdentifier: 'FR12ZZZ123456', debitedAccountIdentifier: 'FR0000000000000000000000000' }),
    }),
    allowances: [
      new EN16931.DocumentAllowance({
        amount: 3.14159,
        baseAmount: 31.4159,
        percentage: 10.123456,
        vatCategoryCode: 'E',
        vatRate: 0,
        reason: 'Remise « é » & <x>',
        reasonCode: '95',
        vatExemptionReason: 'Exonération & <art. 262>',
        vatExemptionReasonCode: 'VATEX-EU-79-C',
      }),
      new EN16931.DocumentAllowance({ amount: 1, vatCategoryCode: 'S', vatRate: 20 }),
    ],
    charges: [
      new EN16931.DocumentCharge({
        amount: 2.71828,
        baseAmount: 27.1828,
        percentage: 7.654321,
        vatCategoryCode: 'E',
        vatRate: 0,
        reason: 'Transport & <co>',
        reasonCode: 'FC',
        vatExemptionReason: 'Exonéré',
        vatExemptionReasonCode: 'VATEX-EU-IC',
      }),
      new EN16931.DocumentCharge({ amount: 5, vatCategoryCode: 'S', vatRate: 20, nonVatTaxCode: 'AAJ' }),
    ],
    totals: new EN16931.DocumentTotals({
      sumOfInvoiceLineNetAmount: 100.123456,
      sumOfAllowancesOnDocumentLevel: 4.14159,
      sumOfChargesOnDocumentLevel: 7.71828,
      invoiceTotalAmountWithoutVat: 103.7,
      invoiceTotalVatAmount: 20.123,
      invoiceTotalVatAmountInAccountingCurrency: 18.5,
      roundingAmount: -0.01,
      invoiceTotalAmountWithVat: 123.8,
      paidAmount: 10,
      amountDueForPayment: 113.8,
    }),
    vatBreakdown: [
      new EN16931.VatBreakdown({ categoryTaxableAmount: 50.5, categoryTaxAmount: 10.1, categoryCode: 'S', categoryRate: 20 }),
      new EN16931.VatBreakdown({ categoryTaxableAmount: 53.2, categoryTaxAmount: 10.023, categoryCode: 'S', categoryRate: 7.123456 }),
      new EN16931.VatBreakdown({ categoryTaxableAmount: 0, categoryTaxAmount: 0, categoryCode: 'E', categoryRate: 0, exemptionReasonText: 'Exonéré & <x>', exemptionReasonCode: 'VATEX-EU-132' }),
    ],
    vatCurrencyExchange: new EN16931.VatCurrencyExchange({ sourceCurrencyCode: 'EUR', targetCurrencyCode: 'USD', exchangeRate: 1.123456789, exchangeRateDate: '2025-06-30' }),
  })
}

describe('en 16931 model: settlement terms', () => {
  it('round-trips every settlement term, the EXT-FR-FE ones included, with nothing dropped', () => {
    const invoice = fullInvoice()
    const back = fromCii(toCii(invoice, { level: 'extended-ctc-fr' }))
    expect(back.dropped).toEqual([])
    expect(back.invoice).toEqual(new EN16931.Invoice({
      ...invoice,
      specificationIdentifier: 'urn:cen.eu:en16931:2017#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr',
    }))
    expect(back.invoice.paymentInstructions).toBeInstanceOf(EN16931.PaymentInstructions)
    expect(back.invoice.paymentInstructions!.creditTransfers[0]).toBeInstanceOf(EN16931.CreditTransfer)
    expect(back.invoice.allowances[0]).toBeInstanceOf(EN16931.DocumentAllowance)
    expect(back.invoice.charges[0]).toBeInstanceOf(EN16931.DocumentCharge)
    expect(back.invoice.vatBreakdown[0]).toBeInstanceOf(EN16931.VatBreakdown)
    expect(back.invoice.vatCurrencyExchange).toBeInstanceOf(EN16931.VatCurrencyExchange)
  })

  it('places each settlement term in the CII element the Factur-X matrix names', () => {
    const s = toCii(fullInvoice(), { level: 'extended-ctc-fr' }).supplyChainTradeTransaction.applicableHeaderTradeSettlement
    // BG-16: one SpecifiedTradeSettlementPaymentMeans per credit transfer, BT-81 / BT-82 repeated;
    // the card and the debited account (BT-91) in the first.
    const means = s.specifiedTradeSettlementPaymentMeans!
    expect(means.map(m => m.typeCode.value)).toEqual(['58', '58'])
    expect(means.map(m => m.information?.value)).toEqual(['Virement SEPA & <co>', 'Virement SEPA & <co>'])
    expect(means[0].applicableTradeSettlementFinancialCard).toEqual({ id: { value: '1234' }, cardholderName: { value: 'Zoë <Ng>' } })
    expect(means[1].applicableTradeSettlementFinancialCard).toBeUndefined()
    expect(means[0].payerPartyDebtorFinancialAccount!.ibanID.value).toBe('FR0000000000000000000000000')
    expect(means[1].payerPartyDebtorFinancialAccount).toBeUndefined()
    expect(means[0].payeePartyCreditorFinancialAccount).toEqual({ ibanID: { value: 'FR7612345678901234567890123' }, accountName: { value: 'Compte & Co' }, proprietaryID: { value: '12345-67' } })
    expect(means[0].payeeSpecifiedCreditorFinancialInstitution!.bicID.value).toBe('BNPAFRPP')
    expect(means[1].payeePartyCreditorFinancialAccount!.ibanID!.value).toBe('DE89370400440532013000')
    // BT-83 and BT-90 on the settlement header; BT-9, BT-20 and BT-89 in the one payment terms entry.
    expect(s.paymentReference!.value).toBe('FA-2025/1 « é »')
    expect(s.creditorReferenceID!.value).toBe('FR12ZZZ123456')
    expect(s.specifiedTradePaymentTerms).toHaveLength(1)
    expect(s.specifiedTradePaymentTerms![0].description!.value).toBe('Net 30 « é » & <fin de mois>')
    expect(s.specifiedTradePaymentTerms![0].dueDateDateTime).toEqual({ dateTimeString: '20250831', format: '102' })
    expect(s.specifiedTradePaymentTerms![0].directDebitMandateID!.value).toBe('MANDAT-1')
    // BG-20 then BG-21, told apart by the charge indicator; BT-177 is a ReasonCode with @listID 5153.
    const ac = s.specifiedTradeAllowanceCharge!
    expect(ac.map(a => a.chargeIndicator.indicator)).toEqual([false, false, true, true])
    expect(ac[0].categoryTradeTax!.typeCode!.value).toBe('VAT')
    expect(ac[0].categoryTradeTax!.exemptionReason!.value).toBe('Exonération & <art. 262>')
    expect(ac[0].categoryTradeTax!.exemptionReasonCode!.value).toBe('VATEX-EU-79-C')
    expect(ac[2].categoryTradeTax!.exemptionReason!.value).toBe('Exonéré')
    expect(ac[2].categoryTradeTax!.exemptionReasonCode!.value).toBe('VATEX-EU-IC')
    expect(ac[2].reasonCode).toEqual({ value: 'FC', listID: undefined })
    expect(ac[3].reasonCode).toEqual({ value: 'AAJ', listID: '5153' })
    // BG-23, with BT-7 / BT-8 on every entry (BT-8 as UNTDID 2475: 35 -> 29).
    expect(s.applicableTradeTax).toHaveLength(3)
    for (const t of s.applicableTradeTax)
      expect(t.dueDateTypeCode!.value).toBe('29')
    expect(s.applicableTradeTax[1].rateApplicablePercent!.value).toBe(7.123456)
    expect(s.applicableTradeTax[2].exemptionReasonCode!.value).toBe('VATEX-EU-132')
    // BG-22: only the two VAT amounts carry a currency (BT-5 and BT-6).
    const sum = s.specifiedTradeSettlementHeaderMonetarySummation
    expect(sum.taxTotalAmount).toEqual([{ value: 20.123, currencyID: 'EUR' }, { value: 18.5, currencyID: 'USD' }])
    expect(sum.lineTotalAmount!.currencyID).toBeUndefined()
    expect(sum.roundingAmount!.value).toBe(-0.01)
    // CG-18: the VAT currency exchange.
    expect(s.taxApplicableTradeCurrencyExchange).toEqual({
      sourceCurrencyCode: { value: 'EUR' },
      targetCurrencyCode: { value: 'USD' },
      conversionRate: { value: 1.123456789 },
      conversionRateDateTime: { dateTimeString: '20250630', format: '102' },
    })
  })

  it('writes BT-7 on every VAT breakdown entry', () => {
    const invoice = new EN16931.Invoice({ ...base, valueAddedTaxPointDate: '2025-07-15', vatBreakdown: [VAT(), VAT()] })
    const taxes = toCii(invoice, { level: 'en16931' }).supplyChainTradeTransaction.applicableHeaderTradeSettlement.applicableTradeTax
    expect(taxes.map(t => t.taxPointDate)).toEqual([{ dateString: '20250715', format: '102' }, { dateString: '20250715', format: '102' }])
    expect(fromCii(toCii(invoice, { level: 'en16931' })).invoice.valueAddedTaxPointDate).toBe('2025-07-15')
  })

  it('writes one payment means when there is no credit transfer, and none without payment instructions', () => {
    const none = toCii(new EN16931.Invoice({ ...base, paymentInstructions: new EN16931.PaymentInstructions({ paymentMeansTypeCode: '10' }) }), { level: 'en16931' })
    expect(none.supplyChainTradeTransaction.applicableHeaderTradeSettlement.specifiedTradeSettlementPaymentMeans).toHaveLength(1)
    const absent = toCii(new EN16931.Invoice(base), { level: 'en16931' }).supplyChainTradeTransaction.applicableHeaderTradeSettlement
    expect(absent.specifiedTradeSettlementPaymentMeans).toEqual([])
    expect(absent.specifiedTradePaymentTerms).toEqual([])
    expect(absent.specifiedTradeAllowanceCharge).toEqual([])
    expect(absent.taxApplicableTradeCurrencyExchange).toBeUndefined()
  })

  it('reads BT-110 and BT-111 by their currency', () => {
    const cii = toCii(fullInvoice(), { level: 'extended-ctc-fr' })
    const read = fromCii(cii).invoice
    expect(read.totals.invoiceTotalVatAmount).toBe(20.123)
    expect(read.totals.invoiceTotalVatAmountInAccountingCurrency).toBe(18.5)
    // A VAT amount in a currency that is neither BT-5 nor BT-6 is not read: it is dropped.
    const sum = cii.supplyChainTradeTransaction.applicableHeaderTradeSettlement.specifiedTradeSettlementHeaderMonetarySummation
    sum.taxTotalAmount![1].currencyID = 'GBP'
    const odd = fromCii(cii)
    expect(odd.invoice.totals.invoiceTotalVatAmountInAccountingCurrency).toBeUndefined()
    expect(odd.dropped).toContain(`${SETTLEMENT}/ram:SpecifiedTradeSettlementHeaderMonetarySummation/ram:TaxTotalAmount[2]`)
  })

  it('reports differing payment means and a second payment terms entry, which the model cannot hold', () => {
    const cii = toCii(new EN16931.Invoice({ ...base, paymentTerms: 'first', paymentInstructions: new EN16931.PaymentInstructions({ paymentMeansTypeCode: '58', creditTransfers: [new EN16931.CreditTransfer({ paymentAccountIdentifier: 'A' })] }) }), { level: 'extended' })
    const s = cii.supplyChainTradeTransaction.applicableHeaderTradeSettlement
    s.specifiedTradeSettlementPaymentMeans!.push({ typeCode: { value: '30' }, payeePartyCreditorFinancialAccount: { ibanID: { value: 'B' } } })
    s.specifiedTradePaymentTerms!.push({ description: { value: 'second' } })
    const { invoice, dropped } = fromCii(cii)
    expect(invoice.paymentInstructions!.creditTransfers.map(c => c.paymentAccountIdentifier)).toEqual(['A', 'B'])
    expect(dropped).toEqual([
      `${SETTLEMENT}/ram:SpecifiedTradeSettlementPaymentMeans[2]/ram:TypeCode`,
      `${SETTLEMENT}/ram:SpecifiedTradePaymentTerms[2]/ram:Description`,
    ])
  })

  it('reports the Factur-X-only settlement fields, which have no EN 16931 / EXT-FR-FE id', () => {
    const cii = toCii(new EN16931.Invoice({
      ...base,
      allowances: [new EN16931.DocumentAllowance({ amount: 1, vatCategoryCode: 'S' })],
      paymentInstructions: new EN16931.PaymentInstructions({ paymentMeansTypeCode: '58', creditTransfers: [new EN16931.CreditTransfer({ paymentAccountIdentifier: 'A' })], directDebit: new EN16931.DirectDebit({ debitedAccountIdentifier: 'D' }) }),
    }), { level: 'extended' })
    const s = cii.supplyChainTradeTransaction.applicableHeaderTradeSettlement
    s.applicableTradeTax[0].lineTotalBasisAmount = { value: 1 }
    s.applicableTradeTax[0].allowanceChargeBasisAmount = { value: 2 }
    s.specifiedTradeAllowanceCharge![0].sequenceNumeric = { value: 1 }
    s.specifiedTradeAllowanceCharge![0].basisQuantity = { value: 3, unitCode: 'C62' }
    s.specifiedTradeSettlementPaymentMeans![0].payerPartyDebtorFinancialAccount!.accountName = { value: 'BT-216' }
    s.specifiedTradeSettlementPaymentMeans![0].payerSpecifiedDebtorFinancialInstitution = { bicID: { value: 'BT215' } }
    s.specifiedTradePaymentTerms = [{ partialPaymentAmount: { value: 5 } }]
    s.specifiedAdvancePayment = [{ paidAmount: { value: 5 }, includedTradeTax: [] }]
    const { dropped } = fromCii(cii)
    expect(dropped.filter(p => OWNED.test(p))).toEqual([
      `${SETTLEMENT}/ram:SpecifiedTradeSettlementPaymentMeans[1]/ram:PayerPartyDebtorFinancialAccount/ram:AccountName`,
      `${SETTLEMENT}/ram:SpecifiedTradeSettlementPaymentMeans[1]/ram:PayerSpecifiedDebtorFinancialInstitution/ram:BICID`,
      `${SETTLEMENT}/ram:ApplicableTradeTax[1]/ram:LineTotalBasisAmount`,
      `${SETTLEMENT}/ram:ApplicableTradeTax[1]/ram:AllowanceChargeBasisAmount`,
      `${SETTLEMENT}/ram:SpecifiedTradeAllowanceCharge[1]/ram:SequenceNumeric`,
      `${SETTLEMENT}/ram:SpecifiedTradeAllowanceCharge[1]/ram:BasisQuantity`,
      `${SETTLEMENT}/ram:SpecifiedTradeAllowanceCharge[1]/ram:BasisQuantity/@unitCode`,
      `${SETTLEMENT}/ram:SpecifiedTradePaymentTerms[1]/ram:PartialPaymentAmount`,
    ])
  })

  it('reads a payment reference or creditor identifier without payment means, which toCii rejects (BT-81)', () => {
    const cii = toCii(new EN16931.Invoice(base), { level: 'en16931' })
    const s = cii.supplyChainTradeTransaction.applicableHeaderTradeSettlement
    s.paymentReference = { value: 'REF' }
    const { invoice, dropped } = fromCii(cii)
    expect(dropped).toEqual([])
    expect(invoice.paymentInstructions!.remittanceInformation).toBe('REF')
    expect(invoice.paymentInstructions!.paymentMeansTypeCode).toBe('')
    expect(() => toCii(invoice, { level: 'en16931' })).toThrow(/BT-81/)
  })

  it.each([
    ['BT-92', 'allowance'],
    ['BT-99', 'charge'],
    ['BT-167', 'exchange'],
  ])('stands in NaN for a missing %s element of a hand-built CII model, which toCii rejects', (id, kind) => {
    const source = new EN16931.Invoice({
      ...base,
      vatAccountingCurrencyCode: 'USD',
      allowances: kind === 'allowance' ? [new EN16931.DocumentAllowance({ amount: 1, vatCategoryCode: 'S' })] : [],
      charges: kind === 'charge' ? [new EN16931.DocumentCharge({ amount: 1, vatCategoryCode: 'S' })] : [],
      vatCurrencyExchange: kind === 'exchange' ? new EN16931.VatCurrencyExchange({ sourceCurrencyCode: 'EUR', targetCurrencyCode: 'USD', exchangeRate: 1.1 }) : undefined,
    })
    const cii = toCii(source, { level: 'extended' })
    const s = cii.supplyChainTradeTransaction.applicableHeaderTradeSettlement
    if (kind === 'exchange')
      delete (s.taxApplicableTradeCurrencyExchange as { conversionRate?: unknown }).conversionRate
    else
      delete (s.specifiedTradeAllowanceCharge![0] as { actualAmount?: unknown }).actualAmount
    const { invoice } = fromCii(cii)
    const value = kind === 'allowance' ? invoice.allowances[0].amount : kind === 'charge' ? invoice.charges[0].amount : invoice.vatCurrencyExchange!.exchangeRate
    expect(value).toBeNaN()
    expect(() => toCii(invoice, { level: 'extended' })).toThrow(new RegExp(`${id} `))
  })

  it('stands in empty mandatory amounts for a document without them, which toCii rejects', () => {
    const cii = toCii(new EN16931.Invoice(base), { level: 'en16931' })
    const s = cii.supplyChainTradeTransaction.applicableHeaderTradeSettlement
    delete (s.specifiedTradeSettlementHeaderMonetarySummation as { lineTotalAmount?: unknown }).lineTotalAmount
    delete (s.applicableTradeTax[0] as { basisAmount?: unknown }).basisAmount
    const { invoice } = fromCii(cii)
    expect(invoice.totals.sumOfInvoiceLineNetAmount).toBeNaN()
    expect(invoice.vatBreakdown[0].categoryTaxableAmount).toBeNaN()
    expect(() => toCii(invoice, { level: 'en16931' })).toThrow(/BT-106/)
  })
})

describe('en 16931 model: settlement level gates and mandatory terms', () => {
  function message(invoice: Invoice, level: 'basic' | 'en16931' | 'extended' | 'extended-ctc-fr'): string {
    try {
      toCii(invoice, { level })
    }
    catch (error) {
      return (error as Error).message
    }
    return ''
  }
  it('names BG-20, BG-21 and BG-23 for a plain-object invoice lacking them, not a TypeError', () => {
    const plain = { ...base, allowances: [], charges: [] } as unknown as Invoice
    expect(message({ ...plain, allowances: undefined } as never, 'en16931')).toMatch(/BG-20/)
    expect(message({ ...plain, charges: undefined } as never, 'en16931')).toMatch(/BG-21/)
    expect(message({ ...plain, vatBreakdown: undefined } as never, 'en16931')).toMatch(/BG-23/)
  })

  const instructions = (extra: object) => new EN16931.PaymentInstructions({ paymentMeansTypeCode: '58', ...extra })

  it.each([
    ['basic', 'BT-82', { paymentInstructions: instructions({ paymentMeansText: 'SECRET-TEXT' }) }],
    ['basic', 'BG-18', { paymentInstructions: instructions({ card: new EN16931.PaymentCard({ primaryAccountNumber: 'SECRET-PAN' }) }) }],
    ['basic', 'BT-85', { paymentInstructions: instructions({ creditTransfers: [new EN16931.CreditTransfer({ paymentAccountName: 'SECRET-NAME' })] }) }],
    ['basic', 'BT-86', { paymentInstructions: instructions({ creditTransfers: [new EN16931.CreditTransfer({ paymentServiceProviderIdentifier: 'SECRET-BIC' })] }) }],
    ['basic', 'BT-114', { totals: new EN16931.DocumentTotals({ ...TOTALS(), roundingAmount: 0.01 }) }],
    ['en16931', 'EXT-FR-FE-187', { allowances: [new EN16931.DocumentAllowance({ amount: 1, vatCategoryCode: 'E', vatExemptionReason: 'SECRET-REASON' })] }],
    ['en16931', 'EXT-FR-FE-188', { allowances: [new EN16931.DocumentAllowance({ amount: 1, vatCategoryCode: 'E', vatExemptionReasonCode: 'SECRET-CODE' })] }],
    ['en16931', 'EXT-FR-FE-189', { charges: [new EN16931.DocumentCharge({ amount: 1, vatCategoryCode: 'E', vatExemptionReason: 'SECRET-REASON' })] }],
    ['en16931', 'EXT-FR-FE-190', { charges: [new EN16931.DocumentCharge({ amount: 1, vatCategoryCode: 'E', vatExemptionReasonCode: 'SECRET-CODE' })] }],
    ['en16931', 'BT-177', { charges: [new EN16931.DocumentCharge({ amount: 1, vatCategoryCode: 'S', nonVatTaxCode: 'SECRET-TAX' })] }],
    ['en16931', 'BT-167', { vatAccountingCurrencyCode: 'USD', vatCurrencyExchange: new EN16931.VatCurrencyExchange({ sourceCurrencyCode: 'EUR', targetCurrencyCode: 'USD', exchangeRate: 1.1 }) }],
    ['en16931', 'EXT-FR-FE-192', { vatAccountingCurrencyCode: 'USD', vatCurrencyExchange: new EN16931.VatCurrencyExchange({ sourceCurrencyCode: 'EUR', targetCurrencyCode: 'USD', exchangeRate: 1.1, exchangeRateDate: '2025-06-30' }) }],
  ] as const)('throws, naming the term and not the value, below the level that carries it (%s, %s)', (level, id, extra) => {
    const text = message(new EN16931.Invoice({ ...base, ...extra } as never), level)
    expect(text).toContain(id)
    expect(text).toContain(level)
    expect(text).not.toMatch(/SECRET/)
    // The level that carries the term accepts it.
    expect(message(new EN16931.Invoice({ ...base, ...extra } as never), 'extended-ctc-fr')).toBe('')
  })

  it('carries the other settlement terms at basic', () => {
    const invoice = new EN16931.Invoice({
      ...base,
      paymentTerms: 'Net 30',
      paymentInstructions: instructions({
        remittanceInformation: 'R',
        creditTransfers: [new EN16931.CreditTransfer({ paymentAccountIdentifier: 'FR76', nationalAccountNumber: '1' })],
        directDebit: new EN16931.DirectDebit({ mandateReferenceIdentifier: 'M', bankAssignedCreditorIdentifier: 'C', debitedAccountIdentifier: 'D' }),
      }),
      allowances: [new EN16931.DocumentAllowance({ amount: 1, vatCategoryCode: 'S', vatRate: 20, reasonCode: '95' })],
      charges: [new EN16931.DocumentCharge({ amount: 1, vatCategoryCode: 'S', vatRate: 20, reasonCode: 'FC' })],
      valueAddedTaxPointDateCode: '432',
    })
    expect(message(invoice, 'basic')).toBe('')
  })

  it.each([
    ['BG-22', { totals: undefined }],
    ['BT-106', { totals: new EN16931.DocumentTotals({ ...TOTALS(), sumOfInvoiceLineNetAmount: Number.NaN }) }],
    ['BT-109', { totals: new EN16931.DocumentTotals({ ...TOTALS(), invoiceTotalAmountWithoutVat: Number.NaN }) }],
    ['BT-112', { totals: new EN16931.DocumentTotals({ ...TOTALS(), invoiceTotalAmountWithVat: Number.NaN }) }],
    ['BT-115', { totals: new EN16931.DocumentTotals({ ...TOTALS(), amountDueForPayment: Number.NaN }) }],
    ['BG-23', { vatBreakdown: [] }],
    ['BT-116', { vatBreakdown: [new EN16931.VatBreakdown({ ...VAT(), categoryTaxableAmount: Number.NaN })] }],
    ['BT-117', { vatBreakdown: [new EN16931.VatBreakdown({ ...VAT(), categoryTaxAmount: Number.NaN })] }],
    ['BT-118', { vatBreakdown: [new EN16931.VatBreakdown({ ...VAT(), categoryCode: '' })] }],
    ['BT-92', { allowances: [new EN16931.DocumentAllowance({ amount: Number.NaN, vatCategoryCode: 'S' })] }],
    ['BT-95', { allowances: [new EN16931.DocumentAllowance({ amount: 1, vatCategoryCode: '' })] }],
    ['BT-99', { charges: [new EN16931.DocumentCharge({ amount: Number.NaN, vatCategoryCode: 'S' })] }],
    ['BT-102', { charges: [new EN16931.DocumentCharge({ amount: 1, vatCategoryCode: '' })] }],
    ['BT-81', { paymentInstructions: instructions({ paymentMeansTypeCode: '' }) }],
    ['BT-87', { paymentInstructions: instructions({ card: new EN16931.PaymentCard({ primaryAccountNumber: '' }) }) }],
    ['BT-167-2', { vatAccountingCurrencyCode: 'USD', vatCurrencyExchange: new EN16931.VatCurrencyExchange({ sourceCurrencyCode: '', targetCurrencyCode: 'USD', exchangeRate: 1 }) }],
    ['BT-167-1', { vatAccountingCurrencyCode: 'USD', vatCurrencyExchange: new EN16931.VatCurrencyExchange({ sourceCurrencyCode: 'EUR', targetCurrencyCode: '', exchangeRate: 1 }) }],
    ['BT-167 ', { vatAccountingCurrencyCode: 'USD', vatCurrencyExchange: new EN16931.VatCurrencyExchange({ sourceCurrencyCode: 'EUR', targetCurrencyCode: 'USD', exchangeRate: Number.NaN }) }],
  ] as const)('throws on a missing or empty mandatory %s', (id, extra) => {
    expect(message(new EN16931.Invoice({ ...base, ...extra } as never), 'extended-ctc-fr')).toMatch(new RegExp(`${id.trim()}[ )]`))
  })

  it('throws on a non-finite optional amount, naming it', () => {
    expect(message(new EN16931.Invoice({ ...base, totals: new EN16931.DocumentTotals({ ...TOTALS(), paidAmount: Number.POSITIVE_INFINITY }) }), 'en16931')).toMatch(/BT-113/)
    expect(message(new EN16931.Invoice({ ...base, vatBreakdown: [new EN16931.VatBreakdown({ ...VAT(), categoryRate: Number.NaN })] }), 'en16931')).toMatch(/BT-119/)
  })

  it('throws on a VAT amount in accounting currency without BT-6, naming BT-111', () => {
    const totals = new EN16931.DocumentTotals({ ...TOTALS(), invoiceTotalVatAmountInAccountingCurrency: 18 })
    expect(message(new EN16931.Invoice({ ...base, totals }), 'en16931')).toMatch(/BT-111.*BT-6/)
    expect(message(new EN16931.Invoice({ ...base, totals, vatAccountingCurrencyCode: 'USD' }), 'en16931')).toBe('')
  })

  it('throws on a charge holding both BT-105 and BT-177, which share one CII element', () => {
    const charge = new EN16931.DocumentCharge({ amount: 1, vatCategoryCode: 'S', reasonCode: 'FC', nonVatTaxCode: 'AAJ' })
    expect(message(new EN16931.Invoice({ ...base, charges: [charge] }), 'extended-ctc-fr')).toMatch(/BT-105.*BT-177/)
  })

  it('exports the settlement classes, each constructible empty and holding only its own properties', () => {
    const shapes: Record<string, string[]> = {
      CreditTransfer: ['paymentAccountIdentifier', 'paymentAccountName', 'nationalAccountNumber', 'paymentServiceProviderIdentifier'],
      PaymentCard: ['primaryAccountNumber', 'holderName'],
      DirectDebit: ['mandateReferenceIdentifier', 'bankAssignedCreditorIdentifier', 'debitedAccountIdentifier'],
      PaymentInstructions: ['paymentMeansTypeCode', 'paymentMeansText', 'remittanceInformation', 'creditTransfers', 'card', 'directDebit'],
      DocumentAllowance: ['amount', 'baseAmount', 'percentage', 'vatCategoryCode', 'vatRate', 'reason', 'reasonCode', 'vatExemptionReason', 'vatExemptionReasonCode'],
      DocumentCharge: ['amount', 'baseAmount', 'percentage', 'vatCategoryCode', 'vatRate', 'reason', 'reasonCode', 'nonVatTaxCode', 'vatExemptionReason', 'vatExemptionReasonCode'],
      DocumentTotals: ['sumOfInvoiceLineNetAmount', 'sumOfAllowancesOnDocumentLevel', 'sumOfChargesOnDocumentLevel', 'invoiceTotalAmountWithoutVat', 'invoiceTotalVatAmount', 'invoiceTotalVatAmountInAccountingCurrency', 'roundingAmount', 'invoiceTotalAmountWithVat', 'paidAmount', 'amountDueForPayment'],
      VatBreakdown: ['categoryTaxableAmount', 'categoryTaxAmount', 'categoryCode', 'categoryRate', 'exemptionReasonText', 'exemptionReasonCode'],
      VatCurrencyExchange: ['sourceCurrencyCode', 'targetCurrencyCode', 'exchangeRate', 'exchangeRateDate'],
    }
    for (const [name, properties] of Object.entries(shapes)) {
      const Class = (EN16931 as unknown as Record<string, new (init: object) => object>)[name]
      expect(Class, name).toBeTypeOf('function')
      expect(Object.keys(new Class({})).sort(), name).toEqual([...properties].sort())
    }
  })
})
