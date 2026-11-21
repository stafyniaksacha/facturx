import type { Buffer } from 'node:buffer'
import type { UBL_ROOT } from './constants'
import type { SchematronError, SchematronResult } from './schematron'
import { XmlDocument, XmlValidateError, XsdValidator } from 'libxml2-wasm'
import { EXTENDED_CTC_FR_GUIDELINE_ID } from './constants'
import { assertFrCtcApplicable, validateFrCtc } from './fr-ctc'
import { resolveXml } from './resolve'
import { validateSchematron } from './schematron'
import { assertUblLevelMatches, declaresExtendedCtcFr, DOCTYPE_MESSAGE, getFlavor, getLevel, inputHasDoctype, isUblDocument } from './xml'
import { getXsd } from './xsd'

// XPath dynamic errors caused by the document's values (XPath and XQuery Functions and Operators 3.1
// §C): FORG casts, FOCA/FOAR arithmetic, FODT/FORX date and regex values, XPTY0004 type mismatches.
const DATA_ERROR_CODE = /^(?:FORG|FOCA|FOAR|FODT|XPTY0004)/

export async function check(options: {
  xml: string | Buffer | XmlDocument
  flavor?: string
  level?: string
  /**
   * Also run Schematron (business-rule) validation in addition to the XSD check.
   * Available for the `facturx` and `ubl` flavors. Defaults to `false`.
   */
  schematron?: boolean
  /**
   * Also run the French CTC business rules (`BR-FR-Flux2`, XP Z12-012 v1.4.0): step 3 of the
   * validation sequence of the FNFE-MPE release notes (p.9), after XSD (step 1) and the profile
   * Schematron (step 2). Independent of `schematron`: pass both for the full sequence.
   * Factur-X BASIC WL, EN16931 and EXTENDED, plain-CII EXTENDED-CTC-FR, and UBL 2.1 (EN16931,
   * EXTENDED-CTC-FR), only; throws for other flavors and levels.
   * Defaults to `false`.
   */
  frCtc?: boolean
  /**
   * With `schematron` and/or `frCtc`, treat failed `warning`/`information` rules as errors.
   * Warnings are always reported in `schematronWarnings` / `frCtcWarnings`. Defaults to `false`.
   */
  warningsAsErrors?: boolean
}): Promise<{
  valid: boolean
  errors: any[]
  flavor: string
  level: string
  schematronValid?: boolean
  schematronErrors?: SchematronError[]
  schematronWarnings?: SchematronError[]
  frCtcValid?: boolean
  frCtcErrors?: SchematronError[]
  frCtcWarnings?: SchematronError[]
}> {
  return checkFrom(options, options.xml)
}

/**
 * `check()` on `options.xml`, judging a DOCTYPE from `source`: the text that document was parsed from, whose raw
 * prolog decides (`inputHasDoctype()`), or the same `XmlDocument`, walked fail-closed. For `generate()` and
 * `extract()`, which parse the text themselves. Not exported from the package.
 */
export async function checkFrom(options: Parameters<typeof check>[0], source: string | Uint8Array | XmlDocument): ReturnType<typeof check> {
  const xml = await resolveXml(options.xml)

  // Reported, not thrown, before anything reads the document (was CG-73): libxml2 keeps an internal entity unexpanded
  // for the XSD, the Schematron runs on the serialisation, and the readers refuse it, so no step would check what
  // another sees. No invoice, order or CDAR message uses a DOCTYPE. Flavor and level are read best effort: an entity
  // may hide BT-24.
  let doctype: boolean
  try {
    doctype = inputHasDoctype(source, xml)
  }
  catch (error) {
    if (!(options.xml instanceof XmlDocument))
      xml.dispose()
    throw error
  }
  if (doctype)
    return doctypeResult(xml, options)

  let flavor: string
  let level: string
  try {
    flavor = options.flavor || getFlavor(xml)
    level = options.level || getLevel(xml)
    // An explicit `extended-ctc-fr` must match the document: neither the uncoupled XSD (any token)
    // nor the dedicated Schematron (BT-24 non-empty) checks the guideline ID.
    if (options.level === 'extended-ctc-fr' && flavor === 'facturx' && !declaresExtendedCtcFr(xml))
      throw new Error(`level "extended-ctc-fr" does not match the document: its guideline ID (BT-24) must be ${EXTENDED_CTC_FR_GUIDELINE_ID}`)
    // Symmetric with the `ubl` guard below: the Factur-X XSD and rules are for CII.
    if (flavor === 'facturx' && isUblDocument(xml))
      throw new Error(`The XML root element "${xml.root?.name}" does not match the "facturx" flavor`)
    if (flavor === 'ubl') {
      // The root picks the XSD, so an explicit flavor cannot be applied to a non-UBL document.
      if (getFlavor(xml) !== 'ubl')
        throw new Error(`The XML root element "${xml.root?.name}" does not match the "ubl" flavor`)
      // Same for an explicit UBL level: both share one XSD, which ignores the CustomizationID.
      // `en16931` may stand in for a missing or unsupported id, `extended-ctc-fr` may not.
      if (options.level === 'extended-ctc-fr' || options.level === 'en16931')
        assertUblLevelMatches(xml, options.level)
    }
    // Fail before any validation work when the French rules can't apply.
    if (options.frCtc)
      assertFrCtcApplicable(flavor, level)
  }
  catch (error) {
    if (!(options.xml instanceof XmlDocument))
      xml.dispose()
    throw error
  }

  // UBL has one XSD per root element (Invoice, CreditNote): getFlavor() already checked the namespace.
  const ublRoot = flavor === 'ubl' ? (xml.root?.name as UBL_ROOT | undefined) : undefined
  let xsd: Awaited<ReturnType<typeof getXsd>>
  try {
    xsd = await getXsd(flavor, level, true, ublRoot)
  }
  catch (error) {
    // An unknown level or a flavor with no schema for this level: don't leak the document we parsed.
    if (!(options.xml instanceof XmlDocument))
      xml.dispose()
    throw error
  }
  const validator = XsdValidator.fromDoc(xsd)

  let xsdValid = false
  let errors: any[] = []
  try {
    validator.validate(xml)
    xsdValid = true
  }
  catch (error) {
    if (error instanceof XmlValidateError) {
      errors = error.details
    }
    else {
      validator.dispose()
      throw error
    }
  }
  finally {
    validator.dispose()
  }

  const xmlString = xml.toString()

  if (!(options.xml instanceof XmlDocument)) {
    // Dispose the XmlDocument instance if we created it within this function
    xml.dispose()
  }

  let valid = xsdValid
  const result: Awaited<ReturnType<typeof check>> = { valid, errors, flavor, level }

  // The business-rule transforms assume XSD-valid data: on an invalid value (e.g. a non-decimal
  // amount) SaxonJS aborts with a dynamic error such as FORG0001. Keep the XSD diagnostics in that
  // case instead of rejecting. Only data-dependent XPath errors (casts, arithmetic, dates, type
  // mismatches) are absorbed, and only on XSD-invalid input; anything else (e.g. FODC0002, a missing
  // codedb) and every error on XSD-valid input is a genuine failure and is rethrown.
  const runOnInvalid = async (stage: string, run: () => Promise<SchematronResult>): Promise<SchematronResult> => {
    try {
      return await run()
    }
    catch (error) {
      const { name, code } = error as { name?: string, code?: string }
      if (xsdValid || name !== 'XError' || !DATA_ERROR_CODE.test(code ?? ''))
        throw error
      // The code only: SaxonJS messages quote the offending invoice value.
      return {
        valid: false,
        errors: [{ message: `${stage} could not run on this XSD-invalid document (${code}): fix the XSD errors first`, severity: 'error' }],
        warnings: [],
      }
    }
  }

  if (options.schematron) {
    const schematron = await runOnInvalid('Schematron', () => validateSchematron({ xml: xmlString, flavor, level, warningsAsErrors: options.warningsAsErrors }))
    valid &&= schematron.valid
    result.schematronValid = schematron.valid
    result.schematronErrors = schematron.errors
    result.schematronWarnings = schematron.warnings
  }

  if (options.frCtc) {
    const frCtc = await runOnInvalid('BR-FR', () => validateFrCtc({ xml: xmlString, flavor, level, warningsAsErrors: options.warningsAsErrors }))
    valid &&= frCtc.valid
    result.frCtcValid = frCtc.valid
    result.frCtcErrors = frCtc.errors
    result.frCtcWarnings = frCtc.warnings
  }

  result.valid = valid
  return result
}

function bestEffort(read: () => string): string {
  try {
    return read()
  }
  catch {
    return ''
  }
}

// `check()`'s result for a document with a DOCTYPE: invalid, with one error naming the cause, and the requested
// business-rule stages reported as not run. Disposes only a document `check()` parsed.
function doctypeResult(xml: XmlDocument, options: Parameters<typeof check>[0]): Awaited<ReturnType<typeof check>> {
  const result: Awaited<ReturnType<typeof check>> = {
    valid: false,
    errors: [{ message: DOCTYPE_MESSAGE }],
    flavor: options.flavor || bestEffort(() => getFlavor(xml)),
    level: options.level || bestEffort(() => getLevel(xml)),
  }
  if (!(options.xml instanceof XmlDocument))
    xml.dispose()
  const notRun = (stage: string): SchematronError[] => [{ message: `${stage} was not run: the document has a DOCTYPE`, severity: 'error' }]
  if (options.schematron) {
    result.schematronValid = false
    result.schematronErrors = notRun('Schematron')
    result.schematronWarnings = []
  }
  if (options.frCtc) {
    result.frCtcValid = false
    result.frCtcErrors = notRun('BR-FR')
    result.frCtcWarnings = []
  }
  return result
}
