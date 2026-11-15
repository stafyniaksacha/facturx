/**
 * EN 16931 model ⇄ CII (`CrossIndustryInvoiceType`). The CII model stays the only CII XML code:
 * write with `invoiceToXml(toCii(invoice, { level }))`, read with `fromCii(await xmlToInvoice(xml))`.
 */

import type { En16931Level } from '../../models/en16931/level'
import type { CrossIndustryInvoiceType } from '../../models/facturx/crossIndustryInvoice'
import { Invoice } from '../../models/en16931/invoice'
import { levelFromGuidelineId } from '../../xml'
import { diffPaths } from './dropped'
import { HEADER_GATES, headerFromCii, headerToCii } from './header'
import { assertLevelCarries, EN16931_LEVELS, isEn16931Level } from './levels'

/** What `fromCii()` returns. */
export interface FromCiiResult {
  /** The invoice, keyed by EN 16931 business term. */
  invoice: Invoice
  /**
   * XPath-like paths (`/rsm:CrossIndustryInvoice/…/ram:X[n]`) of every CII value the model has no
   * place for (typically Factur-X `BT-X-*` fields), so nothing is lost silently. Positions only:
   * never the values.
   */
  dropped: string[]
}

/** Options of `toCii()`. */
export interface ToCiiOptions {
  /** The profile to write: decides BT-24 and which terms may be present. */
  level: En16931Level
}

const LEVEL_LIST = EN16931_LEVELS.map(l => `"${l}"`).join(', ')

// The level of a CII document, from BT-24. MINIMUM and BASIC WL miss mandatory EN 16931 terms (no
// lines, no VAT breakdown detail), so they have no EN 16931 model (design, non-goals).
function levelOf(cii: CrossIndustryInvoiceType): En16931Level {
  let level: string
  try {
    level = levelFromGuidelineId(cii.exchangedDocumentContext?.guidelineSpecifiedDocumentContextParameter?.id?.value)
  }
  catch {
    throw new Error(`fromCii: BT-24 (specification identifier) names no profile this model maps (${LEVEL_LIST}); not an EN 16931 invoice this model reads`)
  }
  if (!isEn16931Level(level))
    throw new Error(`fromCii: a "${level}" document is not an EN 16931 invoice (it lacks mandatory EN 16931 terms); use the CII model (Models) for it`)
  return level
}

// Every group mapping, in CII document order. Content checks (gates, BT-24) are the caller's.
function buildCii(invoice: Invoice, level: En16931Level): CrossIndustryInvoiceType {
  return headerToCii(invoice, level)
}

/**
 * Read a CII invoice into the EN 16931 model. Accepts BASIC, EN 16931, EXTENDED and
 * EXTENDED-CTC-FR documents (from BT-24); throws for MINIMUM and BASIC WL, which are not EN 16931
 * invoices. `dropped` lists every CII value the model cannot hold, computed by mapping the invoice
 * back at the document's level and comparing.
 */
export function fromCii(cii: CrossIndustryInvoiceType): FromCiiResult {
  const level = levelOf(cii)
  const invoice = new Invoice(headerFromCii(cii))
  return { invoice, dropped: diffPaths(cii, buildCii(invoice, level)) }
}

/**
 * Write an EN 16931 invoice as a CII model at `level`, for `invoiceToXml()`. Throws, naming the
 * business term, when the invoice holds a value `level` cannot carry (an `EXT-FR-FE-*` field below
 * `extended`, a term Factur-X BASIC lacks at `basic`), when BT-24 is set to another level's
 * identifier, or when a date is not ISO `YYYY-MM-DD`. Never quotes invoice content.
 */
export function toCii(invoice: Invoice, options: ToCiiOptions): CrossIndustryInvoiceType {
  const level = options?.level
  if (!isEn16931Level(level))
    throw new Error(`toCii: options.level must be one of ${LEVEL_LIST}`)
  assertLevelCarries(invoice, level, HEADER_GATES)
  if (invoice.specificationIdentifier !== undefined) {
    let named: string | undefined
    try {
      named = levelFromGuidelineId(invoice.specificationIdentifier)
    }
    catch {
      named = undefined
    }
    if (named !== level)
      throw new Error(`toCii: BT-24 (specification identifier) does not name level "${level}"; unset it to write the level's identifier`)
  }
  return buildCii(invoice, level)
}
