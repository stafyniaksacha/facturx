/**
 * The `dropped` contract of `fromCii()`, computed by difference: map CII to the model, map the model
 * back, and report every CII value that did not survive, whatever the mapping misses. Repeated
 * elements are paired by exact equality first (any position), then by position (see `walkArray`). A
 * NaN leaf is always reported: it equals nothing, so it can't be represented as kept. Relative to what
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

/** Marks an element that never pairs by value (it holds a NaN leaf, which `walk` always reports). */
const UNMATCHABLE = Symbol('unmatchable')

/**
 * A canonical serialization of `value` for exact-equality pairing: object keys sorted, every key and
 * leaf JSON-quoted (so `1` and `'1'` differ), prototypes ignored, and what `walk` treats as no data
 * left out (`undefined`, `null`, empty arrays, nodes without a leaf), so parser output (`[]`) and
 * written output (`undefined`) of the same content compare equal. Array positions are kept. A NaN
 * leaf makes the whole value `UNMATCHABLE`. Linear in the size of `value`.
 */
function canonical(value: unknown): string | undefined | typeof UNMATCHABLE {
  if (value === undefined || value === null)
    return undefined
  if (Array.isArray(value)) {
    const items: string[] = []
    for (const item of value) {
      const key = canonical(item)
      if (key === UNMATCHABLE)
        return UNMATCHABLE
      items.push(key ?? 'null')
    }
    return items.every(i => i === 'null') ? undefined : `[${items.join(',')}]`
  }
  if (isNode(value)) {
    const fields: string[] = []
    for (const key of Object.keys(value).sort()) {
      const child = canonical(value[key])
      if (child === UNMATCHABLE)
        return UNMATCHABLE
      if (child !== undefined)
        fields.push(`${JSON.stringify(key)}:${child}`)
    }
    return fields.length ? `{${fields.join(',')}}` : undefined
  }
  if (typeof value === 'number')
    // `String` keeps ±Infinity apart (JSON would write both as `null`); -0 and 0 are one key, as for `!==`.
    return Number.isNaN(value) ? UNMATCHABLE : String(value)
  return typeof value === 'string' ? JSON.stringify(value) : `${typeof value}:${String(value)}`
}

// Writers reorder repeated groups (VA before FC registrations, allowances before charges, BT-110 before
// BT-111), so an element of `a` is paired with an element of `b` in three passes: (1) the element at
// the same position when the two are exactly equal (`canonical`); (2) any other not yet paired element
// of `b` exactly equal to it, looked up by its canonical key (duplicates consume distinct elements);
// (3) the elements of `a` left over are compared by position with the elements of `b` left over, or
// all their leaves reported when none remains. Exact equality, not "keeps all values": a near-duplicate
// is never taken for the element it resembles. Linear in the size of both arrays (an earlier subset
// search was quadratic, a resource exhaustion on untrusted input). Reported paths keep the position
// of the element in `a`.
function walkArray(a: unknown[], b: unknown[], path: string, owner: string | undefined, out: string[]): void {
  pairElements(a.map(canonical), b.map(canonical)).forEach((pair, i) => {
    if (pair !== true)
      walk(a[i], pair === undefined ? undefined : b[pair], `${path}[${i + 1}]`, owner, out)
  })
}

/**
 * The pairing of `walkArray`, shared with the UBL difference (`parsers/ubl-dropped.ts`). A key is a canonical
 * string (pairs by exact equality), `undefined` (no data: nothing to report) or a symbol (never pairs). For
 * each element of `a`: `true` when it is paired by equality or has no data, else the index in `b` of the
 * leftover element to compare it with by position, or `undefined` when none remains.
 */
export function pairElements(keysA: readonly (string | undefined | symbol)[], keysB: readonly (string | undefined | symbol)[]): (true | number | undefined)[] {
  const paired = Array.from<boolean>({ length: keysA.length }).fill(false)
  const used = Array.from<boolean>({ length: keysB.length }).fill(false)
  // An element of `a` with no data has no leaf to report.
  keysA.forEach((key, i) => {
    if (key === undefined) {
      paired[i] = true
    }
    else if (typeof key === 'string' && i < keysB.length && keysB[i] === key) {
      paired[i] = true
      used[i] = true
    }
  })
  // Unused elements of `b` by key, in document order, with the next one to hand out (no `shift()`, which
  // would make many duplicates quadratic again).
  const byKey = new Map<string, { indices: number[], next: number }>()
  keysB.forEach((key, j) => {
    if (!used[j] && typeof key === 'string') {
      const queue = byKey.get(key)
      if (queue)
        queue.indices.push(j)
      else
        byKey.set(key, { indices: [j], next: 0 })
    }
  })
  keysA.forEach((key, i) => {
    if (paired[i] || typeof key !== 'string')
      return
    const queue = byKey.get(key)
    const j = queue?.indices[queue.next]
    if (queue && j !== undefined) {
      queue.next++
      paired[i] = true
      used[j] = true
    }
  })
  const rest = used.flatMap((u, j) => (u ? [] : [j]))
  let k = 0
  return paired.map(p => (p ? true : rest[k++]))
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
 * only in `b` are not reported. Array elements are paired by exact equality first (any position), then
 * the leftovers by position; paths carry the position in `a`. A NaN leaf is always reported.
 */
export function diffPaths(a: CrossIndustryInvoiceType, b: CrossIndustryInvoiceType): string[] {
  const out: string[] = []
  walk(a, b, ROOT, undefined, out)
  return out
}
