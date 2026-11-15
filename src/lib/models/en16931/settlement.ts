/**
 * Settlement groups of the EN 16931 model: payment instructions (BG-16 to BG-19), document level
 * allowances and charges (BG-20, BG-21), the VAT breakdown (BG-23), the document totals (BG-22) and
 * the VAT currency exchange (CG-18).
 *
 * Amounts, rates and percentages are `number`s and are never rounded by this model. `invoiceToXml()` writes an Amount with 2 decimals (Factur-X §7.1.5 p.35), and `toCii()` does not check the BR-DEC decimal limits. A term whose value is fixed by
 * the Factur-X matrix (the VAT type code `VAT` of BT-95-0, BT-102-0 and BT-118-0, the code list `5153`
 * of BT-177-1, the currencies of BT-110-0 and BT-111-0) carries no property of its own: the property
 * of the term it qualifies names its id too (`@bt BT-118 BT-118-0`).
 */

/**
 * A credit transfer: the payment account the payee is paid on.
 * @bg BG-17
 */
export class CreditTransfer {
  constructor({ paymentAccountIdentifier, paymentAccountName, nationalAccountNumber, paymentServiceProviderIdentifier }: {
    paymentAccountIdentifier?: string
    paymentAccountName?: string
    nationalAccountNumber?: string
    paymentServiceProviderIdentifier?: string
  }) {
    this.paymentAccountIdentifier = paymentAccountIdentifier
    this.paymentAccountName = paymentAccountName
    this.nationalAccountNumber = nationalAccountNumber
    this.paymentServiceProviderIdentifier = paymentServiceProviderIdentifier
  }

  /**
   * Payment account identifier, such as an IBAN. Mandatory in EN 16931, optional in EXTENDED, where a
   * national account number (BT-84-0) can stand instead.
   * @bt BT-84
   */
  paymentAccountIdentifier?: string
  /**
   * Payment account name. Not in Factur-X BASIC.
   * @bt BT-85
   */
  paymentAccountName?: string
  /**
   * National account number (not SEPA), the Factur-X `ProprietaryID` of the account: "use IBANID when
   * appropriate, otherwise use ProprietaryID".
   * @bt BT-84-0
   */
  nationalAccountNumber?: string
  /**
   * Payment service provider identifier, such as a BIC. Not in Factur-X BASIC.
   * @bt BT-86
   */
  paymentServiceProviderIdentifier?: string
}

/**
 * Payment card information.
 * @bg BG-18
 */
export class PaymentCard {
  constructor({ primaryAccountNumber, holderName }: { primaryAccountNumber: string, holderName?: string }) {
    this.primaryAccountNumber = primaryAccountNumber
    this.holderName = holderName
  }

  /**
   * Payment card primary account number (the last four to six digits at most, BR-51). `fromCii()`
   * yields `''` when the document has none; `toCii()` throws on `''`.
   * @bt BT-87
   */
  primaryAccountNumber: string
  /**
   * Payment card holder name.
   * @bt BT-88
   */
  holderName?: string
}

/**
 * Direct debit. CII spreads it over three places (BT-89 in the payment terms, BT-90 on the
 * settlement header, BT-91 in the payment means); the mapping puts each where the Factur-X matrix does.
 * @bg BG-19
 */
export class DirectDebit {
  constructor({ mandateReferenceIdentifier, bankAssignedCreditorIdentifier, debitedAccountIdentifier }: {
    mandateReferenceIdentifier?: string
    bankAssignedCreditorIdentifier?: string
    debitedAccountIdentifier?: string
  }) {
    this.mandateReferenceIdentifier = mandateReferenceIdentifier
    this.bankAssignedCreditorIdentifier = bankAssignedCreditorIdentifier
    this.debitedAccountIdentifier = debitedAccountIdentifier
  }

  /**
   * Mandate reference identifier.
   * @bt BT-89
   */
  mandateReferenceIdentifier?: string
  /**
   * Bank assigned creditor identifier.
   * @bt BT-90
   */
  bankAssignedCreditorIdentifier?: string
  /**
   * Debited account identifier, such as an IBAN.
   * @bt BT-91
   */
  debitedAccountIdentifier?: string
}

/**
 * Payment instructions. CII holds one `SpecifiedTradeSettlementPaymentMeans` per credit transfer (and
 * one when there is none), each repeating BT-81 and BT-82; the card (BG-18) and the debited account
 * (BT-91) go in the first. `0..1` here although EXTENDED allows several: the UBL syntax has one
 * `cac:PaymentMeans` per credit transfer group too, and a second payment means with another type
 * code is reported in `dropped`.
 * @bg BG-16
 */
export class PaymentInstructions {
  constructor({ paymentMeansTypeCode, paymentMeansText, remittanceInformation, creditTransfers, card, directDebit }: {
    paymentMeansTypeCode: string
    paymentMeansText?: string
    remittanceInformation?: string
    creditTransfers?: CreditTransfer[]
    card?: PaymentCard
    directDebit?: DirectDebit
  }) {
    this.paymentMeansTypeCode = paymentMeansTypeCode
    this.paymentMeansText = paymentMeansText
    this.remittanceInformation = remittanceInformation
    this.creditTransfers = creditTransfers ?? []
    this.card = card
    this.directDebit = directDebit
  }

  /**
   * Payment means type code (UNTDID 4461). `fromCii()` yields `''` when the document has none;
   * `toCii()` throws on `''`.
   * @bt BT-81
   */
  paymentMeansTypeCode: string
  /**
   * Payment means text. Not in Factur-X BASIC.
   * @bt BT-82
   */
  paymentMeansText?: string
  /**
   * Remittance information (CII `PaymentReference`, once per document).
   * @bt BT-83
   */
  remittanceInformation?: string
  /**
   * Credit transfers.
   * @bg BG-17
   */
  creditTransfers: CreditTransfer[]
  /**
   * Payment card information. Not in Factur-X BASIC.
   * @bg BG-18
   */
  card?: PaymentCard
  /**
   * Direct debit.
   * @bg BG-19
   */
  directDebit?: DirectDebit
}

/**
 * A document level allowance (BG-20-0 and BG-20-1, the charge indicator `false`, are fixed by the class).
 * @bg BG-20 BG-20-0 BG-20-1
 */
export class DocumentAllowance {
  constructor({
    amount,
    baseAmount,
    percentage,
    vatCategoryCode,
    vatRate,
    reason,
    reasonCode,
    vatExemptionReason,
    vatExemptionReasonCode,
  }: {
    amount: number
    baseAmount?: number
    percentage?: number
    vatCategoryCode: string
    vatRate?: number
    reason?: string
    reasonCode?: string
    vatExemptionReason?: string
    vatExemptionReasonCode?: string
  }) {
    this.amount = amount
    this.baseAmount = baseAmount
    this.percentage = percentage
    this.vatCategoryCode = vatCategoryCode
    this.vatRate = vatRate
    this.reason = reason
    this.reasonCode = reasonCode
    this.vatExemptionReason = vatExemptionReason
    this.vatExemptionReasonCode = vatExemptionReasonCode
  }

  /**
   * Document level allowance amount, without VAT. `fromCii()` yields `NaN` when the document has none; `toCii()` throws on it.
   * @bt BT-92
   */
  amount: number
  /**
   * Document level allowance base amount.
   * @bt BT-93
   */
  baseAmount?: number
  /**
   * Document level allowance percentage.
   * @bt BT-94
   */
  percentage?: number
  /**
   * Document level allowance VAT category code (UNCL 5305); the VAT type code `VAT` of the same CII
   * aggregate (BT-95-0) is fixed. `fromCii()` yields `''` when the document has none; `toCii()` throws on `''`.
   * @bt BT-95 BT-95-0
   */
  vatCategoryCode: string
  /**
   * Document level allowance VAT rate.
   * @bt BT-96
   */
  vatRate?: number
  /**
   * Document level allowance reason.
   * @bt BT-97
   */
  reason?: string
  /**
   * Document level allowance reason code (UNCL 5189).
   * @bt BT-98
   */
  reasonCode?: string
  /**
   * VAT exemption reason for the document level allowance. EXTENDED-CTC-FR.
   * @bt BT-173
   * @ext EXT-FR-FE-187
   */
  vatExemptionReason?: string
  /**
   * VAT exemption reason code for the document level allowance. EXTENDED-CTC-FR.
   * @bt BT-174
   * @ext EXT-FR-FE-188
   */
  vatExemptionReasonCode?: string
}

/**
 * A document level charge (BG-21-0 and BG-21-1, the charge indicator `true`, are fixed by the class).
 * @bg BG-21 BG-21-0 BG-21-1
 */
export class DocumentCharge {
  constructor({
    amount,
    baseAmount,
    percentage,
    vatCategoryCode,
    vatRate,
    reason,
    reasonCode,
    nonVatTaxCode,
    vatExemptionReason,
    vatExemptionReasonCode,
  }: {
    amount: number
    baseAmount?: number
    percentage?: number
    vatCategoryCode: string
    vatRate?: number
    reason?: string
    reasonCode?: string
    nonVatTaxCode?: string
    vatExemptionReason?: string
    vatExemptionReasonCode?: string
  }) {
    this.amount = amount
    this.baseAmount = baseAmount
    this.percentage = percentage
    this.vatCategoryCode = vatCategoryCode
    this.vatRate = vatRate
    this.reason = reason
    this.reasonCode = reasonCode
    this.nonVatTaxCode = nonVatTaxCode
    this.vatExemptionReason = vatExemptionReason
    this.vatExemptionReasonCode = vatExemptionReasonCode
  }

  /**
   * Document level charge amount, without VAT. `fromCii()` yields `NaN` when the document has none; `toCii()` throws on it.
   * @bt BT-99
   */
  amount: number
  /**
   * Document level charge base amount.
   * @bt BT-100
   */
  baseAmount?: number
  /**
   * Document level charge percentage.
   * @bt BT-101
   */
  percentage?: number
  /**
   * Document level charge VAT category code (UNCL 5305); the VAT type code `VAT` of the same CII
   * aggregate (BT-102-0) is fixed. `fromCii()` yields `''` when the document has none; `toCii()` throws on `''`.
   * @bt BT-102 BT-102-0
   */
  vatCategoryCode: string
  /**
   * Document level charge VAT rate.
   * @bt BT-103
   */
  vatRate?: number
  /**
   * Document level charge reason.
   * @bt BT-104
   */
  reason?: string
  /**
   * Document level charge reason code (UNCL 7161). CII has one `ReasonCode` element for this and
   * BT-177: this is the one without `@listID`.
   * @bt BT-105
   */
  reasonCode?: string
  /**
   * Document level non-VAT tax code (UNTDID 5153; `VAT` is not allowed). CII writes it in the
   * `ReasonCode` with `@listID="5153"` (BT-177-1, fixed); either BT-177 or BT-105, not both. EXTENDED-CTC-FR.
   * @bt BT-177 BT-177-1
   */
  nonVatTaxCode?: string
  /**
   * VAT exemption reason for the document level charge. EXTENDED-CTC-FR.
   * @bt BT-175
   * @ext EXT-FR-FE-189
   */
  vatExemptionReason?: string
  /**
   * VAT exemption reason code for the document level charge. EXTENDED-CTC-FR.
   * @bt BT-176
   * @ext EXT-FR-FE-190
   */
  vatExemptionReasonCode?: string
}

/**
 * Document totals. Amounts of the invoice currency (BT-5), except BT-111.
 * @bg BG-22
 */
export class DocumentTotals {
  constructor({
    sumOfInvoiceLineNetAmount,
    sumOfAllowancesOnDocumentLevel,
    sumOfChargesOnDocumentLevel,
    invoiceTotalAmountWithoutVat,
    invoiceTotalVatAmount,
    invoiceTotalVatAmountInAccountingCurrency,
    roundingAmount,
    invoiceTotalAmountWithVat,
    paidAmount,
    amountDueForPayment,
  }: {
    sumOfInvoiceLineNetAmount: number
    sumOfAllowancesOnDocumentLevel?: number
    sumOfChargesOnDocumentLevel?: number
    invoiceTotalAmountWithoutVat: number
    invoiceTotalVatAmount?: number
    invoiceTotalVatAmountInAccountingCurrency?: number
    roundingAmount?: number
    invoiceTotalAmountWithVat: number
    paidAmount?: number
    amountDueForPayment: number
  }) {
    this.sumOfInvoiceLineNetAmount = sumOfInvoiceLineNetAmount
    this.sumOfAllowancesOnDocumentLevel = sumOfAllowancesOnDocumentLevel
    this.sumOfChargesOnDocumentLevel = sumOfChargesOnDocumentLevel
    this.invoiceTotalAmountWithoutVat = invoiceTotalAmountWithoutVat
    this.invoiceTotalVatAmount = invoiceTotalVatAmount
    this.invoiceTotalVatAmountInAccountingCurrency = invoiceTotalVatAmountInAccountingCurrency
    this.roundingAmount = roundingAmount
    this.invoiceTotalAmountWithVat = invoiceTotalAmountWithVat
    this.paidAmount = paidAmount
    this.amountDueForPayment = amountDueForPayment
  }

  /**
   * Sum of invoice line net amount. `fromCii()` yields `NaN` when the document has none; `toCii()`
   * throws on a non-finite one.
   * @bt BT-106
   */
  sumOfInvoiceLineNetAmount: number
  /**
   * Sum of allowances on document level.
   * @bt BT-107
   */
  sumOfAllowancesOnDocumentLevel?: number
  /**
   * Sum of charges on document level.
   * @bt BT-108
   */
  sumOfChargesOnDocumentLevel?: number
  /**
   * Invoice total amount without VAT. `xmlToInvoice()` reads a missing element as `0`, so `fromCii()` cannot tell it from a real zero.
   * @bt BT-109
   */
  invoiceTotalAmountWithoutVat: number
  /**
   * Invoice total VAT amount, in the invoice currency (BT-5; also BT-110-0, the currency of the CII element).
   * @bt BT-110 BT-110-0 BT-110-1
   */
  invoiceTotalVatAmount?: number
  /**
   * Invoice total VAT amount in accounting currency, in the VAT accounting currency (BT-6; also
   * BT-111-0). `toCii()` throws when it is set and BT-6 is not.
   * @bt BT-111 BT-111-0 BT-111-1
   */
  invoiceTotalVatAmountInAccountingCurrency?: number
  /**
   * Rounding amount. Not in Factur-X BASIC.
   * @bt BT-114
   */
  roundingAmount?: number
  /**
   * Invoice total amount with VAT. `xmlToInvoice()` reads a missing element as `0` (as for BT-109).
   * @bt BT-112
   */
  invoiceTotalAmountWithVat: number
  /**
   * Paid amount.
   * @bt BT-113
   */
  paidAmount?: number
  /**
   * Amount due for payment. `xmlToInvoice()` reads a missing element as `0` (as for BT-109).
   * @bt BT-115
   */
  amountDueForPayment: number
}

/**
 * One VAT breakdown: the taxable and tax amounts of a VAT category (and rate). Several entries may
 * share a category (annex B UC10, UC11: one per rate or exemption reason).
 * @bg BG-23
 */
export class VatBreakdown {
  constructor({ categoryTaxableAmount, categoryTaxAmount, categoryCode, categoryRate, exemptionReasonText, exemptionReasonCode }: {
    categoryTaxableAmount: number
    categoryTaxAmount: number
    categoryCode: string
    categoryRate?: number
    exemptionReasonText?: string
    exemptionReasonCode?: string
  }) {
    this.categoryTaxableAmount = categoryTaxableAmount
    this.categoryTaxAmount = categoryTaxAmount
    this.categoryCode = categoryCode
    this.categoryRate = categoryRate
    this.exemptionReasonText = exemptionReasonText
    this.exemptionReasonCode = exemptionReasonCode
  }

  /**
   * VAT category taxable amount. `fromCii()` yields `NaN` when the document has none.
   * @bt BT-116
   */
  categoryTaxableAmount: number
  /**
   * VAT category tax amount. `fromCii()` yields `NaN` when the document has none.
   * @bt BT-117
   */
  categoryTaxAmount: number
  /**
   * VAT category code (UNCL 5305); the VAT type code `VAT` of the same CII aggregate (BT-118-0) is
   * fixed. `fromCii()` yields `''` when the document has none; `toCii()` throws on `''`.
   * @bt BT-118 BT-118-0
   */
  categoryCode: string
  /**
   * VAT category rate (a percentage, not rounded).
   * @bt BT-119
   */
  categoryRate?: number
  /**
   * VAT exemption reason text.
   * @bt BT-120
   */
  exemptionReasonText?: string
  /**
   * VAT exemption reason code.
   * @bt BT-121
   */
  exemptionReasonCode?: string
}

/**
 * The exchange rate the VAT amount in accounting currency (BT-111) was converted at (CG-18, CII
 * `TaxApplicableTradeCurrencyExchange`). EXTENDED-CTC-FR; XP Z12-012 annex A `BT-167-00`.
 */
export class VatCurrencyExchange {
  constructor({ sourceCurrencyCode, targetCurrencyCode, exchangeRate, exchangeRateDate }: {
    sourceCurrencyCode: string
    targetCurrencyCode: string
    exchangeRate: number
    exchangeRateDate?: string
  }) {
    this.sourceCurrencyCode = sourceCurrencyCode
    this.targetCurrencyCode = targetCurrencyCode
    this.exchangeRate = exchangeRate
    this.exchangeRateDate = exchangeRateDate
  }

  /**
   * Source currency code (ISO 4217): the invoice currency (BT-5). `fromCii()` yields `''` when the
   * document has none; `toCii()` throws on `''`.
   * @bt BT-167-2
   */
  sourceCurrencyCode: string
  /**
   * Target currency code (ISO 4217): the VAT accounting currency (BT-6). `fromCii()` yields `''`
   * when the document has none; `toCii()` throws on `''`.
   * @bt BT-167-1
   */
  targetCurrencyCode: string
  /**
   * Exchange rate (not rounded). `fromCii()` yields `NaN` when the document has none; `toCii()` throws on it.
   * @bt BT-167
   */
  exchangeRate: number
  /**
   * Exchange rate date (ISO `YYYY-MM-DD`).
   * @ext EXT-FR-FE-192
   */
  exchangeRateDate?: string
}
