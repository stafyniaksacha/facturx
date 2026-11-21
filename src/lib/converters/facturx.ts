import type { XmlElement } from 'libxml2-wasm'
import type {
  CrossIndustryInvoiceType,
  ExchangedDocumentContextType,
  ExchangedDocumentType,
  HeaderTradeAgreementType,
  HeaderTradeDeliveryType,
  HeaderTradeSettlementType,
  SupplyChainTradeTransactionType,
} from '../models/facturx/crossIndustryInvoice'
import type * as ram from '../models/facturx/reusableTypes'
import type * as udt from '../models/facturx/unqualifiedTypes'
import { XmlDocument } from 'libxml2-wasm'
import { qname } from './qname'

/**
 * Converter for FacturX CrossIndustryInvoice model to XML.
 *
 * Element emission follows the xs:sequence order of the Factur-X 1.09 (CII D22B)
 * EXTENDED schema, which is a superset of all lower profiles. Only fields that
 * are present on the model are emitted, so the same converter produces valid
 * output for MINIMUM through EXTENDED.
 *
 * The returned document's nodes carry the CII namespaces (namespace-bound XPath works on it). The caller owns it and
 * disposes it.
 */
export async function invoiceToXml(invoice: CrossIndustryInvoiceType): Promise<XmlDocument> {
  const xmlString = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
</rsm:CrossIndustryInvoice>`

  const doc = XmlDocument.fromString(xmlString)

  // Every element is created through `qname()`, so it carries its CII namespace in memory (was CG-74): namespace-bound
  // XPath works on the returned document, and nothing is re-parsed, so no parse limit applies to what is written.
  try {
    const rootElement = doc.root

    convertExchangedDocumentContext(invoice.exchangedDocumentContext, rootElement)
    convertExchangedDocument(invoice.exchangedDocument, rootElement)
    convertSupplyChainTradeTransaction(invoice.supplyChainTradeTransaction, rootElement)
  }
  catch (error) {
    // The caller owns the returned document, but only on success
    doc.dispose()
    throw error
  }

  return doc
}

// ---------------------------------------------------------------------------
// Primitive (Unqualified / Qualified data type) converters
// ---------------------------------------------------------------------------

/** *Amount* data type: at most 2 decimals (§7.1.5 p.35, BR-DEC-*). */
function convertAmount({ value, currencyID }: udt.AmountType, parent: XmlElement): XmlElement {
  // `toFixed()` falls back to exponent notation from 1e21 up, which `xs:decimal` rejects (was CG-28).
  const fixed = value.toFixed(2)
  parent.addText(/e/i.test(fixed) ? formatDecimal(value) : fixed)
  if (currencyID) {
    parent.setAttr('currencyID', currencyID)
  }
  return parent
}

/**
 * Unit Price Amount* data type (BT-146, BT-147, BT-148, BT-X-35, BT-X-301, BT-X-302): no limit
 * on decimals (§7.1.5 p.35, e.g. `1000.3454`), so it is written as is, never rounded (was CG-01).
 */
function convertUnitPriceAmount({ value, currencyID }: udt.AmountType, parent: XmlElement): XmlElement {
  parent.addText(formatDecimal(value))
  if (currencyID) {
    parent.setAttr('currencyID', currencyID)
  }
  return parent
}

/**
 * Writes a number as an `xs:decimal` lexical value: the shortest string that reads back as the same
 * number, without the exponent notation (`1e-7`) `String()` uses for very small or large values.
 * Every `xs:decimal` the converter writes goes through it: unit prices (was CG-01), quantities,
 * measures, rates, percentages and numerics (was CG-28).
 */
export function formatDecimal(value: number): string {
  const text = String(value)
  if (!/e/i.test(text)) {
    return text
  }
  const [mantissa, exponentText] = text.toLowerCase().split('e')
  const exponent = Number(exponentText)
  const negative = mantissa.startsWith('-')
  const [intPart, fracPart = ''] = mantissa.replace('-', '').split('.')
  const digits = intPart + fracPart
  const point = intPart.length + exponent
  let result: string
  if (point <= 0) {
    result = `0.${'0'.repeat(-point)}${digits}`
  }
  else if (point >= digits.length) {
    result = digits + '0'.repeat(point - digits.length)
  }
  else {
    result = `${digits.slice(0, point)}.${digits.slice(point)}`
  }
  return negative ? `-${result}` : result
}

function convertID({ value, schemeID }: udt.IDType, parent: XmlElement): XmlElement {
  parent.addText(value)
  if (schemeID) {
    parent.setAttr('schemeID', schemeID)
  }
  return parent
}

function convertText({ value }: udt.TextType, parent: XmlElement): XmlElement {
  parent.addText(value)
  return parent
}

function convertCode({ value, listID, listVersionID }: udt.CodeType, parent: XmlElement): XmlElement {
  parent.addText(value)
  if (listID) {
    parent.setAttr('listID', listID)
  }
  if (listVersionID) {
    parent.setAttr('listVersionID', listVersionID)
  }
  return parent
}

function convertQuantity({ value, unitCode }: udt.QuantityType, parent: XmlElement): XmlElement {
  parent.addText(formatDecimal(value))
  if (unitCode) {
    parent.setAttr('unitCode', unitCode)
  }
  return parent
}

function convertMeasure({ value, unitCode }: udt.MeasureType, parent: XmlElement): XmlElement {
  parent.addText(formatDecimal(value))
  if (unitCode) {
    parent.setAttr('unitCode', unitCode)
  }
  return parent
}

function convertDateTime({ dateTimeString, format }: udt.DateTimeType, parent: XmlElement): XmlElement {
  const el = parent.addElement(...qname('udt:DateTimeString'))
  el.addText(dateTimeString)
  el.setAttr('format', format)
  return parent
}

function convertDate({ dateString, format }: udt.DateType, parent: XmlElement): XmlElement {
  const el = parent.addElement(...qname('udt:DateString'))
  el.addText(dateString)
  el.setAttr('format', format)
  return parent
}

/** FormattedDateTimeType uses the qdt:DateTimeString element (qualified namespace). */
function convertFormattedDateTime(
  { dateTimeString, format }: { dateTimeString: string, format: string },
  parent: XmlElement,
): XmlElement {
  const el = parent.addElement(...qname('qdt:DateTimeString'))
  el.addText(dateTimeString)
  el.setAttr('format', format)
  return parent
}

function convertIndicator({ indicator }: udt.IndicatorType, parent: XmlElement): XmlElement {
  parent.addElement(...qname('udt:Indicator')).addText(String(indicator))
  return parent
}

function convertBinaryObject({ value, mimeCode, filename }: udt.BinaryObjectType, parent: XmlElement): XmlElement {
  parent.addText(value)
  parent.setAttr('mimeCode', mimeCode)
  parent.setAttr('filename', filename)
  return parent
}

// ---------------------------------------------------------------------------
// ExchangedDocumentContext
// ---------------------------------------------------------------------------

function convertExchangedDocumentContext(
  {
    testIndicator,
    businessProcessSpecifiedDocumentContextParameter,
    guidelineSpecifiedDocumentContextParameter,
  }: ExchangedDocumentContextType,
  parent: XmlElement,
): void {
  const context = parent.addElement(...qname('rsm:ExchangedDocumentContext'))

  if (testIndicator) {
    convertIndicator(testIndicator, context.addElement(...qname('ram:TestIndicator')))
  }

  if (businessProcessSpecifiedDocumentContextParameter) {
    convertDocumentContextParameter(
      businessProcessSpecifiedDocumentContextParameter,
      context.addElement(...qname('ram:BusinessProcessSpecifiedDocumentContextParameter')),
    )
  }

  convertDocumentContextParameter(
    guidelineSpecifiedDocumentContextParameter,
    context.addElement(...qname('ram:GuidelineSpecifiedDocumentContextParameter')),
  )
}

function convertDocumentContextParameter({ id }: ram.DocumentContextParameterType, parent: XmlElement): void {
  convertID(id, parent.addElement(...qname('ram:ID')))
}

// ---------------------------------------------------------------------------
// ExchangedDocument
// ---------------------------------------------------------------------------

function convertExchangedDocument(
  { id, name, typeCode, issueDateTime, copyIndicator, languageID, includedNote, effectiveSpecifiedPeriod }: ExchangedDocumentType,
  parent: XmlElement,
): void {
  const doc = parent.addElement(...qname('rsm:ExchangedDocument'))

  convertID(id, doc.addElement(...qname('ram:ID')))

  if (name) {
    convertText(name, doc.addElement(...qname('ram:Name')))
  }

  doc.addElement(...qname('ram:TypeCode')).addText(typeCode.value)

  convertDateTime(issueDateTime, doc.addElement(...qname('ram:IssueDateTime')))

  if (copyIndicator) {
    convertIndicator(copyIndicator, doc.addElement(...qname('ram:CopyIndicator')))
  }

  if (languageID && languageID.length > 0) {
    languageID.forEach(lang => convertID(lang, doc.addElement(...qname('ram:LanguageID'))))
  }

  if (includedNote && includedNote.length > 0) {
    includedNote.forEach(note => convertNote(note, doc.addElement(...qname('ram:IncludedNote'))))
  }

  if (effectiveSpecifiedPeriod) {
    convertSpecifiedPeriod(effectiveSpecifiedPeriod, doc.addElement(...qname('ram:EffectiveSpecifiedPeriod')))
  }
}

function convertNote({ contentCode, content, subjectCode }: ram.NoteType, parent: XmlElement): void {
  if (contentCode) {
    convertCode(contentCode, parent.addElement(...qname('ram:ContentCode')))
  }
  if (content) {
    convertText(content, parent.addElement(...qname('ram:Content')))
  }
  if (subjectCode) {
    convertCode(subjectCode, parent.addElement(...qname('ram:SubjectCode')))
  }
}

function convertSpecifiedPeriod(
  { description, startDateTime, endDateTime, completeDateTime }: ram.SpecifiedPeriodType,
  parent: XmlElement,
): void {
  if (description) {
    convertText(description, parent.addElement(...qname('ram:Description')))
  }
  if (startDateTime) {
    convertDateTime(startDateTime, parent.addElement(...qname('ram:StartDateTime')))
  }
  if (endDateTime) {
    convertDateTime(endDateTime, parent.addElement(...qname('ram:EndDateTime')))
  }
  if (completeDateTime) {
    convertDateTime(completeDateTime, parent.addElement(...qname('ram:CompleteDateTime')))
  }
}

// ---------------------------------------------------------------------------
// SupplyChainTradeTransaction
// ---------------------------------------------------------------------------

function convertSupplyChainTradeTransaction(
  {
    includedSupplyChainTradeLineItem,
    applicableHeaderTradeAgreement,
    applicableHeaderTradeDelivery,
    applicableHeaderTradeSettlement,
  }: SupplyChainTradeTransactionType,
  parent: XmlElement,
): void {
  const transaction = parent.addElement(...qname('rsm:SupplyChainTradeTransaction'))

  if (includedSupplyChainTradeLineItem && includedSupplyChainTradeLineItem.length > 0) {
    includedSupplyChainTradeLineItem.forEach((lineItem) => {
      convertSupplyChainTradeLineItem(lineItem, transaction.addElement(...qname('ram:IncludedSupplyChainTradeLineItem')))
    })
  }

  convertHeaderTradeAgreement(applicableHeaderTradeAgreement, transaction.addElement(...qname('ram:ApplicableHeaderTradeAgreement')))
  convertHeaderTradeDelivery(applicableHeaderTradeDelivery, transaction.addElement(...qname('ram:ApplicableHeaderTradeDelivery')))
  convertHeaderTradeSettlement(applicableHeaderTradeSettlement, transaction.addElement(...qname('ram:ApplicableHeaderTradeSettlement')))
}

// ---------------------------------------------------------------------------
// Line items
// ---------------------------------------------------------------------------

function convertSupplyChainTradeLineItem(lineItem: ram.SupplyChainTradeLineItemType, parent: XmlElement): void {
  convertDocumentLineDocument(lineItem.associatedDocumentLineDocument, parent.addElement(...qname('ram:AssociatedDocumentLineDocument')))
  convertTradeProduct(lineItem.specifiedTradeProduct, parent.addElement(...qname('ram:SpecifiedTradeProduct')))

  if (lineItem.specifiedLineTradeAgreement) {
    convertLineTradeAgreement(lineItem.specifiedLineTradeAgreement, parent.addElement(...qname('ram:SpecifiedLineTradeAgreement')))
  }
  if (lineItem.specifiedLineTradeDelivery) {
    convertLineTradeDelivery(lineItem.specifiedLineTradeDelivery, parent.addElement(...qname('ram:SpecifiedLineTradeDelivery')))
  }
  if (lineItem.specifiedLineTradeSettlement) {
    convertLineTradeSettlement(lineItem.specifiedLineTradeSettlement, parent.addElement(...qname('ram:SpecifiedLineTradeSettlement')))
  }
}

function convertDocumentLineDocument(
  { lineID, parentLineID, lineStatusCode, lineStatusReasonCode, includedNote }: ram.DocumentLineDocumentType,
  parent: XmlElement,
): void {
  convertID(lineID, parent.addElement(...qname('ram:LineID')))
  if (parentLineID) {
    convertID(parentLineID, parent.addElement(...qname('ram:ParentLineID')))
  }
  if (lineStatusCode) {
    parent.addElement(...qname('ram:LineStatusCode')).addText(lineStatusCode.value)
  }
  if (lineStatusReasonCode) {
    convertCode(lineStatusReasonCode, parent.addElement(...qname('ram:LineStatusReasonCode')))
  }
  if (includedNote && includedNote.length > 0) {
    includedNote.forEach(note => convertNote(note, parent.addElement(...qname('ram:IncludedNote'))))
  }
}

function convertTradeProduct(
  {
    id,
    globalID,
    sellerAssignedID,
    buyerAssignedID,
    industryAssignedID,
    modelID,
    name,
    description,
    batchID,
    brandName,
    modelName,
    applicableProductCharacteristic,
    designatedProductClassification,
    individualTradeProductInstance,
    originTradeCountry,
    manufacturerTradeParty,
    includedReferencedProduct,
  }: ram.TradeProductType,
  parent: XmlElement,
): void {
  if (id) {
    convertID(id, parent.addElement(...qname('ram:ID')))
  }
  if (globalID) {
    convertID(globalID, parent.addElement(...qname('ram:GlobalID')))
  }
  if (sellerAssignedID) {
    convertID(sellerAssignedID, parent.addElement(...qname('ram:SellerAssignedID')))
  }
  if (buyerAssignedID) {
    convertID(buyerAssignedID, parent.addElement(...qname('ram:BuyerAssignedID')))
  }
  if (industryAssignedID) {
    convertID(industryAssignedID, parent.addElement(...qname('ram:IndustryAssignedID')))
  }
  if (modelID) {
    convertID(modelID, parent.addElement(...qname('ram:ModelID')))
  }
  if (name) {
    convertText(name, parent.addElement(...qname('ram:Name')))
  }
  if (description) {
    convertText(description, parent.addElement(...qname('ram:Description')))
  }
  if (batchID && batchID.length > 0) {
    batchID.forEach(b => convertID(b, parent.addElement(...qname('ram:BatchID'))))
  }
  if (brandName) {
    convertText(brandName, parent.addElement(...qname('ram:BrandName')))
  }
  if (modelName) {
    convertText(modelName, parent.addElement(...qname('ram:ModelName')))
  }
  if (applicableProductCharacteristic && applicableProductCharacteristic.length > 0) {
    applicableProductCharacteristic.forEach(c => convertProductCharacteristic(c, parent.addElement(...qname('ram:ApplicableProductCharacteristic'))))
  }
  if (designatedProductClassification && designatedProductClassification.length > 0) {
    designatedProductClassification.forEach(c => convertProductClassification(c, parent.addElement(...qname('ram:DesignatedProductClassification'))))
  }
  if (individualTradeProductInstance && individualTradeProductInstance.length > 0) {
    individualTradeProductInstance.forEach(i => convertTradeProductInstance(i, parent.addElement(...qname('ram:IndividualTradeProductInstance'))))
  }
  if (originTradeCountry?.id) {
    parent.addElement(...qname('ram:OriginTradeCountry')).addElement(...qname('ram:ID')).addText(originTradeCountry.id.value)
  }
  if (manufacturerTradeParty) {
    convertTradeParty(manufacturerTradeParty, parent.addElement(...qname('ram:ManufacturerTradeParty')))
  }
  if (includedReferencedProduct && includedReferencedProduct.length > 0) {
    includedReferencedProduct.forEach(p => convertReferencedProduct(p, parent.addElement(...qname('ram:IncludedReferencedProduct'))))
  }
}

function convertProductCharacteristic(
  { typeCode, description, valueMeasure, value }: ram.ProductCharacteristicType,
  parent: XmlElement,
): void {
  if (typeCode) {
    convertCode(typeCode, parent.addElement(...qname('ram:TypeCode')))
  }
  if (description) {
    convertText(description, parent.addElement(...qname('ram:Description')))
  }
  if (valueMeasure) {
    convertMeasure(valueMeasure, parent.addElement(...qname('ram:ValueMeasure')))
  }
  if (value) {
    convertText(value, parent.addElement(...qname('ram:Value')))
  }
}

function convertProductClassification(
  { classCode, className }: ram.ProductClassificationType,
  parent: XmlElement,
): void {
  if (classCode) {
    convertCode(classCode, parent.addElement(...qname('ram:ClassCode')))
  }
  if (className) {
    convertText(className, parent.addElement(...qname('ram:ClassName')))
  }
}

function convertTradeProductInstance(
  { batchID, supplierAssignedSerialID }: ram.TradeProductInstanceType,
  parent: XmlElement,
): void {
  if (batchID) {
    convertID(batchID, parent.addElement(...qname('ram:BatchID')))
  }
  if (supplierAssignedSerialID) {
    convertID(supplierAssignedSerialID, parent.addElement(...qname('ram:SupplierAssignedSerialID')))
  }
}

function convertReferencedProduct(
  { id, globalID, sellerAssignedID, buyerAssignedID, industryAssignedID, name, description, unitQuantity }: ram.ReferencedProductType,
  parent: XmlElement,
): void {
  if (id) {
    convertID(id, parent.addElement(...qname('ram:ID')))
  }
  if (globalID && globalID.length > 0) {
    globalID.forEach(g => convertID(g, parent.addElement(...qname('ram:GlobalID'))))
  }
  if (sellerAssignedID) {
    convertID(sellerAssignedID, parent.addElement(...qname('ram:SellerAssignedID')))
  }
  if (buyerAssignedID) {
    convertID(buyerAssignedID, parent.addElement(...qname('ram:BuyerAssignedID')))
  }
  if (industryAssignedID) {
    convertID(industryAssignedID, parent.addElement(...qname('ram:IndustryAssignedID')))
  }
  convertText(name, parent.addElement(...qname('ram:Name')))
  if (description) {
    convertText(description, parent.addElement(...qname('ram:Description')))
  }
  if (unitQuantity) {
    convertQuantity(unitQuantity, parent.addElement(...qname('ram:UnitQuantity')))
  }
}

function convertLineTradeAgreement(
  {
    applicableTradeDeliveryTerms,
    sellerOrderReferencedDocument,
    buyerOrderReferencedDocument,
    quotationReferencedDocument,
    contractReferencedDocument,
    additionalReferencedDocument,
    grossPriceProductTradePrice,
    netPriceProductTradePrice,
    itemSellerTradeParty,
    ultimateCustomerOrderReferencedDocument,
  }: ram.LineTradeAgreementType,
  parent: XmlElement,
): void {
  if (applicableTradeDeliveryTerms) {
    convertTradeDeliveryTerms(applicableTradeDeliveryTerms, parent.addElement(...qname('ram:ApplicableTradeDeliveryTerms')))
  }
  if (sellerOrderReferencedDocument) {
    convertReferencedDocument(sellerOrderReferencedDocument, parent.addElement(...qname('ram:SellerOrderReferencedDocument')))
  }
  if (buyerOrderReferencedDocument) {
    convertReferencedDocument(buyerOrderReferencedDocument, parent.addElement(...qname('ram:BuyerOrderReferencedDocument')))
  }
  if (quotationReferencedDocument) {
    convertReferencedDocument(quotationReferencedDocument, parent.addElement(...qname('ram:QuotationReferencedDocument')))
  }
  if (contractReferencedDocument) {
    convertReferencedDocument(contractReferencedDocument, parent.addElement(...qname('ram:ContractReferencedDocument')))
  }
  if (additionalReferencedDocument && additionalReferencedDocument.length > 0) {
    additionalReferencedDocument.forEach(d => convertReferencedDocument(d, parent.addElement(...qname('ram:AdditionalReferencedDocument'))))
  }
  if (grossPriceProductTradePrice) {
    convertTradePrice(grossPriceProductTradePrice, parent.addElement(...qname('ram:GrossPriceProductTradePrice')))
  }
  if (netPriceProductTradePrice) {
    convertTradePrice(netPriceProductTradePrice, parent.addElement(...qname('ram:NetPriceProductTradePrice')))
  }
  if (itemSellerTradeParty) {
    convertTradeParty(itemSellerTradeParty, parent.addElement(...qname('ram:ItemSellerTradeParty')))
  }
  if (ultimateCustomerOrderReferencedDocument && ultimateCustomerOrderReferencedDocument.length > 0) {
    ultimateCustomerOrderReferencedDocument.forEach(d => convertReferencedDocument(d, parent.addElement(...qname('ram:UltimateCustomerOrderReferencedDocument'))))
  }
}

function convertTradePrice(
  { chargeAmount, basisQuantity, appliedTradeAllowanceCharge, includedTradeTax }: ram.TradePriceType,
  parent: XmlElement,
): void {
  if (chargeAmount) {
    // BT-146 / BT-148
    convertUnitPriceAmount(chargeAmount, parent.addElement(...qname('ram:ChargeAmount')))
  }
  if (basisQuantity) {
    convertQuantity(basisQuantity, parent.addElement(...qname('ram:BasisQuantity')))
  }
  if (appliedTradeAllowanceCharge && appliedTradeAllowanceCharge.length > 0) {
    // BT-147 / BT-X-302 and their base amounts BT-X-35 / BT-X-301 are unit prices too.
    appliedTradeAllowanceCharge.forEach(ac => convertAllowanceCharge(ac, parent.addElement(...qname('ram:AppliedTradeAllowanceCharge')), true))
  }
  if (includedTradeTax) {
    convertTradeTax(includedTradeTax, parent.addElement(...qname('ram:IncludedTradeTax')))
  }
}

function convertLineTradeDelivery(
  {
    billedQuantity,
    chargeFreeQuantity,
    packageQuantity,
    perPackageUnitQuantity,
    shipToTradeParty,
    ultimateShipToTradeParty,
    actualDeliverySupplyChainEvent,
    despatchAdviceReferencedDocument,
    receivingAdviceReferencedDocument,
    deliveryNoteReferencedDocument,
  }: ram.LineTradeDeliveryType,
  parent: XmlElement,
): void {
  if (billedQuantity) {
    convertQuantity(billedQuantity, parent.addElement(...qname('ram:BilledQuantity')))
  }
  if (chargeFreeQuantity) {
    convertQuantity(chargeFreeQuantity, parent.addElement(...qname('ram:ChargeFreeQuantity')))
  }
  if (packageQuantity) {
    convertQuantity(packageQuantity, parent.addElement(...qname('ram:PackageQuantity')))
  }
  if (perPackageUnitQuantity) {
    convertQuantity(perPackageUnitQuantity, parent.addElement(...qname('ram:PerPackageUnitQuantity')))
  }
  if (shipToTradeParty) {
    convertTradeParty(shipToTradeParty, parent.addElement(...qname('ram:ShipToTradeParty')))
  }
  if (ultimateShipToTradeParty) {
    convertTradeParty(ultimateShipToTradeParty, parent.addElement(...qname('ram:UltimateShipToTradeParty')))
  }
  if (actualDeliverySupplyChainEvent) {
    convertSupplyChainEvent(actualDeliverySupplyChainEvent, parent.addElement(...qname('ram:ActualDeliverySupplyChainEvent')))
  }
  if (despatchAdviceReferencedDocument) {
    convertReferencedDocument(despatchAdviceReferencedDocument, parent.addElement(...qname('ram:DespatchAdviceReferencedDocument')))
  }
  if (receivingAdviceReferencedDocument) {
    convertReferencedDocument(receivingAdviceReferencedDocument, parent.addElement(...qname('ram:ReceivingAdviceReferencedDocument')))
  }
  if (deliveryNoteReferencedDocument) {
    convertReferencedDocument(deliveryNoteReferencedDocument, parent.addElement(...qname('ram:DeliveryNoteReferencedDocument')))
  }
}

function convertLineTradeSettlement(
  {
    applicableTradeTax,
    billingSpecifiedPeriod,
    specifiedTradeAllowanceCharge,
    specifiedTradeSettlementLineMonetarySummation,
    invoiceReferencedDocument,
    additionalReferencedDocument,
    receivableSpecifiedTradeAccountingAccount,
  }: ram.LineTradeSettlementType,
  parent: XmlElement,
): void {
  if (applicableTradeTax && applicableTradeTax.length > 0) {
    applicableTradeTax.forEach(tax => convertTradeTax(tax, parent.addElement(...qname('ram:ApplicableTradeTax'))))
  }
  if (billingSpecifiedPeriod) {
    convertSpecifiedPeriod(billingSpecifiedPeriod, parent.addElement(...qname('ram:BillingSpecifiedPeriod')))
  }
  if (specifiedTradeAllowanceCharge && specifiedTradeAllowanceCharge.length > 0) {
    specifiedTradeAllowanceCharge.forEach(ac => convertAllowanceCharge(ac, parent.addElement(...qname('ram:SpecifiedTradeAllowanceCharge'))))
  }
  if (specifiedTradeSettlementLineMonetarySummation) {
    convertTradeSettlementLineMonetarySummation(
      specifiedTradeSettlementLineMonetarySummation,
      parent.addElement(...qname('ram:SpecifiedTradeSettlementLineMonetarySummation')),
    )
  }
  if (invoiceReferencedDocument) {
    convertReferencedDocument(invoiceReferencedDocument, parent.addElement(...qname('ram:InvoiceReferencedDocument')))
  }
  if (additionalReferencedDocument && additionalReferencedDocument.length > 0) {
    additionalReferencedDocument.forEach(d => convertReferencedDocument(d, parent.addElement(...qname('ram:AdditionalReferencedDocument'))))
  }
  if (receivableSpecifiedTradeAccountingAccount && receivableSpecifiedTradeAccountingAccount.length > 0) {
    receivableSpecifiedTradeAccountingAccount.forEach(a => convertTradeAccountingAccount(a, parent.addElement(...qname('ram:ReceivableSpecifiedTradeAccountingAccount'))))
  }
}

function convertTradeSettlementLineMonetarySummation(
  { lineTotalAmount, chargeTotalAmount, allowanceTotalAmount, taxTotalAmount, taxTotalAmountInAccountingCurrency, grandTotalAmount, totalAllowanceChargeAmount }: ram.TradeSettlementLineMonetarySummationType,
  parent: XmlElement,
): void {
  if (lineTotalAmount) {
    convertAmount(lineTotalAmount, parent.addElement(...qname('ram:LineTotalAmount')))
  }
  if (chargeTotalAmount) {
    convertAmount(chargeTotalAmount, parent.addElement(...qname('ram:ChargeTotalAmount')))
  }
  if (allowanceTotalAmount) {
    convertAmount(allowanceTotalAmount, parent.addElement(...qname('ram:AllowanceTotalAmount')))
  }
  if (taxTotalAmount) {
    convertAmount(taxTotalAmount, parent.addElement(...qname('ram:TaxTotalAmount')))
  }
  // BT-X-590 (EXT-FR-FE-182): a second TaxTotalAmount (EXTENDED XSD maxOccurs="2"), VAT accounting currency.
  if (taxTotalAmountInAccountingCurrency) {
    convertAmount(taxTotalAmountInAccountingCurrency, parent.addElement(...qname('ram:TaxTotalAmount')))
  }
  if (grandTotalAmount) {
    convertAmount(grandTotalAmount, parent.addElement(...qname('ram:GrandTotalAmount')))
  }
  if (totalAllowanceChargeAmount) {
    convertAmount(totalAllowanceChargeAmount, parent.addElement(...qname('ram:TotalAllowanceChargeAmount')))
  }
}

// ---------------------------------------------------------------------------
// Header trade agreement
// ---------------------------------------------------------------------------

function convertHeaderTradeAgreement(
  {
    buyerReference,
    sellerTradeParty,
    buyerTradeParty,
    salesAgentTradeParty,
    buyerTaxRepresentativeTradeParty,
    sellerTaxRepresentativeTradeParty,
    productEndUserTradeParty,
    applicableTradeDeliveryTerms,
    sellerOrderReferencedDocument,
    buyerOrderReferencedDocument,
    quotationReferencedDocument,
    contractReferencedDocument,
    additionalReferencedDocument,
    buyerAgentTradeParty,
    specifiedProcuringProject,
    ultimateCustomerOrderReferencedDocument,
  }: HeaderTradeAgreementType,
  parent: XmlElement,
): void {
  if (buyerReference) {
    convertText(buyerReference, parent.addElement(...qname('ram:BuyerReference')))
  }

  convertTradeParty(sellerTradeParty, parent.addElement(...qname('ram:SellerTradeParty')))
  convertTradeParty(buyerTradeParty, parent.addElement(...qname('ram:BuyerTradeParty')))

  if (salesAgentTradeParty) {
    convertTradeParty(salesAgentTradeParty, parent.addElement(...qname('ram:SalesAgentTradeParty')))
  }
  if (buyerTaxRepresentativeTradeParty) {
    convertTradeParty(buyerTaxRepresentativeTradeParty, parent.addElement(...qname('ram:BuyerTaxRepresentativeTradeParty')))
  }
  if (sellerTaxRepresentativeTradeParty) {
    convertTradeParty(sellerTaxRepresentativeTradeParty, parent.addElement(...qname('ram:SellerTaxRepresentativeTradeParty')))
  }
  if (productEndUserTradeParty) {
    convertTradeParty(productEndUserTradeParty, parent.addElement(...qname('ram:ProductEndUserTradeParty')))
  }
  if (applicableTradeDeliveryTerms) {
    convertTradeDeliveryTerms(applicableTradeDeliveryTerms, parent.addElement(...qname('ram:ApplicableTradeDeliveryTerms')))
  }
  if (sellerOrderReferencedDocument) {
    convertReferencedDocument(sellerOrderReferencedDocument, parent.addElement(...qname('ram:SellerOrderReferencedDocument')))
  }
  if (buyerOrderReferencedDocument) {
    convertReferencedDocument(buyerOrderReferencedDocument, parent.addElement(...qname('ram:BuyerOrderReferencedDocument')))
  }
  if (quotationReferencedDocument) {
    convertReferencedDocument(quotationReferencedDocument, parent.addElement(...qname('ram:QuotationReferencedDocument')))
  }
  if (contractReferencedDocument) {
    convertReferencedDocument(contractReferencedDocument, parent.addElement(...qname('ram:ContractReferencedDocument')))
  }
  if (additionalReferencedDocument && additionalReferencedDocument.length > 0) {
    additionalReferencedDocument.forEach(d => convertReferencedDocument(d, parent.addElement(...qname('ram:AdditionalReferencedDocument'))))
  }
  if (buyerAgentTradeParty) {
    convertTradeParty(buyerAgentTradeParty, parent.addElement(...qname('ram:BuyerAgentTradeParty')))
  }
  if (specifiedProcuringProject) {
    convertProcuringProject(specifiedProcuringProject, parent.addElement(...qname('ram:SpecifiedProcuringProject')))
  }
  if (ultimateCustomerOrderReferencedDocument && ultimateCustomerOrderReferencedDocument.length > 0) {
    ultimateCustomerOrderReferencedDocument.forEach(d => convertReferencedDocument(d, parent.addElement(...qname('ram:UltimateCustomerOrderReferencedDocument'))))
  }
}

function convertProcuringProject({ id, name }: ram.ProcuringProjectType, parent: XmlElement): void {
  convertID(id, parent.addElement(...qname('ram:ID')))
  convertText(name, parent.addElement(...qname('ram:Name')))
}

function convertTradeDeliveryTerms({ deliveryTypeCode, relevantTradeLocation }: ram.TradeDeliveryTermsType, parent: XmlElement): void {
  if (deliveryTypeCode) {
    parent.addElement(...qname('ram:DeliveryTypeCode')).addText(deliveryTypeCode.value)
  }
  if (relevantTradeLocation) {
    const el = parent.addElement(...qname('ram:RelevantTradeLocation'))
    if (relevantTradeLocation.countryID) {
      el.addElement(...qname('ram:CountryID')).addText(relevantTradeLocation.countryID.value)
    }
    if (relevantTradeLocation.name) {
      convertText(relevantTradeLocation.name, el.addElement(...qname('ram:Name')))
    }
  }
}

// ---------------------------------------------------------------------------
// Trade party
// ---------------------------------------------------------------------------

function convertTradeParty(
  {
    id,
    globalID,
    name,
    roleCode,
    description,
    specifiedLegalOrganization,
    definedTradeContact,
    postalTradeAddress,
    uriUniversalCommunication,
    specifiedTaxRegistration,
  }: ram.TradePartyType,
  parent: XmlElement,
): void {
  if (id && id.length > 0) {
    id.forEach(i => convertID(i, parent.addElement(...qname('ram:ID'))))
  }
  if (globalID && globalID.length > 0) {
    globalID.forEach(g => convertID(g, parent.addElement(...qname('ram:GlobalID'))))
  }
  if (name) {
    convertText(name, parent.addElement(...qname('ram:Name')))
  }
  if (roleCode) {
    parent.addElement(...qname('ram:RoleCode')).addText(roleCode.value)
  }
  if (description) {
    convertText(description, parent.addElement(...qname('ram:Description')))
  }
  if (specifiedLegalOrganization) {
    convertLegalOrganization(specifiedLegalOrganization, parent.addElement(...qname('ram:SpecifiedLegalOrganization')))
  }
  if (definedTradeContact && definedTradeContact.length > 0) {
    definedTradeContact.forEach(c => convertTradeContact(c, parent.addElement(...qname('ram:DefinedTradeContact'))))
  }
  if (postalTradeAddress) {
    convertTradeAddress(postalTradeAddress, parent.addElement(...qname('ram:PostalTradeAddress')))
  }
  if (uriUniversalCommunication) {
    convertUniversalCommunication(uriUniversalCommunication, parent.addElement(...qname('ram:URIUniversalCommunication')))
  }
  if (specifiedTaxRegistration && specifiedTaxRegistration.length > 0) {
    specifiedTaxRegistration.forEach((tax) => {
      const taxEl = parent.addElement(...qname('ram:SpecifiedTaxRegistration'))
      convertID(tax.id, taxEl.addElement(...qname('ram:ID')))
    })
  }
}

function convertLegalOrganization(
  { id, tradingBusinessName, postalTradeAddress }: ram.LegalOrganizationType,
  parent: XmlElement,
): void {
  if (id) {
    convertID(id, parent.addElement(...qname('ram:ID')))
  }
  if (tradingBusinessName) {
    convertText(tradingBusinessName, parent.addElement(...qname('ram:TradingBusinessName')))
  }
  if (postalTradeAddress) {
    convertTradeAddress(postalTradeAddress, parent.addElement(...qname('ram:PostalTradeAddress')))
  }
}

function convertTradeContact(
  { personName, departmentName, typeCode, telephoneUniversalCommunication, faxUniversalCommunication, emailURIUniversalCommunication }: ram.TradeContactType,
  parent: XmlElement,
): void {
  if (personName) {
    convertText(personName, parent.addElement(...qname('ram:PersonName')))
  }
  if (departmentName) {
    convertText(departmentName, parent.addElement(...qname('ram:DepartmentName')))
  }
  if (typeCode) {
    parent.addElement(...qname('ram:TypeCode')).addText(typeCode.value)
  }
  if (telephoneUniversalCommunication) {
    convertUniversalCommunication(telephoneUniversalCommunication, parent.addElement(...qname('ram:TelephoneUniversalCommunication')))
  }
  if (faxUniversalCommunication) {
    convertUniversalCommunication(faxUniversalCommunication, parent.addElement(...qname('ram:FaxUniversalCommunication')))
  }
  if (emailURIUniversalCommunication) {
    convertUniversalCommunication(emailURIUniversalCommunication, parent.addElement(...qname('ram:EmailURIUniversalCommunication')))
  }
}

function convertUniversalCommunication({ uriID, completeNumber }: ram.UniversalCommunicationType, parent: XmlElement): void {
  if (uriID) {
    convertID(uriID, parent.addElement(...qname('ram:URIID')))
  }
  if (completeNumber) {
    convertText(completeNumber, parent.addElement(...qname('ram:CompleteNumber')))
  }
}

function convertTradeAddress(
  { postcodeCode, lineOne, lineTwo, lineThree, cityName, countryID, countrySubDivisionName }: ram.TradeAddressType,
  parent: XmlElement,
): void {
  if (postcodeCode) {
    convertCode(postcodeCode, parent.addElement(...qname('ram:PostcodeCode')))
  }
  if (lineOne) {
    convertText(lineOne, parent.addElement(...qname('ram:LineOne')))
  }
  if (lineTwo) {
    convertText(lineTwo, parent.addElement(...qname('ram:LineTwo')))
  }
  if (lineThree) {
    convertText(lineThree, parent.addElement(...qname('ram:LineThree')))
  }
  if (cityName) {
    convertText(cityName, parent.addElement(...qname('ram:CityName')))
  }
  parent.addElement(...qname('ram:CountryID')).addText(countryID.value)
  if (countrySubDivisionName && countrySubDivisionName.length > 0) {
    countrySubDivisionName.forEach(n => convertText(n, parent.addElement(...qname('ram:CountrySubDivisionName'))))
  }
}

// ---------------------------------------------------------------------------
// Header trade delivery
// ---------------------------------------------------------------------------

function convertHeaderTradeDelivery(
  {
    relatedSupplyChainConsignment,
    shipToTradeParty,
    ultimateShipToTradeParty,
    shipFromTradeParty,
    actualDeliverySupplyChainEvent,
    despatchAdviceReferencedDocument,
    receivingAdviceReferencedDocument,
    deliveryNoteReferencedDocument,
  }: HeaderTradeDeliveryType,
  parent: XmlElement,
): void {
  if (relatedSupplyChainConsignment) {
    convertSupplyChainConsignment(relatedSupplyChainConsignment, parent.addElement(...qname('ram:RelatedSupplyChainConsignment')))
  }
  if (shipToTradeParty) {
    convertTradeParty(shipToTradeParty, parent.addElement(...qname('ram:ShipToTradeParty')))
  }
  if (ultimateShipToTradeParty) {
    convertTradeParty(ultimateShipToTradeParty, parent.addElement(...qname('ram:UltimateShipToTradeParty')))
  }
  if (shipFromTradeParty) {
    convertTradeParty(shipFromTradeParty, parent.addElement(...qname('ram:ShipFromTradeParty')))
  }
  if (actualDeliverySupplyChainEvent) {
    convertSupplyChainEvent(actualDeliverySupplyChainEvent, parent.addElement(...qname('ram:ActualDeliverySupplyChainEvent')))
  }
  if (despatchAdviceReferencedDocument) {
    convertReferencedDocument(despatchAdviceReferencedDocument, parent.addElement(...qname('ram:DespatchAdviceReferencedDocument')))
  }
  if (receivingAdviceReferencedDocument) {
    convertReferencedDocument(receivingAdviceReferencedDocument, parent.addElement(...qname('ram:ReceivingAdviceReferencedDocument')))
  }
  if (deliveryNoteReferencedDocument) {
    convertReferencedDocument(deliveryNoteReferencedDocument, parent.addElement(...qname('ram:DeliveryNoteReferencedDocument')))
  }
}

function convertSupplyChainConsignment({ specifiedLogisticsTransportMovement }: ram.SupplyChainConsignmentType, parent: XmlElement): void {
  if (specifiedLogisticsTransportMovement && specifiedLogisticsTransportMovement.length > 0) {
    specifiedLogisticsTransportMovement.forEach((m) => {
      parent.addElement(...qname('ram:SpecifiedLogisticsTransportMovement')).addElement(...qname('ram:ModeCode')).addText(m.modeCode.value)
    })
  }
}

function convertSupplyChainEvent({ occurrenceDateTime }: ram.SupplyChainEventType, parent: XmlElement): void {
  if (occurrenceDateTime) {
    convertDateTime(occurrenceDateTime, parent.addElement(...qname('ram:OccurrenceDateTime')))
  }
}

// ---------------------------------------------------------------------------
// Header trade settlement
// ---------------------------------------------------------------------------

function convertHeaderTradeSettlement(
  {
    creditorReferenceID,
    paymentReference,
    taxCurrencyCode,
    invoiceCurrencyCode,
    invoiceIssuerReference,
    invoicerTradeParty,
    invoiceeTradeParty,
    payeeTradeParty,
    payerTradeParty,
    taxApplicableTradeCurrencyExchange,
    specifiedTradeSettlementPaymentMeans,
    applicableTradeTax,
    billingSpecifiedPeriod,
    specifiedTradeAllowanceCharge,
    specifiedLogisticsServiceCharge,
    specifiedTradePaymentTerms,
    specifiedTradeSettlementHeaderMonetarySummation,
    specifiedFinancialAdjustment,
    invoiceReferencedDocument,
    receivableSpecifiedTradeAccountingAccount,
    specifiedAdvancePayment,
  }: HeaderTradeSettlementType,
  parent: XmlElement,
): void {
  if (creditorReferenceID) {
    convertID(creditorReferenceID, parent.addElement(...qname('ram:CreditorReferenceID')))
  }
  if (paymentReference) {
    convertText(paymentReference, parent.addElement(...qname('ram:PaymentReference')))
  }
  if (taxCurrencyCode) {
    parent.addElement(...qname('ram:TaxCurrencyCode')).addText(taxCurrencyCode.value)
  }

  parent.addElement(...qname('ram:InvoiceCurrencyCode')).addText(invoiceCurrencyCode.value)

  // The following are EXTENDED-only header parties
  if (invoiceIssuerReference) {
    convertText(invoiceIssuerReference, parent.addElement(...qname('ram:InvoiceIssuerReference')))
  }
  if (invoicerTradeParty) {
    convertTradeParty(invoicerTradeParty, parent.addElement(...qname('ram:InvoicerTradeParty')))
  }
  if (invoiceeTradeParty) {
    convertTradeParty(invoiceeTradeParty, parent.addElement(...qname('ram:InvoiceeTradeParty')))
  }
  if (payeeTradeParty) {
    convertTradeParty(payeeTradeParty, parent.addElement(...qname('ram:PayeeTradeParty')))
  }
  if (payerTradeParty) {
    convertTradeParty(payerTradeParty, parent.addElement(...qname('ram:PayerTradeParty')))
  }
  if (taxApplicableTradeCurrencyExchange) {
    convertTradeCurrencyExchange(taxApplicableTradeCurrencyExchange, parent.addElement(...qname('ram:TaxApplicableTradeCurrencyExchange')))
  }

  if (specifiedTradeSettlementPaymentMeans && specifiedTradeSettlementPaymentMeans.length > 0) {
    specifiedTradeSettlementPaymentMeans.forEach(pm => convertPaymentMeans(pm, parent.addElement(...qname('ram:SpecifiedTradeSettlementPaymentMeans'))))
  }

  if (applicableTradeTax && applicableTradeTax.length > 0) {
    applicableTradeTax.forEach(tax => convertTradeTax(tax, parent.addElement(...qname('ram:ApplicableTradeTax'))))
  }

  if (billingSpecifiedPeriod) {
    convertSpecifiedPeriod(billingSpecifiedPeriod, parent.addElement(...qname('ram:BillingSpecifiedPeriod')))
  }

  if (specifiedTradeAllowanceCharge && specifiedTradeAllowanceCharge.length > 0) {
    specifiedTradeAllowanceCharge.forEach(ac => convertAllowanceCharge(ac, parent.addElement(...qname('ram:SpecifiedTradeAllowanceCharge'))))
  }

  if (specifiedLogisticsServiceCharge && specifiedLogisticsServiceCharge.length > 0) {
    specifiedLogisticsServiceCharge.forEach(c => convertLogisticsServiceCharge(c, parent.addElement(...qname('ram:SpecifiedLogisticsServiceCharge'))))
  }

  if (specifiedTradePaymentTerms && specifiedTradePaymentTerms.length > 0) {
    specifiedTradePaymentTerms.forEach(t => convertPaymentTerms(t, parent.addElement(...qname('ram:SpecifiedTradePaymentTerms'))))
  }

  convertTradeSettlementHeaderMonetarySummation(
    specifiedTradeSettlementHeaderMonetarySummation,
    parent.addElement(...qname('ram:SpecifiedTradeSettlementHeaderMonetarySummation')),
  )

  if (specifiedFinancialAdjustment && specifiedFinancialAdjustment.length > 0) {
    specifiedFinancialAdjustment.forEach(a => convertFinancialAdjustment(a, parent.addElement(...qname('ram:SpecifiedFinancialAdjustment'))))
  }

  if (invoiceReferencedDocument && invoiceReferencedDocument.length > 0) {
    invoiceReferencedDocument.forEach(d => convertReferencedDocument(d, parent.addElement(...qname('ram:InvoiceReferencedDocument'))))
  }

  if (receivableSpecifiedTradeAccountingAccount && receivableSpecifiedTradeAccountingAccount.length > 0) {
    receivableSpecifiedTradeAccountingAccount.forEach(a => convertTradeAccountingAccount(a, parent.addElement(...qname('ram:ReceivableSpecifiedTradeAccountingAccount'))))
  }

  if (specifiedAdvancePayment && specifiedAdvancePayment.length > 0) {
    specifiedAdvancePayment.forEach(p => convertAdvancePayment(p, parent.addElement(...qname('ram:SpecifiedAdvancePayment'))))
  }
}

function convertTradeCurrencyExchange(
  { sourceCurrencyCode, targetCurrencyCode, conversionRate, conversionRateDateTime }: ram.TradeCurrencyExchangeType,
  parent: XmlElement,
): void {
  parent.addElement(...qname('ram:SourceCurrencyCode')).addText(sourceCurrencyCode.value)
  parent.addElement(...qname('ram:TargetCurrencyCode')).addText(targetCurrencyCode.value)
  parent.addElement(...qname('ram:ConversionRate')).addText(formatDecimal(conversionRate.value))
  if (conversionRateDateTime) {
    convertDateTime(conversionRateDateTime, parent.addElement(...qname('ram:ConversionRateDateTime')))
  }
}

function convertPaymentMeans(
  {
    typeCode,
    information,
    applicableTradeSettlementFinancialCard,
    payerPartyDebtorFinancialAccount,
    payeePartyCreditorFinancialAccount,
    payerSpecifiedDebtorFinancialInstitution,
    payeeSpecifiedCreditorFinancialInstitution,
  }: ram.TradeSettlementPaymentMeansType,
  parent: XmlElement,
): void {
  parent.addElement(...qname('ram:TypeCode')).addText(typeCode.value)
  if (information) {
    convertText(information, parent.addElement(...qname('ram:Information')))
  }
  if (applicableTradeSettlementFinancialCard) {
    const el = parent.addElement(...qname('ram:ApplicableTradeSettlementFinancialCard'))
    convertID(applicableTradeSettlementFinancialCard.id, el.addElement(...qname('ram:ID')))
    if (applicableTradeSettlementFinancialCard.cardholderName) {
      convertText(applicableTradeSettlementFinancialCard.cardholderName, el.addElement(...qname('ram:CardholderName')))
    }
  }
  if (payerPartyDebtorFinancialAccount) {
    const el = parent.addElement(...qname('ram:PayerPartyDebtorFinancialAccount'))
    convertID(payerPartyDebtorFinancialAccount.ibanID, el.addElement(...qname('ram:IBANID')))
    if (payerPartyDebtorFinancialAccount.accountName) {
      convertText(payerPartyDebtorFinancialAccount.accountName, el.addElement(...qname('ram:AccountName')))
    }
  }
  if (payeePartyCreditorFinancialAccount) {
    const el = parent.addElement(...qname('ram:PayeePartyCreditorFinancialAccount'))
    if (payeePartyCreditorFinancialAccount.ibanID) {
      convertID(payeePartyCreditorFinancialAccount.ibanID, el.addElement(...qname('ram:IBANID')))
    }
    if (payeePartyCreditorFinancialAccount.accountName) {
      convertText(payeePartyCreditorFinancialAccount.accountName, el.addElement(...qname('ram:AccountName')))
    }
    if (payeePartyCreditorFinancialAccount.proprietaryID) {
      convertID(payeePartyCreditorFinancialAccount.proprietaryID, el.addElement(...qname('ram:ProprietaryID')))
    }
  }
  if (payerSpecifiedDebtorFinancialInstitution?.bicID) {
    convertID(payerSpecifiedDebtorFinancialInstitution.bicID, parent.addElement(...qname('ram:PayerSpecifiedDebtorFinancialInstitution')).addElement(...qname('ram:BICID')))
  }
  if (payeeSpecifiedCreditorFinancialInstitution?.bicID) {
    convertID(payeeSpecifiedCreditorFinancialInstitution.bicID, parent.addElement(...qname('ram:PayeeSpecifiedCreditorFinancialInstitution')).addElement(...qname('ram:BICID')))
  }
}

function convertTradeTax(
  {
    calculatedAmount,
    typeCode,
    exemptionReason,
    basisAmount,
    lineTotalBasisAmount,
    allowanceChargeBasisAmount,
    categoryCode,
    exemptionReasonCode,
    taxPointDate,
    dueDateTypeCode,
    rateApplicablePercent,
  }: ram.TradeTaxType,
  parent: XmlElement,
): void {
  if (calculatedAmount) {
    convertAmount(calculatedAmount, parent.addElement(...qname('ram:CalculatedAmount')))
  }
  if (typeCode) {
    parent.addElement(...qname('ram:TypeCode')).addText(typeCode.value)
  }
  if (exemptionReason) {
    convertText(exemptionReason, parent.addElement(...qname('ram:ExemptionReason')))
  }
  if (basisAmount) {
    convertAmount(basisAmount, parent.addElement(...qname('ram:BasisAmount')))
  }
  if (lineTotalBasisAmount) {
    convertAmount(lineTotalBasisAmount, parent.addElement(...qname('ram:LineTotalBasisAmount')))
  }
  if (allowanceChargeBasisAmount) {
    convertAmount(allowanceChargeBasisAmount, parent.addElement(...qname('ram:AllowanceChargeBasisAmount')))
  }
  if (categoryCode) {
    parent.addElement(...qname('ram:CategoryCode')).addText(categoryCode.value)
  }
  if (exemptionReasonCode) {
    convertCode(exemptionReasonCode, parent.addElement(...qname('ram:ExemptionReasonCode')))
  }
  if (taxPointDate) {
    convertDate(taxPointDate, parent.addElement(...qname('ram:TaxPointDate')))
  }
  if (dueDateTypeCode) {
    parent.addElement(...qname('ram:DueDateTypeCode')).addText(dueDateTypeCode.value)
  }
  if (rateApplicablePercent) {
    parent.addElement(...qname('ram:RateApplicablePercent')).addText(formatDecimal(rateApplicablePercent.value))
  }
}

function convertAllowanceCharge(
  {
    chargeIndicator,
    sequenceNumeric,
    calculationPercent,
    basisAmount,
    basisQuantity,
    actualAmount,
    reasonCode,
    reason,
    categoryTradeTax,
  }: ram.TradeAllowanceChargeType,
  parent: XmlElement,
  // Price-level allowances/charges (in a GrossPriceProductTradePrice) carry *Unit Price Amount*s;
  // line- and document-level ones carry *Amount*s.
  unitPrice = false,
): void {
  const convertAllowanceAmount = unitPrice ? convertUnitPriceAmount : convertAmount
  convertIndicator(chargeIndicator, parent.addElement(...qname('ram:ChargeIndicator')))
  if (sequenceNumeric) {
    parent.addElement(...qname('ram:SequenceNumeric')).addText(formatDecimal(sequenceNumeric.value))
  }
  if (calculationPercent) {
    parent.addElement(...qname('ram:CalculationPercent')).addText(formatDecimal(calculationPercent.value))
  }
  if (basisAmount) {
    convertAllowanceAmount(basisAmount, parent.addElement(...qname('ram:BasisAmount')))
  }
  if (basisQuantity) {
    convertQuantity(basisQuantity, parent.addElement(...qname('ram:BasisQuantity')))
  }
  if (actualAmount) {
    convertAllowanceAmount(actualAmount, parent.addElement(...qname('ram:ActualAmount')))
  }
  if (reasonCode) {
    const el = parent.addElement(...qname('ram:ReasonCode'))
    el.addText(reasonCode.value)
    // BT-177-1 / BT-193-1 / BT-X-616-1 (EXTENDED): listID 5153 marks a non-VAT tax code.
    if (reasonCode.listID)
      el.setAttr('listID', reasonCode.listID)
  }
  if (reason) {
    convertText(reason, parent.addElement(...qname('ram:Reason')))
  }
  if (categoryTradeTax) {
    convertTradeTax(categoryTradeTax, parent.addElement(...qname('ram:CategoryTradeTax')))
  }
}

function convertLogisticsServiceCharge(
  { description, appliedAmount, appliedTradeTax }: ram.LogisticsServiceChargeType,
  parent: XmlElement,
): void {
  convertText(description, parent.addElement(...qname('ram:Description')))
  convertAmount(appliedAmount, parent.addElement(...qname('ram:AppliedAmount')))
  if (appliedTradeTax && appliedTradeTax.length > 0) {
    appliedTradeTax.forEach(t => convertTradeTax(t, parent.addElement(...qname('ram:AppliedTradeTax'))))
  }
}

function convertPaymentTerms(
  {
    description,
    dueDateDateTime,
    directDebitMandateID,
    partialPaymentAmount,
    applicableTradePaymentPenaltyTerms,
    applicableTradePaymentDiscountTerms,
    payeeTradeParty,
  }: ram.TradePaymentTermsType,
  parent: XmlElement,
): void {
  if (description) {
    convertText(description, parent.addElement(...qname('ram:Description')))
  }
  if (dueDateDateTime) {
    convertDateTime(dueDateDateTime, parent.addElement(...qname('ram:DueDateDateTime')))
  }
  if (directDebitMandateID) {
    convertID(directDebitMandateID, parent.addElement(...qname('ram:DirectDebitMandateID')))
  }
  if (partialPaymentAmount) {
    convertAmount(partialPaymentAmount, parent.addElement(...qname('ram:PartialPaymentAmount')))
  }
  if (applicableTradePaymentPenaltyTerms) {
    convertPaymentPenaltyTerms(applicableTradePaymentPenaltyTerms, parent.addElement(...qname('ram:ApplicableTradePaymentPenaltyTerms')))
  }
  if (applicableTradePaymentDiscountTerms) {
    convertPaymentDiscountTerms(applicableTradePaymentDiscountTerms, parent.addElement(...qname('ram:ApplicableTradePaymentDiscountTerms')))
  }
  if (payeeTradeParty) {
    convertTradeParty(payeeTradeParty, parent.addElement(...qname('ram:PayeeTradeParty')))
  }
}

function convertPaymentPenaltyTerms(
  { basisDateTime, basisPeriodMeasure, basisAmount, calculationPercent, actualPenaltyAmount }: ram.TradePaymentPenaltyTermsType,
  parent: XmlElement,
): void {
  if (basisDateTime) {
    convertDateTime(basisDateTime, parent.addElement(...qname('ram:BasisDateTime')))
  }
  if (basisPeriodMeasure) {
    convertMeasure(basisPeriodMeasure, parent.addElement(...qname('ram:BasisPeriodMeasure')))
  }
  if (basisAmount) {
    convertAmount(basisAmount, parent.addElement(...qname('ram:BasisAmount')))
  }
  if (calculationPercent) {
    parent.addElement(...qname('ram:CalculationPercent')).addText(formatDecimal(calculationPercent.value))
  }
  if (actualPenaltyAmount) {
    convertAmount(actualPenaltyAmount, parent.addElement(...qname('ram:ActualPenaltyAmount')))
  }
}

function convertPaymentDiscountTerms(
  { basisDateTime, basisPeriodMeasure, basisAmount, calculationPercent, actualDiscountAmount }: ram.TradePaymentDiscountTermsType,
  parent: XmlElement,
): void {
  if (basisDateTime) {
    convertDateTime(basisDateTime, parent.addElement(...qname('ram:BasisDateTime')))
  }
  if (basisPeriodMeasure) {
    convertMeasure(basisPeriodMeasure, parent.addElement(...qname('ram:BasisPeriodMeasure')))
  }
  if (basisAmount) {
    convertAmount(basisAmount, parent.addElement(...qname('ram:BasisAmount')))
  }
  if (calculationPercent) {
    parent.addElement(...qname('ram:CalculationPercent')).addText(formatDecimal(calculationPercent.value))
  }
  if (actualDiscountAmount) {
    convertAmount(actualDiscountAmount, parent.addElement(...qname('ram:ActualDiscountAmount')))
  }
}

function convertTradeSettlementHeaderMonetarySummation(
  {
    lineTotalAmount,
    chargeTotalAmount,
    allowanceTotalAmount,
    taxBasisTotalAmount,
    taxTotalAmount,
    roundingAmount,
    grandTotalAmount,
    totalPrepaidAmount,
    duePayableAmount,
  }: ram.TradeSettlementHeaderMonetarySummationType,
  parent: XmlElement,
): void {
  if (lineTotalAmount) {
    convertAmount(lineTotalAmount, parent.addElement(...qname('ram:LineTotalAmount')))
  }
  if (chargeTotalAmount) {
    convertAmount(chargeTotalAmount, parent.addElement(...qname('ram:ChargeTotalAmount')))
  }
  if (allowanceTotalAmount) {
    convertAmount(allowanceTotalAmount, parent.addElement(...qname('ram:AllowanceTotalAmount')))
  }
  convertAmount(taxBasisTotalAmount, parent.addElement(...qname('ram:TaxBasisTotalAmount')))
  if (taxTotalAmount && taxTotalAmount.length > 0) {
    taxTotalAmount.forEach(a => convertAmount(a, parent.addElement(...qname('ram:TaxTotalAmount'))))
  }
  if (roundingAmount) {
    convertAmount(roundingAmount, parent.addElement(...qname('ram:RoundingAmount')))
  }
  convertAmount(grandTotalAmount, parent.addElement(...qname('ram:GrandTotalAmount')))
  if (totalPrepaidAmount) {
    convertAmount(totalPrepaidAmount, parent.addElement(...qname('ram:TotalPrepaidAmount')))
  }
  convertAmount(duePayableAmount, parent.addElement(...qname('ram:DuePayableAmount')))
}

function convertFinancialAdjustment({ reason, actualAmount }: ram.FinancialAdjustmentType, parent: XmlElement): void {
  convertText(reason, parent.addElement(...qname('ram:Reason')))
  convertAmount(actualAmount, parent.addElement(...qname('ram:ActualAmount')))
}

function convertTradeAccountingAccount({ id, typeCode }: ram.TradeAccountingAccountType, parent: XmlElement): void {
  convertID(id, parent.addElement(...qname('ram:ID')))
  if (typeCode) {
    parent.addElement(...qname('ram:TypeCode')).addText(typeCode.value)
  }
}

function convertAdvancePayment(
  { paidAmount, formattedReceivedDateTime, includedTradeTax, invoiceSpecifiedReferencedDocument }: ram.AdvancePaymentType,
  parent: XmlElement,
): void {
  convertAmount(paidAmount, parent.addElement(...qname('ram:PaidAmount')))
  if (formattedReceivedDateTime) {
    convertFormattedDateTime(formattedReceivedDateTime, parent.addElement(...qname('ram:FormattedReceivedDateTime')))
  }
  if (includedTradeTax && includedTradeTax.length > 0) {
    includedTradeTax.forEach(t => convertTradeTax(t, parent.addElement(...qname('ram:IncludedTradeTax'))))
  }
  if (invoiceSpecifiedReferencedDocument) {
    convertReferencedDocument(invoiceSpecifiedReferencedDocument, parent.addElement(...qname('ram:InvoiceSpecifiedReferencedDocument')))
  }
}

// ---------------------------------------------------------------------------
// Referenced document (shared)
// ---------------------------------------------------------------------------

function convertReferencedDocument(
  { issuerAssignedID, uriID, lineID, typeCode, name, attachmentBinaryObject, referenceTypeCode, formattedIssueDateTime }: ram.ReferencedDocumentType,
  parent: XmlElement,
): void {
  if (issuerAssignedID) {
    convertID(issuerAssignedID, parent.addElement(...qname('ram:IssuerAssignedID')))
  }
  if (uriID) {
    convertID(uriID, parent.addElement(...qname('ram:URIID')))
  }
  if (lineID) {
    convertID(lineID, parent.addElement(...qname('ram:LineID')))
  }
  if (typeCode) {
    parent.addElement(...qname('ram:TypeCode')).addText(typeCode.value)
  }
  if (name && name.length > 0) {
    name.forEach(n => convertText(n, parent.addElement(...qname('ram:Name'))))
  }
  if (attachmentBinaryObject) {
    convertBinaryObject(attachmentBinaryObject, parent.addElement(...qname('ram:AttachmentBinaryObject')))
  }
  if (referenceTypeCode) {
    parent.addElement(...qname('ram:ReferenceTypeCode')).addText(referenceTypeCode.value)
  }
  if (formattedIssueDateTime) {
    convertFormattedDateTime(formattedIssueDateTime, parent.addElement(...qname('ram:FormattedIssueDateTime')))
  }
}
