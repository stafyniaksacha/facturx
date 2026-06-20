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
  /** Business rule id parsed from the message, e.g. "BR-16" (when present). */
  id?: string
  /** The failing XPath test expression. */
  test?: string
  /** Location of the offending node. */
  location?: string
  /** Severity flag from the rule (e.g. "fatal", "warning"). */
  flag?: string
}

interface SchematronConfig {
  /** Path (relative to this module) to the gzipped, relocatable SEF. */
  sef: string
  /** Path (relative to this module) to the code list database. */
  codedb: string
  /** Filename the transform expects when resolving the codedb via document(). */
  codedbName: string
}

const dir = (level: string): string => `./xsd/facturx/${level}`

export const FACTURX_SCHEMATRON: Record<string, SchematronConfig> = {
  minimum: { sef: `${dir('minimum')}/FACTUR-X_MINIMUM.sef.json.gz`, codedb: `${dir('minimum')}/FACTUR-X_MINIMUM_codedb.xml`, codedbName: 'FACTUR-X_MINIMUM_codedb.xml' },
  basicwl: { sef: `${dir('basicwl')}/FACTUR-X_BASIC-WL.sef.json.gz`, codedb: `${dir('basicwl')}/FACTUR-X_BASIC-WL_codedb.xml`, codedbName: 'FACTUR-X_BASIC-WL_codedb.xml' },
  basic: { sef: `${dir('basic')}/FACTUR-X_BASIC.sef.json.gz`, codedb: `${dir('basic')}/FACTUR-X_BASIC_codedb.xml`, codedbName: 'FACTUR-X_BASIC_codedb.xml' },
  en16931: { sef: `${dir('en16931')}/FACTUR-X_EN16931.sef.json.gz`, codedb: `${dir('en16931')}/FACTUR-X_EN16931_codedb.xml`, codedbName: 'FACTUR-X_EN16931_codedb.xml' },
  extended: { sef: `${dir('extended')}/Factur-X_EXTENDED.sef.json.gz`, codedb: `${dir('extended')}/FACTUR-X_EXTENDED_codedb.xml`, codedbName: 'FACTUR-X_EXTENDED_codedb.xml' },
}

// Per-process cache of prepared stylesheet locations (decompressed SEF + codedb).
const _prepared: Record<string, string> = {}

/**
 * Decompress the SEF and place it next to its codedb in a temp directory so that
 * the transform's relative `document()` call resolves. Cached per process.
 */
function prepareStylesheet(level: string): string {
  if (_prepared[level]) {
    return _prepared[level]
  }

  const config = FACTURX_SCHEMATRON[level]
  if (!config) {
    throw new Error(`No Factur-X Schematron available for level: "${level}"`)
  }

  const workDir = mkdtempSync(join(tmpdir(), 'facturx-sch-'))
  const sefPath = join(workDir, 'schematron.sef.json')
  writeFileSync(sefPath, gunzipSync(readFileSync(resolve(import.meta.dirname, config.sef))))
  copyFileSync(resolve(import.meta.dirname, config.codedb), join(workDir, config.codedbName))

  _prepared[level] = sefPath
  return sefPath
}

function parseSvrl(svrl: string): SchematronError[] {
  const errors: SchematronError[] = []
  const assertRe = /<svrl:failed-assert\b([^>]*)>([\s\S]*?)<\/svrl:failed-assert>/g
  const textRe = /<svrl:text>([\s\S]*?)<\/svrl:text>/
  const getAttr = (attrs: string, name: string): string | undefined => {
    const m = attrs.match(new RegExp(`${name}="([^"]*)"`))
    return m ? decodeEntities(m[1]) : undefined
  }

  let match: RegExpExecArray | null
  // eslint-disable-next-line no-cond-assign
  while ((match = assertRe.exec(svrl)) !== null) {
    const attrs = match[1]
    const body = match[2]
    const message = decodeEntities((body.match(textRe)?.[1] ?? '').replace(/\s+/g, ' ').trim())
    const id = message.match(/\[([A-Z]+(?:-[A-Z0-9]+)+)\]/)?.[1]
    errors.push({
      message,
      id,
      test: getAttr(attrs, 'test'),
      location: getAttr(attrs, 'location'),
      flag: getAttr(attrs, 'flag'),
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
 */
export async function validateSchematron(options: {
  xml: string | Buffer
  flavor?: string
  level: string
}): Promise<{ valid: boolean, errors: SchematronError[] }> {
  if (options.flavor && options.flavor !== 'facturx') {
    throw new Error(`Schematron validation is only available for the "facturx" flavor, got "${options.flavor}"`)
  }

  const sefPath = prepareStylesheet(options.level)
  const sourceText = typeof options.xml === 'string' ? options.xml : options.xml.toString()

  const result = await SaxonJS.transform({
    stylesheetFileName: sefPath,
    sourceText,
    destination: 'serialized',
  }, 'async')

  const svrl = (result as { principalResult?: string }).principalResult ?? ''
  const errors = parseSvrl(svrl)

  return { valid: errors.length === 0, errors }
}
