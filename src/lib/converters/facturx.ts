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

/**
 * Converter for FacturX CrossIndustryInvoice model to XML.
 *
 * Element emission follows the xs:sequence order of the Factur-X 1.09 (CII D22B)
 * EXTENDED schema, which is a superset of all lower profiles. Only fields that
 * are present on the model are emitted, so the same converter produces valid
 * output for MINIMUM through EXTENDED.
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

function convertAmount({ value, currencyID }: udt.AmountType, parent: XmlElement): XmlElement {
  parent.addText(value.toFixed(2))
  if (currencyID) {
    parent.setAttr('currencyID', currencyID)
  }
  return parent
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
  parent.addText(String(value))
  if (unitCode) {
    parent.setAttr('unitCode', unitCode)
  }
  return parent
}

function convertMeasure({ value, unitCode }: udt.MeasureType, parent: XmlElement): XmlElement {
  parent.addText(String(value))
  if (unitCode) {
    parent.setAttr('unitCode', unitCode)
  }
  return parent
}

function convertDateTime({ dateTimeString, format }: udt.DateTimeType, parent: XmlElement): XmlElement {
  const el = parent.addElement('udt:DateTimeString')
  el.addText(dateTimeString)
  el.setAttr('format', format)
  return parent
}

function convertDate({ dateString, format }: udt.DateType, parent: XmlElement): XmlElement {
  const el = parent.addElement('udt:DateString')
  el.addText(dateString)
  el.setAttr('format', format)
  return parent
}

/** FormattedDateTimeType uses the qdt:DateTimeString element (qualified namespace). */
function convertFormattedDateTime(
  { dateTimeString, format }: { dateTimeString: string, format: string },
  parent: XmlElement,
): XmlElement {
  const el = parent.addElement('qdt:DateTimeString')
  el.addText(dateTimeString)
  el.setAttr('format', format)
  return parent
}

function convertIndicator({ indicator }: udt.IndicatorType, parent: XmlElement): XmlElement {
  parent.addElement('udt:Indicator').addText(String(indicator))
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
  const context = parent.addElement('rsm:ExchangedDocumentContext')

  if (testIndicator) {
    convertIndicator(testIndicator, context.addElement('ram:TestIndicator'))
  }

  if (businessProcessSpecifiedDocumentContextParameter) {
    convertDocumentContextParameter(
      businessProcessSpecifiedDocumentContextParameter,
      context.addElement('ram:BusinessProcessSpecifiedDocumentContextParameter'),
    )
  }

  convertDocumentContextParameter(
    guidelineSpecifiedDocumentContextParameter,
    context.addElement('ram:GuidelineSpecifiedDocumentContextParameter'),
  )
}

function convertDocumentContextParameter({ id }: ram.DocumentContextParameterType, parent: XmlElement): void {
  convertID(id, parent.addElement('ram:ID'))
}

// ---------------------------------------------------------------------------
// ExchangedDocument
// ---------------------------------------------------------------------------

function convertExchangedDocument(
  { id, name, typeCode, issueDateTime, copyIndicator, languageID, includedNote, effectiveSpecifiedPeriod }: ExchangedDocumentType,
  parent: XmlElement,
): void {
  const doc = parent.addElement('rsm:ExchangedDocument')

  convertID(id, doc.addElement('ram:ID'))

  if (name) {
    convertText(name, doc.addElement('ram:Name'))
  }

  doc.addElement('ram:TypeCode').addText(typeCode.value)

  convertDateTime(issueDateTime, doc.addElement('ram:IssueDateTime'))

  if (copyIndicator) {
    convertIndicator(copyIndicator, doc.addElement('ram:CopyIndicator'))
  }

  if (languageID && languageID.length > 0) {
    languageID.forEach(lang => convertID(lang, doc.addElement('ram:LanguageID')))
  }

  if (includedNote && includedNote.length > 0) {
    includedNote.forEach(note => convertNote(note, doc.addElement('ram:IncludedNote')))
  }

  if (effectiveSpecifiedPeriod) {
    convertSpecifiedPeriod(effectiveSpecifiedPeriod, doc.addElement('ram:EffectiveSpecifiedPeriod'))
  }
}

function convertNote({ contentCode, content, subjectCode }: ram.NoteType, parent: XmlElement): void {
  if (contentCode) {
    convertCode(contentCode, parent.addElement('ram:ContentCode'))
  }
  if (content) {
    convertText(content, parent.addElement('ram:Content'))
  }
  if (subjectCode) {
    convertCode(subjectCode, parent.addElement('ram:SubjectCode'))
  }
}

function convertSpecifiedPeriod(
  { description, startDateTime, endDateTime, completeDateTime }: ram.SpecifiedPeriodType,
  parent: XmlElement,
): void {
  if (description) {
    convertText(description, parent.addElement('ram:Description'))
  }
  if (startDateTime) {
    convertDateTime(startDateTime, parent.addElement('ram:StartDateTime'))
  }
  if (endDateTime) {
    convertDateTime(endDateTime, parent.addElement('ram:EndDateTime'))
  }
  if (completeDateTime) {
    convertDateTime(completeDateTime, parent.addElement('ram:CompleteDateTime'))
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
  const transaction = parent.addElement('rsm:SupplyChainTradeTransaction')

  if (includedSupplyChainTradeLineItem && includedSupplyChainTradeLineItem.length > 0) {
    includedSupplyChainTradeLineItem.forEach((lineItem) => {
      convertSupplyChainTradeLineItem(lineItem, transaction.addElement('ram:IncludedSupplyChainTradeLineItem'))
    })
  }

  convertHeaderTradeAgreement(applicableHeaderTradeAgreement, transaction.addElement('ram:ApplicableHeaderTradeAgreement'))
  convertHeaderTradeDelivery(applicableHeaderTradeDelivery, transaction.addElement('ram:ApplicableHeaderTradeDelivery'))
  convertHeaderTradeSettlement(applicableHeaderTradeSettlement, transaction.addElement('ram:ApplicableHeaderTradeSettlement'))
}

// ---------------------------------------------------------------------------
// Line items
// ---------------------------------------------------------------------------

function convertSupplyChainTradeLineItem(lineItem: ram.SupplyChainTradeLineItemType, parent: XmlElement): void {
  convertDocumentLineDocument(lineItem.associatedDocumentLineDocument, parent.addElement('ram:AssociatedDocumentLineDocument'))
  convertTradeProduct(lineItem.specifiedTradeProduct, parent.addElement('ram:SpecifiedTradeProduct'))

  if (lineItem.specifiedLineTradeAgreement) {
    convertLineTradeAgreement(lineItem.specifiedLineTradeAgreement, parent.addElement('ram:SpecifiedLineTradeAgreement'))
  }
  if (lineItem.specifiedLineTradeDelivery) {
    convertLineTradeDelivery(lineItem.specifiedLineTradeDelivery, parent.addElement('ram:SpecifiedLineTradeDelivery'))
  }
  if (lineItem.specifiedLineTradeSettlement) {
    convertLineTradeSettlement(lineItem.specifiedLineTradeSettlement, parent.addElement('ram:SpecifiedLineTradeSettlement'))
  }
}

function convertDocumentLineDocument(
  { lineID, parentLineID, lineStatusCode, lineStatusReasonCode, includedNote }: ram.DocumentLineDocumentType,
  parent: XmlElement,
): void {
  convertID(lineID, parent.addElement('ram:LineID'))
  if (parentLineID) {
    convertID(parentLineID, parent.addElement('ram:ParentLineID'))
  }
  if (lineStatusCode) {
    parent.addElement('ram:LineStatusCode', lineStatusCode.value)
  }
  if (lineStatusReasonCode) {
    convertCode(lineStatusReasonCode, parent.addElement('ram:LineStatusReasonCode'))
  }
  if (includedNote && includedNote.length > 0) {
    includedNote.forEach(note => convertNote(note, parent.addElement('ram:IncludedNote')))
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
    convertID(id, parent.addElement('ram:ID'))
  }
  if (globalID) {
    convertID(globalID, parent.addElement('ram:GlobalID'))
  }
  if (sellerAssignedID) {
    convertID(sellerAssignedID, parent.addElement('ram:SellerAssignedID'))
  }
  if (buyerAssignedID) {
    convertID(buyerAssignedID, parent.addElement('ram:BuyerAssignedID'))
  }
  if (industryAssignedID) {
    convertID(industryAssignedID, parent.addElement('ram:IndustryAssignedID'))
  }
  if (modelID) {
    convertID(modelID, parent.addElement('ram:ModelID'))
  }
  if (name) {
    convertText(name, parent.addElement('ram:Name'))
  }
  if (description) {
    convertText(description, parent.addElement('ram:Description'))
  }
  if (batchID && batchID.length > 0) {
    batchID.forEach(b => convertID(b, parent.addElement('ram:BatchID')))
  }
  if (brandName) {
    convertText(brandName, parent.addElement('ram:BrandName'))
  }
  if (modelName) {
    convertText(modelName, parent.addElement('ram:ModelName'))
  }
  if (applicableProductCharacteristic && applicableProductCharacteristic.length > 0) {
    applicableProductCharacteristic.forEach(c => convertProductCharacteristic(c, parent.addElement('ram:ApplicableProductCharacteristic')))
  }
  if (designatedProductClassification && designatedProductClassification.length > 0) {
    designatedProductClassification.forEach(c => convertProductClassification(c, parent.addElement('ram:DesignatedProductClassification')))
  }
  if (individualTradeProductInstance && individualTradeProductInstance.length > 0) {
    individualTradeProductInstance.forEach(i => convertTradeProductInstance(i, parent.addElement('ram:IndividualTradeProductInstance')))
  }
  if (originTradeCountry?.id) {
    parent.addElement('ram:OriginTradeCountry').addElement('ram:ID').addText(originTradeCountry.id.value)
  }
  if (manufacturerTradeParty) {
    convertTradeParty(manufacturerTradeParty, parent.addElement('ram:ManufacturerTradeParty'))
  }
  if (includedReferencedProduct && includedReferencedProduct.length > 0) {
    includedReferencedProduct.forEach(p => convertReferencedProduct(p, parent.addElement('ram:IncludedReferencedProduct')))
  }
}

function convertProductCharacteristic(
  { typeCode, description, valueMeasure, value }: ram.ProductCharacteristicType,
  parent: XmlElement,
): void {
  if (typeCode) {
    convertCode(typeCode, parent.addElement('ram:TypeCode'))
  }
  if (description) {
    convertText(description, parent.addElement('ram:Description'))
  }
  if (valueMeasure) {
    convertMeasure(valueMeasure, parent.addElement('ram:ValueMeasure'))
  }
  if (value) {
    convertText(value, parent.addElement('ram:Value'))
  }
}

function convertProductClassification(
  { classCode, className }: ram.ProductClassificationType,
  parent: XmlElement,
): void {
  if (classCode) {
    convertCode(classCode, parent.addElement('ram:ClassCode'))
  }
  if (className) {
    convertText(className, parent.addElement('ram:ClassName'))
  }
}

function convertTradeProductInstance(
  { batchID, supplierAssignedSerialID }: ram.TradeProductInstanceType,
  parent: XmlElement,
): void {
  if (batchID) {
    convertID(batchID, parent.addElement('ram:BatchID'))
  }
  if (supplierAssignedSerialID) {
    convertID(supplierAssignedSerialID, parent.addElement('ram:SupplierAssignedSerialID'))
  }
}

function convertReferencedProduct(
  { id, globalID, sellerAssignedID, buyerAssignedID, industryAssignedID, name, description, unitQuantity }: ram.ReferencedProductType,
  parent: XmlElement,
): void {
  if (id) {
    convertID(id, parent.addElement('ram:ID'))
  }
  if (globalID && globalID.length > 0) {
    globalID.forEach(g => convertID(g, parent.addElement('ram:GlobalID')))
  }
  if (sellerAssignedID) {
    convertID(sellerAssignedID, parent.addElement('ram:SellerAssignedID'))
  }
  if (buyerAssignedID) {
    convertID(buyerAssignedID, parent.addElement('ram:BuyerAssignedID'))
  }
  if (industryAssignedID) {
    convertID(industryAssignedID, parent.addElement('ram:IndustryAssignedID'))
  }
  convertText(name, parent.addElement('ram:Name'))
  if (description) {
    convertText(description, parent.addElement('ram:Description'))
  }
  if (unitQuantity) {
    convertQuantity(unitQuantity, parent.addElement('ram:UnitQuantity'))
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
    convertTradeDeliveryTerms(applicableTradeDeliveryTerms, parent.addElement('ram:ApplicableTradeDeliveryTerms'))
  }
  if (sellerOrderReferencedDocument) {
    convertReferencedDocument(sellerOrderReferencedDocument, parent.addElement('ram:SellerOrderReferencedDocument'))
  }
  if (buyerOrderReferencedDocument) {
    convertReferencedDocument(buyerOrderReferencedDocument, parent.addElement('ram:BuyerOrderReferencedDocument'))
  }
  if (quotationReferencedDocument) {
    convertReferencedDocument(quotationReferencedDocument, parent.addElement('ram:QuotationReferencedDocument'))
  }
  if (contractReferencedDocument) {
    convertReferencedDocument(contractReferencedDocument, parent.addElement('ram:ContractReferencedDocument'))
  }
  if (additionalReferencedDocument && additionalReferencedDocument.length > 0) {
    additionalReferencedDocument.forEach(d => convertReferencedDocument(d, parent.addElement('ram:AdditionalReferencedDocument')))
  }
  if (grossPriceProductTradePrice) {
    convertTradePrice(grossPriceProductTradePrice, parent.addElement('ram:GrossPriceProductTradePrice'))
  }
  if (netPriceProductTradePrice) {
    convertTradePrice(netPriceProductTradePrice, parent.addElement('ram:NetPriceProductTradePrice'))
  }
  if (itemSellerTradeParty) {
    convertTradeParty(itemSellerTradeParty, parent.addElement('ram:ItemSellerTradeParty'))
  }
  if (ultimateCustomerOrderReferencedDocument && ultimateCustomerOrderReferencedDocument.length > 0) {
    ultimateCustomerOrderReferencedDocument.forEach(d => convertReferencedDocument(d, parent.addElement('ram:UltimateCustomerOrderReferencedDocument')))
  }
}

function convertTradePrice(
  { chargeAmount, basisQuantity, appliedTradeAllowanceCharge, includedTradeTax }: ram.TradePriceType,
  parent: XmlElement,
): void {
  if (chargeAmount) {
    convertAmount(chargeAmount, parent.addElement('ram:ChargeAmount'))
  }
  if (basisQuantity) {
    convertQuantity(basisQuantity, parent.addElement('ram:BasisQuantity'))
  }
  if (appliedTradeAllowanceCharge && appliedTradeAllowanceCharge.length > 0) {
    appliedTradeAllowanceCharge.forEach(ac => convertAllowanceCharge(ac, parent.addElement('ram:AppliedTradeAllowanceCharge')))
  }
  if (includedTradeTax) {
    convertTradeTax(includedTradeTax, parent.addElement('ram:IncludedTradeTax'))
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
    convertQuantity(billedQuantity, parent.addElement('ram:BilledQuantity'))
  }
  if (chargeFreeQuantity) {
    convertQuantity(chargeFreeQuantity, parent.addElement('ram:ChargeFreeQuantity'))
  }
  if (packageQuantity) {
    convertQuantity(packageQuantity, parent.addElement('ram:PackageQuantity'))
  }
  if (perPackageUnitQuantity) {
    convertQuantity(perPackageUnitQuantity, parent.addElement('ram:PerPackageUnitQuantity'))
  }
  if (shipToTradeParty) {
    convertTradeParty(shipToTradeParty, parent.addElement('ram:ShipToTradeParty'))
  }
  if (ultimateShipToTradeParty) {
    convertTradeParty(ultimateShipToTradeParty, parent.addElement('ram:UltimateShipToTradeParty'))
  }
  if (actualDeliverySupplyChainEvent) {
    convertSupplyChainEvent(actualDeliverySupplyChainEvent, parent.addElement('ram:ActualDeliverySupplyChainEvent'))
  }
  if (despatchAdviceReferencedDocument) {
    convertReferencedDocument(despatchAdviceReferencedDocument, parent.addElement('ram:DespatchAdviceReferencedDocument'))
  }
  if (receivingAdviceReferencedDocument) {
    convertReferencedDocument(receivingAdviceReferencedDocument, parent.addElement('ram:ReceivingAdviceReferencedDocument'))
  }
  if (deliveryNoteReferencedDocument) {
    convertReferencedDocument(deliveryNoteReferencedDocument, parent.addElement('ram:DeliveryNoteReferencedDocument'))
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
    applicableTradeTax.forEach(tax => convertTradeTax(tax, parent.addElement('ram:ApplicableTradeTax')))
  }
  if (billingSpecifiedPeriod) {
    convertSpecifiedPeriod(billingSpecifiedPeriod, parent.addElement('ram:BillingSpecifiedPeriod'))
  }
  if (specifiedTradeAllowanceCharge && specifiedTradeAllowanceCharge.length > 0) {
    specifiedTradeAllowanceCharge.forEach(ac => convertAllowanceCharge(ac, parent.addElement('ram:SpecifiedTradeAllowanceCharge')))
  }
  if (specifiedTradeSettlementLineMonetarySummation) {
    convertTradeSettlementLineMonetarySummation(
      specifiedTradeSettlementLineMonetarySummation,
      parent.addElement('ram:SpecifiedTradeSettlementLineMonetarySummation'),
    )
  }
  if (invoiceReferencedDocument) {
    convertReferencedDocument(invoiceReferencedDocument, parent.addElement('ram:InvoiceReferencedDocument'))
  }
  if (additionalReferencedDocument && additionalReferencedDocument.length > 0) {
    additionalReferencedDocument.forEach(d => convertReferencedDocument(d, parent.addElement('ram:AdditionalReferencedDocument')))
  }
  if (receivableSpecifiedTradeAccountingAccount && receivableSpecifiedTradeAccountingAccount.length > 0) {
    receivableSpecifiedTradeAccountingAccount.forEach(a => convertTradeAccountingAccount(a, parent.addElement('ram:ReceivableSpecifiedTradeAccountingAccount')))
  }
}

function convertTradeSettlementLineMonetarySummation(
  { lineTotalAmount, chargeTotalAmount, allowanceTotalAmount, taxTotalAmount, grandTotalAmount, totalAllowanceChargeAmount }: ram.TradeSettlementLineMonetarySummationType,
  parent: XmlElement,
): void {
  if (lineTotalAmount) {
    convertAmount(lineTotalAmount, parent.addElement('ram:LineTotalAmount'))
  }
  if (chargeTotalAmount) {
    convertAmount(chargeTotalAmount, parent.addElement('ram:ChargeTotalAmount'))
  }
  if (allowanceTotalAmount) {
    convertAmount(allowanceTotalAmount, parent.addElement('ram:AllowanceTotalAmount'))
  }
  if (taxTotalAmount) {
    convertAmount(taxTotalAmount, parent.addElement('ram:TaxTotalAmount'))
  }
  if (grandTotalAmount) {
    convertAmount(grandTotalAmount, parent.addElement('ram:GrandTotalAmount'))
  }
  if (totalAllowanceChargeAmount) {
    convertAmount(totalAllowanceChargeAmount, parent.addElement('ram:TotalAllowanceChargeAmount'))
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
    convertText(buyerReference, parent.addElement('ram:BuyerReference'))
  }

  convertTradeParty(sellerTradeParty, parent.addElement('ram:SellerTradeParty'))
  convertTradeParty(buyerTradeParty, parent.addElement('ram:BuyerTradeParty'))

  if (salesAgentTradeParty) {
    convertTradeParty(salesAgentTradeParty, parent.addElement('ram:SalesAgentTradeParty'))
  }
  if (buyerTaxRepresentativeTradeParty) {
    convertTradeParty(buyerTaxRepresentativeTradeParty, parent.addElement('ram:BuyerTaxRepresentativeTradeParty'))
  }
  if (sellerTaxRepresentativeTradeParty) {
    convertTradeParty(sellerTaxRepresentativeTradeParty, parent.addElement('ram:SellerTaxRepresentativeTradeParty'))
  }
  if (productEndUserTradeParty) {
    convertTradeParty(productEndUserTradeParty, parent.addElement('ram:ProductEndUserTradeParty'))
  }
  if (applicableTradeDeliveryTerms) {
    convertTradeDeliveryTerms(applicableTradeDeliveryTerms, parent.addElement('ram:ApplicableTradeDeliveryTerms'))
  }
  if (sellerOrderReferencedDocument) {
    convertReferencedDocument(sellerOrderReferencedDocument, parent.addElement('ram:SellerOrderReferencedDocument'))
  }
  if (buyerOrderReferencedDocument) {
    convertReferencedDocument(buyerOrderReferencedDocument, parent.addElement('ram:BuyerOrderReferencedDocument'))
  }
  if (quotationReferencedDocument) {
    convertReferencedDocument(quotationReferencedDocument, parent.addElement('ram:QuotationReferencedDocument'))
  }
  if (contractReferencedDocument) {
    convertReferencedDocument(contractReferencedDocument, parent.addElement('ram:ContractReferencedDocument'))
  }
  if (additionalReferencedDocument && additionalReferencedDocument.length > 0) {
    additionalReferencedDocument.forEach(d => convertReferencedDocument(d, parent.addElement('ram:AdditionalReferencedDocument')))
  }
  if (buyerAgentTradeParty) {
    convertTradeParty(buyerAgentTradeParty, parent.addElement('ram:BuyerAgentTradeParty'))
  }
  if (specifiedProcuringProject) {
    convertProcuringProject(specifiedProcuringProject, parent.addElement('ram:SpecifiedProcuringProject'))
  }
  if (ultimateCustomerOrderReferencedDocument && ultimateCustomerOrderReferencedDocument.length > 0) {
    ultimateCustomerOrderReferencedDocument.forEach(d => convertReferencedDocument(d, parent.addElement('ram:UltimateCustomerOrderReferencedDocument')))
  }
}

function convertProcuringProject({ id, name }: ram.ProcuringProjectType, parent: XmlElement): void {
  convertID(id, parent.addElement('ram:ID'))
  convertText(name, parent.addElement('ram:Name'))
}

function convertTradeDeliveryTerms({ deliveryTypeCode, relevantTradeLocation }: ram.TradeDeliveryTermsType, parent: XmlElement): void {
  if (deliveryTypeCode) {
    parent.addElement('ram:DeliveryTypeCode').addText(deliveryTypeCode.value)
  }
  if (relevantTradeLocation) {
    const el = parent.addElement('ram:RelevantTradeLocation')
    if (relevantTradeLocation.countryID) {
      el.addElement('ram:CountryID').addText(relevantTradeLocation.countryID.value)
    }
    if (relevantTradeLocation.name) {
      convertText(relevantTradeLocation.name, el.addElement('ram:Name'))
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
    id.forEach(i => convertID(i, parent.addElement('ram:ID')))
  }
  if (globalID && globalID.length > 0) {
    globalID.forEach(g => convertID(g, parent.addElement('ram:GlobalID')))
  }
  if (name) {
    convertText(name, parent.addElement('ram:Name'))
  }
  if (roleCode) {
    parent.addElement('ram:RoleCode', roleCode.value)
  }
  if (description) {
    convertText(description, parent.addElement('ram:Description'))
  }
  if (specifiedLegalOrganization) {
    convertLegalOrganization(specifiedLegalOrganization, parent.addElement('ram:SpecifiedLegalOrganization'))
  }
  if (definedTradeContact && definedTradeContact.length > 0) {
    definedTradeContact.forEach(c => convertTradeContact(c, parent.addElement('ram:DefinedTradeContact')))
  }
  if (postalTradeAddress) {
    convertTradeAddress(postalTradeAddress, parent.addElement('ram:PostalTradeAddress'))
  }
  if (uriUniversalCommunication) {
    convertUniversalCommunication(uriUniversalCommunication, parent.addElement('ram:URIUniversalCommunication'))
  }
  if (specifiedTaxRegistration && specifiedTaxRegistration.length > 0) {
    specifiedTaxRegistration.forEach((tax) => {
      const taxEl = parent.addElement('ram:SpecifiedTaxRegistration')
      convertID(tax.id, taxEl.addElement('ram:ID'))
    })
  }
}

function convertLegalOrganization(
  { id, tradingBusinessName, postalTradeAddress }: ram.LegalOrganizationType,
  parent: XmlElement,
): void {
  if (id) {
    convertID(id, parent.addElement('ram:ID'))
  }
  if (tradingBusinessName) {
    convertText(tradingBusinessName, parent.addElement('ram:TradingBusinessName'))
  }
  if (postalTradeAddress) {
    convertTradeAddress(postalTradeAddress, parent.addElement('ram:PostalTradeAddress'))
  }
}

function convertTradeContact(
  { personName, departmentName, typeCode, telephoneUniversalCommunication, faxUniversalCommunication, emailURIUniversalCommunication }: ram.TradeContactType,
  parent: XmlElement,
): void {
  if (personName) {
    convertText(personName, parent.addElement('ram:PersonName'))
  }
  if (departmentName) {
    convertText(departmentName, parent.addElement('ram:DepartmentName'))
  }
  if (typeCode) {
    parent.addElement('ram:TypeCode', typeCode.value)
  }
  if (telephoneUniversalCommunication) {
    convertUniversalCommunication(telephoneUniversalCommunication, parent.addElement('ram:TelephoneUniversalCommunication'))
  }
  if (faxUniversalCommunication) {
    convertUniversalCommunication(faxUniversalCommunication, parent.addElement('ram:FaxUniversalCommunication'))
  }
  if (emailURIUniversalCommunication) {
    convertUniversalCommunication(emailURIUniversalCommunication, parent.addElement('ram:EmailURIUniversalCommunication'))
  }
}

function convertUniversalCommunication({ uriID, completeNumber }: ram.UniversalCommunicationType, parent: XmlElement): void {
  if (uriID) {
    convertID(uriID, parent.addElement('ram:URIID'))
  }
  if (completeNumber) {
    convertText(completeNumber, parent.addElement('ram:CompleteNumber'))
  }
}

function convertTradeAddress(
  { postcodeCode, lineOne, lineTwo, lineThree, cityName, countryID, countrySubDivisionName }: ram.TradeAddressType,
  parent: XmlElement,
): void {
  if (postcodeCode) {
    convertCode(postcodeCode, parent.addElement('ram:PostcodeCode'))
  }
  if (lineOne) {
    convertText(lineOne, parent.addElement('ram:LineOne'))
  }
  if (lineTwo) {
    convertText(lineTwo, parent.addElement('ram:LineTwo'))
  }
  if (lineThree) {
    convertText(lineThree, parent.addElement('ram:LineThree'))
  }
  if (cityName) {
    convertText(cityName, parent.addElement('ram:CityName'))
  }
  parent.addElement('ram:CountryID').addText(countryID.value)
  if (countrySubDivisionName && countrySubDivisionName.length > 0) {
    countrySubDivisionName.forEach(n => convertText(n, parent.addElement('ram:CountrySubDivisionName')))
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
    convertSupplyChainConsignment(relatedSupplyChainConsignment, parent.addElement('ram:RelatedSupplyChainConsignment'))
  }
  if (shipToTradeParty) {
    convertTradeParty(shipToTradeParty, parent.addElement('ram:ShipToTradeParty'))
  }
  if (ultimateShipToTradeParty) {
    convertTradeParty(ultimateShipToTradeParty, parent.addElement('ram:UltimateShipToTradeParty'))
  }
  if (shipFromTradeParty) {
    convertTradeParty(shipFromTradeParty, parent.addElement('ram:ShipFromTradeParty'))
  }
  if (actualDeliverySupplyChainEvent) {
    convertSupplyChainEvent(actualDeliverySupplyChainEvent, parent.addElement('ram:ActualDeliverySupplyChainEvent'))
  }
  if (despatchAdviceReferencedDocument) {
    convertReferencedDocument(despatchAdviceReferencedDocument, parent.addElement('ram:DespatchAdviceReferencedDocument'))
  }
  if (receivingAdviceReferencedDocument) {
    convertReferencedDocument(receivingAdviceReferencedDocument, parent.addElement('ram:ReceivingAdviceReferencedDocument'))
  }
  if (deliveryNoteReferencedDocument) {
    convertReferencedDocument(deliveryNoteReferencedDocument, parent.addElement('ram:DeliveryNoteReferencedDocument'))
  }
}

function convertSupplyChainConsignment({ specifiedLogisticsTransportMovement }: ram.SupplyChainConsignmentType, parent: XmlElement): void {
  if (specifiedLogisticsTransportMovement && specifiedLogisticsTransportMovement.length > 0) {
    specifiedLogisticsTransportMovement.forEach((m) => {
      parent.addElement('ram:SpecifiedLogisticsTransportMovement').addElement('ram:ModeCode').addText(m.modeCode.value)
    })
  }
}

function convertSupplyChainEvent({ occurrenceDateTime }: ram.SupplyChainEventType, parent: XmlElement): void {
  if (occurrenceDateTime) {
    convertDateTime(occurrenceDateTime, parent.addElement('ram:OccurrenceDateTime'))
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
    convertID(creditorReferenceID, parent.addElement('ram:CreditorReferenceID'))
  }
  if (paymentReference) {
    convertText(paymentReference, parent.addElement('ram:PaymentReference'))
  }
  if (taxCurrencyCode) {
    parent.addElement('ram:TaxCurrencyCode').addText(taxCurrencyCode.value)
  }

  parent.addElement('ram:InvoiceCurrencyCode').addText(invoiceCurrencyCode.value)

  // The following are EXTENDED-only header parties
  if (invoiceIssuerReference) {
    convertText(invoiceIssuerReference, parent.addElement('ram:InvoiceIssuerReference'))
  }
  if (invoicerTradeParty) {
    convertTradeParty(invoicerTradeParty, parent.addElement('ram:InvoicerTradeParty'))
  }
  if (invoiceeTradeParty) {
    convertTradeParty(invoiceeTradeParty, parent.addElement('ram:InvoiceeTradeParty'))
  }
  if (payeeTradeParty) {
    convertTradeParty(payeeTradeParty, parent.addElement('ram:PayeeTradeParty'))
  }
  if (payerTradeParty) {
    convertTradeParty(payerTradeParty, parent.addElement('ram:PayerTradeParty'))
  }
  if (taxApplicableTradeCurrencyExchange) {
    convertTradeCurrencyExchange(taxApplicableTradeCurrencyExchange, parent.addElement('ram:TaxApplicableTradeCurrencyExchange'))
  }

  if (specifiedTradeSettlementPaymentMeans && specifiedTradeSettlementPaymentMeans.length > 0) {
    specifiedTradeSettlementPaymentMeans.forEach(pm => convertPaymentMeans(pm, parent.addElement('ram:SpecifiedTradeSettlementPaymentMeans')))
  }

  if (applicableTradeTax && applicableTradeTax.length > 0) {
    applicableTradeTax.forEach(tax => convertTradeTax(tax, parent.addElement('ram:ApplicableTradeTax')))
  }

  if (billingSpecifiedPeriod) {
    convertSpecifiedPeriod(billingSpecifiedPeriod, parent.addElement('ram:BillingSpecifiedPeriod'))
  }

  if (specifiedTradeAllowanceCharge && specifiedTradeAllowanceCharge.length > 0) {
    specifiedTradeAllowanceCharge.forEach(ac => convertAllowanceCharge(ac, parent.addElement('ram:SpecifiedTradeAllowanceCharge')))
  }

  if (specifiedLogisticsServiceCharge && specifiedLogisticsServiceCharge.length > 0) {
    specifiedLogisticsServiceCharge.forEach(c => convertLogisticsServiceCharge(c, parent.addElement('ram:SpecifiedLogisticsServiceCharge')))
  }

  if (specifiedTradePaymentTerms && specifiedTradePaymentTerms.length > 0) {
    specifiedTradePaymentTerms.forEach(t => convertPaymentTerms(t, parent.addElement('ram:SpecifiedTradePaymentTerms')))
  }

  convertTradeSettlementHeaderMonetarySummation(
    specifiedTradeSettlementHeaderMonetarySummation,
    parent.addElement('ram:SpecifiedTradeSettlementHeaderMonetarySummation'),
  )

  if (specifiedFinancialAdjustment && specifiedFinancialAdjustment.length > 0) {
    specifiedFinancialAdjustment.forEach(a => convertFinancialAdjustment(a, parent.addElement('ram:SpecifiedFinancialAdjustment')))
  }

  if (invoiceReferencedDocument && invoiceReferencedDocument.length > 0) {
    invoiceReferencedDocument.forEach(d => convertReferencedDocument(d, parent.addElement('ram:InvoiceReferencedDocument')))
  }

  if (receivableSpecifiedTradeAccountingAccount && receivableSpecifiedTradeAccountingAccount.length > 0) {
    receivableSpecifiedTradeAccountingAccount.forEach(a => convertTradeAccountingAccount(a, parent.addElement('ram:ReceivableSpecifiedTradeAccountingAccount')))
  }

  if (specifiedAdvancePayment && specifiedAdvancePayment.length > 0) {
    specifiedAdvancePayment.forEach(p => convertAdvancePayment(p, parent.addElement('ram:SpecifiedAdvancePayment')))
  }
}

function convertTradeCurrencyExchange(
  { sourceCurrencyCode, targetCurrencyCode, conversionRate, conversionRateDateTime }: ram.TradeCurrencyExchangeType,
  parent: XmlElement,
): void {
  parent.addElement('ram:SourceCurrencyCode').addText(sourceCurrencyCode.value)
  parent.addElement('ram:TargetCurrencyCode').addText(targetCurrencyCode.value)
  parent.addElement('ram:ConversionRate').addText(String(conversionRate.value))
  if (conversionRateDateTime) {
    convertDateTime(conversionRateDateTime, parent.addElement('ram:ConversionRateDateTime'))
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
  parent.addElement('ram:TypeCode').addText(typeCode.value)
  if (information) {
    convertText(information, parent.addElement('ram:Information'))
  }
  if (applicableTradeSettlementFinancialCard) {
    const el = parent.addElement('ram:ApplicableTradeSettlementFinancialCard')
    convertID(applicableTradeSettlementFinancialCard.id, el.addElement('ram:ID'))
    if (applicableTradeSettlementFinancialCard.cardholderName) {
      convertText(applicableTradeSettlementFinancialCard.cardholderName, el.addElement('ram:CardholderName'))
    }
  }
  if (payerPartyDebtorFinancialAccount) {
    const el = parent.addElement('ram:PayerPartyDebtorFinancialAccount')
    convertID(payerPartyDebtorFinancialAccount.ibanID, el.addElement('ram:IBANID'))
    if (payerPartyDebtorFinancialAccount.accountName) {
      convertText(payerPartyDebtorFinancialAccount.accountName, el.addElement('ram:AccountName'))
    }
  }
  if (payeePartyCreditorFinancialAccount) {
    const el = parent.addElement('ram:PayeePartyCreditorFinancialAccount')
    if (payeePartyCreditorFinancialAccount.ibanID) {
      convertID(payeePartyCreditorFinancialAccount.ibanID, el.addElement('ram:IBANID'))
    }
    if (payeePartyCreditorFinancialAccount.accountName) {
      convertText(payeePartyCreditorFinancialAccount.accountName, el.addElement('ram:AccountName'))
    }
    if (payeePartyCreditorFinancialAccount.proprietaryID) {
      convertID(payeePartyCreditorFinancialAccount.proprietaryID, el.addElement('ram:ProprietaryID'))
    }
  }
  if (payerSpecifiedDebtorFinancialInstitution?.bicID) {
    convertID(payerSpecifiedDebtorFinancialInstitution.bicID, parent.addElement('ram:PayerSpecifiedDebtorFinancialInstitution').addElement('ram:BICID'))
  }
  if (payeeSpecifiedCreditorFinancialInstitution?.bicID) {
    convertID(payeeSpecifiedCreditorFinancialInstitution.bicID, parent.addElement('ram:PayeeSpecifiedCreditorFinancialInstitution').addElement('ram:BICID'))
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
    convertAmount(calculatedAmount, parent.addElement('ram:CalculatedAmount'))
  }
  if (typeCode) {
    parent.addElement('ram:TypeCode').addText(typeCode.value)
  }
  if (exemptionReason) {
    convertText(exemptionReason, parent.addElement('ram:ExemptionReason'))
  }
  if (basisAmount) {
    convertAmount(basisAmount, parent.addElement('ram:BasisAmount'))
  }
  if (lineTotalBasisAmount) {
    convertAmount(lineTotalBasisAmount, parent.addElement('ram:LineTotalBasisAmount'))
  }
  if (allowanceChargeBasisAmount) {
    convertAmount(allowanceChargeBasisAmount, parent.addElement('ram:AllowanceChargeBasisAmount'))
  }
  if (categoryCode) {
    parent.addElement('ram:CategoryCode').addText(categoryCode.value)
  }
  if (exemptionReasonCode) {
    convertCode(exemptionReasonCode, parent.addElement('ram:ExemptionReasonCode'))
  }
  if (taxPointDate) {
    convertDate(taxPointDate, parent.addElement('ram:TaxPointDate'))
  }
  if (dueDateTypeCode) {
    parent.addElement('ram:DueDateTypeCode').addText(dueDateTypeCode.value)
  }
  if (rateApplicablePercent) {
    parent.addElement('ram:RateApplicablePercent').addText(String(rateApplicablePercent.value))
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
): void {
  convertIndicator(chargeIndicator, parent.addElement('ram:ChargeIndicator'))
  if (sequenceNumeric) {
    parent.addElement('ram:SequenceNumeric').addText(String(sequenceNumeric.value))
  }
  if (calculationPercent) {
    parent.addElement('ram:CalculationPercent').addText(String(calculationPercent.value))
  }
  if (basisAmount) {
    convertAmount(basisAmount, parent.addElement('ram:BasisAmount'))
  }
  if (basisQuantity) {
    convertQuantity(basisQuantity, parent.addElement('ram:BasisQuantity'))
  }
  if (actualAmount) {
    convertAmount(actualAmount, parent.addElement('ram:ActualAmount'))
  }
  if (reasonCode) {
    parent.addElement('ram:ReasonCode').addText(reasonCode.value)
  }
  if (reason) {
    convertText(reason, parent.addElement('ram:Reason'))
  }
  if (categoryTradeTax) {
    convertTradeTax(categoryTradeTax, parent.addElement('ram:CategoryTradeTax'))
  }
}

function convertLogisticsServiceCharge(
  { description, appliedAmount, appliedTradeTax }: ram.LogisticsServiceChargeType,
  parent: XmlElement,
): void {
  convertText(description, parent.addElement('ram:Description'))
  convertAmount(appliedAmount, parent.addElement('ram:AppliedAmount'))
  if (appliedTradeTax && appliedTradeTax.length > 0) {
    appliedTradeTax.forEach(t => convertTradeTax(t, parent.addElement('ram:AppliedTradeTax')))
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
    convertText(description, parent.addElement('ram:Description'))
  }
  if (dueDateDateTime) {
    convertDateTime(dueDateDateTime, parent.addElement('ram:DueDateDateTime'))
  }
  if (directDebitMandateID) {
    convertID(directDebitMandateID, parent.addElement('ram:DirectDebitMandateID'))
  }
  if (partialPaymentAmount) {
    convertAmount(partialPaymentAmount, parent.addElement('ram:PartialPaymentAmount'))
  }
  if (applicableTradePaymentPenaltyTerms) {
    convertPaymentPenaltyTerms(applicableTradePaymentPenaltyTerms, parent.addElement('ram:ApplicableTradePaymentPenaltyTerms'))
  }
  if (applicableTradePaymentDiscountTerms) {
    convertPaymentDiscountTerms(applicableTradePaymentDiscountTerms, parent.addElement('ram:ApplicableTradePaymentDiscountTerms'))
  }
  if (payeeTradeParty) {
    convertTradeParty(payeeTradeParty, parent.addElement('ram:PayeeTradeParty'))
  }
}

function convertPaymentPenaltyTerms(
  { basisDateTime, basisPeriodMeasure, basisAmount, calculationPercent, actualPenaltyAmount }: ram.TradePaymentPenaltyTermsType,
  parent: XmlElement,
): void {
  if (basisDateTime) {
    convertDateTime(basisDateTime, parent.addElement('ram:BasisDateTime'))
  }
  if (basisPeriodMeasure) {
    convertMeasure(basisPeriodMeasure, parent.addElement('ram:BasisPeriodMeasure'))
  }
  if (basisAmount) {
    convertAmount(basisAmount, parent.addElement('ram:BasisAmount'))
  }
  if (calculationPercent) {
    parent.addElement('ram:CalculationPercent').addText(String(calculationPercent.value))
  }
  if (actualPenaltyAmount) {
    convertAmount(actualPenaltyAmount, parent.addElement('ram:ActualPenaltyAmount'))
  }
}

function convertPaymentDiscountTerms(
  { basisDateTime, basisPeriodMeasure, basisAmount, calculationPercent, actualDiscountAmount }: ram.TradePaymentDiscountTermsType,
  parent: XmlElement,
): void {
  if (basisDateTime) {
    convertDateTime(basisDateTime, parent.addElement('ram:BasisDateTime'))
  }
  if (basisPeriodMeasure) {
    convertMeasure(basisPeriodMeasure, parent.addElement('ram:BasisPeriodMeasure'))
  }
  if (basisAmount) {
    convertAmount(basisAmount, parent.addElement('ram:BasisAmount'))
  }
  if (calculationPercent) {
    parent.addElement('ram:CalculationPercent').addText(String(calculationPercent.value))
  }
  if (actualDiscountAmount) {
    convertAmount(actualDiscountAmount, parent.addElement('ram:ActualDiscountAmount'))
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
    convertAmount(lineTotalAmount, parent.addElement('ram:LineTotalAmount'))
  }
  if (chargeTotalAmount) {
    convertAmount(chargeTotalAmount, parent.addElement('ram:ChargeTotalAmount'))
  }
  if (allowanceTotalAmount) {
    convertAmount(allowanceTotalAmount, parent.addElement('ram:AllowanceTotalAmount'))
  }
  convertAmount(taxBasisTotalAmount, parent.addElement('ram:TaxBasisTotalAmount'))
  if (taxTotalAmount && taxTotalAmount.length > 0) {
    taxTotalAmount.forEach(a => convertAmount(a, parent.addElement('ram:TaxTotalAmount')))
  }
  if (roundingAmount) {
    convertAmount(roundingAmount, parent.addElement('ram:RoundingAmount'))
  }
  convertAmount(grandTotalAmount, parent.addElement('ram:GrandTotalAmount'))
  if (totalPrepaidAmount) {
    convertAmount(totalPrepaidAmount, parent.addElement('ram:TotalPrepaidAmount'))
  }
  convertAmount(duePayableAmount, parent.addElement('ram:DuePayableAmount'))
}

function convertFinancialAdjustment({ reason, actualAmount }: ram.FinancialAdjustmentType, parent: XmlElement): void {
  convertText(reason, parent.addElement('ram:Reason'))
  convertAmount(actualAmount, parent.addElement('ram:ActualAmount'))
}

function convertTradeAccountingAccount({ id, typeCode }: ram.TradeAccountingAccountType, parent: XmlElement): void {
  convertID(id, parent.addElement('ram:ID'))
  if (typeCode) {
    parent.addElement('ram:TypeCode').addText(typeCode.value)
  }
}

function convertAdvancePayment(
  { paidAmount, formattedReceivedDateTime, includedTradeTax, invoiceSpecifiedReferencedDocument }: ram.AdvancePaymentType,
  parent: XmlElement,
): void {
  convertAmount(paidAmount, parent.addElement('ram:PaidAmount'))
  if (formattedReceivedDateTime) {
    convertFormattedDateTime(formattedReceivedDateTime, parent.addElement('ram:FormattedReceivedDateTime'))
  }
  if (includedTradeTax && includedTradeTax.length > 0) {
    includedTradeTax.forEach(t => convertTradeTax(t, parent.addElement('ram:IncludedTradeTax')))
  }
  if (invoiceSpecifiedReferencedDocument) {
    convertReferencedDocument(invoiceSpecifiedReferencedDocument, parent.addElement('ram:InvoiceSpecifiedReferencedDocument'))
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
    convertID(issuerAssignedID, parent.addElement('ram:IssuerAssignedID'))
  }
  if (uriID) {
    convertID(uriID, parent.addElement('ram:URIID'))
  }
  if (lineID) {
    convertID(lineID, parent.addElement('ram:LineID'))
  }
  if (typeCode) {
    parent.addElement('ram:TypeCode').addText(typeCode.value)
  }
  if (name && name.length > 0) {
    name.forEach(n => convertText(n, parent.addElement('ram:Name')))
  }
  if (attachmentBinaryObject) {
    convertBinaryObject(attachmentBinaryObject, parent.addElement('ram:AttachmentBinaryObject'))
  }
  if (referenceTypeCode) {
    parent.addElement('ram:ReferenceTypeCode').addText(referenceTypeCode.value)
  }
  if (formattedIssueDateTime) {
    convertFormattedDateTime(formattedIssueDateTime, parent.addElement('ram:FormattedIssueDateTime'))
  }
}
