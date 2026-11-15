export const FACTURX_FILENAME = 'factur-x.xml'
// Reference profile XRECHNUNG (§7.7, codelists--Filename.csv): a CII invoice, read like factur-x.xml.
export const XRECHNUNG_FILENAME = 'xrechnung.xml'
export const ZUGFERD_FILENAMES = ['zugferd-invoice.xml', 'ZUGFeRD-invoice.xml']
export const ORDERX_FILENAME = 'order-x.xml'

export type FACTURX_SCHEMA_TYPE = keyof typeof FACTURX_SCHEMA
// MINIMUM and BASIC: Factur-X 1.09 FINAL. BASIC WL, EN 16931 and EXTENDED: Factur-X
// 1.09.2.fixFR04 as shipped by FNFE-MPE "Schematrons FR CTC 1.4.0.04", which only covers
// the profiles in scope of the French reform (CONFORMANCE.md CG-16).
export const FACTURX_SCHEMA = {
  'basic': './xsd/facturx/basic/Factur-X_1.09_BASIC.xsd',
  'basicwl': './xsd/facturx/basicwl/Factur-X_BASICWL.xsd',
  'en16931': './xsd/facturx/en16931/Factur-X_EN16931.xsd',
  'extended': './xsd/facturx/extended/Factur-X_EXTENDED.xsd',
  // Plain CII D22B in the French EXTENDED-CTC-FR profile (XP Z12-012 v1.4, guideline ID
  // `…urn.cpro.gouv.fr:1p0:extended-ctc-fr`): the "uncoupled" UN/CEFACT D22B XSD, which the FNFE-MPE
  // release says shall be used for CII (release notes p.9, step 1). Not a Factur-X hybrid profile:
  // it has no fx:ConformanceLevel and generate() refuses it (CG-18, validation part).
  'extended-ctc-fr': './xsd/facturx/extended-ctc-fr/CrossIndustryInvoice_100pD22B.xsd',
  'minimum': './xsd/facturx/minimum/Factur-X_1.09_MINIMUM.xsd',
} as const
// XP Z12-012 Annex A, BT-24 row (`annex-a--CII_D22B_FX_EXT-CTC-FR.csv`): the only guideline ID of the
// EXTENDED-CTC-FR profile. Matched exactly, since its dedicated Schematron does not check BT-24.
export const EXTENDED_CTC_FR_GUIDELINE_ID = 'urn:cen.eu:en16931:2017#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr'

// UBL 2.1 (OASIS) document namespaces, and the EN 16931 UBL syntax binding's CustomizationID (BT-24)
// values: `en16931` is the core ID (CIUS IDs start with it plus `#compliant#`); EXTENDED-CTC-FR is
// matched exactly (XP Z12-012 Annex A).
export const UBL_INVOICE_NS = 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2'
export const UBL_CREDITNOTE_NS = 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2'
export const UBL_CBC_NS = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2'
export const UBL_EN16931_CUSTOMIZATION_ID = 'urn:cen.eu:en16931:2017'
export const UBL_EXTENDED_CTC_FR_CUSTOMIZATION_ID = 'urn:cen.eu:en16931:2017#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr'
export const UBL_LEVELS = ['en16931', 'extended-ctc-fr'] as const
export type UBL_ROOT = 'Invoice' | 'CreditNote'
export const UBL_SCHEMA = {
  Invoice: './xsd/ubl/maindoc/UBL-Invoice-2.1.xsd',
  CreditNote: './xsd/ubl/maindoc/UBL-CreditNote-2.1.xsd',
} as const

export const FACTURX_CONFORMANCE_LEVEL = {
  basic: 'BASIC',
  basicwl: 'BASIC WL',
  en16931: 'EN 16931',
  extended: 'EXTENDED',
  minimum: 'MINIMUM',
} as const

// fx:ConformanceLevel of an Order-X hybrid (BR-HYBRID-07, `text/codelists--HybridConformance.csv`:
// BASIC, COMFORT and EXTENDED apply to Order-X).
export const ORDERX_CONFORMANCE_LEVEL = {
  basic: 'BASIC',
  comfort: 'COMFORT',
  extended: 'EXTENDED',
} as const

// fx:DocumentType of an Order-X hybrid by message type code (BR-HYBRID-06). The values are those of
// `text/codelists--HybridDocument.csv`, which gives no type-code mapping: the mapping and the
// restriction to these three codes follow the UNTDID 1001 names (the Order-X entries of DOC_TYPE
// below) and the Order-X specification, which is not vendored. The Order-X XSD itself allows any
// UNTDID 1001 code.
export const ORDERX_DOCUMENT_TYPE = {
  220: 'ORDER',
  230: 'ORDER_CHANGE',
  231: 'ORDER_RESPONSE',
} as const

export type ORDERX_SCHEMA_TYPE = keyof typeof ORDERX_SCHEMA
export const ORDERX_SCHEMA = {
  basic: './xsd/orderx/basic/SCRDMCCBDACIOMessageStructure_100pD20B.xsd',
  comfort: './xsd/orderx/comfort/SCRDMCCBDACIOMessageStructure_100pD20B.xsd',
  extended: './xsd/orderx/extended/SCRDMCCBDACIOMessageStructure_100pD20B.xsd',
} as const

export type DOC_TYPE_KEY = keyof typeof DOC_TYPE
/* eslint-disable style/quote-props */
export const DOC_TYPE = {
  // Order-X message types (UNTDID 1001)
  '220': 'Order',
  '230': 'Order Change',
  '231': 'Order Response',
  // Factur-X invoice / credit note types (UNTDID 1001, BT-3 subset used by Factur-X 1.09)
  '71': 'Request for payment',
  '80': 'Debit note related to goods or services',
  '81': 'Credit note related to goods or services',
  '82': 'Metered services invoice',
  '83': 'Credit note related to financial adjustments',
  '84': 'Debit note related to financial adjustments',
  '261': 'Self billed credit note',
  '262': 'Consolidated credit note - goods and services',
  '325': 'Proforma invoice',
  '326': 'Partial invoice',
  '380': 'Invoice',
  '381': 'Refund',
  '382': 'Commission note',
  '383': 'Debit note',
  '384': 'Corrected invoice',
  '385': 'Consolidated invoice',
  '386': 'Prepayment invoice',
  '387': 'Hire invoice',
  '388': 'Tax invoice',
  '389': 'Self-billed invoice',
  '393': 'Factored invoice',
  '395': 'Consignment invoice',
  '396': 'Factored credit note',
  '575': 'Forwarder\'s invoice',
  '623': 'Forwarder\'s invoice discrepancy report',
  '780': 'Freight invoice',
  '875': 'Partial construction invoice',
  '876': 'Partial final construction invoice',
  '877': 'Final construction invoice',
  '935': 'Customs invoice',
} as const
/* eslint-enable style/quote-props */
