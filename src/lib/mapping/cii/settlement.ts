/**
 * Settlement groups of the EN 16931 model ⇄ CII: payment instructions (BG-16..BG-19), payment terms
 * (BT-20, with BT-9 and BT-89), document level allowances and charges (BG-20, BG-21), the VAT
 * breakdown (BG-23), the document totals (BG-22) and the VAT currency exchange (CG-18).
 *
 * Placement follows the Factur-X 1.09 EXTENDED field matrix (`fields--Factur-X_CII_D22B_EXTENDED.csv`,
 * XPath column). Shapes mirror `xmlToInvoice()`: the payment means, allowance / charge, payment terms
 * and `TaxTotalAmount` lists are always arrays, so a document read and written back compares equal.
 * What the model has no place for (Factur-X-only terms such as BT-X-262, the debited account name BT-216
 * or the logistics service charges) is not mapped, and `fromCii()` reports it in `dropped`.
 */

import type { Invoice } from '../../models/en16931/invoice'
import type { CrossIndustryInvoiceType, HeaderTradeSettlementType } from '../../models/facturx/crossIndustryInvoice'
import type { TermGate } from './levels'
import {
  CreditTransfer,
  DirectDebit,
  DocumentAllowance,
  DocumentCharge,
  DocumentTotals,
  PaymentCard,
  PaymentInstructions,
  VatBreakdown,
  VatCurrencyExchange,
} from '../../models/en16931/settlement'
import * as qdt from '../../models/facturx/qualifiedTypes'
import * as ram from '../../models/facturx/reusableTypes'
import * as udt from '../../models/facturx/unqualifiedTypes'
import { isSet } from './levels'
import { ciiCode, ciiDateTime, ciiId, ciiText, isBlank, isoFromCii, unmapped } from './values'

/** The settlement properties of `Invoice`, as its constructor takes them. */
type SettlementKeys = 'paymentInstructions' | 'paymentTerms' | 'allowances' | 'charges' | 'totals' | 'vatBreakdown' | 'vatCurrencyExchange'
export type SettlementInit = Pick<ConstructorParameters<typeof Invoice>[0], SettlementKeys>

/** `ram:ApplicableTradeTax/ram:TypeCode` and the `CategoryTradeTax` ones: fixed `VAT` (matrix BT-95-0, BT-102-0, BT-118-0). */
const VAT = 'VAT'
/** `@listID` of the `ReasonCode` that is a non-VAT tax code (BT-177-1: "Value = 5153"). */
const NON_VAT_TAX_LIST = '5153'

/** Settlement terms Factur-X BASIC lacks (matrix level columns) and the EXTENDED-only ones. */
export const SETTLEMENT_GATES: readonly TermGate[] = [
  { id: 'BT-82', term: 'payment means text', from: 'en16931', present: i => isSet(i.paymentInstructions?.paymentMeansText) },
  { id: 'BG-18', term: 'payment card information', from: 'en16931', present: i => isSet(i.paymentInstructions?.card) },
  { id: 'BT-85', term: 'payment account name', from: 'en16931', present: i => i.paymentInstructions?.creditTransfers.some(c => isSet(c.paymentAccountName)) ?? false },
  { id: 'BT-86', term: 'payment service provider identifier', from: 'en16931', present: i => i.paymentInstructions?.creditTransfers.some(c => isSet(c.paymentServiceProviderIdentifier)) ?? false },
  { id: 'BT-114', term: 'rounding amount', from: 'en16931', present: i => isSet(i.totals?.roundingAmount) },
  { id: 'EXT-FR-FE-187', term: 'VAT exemption reason of a document level allowance (BT-173)', from: 'extended', present: i => i.allowances.some(a => isSet(a.vatExemptionReason)) },
  { id: 'EXT-FR-FE-188', term: 'VAT exemption reason code of a document level allowance (BT-174)', from: 'extended', present: i => i.allowances.some(a => isSet(a.vatExemptionReasonCode)) },
  { id: 'EXT-FR-FE-189', term: 'VAT exemption reason of a document level charge (BT-175)', from: 'extended', present: i => i.charges.some(c => isSet(c.vatExemptionReason)) },
  { id: 'EXT-FR-FE-190', term: 'VAT exemption reason code of a document level charge (BT-176)', from: 'extended', present: i => i.charges.some(c => isSet(c.vatExemptionReasonCode)) },
  { id: 'BT-177', term: 'document level non-VAT tax code', from: 'extended', present: i => i.charges.some(c => isSet(c.nonVatTaxCode)) },
  { id: 'EXT-FR-FE-192', term: 'exchange rate date', from: 'extended', present: i => isSet(i.vatCurrencyExchange?.exchangeRateDate) },
  { id: 'BT-167', term: 'VAT currency exchange', from: 'extended', present: i => isSet(i.vatCurrencyExchange) },
]

// ---------------------------------------------------------------------------
// CII → model
// ---------------------------------------------------------------------------

// A mandatory amount the document lacks: NaN, which `toCii()` rejects.
function required(amount: udt.AmountType | undefined): number {
  return amount?.value ?? Number.NaN
}

function creditTransferFromCii(means: ram.TradeSettlementPaymentMeansType): CreditTransfer {
  const account = means.payeePartyCreditorFinancialAccount
  return new CreditTransfer({
    paymentAccountIdentifier: account?.ibanID?.value,
    paymentAccountName: account?.accountName?.value,
    nationalAccountNumber: account?.proprietaryID?.value,
    paymentServiceProviderIdentifier: means.payeeSpecifiedCreditorFinancialInstitution?.bicID?.value,
  })
}

// BG-16 is `0..1` in the model: BT-81, BT-82, the card and the debited account come from the first
// payment means (the matrix repeats BT-81 / BT-82 on each); every credit transfer is read. Whatever
// a later payment means holds beyond that is reported in `dropped`.
function paymentInstructionsFromCii(header: HeaderTradeSettlementType): PaymentInstructions | undefined {
  const means = header.specifiedTradeSettlementPaymentMeans ?? []
  const first = means[0]
  const mandate = header.specifiedTradePaymentTerms?.[0]?.directDebitMandateID?.value
  const creditor = header.creditorReferenceID?.value
  const debited = first?.payerPartyDebtorFinancialAccount?.ibanID?.value
  const directDebit = mandate === undefined && creditor === undefined && (debited === undefined || debited === '')
    ? undefined
    : new DirectDebit({
        mandateReferenceIdentifier: mandate,
        bankAssignedCreditorIdentifier: creditor,
        // The parser stands in an empty IBAN for a debtor account without one.
        debitedAccountIdentifier: debited === '' ? undefined : debited,
      })
  const remittance = header.paymentReference?.value
  if (first === undefined && remittance === undefined && directDebit === undefined)
    return undefined
  const card = first?.applicableTradeSettlementFinancialCard
  return new PaymentInstructions({
    paymentMeansTypeCode: first?.typeCode?.value ?? '',
    paymentMeansText: first?.information?.value,
    remittanceInformation: remittance,
    creditTransfers: means
      .filter(m => m.payeePartyCreditorFinancialAccount || m.payeeSpecifiedCreditorFinancialInstitution)
      .map(creditTransferFromCii),
    card: card ? new PaymentCard({ primaryAccountNumber: card.id?.value ?? '', holderName: card.cardholderName?.value }) : undefined,
    directDebit,
  })
}

interface AllowanceCharge {
  amount: number
  baseAmount?: number
  percentage?: number
  vatCategoryCode: string
  vatRate?: number
  reason?: string
  reasonCode?: string
  vatExemptionReason?: string
  vatExemptionReasonCode?: string
}

function allowanceChargeFromCii(entry: ram.TradeAllowanceChargeType): AllowanceCharge {
  const tax = entry.categoryTradeTax
  return {
    // A missing ActualAmount (BT-92, BT-99) is NaN, which `toCii()` rejects.
    amount: required(entry.actualAmount),
    baseAmount: entry.basisAmount?.value,
    percentage: entry.calculationPercent?.value,
    // The parser leaves a category code the document lacks absent (optional at EXTENDED).
    vatCategoryCode: tax?.categoryCode?.value ?? '',
    vatRate: tax?.rateApplicablePercent?.value,
    reason: entry.reason?.value,
    reasonCode: entry.reasonCode?.value,
    vatExemptionReason: tax?.exemptionReason?.value,
    vatExemptionReasonCode: tax?.exemptionReasonCode?.value,
  }
}

function totalsFromCii(cii: CrossIndustryInvoiceType): DocumentTotals {
  const settlement = cii.supplyChainTradeTransaction?.applicableHeaderTradeSettlement
  const sum = settlement?.specifiedTradeSettlementHeaderMonetarySummation
  const vatCurrency = settlement?.invoiceCurrencyCode?.value
  const accountingCurrency = settlement?.taxCurrencyCode?.value
  // BT-110 is the VAT amount in the invoice currency (BT-5), BT-111 the one in the accounting
  // currency (BT-6): told apart by their `@currencyID`, as the matrix says (BT-110-0, BT-111-0).
  const amounts = sum?.taxTotalAmount ?? []
  const vat = amounts.find(a => a.currencyID === undefined || a.currencyID === vatCurrency)
  const accounting = accountingCurrency === undefined ? undefined : amounts.find(a => a !== vat && a.currencyID === accountingCurrency)
  return new DocumentTotals({
    sumOfInvoiceLineNetAmount: required(sum?.lineTotalAmount),
    sumOfAllowancesOnDocumentLevel: sum?.allowanceTotalAmount?.value,
    sumOfChargesOnDocumentLevel: sum?.chargeTotalAmount?.value,
    invoiceTotalAmountWithoutVat: required(sum?.taxBasisTotalAmount),
    invoiceTotalVatAmount: vat?.value,
    invoiceTotalVatAmountInAccountingCurrency: accounting?.value,
    roundingAmount: sum?.roundingAmount?.value,
    invoiceTotalAmountWithVat: required(sum?.grandTotalAmount),
    paidAmount: sum?.totalPrepaidAmount?.value,
    amountDueForPayment: required(sum?.duePayableAmount),
  })
}

/** The settlement groups of a CII invoice. */
export function settlementFromCii(cii: CrossIndustryInvoiceType): SettlementInit {
  const settlement = cii.supplyChainTradeTransaction?.applicableHeaderTradeSettlement
  const entries = settlement?.specifiedTradeAllowanceCharge ?? []
  const exchange = settlement?.taxApplicableTradeCurrencyExchange
  return {
    paymentInstructions: settlement ? paymentInstructionsFromCii(settlement) : undefined,
    paymentTerms: settlement?.specifiedTradePaymentTerms?.[0]?.description?.value,
    allowances: entries.filter(e => !e.chargeIndicator?.indicator).map(e => new DocumentAllowance(allowanceChargeFromCii(e))),
    charges: entries.filter(e => e.chargeIndicator?.indicator).map((e) => {
      const { reasonCode, ...rest } = allowanceChargeFromCii(e)
      // One CII `ReasonCode` holds BT-105 or, with `@listID="5153"`, BT-177. A charge's `@listID` of
      // another list is not read (the value is BT-105; the attribute is reported in `dropped`).
      const nonVat = e.reasonCode?.listID === NON_VAT_TAX_LIST
      return new DocumentCharge({ ...rest, reasonCode: nonVat ? undefined : reasonCode, nonVatTaxCode: nonVat ? reasonCode : undefined })
    }),
    totals: totalsFromCii(cii),
    vatBreakdown: (settlement?.applicableTradeTax ?? []).map(t => new VatBreakdown({
      categoryTaxableAmount: required(t.basisAmount),
      categoryTaxAmount: required(t.calculatedAmount),
      categoryCode: t.categoryCode?.value ?? '',
      categoryRate: t.rateApplicablePercent?.value,
      exemptionReasonText: t.exemptionReason?.value,
      exemptionReasonCode: t.exemptionReasonCode?.value,
    })),
    vatCurrencyExchange: exchange
      ? new VatCurrencyExchange({
          sourceCurrencyCode: exchange.sourceCurrencyCode?.value ?? '',
          targetCurrencyCode: exchange.targetCurrencyCode?.value ?? '',
          // A missing ConversionRate (BT-167) is NaN, which `toCii()` rejects.
          exchangeRate: exchange.conversionRate?.value ?? Number.NaN,
          exchangeRateDate: isoFromCii(exchange.conversionRateDateTime),
        })
      : undefined,
  }
}

// ---------------------------------------------------------------------------
// Model → CII
// ---------------------------------------------------------------------------

function amount(value: number | undefined, currencyID?: string): udt.AmountType | undefined {
  return value === undefined ? undefined : new udt.AmountType({ value, currencyID })
}

function percent(value: number | undefined): udt.PercentType | undefined {
  return value === undefined ? undefined : new udt.PercentType({ value })
}

/** The header aggregates the settlement groups fill, for the header mapping to merge. */
export interface SettlementCii {
  creditorReferenceID?: udt.IDType
  paymentReference?: udt.TextType
  taxApplicableTradeCurrencyExchange?: ram.TradeCurrencyExchangeType
  specifiedTradeSettlementPaymentMeans: ram.TradeSettlementPaymentMeansType[]
  applicableTradeTax: ram.TradeTaxType[]
  specifiedTradeAllowanceCharge: ram.TradeAllowanceChargeType[]
  specifiedTradePaymentTerms: ram.TradePaymentTermsType[]
  specifiedTradeSettlementHeaderMonetarySummation: ram.TradeSettlementHeaderMonetarySummationType
}

// CII holds one creditor account per payment means: one entry per credit transfer (one when there
// is none), each repeating BT-81 and BT-82; the card and the debited account go in the first.
function paymentMeansToCii(instructions: PaymentInstructions): ram.TradeSettlementPaymentMeansType[] {
  const transfers: (CreditTransfer | undefined)[] = instructions.creditTransfers.length > 0 ? instructions.creditTransfers : [undefined]
  const debited = instructions.directDebit?.debitedAccountIdentifier
  return transfers.map((transfer, index) => new ram.TradeSettlementPaymentMeansType({
    typeCode: new qdt.PaymentMeansCodeType({ value: instructions.paymentMeansTypeCode }),
    information: ciiText(instructions.paymentMeansText),
    applicableTradeSettlementFinancialCard: index === 0 && instructions.card
      ? new ram.TradeSettlementFinancialCardType({ id: new udt.IDType({ value: instructions.card.primaryAccountNumber }), cardholderName: ciiText(instructions.card.holderName) })
      : undefined,
    payerPartyDebtorFinancialAccount: index === 0 && debited !== undefined
      ? new ram.DebtorFinancialAccountType({ ibanID: new udt.IDType({ value: debited }) })
      : undefined,
    payeePartyCreditorFinancialAccount: transfer && (transfer.paymentAccountIdentifier !== undefined || transfer.paymentAccountName !== undefined || transfer.nationalAccountNumber !== undefined)
      ? new ram.CreditorFinancialAccountType({
          ibanID: ciiId(transfer.paymentAccountIdentifier),
          accountName: ciiText(transfer.paymentAccountName),
          proprietaryID: ciiId(transfer.nationalAccountNumber),
        })
      : undefined,
    payeeSpecifiedCreditorFinancialInstitution: transfer?.paymentServiceProviderIdentifier === undefined
      ? undefined
      : new ram.CreditorFinancialInstitutionType({ bicID: new udt.IDType({ value: transfer.paymentServiceProviderIdentifier }) }),
  }))
}

function allowanceChargeToCii(entry: AllowanceCharge & { nonVatTaxCode?: string }, charge: boolean): ram.TradeAllowanceChargeType {
  const nonVat = entry.nonVatTaxCode
  return new ram.TradeAllowanceChargeType({
    chargeIndicator: new udt.IndicatorType({ indicator: charge }),
    calculationPercent: percent(entry.percentage),
    basisAmount: amount(entry.baseAmount),
    actualAmount: new udt.AmountType({ value: entry.amount }),
    reasonCode: nonVat !== undefined
      ? new qdt.AllowanceChargeReasonCodeType({ value: nonVat, listID: NON_VAT_TAX_LIST })
      : entry.reasonCode === undefined ? undefined : new qdt.AllowanceChargeReasonCodeType({ value: entry.reasonCode }),
    reason: ciiText(entry.reason),
    categoryTradeTax: new ram.TradeTaxType({
      typeCode: new qdt.TaxTypeCodeType({ value: VAT }),
      exemptionReason: ciiText(entry.vatExemptionReason),
      categoryCode: new qdt.TaxCategoryCodeType({ value: entry.vatCategoryCode }),
      exemptionReasonCode: ciiCode(entry.vatExemptionReasonCode),
      rateApplicablePercent: percent(entry.vatRate),
    }),
  })
}

/**
 * The settlement groups of an invoice as CII aggregates. Tolerates incomplete data: `toCii()` checks it.
 * `vatPoint` yields BT-7 / BT-8 as CII carries them, written on every VAT breakdown entry (a
 * document level term; annex B writes it that way).
 */
export function settlementToCii(invoice: Invoice, vatPoint: (invoice: Invoice) => Pick<ram.TradeTaxType, 'taxPointDate' | 'dueDateTypeCode'>): SettlementCii {
  const { totals, paymentInstructions } = invoice
  const terms = invoice.paymentTerms
  const due = invoice.paymentDueDate
  const mandate = paymentInstructions?.directDebit?.mandateReferenceIdentifier
  const exchange = invoice.vatCurrencyExchange
  return {
    creditorReferenceID: ciiId(paymentInstructions?.directDebit?.bankAssignedCreditorIdentifier),
    paymentReference: ciiText(paymentInstructions?.remittanceInformation),
    taxApplicableTradeCurrencyExchange: exchange
      ? new ram.TradeCurrencyExchangeType({
          sourceCurrencyCode: new qdt.CurrencyCodeType({ value: exchange.sourceCurrencyCode }),
          targetCurrencyCode: new qdt.CurrencyCodeType({ value: exchange.targetCurrencyCode }),
          conversionRate: new udt.RateType({ value: exchange.exchangeRate }),
          conversionRateDateTime: ciiDateTime(exchange.exchangeRateDate, 'EXT-FR-FE-192'),
        })
      : undefined,
    specifiedTradeSettlementPaymentMeans: paymentInstructions ? paymentMeansToCii(paymentInstructions) : [],
    applicableTradeTax: invoice.vatBreakdown.map(v => new ram.TradeTaxType({
      calculatedAmount: new udt.AmountType({ value: v.categoryTaxAmount }),
      typeCode: new qdt.TaxTypeCodeType({ value: VAT }),
      exemptionReason: ciiText(v.exemptionReasonText),
      basisAmount: new udt.AmountType({ value: v.categoryTaxableAmount }),
      categoryCode: new qdt.TaxCategoryCodeType({ value: v.categoryCode }),
      exemptionReasonCode: ciiCode(v.exemptionReasonCode),
      ...vatPoint(invoice),
      rateApplicablePercent: percent(v.categoryRate),
    })),
    // Allowances first, then charges: the order of every official document.
    specifiedTradeAllowanceCharge: [
      ...invoice.allowances.map(a => allowanceChargeToCii(a, false)),
      ...invoice.charges.map(c => allowanceChargeToCii(c, true)),
    ],
    // BT-9, BT-20 and BT-89 share the one payment terms entry.
    specifiedTradePaymentTerms: terms === undefined && due === undefined && mandate === undefined
      ? []
      : [new ram.TradePaymentTermsType({
          description: ciiText(terms),
          dueDateDateTime: ciiDateTime(due, 'BT-9'),
          directDebitMandateID: ciiId(mandate),
        })],
    specifiedTradeSettlementHeaderMonetarySummation: totals
      ? new ram.TradeSettlementHeaderMonetarySummationType({
          lineTotalAmount: amount(totals.sumOfInvoiceLineNetAmount),
          chargeTotalAmount: amount(totals.sumOfChargesOnDocumentLevel),
          allowanceTotalAmount: amount(totals.sumOfAllowancesOnDocumentLevel),
          taxBasisTotalAmount: new udt.AmountType({ value: totals.invoiceTotalAmountWithoutVat }),
          // The currency of BT-110 is BT-5 and that of BT-111 is BT-6 (matrix BT-110-0, BT-111-0).
          taxTotalAmount: [
            ...(totals.invoiceTotalVatAmount === undefined ? [] : [new udt.AmountType({ value: totals.invoiceTotalVatAmount, currencyID: invoice.currencyCode })]),
            ...(totals.invoiceTotalVatAmountInAccountingCurrency === undefined ? [] : [new udt.AmountType({ value: totals.invoiceTotalVatAmountInAccountingCurrency, currencyID: invoice.vatAccountingCurrencyCode })]),
          ],
          roundingAmount: amount(totals.roundingAmount),
          grandTotalAmount: new udt.AmountType({ value: totals.invoiceTotalAmountWithVat }),
          totalPrepaidAmount: amount(totals.paidAmount),
          duePayableAmount: new udt.AmountType({ value: totals.amountDueForPayment }),
        })
      : unmapped(),
  }
}

// ---------------------------------------------------------------------------
// Mandatory terms of the groups the invoice holds
// ---------------------------------------------------------------------------

type Check = [id: string, term: string, value: number | string | undefined, mandatory: boolean]

const empty = (value: number | string | undefined): boolean => typeof value === 'number' ? !Number.isFinite(value) : isBlank(value)

/**
 * Throws, naming the business term, when a mandatory term of a settlement group is missing, empty or
 * not a finite number, when an optional amount is not finite, when a credit transfer has no account
 * (BT-84 or BT-84-0, BR-50), or when a term needs another one (BT-111 needs BT-6; BT-105 and BT-177
 * share one CII element). Never quotes invoice content.
 */
export function assertSettlementComplete(invoice: Invoice): void {
  const { totals, paymentInstructions: payment, vatCurrencyExchange: exchange } = invoice
  if (!totals)
    throw new Error('toCii: BG-22 (document totals) is mandatory')
  if (!Array.isArray(invoice.vatBreakdown) || invoice.vatBreakdown.length === 0)
    throw new Error('toCii: BG-23 (VAT breakdown) is mandatory')
  if (!Array.isArray(invoice.allowances))
    throw new Error('toCii: BG-20 (document level allowances) must be an array')
  if (!Array.isArray(invoice.charges))
    throw new Error('toCii: BG-21 (document level charges) must be an array')
  const checks: Check[] = [
    ['BT-106', 'sum of invoice line net amount', totals.sumOfInvoiceLineNetAmount, true],
    ['BT-107', 'sum of allowances on document level', totals.sumOfAllowancesOnDocumentLevel, false],
    ['BT-108', 'sum of charges on document level', totals.sumOfChargesOnDocumentLevel, false],
    ['BT-109', 'invoice total amount without VAT', totals.invoiceTotalAmountWithoutVat, true],
    ['BT-110', 'invoice total VAT amount', totals.invoiceTotalVatAmount, false],
    ['BT-111', 'invoice total VAT amount in accounting currency', totals.invoiceTotalVatAmountInAccountingCurrency, false],
    ['BT-114', 'rounding amount', totals.roundingAmount, false],
    ['BT-112', 'invoice total amount with VAT', totals.invoiceTotalAmountWithVat, true],
    ['BT-113', 'paid amount', totals.paidAmount, false],
    ['BT-115', 'amount due for payment', totals.amountDueForPayment, true],
    ...invoice.vatBreakdown.flatMap((v): Check[] => [
      ['BT-116', 'VAT category taxable amount', v.categoryTaxableAmount, true],
      ['BT-117', 'VAT category tax amount', v.categoryTaxAmount, true],
      ['BT-118', 'VAT category code', v.categoryCode, true],
      ['BT-119', 'VAT category rate', v.categoryRate, false],
    ]),
    ...invoice.allowances.flatMap((a): Check[] => [
      ['BT-92', 'document level allowance amount', a.amount, true],
      ['BT-93', 'document level allowance base amount', a.baseAmount, false],
      ['BT-94', 'document level allowance percentage', a.percentage, false],
      ['BT-95', 'document level allowance VAT category code', a.vatCategoryCode, true],
      ['BT-96', 'document level allowance VAT rate', a.vatRate, false],
    ]),
    ...invoice.charges.flatMap((c): Check[] => [
      ['BT-99', 'document level charge amount', c.amount, true],
      ['BT-100', 'document level charge base amount', c.baseAmount, false],
      ['BT-101', 'document level charge percentage', c.percentage, false],
      ['BT-102', 'document level charge VAT category code', c.vatCategoryCode, true],
      ['BT-103', 'document level charge VAT rate', c.vatRate, false],
    ]),
    ...(payment
      ? [
          ['BT-81', 'payment means type code', payment.paymentMeansTypeCode, true] as Check,
          ...(payment.card ? [['BT-87', 'payment card primary account number', payment.card.primaryAccountNumber, true] as Check] : []),
        ]
      : []),
    ...(exchange
      ? [
          ['BT-167-2', 'VAT currency exchange source currency code', exchange.sourceCurrencyCode, true] as Check,
          ['BT-167-1', 'VAT currency exchange target currency code', exchange.targetCurrencyCode, true] as Check,
          ['BT-167', 'VAT currency exchange rate', exchange.exchangeRate, true] as Check,
        ]
      : []),
  ]
  for (const [id, term, value, mandatory] of checks) {
    if (mandatory && empty(value))
      throw new Error(`toCii: ${id} (${term}) is mandatory and empty`)
    if (!mandatory && typeof value === 'number' && !Number.isFinite(value))
      throw new Error(`toCii: ${id} (${term}) must be a finite number`)
  }
  // CII writes the VAT amount in accounting currency with BT-6 as its `@currencyID` (matrix BT-111-0).
  if (totals.invoiceTotalVatAmountInAccountingCurrency !== undefined && (invoice.vatAccountingCurrencyCode === undefined || invoice.vatAccountingCurrencyCode === ''))
    throw new Error('toCii: BT-111 (invoice total VAT amount in accounting currency) needs BT-6 (VAT accounting currency code)')
  for (const charge of invoice.charges) {
    if (charge.reasonCode !== undefined && charge.nonVatTaxCode !== undefined)
      throw new Error('toCii: BT-105 (document level charge reason code) and BT-177 (document level non-VAT tax code) share one CII element: set only one')
  }
  // BR-50: each credit transfer carries its account. CII writes BT-84 as `ram:IBANID` or, for a
  // non-SEPA account, `ram:ProprietaryID` (BT-84-0): either one satisfies it. Stricter than the vendored
  // Schematron, which fires BR-50 only for payment means TypeCode 30 or 58: kept on the rule text (CG-58).
  for (const transfer of payment?.creditTransfers ?? []) {
    if (empty(transfer.paymentAccountIdentifier) && empty(transfer.nationalAccountNumber))
      throw new Error('toCii: BT-84 (payment account identifier) is mandatory and empty in each BG-17; set an IBAN or a national account number (BT-84-0) (BR-50)')
  }
}
