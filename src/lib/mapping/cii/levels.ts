/**
 * Levels of the EN 16931 model in CII, and the terms a level cannot carry.
 *
 * Writers throw, naming the term, rather than drop a value the caller put in the invoice (design,
 * "One data-loss contract"). The terms come from the Factur-X 1.09 field matrices
 * (`spec/factur-x-1.09/text/fields--Factur-X_CII_D22B_<PROFILE>.csv`): a term missing from the BASIC
 * matrix needs EN 16931; an `EXT-FR-FE-*` field needs EXTENDED or EXTENDED-CTC-FR (Factur-X EXTENDED
 * is presented as a superset of EXTENDED-CTC-FR, FNFE-MPE CTC FR 1.4.0.04 release notes p.9, with
 * exceptions: several BT-46 / BT-60 private identifiers are EXTENDED-CTC-FR only, see
 * `assertPartyIdentifierCounts`).
 */

import type { Invoice } from '../../models/en16931/invoice'
import type { En16931Level } from '../../models/en16931/level'
import { EXTENDED_CTC_FR_GUIDELINE_ID } from '../../constants'

export const EN16931_LEVELS: readonly En16931Level[] = ['basic', 'en16931', 'extended', 'extended-ctc-fr']

/**
 * BT-24 written for each level when the invoice has none: the identifiers of the Factur-X 1.09
 * profiles (spec, BT-24 usage note p.50) and of XP Z12-012 EXTENDED-CTC-FR (annex A, BT-24).
 */
export const GUIDELINE_IDS: Record<En16931Level, string> = {
  'basic': 'urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic',
  'en16931': 'urn:cen.eu:en16931:2017',
  'extended': 'urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended',
  'extended-ctc-fr': EXTENDED_CTC_FR_GUIDELINE_ID,
}

/**
 * Other BT-24 values that name a level of the model: the deprecated ZUGFeRD 2.0 identifiers that the Factur-X 1.09
 * technical appendices list for the profile ("should not be used", BASIC appendix p.9, EXTENDED appendix p.34-35) and
 * that its Schematron accepts (code list 1 of `FACTUR-X_BASIC_codedb.xml` / `FACTUR-X_EXTENDED_codedb.xml`, checked on
 * BT-24). EN 16931 lists `urn:cen.eu:en16931:2017` only, and EXTENDED-CTC-FR its annex A id only. Read, never written:
 * `toCii()` writes `GUIDELINE_IDS`.
 */
export const GUIDELINE_ID_ALIASES: Readonly<Record<string, En16931Level>> = {
  'urn:cen.eu:en16931:2017#compliant#urn:zugferd.de:2p0:basic': 'basic',
  'urn:cen.eu:en16931:2017#conformant#urn:zugferd.de:2p0:extended': 'extended',
}

/**
 * BT-24 of the Factur-X profiles that are not EN 16931 invoices (no lines, no full VAT breakdown), with their deprecated
 * ZUGFeRD 2.0 aliases (code list 1 of `FACTUR-X_MINIMUM_codedb.xml` / `FACTUR-X_BASIC-WL_codedb.xml`).
 */
export const NON_EN16931_GUIDELINE_IDS: Readonly<Record<string, 'minimum' | 'basicwl'>> = {
  'urn:factur-x.eu:1p0:minimum': 'minimum',
  'urn:zugferd.de:2p0:minimum': 'minimum',
  'urn:factur-x.eu:1p0:basicwl': 'basicwl',
  'urn:zugferd.de:2p0:basicwl': 'basicwl',
}

/**
 * The level an exact BT-24 names: an identifier of `GUIDELINE_IDS`, the one source `toCii()` writes from, or of
 * `GUIDELINE_ID_ALIASES`; `undefined` for anything else. Compared as it is, surrounding whitespace included, as the
 * Factur-X Schematrons compare BT-24 with their code list 1 (`<xsl:variable name="codeValue1" select="."/>`, untrimmed:
 * FX-SCH-A-000026 at BASIC, `FACTUR-X_BASIC.xslt` l.4908; FX-SCH-A-000556 at EN 16931, `FACTUR-X_EN16931.xslt` l.5350;
 * FX-SCH-A-000636 at EXTENDED, `FACTUR-X_EXTENDED.xslt` l.5815), although the XSD types it `xs:token` (CG-77).
 */
export function levelOfGuidelineId(id: string | undefined): En16931Level | undefined {
  const value = typeof id === 'string' ? id : undefined
  if (!value)
    return undefined
  for (const level of EN16931_LEVELS) {
    if (GUIDELINE_IDS[level] === value)
      return level
  }
  return Object.hasOwn(GUIDELINE_ID_ALIASES, value) ? GUIDELINE_ID_ALIASES[value] : undefined
}

const RANK: Record<En16931Level, number> = { 'basic': 0, 'en16931': 1, 'extended': 2, 'extended-ctc-fr': 2 }

export function isEn16931Level(level: unknown): level is En16931Level {
  return typeof level === 'string' && (EN16931_LEVELS as readonly string[]).includes(level)
}

/** A term that only some levels carry. */
export interface TermGate {
  /** `BT-n`, `BG-n` or `EXT-FR-FE-n`. */
  id: string
  /** Its name, for the error message. */
  term: string
  /** The lowest level that carries it. */
  from: 'en16931' | 'extended'
  /** Whether the invoice holds a value for it. */
  present: (invoice: Invoice) => boolean
}

/** Throws on the first term of `gates` the invoice holds and `level` cannot carry. Never quotes the value. */
export function assertLevelCarries(invoice: Invoice, level: En16931Level, gates: readonly TermGate[]): void {
  for (const gate of gates) {
    if (RANK[level] < RANK[gate.from] && gate.present(invoice)) {
      const needs = gate.from === 'extended' ? '"extended" or "extended-ctc-fr"' : '"en16931" or above'
      throw new Error(`toCii: ${gate.id} (${gate.term}) is not carried at level "${level}"; it needs level ${needs}`)
    }
  }
}

/** Whether a model value is set: defined, and for an array, not empty. */
export function isSet(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : value !== undefined
}
