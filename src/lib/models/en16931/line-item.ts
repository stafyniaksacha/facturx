/**
 * Price, VAT and item groups of an invoice line (BG-29, BG-30, BG-31 with BG-32) and their
 * `EXT-FR-FE` fields. Unit prices and quantities are never rounded here, see `lines.ts`.
 */

import type { Identifier } from './common'

/**
 * Price details of an invoice line. Unit prices and base quantities are never rounded.
 * @bg BG-29
 */
export class PriceDetails {
  constructor({
    netPrice,
    priceBaseQuantity,
    priceBaseQuantityUnitCode,
    grossPrice,
    grossPriceBaseQuantity,
    grossPriceBaseQuantityUnitCode,
    priceDiscount,
    priceDiscountReason,
    priceDiscountReasonCode,
  }: {
    netPrice: number
    priceBaseQuantity?: number
    priceBaseQuantityUnitCode?: string
    grossPrice?: number
    grossPriceBaseQuantity?: number
    grossPriceBaseQuantityUnitCode?: string
    priceDiscount?: number
    priceDiscountReason?: string
    priceDiscountReasonCode?: string
  }) {
    this.netPrice = netPrice
    this.priceBaseQuantity = priceBaseQuantity
    this.priceBaseQuantityUnitCode = priceBaseQuantityUnitCode
    this.grossPrice = grossPrice
    this.grossPriceBaseQuantity = grossPriceBaseQuantity
    this.grossPriceBaseQuantityUnitCode = grossPriceBaseQuantityUnitCode
    this.priceDiscount = priceDiscount
    this.priceDiscountReason = priceDiscountReason
    this.priceDiscountReasonCode = priceDiscountReasonCode
  }

  /**
   * Item net price. `fromCii()` yields `NaN` when the document has none; `toCii()` throws on it.
   * @bt BT-146
   */
  netPrice: number
  /**
   * Item price base quantity (of the net price).
   * @bt BT-149
   */
  priceBaseQuantity?: number
  /**
   * Item price base quantity unit of measure code (UN/ECE Rec. 20 / 21).
   * @bt BT-150
   */
  priceBaseQuantityUnitCode?: string
  /**
   * Item gross price. Needed when a discount or a gross price base quantity is set (CII holds them
   * in the gross price group, whose price is mandatory).
   * @bt BT-148
   */
  grossPrice?: number
  /**
   * Item price base quantity of the gross price (CII `GrossPriceProductTradePrice/BasisQuantity`).
   * @bt BT-149-1
   */
  grossPriceBaseQuantity?: number
  /**
   * Item price base quantity unit of measure code of the gross price.
   * @bt BT-150-1
   */
  grossPriceBaseQuantityUnitCode?: string
  /**
   * Item price discount (BT-147-00 .. BT-147-02: always an allowance).
   * @bt BT-147 BT-147-01 BT-147-02
   */
  priceDiscount?: number
  /**
   * Reason for the item price discount (free text). EXTENDED-CTC-FR.
   * @ext EXT-FR-FE-195
   */
  priceDiscountReason?: string
  /**
   * Reason code of the item price discount. EXTENDED-CTC-FR.
   * @ext EXT-FR-FE-196
   */
  priceDiscountReasonCode?: string
}

/**
 * VAT information of an invoice line. An information line or a group line of an EXTENDED document
 * may carry no VAT block at all (`InvoiceLine.vat` unset), or a block without codes (1.09.2.fixFR04,
 * see CONFORMANCE.md): `categoryCode` unset writes the block without `TypeCode` and `CategoryCode`.
 * @bg BG-30
 */
export class LineVat {
  constructor({ categoryCode, rate, exemptionReason, exemptionReasonCode, vatPointDateCode }: { categoryCode?: string, rate?: number, exemptionReason?: string, exemptionReasonCode?: string, vatPointDateCode?: string }) {
    this.categoryCode = categoryCode
    this.rate = rate
    this.exemptionReason = exemptionReason
    this.exemptionReasonCode = exemptionReasonCode
    this.vatPointDateCode = vatPointDateCode
  }

  /**
   * Invoiced item VAT category code (UNTDID 5305); written with the fixed `VAT` type code (BT-151-0).
   * Mandatory below the EXTENDED levels (`toCii()` throws there), and for detail lines.
   * @bt BT-151 BT-151-0
   */
  categoryCode?: string
  /**
   * Invoiced item VAT rate.
   * @bt BT-152
   */
  rate?: number
  /**
   * Line VAT exemption reason text. EXTENDED-CTC-FR.
   * @ext EXT-FR-FE-178
   */
  exemptionReason?: string
  /**
   * Line VAT exemption reason code (VATEX). EXTENDED-CTC-FR.
   * @ext EXT-FR-FE-179
   */
  exemptionReasonCode?: string
  /**
   * Line value added tax point date code, UNTDID 2005 `3`, `35` or `432` as for BT-8 (written as
   * UNTDID 2475 in CII, see `Invoice.valueAddedTaxPointDateCode`). EXTENDED-CTC-FR.
   * @ext EXT-FR-FE-180
   */
  vatPointDateCode?: string
}

/**
 * Item attribute.
 * @bg BG-32
 */
export class ItemAttribute {
  constructor({ name, value, typeCode, valueQuantity, valueQuantityUnitCode }: { name: string, value?: string, typeCode?: string, valueQuantity?: number, valueQuantityUnitCode?: string }) {
    this.name = name
    this.value = value
    this.typeCode = typeCode
    this.valueQuantity = valueQuantity
    this.valueQuantityUnitCode = valueQuantityUnitCode
  }

  /**
   * Item attribute name. `fromCii()` yields `''` when the document has none; `toCii()` throws on `''`.
   * @bt BT-160
   */
  name: string
  /**
   * Item attribute value. Mandatory below the EXTENDED levels (`toCii()` throws there); EXTENDED
   * allows an attribute with a `valueQuantity` instead.
   * @bt BT-161
   */
  value?: string
  /**
   * Item attribute type code. EXTENDED-CTC-FR.
   * @ext EXT-FR-FE-159
   */
  typeCode?: string
  /**
   * Item attribute value as a number with a unit of measure. EXTENDED-CTC-FR.
   * @ext EXT-FR-FE-160
   */
  valueQuantity?: number
  /**
   * Unit of measure code of `valueQuantity`: mandatory with it. EXTENDED-CTC-FR.
   * @ext EXT-FR-FE-161
   */
  valueQuantityUnitCode?: string
}

/**
 * Item classification identifier.
 * @bt BT-158
 */
export class ItemClassification {
  constructor({ code, listId, listVersionId }: { code: string, listId: string, listVersionId?: string }) {
    this.code = code
    this.listId = listId
    this.listVersionId = listVersionId
  }

  /**
   * Item classification identifier. `fromCii()` yields `''` when the document has none; `toCii()` throws on `''`.
   * @bt BT-158
   */
  code: string
  /**
   * Scheme identifier (UNTDID 7143 code, CII `@listID`). `fromCii()` yields `''` when the document
   * has none; `toCii()` throws on `''`.
   * @bt BT-158-1
   */
  listId: string
  /**
   * Scheme version identifier (CII `@listVersionID`).
   * @bt BT-158-2
   */
  listVersionId?: string
}

/**
 * Item information.
 * @bg BG-31
 */
export class Item {
  constructor({
    name,
    description,
    sellersIdentifier,
    buyersIdentifier,
    standardIdentifier,
    attributes,
    classifications,
    countryOfOrigin,
  }: {
    name: string
    description?: string
    sellersIdentifier?: string
    buyersIdentifier?: string
    standardIdentifier?: Identifier
    attributes?: ItemAttribute[]
    classifications?: ItemClassification[]
    countryOfOrigin?: string
  }) {
    this.name = name
    this.description = description
    this.sellersIdentifier = sellersIdentifier
    this.buyersIdentifier = buyersIdentifier
    this.standardIdentifier = standardIdentifier
    this.attributes = attributes ?? []
    this.classifications = classifications ?? []
    this.countryOfOrigin = countryOfOrigin
  }

  /**
   * Item name. `fromCii()` yields `''` when the document has none; `toCii()` throws on `''`.
   * @bt BT-153
   */
  name: string
  /**
   * Item description. Not in Factur-X BASIC.
   * @bt BT-154
   */
  description?: string
  /**
   * Item seller's identifier. Not in Factur-X BASIC.
   * @bt BT-155
   */
  sellersIdentifier?: string
  /**
   * Item buyer's identifier. Not in Factur-X BASIC.
   * @bt BT-156
   */
  buyersIdentifier?: string
  /**
   * Item standard identifier (e.g. GTIN) with its ISO 6523 scheme: `schemeId` is mandatory
   * (`toCii()` throws on a missing one).
   * @bt BT-157 BT-157-1
   */
  standardIdentifier?: Identifier
  /**
   * Item attributes. Not in Factur-X BASIC.
   * @bg BG-32
   */
  attributes: ItemAttribute[]
  /**
   * Item classification identifiers (BT-158-00 is `0..n`). Not in Factur-X BASIC.
   * @bt BT-158
   */
  classifications: ItemClassification[]
  /**
   * Item country of origin (ISO 3166-1 alpha-2). Not in Factur-X BASIC.
   * @bt BT-159
   */
  countryOfOrigin?: string
}
