export const FACTURX_FILENAME = 'factur-x.xml'
export const ZUGFERD_FILENAMES = ['zugferd-invoice.xml', 'ZUGFeRD-invoice.xml']
export const ORDERX_FILENAME = 'order-x.xml'

export type FACTURX_SCHEMA_TYPE = keyof typeof FACTURX_SCHEMA
export const FACTURX_SCHEMA = {
  'basic': './xsd/facturx/basic/FACTUR-X_BASIC.xsd',
  'basic-wl': './xsd/facturx/basic-wl/FACTUR-X_BASIC-WL.xsd',
  'en16931': './xsd/facturx/en16931/FACTUR-X_EN16931.xsd',
  'extended': './xsd/facturx/extended/FACTUR-X_EXTENDED.xsd',
  'minimum': './xsd/facturx/minimum/FACTUR-X_MINIMUM.xsd',
} as const
export const FACTURX_CONFORMANCE_LEVEL = {
  'basic': 'BASIC',
  'basic-wl': 'BASIC WL',
  'en16931': 'EN 16931',
  'extended': 'EXTENDED',
  'minimum': 'MINIMUM',
} as const

export type ORDERX_SCHEMA_TYPE = keyof typeof ORDERX_SCHEMA
export const ORDERX_SCHEMA = {
  'basic': './xsd/orderx/basic/SCRDMCCBDACIOMessageStructure_100pD20B.xsd',
  'comfort': './xsd/orderx/comfort/SCRDMCCBDACIOMessageStructure_100pD20B.xsd',
  'extended': './xsd/orderx/extended/SCRDMCCBDACIOMessageStructure_100pD20B.xsd',
} as const

export type DOC_TYPE_KEY = keyof typeof DOC_TYPE
export const DOC_TYPE = {
  '220': 'Order',
  '230': 'Order Change',
  '231': 'Order Response',
  '380': 'Invoice',
  '381': 'Refund',
} as const
