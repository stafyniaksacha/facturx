import type { Buffer } from 'node:buffer'
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import SaxonJS from 'saxon-js'

/**
 * Schematron (business-rule) validation for Factur-X 1.09.
 *
 * The official spec ships ISO-Schematron compiled to XSLT 2.0 (one per profile)
 * that emits SVRL and validates code lists via `document(...codedb.xml)`. We
 * vendor those transforms precompiled to a relocatable Saxon SEF (gzipped) plus
 * the matching codedb, and run them with SaxonJS. XSD validation (see check.ts)
 * only checks structure; Schematron enforces EN16931 BR-* rules and code lists.
 */

export interface SchematronError {
  /** Human readable assertion message, e.g. "[BR-16]-An Invoice shall have ...". */
  message: string
  /**
   * Rule id parsed from a `[ID]` prefix in the message (e.g. "BR-16"). For
   * Schematrons whose config sets `idFromAssert`, falls back to the SVRL `id`
   * attribute. Not every failure is a numbered business rule: structural checks
   * (e.g. "Element 'ram:SellerTradeParty' must occur exactly 1 times") have no id.
   */
  id?: string
  /** Raw SVRL `id` attribute of the assert, when the rule sets one (e.g. "FX-SCH-A-000372"). */
  assertId?: string
  /** The failing XPath test expression. */
  test?: string
  /** Location of the offending node. */
  location?: string
  /** Severity flag from the rule (e.g. "fatal", "warning"). */
  flag?: string
  /**
   * `warning` when the rule is flagged `warning` or `information` (non-blocking by
   * design, e.g. the Factur-X EXTENDED ini/rev rules), `error` otherwise (`fatal`,
   * `error` or no flag: ISO Schematron treats an unflagged failed assert as an error).
   */
  severity: 'error' | 'warning'
}

export interface SchematronResult {
  /**
   * `true` when no rule of severity `error` failed. Warnings don't affect it unless
   * `warningsAsErrors` is set.
   */
  valid: boolean
  /** Failed rules that make the document invalid (includes warnings when `warningsAsErrors`). */
  errors: SchematronError[]
  /** Failed rules of severity `warning`, always reported, whatever `warningsAsErrors` says. */
  warnings: SchematronError[]
}

export interface SchematronConfig {
  /** Path (relative to this module) to the gzipped, relocatable SEF. */
  sef: string
  /** Path (relative to this module) to the code list database, for transforms that load one via document(). */
  codedb?: string
  /** Filename the transform expects when resolving the codedb via document(). */
  codedbName?: string
  /**
   * Use the SVRL `id` attribute as the rule id when the message has no `[ID]`
   * prefix. Set it for Schematrons whose @id is the business rule (FNFE BR-FR-*),
   * not for Factur-X, whose @id is an internal number (FX-SCH-A-…).
   */
  idFromAssert?: boolean
}

const dir = (level: string): string => `./xsd/facturx/${level}`

// Map (not a plain object) so that level lookups can't reach inherited keys
// like "__proto__"/"constructor" and bypass the availability guard.
export const FACTURX_SCHEMATRON: Map<string, SchematronConfig> = new Map([
  ['minimum', { sef: `${dir('minimum')}/FACTUR-X_MINIMUM.sef.json.gz`, codedb: `${dir('minimum')}/FACTUR-X_MINIMUM_codedb.xml`, codedbName: 'FACTUR-X_MINIMUM_codedb.xml' }],
  ['basicwl', { sef: `${dir('basicwl')}/FACTUR-X_BASIC-WL.sef.json.gz`, codedb: `${dir('basicwl')}/FACTUR-X_BASIC-WL_codedb.xml`, codedbName: 'FACTUR-X_BASIC-WL_codedb.xml' }],
  ['basic', { sef: `${dir('basic')}/FACTUR-X_BASIC.sef.json.gz`, codedb: `${dir('basic')}/FACTUR-X_BASIC_codedb.xml`, codedbName: 'FACTUR-X_BASIC_codedb.xml' }],
  ['en16931', { sef: `${dir('en16931')}/FACTUR-X_EN16931.sef.json.gz`, codedb: `${dir('en16931')}/FACTUR-X_EN16931_codedb.xml`, codedbName: 'FACTUR-X_EN16931_codedb.xml' }],
  ['extended', { sef: `${dir('extended')}/FACTUR-X_EXTENDED.sef.json.gz`, codedb: `${dir('extended')}/FACTUR-X_EXTENDED_codedb.xml`, codedbName: 'FACTUR-X_EXTENDED_codedb.xml' }],
])

// Per-process cache of prepared stylesheet locations (decompressed SEF + codedb), keyed by SEF path.
const _prepared = new Map<string, string>()

/**
 * Decompress the SEF and place it next to its codedb (if any) in a temp directory
 * so that the transform's relative `document()` call resolves. Cached per process.
 */
function prepareStylesheet(config: SchematronConfig): string {
  const cached = _prepared.get(config.sef)
  if (cached) {
    return cached
  }

  const workDir = mkdtempSync(join(tmpdir(), 'facturx-sch-'))
  const sefPath = join(workDir, 'schematron.sef.json')
  writeFileSync(sefPath, gunzipSync(readFileSync(resolve(import.meta.dirname, config.sef))))
  if (config.codedb && config.codedbName) {
    copyFileSync(resolve(import.meta.dirname, config.codedb), join(workDir, config.codedbName))
  }

  _prepared.set(config.sef, sefPath)
  return sefPath
}

/**
 * Run a vendored, precompiled Schematron (SEF) against an XML document and sort
 * the failed asserts by severity. Shared by every Schematron this package ships.
 */
export async function runSchematron(
  config: SchematronConfig,
  xml: string | Buffer,
  options: { warningsAsErrors?: boolean } = {},
): Promise<SchematronResult> {
  const sefPath = prepareStylesheet(config)
  const sourceText = typeof xml === 'string' ? xml : xml.toString()

  const result = await SaxonJS.transform({
    stylesheetFileName: sefPath,
    sourceText,
    destination: 'serialized',
  }, 'async')

  const svrl = (result as { principalResult?: string }).principalResult ?? ''
  const failed = parseSvrl(svrl, config.idFromAssert ?? false)
  const warnings = failed.filter(e => e.severity === 'warning')
  const errors = options.warningsAsErrors ? failed : failed.filter(e => e.severity === 'error')

  return { valid: errors.length === 0, errors, warnings }
}

/**
 * Collect both failed asserts and fired reports: the Factur-X Schematrons express
 * part of their profile restrictions as `report` (e.g. "Attribute @schemeID marked
 * as not used in the given context"), and a fired report is a finding just like a
 * failed assert. Both are classified by their `flag` the same way.
 */
function parseSvrl(svrl: string, idFromAssert: boolean): SchematronError[] {
  const errors: SchematronError[] = []
  const assertRe = /<svrl:(failed-assert|successful-report)\b([^>]*)>([\s\S]*?)<\/svrl:\1>/g
  const textRe = /<svrl:text>([\s\S]*?)<\/svrl:text>/
  const getAttr = (attrs: string, name: string): string | undefined => {
    const m = attrs.match(new RegExp(`${name}="([^"]*)"`))
    return m ? decodeEntities(m[1]) : undefined
  }

  let match: RegExpExecArray | null
  // eslint-disable-next-line no-cond-assign
  while ((match = assertRe.exec(svrl)) !== null) {
    const attrs = match[2]
    const body = match[3]
    const message = decodeEntities((body.match(textRe)?.[1] ?? '').replace(/\s+/g, ' ').trim())
    // Factur-X puts the business rule in a "[ID]" message prefix (which may carry a
    // lowercase suffix such as "BR-FXEXT-Z-08rev") and an internal assert number in
    // @id; most FNFE rules only identify themselves through @id.
    const assertId = getAttr(attrs, 'id')
    const id = message.match(/\[([A-Z]+(?:-[\w.]+)+)\]/)?.[1] ?? (idFromAssert ? assertId : undefined)
    const flag = getAttr(attrs, 'flag')
    const severity = flag === 'warning' || flag === 'information' ? 'warning' : 'error'
    errors.push({
      message,
      id,
      assertId,
      test: getAttr(attrs, 'test'),
      location: getAttr(attrs, 'location'),
      flag,
      severity,
    })
  }
  return errors
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, '\'')
    .replace(/&amp;/g, '&')
}

/**
 * Run Schematron business-rule validation against a Factur-X XML document.
 * Only the `facturx` flavor is supported (the spec ships no Order-X Schematron here).
 *
 * Rules flagged `warning`/`information` are returned in `warnings` and don't make the
 * document invalid, unless `warningsAsErrors` is set (then they are also in `errors`).
 */
export async function validateSchematron(options: {
  xml: string | Buffer
  flavor?: string
  level: string
  /** Treat failed `warning`/`information` rules as errors (like a compiler's -Werror). Defaults to `false`. */
  warningsAsErrors?: boolean
}): Promise<SchematronResult> {
  if (options.flavor && options.flavor !== 'facturx') {
    throw new Error(`Schematron validation is only available for the "facturx" flavor, got "${options.flavor}"`)
  }

  const config = FACTURX_SCHEMATRON.get(options.level)
  if (!config) {
    throw new Error(`No Factur-X Schematron available for level: "${options.level}"`)
  }

  return runSchematron(config, options.xml, { warningsAsErrors: options.warningsAsErrors })
}
