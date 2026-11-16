import { validateCdar } from './lib/cdar'
import { check } from './lib/check'
import { invoiceToXml } from './lib/converters/facturx'
import { invoiceToUbl } from './lib/converters/ubl'
import { en16931ToXml, xmlToEn16931 } from './lib/en16931'
import { extract } from './lib/extract'
import { validateFrCtc } from './lib/fr-ctc'
import { generate } from './lib/generate'
import { fromCii, toCii } from './lib/mapping/cii'
import * as EN16931 from './lib/models/en16931'
import * as Models from './lib/models/facturx'
import { xmlToInvoice } from './lib/parsers/facturx'
import { ublToInvoice } from './lib/parsers/ubl'
import { validateSchematron } from './lib/schematron'

export {
  check,
  EN16931,
  en16931ToXml,
  extract,
  fromCii,
  generate,
  invoiceToUbl,
  invoiceToXml,
  Models,
  toCii,
  ublToInvoice,
  validateCdar,
  validateFrCtc,
  validateSchematron,
  xmlToEn16931,
  xmlToInvoice,
}

export type { CdarResult } from './lib/cdar'
export type { InvoiceToUblOptions, UblLevel } from './lib/converters/ubl'
export type { En16931Syntax, En16931ToXmlOptions, XmlToEn16931Result } from './lib/en16931'
export type { FromCiiResult, ToCiiOptions } from './lib/mapping/cii'
export type { En16931Level } from './lib/models/en16931/level'
export type { UblToInvoiceResult } from './lib/parsers/ubl'
export type { SchematronConfig, SchematronError, SchematronResult } from './lib/schematron'
