import type { XMLDocument } from 'libxmljs'

import type { Buffer } from 'node:buffer'
import type { SchematronError } from './schematron'

import { resolveXml } from './resolve'
import { validateSchematron } from './schematron'
import { getFlavor, getLevel } from './xml'
import { getXsd } from './xsd'

export async function check(options: {
  xml: string | Buffer | XMLDocument
  flavor?: string
  level?: string
  /**
   * Also run Schematron (business-rule) validation in addition to the XSD check.
   * Only available for the `facturx` flavor. Defaults to `false`.
   */
  schematron?: boolean
}): Promise<{
  valid: boolean
  errors: any[]
  flavor: string
  level: string
  schematronValid?: boolean
  schematronErrors?: SchematronError[]
}> {
  const xml = await resolveXml(options.xml)

  const flavor = options.flavor || getFlavor(xml)
  const level = options.level || getLevel(xml)

  const xsd = await getXsd(flavor, level)

  const xsdValid = xml.validate(xsd) as boolean
  const errors = xml.validationErrors

  if (!options.schematron) {
    return {
      valid: xsdValid,
      errors,
      flavor,
      level,
    }
  }

  const schematron = await validateSchematron({ xml: xml.toString(), flavor, level })

  return {
    valid: xsdValid && schematron.valid,
    errors,
    flavor,
    level,
    schematronValid: schematron.valid,
    schematronErrors: schematron.errors,
  }
}
