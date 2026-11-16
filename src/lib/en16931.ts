// Syntax-neutral entry points of the EN 16931 model: one call to write an invoice as CII or UBL, one to read
// either syntax into the model. They only dispatch to the per-syntax functions (`toCii` + `invoiceToXml`,
// `invoiceToUbl`; `xmlToInvoice` + `fromCii`, `ublToInvoice`), whose checks and errors apply unchanged.
import type { Buffer } from 'node:buffer'
import type { Invoice } from './models/en16931/invoice'
import type { En16931Level } from './models/en16931/level'
import { XmlDocument } from 'libxml2-wasm'
import { UBL_LEVELS } from './constants'
import { invoiceToXml } from './converters/facturx'
import { invoiceToUbl } from './converters/ubl'
import { fromCii, toCii } from './mapping/cii'
import { xmlToInvoice } from './parsers/facturx'
import { ublToInvoice } from './parsers/ubl'
import { getFlavor } from './xml'

/** The XML syntaxes the EN 16931 model is written to and read from. */
export type En16931Syntax = 'cii' | 'ubl'

/** Options of `en16931ToXml()`. */
export interface En16931ToXmlOptions {
  /** `cii` (Factur-X / EXTENDED-CTC-FR CII D22B) or `ubl` (UBL 2.1 `Invoice` / `CreditNote`). */
  syntax: En16931Syntax
  /**
   * The profile to write. `cii` takes every `En16931Level`; `ubl` only `en16931` and `extended-ctc-fr`, the levels
   * with a UBL binding.
   */
  level: En16931Level
}

/** What `xmlToEn16931()` returns. */
export interface XmlToEn16931Result {
  /** The invoice, keyed by EN 16931 business term. */
  invoice: Invoice
  /** What the model has no place for, as `fromCii()` (CII) or `ublToInvoice()` (UBL) reports it: paths, never values. */
  dropped: string[]
  /** The syntax the document was read from. */
  syntax: En16931Syntax
}

const UBL_LEVEL_LIST = UBL_LEVELS.map(l => `"${l}"`).join(', ')

/**
 * Write an EN 16931 invoice as XML in `syntax` at `level`: `cii` is `invoiceToXml(toCii(invoice, { level }))`, `ubl`
 * is `invoiceToUbl(invoice, { level })` (root chosen from BT-3). Throws what those throw (naming the business
 * term, never quoting invoice content), and for a `ubl` level other than `en16931` / `extended-ctc-fr`. The caller
 * owns the returned document: serialise it with `.toString()`, then `dispose()` it.
 */
export async function en16931ToXml(invoice: Invoice, options: En16931ToXmlOptions): Promise<XmlDocument> {
  const syntax = options?.syntax
  if (syntax === 'cii')
    return invoiceToXml(toCii(invoice, { level: options.level }))
  if (syntax === 'ubl') {
    if (!(UBL_LEVELS as readonly string[]).includes(options.level))
      throw new Error(`en16931ToXml: UBL is written at ${UBL_LEVEL_LIST} only (options.level)`)
    return invoiceToUbl(invoice, { level: options.level as typeof UBL_LEVELS[number] })
  }
  throw new Error('en16931ToXml: options.syntax must be "cii" or "ubl"')
}

/**
 * Read a CII (Factur-X BASIC, EN 16931, EXTENDED, or plain-CII EXTENDED-CTC-FR) or UBL 2.1 invoice into the EN 16931
 * model, choosing the reader from the root element: `fromCii(await xmlToInvoice(xml))` or `ublToInvoice(xml)`.
 * Throws what those throw (MINIMUM and BASIC WL are not EN 16931 invoices; a UBL document with a DOCTYPE is
 * refused), and for an Order-X, ZUGFeRD 1.0 or unrecognised document. An `XmlDocument` passed in stays the
 * caller's (never disposed). Errors never quote the document.
 */
export async function xmlToEn16931(xml: string | Buffer | XmlDocument): Promise<XmlToEn16931Result> {
  const owned = !(xml instanceof XmlDocument)
  const doc = xml instanceof XmlDocument ? xml : typeof xml === 'string' ? XmlDocument.fromString(xml) : XmlDocument.fromBuffer(xml)
  try {
    const flavor = getFlavor(doc)
    if (flavor === 'ubl')
      return { ...await ublToInvoice(doc), syntax: 'ubl' }
    if (flavor === 'facturx') {
      // `xmlToInvoice()` parses its own copy from text; a caller's document is serialised for it, never disposed.
      const cii = await xmlToInvoice(xml instanceof XmlDocument ? xml.toString() : xml)
      return { ...fromCii(cii), syntax: 'cii' }
    }
    throw new Error(`xmlToEn16931: a "${flavor}" document is not an invoice the EN 16931 model reads (CII or UBL 2.1 invoices only)`)
  }
  finally {
    if (owned)
      doc.dispose()
  }
}
