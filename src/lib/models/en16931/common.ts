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
 * (BG-12) or the deliver-to address (BG-15).
 * @bg BG-5 BG-8 BG-12 BG-15
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
   * @bt BT-35 BT-50 BT-64 BT-75
   */
  addressLine1?: string
  /**
   * Address line 2: seller BT-36, buyer BT-51, tax representative BT-65, deliver to BT-76.
   * @bt BT-36 BT-51 BT-65 BT-76
   */
  addressLine2?: string
  /**
   * Address line 3: seller BT-162, buyer BT-163, tax representative BT-164, deliver to BT-165.
   * @bt BT-162 BT-163 BT-164 BT-165
   */
  addressLine3?: string
  /**
   * City: seller BT-37, buyer BT-52, tax representative BT-66, deliver to BT-77.
   * @bt BT-37 BT-52 BT-66 BT-77
   */
  city?: string
  /**
   * Post code: seller BT-38, buyer BT-53, tax representative BT-67, deliver to BT-78.
   * @bt BT-38 BT-53 BT-67 BT-78
   */
  postCode?: string
  /**
   * Country subdivision: seller BT-39, buyer BT-54, tax representative BT-68, deliver to BT-79.
   * @bt BT-39 BT-54 BT-68 BT-79
   */
  countrySubdivision?: string
  /**
   * Country code (ISO 3166-1 alpha-2): seller BT-40, buyer BT-55, tax representative BT-69,
   * deliver to BT-80.
   * @bt BT-40 BT-55 BT-69 BT-80
   */
  countryCode: string
}

/**
 * A contact: the seller's (BG-6) or the buyer's (BG-9).
 * @bg BG-6 BG-9
 */
export class Contact {
  constructor({ point, telephoneNumber, emailAddress }: { point?: string, telephoneNumber?: string, emailAddress?: string }) {
    this.point = point
    this.telephoneNumber = telephoneNumber
    this.emailAddress = emailAddress
  }

  /**
   * Contact point (a person or a department): seller BT-41, buyer BT-56.
   * @bt BT-41 BT-56
   */
  point?: string
  /**
   * Telephone number: seller BT-42, buyer BT-57.
   * @bt BT-42 BT-57
   */
  telephoneNumber?: string
  /**
   * Email address: seller BT-43, buyer BT-58.
   * @bt BT-43 BT-58
   */
  emailAddress?: string
}
