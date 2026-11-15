import { validateCdar } from './lib/cdar'
import { check } from './lib/check'
import { invoiceToXml } from './lib/converters/facturx'
import { extract } from './lib/extract'
import { validateFrCtc } from './lib/fr-ctc'
import { generate } from './lib/generate'
import { fromCii, toCii } from './lib/mapping/cii'
import * as EN16931 from './lib/models/en16931'
import * as Models from './lib/models/facturx'
import { xmlToInvoice } from './lib/parsers/facturx'
import { validateSchematron } from './lib/schematron'

export {
  check,
  EN16931,
  extract,
  fromCii,
  generate,
  invoiceToXml,
  Models,
  toCii,
  validateCdar,
  validateFrCtc,
  validateSchematron,
  xmlToInvoice,
}

export type { CdarResult } from './lib/cdar'
export type { FromCiiResult, ToCiiOptions } from './lib/mapping/cii'
export type { En16931Level } from './lib/models/en16931/level'
export type { SchematronConfig, SchematronError, SchematronResult } from './lib/schematron'
