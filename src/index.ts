import { check } from './lib/check'
import { invoiceToXml } from './lib/converters/facturx'
import { extract } from './lib/extract'
import { validateFrCtc } from './lib/fr-ctc'
import { generate } from './lib/generate'
import * as Models from './lib/models/facturx'
import { xmlToInvoice } from './lib/parsers/facturx'
import { validateSchematron } from './lib/schematron'

export {
  check,
  extract,
  generate,
  invoiceToXml,
  Models,
  validateFrCtc,
  validateSchematron,
  xmlToInvoice,
}

export type { SchematronConfig, SchematronError, SchematronResult } from './lib/schematron'
