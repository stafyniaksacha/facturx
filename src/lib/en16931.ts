// Syntax-neutral entry points of the EN 16931 model: one call to write an invoice as CII or UBL, one to read
// either syntax into the model. They only dispatch to the per-syntax functions (`toCii` + `invoiceToXml`,
// `invoiceToUbl`; `xmlToInvoice` + `fromCii`, `ublToInvoice`), whose checks and errors apply unchanged.
import type { Buffer } from 'node:buffer'
import type { UBL_ROOT } from './constants'
import type { UblLevel } from './converters/ubl'
import type { Invoice } from './models/en16931/invoice'
import type { En16931Level } from './models/en16931/level'
import { XmlDocument } from 'libxml2-wasm'
import { UBL_LEVELS } from './constants'
import { invoiceToXml } from './converters/facturx'
import { invoiceToUbl } from './converters/ubl'
import { fromCii, toCii } from './mapping/cii'
import { xmlToInvoice } from './parsers/facturx'
import { ublToInvoice } from './parsers/ubl'
import { getFlavor, inputHasDoctype } from './xml'

/** The XML syntaxes the EN 16931 model is written to and read from. */
export type En16931Syntax = 'cii' | 'ubl'

/** Options of `en16931ToXml()` for CII (Factur-X / EXTENDED-CTC-FR CII D22B). */
export interface En16931ToCiiOptions {
  syntax: 'cii'
  /** The profile to write: `basic`, `en16931`, `extended` or `extended-ctc-fr`. */
  level: En16931Level
}

/** Options of `en16931ToXml()` for UBL 2.1 (`Invoice` / `CreditNote`). */
export interface En16931ToUblOptions {
  syntax: 'ubl'
  /** The profile to write: `en16931` or `extended-ctc-fr`, the levels with a UBL binding. */
  level: UblLevel
  /**
   * The root element, passed to `invoiceToUbl()`: by default a `CreditNote` for a BT-3 in the BR-CL-01 credit note
   * list, else an `Invoice`.
   */
  root?: UBL_ROOT
}

/** Options of `en16931ToXml()`: the syntax decides which levels (and, for UBL, which root) apply. */
export type En16931ToXmlOptions = En16931ToCiiOptions | En16931ToUblOptions

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
 * is `invoiceToUbl(invoice, { level, root })`. Throws what those throw (naming the business term, never quoting
 * invoice content), and for a `ubl` level other than `en16931` / `extended-ctc-fr` (checked at runtime too, for
 * JavaScript callers). The caller owns the returned document: serialise it with `.toString()`, then `dispose()` it.
 */
export async function en16931ToXml(invoice: Invoice, options: En16931ToXmlOptions): Promise<XmlDocument> {
  const syntax = options?.syntax
  if (syntax === 'cii')
    return invoiceToXml(toCii(invoice, { level: options.level }))
  if (syntax === 'ubl') {
    if (!(UBL_LEVELS as readonly string[]).includes(options.level))
      throw new Error(`en16931ToXml: UBL is written at ${UBL_LEVEL_LIST} only (options.level)`)
    return invoiceToUbl(invoice, { level: options.level, root: options.root })
  }
  throw new Error('en16931ToXml: options.syntax must be "cii" or "ubl"')
}

/**
 * Read a CII (Factur-X BASIC, EN 16931, EXTENDED, or plain-CII EXTENDED-CTC-FR) or UBL 2.1 invoice into the EN 16931
 * model, choosing the reader from the root element: `fromCii(await xmlToInvoice(xml))` or `ublToInvoice(xml)`.
 * Refuses a document with a DOCTYPE, whatever its syntax (an internal entity could hide or replace content the reader
 * would then miss; `xmlToInvoice()` and `ublToInvoice()` refuse it too, was CG-73). Throws what the readers throw (MINIMUM and
 * BASIC WL are not EN 16931 invoices), and for an Order-X, ZUGFeRD 1.0, CDAR or unrecognised document. An
 * `XmlDocument` passed in stays the caller's (never disposed). Errors never quote text content; a malformed input
 * passes libxml2's parse error through, which can name elements.
 */
export async function xmlToEn16931(xml: string | Buffer | XmlDocument): Promise<XmlToEn16931Result> {
  const owned = !(xml instanceof XmlDocument)
  const doc = xml instanceof XmlDocument ? xml : typeof xml === 'string' ? XmlDocument.fromString(xml) : XmlDocument.fromBuffer(xml)
  try {
    if (inputHasDoctype(xml, doc))
      throw new Error('xmlToEn16931: the document has a DOCTYPE; invoices use none, and its entities could hide or replace content, so it is refused')
    const flavor = getFlavor(doc)
    if (flavor === 'ubl')
      // Text goes to the reader as text, so it judges the prolog as this function did; a caller's document as is.
      return { ...await ublToInvoice(owned ? xml : doc), syntax: 'ubl' }
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
