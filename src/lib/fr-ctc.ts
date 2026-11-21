import type { Buffer } from 'node:buffer'
import type { SchematronConfig, SchematronError, SchematronResult } from './schematron'
import { UBL_LEVELS } from './constants'
import { resolveXml } from './resolve'
import { runSchematron } from './schematron'
import { assertUblLevelMatches, doctypeMessage, getUblLevel, inputHasDoctype, isUblDocument, levelFromGuidelineId } from './xml'

/**
 * French CTC business rules (`BR-FR-Flux2`) for invoices in UN/CEFACT CII D22B (hence Factur-X) and UBL 2.1.
 *
 * Step 3 of the validation sequence of the FNFE-MPE "Schematrons FR CTC" v1.4.0 release (release notes
 * p.9): XSD (step 1) → profile Schematron (step 2) → `BR-FR-Flux2-Schematron-CII` or `-UBL` (step 3). This module
 * runs step 3 only. The vendored transform is the standard ("fatal") variant: every assert is flagged
 * `fatal`, so every finding is an error. The `_WARNING` variant was for the transition window that
 * closed on 2026-08-31 / 2026-09-30 (release notes p.6) and is not shipped.
 *
 * See `xsd/fr-ctc/SCHEMATRON.md` for provenance and regeneration.
 */

export const FR_CTC_SCHEMATRON: SchematronConfig = {
  sef: './xsd/fr-ctc/BR-FR-Flux2-Schematron-CII.sef.json.gz',
  idFromAssert: true,
}

/**
 * UBL variant of the same rules (`BR-FR-Flux2-Schematron-UBL`, standard "fatal" variant). `@id` carries the
 * `BR-FR-*` rule as in CII, except one assert whose `@id` is `BR-FR-MV-BD_BT-3` while its text says
 * `[BR-FR-BD-13/BT-3]` (CG-46): it does not match the rule pattern, so its `id` stays that raw assert id.
 */
export const FR_CTC_UBL_SCHEMATRON: SchematronConfig = {
  sef: './xsd/ubl/fr-ctc/BR-FR-Flux2-Schematron-UBL.sef.json.gz',
  idFromAssert: true,
}

/**
 * Factur-X profiles the FNFE-MPE release selects for the reform: BASIC WL (for the first year only),
 * EN16931 and EXTENDED (release notes p.9, p.11; XP Z12-012 Annex A, BT-24 guideline IDs), plus the
 * plain-CII EXTENDED-CTC-FR profile, to which the same BR-FR transform applies (p.10). The release
 * ships no MINIMUM or BASIC components.
 */
export const FR_CTC_LEVELS: ReadonlySet<string> = new Set(['basicwl', 'en16931', 'extended', 'extended-ctc-fr'])

// The SVRL @id of a BR-FR assert is the rule plus a qualifier: `BR-FR-01_BT-1`, `BR-FR-05_BT-22_PMT`,
// `BR-FR-CO-10_BT-29-2`, `BR-FR-32-LEGALID`, `BR-FR-MV-14-EXT-FR-FE-136`. The rule is the leading
// `BR-FR-[GROUP-]NN` part.
const RULE_RE = /^BR-FR-(?:[A-Z]+-)?\d+/

/**
 * Business rule of a BR-FR assert, from its SVRL @id only. The message is never used: it echoes invoice
 * values (e.g. an invoice number in brackets), which must not be mistaken for a rule id.
 */
function toRule(error: SchematronError): SchematronError {
  const rule = error.assertId?.match(RULE_RE)?.[0]
  return { ...error, id: rule ?? error.assertId }
}

/**
 * Check a Factur-X (CII D22B) or UBL 2.1 invoice against the French CTC business rules `BR-FR-Flux2`
 * (XP Z12-012 v1.4.0, FNFE-MPE validation components v1.4.0.04).
 *
 * This is step 3 of the validation: it does not check the structure (XSD, step 1) nor the profile
 * rules (Factur-X Schematron, step 2). Run `check({ xml, schematron: true, frCtc: true })` for all three.
 *
 * Each finding has `id` set to the business rule (`BR-FR-05`) and `assertId` to the raw assert id
 * (`BR-FR-05_BT-22_PMT`). Messages are in French and may quote invoice values (names, identifiers,
 * amounts): treat them as personal data, don't log them where invoice contents would not be allowed.
 *
 * @throws when the document is neither a CII nor a UBL invoice, when `flavor` contradicts its root, when its
 *   declared profile (or `level`) is not one of `basicwl`, `en16931`, `extended`, `extended-ctc-fr` (CII) or
 *   `en16931`, `extended-ctc-fr` (UBL), or when `level` differs from the declared
 *   profile (`extended` is accepted for an EXTENDED-CTC-FR document).
 */
export async function validateFrCtc(options: {
  xml: string | Buffer
  /**
   * Profile of the invoice: `basicwl`, `en16931`, `extended` or `extended-ctc-fr` for CII; `en16931` or
   * `extended-ctc-fr` for UBL. Defaults to the profile declared in the document (BT-24); when given, it must
   * match it.
   */
  level?: string
  /** `facturx` (CII) or `ubl`. The document root decides which rules run: a flavor that contradicts it throws. */
  flavor?: string
  /** Treat failed `warning`/`information` rules as errors. The vendored rules are all `fatal`, so this has no effect today. */
  warningsAsErrors?: boolean
}): Promise<SchematronResult> {
  if (options.flavor !== undefined && options.flavor !== 'facturx' && options.flavor !== 'ubl')
    assertFrCtcApplicable(options.flavor, options.level ?? 'en16931')
  const profile = await declaredProfile(options.xml, options.flavor, options.level)
  // Reported as an invalid result, as `check()` does: a declared entity would otherwise pass unseen.
  if ('doctype' in profile)
    return { valid: false, errors: [{ message: profile.doctype, severity: 'error' }], warnings: [] }
  const { flavor, declared } = profile

  if (flavor === 'ubl') {
    // BT-24 of a UBL invoice names its level: there is no `extended` alias to keep.
    if (options.level !== undefined)
      assertFrCtcApplicable('ubl', options.level)
    if (options.level && options.level !== declared)
      throw new Error(`French CTC rules (BR-FR): level "${options.level}" does not match the profile declared by the document ("${declared}")`)
  }
  else {
    assertFrCtcApplicable('facturx', options.level ?? 'en16931')
    // `extended` stays accepted for an EXTENDED-CTC-FR document: it was the only way to name it before
    // the profile had its own level (backward compatibility).
    const sameProfile = options.level === declared || (options.level === 'extended' && declared === 'extended-ctc-fr')
    if (options.level && !sameProfile) {
      throw new Error(`French CTC rules (BR-FR): level "${options.level}" does not match the profile declared by the document ("${declared}")`)
    }
    assertFrCtcApplicable('facturx', declared)
  }

  const config = flavor === 'ubl' ? FR_CTC_UBL_SCHEMATRON : FR_CTC_SCHEMATRON
  const result = await runSchematron(config, options.xml, { warningsAsErrors: options.warningsAsErrors })
  return {
    valid: result.valid,
    errors: result.errors.map(toRule),
    warnings: result.warnings.map(toRule),
  }
}

const CII_NS = 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100'
const RAM_NS = 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100'

/**
 * Flavor (from the root element) and profile declared by the document itself. The BR-FR transforms never
 * read either: on an Order-X document they simply find nothing to check and pass, so the document is checked
 * here rather than trusting the caller.
 *
 * The plain-CII `EXTENDED-CTC-FR` profile (`…urn.cpro.gouv.fr:1p0:extended-ctc-fr`) is
 * `extended-ctc-fr`, like its UBL counterpart. BR-FR itself doesn't read the profile.
 */
async function declaredProfile(xml: string | Buffer, requested?: string, explicitLevel?: string): Promise<{ flavor: 'facturx' | 'ubl', declared: string } | { doctype: string }> {
  const doc = await resolveXml(xml)
  try {
    // Before anything reads the document: an entity could hide BT-24 (was CG-73).
    if (inputHasDoctype(xml, doc))
      return { doctype: doctypeMessage(xml, doc) }
    const root = doc.root
    const flavor = isUblDocument(doc)
      ? 'ubl'
      : root.name === 'CrossIndustryInvoice' && root.namespaceUri === CII_NS ? 'facturx' : undefined
    if (!flavor)
      throw new Error(`French CTC rules (BR-FR) apply to Factur-X / CII D22B and UBL 2.1 invoices only, got root element "${root.name}"`)
    if (requested !== undefined && requested !== flavor)
      throw new Error(`French CTC rules (BR-FR): flavor "${requested}" does not match the document root element "${root.name}"`)
    if (flavor === 'ubl') {
      // `en16931` may stand in for a missing or unsupported CustomizationID; `extended-ctc-fr` needs the exact
      // id; a declared level is never overridden (see assertUblLevelMatches).
      if (explicitLevel === 'en16931' || explicitLevel === 'extended-ctc-fr') {
        assertUblLevelMatches(doc, explicitLevel)
        return { flavor, declared: explicitLevel }
      }
      return { flavor, declared: getUblLevel(doc) }
    }
    const id = doc.get('/rsm:CrossIndustryInvoice/rsm:ExchangedDocumentContext/ram:GuidelineSpecifiedDocumentContextParameter/ram:ID', { rsm: CII_NS, ram: RAM_NS })?.content.trim()
    // Parse the ID read above with explicit namespaces: getLevel() resolves `rsm:`/`ram:` through
    // the document's own prefixes and fails on an invoice that binds the CII namespace to another one.
    if (id === undefined)
      throw new Error('No ID found in the document')
    return { flavor, declared: levelFromGuidelineId(id) }
  }
  finally {
    doc.dispose()
  }
}

/**
 * The BR-FR transform does not check the profile itself (it runs on MINIMUM or on Order-X without
 * complaint), so the scope of the reform is enforced here.
 */
export function assertFrCtcApplicable(flavor: string, level: string): void {
  if (flavor === 'ubl') {
    if (!(UBL_LEVELS as readonly string[]).includes(level))
      throw new Error(`French CTC rules (BR-FR) apply to UBL invoices at the EN16931 and EXTENDED-CTC-FR levels only, got level "${level}"`)
    return
  }
  if (flavor !== 'facturx') {
    throw new Error(`French CTC rules (BR-FR) apply to Factur-X / CII D22B and UBL 2.1 invoices only, got flavor "${flavor}"`)
  }
  if (!FR_CTC_LEVELS.has(level)) {
    throw new Error(`French CTC rules (BR-FR) apply to the BASIC WL, EN16931 and EXTENDED profiles only, got level "${level}" (plain-CII EXTENDED-CTC-FR is accepted too)`)
  }
}
