import type { XmlDocument } from 'libxml2-wasm'
import { Buffer } from 'node:buffer'
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import SaxonJS from 'saxon-js'
import { EXTENDED_CTC_FR_GUIDELINE_ID } from './constants'
import { resolveXml } from './resolve'
import { assertUblLevelMatches, declaresExtendedCtcFr, isUblDocument } from './xml'

/**
 * Schematron (business-rule) validation for Factur-X (1.09 FINAL for MINIMUM and
 * BASIC, 1.09.2.fixFR04 (FNFE-MPE) for BASIC WL, EN16931 and EXTENDED, CG-16) and for UBL 2.1
 * invoices (EN16931 and EXTENDED-CTC-FR, from the FNFE-MPE release).
 * `runSchematron` is shared with the French CTC rules (fr-ctc.ts).
 *
 * The spec ships ISO-Schematron compiled to XSLT 2.0 (one per profile)
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
   * attribute; for those that set `idSource: 'assert'` (the UBL profile Schematrons), the SVRL
   * `id` attribute comes first, since their message prefix is not always the assert's own id (CG-46). Not every failure is a numbered business rule: structural checks
   * (e.g. "Element 'ram:SellerTradeParty' must occur exactly 1 times") have no id.
   */
  id?: string
  /**
   * Raw SVRL `id` attribute of the assert, when the rule sets one: an internal
   * number for Factur-X structural checks (e.g. "FX-SCH-A-000372"), sometimes the
   * rule itself in 1.09.2 (e.g. "BR-CO-18"), the exact assertion for BR-FR
   * (e.g. "BR-FR-05_BT-22_PMT").
   */
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
   * prefix. Set it for Schematrons whose @id always names the business rule (FNFE
   * BR-FR-*), not for Factur-X: there @id is an internal number (FX-SCH-A-…) for
   * structural checks, and only 1.09.2 business rules, which also carry the
   * `[ID]` message prefix, use the rule id.
   */
  idFromAssert?: boolean
  /**
   * Which of the message `[ID]` prefix and the SVRL `id` attribute names the rule when both exist.
   * Defaults to `'message'`. `'assert'` prefers `id`, falling back to the prefix when the assert has
   * none; the message text is left intact. The UBL profile Schematrons use it: in
   * EXTENDED-CTC-FR-UBL 8 asserts carry a prefix that differs from their `@id` (CG-46).
   */
  idSource?: 'message' | 'assert'
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
  // FNFE-MPE's dedicated EXTENDED-CTC-FR Schematron for plain CII (release notes p.9, step 2). It
  // loads no code list database. Rule ids are in a `[ID]` message prefix, as in Factur-X (CG-18, validation part).
  ['extended-ctc-fr', { sef: `${dir('extended-ctc-fr')}/EXTENDED-CTC-FR-CII.sef.json.gz` }],
])

const ublDir = (level: string): string => `./xsd/ubl/${level}`

/**
 * Profile Schematrons for UBL 2.1 (FNFE-MPE release notes p.9, step 2): `en16931` runs the
 * EN16931-UBL-validation transform, `extended-ctc-fr` the EXTENDED-CTC-FR-UBL one. Neither loads a
 * code list database. The rule id is the assert `@id` (`idSource: 'assert'`): the `[ID]` message
 * prefix differs from it on 8 EXTENDED-CTC-FR-UBL asserts (CG-46), e.g. `@id` BR-FREXT-26 with a
 * `[BR-26]` prefix.
 */
export const UBL_SCHEMATRON: Map<string, SchematronConfig> = new Map([
  ['en16931', { sef: `${ublDir('en16931')}/EN16931-UBL-validation.sef.json.gz`, idSource: 'assert' }],
  ['extended-ctc-fr', { sef: `${ublDir('extended-ctc-fr')}/EXTENDED-CTC-FR-UBL.sef.json.gz`, idSource: 'assert' }],
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
  const failed = parseSvrl(svrl, config.idFromAssert ?? false, config.idSource ?? 'message')
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
function parseSvrl(svrl: string, idFromAssert: boolean, idSource: 'message' | 'assert'): SchematronError[] {
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
    const prefix = message.match(/\[([A-Z]+(?:-[\w.]+)+)\]/)?.[1]
    const id = idSource === 'assert' ? (assertId ?? prefix) : (prefix ?? (idFromAssert ? assertId : undefined))
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
 * Run Schematron business-rule validation against a Factur-X (CII) or UBL 2.1 XML document.
 * The `facturx` and `ubl` flavors are supported (the spec ships no Order-X Schematron here).
 * Without `flavor`, it is read from the root element; a `flavor` that contradicts the root throws:
 * one syntax's rules are never run on the other.
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
  if (options.flavor !== undefined && options.flavor !== 'facturx' && options.flavor !== 'ubl') {
    throw new Error(`Schematron validation is only available for the "facturx" and "ubl" flavors, got "${options.flavor}"`)
  }

  // Read once, and copy a Buffer: the precheck awaits, and a caller replacing `options.xml` or
  // changing the Buffer in place meanwhile must not get the precheck on one document and the
  // transform on another. Strings are immutable.
  const xml = typeof options.xml === 'string' ? options.xml : Buffer.from(options.xml)
  // One parse serves the flavor, the level and the profile prechecks, and is disposed before the
  // transform runs (which parses the text itself).
  const doc = await resolveXml(xml)
  let config: SchematronConfig | undefined
  try {
    const rootIsUbl = isUblDocument(doc)
    if (options.flavor === 'facturx' && rootIsUbl)
      throw new Error('The XML root element is a UBL Invoice/CreditNote, which does not match the "facturx" flavor: the Factur-X Schematron is for CII')
    if (options.flavor === 'ubl' && !rootIsUbl)
      throw new Error('The XML root element does not match the "ubl" flavor')
    const flavor = rootIsUbl ? 'ubl' : 'facturx'

    config = (flavor === 'ubl' ? UBL_SCHEMATRON : FACTURX_SCHEMATRON).get(options.level)
    if (!config) {
      throw new Error(`No ${flavor === 'ubl' ? 'UBL' : 'Factur-X'} Schematron available for level: "${options.level}"`)
    }

    if (flavor === 'ubl') {
      // The two UBL transforms are picked by level, but the level is only a CustomizationID (BT-24).
      // See assertUblLevelMatches for what an explicit level may and may not override.
      assertUblLevelMatches(doc, options.level)
    }
    else if (options.level === 'extended-ctc-fr') {
      const finding = extendedCtcFrPrecheck(doc)
      if (finding)
        return { valid: false, errors: [finding], warnings: [] }
    }
  }
  finally {
    doc.dispose()
  }

  return runSchematron(config!, xml, { warningsAsErrors: options.warningsAsErrors })
}

/**
 * The dedicated EXTENDED-CTC-FR Schematron neither checks the BT-24 value (only BR-01, non-empty)
 * nor survives a repeated BT-24 (`normalize-space()` on a sequence aborts with XPTY0004 and quotes
 * the values). So, before running it: throw unless BT-24 is the exact Annex A ID, and report a
 * repeated container or a repeated ID as the CII-SR-009 / CII-SR-010 finding the Schematron would
 * give (each count must be 1).
 */
function extendedCtcFrPrecheck(doc: XmlDocument): SchematronError | undefined {
  const count = doc.find(`/*[local-name()='CrossIndustryInvoice']/*[local-name()='ExchangedDocumentContext']/*[local-name()='GuidelineSpecifiedDocumentContextParameter']`).length
  if (count > 1) {
    return {
      message: `[CII-SR-009] - GuidelineSpecifiedDocumentContextParameter must exist exactly once (found ${count})`,
      id: 'CII-SR-009',
      severity: 'error',
    }
  }
  const ids = doc.find(`/*[local-name()='CrossIndustryInvoice']/*[local-name()='ExchangedDocumentContext']/*[local-name()='GuidelineSpecifiedDocumentContextParameter']/*[local-name()='ID']`).length
  if (ids > 1) {
    return {
      message: `[CII-SR-010] - ID must exist exactly once (found ${ids})`,
      id: 'CII-SR-010',
      severity: 'error',
    }
  }
  if (!declaresExtendedCtcFr(doc))
    throw new Error(`level "extended-ctc-fr" does not match the document: its guideline ID (BT-24) must be ${EXTENDED_CTC_FR_GUIDELINE_ID}`)
  return undefined
}
