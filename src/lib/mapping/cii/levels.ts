/**
 * Levels of the EN 16931 model in CII, and the terms a level cannot carry.
 *
 * Writers throw, naming the term, rather than drop a value the caller put in the invoice (design,
 * "One data-loss contract"). The terms come from the Factur-X 1.09 field matrices
 * (`spec/factur-x-1.09/text/fields--Factur-X_CII_D22B_<PROFILE>.csv`): a term missing from the BASIC
 * matrix needs EN 16931; an `EXT-FR-FE-*` field needs EXTENDED or EXTENDED-CTC-FR (Factur-X EXTENDED
 * is a superset of EXTENDED-CTC-FR, FNFE-MPE CTC FR 1.4.0.04 release notes p.9).
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
