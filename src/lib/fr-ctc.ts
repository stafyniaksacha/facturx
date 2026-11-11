import type { Buffer } from 'node:buffer'
import type { SchematronConfig, SchematronError, SchematronResult } from './schematron'
import { resolveXml } from './resolve'
import { runSchematron } from './schematron'
import { getLevel } from './xml'

/**
 * French CTC business rules (`BR-FR-Flux2`) for invoices in UN/CEFACT CII D22B, hence for Factur-X.
 *
 * Step 3 of the validation sequence of the FNFE-MPE "Schematrons FR CTC" v1.4.0 release (release notes
 * p.9): XSD (step 1) → profile Schematron (step 2) → `BR-FR-Flux2-Schematron-CII` (step 3). This module
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
 * Factur-X profiles the FNFE-MPE release selects for the reform: BASIC WL (for the first year only),
 * EN16931 and EXTENDED (release notes p.9, p.11; XP Z12-012 Annex A, BT-24 guideline IDs). The release
 * ships no MINIMUM or BASIC components.
 */
export const FR_CTC_LEVELS: ReadonlySet<string> = new Set(['basicwl', 'en16931', 'extended'])

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
 * Check a Factur-X (CII D22B) invoice against the French CTC business rules `BR-FR-Flux2`
 * (XP Z12-012 v1.4.0, FNFE-MPE validation components v1.4.0.04).
 *
 * This is step 3 of the validation: it does not check the structure (XSD, step 1) nor the profile
 * rules (Factur-X Schematron, step 2). Run `check({ xml, schematron: true, frCtc: true })` for all three.
 *
 * Each finding has `id` set to the business rule (`BR-FR-05`) and `assertId` to the raw assert id
 * (`BR-FR-05_BT-22_PMT`). Messages are in French and may quote invoice values (names, identifiers,
 * amounts): treat them as personal data, don't log them where invoice contents would not be allowed.
 *
 * @throws when the document is not a CII invoice, when its declared profile (or `level`) is not one of
 *   `basicwl`, `en16931`, `extended`, or when `level` differs from the declared profile.
 */
export async function validateFrCtc(options: {
  xml: string | Buffer
  /**
   * Profile of the invoice: `basicwl`, `en16931` or `extended`. Defaults to the profile declared in the
   * document (BT-24); when given, it must match it.
   */
  level?: string
  flavor?: string
  /** Treat failed `warning`/`information` rules as errors. The vendored rules are all `fatal`, so this has no effect today. */
  warningsAsErrors?: boolean
}): Promise<SchematronResult> {
  assertFrCtcApplicable(options.flavor ?? 'facturx', options.level ?? 'en16931')
  const declared = await declaredLevel(options.xml)
  if (options.level && options.level !== declared) {
    throw new Error(`French CTC rules (BR-FR): level "${options.level}" does not match the profile declared by the document ("${declared}")`)
  }
  assertFrCtcApplicable('facturx', declared)

  const result = await runSchematron(FR_CTC_SCHEMATRON, options.xml, { warningsAsErrors: options.warningsAsErrors })
  return {
    valid: result.valid,
    errors: result.errors.map(toRule),
    warnings: result.warnings.map(toRule),
  }
}

const CII_NS = 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100'
const RAM_NS = 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100'

/**
 * Profile declared by the document itself. The BR-FR transform never reads it (nor the root element):
 * on an Order-X or UBL document it simply finds nothing to check and passes, so the document is checked
 * here rather than trusting the caller.
 *
 * The plain-CII `EXTENDED-CTC-FR` profile (`…urn.cpro.gouv.fr:1p0:extended-ctc-fr`) maps to `extended`:
 * the Factur-X EXTENDED components can validate it (release notes p.9).
 */
async function declaredLevel(xml: string | Buffer): Promise<string> {
  const doc = await resolveXml(xml)
  try {
    const root = doc.root
    if (root.name !== 'CrossIndustryInvoice' || root.namespaceUri !== CII_NS) {
      throw new Error(`French CTC rules (BR-FR) apply to Factur-X / CII D22B invoices only, got root element "${root.name}"`)
    }
    const id = doc.get('/rsm:CrossIndustryInvoice/rsm:ExchangedDocumentContext/ram:GuidelineSpecifiedDocumentContextParameter/ram:ID', { rsm: CII_NS, ram: RAM_NS })?.content.trim()
    if (id?.endsWith(':extended-ctc-fr'))
      return 'extended'
    return getLevel(doc)
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
  if (flavor !== 'facturx') {
    throw new Error(`French CTC rules (BR-FR) apply to Factur-X / CII D22B invoices only, got flavor "${flavor}"`)
  }
  if (!FR_CTC_LEVELS.has(level)) {
    throw new Error(`French CTC rules (BR-FR) apply to the BASIC WL, EN16931 and EXTENDED profiles only, got level "${level}"`)
  }
}
