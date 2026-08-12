import type { Buffer } from 'node:buffer'
import type { SchematronError } from './schematron'
import { XmlDocument, XmlValidateError, XsdValidator } from 'libxml2-wasm'
import { resolveXml } from './resolve'
import { validateSchematron } from './schematron'
import { getFlavor, getLevel } from './xml'
import { getXsd } from './xsd'

export async function check(options: {
  xml: string | Buffer | XmlDocument
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
  using validator = XsdValidator.fromDoc(xsd)

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
      throw error
    }
  }

  const xmlString = xml.toString()

  if (!(options.xml instanceof XmlDocument)) {
    // Dispose the XmlDocument instance if we created it within this function
    xml.dispose()
  }

  if (!options.schematron) {
    return {
      valid: xsdValid,
      errors,
      flavor,
      level,
    }
  }

  const schematron = await validateSchematron({ xml: xmlString, flavor, level })

  return {
    valid: xsdValid && schematron.valid,
    errors,
    flavor,
    level,
    schematronValid: schematron.valid,
    schematronErrors: schematron.errors,
  }
}
