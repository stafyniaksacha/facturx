/**
 * The `dropped` contract of `fromCii()`, computed by difference: map CII to the model, map the model
 * back, and report every CII value that did not survive, whatever the mapping misses. Repeated
 * elements are matched by value first, then by position (see `walkArray`). Relative to what
 * `xmlToInvoice()` reads: an XML element the CII parser does not read never reaches the CII model, so
 * it cannot be compared here (the parser round-trip tests cover that side).
 */

import type { CrossIndustryInvoiceType } from '../../models/facturx/crossIndustryInvoice'

const ROOT = '/rsm:CrossIndustryInvoice'

/** Properties of the CII data types written as XML attributes. */
const ATTRIBUTES = new Set(['currencyID', 'filename', 'format', 'listID', 'listVersionID', 'mimeCode', 'schemeID', 'unitCode'])

/** Root properties: `rsm:` children. */
const RSM = new Set(['exchangedDocumentContext', 'exchangedDocument', 'supplyChainTradeTransaction'])

/** Properties whose element name is not their PascalCase. */
const ELEMENT_NAMES: Record<string, string> = {
  id: 'ID',
  uriID: 'URIID',
  ibanID: 'IBANID',
  bicID: 'BICID',
  uriUniversalCommunication: 'URIUniversalCommunication',
  // The second line TaxTotalAmount (BT-X-590, EXT-FR-FE-182; see CONFORMANCE.md).
  taxTotalAmountInAccountingCurrency: 'TaxTotalAmount[2]',
}

type Node = Record<string, unknown>

function isNode(value: unknown): value is Node {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// `udt:DateTimeString` everywhere, except under the `qdt:FormattedDateTimeType` properties.
function dateTimeElement(owner: string | undefined): string {
  return owner?.startsWith('formatted') ? 'qdt:DateTimeString' : 'udt:DateTimeString'
}

function childPath(path: string, key: string, node: Node, owner: string | undefined): string {
  switch (key) {
    case 'value': // the text of the element itself
      return path
    case 'indicator':
      return `${path}/udt:Indicator`
    case 'dateString':
      return `${path}/udt:DateString`
    case 'dateTimeString':
      return `${path}/${dateTimeElement(owner)}`
    case 'format':
      return `${path}/${'dateString' in node ? 'udt:DateString' : dateTimeElement(owner)}/@format`
  }
  if (ATTRIBUTES.has(key))
    return `${path}/@${key}`
  const name = Object.hasOwn(ELEMENT_NAMES, key) ? ELEMENT_NAMES[key] : key.charAt(0).toUpperCase() + key.slice(1)
  return `${path}/${path === ROOT && RSM.has(key) ? 'rsm' : 'ram'}:${name}`
}

/** True when no leaf of `a` is lost in `b`. */
function kept(a: unknown, b: unknown, owner: string | undefined): boolean {
  const lost: string[] = []
  walk(a, b, '', owner, lost)
  return lost.length === 0
}

// Writers reorder repeated groups (VA before FC registrations, allowances before charges, BT-110 before
// BT-111), so an element of `a` is first paired with any not yet paired element of `b` that keeps all
// its values (a multiset match, the same position tried first); the elements left over are then
// compared by position with the elements of `b` left over, or all their leaves reported when none
// remains. Reported paths keep the position of the element in `a`.
function walkArray(a: unknown[], b: unknown[], path: string, owner: string | undefined, out: string[]): void {
  const used = new Set<number>()
  const unpaired: number[] = []
  a.forEach((item, i) => {
    if (item === undefined || item === null)
      return
    const candidates = [i, ...b.keys()].filter((j, k, all) => j < b.length && !used.has(j) && all.indexOf(j) === k)
    const match = candidates.find(j => kept(item, b[j], owner))
    if (match === undefined)
      unpaired.push(i)
    else
      used.add(match)
  })
  const rest = [...b.keys()].filter(j => !used.has(j))
  unpaired.forEach((i, k) => walk(a[i], rest[k] === undefined ? undefined : b[rest[k]!], `${path}[${i + 1}]`, owner, out))
}

function walk(a: unknown, b: unknown, path: string, owner: string | undefined, out: string[]): void {
  if (a === undefined || a === null)
    return
  if (Array.isArray(a)) {
    walkArray(a, Array.isArray(b) ? b : [], path, owner, out)
    return
  }
  if (isNode(a)) {
    for (const [key, value] of Object.entries(a))
      walk(value, isNode(b) ? b[key] : undefined, childPath(path, key, a, owner), key, out)
    return
  }
  if (a !== b)
    out.push(path)
}

/**
 * XPath-like paths (`/rsm:CrossIndustryInvoice/…/ram:X[n]/@attr`, positions 1-based, never value
 * predicates) of every leaf value present in `a` and absent from or different in `b`. Values present
 * only in `b` are not reported. Array elements are matched by value first (any position), then the
 * leftovers by position; paths carry the position in `a`.
 */
export function diffPaths(a: CrossIndustryInvoiceType, b: CrossIndustryInvoiceType): string[] {
  const out: string[] = []
  walk(a, b, ROOT, undefined, out)
  return out
}
