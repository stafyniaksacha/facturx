/**
 * Invoice lines of the EN 16931 model: the line group (BG-25), its period, allowances and charges,
 * and the `EXT-FR-FE` fields of the line; the price, VAT and item groups are in `line-item.ts`.
 *
 * Amounts, quantities, prices and percentages are `number`s and are never rounded here: only the
 * Amount data type is limited to two decimals when written (Factur-X 1.09 §7.1.5 p.35), a unit price,
 * a quantity and a percentage keep every digit. Dates are ISO `YYYY-MM-DD` strings.
 *
 * Sub-lines (XP Z12-012 annex B UC10..UC13) stay flat in `Invoice.lines`: `parentLineIdentifier`
 * (EXT-FR-FE-162) and `statusReasonCode` (EXT-FR-FE-163) hold the hierarchy.
 */

import type { Identifier } from './common'
import type {
  LineActualDelivery,
  LineDeliverTo,
  LineDeliveryTerms,
  LineDespatchAdviceReference,
  LinePrecedingInvoiceReference,
  LineReceivingAdviceReference,
  LineSeller,
  LineSellerOrderReference,
} from './line-extensions'
import type { Item, LineVat, PriceDetails } from './line-item'

/**
 * A note of an invoice line.
 * @bt BT-127
 */
export class LineNote {
  constructor({ note, subjectCode }: { note?: string, subjectCode?: string }) {
    this.note = note
    this.subjectCode = subjectCode
  }

  /**
   * Invoice line note. Required in a line note at `basic` and `en16931` (`toCii()` throws when it is
   * missing or empty), optional at EXTENDED and EXTENDED-CTC-FR, where a note without text (a subject
   * code alone) is written without `ram:Content`. `fromCii()` reads `undefined` for a note without text.
   * @bt BT-127
   */
  note?: string
  /**
   * Invoice line note subject code (UNTDID 4451). EXTENDED-CTC-FR. CII holds it in the same
   * `ram:IncludedNote` as the text; at the `extended` levels it may stand alone.
   * @ext EXT-FR-FE-183
   */
  subjectCode?: string
}

/**
 * Invoice line period.
 * @bg BG-26
 */
export class LinePeriod {
  constructor({ startDate, endDate }: { startDate?: string, endDate?: string }) {
    this.startDate = startDate
    this.endDate = endDate
  }

  /**
   * Invoice line period start date (ISO `YYYY-MM-DD`).
   * @bt BT-134 BT-134-0
   */
  startDate?: string
  /**
   * Invoice line period end date (ISO `YYYY-MM-DD`).
   * @bt BT-135 BT-135-0
   */
  endDate?: string
}

/**
 * Invoice line allowance. Written with `ChargeIndicator` false (BG-27-0 / BG-27-1).
 * @bg BG-27 BG-27-0 BG-27-1
 */
export class LineAllowance {
  constructor({ amount, baseAmount, percentage, reasonCode, reason }: { amount: number, baseAmount?: number, percentage?: number, reasonCode?: string, reason?: string }) {
    this.amount = amount
    this.baseAmount = baseAmount
    this.percentage = percentage
    this.reasonCode = reasonCode
    this.reason = reason
  }

  /**
   * Invoice line allowance amount. `fromCii()` yields `NaN` when the document has none; `toCii()`
   * throws on it. Written with two decimals (an *Amount*).
   * @bt BT-136
   */
  amount: number
  /**
   * Invoice line allowance base amount. Not in Factur-X BASIC.
   * @bt BT-137
   */
  baseAmount?: number
  /**
   * Invoice line allowance percentage. Not in Factur-X BASIC.
   * @bt BT-138
   */
  percentage?: number
  /**
   * Invoice line allowance reason code (UNTDID 5189).
   * @bt BT-140
   */
  reasonCode?: string
  /**
   * Invoice line allowance reason.
   * @bt BT-139
   */
  reason?: string
}

/**
 * Invoice line charge. Written with `ChargeIndicator` true (BG-28-0 / BG-28-1).
 * @bg BG-28 BG-28-0 BG-28-1
 */
export class LineCharge {
  constructor({ amount, baseAmount, percentage, reasonCode, nonVatTaxCode, reason }: { amount: number, baseAmount?: number, percentage?: number, reasonCode?: string, nonVatTaxCode?: string, reason?: string }) {
    this.amount = amount
    this.baseAmount = baseAmount
    this.percentage = percentage
    this.reasonCode = reasonCode
    this.nonVatTaxCode = nonVatTaxCode
    this.reason = reason
  }

  /**
   * Invoice line charge amount. `fromCii()` yields `NaN` when the document has none; `toCii()`
   * throws on it. Written with two decimals (an *Amount*).
   * @bt BT-141
   */
  amount: number
  /**
   * Invoice line charge base amount. Not in Factur-X BASIC.
   * @bt BT-142
   */
  baseAmount?: number
  /**
   * Invoice line charge percentage. Not in Factur-X BASIC.
   * @bt BT-143
   */
  percentage?: number
  /**
   * Invoice line charge reason code (UNTDID 7161). Shares one CII `ReasonCode` with `nonVatTaxCode`:
   * set only one (`toCii()` throws on both).
   * @bt BT-145
   */
  reasonCode?: string
  /**
   * Invoice line level non-VAT tax code (UNTDID 5153; CII `ReasonCode` with `@listID="5153"`).
   * EXTENDED and EXTENDED-CTC-FR.
   * @bt BT-193 BT-193-1
   */
  nonVatTaxCode?: string
  /**
   * Invoice line charge reason.
   * @bt BT-144
   */
  reason?: string
}

/**
 * An invoice line.
 *
 * A group line of an EXTENDED document (`statusReasonCode` `GROUP` or `INFORMATION`) may have no
 * price, no quantity and no VAT block; the other levels need them (`toCii()` throws, naming BG-29,
 * BT-129 or BG-30).
 * @bg BG-25
 */
export class InvoiceLine {
  constructor({
    identifier,
    notes,
    parentLineIdentifier,
    statusReasonCode,
    objectIdentifiers,
    purchaseOrderLineReference,
    buyerAccountingReference,
    invoicedQuantity,
    invoicedQuantityUnitCode,
    unitsInParentLine,
    unitsInParentLineUnitCode,
    netAmount,
    vatAmount,
    vatAmountInAccountingCurrency,
    grandTotalAmount,
    period,
    allowances,
    charges,
    price,
    vat,
    item,
    purchaseOrderReference,
    purchaseOrderDate,
    sellerOrderReference,
    despatchAdviceReference,
    receivingAdviceReference,
    precedingInvoiceReferences,
    deliverTo,
    actualDelivery,
    seller,
    deliveryTerms,
  }: {
    identifier: string
    notes?: LineNote[]
    parentLineIdentifier?: string
    statusReasonCode?: string
    objectIdentifiers?: Identifier[]
    purchaseOrderLineReference?: string
    buyerAccountingReference?: string
    invoicedQuantity?: number
    invoicedQuantityUnitCode?: string
    unitsInParentLine?: number
    unitsInParentLineUnitCode?: string
    netAmount: number
    vatAmount?: number
    vatAmountInAccountingCurrency?: number
    grandTotalAmount?: number
    period?: LinePeriod
    allowances?: LineAllowance[]
    charges?: LineCharge[]
    price?: PriceDetails
    vat?: LineVat
    item: Item
    purchaseOrderReference?: string
    purchaseOrderDate?: string
    sellerOrderReference?: LineSellerOrderReference
    despatchAdviceReference?: LineDespatchAdviceReference
    receivingAdviceReference?: LineReceivingAdviceReference
    precedingInvoiceReferences?: LinePrecedingInvoiceReference[]
    deliverTo?: LineDeliverTo
    actualDelivery?: LineActualDelivery
    seller?: LineSeller
    deliveryTerms?: LineDeliveryTerms
  }) {
    this.identifier = identifier
    this.notes = notes ?? []
    this.parentLineIdentifier = parentLineIdentifier
    this.statusReasonCode = statusReasonCode
    this.objectIdentifiers = objectIdentifiers ?? []
    this.purchaseOrderLineReference = purchaseOrderLineReference
    this.buyerAccountingReference = buyerAccountingReference
    this.invoicedQuantity = invoicedQuantity
    this.invoicedQuantityUnitCode = invoicedQuantityUnitCode
    this.unitsInParentLine = unitsInParentLine
    this.unitsInParentLineUnitCode = unitsInParentLineUnitCode
    this.netAmount = netAmount
    this.vatAmount = vatAmount
    this.vatAmountInAccountingCurrency = vatAmountInAccountingCurrency
    this.grandTotalAmount = grandTotalAmount
    this.period = period
    this.allowances = allowances ?? []
    this.charges = charges ?? []
    this.price = price
    this.vat = vat
    this.item = item
    this.purchaseOrderReference = purchaseOrderReference
    this.purchaseOrderDate = purchaseOrderDate
    this.sellerOrderReference = sellerOrderReference
    this.despatchAdviceReference = despatchAdviceReference
    this.receivingAdviceReference = receivingAdviceReference
    this.precedingInvoiceReferences = precedingInvoiceReferences ?? []
    this.deliverTo = deliverTo
    this.actualDelivery = actualDelivery
    this.seller = seller
    this.deliveryTerms = deliveryTerms
  }

  /**
   * Invoice line identifier. `fromCii()` yields `''` when the document has none; `toCii()` throws on `''`.
   * @bt BT-126
   */
  identifier: string
  /**
   * Invoice line notes (BT-127 is `0..1` in EN 16931, `0..n` in EXTENDED-CTC-FR: one CII
   * `IncludedNote` each).
   * @bt BT-127
   * @ext EXT-FR-FE-183
   */
  notes: LineNote[]
  /**
   * Identifier of the parent line (sub-line hierarchy, annex B UC12; the lines stay flat).
   * EXTENDED-CTC-FR.
   * @ext EXT-FR-FE-162
   */
  parentLineIdentifier?: string
  /**
   * Line status reason code: `DETAIL`, `GROUP` or `INFORMATION` (annex B UC10..UC13). The CII
   * `LineStatusCode` (Factur-X BT-X-7) has no EXT-FR-FE id: it is reported in `dropped`.
   * EXTENDED-CTC-FR.
   * @ext EXT-FR-FE-163
   */
  statusReasonCode?: string
  /**
   * Invoice line object identifiers with their scheme (BT-128 is `0..1` in EN 16931; annex B UC10
   * writes two per line; one CII `AdditionalReferencedDocument` of type `130` each). Not in Factur-X BASIC.
   * @bt BT-128 BT-128-0 BT-128-1
   */
  objectIdentifiers: Identifier[]
  /**
   * Referenced purchase order line reference. Not in Factur-X BASIC.
   * @bt BT-132
   */
  purchaseOrderLineReference?: string
  /**
   * Invoice line Buyer accounting reference. Not in Factur-X BASIC.
   * @bt BT-133
   */
  buyerAccountingReference?: string
  /**
   * Invoiced quantity. Mandatory below the EXTENDED levels (`toCii()` throws there); a group line
   * of an EXTENDED document has none.
   * @bt BT-129
   */
  invoicedQuantity?: number
  /**
   * Invoiced quantity unit of measure code (UN/ECE Rec. 20 / 21): mandatory with the quantity
   * (`toCii()` throws on a missing one).
   * @bt BT-130
   */
  invoicedQuantityUnitCode?: string
  /**
   * Number of units in a parent line unit (CII `PerPackageUnitQuantity`). EXTENDED-CTC-FR.
   * @ext EXT-FR-FE-191
   */
  unitsInParentLine?: number
  /**
   * Unit of measure code of `unitsInParentLine`: mandatory with it. EXTENDED-CTC-FR.
   * @ext EXT-FR-FE-191-1
   */
  unitsInParentLineUnitCode?: string
  /**
   * Invoice line net amount. `fromCii()` yields `NaN` when the document has none; `toCii()` throws on
   * it. Written with two decimals (an *Amount*).
   * @bt BT-131
   */
  netAmount: number
  /**
   * Line total VAT amount in the invoice currency (BT-5; the CII `TaxTotalAmount` `@currencyID`
   * EXT-FR-FE-181-1 is written from it). EXTENDED-CTC-FR.
   * @ext EXT-FR-FE-181 EXT-FR-FE-181-1
   */
  vatAmount?: number
  /**
   * Line total VAT amount in the VAT accounting currency (BT-6; EXT-FR-FE-182-1 is written from it,
   * `toCii()` throws without BT-6). EXTENDED-CTC-FR.
   * @ext EXT-FR-FE-182 EXT-FR-FE-182-1
   */
  vatAmountInAccountingCurrency?: number
  /**
   * Line grand total amount, VAT included. EXTENDED-CTC-FR.
   * @ext EXT-FR-FE-184
   */
  grandTotalAmount?: number
  /**
   * Invoice line period.
   * @bg BG-26
   */
  period?: LinePeriod
  /**
   * Invoice line allowances.
   * @bg BG-27
   */
  allowances: LineAllowance[]
  /**
   * Invoice line charges.
   * @bg BG-28
   */
  charges: LineCharge[]
  /**
   * Price details. Mandatory below the EXTENDED levels (`toCii()` throws there).
   * @bg BG-29
   */
  price?: PriceDetails
  /**
   * Line VAT information. Mandatory below the EXTENDED levels (`toCii()` throws there). CII
   * EXTENDED allows several blocks per line (`ApplicableTradeTax` `0..n`) while EN 16931 and the UBL
   * annex have one: the first is read, a later one is reported in `dropped`.
   * @bg BG-30
   */
  vat?: LineVat
  /**
   * Item information.
   * @bg BG-31
   */
  item: Item
  /**
   * Reference of the purchase order the line was generated from (CII `BuyerOrderReferencedDocument/
   * IssuerAssignedID`). EXTENDED-CTC-FR.
   * @ext EXT-FR-FE-135
   */
  purchaseOrderReference?: string
  /**
   * Issue date of that purchase order (ISO `YYYY-MM-DD`). EXTENDED-CTC-FR.
   * @ext EXT-FR-FE-200 EXT-FR-FE-200-1
   */
  purchaseOrderDate?: string
  /**
   * Sales order the line refers to. EXTENDED-CTC-FR.
   * @ext EXT-FR-FE-BG-09
   */
  sellerOrderReference?: LineSellerOrderReference
  /**
   * Despatch advice the line refers to. EXTENDED-CTC-FR.
   * @ext EXT-FR-FE-BG-07
   */
  despatchAdviceReference?: LineDespatchAdviceReference
  /**
   * Receiving advice the line refers to. EXTENDED-CTC-FR.
   * @ext EXT-FR-FE-BG-08
   */
  receivingAdviceReference?: LineReceivingAdviceReference
  /**
   * Preceding invoice references of the line (the UBL annex has up to two: one is the parent line;
   * CII has one `InvoiceReferencedDocument`, `toCii()` throws on a second). EXTENDED-CTC-FR.
   * @ext EXT-FR-FE-BG-06
   */
  precedingInvoiceReferences: LinePrecedingInvoiceReference[]
  /**
   * Deliver-to party of the line. EXTENDED-CTC-FR.
   * @ext EXT-FR-FE-BG-10
   */
  deliverTo?: LineDeliverTo
  /**
   * Actual delivery of the line. EXTENDED-CTC-FR.
   * @ext EXT-FR-FE-BG-11
   */
  actualDelivery?: LineActualDelivery
  /**
   * Seller of the line (multi-vendor invoices). EXTENDED-CTC-FR.
   * @ext EXT-FR-FE-BG-12
   */
  seller?: LineSeller
  /**
   * Delivery terms (Incoterms) of the line. EXTENDED-CTC-FR.
   * @ext EXT-FR-FE-BG-15
   */
  deliveryTerms?: LineDeliveryTerms
}
