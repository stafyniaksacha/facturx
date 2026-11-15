/**
 * The `dropped` contract of `fromCii()`, computed by difference: map CII to the model, map the model
 * back, and report every CII value that did not survive. Complete by construction, whatever the
 * mapping misses, relative to what `xmlToInvoice()` reads: an XML element the CII parser does not
 * read never reaches the CII model, so it cannot be compared here (the parser round-trip tests cover
 * that side).
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

function walk(a: unknown, b: unknown, path: string, owner: string | undefined, out: string[]): void {
  if (a === undefined || a === null)
    return
  if (Array.isArray(a)) {
    a.forEach((item, i) => walk(item, Array.isArray(b) ? b[i] : undefined, `${path}[${i + 1}]`, owner, out))
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
 * only in `b` are not reported. Arrays are compared by position.
 */
export function diffPaths(a: CrossIndustryInvoiceType, b: CrossIndustryInvoiceType): string[] {
  const out: string[] = []
  walk(a, b, ROOT, undefined, out)
  return out
}
