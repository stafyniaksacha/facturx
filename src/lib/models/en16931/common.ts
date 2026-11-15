/**
 * Shared value classes of the EN 16931 model.
 *
 * Ids in JSDoc: a property carries the business-term id it holds (`@bt BT-n`, `@bg BG-n`,
 * `@ext EXT-FR-FE-n`). A group class reused by several groups (`PostalAddress`, `Contact`) lists,
 * on each property, the term it holds in every group it serves. A value class (`Identifier`,
 * `AttachedDocument`) carries no id of its own: the property that holds it names the term and its
 * sub-terms (e.g. `@bt BT-18 BT-18-1` for the value and its scheme).
 */

/**
 * An identifier, optionally qualified by the identification scheme it is issued under.
 */
export class Identifier {
  constructor({ value, schemeId }: { value: string, schemeId?: string }) {
    this.value = value
    this.schemeId = schemeId
  }

  /** The identifier. */
  value: string
  /** The identification scheme (code list named by the holding property), when the term has one. */
  schemeId?: string
}

/**
 * A postal address: the seller's (BG-5), the buyer's (BG-8), the seller tax representative's
 * (BG-12), the deliver-to address (BG-15), or the address of an EXTENDED-CTC-FR party: buyer agent
 * (EXT-FR-FE-14), payee (-31), payer (-54), seller agent (-77), invoicee (-100), billing party (-123).
 * @bg BG-5 BG-8 BG-12 BG-15
 * @ext EXT-FR-FE-14 EXT-FR-FE-31 EXT-FR-FE-54 EXT-FR-FE-77 EXT-FR-FE-100 EXT-FR-FE-123
 */
export class PostalAddress {
  constructor({
    addressLine1,
    addressLine2,
    addressLine3,
    city,
    postCode,
    countrySubdivision,
    countryCode,
  }: {
    addressLine1?: string
    addressLine2?: string
    addressLine3?: string
    city?: string
    postCode?: string
    countrySubdivision?: string
    countryCode: string
  }) {
    this.addressLine1 = addressLine1
    this.addressLine2 = addressLine2
    this.addressLine3 = addressLine3
    this.city = city
    this.postCode = postCode
    this.countrySubdivision = countrySubdivision
    this.countryCode = countryCode
  }

  /**
   * Address line 1: seller BT-35, buyer BT-50, tax representative BT-64, deliver to BT-75.
   * Same position in the EXTENDED-CTC-FR parties: EXT-FR-FE-15, EXT-FR-FE-32, EXT-FR-FE-55, EXT-FR-FE-78, EXT-FR-FE-101, EXT-FR-FE-124.
   * @bt BT-35 BT-50 BT-64 BT-75
   * @ext EXT-FR-FE-15 EXT-FR-FE-32 EXT-FR-FE-55 EXT-FR-FE-78 EXT-FR-FE-101 EXT-FR-FE-124
   */
  addressLine1?: string
  /**
   * Address line 2: seller BT-36, buyer BT-51, tax representative BT-65, deliver to BT-76.
   * Same position in the EXTENDED-CTC-FR parties: EXT-FR-FE-16, EXT-FR-FE-33, EXT-FR-FE-56, EXT-FR-FE-79, EXT-FR-FE-102, EXT-FR-FE-125.
   * @bt BT-36 BT-51 BT-65 BT-76
   * @ext EXT-FR-FE-16 EXT-FR-FE-33 EXT-FR-FE-56 EXT-FR-FE-79 EXT-FR-FE-102 EXT-FR-FE-125
   */
  addressLine2?: string
  /**
   * Address line 3: seller BT-162, buyer BT-163, tax representative BT-164, deliver to BT-165.
   * Same position in the EXTENDED-CTC-FR parties: EXT-FR-FE-17, EXT-FR-FE-34, EXT-FR-FE-57, EXT-FR-FE-80, EXT-FR-FE-103, EXT-FR-FE-126.
   * @bt BT-162 BT-163 BT-164 BT-165
   * @ext EXT-FR-FE-17 EXT-FR-FE-34 EXT-FR-FE-57 EXT-FR-FE-80 EXT-FR-FE-103 EXT-FR-FE-126
   */
  addressLine3?: string
  /**
   * City: seller BT-37, buyer BT-52, tax representative BT-66, deliver to BT-77.
   * Same position in the EXTENDED-CTC-FR parties: EXT-FR-FE-19, EXT-FR-FE-35, EXT-FR-FE-58, EXT-FR-FE-82, EXT-FR-FE-104, EXT-FR-FE-127.
   * @bt BT-37 BT-52 BT-66 BT-77
   * @ext EXT-FR-FE-19 EXT-FR-FE-35 EXT-FR-FE-58 EXT-FR-FE-82 EXT-FR-FE-104 EXT-FR-FE-127
   */
  city?: string
  /**
   * Post code: seller BT-38, buyer BT-53, tax representative BT-67, deliver to BT-78.
   * Same position in the EXTENDED-CTC-FR parties: EXT-FR-FE-18, EXT-FR-FE-36, EXT-FR-FE-59, EXT-FR-FE-81, EXT-FR-FE-105, EXT-FR-FE-128.
   * @bt BT-38 BT-53 BT-67 BT-78
   * @ext EXT-FR-FE-18 EXT-FR-FE-36 EXT-FR-FE-59 EXT-FR-FE-81 EXT-FR-FE-105 EXT-FR-FE-128
   */
  postCode?: string
  /**
   * Country subdivision: seller BT-39, buyer BT-54, tax representative BT-68, deliver to BT-79.
   * Same position in the EXTENDED-CTC-FR parties: EXT-FR-FE-20, EXT-FR-FE-37, EXT-FR-FE-60, EXT-FR-FE-83, EXT-FR-FE-106, EXT-FR-FE-129.
   * @bt BT-39 BT-54 BT-68 BT-79
   * @ext EXT-FR-FE-20 EXT-FR-FE-37 EXT-FR-FE-60 EXT-FR-FE-83 EXT-FR-FE-106 EXT-FR-FE-129
   */
  countrySubdivision?: string
  /**
   * Country code (ISO 3166-1 alpha-2): seller BT-40, buyer BT-55, tax representative BT-69,
   * deliver to BT-80, and in the EXTENDED-CTC-FR parties.
   * @bt BT-40 BT-55 BT-69 BT-80
   * @ext EXT-FR-FE-21 EXT-FR-FE-38 EXT-FR-FE-61 EXT-FR-FE-84 EXT-FR-FE-107 EXT-FR-FE-130
   */
  countryCode: string
}

/**
 * A contact: the seller's (BG-6), the buyer's (BG-9), or that of an EXTENDED-CTC-FR party: buyer
 * agent (EXT-FR-FE-22), payee (-39), payer (-62), seller agent (-85), invoicee (-108), billing party
 * (-131).
 * @bg BG-6 BG-9
 * @ext EXT-FR-FE-22 EXT-FR-FE-39 EXT-FR-FE-62 EXT-FR-FE-85 EXT-FR-FE-108 EXT-FR-FE-131
 */
export class Contact {
  constructor({ point, departmentName, telephoneNumber, emailAddress }: { point?: string, departmentName?: string, telephoneNumber?: string, emailAddress?: string }) {
    this.point = point
    this.departmentName = departmentName
    this.telephoneNumber = telephoneNumber
    this.emailAddress = emailAddress
  }

  /**
   * Contact point (a person or a department): seller BT-41, buyer BT-56; person name of the
   * EXTENDED-CTC-FR parties (CII `PersonName`).
   * @bt BT-41 BT-56
   * @ext EXT-FR-FE-23 EXT-FR-FE-40 EXT-FR-FE-63 EXT-FR-FE-86 EXT-FR-FE-109 EXT-FR-FE-132
   */
  point?: string
  /**
   * Contact department name (CII `DepartmentName`): seller BT-41-0, buyer BT-56-0. A Factur-X
   * sub-term without a UBL element; not in Factur-X BASIC.
   * @bt BT-41-0 BT-56-0
   */
  departmentName?: string
  /**
   * Telephone number: seller BT-42, buyer BT-57, and in the EXTENDED-CTC-FR parties.
   * @bt BT-42 BT-57
   * @ext EXT-FR-FE-24 EXT-FR-FE-41 EXT-FR-FE-64 EXT-FR-FE-87 EXT-FR-FE-110 EXT-FR-FE-133
   */
  telephoneNumber?: string
  /**
   * Email address: seller BT-43, buyer BT-58, and in the EXTENDED-CTC-FR parties.
   * @bt BT-43 BT-58
   * @ext EXT-FR-FE-25 EXT-FR-FE-42 EXT-FR-FE-65 EXT-FR-FE-88 EXT-FR-FE-111 EXT-FR-FE-134
   */
  emailAddress?: string
}
