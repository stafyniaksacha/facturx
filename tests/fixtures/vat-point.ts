import type { CrossIndustryInvoiceType } from '@stafyniaksacha/facturx/models'

// Corpus F20260023, F20260024 and F20260031 carry BT-7 / BT-8 on the first ApplicableTradeTax entry
// only; `toCii()` writes them on every entry (controller ruling, matches annex B). Every original
// value is still present in the regenerated CII: only its placement differs. This is the only
// loosening of the CII model comparisons of the EN 16931 mapping tests.
export const FIRST_ENTRY_ONLY = /F2026(?:0023|0024|0031)/

export function spreadVatPoint(cii: CrossIndustryInvoiceType): CrossIndustryInvoiceType {
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
