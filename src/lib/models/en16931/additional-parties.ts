/**
 * The per-role additional parties of the EN 16931 invoice and of XP Z12-012 EXTENDED-CTC-FR: the payee
 * (BG-10) and the EXTENDED-CTC-FR parties (the buyer's and seller's agents, the payer, the invoicee and
 * the billing party). Split from `parties.ts` to keep that file readable; the model index re-exports
 * every class unchanged.
 *
 * Same identifier conventions as `parties.ts`: an `Identifier` without a scheme is a private identifier,
 * one with a scheme a global one (ISO 6523, CII `GlobalID`).
 */

import type { Contact, Identifier, PostalAddress } from './common'

/**
 * The payee, when different from the seller. Its name, identifiers and legal registration identifier are EN 16931 (BT-59, BT-60, BT-61); the rest is EXTENDED-CTC-FR.
 *
 * The EXTENDED matrix also has a payee trading name (BT-X-243). It has neither an EN 16931 nor an
 * EXT-FR-FE id, so it stays outside the model: `fromCii()` reports it in `dropped`.
 * @bg BG-10
 */
export class Payee {
  constructor({
    identifiers,
    name,
    roleCode,
    legalRegistrationIdentifier,
    electronicAddress,
    vatIdentifier,
    address,
    contact,
  }: {
    identifiers?: Identifier[]
    name: string
    roleCode?: string
    legalRegistrationIdentifier?: Identifier
    electronicAddress?: Identifier
    vatIdentifier?: string
    address?: PostalAddress
    contact?: Contact
  }) {
    this.identifiers = identifiers ?? []
    this.name = name
    this.roleCode = roleCode
    this.legalRegistrationIdentifier = legalRegistrationIdentifier
    this.electronicAddress = electronicAddress
    this.vatIdentifier = vatIdentifier
    this.address = address
    this.contact = contact
  }

  /**
   * Payee identifiers: a private one without scheme (BT-60, CII `ID`), a global one with its scheme (BT-60-0 / BT-60-1, CII `GlobalID`).
   * @bt BT-60 BT-60-0 BT-60-1
   */
  identifiers: Identifier[]

  /**
   * Payee name. `fromCii()` yields `''` when the document has none; `toCii()` throws on `''`.
   * @bt BT-59
   */
  name: string

  /**
   * Payee role code (CII `RoleCode`). EXTENDED-CTC-FR.
   * @ext EXT-FR-FE-26
   */
  roleCode?: string

  /**
   * Payee legal registration identifier and its scheme (ISO 6523).
   * @bt BT-61 BT-61-1
   */
  legalRegistrationIdentifier?: Identifier

  /**
   * Payee electronic address and its scheme (`toCii()` throws without the scheme: EXT-FR-FE-30 is `1..1`). EXTENDED-CTC-FR.
   * @ext EXT-FR-FE-29 EXT-FR-FE-30
   */
  electronicAddress?: Identifier

  /**
   * Payee VAT identifier (CII `SpecifiedTaxRegistration` with scheme `VA`). EXTENDED-CTC-FR.
   * @ext EXT-FR-FE-27 EXT-FR-FE-28
   */
  vatIdentifier?: string

  /**
   * Payee postal address. EXTENDED-CTC-FR.
   * @ext EXT-FR-FE-31
   */
  address?: PostalAddress

  /**
   * Payee contact. EXTENDED-CTC-FR.
   * @ext EXT-FR-FE-39
   */
  contact?: Contact
}

/**
 * The buyer's agent (CII `BuyerAgentTradeParty`), e.g. a media agency. EXTENDED-CTC-FR.
 * @ext EXT-FR-FE-BG-01
 */
export class BuyerAgent {
  constructor({
    identifiers,
    name,
    roleCode,
    tradingName,
    legalRegistrationIdentifier,
    electronicAddress,
    vatIdentifier,
    address,
    contact,
  }: {
    identifiers?: Identifier[]
    name: string
    roleCode?: string
    tradingName?: string
    legalRegistrationIdentifier?: Identifier
    electronicAddress?: Identifier
    vatIdentifier?: string
    address?: PostalAddress
    contact?: Contact
  }) {
    this.identifiers = identifiers ?? []
    this.name = name
    this.roleCode = roleCode
    this.tradingName = tradingName
    this.legalRegistrationIdentifier = legalRegistrationIdentifier
    this.electronicAddress = electronicAddress
    this.vatIdentifier = vatIdentifier
    this.address = address
    this.contact = contact
  }

  /**
   * Identifiers, each a CII `GlobalID`; `toCii()` throws on one without its scheme (`1..1`).
   * @ext EXT-FR-FE-06 EXT-FR-FE-07
   */
  identifiers: Identifier[]

  /**
   * Name. `fromCii()` yields `''` when the document has none; `toCii()` throws on `''`.
   * @ext EXT-FR-FE-03
   */
  name: string

  /**
   * Role code (CII `RoleCode`).
   * @ext EXT-FR-FE-04
   */
  roleCode?: string

  /**
   * Trading name.
   * @ext EXT-FR-FE-05
   */
  tradingName?: string

  /**
   * Legal registration identifier and its scheme (ISO 6523).
   * @ext EXT-FR-FE-08 EXT-FR-FE-09
   */
  legalRegistrationIdentifier?: Identifier

  /**
   * Electronic address and its scheme (`toCii()` throws without the scheme: `1..1`).
   * @ext EXT-FR-FE-12 EXT-FR-FE-13
   */
  electronicAddress?: Identifier

  /**
   * VAT identifier (CII `SpecifiedTaxRegistration` with scheme `VA`).
   * @ext EXT-FR-FE-10 EXT-FR-FE-11
   */
  vatIdentifier?: string

  /**
   * Postal address.
   * @ext EXT-FR-FE-14
   */
  address?: PostalAddress

  /**
   * Contact.
   * @ext EXT-FR-FE-22
   */
  contact?: Contact
}

/**
 * The payer of the invoice, when different from the buyer (CII `PayerTradeParty`). EXTENDED-CTC-FR.
 * @ext EXT-FR-FE-BG-02
 */
export class Payer {
  constructor({
    identifiers,
    name,
    roleCode,
    tradingName,
    legalRegistrationIdentifier,
    electronicAddress,
    vatIdentifier,
    address,
    contact,
  }: {
    identifiers?: Identifier[]
    name: string
    roleCode?: string
    tradingName?: string
    legalRegistrationIdentifier?: Identifier
    electronicAddress?: Identifier
    vatIdentifier?: string
    address?: PostalAddress
    contact?: Contact
  }) {
    this.identifiers = identifiers ?? []
    this.name = name
    this.roleCode = roleCode
    this.tradingName = tradingName
    this.legalRegistrationIdentifier = legalRegistrationIdentifier
    this.electronicAddress = electronicAddress
    this.vatIdentifier = vatIdentifier
    this.address = address
    this.contact = contact
  }

  /**
   * Identifiers, each a CII `GlobalID`; `toCii()` throws on one without its scheme (`1..1`).
   * @ext EXT-FR-FE-46 EXT-FR-FE-47
   */
  identifiers: Identifier[]

  /**
   * Name. `fromCii()` yields `''` when the document has none; `toCii()` throws on `''`.
   * @ext EXT-FR-FE-43
   */
  name: string

  /**
   * Role code (CII `RoleCode`).
   * @ext EXT-FR-FE-44
   */
  roleCode?: string

  /**
   * Trading name.
   * @ext EXT-FR-FE-45
   */
  tradingName?: string

  /**
   * Legal registration identifier and its scheme (ISO 6523).
   * @ext EXT-FR-FE-48 EXT-FR-FE-49
   */
  legalRegistrationIdentifier?: Identifier

  /**
   * Electronic address and its scheme (`toCii()` throws without the scheme: `1..1`).
   * @ext EXT-FR-FE-52 EXT-FR-FE-53
   */
  electronicAddress?: Identifier

  /**
   * VAT identifier (CII `SpecifiedTaxRegistration` with scheme `VA`).
   * @ext EXT-FR-FE-50 EXT-FR-FE-51
   */
  vatIdentifier?: string

  /**
   * Postal address.
   * @ext EXT-FR-FE-54
   */
  address?: PostalAddress

  /**
   * Contact.
   * @ext EXT-FR-FE-62
   */
  contact?: Contact
}

/**
 * The seller's agent (CII `SalesAgentTradeParty`), e.g. a validating third party. EXTENDED-CTC-FR.
 * @ext EXT-FR-FE-BG-03
 */
export class SellerAgent {
  constructor({
    identifiers,
    name,
    roleCode,
    tradingName,
    legalRegistrationIdentifier,
    electronicAddress,
    vatIdentifier,
    address,
    contact,
  }: {
    identifiers?: Identifier[]
    name: string
    roleCode?: string
    tradingName?: string
    legalRegistrationIdentifier?: Identifier
    electronicAddress?: Identifier
    vatIdentifier?: string
    address?: PostalAddress
    contact?: Contact
  }) {
    this.identifiers = identifiers ?? []
    this.name = name
    this.roleCode = roleCode
    this.tradingName = tradingName
    this.legalRegistrationIdentifier = legalRegistrationIdentifier
    this.electronicAddress = electronicAddress
    this.vatIdentifier = vatIdentifier
    this.address = address
    this.contact = contact
  }

  /**
   * Identifiers, each a CII `GlobalID`; `toCii()` throws on one without its scheme (`1..1`).
   * @ext EXT-FR-FE-69 EXT-FR-FE-70
   */
  identifiers: Identifier[]

  /**
   * Name. `fromCii()` yields `''` when the document has none; `toCii()` throws on `''`.
   * @ext EXT-FR-FE-66
   */
  name: string

  /**
   * Role code (CII `RoleCode`).
   * @ext EXT-FR-FE-67
   */
  roleCode?: string

  /**
   * Trading name.
   * @ext EXT-FR-FE-68
   */
  tradingName?: string

  /**
   * Legal registration identifier and its scheme (ISO 6523).
   * @ext EXT-FR-FE-71 EXT-FR-FE-72
   */
  legalRegistrationIdentifier?: Identifier

  /**
   * Electronic address and its scheme (`toCii()` throws without the scheme: `1..1`).
   * @ext EXT-FR-FE-75 EXT-FR-FE-76
   */
  electronicAddress?: Identifier

  /**
   * VAT identifier (CII `SpecifiedTaxRegistration` with scheme `VA`).
   * @ext EXT-FR-FE-73 EXT-FR-FE-74
   */
  vatIdentifier?: string

  /**
   * Postal address.
   * @ext EXT-FR-FE-77
   */
  address?: PostalAddress

  /**
   * Contact.
   * @ext EXT-FR-FE-85
   */
  contact?: Contact
}

/**
 * The party the invoice is addressed to (CII `InvoiceeTradeParty`, "adressée à"). EXTENDED-CTC-FR.
 * @ext EXT-FR-FE-BG-04
 */
export class Invoicee {
  constructor({
    identifiers,
    name,
    roleCode,
    tradingName,
    legalRegistrationIdentifier,
    electronicAddress,
    vatIdentifier,
    address,
    contact,
  }: {
    identifiers?: Identifier[]
    name: string
    roleCode?: string
    tradingName?: string
    legalRegistrationIdentifier?: Identifier
    electronicAddress?: Identifier
    vatIdentifier?: string
    address?: PostalAddress
    contact?: Contact
  }) {
    this.identifiers = identifiers ?? []
    this.name = name
    this.roleCode = roleCode
    this.tradingName = tradingName
    this.legalRegistrationIdentifier = legalRegistrationIdentifier
    this.electronicAddress = electronicAddress
    this.vatIdentifier = vatIdentifier
    this.address = address
    this.contact = contact
  }

  /**
   * Identifiers, each a CII `GlobalID`; `toCii()` throws on one without its scheme (`1..1`).
   * @ext EXT-FR-FE-92 EXT-FR-FE-92-1
   */
  identifiers: Identifier[]

  /**
   * Name. `fromCii()` yields `''` when the document has none; `toCii()` throws on `''`.
   * @ext EXT-FR-FE-89
   */
  name: string

  /**
   * Role code (CII `RoleCode`).
   * @ext EXT-FR-FE-90
   */
  roleCode?: string

  /**
   * Trading name.
   * @ext EXT-FR-FE-91
   */
  tradingName?: string

  /**
   * Legal registration identifier and its scheme (ISO 6523).
   * @ext EXT-FR-FE-94 EXT-FR-FE-95
   */
  legalRegistrationIdentifier?: Identifier

  /**
   * Electronic address and its scheme (`toCii()` throws without the scheme: `1..1`).
   * @ext EXT-FR-FE-98 EXT-FR-FE-99
   */
  electronicAddress?: Identifier

  /**
   * VAT identifier (CII `SpecifiedTaxRegistration` with scheme `VA`).
   * @ext EXT-FR-FE-96 EXT-FR-FE-97
   */
  vatIdentifier?: string

  /**
   * Postal address.
   * @ext EXT-FR-FE-100
   */
  address?: PostalAddress

  /**
   * Contact.
   * @ext EXT-FR-FE-108
   */
  contact?: Contact
}

/**
 * The billing party (CII `InvoicerTradeParty`, "tiers facturant" / service facturier). EXTENDED-CTC-FR.
 * @ext EXT-FR-FE-BG-05
 */
export class BillingParty {
  constructor({
    identifiers,
    name,
    roleCode,
    tradingName,
    legalRegistrationIdentifier,
    electronicAddress,
    vatIdentifier,
    address,
    contact,
  }: {
    identifiers?: Identifier[]
    name: string
    roleCode?: string
    tradingName?: string
    legalRegistrationIdentifier?: Identifier
    electronicAddress?: Identifier
    vatIdentifier?: string
    address?: PostalAddress
    contact?: Contact
  }) {
    this.identifiers = identifiers ?? []
    this.name = name
    this.roleCode = roleCode
    this.tradingName = tradingName
    this.legalRegistrationIdentifier = legalRegistrationIdentifier
    this.electronicAddress = electronicAddress
    this.vatIdentifier = vatIdentifier
    this.address = address
    this.contact = contact
  }

  /**
   * Identifiers, each a CII `GlobalID`; `toCii()` throws on one without its scheme (`1..1`).
   * @ext EXT-FR-FE-115 EXT-FR-FE-116
   */
  identifiers: Identifier[]

  /**
   * Name. `fromCii()` yields `''` when the document has none; `toCii()` throws on `''`.
   * @ext EXT-FR-FE-112
   */
  name: string

  /**
   * Role code (CII `RoleCode`).
   * @ext EXT-FR-FE-113
   */
  roleCode?: string

  /**
   * Trading name.
   * @ext EXT-FR-FE-114
   */
  tradingName?: string

  /**
   * Legal registration identifier and its scheme (ISO 6523).
   * @ext EXT-FR-FE-117 EXT-FR-FE-118
   */
  legalRegistrationIdentifier?: Identifier

  /**
   * Electronic address and its scheme (`toCii()` throws without the scheme: `1..1`).
   * @ext EXT-FR-FE-121 EXT-FR-FE-122
   */
  electronicAddress?: Identifier

  /**
   * VAT identifier (CII `SpecifiedTaxRegistration` with scheme `VA`).
   * @ext EXT-FR-FE-119 EXT-FR-FE-120
   */
  vatIdentifier?: string

  /**
   * Postal address.
   * @ext EXT-FR-FE-123
   */
  address?: PostalAddress

  /**
   * Contact.
   * @ext EXT-FR-FE-131
   */
  contact?: Contact
}
