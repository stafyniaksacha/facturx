export const FACTURX_FILENAME = 'factur-x.xml'
export const ZUGFERD_FILENAMES = ['zugferd-invoice.xml', 'ZUGFeRD-invoice.xml']
export const ORDERX_FILENAME = 'order-x.xml'

export type FACTURX_SCHEMA_TYPE = keyof typeof FACTURX_SCHEMA
export const FACTURX_SCHEMA = {
  basic: './xsd/facturx/basic/Factur-X_1.09_BASIC.xsd',
  basicwl: './xsd/facturx/basicwl/Factur-X_1.09_BASICWL.xsd',
  en16931: './xsd/facturx/en16931/Factur-X_1.09_EN16931.xsd',
  extended: './xsd/facturx/extended/Factur-X_1.09_EXTENDED.xsd',
  minimum: './xsd/facturx/minimum/Factur-X_1.09_MINIMUM.xsd',
} as const
export const FACTURX_CONFORMANCE_LEVEL = {
  basic: 'BASIC',
  basicwl: 'BASIC WL',
  en16931: 'EN 16931',
  extended: 'EXTENDED',
  minimum: 'MINIMUM',
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
