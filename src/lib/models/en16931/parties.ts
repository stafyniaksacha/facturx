/**
 * The parties and delivery groups of the EN 16931 invoice: seller, buyer, payee, seller tax
 * representative, delivery information, and the EXTENDED-CTC-FR parties (agents, invoicee, payer,
 * billing party) and delivery terms.
 *
 * Identifiers: an `Identifier` without a scheme is a private identifier, one with a scheme is a
 * global one (ISO 6523, CII `GlobalID`). VAT (`BT-31` ...) and tax registration (`BT-32`) numbers are
 * plain strings: their scheme (`VA`, `FC`) is fixed by the term (Factur-X matrices, BT-31-0 / BT-32-0).
 */

import type { Contact, Identifier, PostalAddress } from './common'

/**
 * The seller.
 * @bg BG-4
 */
export class Seller {
  constructor({
    identifiers,
    name,
    tradingName,
    legalRegistrationIdentifier,
    additionalLegalInformation,
    electronicAddress,
    vatIdentifier,
    taxRegistrationIdentifier,
    address,
    contact,
  }: {
    identifiers?: Identifier[]
    name: string
    tradingName?: string
    legalRegistrationIdentifier?: Identifier
    additionalLegalInformation?: string
    electronicAddress?: Identifier
    vatIdentifier?: string
    taxRegistrationIdentifier?: string
    address: PostalAddress
    contact?: Contact
  }) {
    this.identifiers = identifiers ?? []
    this.name = name
    this.tradingName = tradingName
    this.legalRegistrationIdentifier = legalRegistrationIdentifier
    this.additionalLegalInformation = additionalLegalInformation
    this.electronicAddress = electronicAddress
    this.vatIdentifier = vatIdentifier
    this.taxRegistrationIdentifier = taxRegistrationIdentifier
    this.address = address
    this.contact = contact
  }

  /**
   * Seller identifiers: a private one without scheme (BT-29, CII `ID`), a global one with its ISO
   * 6523 scheme (BT-29-0 / BT-29-1, CII `GlobalID`). `0..n`.
   * @bt BT-29 BT-29-0 BT-29-1
   */
  identifiers: Identifier[]
  /**
   * Seller name. `fromCii()` yields `''` when the document has none; `toCii()` throws on `''`.
   * @bt BT-27
   */
  name: string
  /**
   * Seller trading name.
   * @bt BT-28
   */
  tradingName?: string
  /**
   * Seller legal registration identifier and its scheme (ISO 6523).
   * @bt BT-30 BT-30-1
   */
  legalRegistrationIdentifier?: Identifier
  /**
   * Seller additional legal information. Not in Factur-X BASIC.
   * @bt BT-33
   */
  additionalLegalInformation?: string
  /**
   * Seller electronic address and its scheme (Connecting Europe Facility list).
   * @bt BT-34 BT-34-1
   */
  electronicAddress?: Identifier
  /**
   * Seller VAT identifier (CII `SpecifiedTaxRegistration` with scheme `VA`).
   * @bt BT-31 BT-31-0
   */
  vatIdentifier?: string
  /**
   * Seller tax registration identifier (CII `SpecifiedTaxRegistration` with scheme `FC`). Not in
   * Factur-X BASIC.
   * @bt BT-32 BT-32-0
   */
  taxRegistrationIdentifier?: string
  /**
   * Seller postal address. `fromCii()` stands in an address with an empty country code when the
   * document has none; `toCii()` throws on it.
   * @bg BG-5
   */
  address: PostalAddress
  /**
   * Seller contact. Not in Factur-X BASIC.
   * @bg BG-6
   */
  contact?: Contact
}

/**
 * The buyer.
 * @bg BG-7
 */
export class Buyer {
  constructor({
    identifiers,
    name,
    tradingName,
    legalRegistrationIdentifier,
    electronicAddress,
    vatIdentifier,
    address,
    contact,
  }: {
    identifiers?: Identifier[]
    name: string
    tradingName?: string
    legalRegistrationIdentifier?: Identifier
    electronicAddress?: Identifier
    vatIdentifier?: string
    address: PostalAddress
    contact?: Contact
  }) {
    this.identifiers = identifiers ?? []
    this.name = name
    this.tradingName = tradingName
    this.legalRegistrationIdentifier = legalRegistrationIdentifier
    this.electronicAddress = electronicAddress
    this.vatIdentifier = vatIdentifier
    this.address = address
    this.contact = contact
  }

  /**
   * Buyer identifiers: a private one without scheme (BT-46, CII `ID`), a global one with its ISO
   * 6523 scheme (BT-46-0 / BT-46-1, CII `GlobalID`). `0..1` in EN 16931, `0..n` in EXTENDED-CTC-FR.
   * @bt BT-46 BT-46-0 BT-46-1
   */
  identifiers: Identifier[]
  /**
   * Buyer name. `fromCii()` yields `''` when the document has none; `toCii()` throws on `''`.
   * @bt BT-44
   */
  name: string
  /**
   * Buyer trading name. Not in Factur-X BASIC.
   * @bt BT-45
   */
  tradingName?: string
  /**
   * Buyer legal registration identifier and its scheme (ISO 6523).
   * @bt BT-47 BT-47-1
   */
  legalRegistrationIdentifier?: Identifier
  /**
   * Buyer electronic address and its scheme (Connecting Europe Facility list).
   * @bt BT-49 BT-49-1
   */
  electronicAddress?: Identifier
  /**
   * Buyer VAT identifier (CII `SpecifiedTaxRegistration` with scheme `VA`).
   * @bt BT-48 BT-48-0
   */
  vatIdentifier?: string
  /**
   * Buyer postal address. `fromCii()` stands in an address with an empty country code when the
   * document has none; `toCii()` throws on it.
   * @bg BG-8
   */
  address: PostalAddress
  /**
   * Buyer contact. Not in Factur-X BASIC.
   * @bg BG-9
   */
  contact?: Contact
}

/**
 * A party that is not the seller or the buyer, and has the same data in every role: the payee
 * (BG-10, with its EXTENDED-CTC-FR additions) and the EXTENDED-CTC-FR agents, invoicee, payer and
 * billing party. It is the base of `Payee`, `SellerAgent`, `BuyerAgent`, `Invoicee`, `Payer` and
 * `BillingParty`; each property lists the term it holds in every role.
 *
 * Mapping: the payee (BG-10) holds private (`ID`) and global (`GlobalID`) identifiers like the
 * seller; the other roles hold every identifier as a `GlobalID` (Factur-X EXTENDED matrix), with an
 * optional scheme. The group ids are on the subclasses.
 */
export class AdditionalParty {
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
   * Identifiers with their scheme: payee BT-60 / BT-60-0 / BT-60-1; buyer agent EXT-FR-FE-06 / -07;
   * payer -46 / -47; seller agent -69 / -70; invoicee -92 / -92-1; billing party -115 / -116.
   * @bt BT-60 BT-60-0 BT-60-1
   * @ext EXT-FR-FE-06 EXT-FR-FE-07 EXT-FR-FE-46 EXT-FR-FE-47 EXT-FR-FE-69 EXT-FR-FE-70 EXT-FR-FE-92 EXT-FR-FE-92-1 EXT-FR-FE-115 EXT-FR-FE-116
   */
  identifiers: Identifier[]
  /**
   * Name: payee BT-59; buyer agent EXT-FR-FE-03; payer -43; seller agent -66; invoicee -89; billing
   * party -112. `fromCii()` yields `''` when the document has none; `toCii()` throws on `''`.
   * @bt BT-59
   * @ext EXT-FR-FE-03 EXT-FR-FE-43 EXT-FR-FE-66 EXT-FR-FE-89 EXT-FR-FE-112
   */
  name: string
  /**
   * Role code (CII `RoleCode`): payee EXT-FR-FE-26; buyer agent -04; payer -44; seller agent -67;
   * invoicee -90; billing party -113.
   * @ext EXT-FR-FE-04 EXT-FR-FE-26 EXT-FR-FE-44 EXT-FR-FE-67 EXT-FR-FE-90 EXT-FR-FE-113
   */
  roleCode?: string
  /**
   * Trading name: buyer agent EXT-FR-FE-05; payer -45; seller agent -68; invoicee -91; billing party
   * -114. The payee has none.
   * @ext EXT-FR-FE-05 EXT-FR-FE-45 EXT-FR-FE-68 EXT-FR-FE-91 EXT-FR-FE-114
   */
  tradingName?: string
  /**
   * Legal registration identifier and its scheme: payee BT-61 / BT-61-1; buyer agent EXT-FR-FE-08 /
   * -09; payer -48 / -49; seller agent -71 / -72; invoicee -94 / -95; billing party -117 / -118.
   * @bt BT-61 BT-61-1
   * @ext EXT-FR-FE-08 EXT-FR-FE-09 EXT-FR-FE-48 EXT-FR-FE-49 EXT-FR-FE-71 EXT-FR-FE-72 EXT-FR-FE-94 EXT-FR-FE-95 EXT-FR-FE-117 EXT-FR-FE-118
   */
  legalRegistrationIdentifier?: Identifier
  /**
   * Electronic address and its scheme: payee EXT-FR-FE-29 / -30; buyer agent -12 / -13; payer -52 /
   * -53; seller agent -75 / -76; invoicee -98 / -99; billing party -121 / -122.
   * @ext EXT-FR-FE-12 EXT-FR-FE-13 EXT-FR-FE-29 EXT-FR-FE-30 EXT-FR-FE-52 EXT-FR-FE-53 EXT-FR-FE-75 EXT-FR-FE-76 EXT-FR-FE-98 EXT-FR-FE-99 EXT-FR-FE-121 EXT-FR-FE-122
   */
  electronicAddress?: Identifier
  /**
   * VAT identifier (CII `SpecifiedTaxRegistration` with scheme `VA`): payee EXT-FR-FE-27 / -28;
   * buyer agent -10 / -11; payer -50 / -51; seller agent -73 / -74; invoicee -96 / -97; billing
   * party -119 / -120.
   * @ext EXT-FR-FE-10 EXT-FR-FE-11 EXT-FR-FE-27 EXT-FR-FE-28 EXT-FR-FE-50 EXT-FR-FE-51 EXT-FR-FE-73 EXT-FR-FE-74 EXT-FR-FE-96 EXT-FR-FE-97 EXT-FR-FE-119 EXT-FR-FE-120
   */
  vatIdentifier?: string
  /**
   * Postal address: payee EXT-FR-FE-31; buyer agent -14; payer -54; seller agent -77; invoicee -100;
   * billing party -123.
   * @ext EXT-FR-FE-14 EXT-FR-FE-31 EXT-FR-FE-54 EXT-FR-FE-77 EXT-FR-FE-100 EXT-FR-FE-123
   */
  address?: PostalAddress
  /**
   * Contact: payee EXT-FR-FE-39; buyer agent -22; payer -62; seller agent -85; invoicee -108;
   * billing party -131.
   * @ext EXT-FR-FE-22 EXT-FR-FE-39 EXT-FR-FE-62 EXT-FR-FE-85 EXT-FR-FE-108 EXT-FR-FE-131
   */
  contact?: Contact
}

/**
 * The payee, when different from the seller. Its name, identifiers and legal registration
 * identifier are EN 16931 (BT-59, BT-60, BT-61); the rest is EXTENDED-CTC-FR.
 * @bg BG-10
 */
export class Payee extends AdditionalParty {}

/**
 * The seller's agent (CII `SalesAgentTradeParty`), e.g. a validating third party. EXTENDED-CTC-FR.
 * @ext EXT-FR-FE-BG-03
 */
export class SellerAgent extends AdditionalParty {}

/**
 * The buyer's agent (CII `BuyerAgentTradeParty`), e.g. a media agency. EXTENDED-CTC-FR.
 * @ext EXT-FR-FE-BG-01
 */
export class BuyerAgent extends AdditionalParty {}

/**
 * The party the invoice is addressed to (CII `InvoiceeTradeParty`, "adressée à"). EXTENDED-CTC-FR.
 * @ext EXT-FR-FE-BG-04
 */
export class Invoicee extends AdditionalParty {}

/**
 * The payer of the invoice, when different from the buyer (CII `PayerTradeParty`). EXTENDED-CTC-FR.
 * @ext EXT-FR-FE-BG-02
 */
export class Payer extends AdditionalParty {}

/**
 * The billing party (CII `InvoicerTradeParty`, "tiers facturant" / service facturier).
 * EXTENDED-CTC-FR.
 * @ext EXT-FR-FE-BG-05
 */
export class BillingParty extends AdditionalParty {}

/**
 * The seller tax representative.
 * @bg BG-11
 */
export class SellerTaxRepresentative {
  constructor({ name, address, vatIdentifier }: { name: string, address: PostalAddress, vatIdentifier: string }) {
    this.name = name
    this.address = address
    this.vatIdentifier = vatIdentifier
  }

  /**
   * Seller tax representative name. `fromCii()` yields `''` when the document has none; `toCii()`
   * throws on `''`.
   * @bt BT-62
   */
  name: string
  /**
   * Seller tax representative postal address. `fromCii()` stands in an address with an empty
   * country code when the document has none; `toCii()` throws on it.
   * @bg BG-12
   */
  address: PostalAddress
  /**
   * Seller tax representative VAT identifier (CII `SpecifiedTaxRegistration` with scheme `VA`).
   * `fromCii()` yields `''` when the document has none; `toCii()` throws on `''`.
   * @bt BT-63 BT-63-0
   */
  vatIdentifier: string
}

/**
 * Delivery information. Only the first delivery of the document is held: CII has one header
 * delivery, and UBL's `0..n` `cac:Delivery` of EXTENDED-CTC-FR is per line.
 * @bg BG-13
 */
export class Delivery {
  constructor({
    name,
    locationIdentifier,
    address,
    actualDeliveryDate,
  }: {
    name?: string
    locationIdentifier?: Identifier
    address?: PostalAddress
    actualDeliveryDate?: string
  }) {
    this.name = name
    this.locationIdentifier = locationIdentifier
    this.address = address
    this.actualDeliveryDate = actualDeliveryDate
  }

  /**
   * Deliver to party name.
   * @bt BT-70
   */
  name?: string
  /**
   * Deliver to location identifier: private without scheme (CII `ID`), global with its scheme
   * (BT-71-0 / BT-71-1, CII `GlobalID`; UNTDID 3035 or ISO 6523).
   * @bt BT-71 BT-71-0 BT-71-1
   */
  locationIdentifier?: Identifier
  /**
   * Deliver to address.
   * @bg BG-15
   */
  address?: PostalAddress
  /**
   * Actual delivery date (ISO `YYYY-MM-DD`); CII writes it with format `102` (BT-72-0). A CII date
   * in another format is not converted and is reported in `dropped`.
   * @bt BT-72 BT-72-0
   */
  actualDeliveryDate?: string
}

/**
 * Delivery terms (Incoterms) of the document. EXTENDED-CTC-FR.
 * @ext EXT-FR-FE-BG-14
 */
export class DeliveryTerms {
  constructor({ deliveryTypeCode, locationName }: { deliveryTypeCode: string, locationName?: string }) {
    this.deliveryTypeCode = deliveryTypeCode
    this.locationName = locationName
  }

  /**
   * Delivery type code (Incoterms). `fromCii()` yields `''` when the document has none; `toCii()`
   * throws on `''`.
   * @ext EXT-FR-FE-185
   */
  deliveryTypeCode: string
  /**
   * Name of the location for the delivery terms (CII `RelevantTradeLocation/Name`).
   * @ext EXT-FR-FE-186 EXT-FR-FE-186-00
   */
  locationName?: string
}
