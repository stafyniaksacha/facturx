/**
 * The `dropped` contract of `ublToInvoice()`, computed by difference like `fromCii()`'s (`mapping/cii/dropped.ts`):
 * read UBL into the model, write the model back (`buildUbl`, lenient), and report every value of the source that
 * has no equal counterpart in what was written. Compared on the XML trees, since UBL has no intermediate model.
 *
 * - A value is an attribute value or the text of an element without child elements; empty ones are not values.
 *   Attributes of the XML Schema instance namespace (`xsi:schemaLocation` ...) are processing hints, not values.
 * - Repeated siblings of one name are paired by exact equality first (any position), then by position, with the
 *   pairing of the CII difference (`pairElements`), so a writer that reorders them reports nothing.
 * - The elements the writer formats as numbers (`cbc:*Amount`, the quantities, `cbc:Percent`,
 *   `cbc:MultiplierFactorNumeric`, `cbc:CalculationRate`) compare as canonical `xs:decimal` strings (`20.0000`
 *   equals `20`; a digit a JS number cannot hold is a difference); `cbc:ChargeIndicator` as `xs:boolean`.
 *   Everything else compares as exact text.
 * - Paths are XPath-like with the UBL prefixes whatever the source uses: `/Invoice/cac:X/cbc:Y`, `/@attr`. A
 *   step carries a 1-based position (`[n]`) only when the source repeats that name under that parent (the CII
 *   difference indexes by model repeatability instead). Positions only, never values.
 *
 * Linear in the size of both documents: each node's canonical key is computed once.
 */

import type { XmlDocument } from 'libxml2-wasm'
import { XmlElement } from 'libxml2-wasm'
import { pairElements } from '../mapping/cii/dropped'

const PREFIXES: Record<string, string> = {
  'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2': 'cac',
  'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2': 'cbc',
  'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2': 'ext',
}
const XSI = 'http://www.w3.org/2001/XMLSchema-instance'

/** Decimal elements that are not `*Amount` (all UBL `cbc:*Amount` are `AmountType`). */
const DECIMALS = new Set(['cbc:InvoicedQuantity', 'cbc:CreditedQuantity', 'cbc:BaseQuantity', 'cbc:PackQuantity', 'cbc:ValueQuantity', 'cbc:Percent', 'cbc:MultiplierFactorNumeric', 'cbc:CalculationRate'])
const BOOLEANS = new Set(['cbc:ChargeIndicator'])

interface Node {
  name: string
  attrs: Map<string, string>
  /** The text of an element without child elements. */
  text?: string
  children: Node[]
  key?: string | null
}

function qualified(local: string, namespaceUri: string, prefix: string): string {
  const known = PREFIXES[namespaceUri]
  if (known)
    return `${known}:${local}`
  return prefix ? `${prefix}:${local}` : local
}

/** `xs:decimal` canonical form, or `undefined` for a text that is not one. */
function canonicalDecimal(text: string): string | undefined {
  const match = /^([+-])?(\d*)(?:\.(\d*))?$/.exec(text.trim())
  if (!match || (match[2] === '' && (match[3] ?? '') === ''))
    return undefined
  const whole = match[2].replace(/^0+/, '') || '0'
  const fraction = (match[3] ?? '').replace(/0+$/, '')
  const sign = match[1] === '-' && (whole !== '0' || fraction !== '') ? '-' : ''
  return `${sign}${whole}${fraction ? `.${fraction}` : ''}`
}

function normalized(name: string, text: string): string {
  if (name.endsWith('Amount') || DECIMALS.has(name))
    return canonicalDecimal(text) ?? text
  if (BOOLEANS.has(name)) {
    const value = text.trim()
    return value === '1' ? 'true' : value === '0' ? 'false' : value
  }
  return text
}

function tree(element: XmlElement, name: string): Node {
  const attrs = new Map<string, string>()
  for (const attr of element.attrs) {
    if (attr.namespaceUri === XSI)
      continue
    attrs.set(attr.namespaceUri ? qualified(attr.name, attr.namespaceUri, attr.prefix) : attr.name, attr.value)
  }
  const children: Node[] = []
  for (let child = element.firstChild; child; child = child.next) {
    if (child instanceof XmlElement)
      children.push(tree(child, qualified(child.name, child.namespaceUri, child.prefix)))
  }
  return { name, attrs, text: children.length ? undefined : normalized(name, element.content), children }
}

function groups(children: Node[]): Map<string, Node[]> {
  const byName = new Map<string, Node[]>()
  for (const child of children) {
    const group = byName.get(child.name)
    if (group)
      group.push(child)
    else
      byName.set(child.name, [child])
  }
  return byName
}

/** The exact-equality key of a node, `undefined` when it holds no value. Memoised on the node. */
function key(node: Node): string | undefined {
  if (node.key !== undefined)
    return node.key ?? undefined
  const parts: string[] = []
  for (const name of [...node.attrs.keys()].sort()) {
    const value = node.attrs.get(name)!
    if (value !== '')
      parts.push(`@${JSON.stringify(name)}:${JSON.stringify(value)}`)
  }
  if (node.text)
    parts.push(`#${JSON.stringify(node.text)}`)
  for (const [name, group] of [...groups(node.children)].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const keys = group.map(child => key(child) ?? 'null')
    if (keys.some(k => k !== 'null'))
      parts.push(`${JSON.stringify(name)}:[${keys.join(',')}]`)
  }
  const result = parts.length ? `{${parts.join(',')}}` : undefined
  node.key = result ?? null
  return result
}

function walk(a: Node, b: Node | undefined, path: string, out: string[]): void {
  for (const [name, value] of a.attrs) {
    if (value !== '' && b?.attrs.get(name) !== value)
      out.push(`${path}/@${name}`)
  }
  if (a.text && b?.text !== a.text)
    out.push(path)
  const groupsB = b ? groups(b.children) : new Map<string, Node[]>()
  for (const [name, group] of groups(a.children)) {
    const others = groupsB.get(name) ?? []
    const indexed = group.length > 1
    pairElements(group.map(key), others.map(key)).forEach((pair, i) => {
      if (pair !== true)
        walk(group[i], pair === undefined ? undefined : others[pair], `${path}/${name}${indexed ? `[${i + 1}]` : ''}`, out)
    })
  }
}

/**
 * XPath-like paths of every value of `source` with no equal counterpart in `written` (see the module comment).
 * Values only in `written` are not reported.
 */
export function ublDiffPaths(source: XmlDocument, written: XmlDocument): string[] {
  const out: string[] = []
  const a = source.root
  walk(tree(a, a.name), tree(written.root, written.root.name), `/${a.name}`, out)
  return out
}
