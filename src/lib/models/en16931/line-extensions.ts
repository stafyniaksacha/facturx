/**
 * The EXTENDED-CTC-FR groups of an invoice line (XP Z12-012 annex A, `EXT-FR-FE-BG-06` ... `-BG-15`).
 *
 * Their placement in CII comes from the Factur-X EXTENDED matrix, never from the annex A CII rows that
 * CG-39 lists as shifted. Fields the CII element allows without an EN 16931 / EXT-FR-FE counterpart
 * (role codes, contacts, faxes ...) have no property here: `fromCii()` reports them in `dropped`.
 */

import type { Identifier, PostalAddress } from './common'

/**
 * Reference of the line to a preceding invoice (and its line). EXTENDED-CTC-FR. CII holds one per line.
 * @ext EXT-FR-FE-BG-06
 */
export class LinePrecedingInvoiceReference {
  constructor({ reference, lineReference, typeCode, issueDate }: { reference?: string, lineReference?: string, typeCode?: string, issueDate?: string }) {
    this.reference = reference
    this.lineReference = lineReference
    this.typeCode = typeCode
    this.issueDate = issueDate
  }

  /**
   * Preceding invoice reference.
   * @ext EXT-FR-FE-136
   */
  reference?: string
  /**
   * Preceding invoice line identifier.
   * @ext EXT-FR-FE-139
   */
  lineReference?: string
  /**
   * Preceding invoice type code (UNTDID 1001).
   * @ext EXT-FR-FE-137
   */
  typeCode?: string
  /**
   * Preceding invoice issue date (ISO `YYYY-MM-DD`).
   * @ext EXT-FR-FE-138 EXT-FR-FE-138-1
   */
  issueDate?: string
}

/**
 * Despatch advice (and its line) the invoice line refers to. EXTENDED-CTC-FR.
 * @ext EXT-FR-FE-BG-07
 */
export class LineDespatchAdviceReference {
  constructor({ reference, lineReference, issueDate }: { reference?: string, lineReference?: string, issueDate?: string }) {
    this.reference = reference
    this.lineReference = lineReference
    this.issueDate = issueDate
  }

  /**
   * Despatch advice reference.
   * @ext EXT-FR-FE-140
   */
  reference?: string
  /**
   * Despatch advice line identifier.
   * @ext EXT-FR-FE-141
   */
  lineReference?: string
  /**
   * Despatch advice issue date (ISO `YYYY-MM-DD`).
   * @ext EXT-FR-FE-201 EXT-FR-FE-201-1
   */
  issueDate?: string
}

/**
 * Receiving advice (and its line) the invoice line refers to. EXTENDED-CTC-FR.
 * @ext EXT-FR-FE-BG-08
 */
export class LineReceivingAdviceReference {
  constructor({ reference, lineReference }: { reference?: string, lineReference?: string }) {
    this.reference = reference
    this.lineReference = lineReference
  }

  /**
   * Receiving advice reference.
   * @ext EXT-FR-FE-142
   */
  reference?: string
  /**
   * Receiving advice line identifier.
   * @ext EXT-FR-FE-143
   */
  lineReference?: string
}

/**
 * Sales order (and its line) the invoice line refers to. EXTENDED-CTC-FR.
 * @ext EXT-FR-FE-BG-09
 */
export class LineSellerOrderReference {
  constructor({ orderReference, orderLineReference }: { orderReference?: string, orderLineReference?: string }) {
    this.orderReference = orderReference
    this.orderLineReference = orderLineReference
  }

  /**
   * Sales order reference.
   * @ext EXT-FR-FE-144
   */
  orderReference?: string
  /**
   * Sales order line identifier.
   * @ext EXT-FR-FE-145
   */
  orderLineReference?: string
}

/**
 * Deliver-to party of an invoice line, when it differs from the header's. EXTENDED-CTC-FR.
 * The address is the shared `PostalAddress` (EXT-FR-FE-150, fields -151 ... -157).
 * @ext EXT-FR-FE-BG-10
 */
export class LineDeliverTo {
  constructor({ identifiers, name, address }: { identifiers?: Identifier[], name?: string, address?: PostalAddress }) {
    this.identifiers = identifiers ?? []
    this.name = name
    this.address = address
  }

  /**
   * Global identifiers of the delivery location, each with its scheme (`schemeId`: CII makes it
   * mandatory, `toCii()` throws on a missing one). The CII `ShipToTradeParty/ID` without scheme
   * (matrix BT-186-00) has no EXT-FR-FE id: it is reported in `dropped`.
   * @bt BT-186 BT-186-1
   * @ext EXT-FR-FE-146 EXT-FR-FE-148
   */
  identifiers: Identifier[]
  /**
   * Name of the delivery location.
   * @ext EXT-FR-FE-149
   */
  name?: string
  /**
   * Postal address of the delivery location.
   * @ext EXT-FR-FE-150
   */
  address?: PostalAddress
}

/**
 * Actual delivery of an invoice line. EXTENDED-CTC-FR.
 * @ext EXT-FR-FE-BG-11
 */
export class LineActualDelivery {
  constructor({ actualDeliveryDate }: { actualDeliveryDate: string }) {
    this.actualDeliveryDate = actualDeliveryDate
  }

  /**
   * Actual delivery date of the line (ISO `YYYY-MM-DD`). `fromCii()` yields `''` when the CII date is
   * not a format-102 date (the value is then in `dropped`); `toCii()` throws on `''`.
   * @ext EXT-FR-FE-158 EXT-FR-FE-158-0 EXT-FR-FE-158-1
   */
  actualDeliveryDate: string
}

/**
 * Seller of an invoice line, for multi-vendor invoices. EXTENDED-CTC-FR. CII `ItemSellerTradeParty`.
 * The postal address is the shared `PostalAddress` (EXT-FR-FE-BG-13, fields -171 ... -177). The
 * CII identifiers without scheme (matrix BT-X-567), role code, contacts, faxes and legal addresses
 * have no EXT-FR-FE id: they are reported in `dropped`.
 * @ext EXT-FR-FE-BG-12
 */
export class LineSeller {
  constructor({
    identifiers,
    name,
    tradingName,
    legalRegistrationIdentifier,
    electronicAddress,
    vatIdentifier,
    taxRegistrationIdentifier,
    address,
  }: {
    identifiers?: Identifier[]
    name?: string
    tradingName?: string
    legalRegistrationIdentifier?: Identifier
    electronicAddress?: Identifier
    vatIdentifier?: string
    taxRegistrationIdentifier?: string
    address?: PostalAddress
  }) {
    this.identifiers = identifiers ?? []
    this.name = name
    this.tradingName = tradingName
    this.legalRegistrationIdentifier = legalRegistrationIdentifier
    this.electronicAddress = electronicAddress
    this.vatIdentifier = vatIdentifier
    this.taxRegistrationIdentifier = taxRegistrationIdentifier
    this.address = address
  }

  /**
   * Global identifiers of the seller, each with its scheme (`schemeId`: CII makes it mandatory,
   * `toCii()` throws on a missing one).
   * @ext EXT-FR-FE-166 EXT-FR-FE-166-1
   */
  identifiers: Identifier[]
  /**
   * Seller name.
   * @ext EXT-FR-FE-164
   */
  name?: string
  /**
   * Seller trading name.
   * @ext EXT-FR-FE-165
   */
  tradingName?: string
  /**
   * Seller legal registration identifier (SIREN), with its scheme.
   * @ext EXT-FR-FE-167 EXT-FR-FE-167-1
   */
  legalRegistrationIdentifier?: Identifier
  /**
   * Seller electronic address, with its scheme (`schemeId`: CII makes it mandatory, `toCii()`
   * throws on a missing one).
   * @ext EXT-FR-FE-170 EXT-FR-FE-170-1
   */
  electronicAddress?: Identifier
  /**
   * Seller VAT identifier (CII `SpecifiedTaxRegistration/ID` with `@schemeID="VA"`).
   * @ext EXT-FR-FE-168 EXT-FR-FE-168-1
   */
  vatIdentifier?: string
  /**
   * Seller tax registration identifier (CII `SpecifiedTaxRegistration/ID` with `@schemeID="FC"`).
   * @ext EXT-FR-FE-169 EXT-FR-FE-169-1
   */
  taxRegistrationIdentifier?: string
  /**
   * Seller postal address.
   * @ext EXT-FR-FE-BG-13
   */
  address?: PostalAddress
}

/**
 * Delivery terms (Incoterms) of an invoice line. EXTENDED-CTC-FR.
 * @ext EXT-FR-FE-BG-15
 */
export class LineDeliveryTerms {
  constructor({ deliveryTypeCode, locationName }: { deliveryTypeCode: string, locationName?: string }) {
    this.deliveryTypeCode = deliveryTypeCode
    this.locationName = locationName
  }

  /**
   * Delivery type code (Incoterms, UNTDID 4053). `fromCii()` yields `''` when the document has none;
   * `toCii()` throws on `''`.
   * @ext EXT-FR-FE-193
   */
  deliveryTypeCode: string
  /**
   * Name of the location for the delivery terms (CII `RelevantTradeLocation/Name`).
   * @ext EXT-FR-FE-194 EXT-FR-FE-194-00
   */
  locationName?: string
}
