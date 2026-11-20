/**
 * EN 16931 model ⇄ CII (`CrossIndustryInvoiceType`). The CII model stays the only CII XML code:
 * write with `invoiceToXml(toCii(invoice, { level }))`, read with `fromCii(await xmlToInvoice(xml))`.
 */

import type { Identifier } from '../../models/en16931/common'
import type { En16931Level } from '../../models/en16931/level'
import type { InvoiceLine } from '../../models/en16931/lines'
import type { CrossIndustryInvoiceType } from '../../models/facturx/crossIndustryInvoice'
import { Invoice } from '../../models/en16931/invoice'
import * as udt from '../../models/facturx/unqualifiedTypes'
import { levelFromGuidelineId } from '../../xml'
import { assertAmountDecimals } from './amounts'
import { diffPaths } from './dropped'
import { assertHeaderComplete, HEADER_GATES, headerFromCii, headerToCii } from './header'
import { assertLevelCarries, EN16931_LEVELS, GUIDELINE_IDS, isEn16931Level } from './levels'
import { assertDetailLinesComplete, assertLinesComplete, CII_DETAIL_LINE_RULES, LINE_GATES, linesFromCii } from './lines'
import { assertPartiesComplete, assertPartyIdentifierCounts, partiesFromCii, PARTY_GATES } from './parties'
import { assertSettlementComplete, SETTLEMENT_GATES, settlementFromCii } from './settlement'
import { isBlank } from './values'

/** What `fromCii()` returns. */
export interface FromCiiResult {
  /** The invoice, keyed by EN 16931 business term. */
  invoice: Invoice
  /**
   * XPath-like paths (`/rsm:CrossIndustryInvoice/…/ram:X[n]`, an index only on repeatable elements)
   * of every CII value the model has no place for (typically Factur-X `BT-X-*` fields). Positions
   * only, never the values. Repeated elements are paired by exact equality first, at any position (a
   * writer may reorder them), then by position, and a path carries the element's position in the
   * source document. Computed in time linear in the size of the document.
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
  const invoice = new Invoice({ ...headerFromCii(cii), ...partiesFromCii(cii), ...settlementFromCii(cii), ...linesFromCii(cii) })
  return { invoice, dropped: diffPaths(cii, withParserNoteContent(buildCii(invoice, level))) }
}

// `xmlToInvoice()` reads a note without `ram:Content` with an empty one (CG-37), and `fromCii()` reads that
// as a note without text, which the writer writes without Content: give the written model the parser's
// stand-in before comparing, so `dropped` does not report the empty text the source never had.
function withParserNoteContent(cii: CrossIndustryInvoiceType): CrossIndustryInvoiceType {
  const notes = [
    ...(cii.exchangedDocument.includedNote ?? []),
    ...(cii.supplyChainTradeTransaction.includedSupplyChainTradeLineItem ?? []).flatMap(l => l.associatedDocumentLineDocument.includedNote ?? []),
  ]
  for (const note of notes)
    note.content ??= new udt.TextType({ value: '' })
  return cii
}

// Mandatory header terms `fromCii()` stands in `''` for when the document lacks them.
export const MANDATORY: readonly [string, string, (invoice: Invoice) => string][] = [
  ['BT-1', 'invoice number', i => i.number],
  ['BT-2', 'invoice issue date', i => i.issueDate],
  ['BT-3', 'invoice type code', i => i.typeCode],
  ['BT-5', 'invoice currency code', i => i.currencyCode],
]

// An optional repeatable group (0..n) of an invoice built as a plain object may be left out: it reads
// as empty. Anything else in its place is refused, naming the term. The mandatory ones (BG-23, BG-25)
// are not defaulted: their own checks name them.
function list<T>(value: T[] | undefined, id: string, term: string): T[] {
  if (value === undefined || value === null)
    return []
  if (!Array.isArray(value))
    throw new Error(`toCii: ${id} (${term}) must be an array`)
  return value
}

function withIdentifiers<T extends { identifiers?: Identifier[] }>(party: T | undefined, id: string, term: string): T | undefined {
  return party && typeof party === 'object' ? { ...party, identifiers: list(party.identifiers, id, term) } : party
}

// A shallow copy of the invoice where every optional repeatable group the checks and writers iterate is
// an array, so a plain-object invoice gets the same named errors as a class instance, never a TypeError.
// Copies, never mutates the caller's objects.
export function withArrays(invoice: Invoice): Invoice {
  const payment = invoice.paymentInstructions
  return {
    ...invoice,
    invoicedObjectIdentifiers: list(invoice.invoicedObjectIdentifiers, 'BT-18', 'invoiced object identifiers'),
    notes: list(invoice.notes, 'BG-1', 'invoice notes'),
    precedingInvoiceReferences: list(invoice.precedingInvoiceReferences, 'BG-3', 'preceding invoice references'),
    additionalDocuments: list(invoice.additionalDocuments, 'BG-24', 'additional supporting documents'),
    allowances: list(invoice.allowances, 'BG-20', 'document level allowances'),
    charges: list(invoice.charges, 'BG-21', 'document level charges'),
    seller: withIdentifiers(invoice.seller, 'BT-29', 'seller identifiers')!,
    buyer: withIdentifiers(invoice.buyer, 'BT-46', 'buyer identifiers')!,
    payee: withIdentifiers(invoice.payee, 'BT-60', 'payee identifiers'),
    buyerAgent: withIdentifiers(invoice.buyerAgent, 'EXT-FR-FE-06', 'buyer agent identifiers'),
    payer: withIdentifiers(invoice.payer, 'EXT-FR-FE-46', 'payer identifiers'),
    sellerAgent: withIdentifiers(invoice.sellerAgent, 'EXT-FR-FE-69', 'seller agent identifiers'),
    invoicee: withIdentifiers(invoice.invoicee, 'EXT-FR-FE-92', 'invoicee identifiers'),
    billingParty: withIdentifiers(invoice.billingParty, 'EXT-FR-FE-115', 'billing party identifiers'),
    paymentInstructions: payment && typeof payment === 'object'
      ? { ...payment, creditTransfers: list(payment.creditTransfers, 'BG-17', 'credit transfers') }
      : payment,
    // BG-25 is mandatory: left as it is for `assertLinesComplete()` to name when it is not an array.
    lines: Array.isArray(invoice.lines) ? invoice.lines.map(withLineArrays) : invoice.lines,
  } as Invoice
}

function withLineArrays(line: InvoiceLine): InvoiceLine {
  if (!line || typeof line !== 'object')
    return line
  return {
    ...line,
    notes: list(line.notes, 'BT-127', 'invoice line notes'),
    objectIdentifiers: list(line.objectIdentifiers, 'BT-128', 'invoice line object identifiers'),
    allowances: list(line.allowances, 'BG-27', 'invoice line allowances'),
    charges: list(line.charges, 'BG-28', 'invoice line charges'),
    precedingInvoiceReferences: list(line.precedingInvoiceReferences, 'EXT-FR-FE-BG-06', 'preceding invoice references of the line'),
    item: line.item && typeof line.item === 'object'
      ? {
          ...line.item,
          attributes: list(line.item.attributes, 'BG-32', 'item attributes'),
          classifications: list(line.item.classifications, 'BT-158', 'item classification identifiers'),
        }
      : line.item,
    deliverTo: withIdentifiers(line.deliverTo, 'EXT-FR-FE-146', 'deliver to identifiers of the line'),
    seller: withIdentifiers(line.seller, 'EXT-FR-FE-166', 'line seller identifiers'),
  } as InvoiceLine
}

// The Amount decimals rule runs on what is written (`fromCii()` stays tolerant).
function checked(cii: CrossIndustryInvoiceType): CrossIndustryInvoiceType {
  assertAmountDecimals(cii)
  return cii
}

/**
 * Write an EN 16931 invoice as a CII model at `level`, for `invoiceToXml()`. Throws, naming the
 * business term (never quoting invoice content), when:
 * - a mandatory term is empty: BT-1, BT-2, BT-3, BT-5, the mandatory terms of the groups the invoice
 *   holds (BT-22 and BT-127 in each note at `basic` and `en16931`, or with a subject code at `extended`, BT-25, BT-122, BT-125-1 / BT-125-2 with a BT-125, BT-84 or
 *   BT-84-0 in each credit transfer, BT-73 or BT-74 in a BG-14 ...), or a mandatory group (BG-4, BG-7,
 *   BG-22, BG-23, BG-25). A string of only XML whitespace (space, tab, CR, LF) counts as empty; a
 *   no-break space does not. At `extended` and `extended-ctc-fr` a note (BG-1, or a line note) with neither
 *   its text (BT-22, BT-127) nor its subject code is refused too;
 * - an optional repeatable group of a plain-object invoice is neither absent nor an array (absent
 *   reads as empty);
 * - the invoice holds a value `level` cannot carry (an `EXT-FR-FE-*` field below `extended`, a term
 *   Factur-X BASIC lacks at `basic`), or more buyer or payee identifiers than it carries (BT-46, BT-60);
 * - BT-24 is set to anything but the exact identifier of `level`;
 * - a date is not a valid ISO `YYYY-MM-DD` date;
 * - BT-11-0 is set without BT-11;
 * - at `extended` and `extended-ctc-fr`, a line whose EXT-FR-FE-163 is `DETAIL` or unset lacks BG-29, BT-129, BG-30
 *   or BT-151 (BR-FXEXT-BR-26 / -BR-22 / -CO-04, BR-FREXT-BR-26 / -BR-22 / -CO-04);
 * - an *Amount* has more than two decimals (spec §7.1.5).
 */
export function toCii(invoice: Invoice, options: ToCiiOptions): CrossIndustryInvoiceType {
  const level = options?.level
  if (!isEn16931Level(level))
    throw new Error(`toCii: options.level must be one of ${LEVEL_LIST}`)
  const full = withArrays(invoice)
  for (const [id, term, get] of MANDATORY) {
    const value = get(full)
    if (isBlank(value))
      throw new Error(`toCii: ${id} (${term}) is mandatory and empty`)
  }
  assertHeaderComplete(full, level)
  assertPartiesComplete(full)
  assertPartyIdentifierCounts(full, level)
  assertSettlementComplete(full)
  assertLinesComplete(full, level)
  if (level === 'extended' || level === 'extended-ctc-fr')
    assertDetailLinesComplete(full, CII_DETAIL_LINE_RULES[level])
  assertLevelCarries(full, level, [...HEADER_GATES, ...PARTY_GATES, ...SETTLEMENT_GATES, ...LINE_GATES])
  // CII has the project name only inside the project reference: writing it alone would lose it.
  if (full.projectName !== undefined && full.projectReference === undefined)
    throw new Error('toCii: BT-11-0 (project name) needs BT-11 (project reference)')
  // Exact allow-list (Factur-X matrices, BT-24 usage note): another level's id, Order-X or a CIUS
  // identifier would make the written document claim a profile it was not checked against.
  const specification = full.specificationIdentifier
  if (specification === '')
    return checked(buildCii(new Invoice({ ...full, specificationIdentifier: undefined }), level))
  if (specification !== undefined && specification !== GUIDELINE_IDS[level])
    throw new Error(`toCii: BT-24 (specification identifier) is not the identifier of level "${level}"; clear it to write that identifier, or set ${GUIDELINE_IDS[level]}`)
  return checked(buildCii(full, level))
}
