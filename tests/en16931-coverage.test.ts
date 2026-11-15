import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Completeness of the EN 16931 model: every in-scope EN 16931 / EXT-FR-FE id has a model property, found
 * through the `@bt` / `@bg` / `@ext` JSDoc tags of `src/lib/models/en16931/*.ts` (plain text scan).
 * It reads the source and the vendored spec CSVs only, it does not need `dist/`.
 */

const ROOT = resolve(import.meta.dirname, '..')
const MODEL_DIR = join(ROOT, 'src/lib/models/en16931')
const FX = join(ROOT, 'spec/factur-x-1.09/text')
const ANNEX = join(ROOT, 'spec/afnor-xp-z12-012-1.4/text')

/** Minimal RFC 4180 reader (quoted fields, doubled quotes, newlines inside quotes). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        }
        else {
          quoted = false
        }
      }
      else {
        field += c
      }
    }
    else if (c === '"') {
      quoted = true
    }
    else if (c === ',') {
      row.push(field)
      field = ''
    }
    else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    }
    else if (c !== '\r') {
      field += c
    }
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

const csv = (dir: string, name: string): string[][] => parseCsv(readFileSync(join(dir, name), 'utf8'))

const EN_ID = /^(?:BT|BG)-\d+(?:-\d+)?$/
const EXT_ID = /^EXT-FR-FE-(?:BG-)?\d+(?:-\d+)?$/

/** Factur-X field matrix: column 0 YES/NO, column 5 id, column 17 CII XPath. */
const MATRIX_ID = 5
const MATRIX_XPATH = 17
/** Semantic data type (`Code` for the date format qualifiers). */
const MATRIX_TYPE = 14
/** Annex A CII: column 2 EN id, column 3 EXT-FR-FE id, column 8 XPath. Annex A UBL: columns 1 and 2. */
const CII_EXT = 3
const CII_XPATH = 8
/** Annex A CII `Type logique` (`CODE`, `DATE`, ...). */
const CII_TYPE = 9

const matrix = csv(FX, 'fields--Factur-X_CII_D22B_EN16931.csv').slice(4)
const extendedMatrix = csv(FX, 'fields--Factur-X_CII_D22B_EXTENDED.csv').slice(4)
const annexCii = csv(ANNEX, 'annex-a--CII_D22B_FX_EXT-CTC-FR.csv').slice(4)
const annexUbl = csv(ANNEX, 'annex-a--Flux_2_UBL_EXT-CTC-FR.csv').slice(3)

/**
 * True when the row is a date-format qualifier: an `.../@format` XPath whose type is a code (fixed value
 * "102"), not data. The type check matters: annex A CII row EXT-FR-FE-199 carries the `@format` XPath of
 * its qualifier row by mistake (CG-39 class of shift) but is the contract date, a DATE.
 */
function isFormatQualifier(xpath: string | undefined, type: string | undefined): boolean {
  return /\/@format\s*$/.test((xpath ?? '').trim()) && /^code$/i.test((type ?? '').trim())
}

/**
 * Tags found in the model sources: every id on a `@bt` / `@bg` / `@ext` line. A property may carry
 * several (one per id it holds, e.g. per role), and the holder property of a class such as `Identifier`
 * or `AttachedDocument` lists the ids its own properties carry.
 */
function modelTags(): Set<string> {
  const tags = new Set<string>()
  for (const file of readdirSync(MODEL_DIR).filter(f => f.endsWith('.ts'))) {
    const source = readFileSync(join(MODEL_DIR, file), 'utf8')
    for (const line of source.matchAll(/@(?:bt|bg|ext)\b([^\n]*)/g)) {
      for (const id of line[1]!.matchAll(/\b(?:BT|BG)-\d+(?:-\d+)?\b|\bEXT-FR-FE-(?:BG-)?\d+(?:-\d+)?\b/g))
        tags.add(id[0])
    }
  }
  return tags
}

/** Pure XML wrapper rows, no business data: `-00` / `-000` suffixes and the exact ids of WRAPPER_IDS. */
const WRAPPER_IDS: Record<string, string> = {
  'EXT-FR-FE-149-01': 'UBL annex A wrapper `cac:PartyName` of the line delivery party name (EXT-FR-FE-149), cardinality-only row',
  'BT-70-01': 'UBL annex A wrapper of the delivery party name (BT-70), cardinality-only row',
}
const isWrapper = (id: string): boolean => /-0{2,3}$/.test(id) || id in WRAPPER_IDS

/**
 * Out of scope, each with its reason. A rule below keeps the lists honest: the matrix rows behind them are
 * re-read, so a spec update that turns one into data fails the test.
 */
const EXCLUDED: Record<string, string> = {
  // Ruled exclusions: EXTENDED-only 1.09 rows with neither an EN 16931 row nor an annex A row.
  'BT-179': 'EXTENDED-only 1.09 row, no EN16931 / annex A row',
  'BT-180': 'EXTENDED-only 1.09 row, no EN16931 / annex A row',
  'BT-215': 'EXTENDED-only 1.09 row, no EN16931 / annex A row',
  'BT-216': 'EXTENDED-only 1.09 row, no EN16931 / annex A row',
  'BG-34': 'EXTENDED-only 1.09 row, no EN16931 / annex A row',
}

/**
 * Tags allowed although they are not required: the model may tag a fixed-value or grouping row, and a
 * few EN 16931-standard ids come from the EXTENDED matrix (they have an annex A row, so they are in scope
 * through rule b, and are listed in EXTRA_REQUIRED below). Every id in the field matrices and annex A is
 * allowed as a tag, so that only a typo (an id that exists nowhere) fails the reverse check.
 */
function knownIds(): Set<string> {
  const ids = new Set<string>()
  const add = (v: string | undefined): void => {
    const id = (v ?? '').trim()
    if (EN_ID.test(id) || EXT_ID.test(id))
      ids.add(id)
  }
  for (const r of [...matrix, ...extendedMatrix]) {
    add(r[MATRIX_ID])
    add(r[MATRIX_ID + 1])
  }
  for (const r of annexCii) {
    add(r[2])
    add(r[CII_EXT])
  }
  for (const r of annexUbl) {
    add(r[1])
    add(r[2])
  }
  return ids
}

/** Extra tags that exist outside the matrices and annex A (none today); each needs a reason. */
const ALLOWED_EXTRA_TAGS: Record<string, string> = {
  'BG-0': 'the invoice root itself (class `Invoice`), the matrices call it BG-2 / the CII root',
}

/**
 * Required (in scope) ids:
 *  a. every BT / BG id of a `YES` row of the EN 16931 matrix (columns 5 and 6), except date-format
 *     qualifiers (`@format`, fixed "102"), which carry no data, wrappers and true BT-X;
 *  b. every EXT-FR-FE id of annex A (CII column 3, UBL columns 1 and 2) except wrappers and `@format`
 *     qualifiers;
 *  c. EXTRA_REQUIRED: data-carrying ids the matrix flags NO, and the EN 16931-standard ids that annex A
 *     lists (and the model tags) but the EN 16931 matrix does not flag YES. A general "every BT/BG of annex
 *     A" rule would over-collect (groups, fixed values, `-NN` children the model does not hold), so they
 *     are listed one by one, each checked to exist in annex A or a matrix.
 */
const EXTRA_REQUIRED: Record<string, string> = {
  'BT-11-0': 'project reference: a text row, the matrix flags it NO (Factur-X EXTENDED lists it as data)',
  'BT-193': 'line non-VAT tax reason code (annex A YES row, EXTENDED matrix; EN 16931 matrix has no row)',
  'BT-193-1': 'code list id of the line non-VAT tax code, sub-id of BT-193 in annex A',
  'BT-167': 'VAT accounting currency exchange rate (annex A YES row)',
  'BT-167-1': 'exchange rate target currency (annex A YES row)',
  'BT-167-2': 'exchange rate source currency (annex A YES row)',
  'BT-173': 'VAT exemption reason of the document allowance (annex A, also EXT-FR-FE-187)',
  'BT-174': 'VAT exemption reason code of the document allowance (annex A, also EXT-FR-FE-188)',
  'BT-175': 'VAT exemption reason of the document charge (annex A, also EXT-FR-FE-189)',
  'BT-176': 'VAT exemption reason code of the document charge (annex A, also EXT-FR-FE-190)',
  'BT-177': 'document non-VAT tax code (annex A YES row)',
  'BT-177-1': 'code list id of the document non-VAT tax code (annex A YES row)',
  'BT-29-0': 'seller identifier (GlobalID/ID holder): Identifier type, the matrix flags the parent NO',
  'BT-60-0': 'payee identifier: Identifier type, the matrix flags the parent NO',
  'BT-84-0': 'payment account identifier: Identifier type, the matrix flags the parent NO',
}

function requiredIds(): { required: Set<string>, excluded: Map<string, string> } {
  const required = new Set<string>()
  const excluded = new Map<string, string>()
  const skip = (id: string, why: string): void => {
    excluded.set(id, why)
  }
  // Column 5 is the id; column 6 (`ID CTC-FR Reform`) holds the id of the data-carrying "-1" sub-row where
  // the row's own id is a "-0" holder (BT-63-0 -> BT-63-1, BT-110-0 -> BT-110-1, BT-111-0 -> BT-111-1).
  const yesIds = matrix
    .filter(r => r[0] === 'YES')
    .flatMap(r => [r[MATRIX_ID], r[MATRIX_ID + 1]].map(c => ({ id: (c ?? '').trim(), row: r })))
  for (const { id, row: r } of yesIds) {
    if (!EN_ID.test(id))
      continue
    if (isFormatQualifier(r[MATRIX_XPATH], r[MATRIX_TYPE]))
      skip(id, 'date format qualifier (@format, fixed "102")')
    else if (isWrapper(id))
      skip(id, 'XML wrapper')
    else if (id in EXCLUDED)
      skip(id, EXCLUDED[id]!)
    else if (id.startsWith('BT-X-'))
      skip(id, 'true BT-X')
    else
      required.add(id)
  }
  for (const id of Object.keys(EXTRA_REQUIRED))
    required.add(id)

  const ext = new Map<string, { xpath?: string, type?: string }>()
  for (const r of annexCii) {
    const id = (r[CII_EXT] ?? '').trim()
    if (EXT_ID.test(id))
      ext.set(id, { xpath: r[CII_XPATH], type: r[CII_TYPE] })
  }
  for (const r of annexUbl) {
    for (const c of [r[1], r[2]]) {
      const id = (c ?? '').trim()
      if (EXT_ID.test(id) && !ext.has(id))
        ext.set(id, {})
    }
  }
  for (const [id, { xpath, type }] of ext) {
    if (isWrapper(id))
      skip(id, 'XML wrapper')
    else if (isFormatQualifier(xpath, type))
      skip(id, 'date format qualifier (@format, fixed "102")')
    else
      required.add(id)
  }
  return { required, excluded }
}

describe('eN 16931 model completeness', () => {
  const tags = modelTags()
  const { required, excluded } = requiredIds()

  it('reads a plausible number of ids (the scan itself works)', () => {
    expect(required.size).toBeGreaterThan(300)
    expect(tags.size).toBeGreaterThan(400)
  })

  it('every in-scope EN 16931 and EXT-FR-FE id has a model property', () => {
    const missing = [...required].filter(id => !tags.has(id)).sort()
    expect(missing, `ids with no @bt/@bg/@ext tag: ${missing.join(', ')}`).toEqual([])
  })

  it('every tagged id exists in the specification or is an explicit extra (catches typos)', () => {
    const known = knownIds()
    const stray = [...tags].filter(id => !known.has(id) && !(id in ALLOWED_EXTRA_TAGS)).sort()
    expect(stray, `tags naming no id of the matrices or annex A: ${stray.join(', ')}`).toEqual([])
  })

  it('every EXTRA_REQUIRED id exists in the matrices or annex A', () => {
    const known = knownIds()
    for (const id of Object.keys(EXTRA_REQUIRED))
      expect(known.has(id), id).toBe(true)
  })

  it('the exclusions are real spec rows or explicit rulings, never in-scope ids', () => {
    for (const id of Object.keys(EXCLUDED))
      expect(required.has(id), id).toBe(false)
    // a wrapper or format qualifier that the model tags anyway is fine, but it must not be required
    for (const id of excluded.keys())
      expect(required.has(id), id).toBe(false)
  })
})
