/**
 * Value conversions between the EN 16931 model and the CII data types.
 *
 * Dates: the model holds ISO `YYYY-MM-DD`; CII writes format `102` (`YYYYMMDD`). A CII date in any
 * other format is not converted (it maps to `undefined`), so `fromCii()` reports it in `dropped`
 * instead of reformatting it.
 */

import * as qdt from '../../models/facturx/qualifiedTypes'
import * as udt from '../../models/facturx/unqualifiedTypes'

const ISO_DATE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/
const CII_102 = /^(\d{4})(\d{2})(\d{2})$/

/** ISO date from a CII format-102 date string; `undefined` for any other format or shape. */
export function isoFromCii(value: { format?: string } & ({ dateTimeString: string } | { dateString: string }) | undefined): string | undefined {
  if (!value || value.format !== '102')
    return undefined
  const digits = 'dateTimeString' in value ? value.dateTimeString : value.dateString
  const match = CII_102.exec(digits)
  if (!match)
    return undefined
  const iso = `${match[1]}-${match[2]}-${match[3]}`
  return ISO_DATE.test(iso) ? iso : undefined
}

function to102(iso: string, term: string): string {
  if (!ISO_DATE.test(iso))
    throw new Error(`toCii: ${term} must be an ISO date (YYYY-MM-DD)`)
  return iso.replaceAll('-', '')
}

/** `udt:DateTimeType` (format 102) for an ISO date; `undefined` when unset. Throws, naming `term`, on a non-ISO date. */
export function ciiDateTime(iso: string | undefined, term: string): udt.DateTimeType | undefined {
  return iso === undefined ? undefined : new udt.DateTimeType({ dateTimeString: to102(iso, term), format: '102' })
}

/** `qdt:FormattedDateTimeType` (format 102) for an ISO date; `undefined` when unset. */
export function ciiFormattedDateTime(iso: string | undefined, term: string): qdt.FormattedDateTimeType | undefined {
  return iso === undefined ? undefined : new qdt.FormattedDateTimeType({ dateTimeString: to102(iso, term), format: '102' })
}

/** `udt:DateType` (format 102) for an ISO date; `undefined` when unset. */
export function ciiDate(iso: string | undefined, term: string): udt.DateType | undefined {
  return iso === undefined ? undefined : new udt.DateType({ dateString: to102(iso, term), format: '102' })
}

export function ciiText(value: string | undefined): udt.TextType | undefined {
  return value === undefined ? undefined : new udt.TextType({ value })
}

export function ciiId(value: string | undefined, schemeID?: string): udt.IDType | undefined {
  return value === undefined ? undefined : new udt.IDType({ value, schemeID })
}

export function ciiCode(value: string | undefined): udt.CodeType | undefined {
  return value === undefined ? undefined : new udt.CodeType({ value })
}

/**
 * The one value a repeated CII element carries for a single EN 16931 term, when every occurrence
 * agrees; `undefined` when there is none, when one is not representable (`undefined`), or when
 * they differ (`fromCii()` then reports them in `dropped`).
 */
export function agreed<T>(values: (T | undefined)[]): T | undefined {
  if (values.length === 0 || values.includes(undefined))
    return undefined
  return values.every(v => v === values[0]) ? values[0] : undefined
}

/**
 * A required CII aggregate that no mapping fills yet. The CII model types it as required; leaving
 * it out keeps the produced model honest, and `fromCii()` reports its content in `dropped`.
 */
export function unmapped<T>(): T {
  return undefined as T
}
