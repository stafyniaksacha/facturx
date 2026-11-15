/**
 * The *Amount* decimals rule of `toCii()` (spec §7.1.5 p.35, BR-DEC-*): only an *Amount* is limited to
 * two decimals, *Unit Price Amount*s, quantities, percentages and rates are not. `invoiceToXml()`
 * rounds an *Amount* to cents, so a value with more decimals would be changed silently on write:
 * `toCii()` throws instead, naming the term.
 *
 * The check runs on the written CII model. The *Unit Price Amount*s are exactly the amounts inside a
 * `TradePriceType` (net price BT-146, gross price BT-148, price discount BT-147), the places where the
 * XML writer does not round either.
 */

import type { CrossIndustryInvoiceType } from '../../models/facturx/crossIndustryInvoice'
import { TradePriceType } from '../../models/facturx/reusableTypes'
import { AmountType } from '../../models/facturx/unqualifiedTypes'

/** True when `value` has more than two decimals, ignoring floating point noise (`0.1 + 0.2`). */
export function hasMoreThanTwoDecimals(value: number): boolean {
  if (!Number.isFinite(value))
    return false
  const cents = Math.abs(value) * 100
  return Math.abs(cents - Math.round(cents)) > Math.max(1e-6, cents * Number.EPSILON * 4)
}

const SUMMATION: Record<string, [string, string]> = {
  lineTotalAmount: ['BT-106', 'sum of invoice line net amount'],
  chargeTotalAmount: ['BT-108', 'sum of charges on document level'],
  allowanceTotalAmount: ['BT-107', 'sum of allowances on document level'],
  taxBasisTotalAmount: ['BT-109', 'invoice total amount without VAT'],
  roundingAmount: ['BT-114', 'rounding amount'],
  grandTotalAmount: ['BT-112', 'invoice total amount with VAT'],
  totalPrepaidAmount: ['BT-113', 'paid amount'],
  duePayableAmount: ['BT-115', 'amount due for payment'],
}

type Node = Record<string, unknown>
const isNode = (value: unknown): value is Node => typeof value === 'object' && value !== null

// The business term of an amount, from where it sits in the CII model; a generic name when unknown.
function termOf(keys: string[], parent: Node | undefined, amount: AmountType, invoiceCurrency: string | undefined): string {
  const named = keys.filter(k => !/^\d+$/.test(k))
  const key = named.at(-1)!
  const owner = named.at(-2)
  const inLine = keys.includes('includedSupplyChainTradeLineItem')
  if (owner === 'specifiedTradeSettlementHeaderMonetarySummation') {
    // Told apart by `@currencyID`, as `fromCii()` reads them (matrix BT-110-0, BT-111-0), not by position:
    // a BT-111 written without BT-110 is the only TaxTotalAmount.
    if (key === 'taxTotalAmount')
      return amount.currencyID === undefined || amount.currencyID === invoiceCurrency ? 'BT-110 (invoice total VAT amount)' : 'BT-111 (invoice total VAT amount in accounting currency)'
    const term = SUMMATION[key]
    if (term)
      return `${term[0]} (${term[1]})`
  }
  if (owner === 'applicableTradeTax' && !inLine && key === 'basisAmount')
    return 'BT-116 (VAT category taxable amount)'
  if (owner === 'applicableTradeTax' && !inLine && key === 'calculatedAmount')
    return 'BT-117 (VAT category tax amount)'
  if (owner === 'specifiedTradeAllowanceCharge' && (key === 'actualAmount' || key === 'basisAmount')) {
    const charge = (parent?.chargeIndicator as Node | undefined)?.indicator === true
    const [id, term] = inLine
      ? (key === 'actualAmount' ? (charge ? ['BT-141', 'invoice line charge amount'] : ['BT-136', 'invoice line allowance amount']) : (charge ? ['BT-142', 'invoice line charge base amount'] : ['BT-137', 'invoice line allowance base amount']))
      : (key === 'actualAmount' ? (charge ? ['BT-99', 'document level charge amount'] : ['BT-92', 'document level allowance amount']) : (charge ? ['BT-100', 'document level charge base amount'] : ['BT-93', 'document level allowance base amount']))
    return `${id} (${term})`
  }
  if (owner === 'specifiedTradeSettlementLineMonetarySummation' && key === 'lineTotalAmount')
    return 'BT-131 (invoice line net amount)'
  return `an Amount (CII element ${key})`
}

function walk(value: unknown, keys: string[], parent: Node | undefined, invoiceCurrency: string | undefined): void {
  if (value instanceof TradePriceType)
    return
  if (value instanceof AmountType) {
    if (hasMoreThanTwoDecimals(value.value))
      throw new Error(`toCii: ${termOf(keys, parent, value, invoiceCurrency)} has more than 2 decimals; an Amount is limited to 2 (spec §7.1.5, BR-DEC), round it first`)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => walk(item, [...keys, String(i)], parent, invoiceCurrency))
    return
  }
  if (isNode(value)) {
    for (const [key, child] of Object.entries(value))
      walk(child, [...keys, key], value, invoiceCurrency)
  }
}

/** Throws, naming the term, when an Amount of the CII model written by `toCii()` has more than two decimals. */
export function assertAmountDecimals(cii: CrossIndustryInvoiceType): void {
  walk(cii, [], undefined, cii.supplyChainTradeTransaction?.applicableHeaderTradeSettlement?.invoiceCurrencyCode?.value)
}
