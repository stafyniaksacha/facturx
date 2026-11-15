/**
 * Invoice lines (BG-25 ... BG-32) of the EN 16931 model ⇄ CII `IncludedSupplyChainTradeLineItem`.
 *
 * Placement follows the Factur-X 1.09 EXTENDED field matrix (`fields--Factur-X_CII_D22B_EXTENDED.csv`,
 * XPath column), also for the EXT-FR-FE fields where XP Z12-012 annex A shifts a row (CG-39). Shapes
 * mirror `xmlToInvoice()`: the lists the parser always returns (`IncludedNote`, `BatchID`, the
 * product characteristics, the line settlement lists ...) are arrays, so a document read and written
 * back compares equal. What the model has no place for (Factur-X-only `BT-X-*` terms: the line status
 * code, manufacturer, instances, gross price charges ...) is not mapped, and `fromCii()` reports it
 * in `dropped`.
 */

import type { Invoice } from '../../models/en16931/invoice'
import type { En16931Level } from '../../models/en16931/level'
import type { CrossIndustryInvoiceType } from '../../models/facturx/crossIndustryInvoice'
import type { TermGate } from './levels'
import { Identifier } from '../../models/en16931/common'
import { Item, ItemAttribute, ItemClassification, LineVat, PriceDetails } from '../../models/en16931/line-item'
import {
  InvoiceLine,
  LineAllowance,
  LineCharge,
  LineNote,
  LinePeriod,
} from '../../models/en16931/lines'
import * as qdt from '../../models/facturx/qualifiedTypes'
import * as ram from '../../models/facturx/reusableTypes'
import * as udt from '../../models/facturx/unqualifiedTypes'
import { isSet } from './levels'
import {
  actualDeliveryFromCii,
  actualDeliveryToCii,
  buyerOrderToCii,
  deliverToFromCii,
  deliverToToCii,
  deliveryTermsFromCii,
  deliveryTermsToCii,
  despatchFromCii,
  despatchToCii,
  lineSellerFromCii,
  lineSellerToCii,
  precedingFromCii,
  precedingToCii,
  receivingFromCii,
  receivingToCii,
  sellerOrderFromCii,
  sellerOrderToCii,
} from './line-extensions'
import { BT8_FROM_CII, BT8_TO_CII, ciiCode, ciiDateTime, ciiId, ciiText, isoFromCii } from './values'

/** The lines property of `Invoice`, as its constructor takes it. */
export type LinesInit = Pick<ConstructorParameters<typeof Invoice>[0], 'lines'>

/** `ram:ApplicableTradeTax/ram:TypeCode`: fixed `VAT` (matrix BT-151-0). */
const VAT_TYPE = 'VAT'
/** `ram:AdditionalReferencedDocument/ram:TypeCode` of a line object identifier (matrix BT-128-0: "Value = 130"). */
const INVOICED_OBJECT = '130'
/** `@listID` of the `ReasonCode` that is a non-VAT tax code (BT-193-1: "Value = 5153"). */
const NON_VAT_TAX_LIST = '5153'

const some = (i: Invoice, test: (line: InvoiceLine) => boolean): boolean => i.lines.some(test)

/** Line terms Factur-X BASIC lacks (matrix level columns: `.XXX`) and the EXTENDED-only ones. */
export const LINE_GATES: readonly TermGate[] = [
  { id: 'BT-128', term: 'invoice line object identifier', from: 'en16931', present: i => some(i, l => isSet(l.objectIdentifiers)) },
  { id: 'BT-132', term: 'referenced purchase order line reference', from: 'en16931', present: i => some(i, l => isSet(l.purchaseOrderLineReference)) },
  { id: 'BT-133', term: 'invoice line buyer accounting reference', from: 'en16931', present: i => some(i, l => isSet(l.buyerAccountingReference)) },
  { id: 'BT-137', term: 'invoice line allowance base amount', from: 'en16931', present: i => some(i, l => l.allowances.some(a => isSet(a.baseAmount))) },
  { id: 'BT-138', term: 'invoice line allowance percentage', from: 'en16931', present: i => some(i, l => l.allowances.some(a => isSet(a.percentage))) },
  { id: 'BT-142', term: 'invoice line charge base amount', from: 'en16931', present: i => some(i, l => l.charges.some(c => isSet(c.baseAmount))) },
  { id: 'BT-143', term: 'invoice line charge percentage', from: 'en16931', present: i => some(i, l => l.charges.some(c => isSet(c.percentage))) },
  { id: 'BT-154', term: 'item description', from: 'en16931', present: i => some(i, l => isSet(l.item?.description)) },
  { id: 'BT-155', term: 'item seller\'s identifier', from: 'en16931', present: i => some(i, l => isSet(l.item?.sellersIdentifier)) },
  { id: 'BT-156', term: 'item buyer\'s identifier', from: 'en16931', present: i => some(i, l => isSet(l.item?.buyersIdentifier)) },
  { id: 'BG-32', term: 'item attributes', from: 'en16931', present: i => some(i, l => isSet(l.item?.attributes)) },
  { id: 'BT-158', term: 'item classification identifier', from: 'en16931', present: i => some(i, l => isSet(l.item?.classifications)) },
  { id: 'BT-159', term: 'item country of origin', from: 'en16931', present: i => some(i, l => isSet(l.item?.countryOfOrigin)) },
  { id: 'BT-193', term: 'invoice line level non-VAT tax code', from: 'extended', present: i => some(i, l => l.charges.some(c => isSet(c.nonVatTaxCode))) },
  { id: 'EXT-FR-FE-162', term: 'parent line identifier', from: 'extended', present: i => some(i, l => isSet(l.parentLineIdentifier)) },
  { id: 'EXT-FR-FE-163', term: 'line status reason code', from: 'extended', present: i => some(i, l => isSet(l.statusReasonCode)) },
  { id: 'EXT-FR-FE-183', term: 'invoice line note subject code', from: 'extended', present: i => some(i, l => l.notes.some(n => isSet(n.subjectCode))) },
  { id: 'EXT-FR-FE-135', term: 'purchase order reference of the line', from: 'extended', present: i => some(i, l => isSet(l.purchaseOrderReference)) },
  { id: 'EXT-FR-FE-200', term: 'purchase order date of the line', from: 'extended', present: i => some(i, l => isSet(l.purchaseOrderDate)) },
  { id: 'EXT-FR-FE-191', term: 'number of units in a parent line unit', from: 'extended', present: i => some(i, l => isSet(l.unitsInParentLine) || isSet(l.unitsInParentLineUnitCode)) },
  { id: 'EXT-FR-FE-181', term: 'line total VAT amount', from: 'extended', present: i => some(i, l => isSet(l.vatAmount)) },
  { id: 'EXT-FR-FE-182', term: 'line total VAT amount in accounting currency', from: 'extended', present: i => some(i, l => isSet(l.vatAmountInAccountingCurrency)) },
  { id: 'EXT-FR-FE-184', term: 'line grand total amount', from: 'extended', present: i => some(i, l => isSet(l.grandTotalAmount)) },
  { id: 'EXT-FR-FE-BG-06', term: 'preceding invoice reference of the line', from: 'extended', present: i => some(i, l => isSet(l.precedingInvoiceReferences)) },
  { id: 'EXT-FR-FE-BG-07', term: 'despatch advice reference of the line', from: 'extended', present: i => some(i, l => isSet(l.despatchAdviceReference)) },
  { id: 'EXT-FR-FE-BG-08', term: 'receiving advice reference of the line', from: 'extended', present: i => some(i, l => isSet(l.receivingAdviceReference)) },
  { id: 'EXT-FR-FE-BG-09', term: 'sales order reference of the line', from: 'extended', present: i => some(i, l => isSet(l.sellerOrderReference)) },
  { id: 'EXT-FR-FE-BG-10', term: 'deliver to party of the line', from: 'extended', present: i => some(i, l => isSet(l.deliverTo)) },
  { id: 'EXT-FR-FE-BG-11', term: 'actual delivery of the line', from: 'extended', present: i => some(i, l => isSet(l.actualDelivery)) },
  { id: 'EXT-FR-FE-BG-12', term: 'seller of the line', from: 'extended', present: i => some(i, l => isSet(l.seller)) },
  { id: 'EXT-FR-FE-BG-15', term: 'delivery terms of the line', from: 'extended', present: i => some(i, l => isSet(l.deliveryTerms)) },
  { id: 'EXT-FR-FE-178', term: 'line VAT exemption reason', from: 'extended', present: i => some(i, l => isSet(l.vat?.exemptionReason)) },
  { id: 'EXT-FR-FE-179', term: 'line VAT exemption reason code', from: 'extended', present: i => some(i, l => isSet(l.vat?.exemptionReasonCode)) },
  { id: 'EXT-FR-FE-180', term: 'line value added tax point date code', from: 'extended', present: i => some(i, l => isSet(l.vat?.vatPointDateCode)) },
  { id: 'EXT-FR-FE-195', term: 'item price discount reason', from: 'extended', present: i => some(i, l => isSet(l.price?.priceDiscountReason)) },
  { id: 'EXT-FR-FE-196', term: 'item price discount reason code', from: 'extended', present: i => some(i, l => isSet(l.price?.priceDiscountReasonCode)) },
  { id: 'EXT-FR-FE-159', term: 'item attribute type code', from: 'extended', present: i => some(i, l => l.item?.attributes.some(a => isSet(a.typeCode)) ?? false) },
  { id: 'EXT-FR-FE-160', term: 'item attribute value quantity', from: 'extended', present: i => some(i, l => l.item?.attributes.some(a => isSet(a.valueQuantity) || isSet(a.valueQuantityUnitCode)) ?? false) },
]

// ---------------------------------------------------------------------------
// CII → model
// ---------------------------------------------------------------------------

// A mandatory amount the document lacks: NaN, which `toCii()` rejects.
function required(amount: udt.AmountType | undefined): number {
  return amount?.value ?? Number.NaN
}

interface AllowanceCharge {
  amount: number
  baseAmount?: number
  percentage?: number
  reasonCode?: string
  reason?: string
}

function allowanceChargeFromCii(entry: ram.TradeAllowanceChargeType): AllowanceCharge {
  return {
    amount: required(entry.actualAmount),
    baseAmount: entry.basisAmount?.value,
    percentage: entry.calculationPercent?.value,
    reasonCode: entry.reasonCode?.value,
    reason: entry.reason?.value,
  }
}

function priceFromCii(agreement: ram.LineTradeAgreementType | undefined): PriceDetails | undefined {
  const net = agreement?.netPriceProductTradePrice
  const gross = agreement?.grossPriceProductTradePrice
  if (!net && !gross)
    return undefined
  // BT-147 is always an allowance: a charge in the gross price group (BT-X-302) is left to `dropped`.
  const discount = gross?.appliedTradeAllowanceCharge?.[0]
  const allowance = discount && !discount.chargeIndicator?.indicator ? discount : undefined
  return new PriceDetails({
    netPrice: net ? net.chargeAmount?.value ?? Number.NaN : Number.NaN,
    priceBaseQuantity: net?.basisQuantity?.value,
    priceBaseQuantityUnitCode: net?.basisQuantity?.unitCode,
    grossPrice: gross?.chargeAmount?.value,
    grossPriceBaseQuantity: gross?.basisQuantity?.value,
    grossPriceBaseQuantityUnitCode: gross?.basisQuantity?.unitCode,
    priceDiscount: allowance?.actualAmount?.value,
    priceDiscountReason: allowance?.reason?.value,
    // `@listID` on the reason code makes it the non-VAT tax code BT-X-616, which has no id here.
    priceDiscountReasonCode: allowance?.reasonCode?.listID === undefined ? allowance?.reasonCode?.value : undefined,
  })
}

function vatFromCii(tax: ram.TradeTaxType | undefined): LineVat | undefined {
  if (!tax)
    return undefined
  return new LineVat({
    categoryCode: tax.categoryCode?.value,
    rate: tax.rateApplicablePercent?.value,
    exemptionReason: tax.exemptionReason?.value,
    exemptionReasonCode: tax.exemptionReasonCode?.value,
    // A code outside UNTDID 2475 5 / 29 / 72 is not read: it stays in `dropped`.
    vatPointDateCode: tax.dueDateTypeCode ? BT8_FROM_CII.get(tax.dueDateTypeCode.value) : undefined,
  })
}

function itemFromCii(product: ram.TradeProductType | undefined): Item {
  const standard = product?.globalID
  return new Item({
    // The parser stands in an empty name for a product without one.
    name: product?.name?.value ?? '',
    description: product?.description?.value,
    sellersIdentifier: product?.sellerAssignedID?.value,
    buyersIdentifier: product?.buyerAssignedID?.value,
    standardIdentifier: standard ? new Identifier({ value: standard.value, schemeId: standard.schemeID }) : undefined,
    attributes: (product?.applicableProductCharacteristic ?? []).map(c => new ItemAttribute({
      name: c.description?.value ?? '',
      value: c.value?.value,
      typeCode: c.typeCode?.value,
      valueQuantity: c.valueMeasure?.value,
      valueQuantityUnitCode: c.valueMeasure?.unitCode,
    })),
    classifications: (product?.designatedProductClassification ?? []).map(c => new ItemClassification({
      code: c.classCode?.value ?? '',
      listId: c.classCode?.listID ?? '',
      listVersionId: c.classCode?.listVersionID,
    })),
    countryOfOrigin: product?.originTradeCountry?.id?.value,
  })
}

function lineFromCii(entry: ram.SupplyChainTradeLineItemType): InvoiceLine {
  const doc = entry.associatedDocumentLineDocument
  const agreement = entry.specifiedLineTradeAgreement
  const delivery = entry.specifiedLineTradeDelivery
  const settlement = entry.specifiedLineTradeSettlement
  const sum = settlement?.specifiedTradeSettlementLineMonetarySummation
  const allowanceCharges = settlement?.specifiedTradeAllowanceCharge ?? []
  const buyerOrder = agreement?.buyerOrderReferencedDocument
  const start = isoFromCii(settlement?.billingSpecifiedPeriod?.startDateTime)
  const end = isoFromCii(settlement?.billingSpecifiedPeriod?.endDateTime)

  return new InvoiceLine({
    identifier: doc?.lineID?.value ?? '',
    notes: (doc?.includedNote ?? []).map(n => new LineNote({
      // BT-127 is the mandatory term of the line note: '' when the document lacks it (the parser reads the same).
      note: n.content?.value ?? '',
      subjectCode: n.subjectCode?.value,
    })),
    parentLineIdentifier: doc?.parentLineID?.value,
    statusReasonCode: doc?.lineStatusReasonCode?.value,
    objectIdentifiers: (settlement?.additionalReferencedDocument ?? [])
      .filter(d => d.typeCode?.value === INVOICED_OBJECT)
      .map(d => new Identifier({ value: d.issuerAssignedID?.value ?? '', schemeId: d.referenceTypeCode?.value })),
    purchaseOrderLineReference: buyerOrder?.lineID?.value,
    buyerAccountingReference: settlement?.receivableSpecifiedTradeAccountingAccount?.[0]?.id?.value,
    invoicedQuantity: delivery?.billedQuantity?.value,
    invoicedQuantityUnitCode: delivery?.billedQuantity?.unitCode,
    unitsInParentLine: delivery?.perPackageUnitQuantity?.value,
    unitsInParentLineUnitCode: delivery?.perPackageUnitQuantity?.unitCode,
    netAmount: required(sum?.lineTotalAmount),
    vatAmount: sum?.taxTotalAmount?.value,
    vatAmountInAccountingCurrency: sum?.taxTotalAmountInAccountingCurrency?.value,
    grandTotalAmount: sum?.grandTotalAmount?.value,
    period: start === undefined && end === undefined ? undefined : new LinePeriod({ startDate: start, endDate: end }),
    allowances: allowanceCharges.filter(e => !e.chargeIndicator?.indicator).map(e => new LineAllowance(allowanceChargeFromCii(e))),
    charges: allowanceCharges.filter(e => e.chargeIndicator?.indicator).map((e) => {
      const { reasonCode, ...rest } = allowanceChargeFromCii(e)
      // One CII `ReasonCode` holds BT-145 or, with `@listID="5153"`, BT-193 (as BT-105 / BT-177).
      const nonVat = e.reasonCode?.listID === NON_VAT_TAX_LIST
      return new LineCharge({ ...rest, reasonCode: nonVat ? undefined : reasonCode, nonVatTaxCode: nonVat ? reasonCode : undefined })
    }),
    price: priceFromCii(agreement),
    vat: vatFromCii(settlement?.applicableTradeTax?.[0]),
    item: itemFromCii(entry.specifiedTradeProduct),
    purchaseOrderReference: buyerOrder?.issuerAssignedID?.value,
    purchaseOrderDate: isoFromCii(buyerOrder?.formattedIssueDateTime),
    sellerOrderReference: sellerOrderFromCii(agreement?.sellerOrderReferencedDocument),
    despatchAdviceReference: despatchFromCii(delivery?.despatchAdviceReferencedDocument),
    receivingAdviceReference: receivingFromCii(delivery?.receivingAdviceReferencedDocument),
    precedingInvoiceReferences: precedingFromCii(settlement?.invoiceReferencedDocument),
    deliverTo: deliverToFromCii(delivery?.shipToTradeParty),
    actualDelivery: actualDeliveryFromCii(delivery?.actualDeliverySupplyChainEvent),
    seller: lineSellerFromCii(agreement?.itemSellerTradeParty),
    deliveryTerms: deliveryTermsFromCii(agreement?.applicableTradeDeliveryTerms),
  })
}

/** The invoice lines of a CII invoice. */
export function linesFromCii(cii: CrossIndustryInvoiceType): LinesInit {
  return { lines: (cii.supplyChainTradeTransaction?.includedSupplyChainTradeLineItem ?? []).map(lineFromCii) }
}

// ---------------------------------------------------------------------------
// Model → CII
// ---------------------------------------------------------------------------

function amount(value: number | undefined, currencyID?: string): udt.AmountType | undefined {
  return value === undefined ? undefined : new udt.AmountType({ value, currencyID })
}

function percent(value: number | undefined): udt.PercentType | undefined {
  return value === undefined ? undefined : new udt.PercentType({ value })
}

function quantity(value: number | undefined, unitCode: string | undefined): udt.QuantityType | undefined {
  return value === undefined ? undefined : new udt.QuantityType({ value, unitCode })
}

function allowanceChargeToCii(entry: AllowanceCharge & { nonVatTaxCode?: string }, charge: boolean): ram.TradeAllowanceChargeType {
  const nonVat = entry.nonVatTaxCode
  return new ram.TradeAllowanceChargeType({
    chargeIndicator: new udt.IndicatorType({ indicator: charge }),
    calculationPercent: percent(entry.percentage),
    basisAmount: amount(entry.baseAmount),
    actualAmount: new udt.AmountType({ value: entry.amount }),
    reasonCode: nonVat !== undefined
      ? new qdt.AllowanceChargeReasonCodeType({ value: nonVat, listID: NON_VAT_TAX_LIST })
      : entry.reasonCode === undefined ? undefined : new qdt.AllowanceChargeReasonCodeType({ value: entry.reasonCode }),
    reason: ciiText(entry.reason),
  })
}

function netPriceToCii(price: PriceDetails): ram.TradePriceType {
  return new ram.TradePriceType({
    chargeAmount: new udt.AmountType({ value: price.netPrice }),
    basisQuantity: quantity(price.priceBaseQuantity, price.priceBaseQuantityUnitCode),
    appliedTradeAllowanceCharge: [],
  })
}

function grossPriceToCii(price: PriceDetails): ram.TradePriceType | undefined {
  const { grossPrice, grossPriceBaseQuantity, priceDiscount } = price
  if (grossPrice === undefined && grossPriceBaseQuantity === undefined && priceDiscount === undefined)
    return undefined
  return new ram.TradePriceType({
    // Needed by the CII group: `toCii()` throws when a gross price term is set without BT-148.
    chargeAmount: new udt.AmountType({ value: grossPrice as number }),
    basisQuantity: quantity(grossPriceBaseQuantity, price.grossPriceBaseQuantityUnitCode),
    appliedTradeAllowanceCharge: priceDiscount === undefined
      ? []
      : [new ram.TradeAllowanceChargeType({
          chargeIndicator: new udt.IndicatorType({ indicator: false }),
          actualAmount: new udt.AmountType({ value: priceDiscount }),
          reasonCode: price.priceDiscountReasonCode === undefined ? undefined : new qdt.AllowanceChargeReasonCodeType({ value: price.priceDiscountReasonCode }),
          reason: ciiText(price.priceDiscountReason),
        })],
  })
}

function vatToCii(vat: LineVat): ram.TradeTaxType {
  const code = vat.vatPointDateCode
  const untdid2475 = code === undefined ? undefined : BT8_TO_CII.get(code)
  if (code !== undefined && untdid2475 === undefined)
    throw new Error('toCii: EXT-FR-FE-180 (line value added tax point date code) must be a UNTDID 2005 code 3, 35 or 432')
  // Without a category code the block is written without `TypeCode` too (1.09.2.fixFR04, EXTENDED).
  return new ram.TradeTaxType({
    typeCode: vat.categoryCode === undefined ? undefined : new qdt.TaxTypeCodeType({ value: VAT_TYPE }),
    exemptionReason: ciiText(vat.exemptionReason),
    categoryCode: vat.categoryCode === undefined ? undefined : new qdt.TaxCategoryCodeType({ value: vat.categoryCode }),
    exemptionReasonCode: ciiCode(vat.exemptionReasonCode),
    dueDateTypeCode: untdid2475 === undefined ? undefined : new qdt.TimeReferenceCodeType({ value: untdid2475 }),
    rateApplicablePercent: percent(vat.rate),
  })
}

function itemToCii(item: Item): ram.TradeProductType {
  return new ram.TradeProductType({
    globalID: item.standardIdentifier ? new udt.IDType({ value: item.standardIdentifier.value, schemeID: item.standardIdentifier.schemeId }) : undefined,
    sellerAssignedID: ciiId(item.sellersIdentifier),
    buyerAssignedID: ciiId(item.buyersIdentifier),
    name: new udt.TextType({ value: item.name }),
    description: ciiText(item.description),
    batchID: [],
    applicableProductCharacteristic: item.attributes.map(a => new ram.ProductCharacteristicType({
      typeCode: ciiCode(a.typeCode),
      description: ciiText(a.name),
      valueMeasure: a.valueQuantity === undefined ? undefined : new udt.MeasureType({ value: a.valueQuantity, unitCode: a.valueQuantityUnitCode }),
      value: ciiText(a.value),
    })),
    designatedProductClassification: item.classifications.map(c => new ram.ProductClassificationType({
      classCode: new udt.CodeType({ value: c.code, listID: c.listId, listVersionID: c.listVersionId }),
    })),
    originTradeCountry: item.countryOfOrigin === undefined ? undefined : new ram.TradeCountryType({ id: new qdt.CountryIDType({ value: item.countryOfOrigin }) }),
    individualTradeProductInstance: [],
    includedReferencedProduct: [],
  })
}

function lineToCii(line: InvoiceLine, invoice: Invoice): ram.SupplyChainTradeLineItemType {
  const { price, vat } = line
  const gross = price ? grossPriceToCii(price) : undefined
  const agreement = {
    applicableTradeDeliveryTerms: deliveryTermsToCii(line.deliveryTerms),
    sellerOrderReferencedDocument: sellerOrderToCii(line.sellerOrderReference),
    buyerOrderReferencedDocument: buyerOrderToCii(line),
    grossPriceProductTradePrice: gross,
    netPriceProductTradePrice: price ? netPriceToCii(price) : undefined,
    itemSellerTradeParty: lineSellerToCii(line.seller),
  }
  const delivery = {
    billedQuantity: quantity(line.invoicedQuantity, line.invoicedQuantityUnitCode),
    perPackageUnitQuantity: quantity(line.unitsInParentLine, line.unitsInParentLineUnitCode),
    shipToTradeParty: deliverToToCii(line.deliverTo),
    actualDeliverySupplyChainEvent: actualDeliveryToCii(line.actualDelivery),
    despatchAdviceReferencedDocument: despatchToCii(line.despatchAdviceReference),
    receivingAdviceReferencedDocument: receivingToCii(line.receivingAdviceReference),
  }
  const hasAgreement = Object.values(agreement).some(v => v !== undefined)
  const hasDelivery = Object.values(delivery).some(v => v !== undefined)

  return new ram.SupplyChainTradeLineItemType({
    associatedDocumentLineDocument: new ram.DocumentLineDocumentType({
      lineID: new udt.IDType({ value: line.identifier }),
      parentLineID: ciiId(line.parentLineIdentifier),
      lineStatusReasonCode: ciiCode(line.statusReasonCode),
      includedNote: line.notes.map(n => new ram.NoteType({
        content: new udt.TextType({ value: n.note }),
        subjectCode: ciiCode(n.subjectCode),
      })),
    }),
    specifiedTradeProduct: itemToCii(line.item),
    specifiedLineTradeAgreement: hasAgreement ? new ram.LineTradeAgreementType({ ...agreement, additionalReferencedDocument: [], ultimateCustomerOrderReferencedDocument: [] }) : undefined,
    specifiedLineTradeDelivery: hasDelivery ? new ram.LineTradeDeliveryType(delivery) : undefined,
    specifiedLineTradeSettlement: new ram.LineTradeSettlementType({
      applicableTradeTax: vat ? [vatToCii(vat)] : [],
      billingSpecifiedPeriod: line.period
        ? new ram.SpecifiedPeriodType({
            startDateTime: ciiDateTime(line.period.startDate, 'BT-134'),
            endDateTime: ciiDateTime(line.period.endDate, 'BT-135'),
          })
        : undefined,
      // Allowances first, then charges: the order of every official document.
      specifiedTradeAllowanceCharge: [
        ...line.allowances.map(a => allowanceChargeToCii(a, false)),
        ...line.charges.map(c => allowanceChargeToCii(c, true)),
      ],
      specifiedTradeSettlementLineMonetarySummation: new ram.TradeSettlementLineMonetarySummationType({
        lineTotalAmount: new udt.AmountType({ value: line.netAmount }),
        // The currencies are BT-5 and BT-6 (EXT-FR-FE-181-1, -182-1).
        taxTotalAmount: amount(line.vatAmount, invoice.currencyCode),
        taxTotalAmountInAccountingCurrency: amount(line.vatAmountInAccountingCurrency, invoice.vatAccountingCurrencyCode),
        grandTotalAmount: amount(line.grandTotalAmount),
      }),
      invoiceReferencedDocument: precedingToCii(line.precedingInvoiceReferences),
      additionalReferencedDocument: line.objectIdentifiers.map(o => new ram.ReferencedDocumentType({
        issuerAssignedID: ciiId(o.value),
        typeCode: new qdt.DocumentCodeType({ value: INVOICED_OBJECT }),
        name: [],
        referenceTypeCode: o.schemeId === undefined ? undefined : new qdt.ReferenceCodeType({ value: o.schemeId }),
      })),
      receivableSpecifiedTradeAccountingAccount: line.buyerAccountingReference === undefined
        ? []
        : [new ram.TradeAccountingAccountType({ id: new udt.IDType({ value: line.buyerAccountingReference }) })],
    }),
  })
}

/** The invoice lines as CII aggregates. Tolerates incomplete data: `toCii()` checks it. */
export function linesToCii(invoice: Invoice): ram.SupplyChainTradeLineItemType[] {
  return invoice.lines.map(line => lineToCii(line, invoice))
}

// ---------------------------------------------------------------------------
// Mandatory terms of the lines the invoice holds
// ---------------------------------------------------------------------------

type Check = [id: string, term: string, value: number | string | undefined]

const empty = (value: number | string | undefined): boolean => value === undefined || value === '' || (typeof value === 'number' && !Number.isFinite(value))

/**
 * Throws, naming the business term, when a mandatory term of a line is missing, empty or not a finite
 * number, when an optional number is not finite, or when a term needs another one that CII writes in
 * the same element (a unit with its quantity, a discount with the gross price ...). BG-29, BT-129,
 * BG-30, BT-151 and BT-161 are mandatory below EXTENDED only. Never quotes invoice content.
 */
export function assertLinesComplete(invoice: Invoice, level: En16931Level): void {
  if (!Array.isArray(invoice.lines) || invoice.lines.length === 0)
    throw new Error('toCii: BG-25 (invoice lines) is mandatory')
  const extended = level === 'extended' || level === 'extended-ctc-fr'
  const mandatory: Check[] = []
  const finite: Check[] = []
  const needs: [id: string, term: string, other: string, otherTerm: string, present: boolean][] = []

  for (const line of invoice.lines) {
    mandatory.push(['BT-126', 'invoice line identifier', line.identifier], ['BT-131', 'invoice line net amount', line.netAmount])
    if (!extended)
      mandatory.push(['BT-129', 'invoiced quantity', line.invoicedQuantity])
    // The unit of measure is an attribute of the quantity.
    if (line.invoicedQuantity !== undefined)
      mandatory.push(['BT-130', 'invoiced quantity unit code', line.invoicedQuantityUnitCode])
    needs.push(['BT-130', 'invoiced quantity unit code', 'BT-129', 'invoiced quantity', line.invoicedQuantityUnitCode !== undefined && line.invoicedQuantity === undefined])
    if (line.unitsInParentLine !== undefined)
      mandatory.push(['EXT-FR-FE-191-1', 'unit code of the number of units in a parent line unit', line.unitsInParentLineUnitCode])
    needs.push(['EXT-FR-FE-191-1', 'unit code of the number of units in a parent line unit', 'EXT-FR-FE-191', 'number of units in a parent line unit', line.unitsInParentLineUnitCode !== undefined && line.unitsInParentLine === undefined])
    finite.push(['BT-129', 'invoiced quantity', line.invoicedQuantity], ['EXT-FR-FE-191', 'number of units in a parent line unit', line.unitsInParentLine], ['EXT-FR-FE-181', 'line total VAT amount', line.vatAmount], ['EXT-FR-FE-182', 'line total VAT amount in accounting currency', line.vatAmountInAccountingCurrency], ['EXT-FR-FE-184', 'line grand total amount', line.grandTotalAmount])

    // BT-127 is mandatory in each line note, as BT-22 in each BG-1; a subject code alone names the term it needs.
    for (const note of line.notes) {
      if (note.subjectCode !== undefined && empty(note.note))
        needs.push(['EXT-FR-FE-183', 'invoice line note subject code', 'BT-127', 'invoice line note', true])
      else
        mandatory.push(['BT-127', 'invoice line note', note.note])
    }

    const { price, vat, item } = line
    if (!price && !extended)
      mandatory.push(['BG-29', 'price details', undefined])
    if (price) {
      mandatory.push(['BT-146', 'item net price', price.netPrice])
      finite.push(['BT-149', 'item price base quantity', price.priceBaseQuantity], ['BT-148', 'item gross price', price.grossPrice], ['BT-149-1', 'item gross price base quantity', price.grossPriceBaseQuantity], ['BT-147', 'item price discount', price.priceDiscount])
      const grossGroup = price.grossPriceBaseQuantity !== undefined || price.priceDiscount !== undefined
      if (grossGroup && price.grossPrice === undefined)
        mandatory.push(['BT-148', 'item gross price', undefined])
      needs.push(['EXT-FR-FE-195', 'item price discount reason', 'BT-147', 'item price discount', price.priceDiscountReason !== undefined && price.priceDiscount === undefined])
      needs.push(['EXT-FR-FE-196', 'item price discount reason code', 'BT-147', 'item price discount', price.priceDiscountReasonCode !== undefined && price.priceDiscount === undefined])
      needs.push(['BT-150', 'item price base quantity unit code', 'BT-149', 'item price base quantity', price.priceBaseQuantityUnitCode !== undefined && price.priceBaseQuantity === undefined])
      needs.push(['BT-150-1', 'item gross price base quantity unit code', 'BT-149-1', 'item gross price base quantity', price.grossPriceBaseQuantityUnitCode !== undefined && price.grossPriceBaseQuantity === undefined])
    }

    if (!extended) {
      if (!vat)
        mandatory.push(['BG-30', 'line VAT information', undefined])
      else
        mandatory.push(['BT-151', 'invoiced item VAT category code', vat.categoryCode])
    }
    if (vat)
      finite.push(['BT-152', 'invoiced item VAT rate', vat.rate])

    mandatory.push(['BT-153', 'item name', item?.name])
    if (item?.standardIdentifier)
      mandatory.push(['BT-157', 'item standard identifier', item.standardIdentifier.value], ['BT-157-1', 'item standard identifier scheme', item.standardIdentifier.schemeId])
    for (const attribute of item?.attributes ?? []) {
      mandatory.push(['BT-160', 'item attribute name', attribute.name])
      if (!extended)
        mandatory.push(['BT-161', 'item attribute value', attribute.value])
      if (attribute.valueQuantity !== undefined)
        mandatory.push(['EXT-FR-FE-161', 'item attribute value unit code', attribute.valueQuantityUnitCode])
      needs.push(['EXT-FR-FE-161', 'item attribute value unit code', 'EXT-FR-FE-160', 'item attribute value quantity', attribute.valueQuantityUnitCode !== undefined && attribute.valueQuantity === undefined])
      finite.push(['EXT-FR-FE-160', 'item attribute value quantity', attribute.valueQuantity])
    }
    for (const classification of item?.classifications ?? [])
      mandatory.push(['BT-158', 'item classification identifier', classification.code], ['BT-158-1', 'item classification scheme identifier', classification.listId])

    for (const allowance of line.allowances) {
      mandatory.push(['BT-136', 'invoice line allowance amount', allowance.amount])
      finite.push(['BT-137', 'invoice line allowance base amount', allowance.baseAmount], ['BT-138', 'invoice line allowance percentage', allowance.percentage])
    }
    for (const charge of line.charges) {
      mandatory.push(['BT-141', 'invoice line charge amount', charge.amount])
      finite.push(['BT-142', 'invoice line charge base amount', charge.baseAmount], ['BT-143', 'invoice line charge percentage', charge.percentage])
    }

    // The XSD of BASIC and EN 16931 has one `IncludedNote` and one line `AdditionalReferencedDocument` (EXTENDED: many).
    if (!extended && line.notes.length > 1)
      throw new Error(`toCii: BT-127 (invoice line note) is carried once at level "${level}"; several need level "extended" or "extended-ctc-fr"`)
    // BASIC has no BT-128 at all: the level gate names it.
    if (level !== 'basic' && !extended && line.objectIdentifiers.length > 1)
      throw new Error(`toCii: BT-128 (invoice line object identifier) is carried once at level "${level}"; several need level "extended" or "extended-ctc-fr"`)
    if (line.period && line.period.startDate === undefined && line.period.endDate === undefined)
      throw new Error('toCii: BG-26 (invoice line period) needs BT-134 (start date) or BT-135 (end date) (BR-CO-20)')
    if (line.precedingInvoiceReferences.length > 1)
      throw new Error('toCii: EXT-FR-FE-BG-06 (preceding invoice reference of the line) holds one reference in CII; the model has more')
    for (const identifier of line.deliverTo?.identifiers ?? [])
      mandatory.push(['EXT-FR-FE-148', 'deliver to identifier scheme of the line', identifier.schemeId])
    if (line.deliverTo?.address)
      mandatory.push(['EXT-FR-FE-157', 'deliver to country code of the line', line.deliverTo.address.countryCode])
    if (line.actualDelivery)
      mandatory.push(['EXT-FR-FE-158', 'actual delivery date of the line', line.actualDelivery.actualDeliveryDate])
    for (const identifier of line.seller?.identifiers ?? [])
      mandatory.push(['EXT-FR-FE-166-1', 'line seller identifier scheme', identifier.schemeId])
    if (line.seller?.electronicAddress)
      mandatory.push(['EXT-FR-FE-170-1', 'line seller electronic address scheme', line.seller.electronicAddress.schemeId])
    if (line.seller?.address)
      mandatory.push(['EXT-FR-FE-177', 'line seller country code', line.seller.address.countryCode])
    if (line.deliveryTerms)
      mandatory.push(['EXT-FR-FE-193', 'delivery type code of the line', line.deliveryTerms.deliveryTypeCode])
  }

  for (const [id, term, value] of mandatory) {
    if (empty(value))
      throw new Error(`toCii: ${id} (${term}) is mandatory and empty`)
  }
  for (const [id, term, other, otherTerm, present] of needs) {
    if (present)
      throw new Error(`toCii: ${id} (${term}) needs ${other} (${otherTerm})`)
  }
  for (const [id, term, value] of finite) {
    if (typeof value === 'number' && !Number.isFinite(value))
      throw new Error(`toCii: ${id} (${term}) must be a finite number`)
  }
  for (const line of invoice.lines) {
    if (line.vatAmountInAccountingCurrency !== undefined && (invoice.vatAccountingCurrencyCode === undefined || invoice.vatAccountingCurrencyCode === ''))
      throw new Error('toCii: EXT-FR-FE-182 (line total VAT amount in accounting currency) needs BT-6 (VAT accounting currency code)')
    for (const charge of line.charges) {
      if (charge.reasonCode !== undefined && charge.nonVatTaxCode !== undefined)
        throw new Error('toCii: BT-145 (invoice line charge reason code) and BT-193 (invoice line level non-VAT tax code) share one CII element: set only one')
    }
  }
}
