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
import { assertLevelCarries, EN16931_LEVELS, GUIDELINE_IDS, isEn16931Level } from './levels'

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

// Mandatory header terms `fromCii()` stands in `''` for when the document lacks them.
const MANDATORY: readonly [string, string, (invoice: Invoice) => string][] = [
  ['BT-1', 'invoice number', i => i.number],
  ['BT-2', 'invoice issue date', i => i.issueDate],
  ['BT-3', 'invoice type code', i => i.typeCode],
  ['BT-5', 'invoice currency code', i => i.currencyCode],
]

/**
 * Write an EN 16931 invoice as a CII model at `level`, for `invoiceToXml()`. Throws, naming the
 * business term, when a mandatory term (BT-1, BT-2, BT-3, BT-5) is empty, when the invoice holds a
 * value `level` cannot carry (an `EXT-FR-FE-*` field below `extended`, a term Factur-X BASIC lacks
 * at `basic`), when BT-24 is set to anything but the exact identifier of `level`, or when a date is
 * not a valid ISO `YYYY-MM-DD` date, or when BT-11-0 is set without BT-11. Never quotes invoice content.
 */
export function toCii(invoice: Invoice, options: ToCiiOptions): CrossIndustryInvoiceType {
  const level = options?.level
  if (!isEn16931Level(level))
    throw new Error(`toCii: options.level must be one of ${LEVEL_LIST}`)
  for (const [id, term, get] of MANDATORY) {
    const value = get(invoice)
    if (value === undefined || value === '')
      throw new Error(`toCii: ${id} (${term}) is mandatory and empty`)
  }
  assertLevelCarries(invoice, level, HEADER_GATES)
  // CII has the project name only inside the project reference: writing it alone would lose it.
  if (invoice.projectName !== undefined && invoice.projectReference === undefined)
    throw new Error('toCii: BT-11-0 (project name) needs BT-11 (project reference)')
  // Exact allow-list (Factur-X matrices, BT-24 usage note): another level's id, Order-X or a CIUS
  // identifier would make the written document claim a profile it was not checked against.
  const specification = invoice.specificationIdentifier
  if (specification === '')
    return buildCii(new Invoice({ ...invoice, specificationIdentifier: undefined }), level)
  if (specification !== undefined && specification !== GUIDELINE_IDS[level])
    throw new Error(`toCii: BT-24 (specification identifier) is not the identifier of level "${level}"; clear it to write that identifier, or set ${GUIDELINE_IDS[level]}`)
  return buildCii(invoice, level)
}
