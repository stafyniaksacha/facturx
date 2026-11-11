import type { Buffer } from 'node:buffer'
import type { SchematronConfig, SchematronError, SchematronResult } from './schematron'
import { runSchematron } from './schematron'

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
 * Factur-X profiles in scope of the French e-invoicing reform: BASIC WL, EN16931 and EXTENDED (release
 * notes p.9 and p.10-11). MINIMUM and BASIC are not invoices under the reform.
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
 * @throws when `flavor` is not `facturx`, or `level` is not one of `basicwl`, `en16931`, `extended`.
 */
export async function validateFrCtc(options: {
  xml: string | Buffer
  /** Profile of the invoice: `basicwl`, `en16931` or `extended`. */
  level: string
  flavor?: string
  /** Treat failed `warning`/`information` rules as errors. The vendored rules are all `fatal`, so this has no effect today. */
  warningsAsErrors?: boolean
}): Promise<SchematronResult> {
  assertFrCtcApplicable(options.flavor ?? 'facturx', options.level)

  const result = await runSchematron(FR_CTC_SCHEMATRON, options.xml, { warningsAsErrors: options.warningsAsErrors })
  return {
    valid: result.valid,
    errors: result.errors.map(toRule),
    warnings: result.warnings.map(toRule),
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
