import type { Buffer } from 'node:buffer'
import type { SchematronConfig, SchematronError } from './schematron'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { XmlDocument, XmlValidateError, XsdValidator } from 'libxml2-wasm'
import { resolveXml } from './resolve'
import { runSchematron } from './schematron'
// Registers the filesystem input provider, so the CDAR XSD imports resolve.
import './xsd'

/**
 * French e-invoicing lifecycle status messages (CDV, "cycle de vie") in UN/CEFACT Cross Domain
 * Acknowledgement and Response (CDAR) D22B, validate-only.
 *
 * The FNFE-MPE "Schematrons FR CTC" v1.4.0.04 release notes (p.10) define two steps: the
 * "uncoupled" CDAR D22B XSD (`CrossDomainAcknowledgementAndResponse_100pD22B.xsd`), then the French
 * rules `BR-FR-CDV-Schematron-CDAR` (`BR-FR-CDV-01…16`, `BR-FR-CDV-CL-01…11`, plus `BR-FR-04`). Both
 * are vendored from `spec/fnfe-ctc-fr-1.4.0.04/distribution/CDAR/` (see `xsd/cdar/SCHEMATRON.md`).
 * Building CDAR messages is out of scope.
 */

const CDAR_NS = 'urn:un:unece:uncefact:data:standard:CrossDomainAcknowledgementAndResponse:100'
const CDAR_XSD = './xsd/cdar/CrossDomainAcknowledgementAndResponse_100pD22B.xsd'

export const CDAR_SCHEMATRON: SchematronConfig = {
  sef: './xsd/cdar/BR-FR-CDV-Schematron-CDAR.sef.json.gz',
  idFromAssert: true,
}

// The SVRL @id of a BR-FR-CDV assert is the rule plus a qualifier: `BR-FR-CDV-01_MDG-3`,
// `BR-FR-CDV-CL-09_MDT-113_200`, `BR-FR-04_MDT-91`. The rule is the leading part up to its number.
const RULE_RE = /^BR-FR-(?:[A-Z]+-)*\d+/

// XPath dynamic errors caused by the document's values (see check.ts): absorbed only when the XSD
// already failed, since the rules assume XSD-valid data.
const DATA_ERROR_CODE = /^(?:FORG|FOCA|FOAR|FODT|XPTY0004)/

export interface CdarResult {
  /** `true` when the XSD passes and no BR-FR-CDV rule of severity `error` failed. */
  valid: boolean
  /** XSD (structure) errors, from libxml2. */
  errors: any[]
  /** Failed BR-FR-CDV rules that make the message invalid (includes warnings with `warningsAsErrors`). */
  schematronErrors: SchematronError[]
  /** Failed BR-FR-CDV rules flagged `warning`, always reported. */
  schematronWarnings: SchematronError[]
}

let cachedXsd: XmlDocument | undefined

async function cdarXsd(): Promise<XmlDocument> {
  if (!cachedXsd) {
    const url = resolve(join(import.meta.dirname, CDAR_XSD))
    cachedXsd = await resolveXml(await readFile(url), { url })
  }
  return cachedXsd
}

/**
 * Validate a CDAR lifecycle status message: the uncoupled CDAR D22B XSD, then the French rules
 * `BR-FR-CDV-Schematron-CDAR` (standard variant: 40 asserts `fatal`, 3 `warning`).
 *
 * Each Schematron finding has `id` set to the business rule (`BR-FR-CDV-CL-09`) and `assertId` to
 * the raw assert id (`BR-FR-CDV-CL-09_MDT-113_200`). Messages are in French and may quote message
 * values (identifiers, names): treat them as personal data.
 *
 * @throws when the root element is not a CDAR `CrossDomainAcknowledgementAndResponse`.
 */
export async function validateCdar(options: {
  xml: string | Buffer | XmlDocument
  /** Treat failed `warning` rules as errors. Defaults to `false`. */
  warningsAsErrors?: boolean
}): Promise<CdarResult> {
  const xml = await resolveXml(options.xml)
  let xsdValid = false
  let errors: any[] = []
  let xmlString: string
  try {
    const root = xml.root
    if (root.name !== 'CrossDomainAcknowledgementAndResponse' || root.namespaceUri !== CDAR_NS)
      throw new Error(`Not a CDAR lifecycle message: expected the root element CrossDomainAcknowledgementAndResponse in ${CDAR_NS}, got "${root.name}"`)

    const validator = XsdValidator.fromDoc(await cdarXsd())
    try {
      validator.validate(xml)
      xsdValid = true
    }
    catch (error) {
      if (!(error instanceof XmlValidateError))
        throw error
      errors = error.details
    }
    finally {
      validator.dispose()
    }
    xmlString = xml.toString()
  }
  finally {
    if (!(options.xml instanceof XmlDocument))
      xml.dispose()
  }

  let schematronErrors: SchematronError[]
  let schematronWarnings: SchematronError[]
  try {
    const result = await runSchematron(CDAR_SCHEMATRON, xmlString, { warningsAsErrors: options.warningsAsErrors })
    schematronErrors = result.errors.map(toRule)
    schematronWarnings = result.warnings.map(toRule)
  }
  catch (error) {
    const { name, code } = error as { name?: string, code?: string }
    if (xsdValid || name !== 'XError' || !DATA_ERROR_CODE.test(code ?? ''))
      throw error
    // The code only: SaxonJS messages quote the offending value.
    schematronErrors = [{ message: `BR-FR-CDV could not run on this XSD-invalid message (${code}): fix the XSD errors first`, severity: 'error' }]
    schematronWarnings = []
  }

  return {
    valid: xsdValid && schematronErrors.length === 0,
    errors,
    schematronErrors,
    schematronWarnings,
  }
}

/** Business rule of a BR-FR-CDV assert, from its SVRL @id only, never from the message. */
function toRule(error: SchematronError): SchematronError {
  const rule = error.assertId?.match(RULE_RE)?.[0]
  return { ...error, id: rule ?? error.assertId }
}
