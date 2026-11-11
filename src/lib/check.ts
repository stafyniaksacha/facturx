import type { Buffer } from 'node:buffer'
import type { SchematronError, SchematronResult } from './schematron'
import { XmlDocument, XmlValidateError, XsdValidator } from 'libxml2-wasm'
import { assertFrCtcApplicable, validateFrCtc } from './fr-ctc'
import { resolveXml } from './resolve'
import { validateSchematron } from './schematron'
import { getFlavor, getLevel } from './xml'
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
   * Only available for the `facturx` flavor. Defaults to `false`.
   */
  schematron?: boolean
  /**
   * Also run the French CTC business rules (`BR-FR-Flux2`, XP Z12-012 v1.4.0): step 3 of the
   * validation sequence of the FNFE-MPE release notes (p.9), after XSD (step 1) and the profile
   * Schematron (step 2). Independent of `schematron`: pass both for the full sequence.
   * Factur-X BASIC WL, EN16931 and EXTENDED only; throws for other flavors and levels.
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
  const xml = await resolveXml(options.xml)

  let flavor: string
  let level: string
  try {
    flavor = options.flavor || getFlavor(xml)
    level = options.level || getLevel(xml)
    // Fail before any validation work when the French rules can't apply.
    if (options.frCtc)
      assertFrCtcApplicable(flavor, level)
  }
  catch (error) {
    if (!(options.xml instanceof XmlDocument))
      xml.dispose()
    throw error
  }

  const xsd = await getXsd(flavor, level)
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
