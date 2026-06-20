import type { XMLDocument, XMLElement } from 'libxmljs'
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
import { parseXmlAsync } from 'libxmljs'

/**
 * Converter for FacturX CrossIndustryInvoice model to XML.
 *
 * Element emission follows the xs:sequence order of the Factur-X 1.09 (CII D22B)
 * EXTENDED schema, which is a superset of all lower profiles. Only fields that
 * are present on the model are emitted, so the same converter produces valid
 * output for MINIMUM through EXTENDED.
 */
export async function invoiceToXml(invoice: CrossIndustryInvoiceType): Promise<XMLDocument> {
  const xmlString = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
</rsm:CrossIndustryInvoice>`

  const doc = await parseXmlAsync(xmlString)
  const rootElement = doc.root() as XMLElement

  convertExchangedDocumentContext(invoice.exchangedDocumentContext, rootElement)
  convertExchangedDocument(invoice.exchangedDocument, rootElement)
  convertSupplyChainTradeTransaction(invoice.supplyChainTradeTransaction, rootElement)

  return doc
}

// ---------------------------------------------------------------------------
// Primitive (Unqualified / Qualified data type) converters
// ---------------------------------------------------------------------------

function convertAmount({ value, currencyID }: udt.AmountType, parent: XMLElement): XMLElement {
  parent.text(value.toFixed(2))
  if (currencyID) {
    parent.attr({ currencyID })
  }
  return parent
}

function convertID({ value, schemeID }: udt.IDType, parent: XMLElement): XMLElement {
  parent.text(value)
  if (schemeID) {
    parent.attr({ schemeID })
  }
  return parent
}

function convertText({ value }: udt.TextType, parent: XMLElement): XMLElement {
  parent.text(value)
  return parent
}

function convertCode({ value, listID, listVersionID }: udt.CodeType, parent: XMLElement): XMLElement {
  parent.text(value)
  if (listID) {
    parent.attr({ listID })
  }
  if (listVersionID) {
    parent.attr({ listVersionID })
  }
  return parent
}

function convertQuantity({ value, unitCode }: udt.QuantityType, parent: XMLElement): XMLElement {
  parent.text(String(value))
  if (unitCode) {
    parent.attr({ unitCode })
  }
  return parent
}

function convertMeasure({ value, unitCode }: udt.MeasureType, parent: XMLElement): XMLElement {
  parent.text(String(value))
  if (unitCode) {
    parent.attr({ unitCode })
  }
  return parent
}

function convertDateTime({ dateTimeString, format }: udt.DateTimeType, parent: XMLElement): XMLElement {
  const el = parent.node('udt:DateTimeString', dateTimeString)
  el.attr({ format })
  return parent
}

function convertDate({ dateString, format }: udt.DateType, parent: XMLElement): XMLElement {
  const el = parent.node('udt:DateString', dateString)
  el.attr({ format })
  return parent
}

/** FormattedDateTimeType uses the qdt:DateTimeString element (qualified namespace). */
function convertFormattedDateTime(
  { dateTimeString, format }: { dateTimeString: string, format: string },
  parent: XMLElement,
): XMLElement {
  const el = parent.node('qdt:DateTimeString', dateTimeString)
  el.attr({ format })
  return parent
}

function convertIndicator({ indicator }: udt.IndicatorType, parent: XMLElement): XMLElement {
  parent.node('udt:Indicator', String(indicator))
  return parent
}

function convertBinaryObject({ value, mimeCode, filename }: udt.BinaryObjectType, parent: XMLElement): XMLElement {
  parent.text(value)
  parent.attr({ mimeCode, filename })
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
  parent: XMLElement,
): void {
  const context = parent.node('rsm:ExchangedDocumentContext')

  if (testIndicator) {
    convertIndicator(testIndicator, context.node('ram:TestIndicator'))
  }

  if (businessProcessSpecifiedDocumentContextParameter) {
    convertDocumentContextParameter(
      businessProcessSpecifiedDocumentContextParameter,
      context.node('ram:BusinessProcessSpecifiedDocumentContextParameter'),
    )
  }

  convertDocumentContextParameter(
    guidelineSpecifiedDocumentContextParameter,
    context.node('ram:GuidelineSpecifiedDocumentContextParameter'),
  )
}

function convertDocumentContextParameter({ id }: ram.DocumentContextParameterType, parent: XMLElement): void {
  convertID(id, parent.node('ram:ID'))
}

// ---------------------------------------------------------------------------
// ExchangedDocument
// ---------------------------------------------------------------------------

function convertExchangedDocument(
  { id, name, typeCode, issueDateTime, copyIndicator, languageID, includedNote, effectiveSpecifiedPeriod }: ExchangedDocumentType,
  parent: XMLElement,
): void {
  const doc = parent.node('rsm:ExchangedDocument')

  convertID(id, doc.node('ram:ID'))

  if (name) {
    convertText(name, doc.node('ram:Name'))
  }

  doc.node('ram:TypeCode', typeCode.value)

  convertDateTime(issueDateTime, doc.node('ram:IssueDateTime'))

  if (copyIndicator) {
    convertIndicator(copyIndicator, doc.node('ram:CopyIndicator'))
  }

  if (languageID && languageID.length > 0) {
    languageID.forEach(lang => convertID(lang, doc.node('ram:LanguageID')))
  }

  if (includedNote && includedNote.length > 0) {
    includedNote.forEach(note => convertNote(note, doc.node('ram:IncludedNote')))
  }

  if (effectiveSpecifiedPeriod) {
    convertSpecifiedPeriod(effectiveSpecifiedPeriod, doc.node('ram:EffectiveSpecifiedPeriod'))
  }
}

function convertNote({ contentCode, content, subjectCode }: ram.NoteType, parent: XMLElement): void {
  if (contentCode) {
    convertCode(contentCode, parent.node('ram:ContentCode'))
  }
  if (content) {
    convertText(content, parent.node('ram:Content'))
  }
  if (subjectCode) {
    convertCode(subjectCode, parent.node('ram:SubjectCode'))
  }
}

function convertSpecifiedPeriod(
  { description, startDateTime, endDateTime, completeDateTime }: ram.SpecifiedPeriodType,
  parent: XMLElement,
): void {
  if (description) {
    convertText(description, parent.node('ram:Description'))
  }
  if (startDateTime) {
    convertDateTime(startDateTime, parent.node('ram:StartDateTime'))
  }
  if (endDateTime) {
    convertDateTime(endDateTime, parent.node('ram:EndDateTime'))
  }
  if (completeDateTime) {
    convertDateTime(completeDateTime, parent.node('ram:CompleteDateTime'))
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
  parent: XMLElement,
): void {
  const transaction = parent.node('rsm:SupplyChainTradeTransaction')

  if (includedSupplyChainTradeLineItem && includedSupplyChainTradeLineItem.length > 0) {
    includedSupplyChainTradeLineItem.forEach((lineItem) => {
      convertSupplyChainTradeLineItem(lineItem, transaction.node('ram:IncludedSupplyChainTradeLineItem'))
    })
  }

  convertHeaderTradeAgreement(applicableHeaderTradeAgreement, transaction.node('ram:ApplicableHeaderTradeAgreement'))
  convertHeaderTradeDelivery(applicableHeaderTradeDelivery, transaction.node('ram:ApplicableHeaderTradeDelivery'))
  convertHeaderTradeSettlement(applicableHeaderTradeSettlement, transaction.node('ram:ApplicableHeaderTradeSettlement'))
}

// ---------------------------------------------------------------------------
// Line items
// ---------------------------------------------------------------------------

function convertSupplyChainTradeLineItem(lineItem: ram.SupplyChainTradeLineItemType, parent: XMLElement): void {
  convertDocumentLineDocument(lineItem.associatedDocumentLineDocument, parent.node('ram:AssociatedDocumentLineDocument'))
  convertTradeProduct(lineItem.specifiedTradeProduct, parent.node('ram:SpecifiedTradeProduct'))

  if (lineItem.specifiedLineTradeAgreement) {
    convertLineTradeAgreement(lineItem.specifiedLineTradeAgreement, parent.node('ram:SpecifiedLineTradeAgreement'))
  }
  if (lineItem.specifiedLineTradeDelivery) {
    convertLineTradeDelivery(lineItem.specifiedLineTradeDelivery, parent.node('ram:SpecifiedLineTradeDelivery'))
  }
  if (lineItem.specifiedLineTradeSettlement) {
    convertLineTradeSettlement(lineItem.specifiedLineTradeSettlement, parent.node('ram:SpecifiedLineTradeSettlement'))
  }
}

function convertDocumentLineDocument(
  { lineID, parentLineID, lineStatusCode, lineStatusReasonCode, includedNote }: ram.DocumentLineDocumentType,
  parent: XMLElement,
): void {
  convertID(lineID, parent.node('ram:LineID'))
  if (parentLineID) {
    convertID(parentLineID, parent.node('ram:ParentLineID'))
  }
  if (lineStatusCode) {
    parent.node('ram:LineStatusCode', lineStatusCode.value)
  }
  if (lineStatusReasonCode) {
    convertCode(lineStatusReasonCode, parent.node('ram:LineStatusReasonCode'))
  }
  if (includedNote && includedNote.length > 0) {
    includedNote.forEach(note => convertNote(note, parent.node('ram:IncludedNote')))
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
  parent: XMLElement,
): void {
  if (id) {
    convertID(id, parent.node('ram:ID'))
  }
  if (globalID) {
    convertID(globalID, parent.node('ram:GlobalID'))
  }
  if (sellerAssignedID) {
    convertID(sellerAssignedID, parent.node('ram:SellerAssignedID'))
  }
  if (buyerAssignedID) {
    convertID(buyerAssignedID, parent.node('ram:BuyerAssignedID'))
  }
  if (industryAssignedID) {
    convertID(industryAssignedID, parent.node('ram:IndustryAssignedID'))
  }
  if (modelID) {
    convertID(modelID, parent.node('ram:ModelID'))
  }
  if (name) {
    convertText(name, parent.node('ram:Name'))
  }
  if (description) {
    convertText(description, parent.node('ram:Description'))
  }
  if (batchID && batchID.length > 0) {
    batchID.forEach(b => convertID(b, parent.node('ram:BatchID')))
  }
  if (brandName) {
    convertText(brandName, parent.node('ram:BrandName'))
  }
  if (modelName) {
    convertText(modelName, parent.node('ram:ModelName'))
  }
  if (applicableProductCharacteristic && applicableProductCharacteristic.length > 0) {
    applicableProductCharacteristic.forEach(c => convertProductCharacteristic(c, parent.node('ram:ApplicableProductCharacteristic')))
  }
  if (designatedProductClassification && designatedProductClassification.length > 0) {
    designatedProductClassification.forEach(c => convertProductClassification(c, parent.node('ram:DesignatedProductClassification')))
  }
  if (individualTradeProductInstance && individualTradeProductInstance.length > 0) {
    individualTradeProductInstance.forEach(i => convertTradeProductInstance(i, parent.node('ram:IndividualTradeProductInstance')))
  }
  if (originTradeCountry?.id) {
    parent.node('ram:OriginTradeCountry').node('ram:ID', originTradeCountry.id.value)
  }
  if (manufacturerTradeParty) {
    convertTradeParty(manufacturerTradeParty, parent.node('ram:ManufacturerTradeParty'))
  }
  if (includedReferencedProduct && includedReferencedProduct.length > 0) {
    includedReferencedProduct.forEach(p => convertReferencedProduct(p, parent.node('ram:IncludedReferencedProduct')))
  }
}

function convertProductCharacteristic(
  { typeCode, description, valueMeasure, value }: ram.ProductCharacteristicType,
  parent: XMLElement,
): void {
  if (typeCode) {
    convertCode(typeCode, parent.node('ram:TypeCode'))
  }
  if (description) {
    convertText(description, parent.node('ram:Description'))
  }
  if (valueMeasure) {
    convertMeasure(valueMeasure, parent.node('ram:ValueMeasure'))
  }
  if (value) {
    convertText(value, parent.node('ram:Value'))
  }
}

function convertProductClassification(
  { classCode, className }: ram.ProductClassificationType,
  parent: XMLElement,
): void {
  if (classCode) {
    convertCode(classCode, parent.node('ram:ClassCode'))
  }
  if (className) {
    convertText(className, parent.node('ram:ClassName'))
  }
}

function convertTradeProductInstance(
  { batchID, supplierAssignedSerialID }: ram.TradeProductInstanceType,
  parent: XMLElement,
): void {
  if (batchID) {
    convertID(batchID, parent.node('ram:BatchID'))
  }
  if (supplierAssignedSerialID) {
    convertID(supplierAssignedSerialID, parent.node('ram:SupplierAssignedSerialID'))
  }
}

function convertReferencedProduct(
  { id, globalID, sellerAssignedID, buyerAssignedID, industryAssignedID, name, description, unitQuantity }: ram.ReferencedProductType,
  parent: XMLElement,
): void {
  if (id) {
    convertID(id, parent.node('ram:ID'))
  }
  if (globalID && globalID.length > 0) {
    globalID.forEach(g => convertID(g, parent.node('ram:GlobalID')))
  }
  if (sellerAssignedID) {
    convertID(sellerAssignedID, parent.node('ram:SellerAssignedID'))
  }
  if (buyerAssignedID) {
    convertID(buyerAssignedID, parent.node('ram:BuyerAssignedID'))
  }
  if (industryAssignedID) {
    convertID(industryAssignedID, parent.node('ram:IndustryAssignedID'))
  }
  convertText(name, parent.node('ram:Name'))
  if (description) {
    convertText(description, parent.node('ram:Description'))
  }
  if (unitQuantity) {
    convertQuantity(unitQuantity, parent.node('ram:UnitQuantity'))
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
  parent: XMLElement,
): void {
  if (applicableTradeDeliveryTerms) {
    convertTradeDeliveryTerms(applicableTradeDeliveryTerms, parent.node('ram:ApplicableTradeDeliveryTerms'))
  }
  if (sellerOrderReferencedDocument) {
    convertReferencedDocument(sellerOrderReferencedDocument, parent.node('ram:SellerOrderReferencedDocument'))
  }
  if (buyerOrderReferencedDocument) {
    convertReferencedDocument(buyerOrderReferencedDocument, parent.node('ram:BuyerOrderReferencedDocument'))
  }
  if (quotationReferencedDocument) {
    convertReferencedDocument(quotationReferencedDocument, parent.node('ram:QuotationReferencedDocument'))
  }
  if (contractReferencedDocument) {
    convertReferencedDocument(contractReferencedDocument, parent.node('ram:ContractReferencedDocument'))
  }
  if (additionalReferencedDocument && additionalReferencedDocument.length > 0) {
    additionalReferencedDocument.forEach(d => convertReferencedDocument(d, parent.node('ram:AdditionalReferencedDocument')))
  }
  if (grossPriceProductTradePrice) {
    convertTradePrice(grossPriceProductTradePrice, parent.node('ram:GrossPriceProductTradePrice'))
  }
  if (netPriceProductTradePrice) {
    convertTradePrice(netPriceProductTradePrice, parent.node('ram:NetPriceProductTradePrice'))
  }
  if (itemSellerTradeParty) {
    convertTradeParty(itemSellerTradeParty, parent.node('ram:ItemSellerTradeParty'))
  }
  if (ultimateCustomerOrderReferencedDocument && ultimateCustomerOrderReferencedDocument.length > 0) {
    ultimateCustomerOrderReferencedDocument.forEach(d => convertReferencedDocument(d, parent.node('ram:UltimateCustomerOrderReferencedDocument')))
  }
}

function convertTradePrice(
  { chargeAmount, basisQuantity, appliedTradeAllowanceCharge, includedTradeTax }: ram.TradePriceType,
  parent: XMLElement,
): void {
  if (chargeAmount) {
    convertAmount(chargeAmount, parent.node('ram:ChargeAmount'))
  }
  if (basisQuantity) {
    convertQuantity(basisQuantity, parent.node('ram:BasisQuantity'))
  }
  if (appliedTradeAllowanceCharge && appliedTradeAllowanceCharge.length > 0) {
    appliedTradeAllowanceCharge.forEach(ac => convertAllowanceCharge(ac, parent.node('ram:AppliedTradeAllowanceCharge')))
  }
  if (includedTradeTax) {
    convertTradeTax(includedTradeTax, parent.node('ram:IncludedTradeTax'))
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
  parent: XMLElement,
): void {
  if (billedQuantity) {
    convertQuantity(billedQuantity, parent.node('ram:BilledQuantity'))
  }
  if (chargeFreeQuantity) {
    convertQuantity(chargeFreeQuantity, parent.node('ram:ChargeFreeQuantity'))
  }
  if (packageQuantity) {
    convertQuantity(packageQuantity, parent.node('ram:PackageQuantity'))
  }
  if (perPackageUnitQuantity) {
    convertQuantity(perPackageUnitQuantity, parent.node('ram:PerPackageUnitQuantity'))
  }
  if (shipToTradeParty) {
    convertTradeParty(shipToTradeParty, parent.node('ram:ShipToTradeParty'))
  }
  if (ultimateShipToTradeParty) {
    convertTradeParty(ultimateShipToTradeParty, parent.node('ram:UltimateShipToTradeParty'))
  }
  if (actualDeliverySupplyChainEvent) {
    convertSupplyChainEvent(actualDeliverySupplyChainEvent, parent.node('ram:ActualDeliverySupplyChainEvent'))
  }
  if (despatchAdviceReferencedDocument) {
    convertReferencedDocument(despatchAdviceReferencedDocument, parent.node('ram:DespatchAdviceReferencedDocument'))
  }
  if (receivingAdviceReferencedDocument) {
    convertReferencedDocument(receivingAdviceReferencedDocument, parent.node('ram:ReceivingAdviceReferencedDocument'))
  }
  if (deliveryNoteReferencedDocument) {
    convertReferencedDocument(deliveryNoteReferencedDocument, parent.node('ram:DeliveryNoteReferencedDocument'))
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
  parent: XMLElement,
): void {
  if (applicableTradeTax && applicableTradeTax.length > 0) {
    applicableTradeTax.forEach(tax => convertTradeTax(tax, parent.node('ram:ApplicableTradeTax')))
  }
  if (billingSpecifiedPeriod) {
    convertSpecifiedPeriod(billingSpecifiedPeriod, parent.node('ram:BillingSpecifiedPeriod'))
  }
  if (specifiedTradeAllowanceCharge && specifiedTradeAllowanceCharge.length > 0) {
    specifiedTradeAllowanceCharge.forEach(ac => convertAllowanceCharge(ac, parent.node('ram:SpecifiedTradeAllowanceCharge')))
  }
  if (specifiedTradeSettlementLineMonetarySummation) {
    convertTradeSettlementLineMonetarySummation(
      specifiedTradeSettlementLineMonetarySummation,
      parent.node('ram:SpecifiedTradeSettlementLineMonetarySummation'),
    )
  }
  if (invoiceReferencedDocument) {
    convertReferencedDocument(invoiceReferencedDocument, parent.node('ram:InvoiceReferencedDocument'))
  }
  if (additionalReferencedDocument && additionalReferencedDocument.length > 0) {
    additionalReferencedDocument.forEach(d => convertReferencedDocument(d, parent.node('ram:AdditionalReferencedDocument')))
  }
  if (receivableSpecifiedTradeAccountingAccount && receivableSpecifiedTradeAccountingAccount.length > 0) {
    receivableSpecifiedTradeAccountingAccount.forEach(a => convertTradeAccountingAccount(a, parent.node('ram:ReceivableSpecifiedTradeAccountingAccount')))
  }
}

function convertTradeSettlementLineMonetarySummation(
  { lineTotalAmount, chargeTotalAmount, allowanceTotalAmount, taxTotalAmount, grandTotalAmount, totalAllowanceChargeAmount }: ram.TradeSettlementLineMonetarySummationType,
  parent: XMLElement,
): void {
  if (lineTotalAmount) {
    convertAmount(lineTotalAmount, parent.node('ram:LineTotalAmount'))
  }
  if (chargeTotalAmount) {
    convertAmount(chargeTotalAmount, parent.node('ram:ChargeTotalAmount'))
  }
  if (allowanceTotalAmount) {
    convertAmount(allowanceTotalAmount, parent.node('ram:AllowanceTotalAmount'))
  }
  if (taxTotalAmount) {
    convertAmount(taxTotalAmount, parent.node('ram:TaxTotalAmount'))
  }
  if (grandTotalAmount) {
    convertAmount(grandTotalAmount, parent.node('ram:GrandTotalAmount'))
  }
  if (totalAllowanceChargeAmount) {
    convertAmount(totalAllowanceChargeAmount, parent.node('ram:TotalAllowanceChargeAmount'))
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
  parent: XMLElement,
): void {
  if (buyerReference) {
    convertText(buyerReference, parent.node('ram:BuyerReference'))
  }

  convertTradeParty(sellerTradeParty, parent.node('ram:SellerTradeParty'))
  convertTradeParty(buyerTradeParty, parent.node('ram:BuyerTradeParty'))

  if (salesAgentTradeParty) {
    convertTradeParty(salesAgentTradeParty, parent.node('ram:SalesAgentTradeParty'))
  }
  if (buyerTaxRepresentativeTradeParty) {
    convertTradeParty(buyerTaxRepresentativeTradeParty, parent.node('ram:BuyerTaxRepresentativeTradeParty'))
  }
  if (sellerTaxRepresentativeTradeParty) {
    convertTradeParty(sellerTaxRepresentativeTradeParty, parent.node('ram:SellerTaxRepresentativeTradeParty'))
  }
  if (productEndUserTradeParty) {
    convertTradeParty(productEndUserTradeParty, parent.node('ram:ProductEndUserTradeParty'))
  }
  if (applicableTradeDeliveryTerms) {
    convertTradeDeliveryTerms(applicableTradeDeliveryTerms, parent.node('ram:ApplicableTradeDeliveryTerms'))
  }
  if (sellerOrderReferencedDocument) {
    convertReferencedDocument(sellerOrderReferencedDocument, parent.node('ram:SellerOrderReferencedDocument'))
  }
  if (buyerOrderReferencedDocument) {
    convertReferencedDocument(buyerOrderReferencedDocument, parent.node('ram:BuyerOrderReferencedDocument'))
  }
  if (quotationReferencedDocument) {
    convertReferencedDocument(quotationReferencedDocument, parent.node('ram:QuotationReferencedDocument'))
  }
  if (contractReferencedDocument) {
    convertReferencedDocument(contractReferencedDocument, parent.node('ram:ContractReferencedDocument'))
  }
  if (additionalReferencedDocument && additionalReferencedDocument.length > 0) {
    additionalReferencedDocument.forEach(d => convertReferencedDocument(d, parent.node('ram:AdditionalReferencedDocument')))
  }
  if (buyerAgentTradeParty) {
    convertTradeParty(buyerAgentTradeParty, parent.node('ram:BuyerAgentTradeParty'))
  }
  if (specifiedProcuringProject) {
    convertProcuringProject(specifiedProcuringProject, parent.node('ram:SpecifiedProcuringProject'))
  }
  if (ultimateCustomerOrderReferencedDocument && ultimateCustomerOrderReferencedDocument.length > 0) {
    ultimateCustomerOrderReferencedDocument.forEach(d => convertReferencedDocument(d, parent.node('ram:UltimateCustomerOrderReferencedDocument')))
  }
}

function convertProcuringProject({ id, name }: ram.ProcuringProjectType, parent: XMLElement): void {
  convertID(id, parent.node('ram:ID'))
  convertText(name, parent.node('ram:Name'))
}

function convertTradeDeliveryTerms({ deliveryTypeCode, relevantTradeLocation }: ram.TradeDeliveryTermsType, parent: XMLElement): void {
  if (deliveryTypeCode) {
    parent.node('ram:DeliveryTypeCode', deliveryTypeCode.value)
  }
  if (relevantTradeLocation) {
    const el = parent.node('ram:RelevantTradeLocation')
    if (relevantTradeLocation.countryID) {
      el.node('ram:CountryID', relevantTradeLocation.countryID.value)
    }
    if (relevantTradeLocation.name) {
      convertText(relevantTradeLocation.name, el.node('ram:Name'))
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
  parent: XMLElement,
): void {
  if (id && id.length > 0) {
    id.forEach(i => convertID(i, parent.node('ram:ID')))
  }
  if (globalID && globalID.length > 0) {
    globalID.forEach(g => convertID(g, parent.node('ram:GlobalID')))
  }
  if (name) {
    convertText(name, parent.node('ram:Name'))
  }
  if (roleCode) {
    parent.node('ram:RoleCode', roleCode.value)
  }
  if (description) {
    convertText(description, parent.node('ram:Description'))
  }
  if (specifiedLegalOrganization) {
    convertLegalOrganization(specifiedLegalOrganization, parent.node('ram:SpecifiedLegalOrganization'))
  }
  if (definedTradeContact && definedTradeContact.length > 0) {
    definedTradeContact.forEach(c => convertTradeContact(c, parent.node('ram:DefinedTradeContact')))
  }
  if (postalTradeAddress) {
    convertTradeAddress(postalTradeAddress, parent.node('ram:PostalTradeAddress'))
  }
  if (uriUniversalCommunication) {
    convertUniversalCommunication(uriUniversalCommunication, parent.node('ram:URIUniversalCommunication'))
  }
  if (specifiedTaxRegistration && specifiedTaxRegistration.length > 0) {
    specifiedTaxRegistration.forEach((tax) => {
      const taxEl = parent.node('ram:SpecifiedTaxRegistration')
      convertID(tax.id, taxEl.node('ram:ID'))
    })
  }
}

function convertLegalOrganization(
  { id, tradingBusinessName, postalTradeAddress }: ram.LegalOrganizationType,
  parent: XMLElement,
): void {
  if (id) {
    convertID(id, parent.node('ram:ID'))
  }
  if (tradingBusinessName) {
    convertText(tradingBusinessName, parent.node('ram:TradingBusinessName'))
  }
  if (postalTradeAddress) {
    convertTradeAddress(postalTradeAddress, parent.node('ram:PostalTradeAddress'))
  }
}

function convertTradeContact(
  { personName, departmentName, typeCode, telephoneUniversalCommunication, faxUniversalCommunication, emailURIUniversalCommunication }: ram.TradeContactType,
  parent: XMLElement,
): void {
  if (personName) {
    convertText(personName, parent.node('ram:PersonName'))
  }
  if (departmentName) {
    convertText(departmentName, parent.node('ram:DepartmentName'))
  }
  if (typeCode) {
    parent.node('ram:TypeCode', typeCode.value)
  }
  if (telephoneUniversalCommunication) {
    convertUniversalCommunication(telephoneUniversalCommunication, parent.node('ram:TelephoneUniversalCommunication'))
  }
  if (faxUniversalCommunication) {
    convertUniversalCommunication(faxUniversalCommunication, parent.node('ram:FaxUniversalCommunication'))
  }
  if (emailURIUniversalCommunication) {
    convertUniversalCommunication(emailURIUniversalCommunication, parent.node('ram:EmailURIUniversalCommunication'))
  }
}

function convertUniversalCommunication({ uriID, completeNumber }: ram.UniversalCommunicationType, parent: XMLElement): void {
  if (uriID) {
    convertID(uriID, parent.node('ram:URIID'))
  }
  if (completeNumber) {
    convertText(completeNumber, parent.node('ram:CompleteNumber'))
  }
}

function convertTradeAddress(
  { postcodeCode, lineOne, lineTwo, lineThree, cityName, countryID, countrySubDivisionName }: ram.TradeAddressType,
  parent: XMLElement,
): void {
  if (postcodeCode) {
    convertCode(postcodeCode, parent.node('ram:PostcodeCode'))
  }
  if (lineOne) {
    convertText(lineOne, parent.node('ram:LineOne'))
  }
  if (lineTwo) {
    convertText(lineTwo, parent.node('ram:LineTwo'))
  }
  if (lineThree) {
    convertText(lineThree, parent.node('ram:LineThree'))
  }
  if (cityName) {
    convertText(cityName, parent.node('ram:CityName'))
  }
  parent.node('ram:CountryID', countryID.value)
  if (countrySubDivisionName && countrySubDivisionName.length > 0) {
    countrySubDivisionName.forEach(n => convertText(n, parent.node('ram:CountrySubDivisionName')))
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
  parent: XMLElement,
): void {
  if (relatedSupplyChainConsignment) {
    convertSupplyChainConsignment(relatedSupplyChainConsignment, parent.node('ram:RelatedSupplyChainConsignment'))
  }
  if (shipToTradeParty) {
    convertTradeParty(shipToTradeParty, parent.node('ram:ShipToTradeParty'))
  }
  if (ultimateShipToTradeParty) {
    convertTradeParty(ultimateShipToTradeParty, parent.node('ram:UltimateShipToTradeParty'))
  }
  if (shipFromTradeParty) {
    convertTradeParty(shipFromTradeParty, parent.node('ram:ShipFromTradeParty'))
  }
  if (actualDeliverySupplyChainEvent) {
    convertSupplyChainEvent(actualDeliverySupplyChainEvent, parent.node('ram:ActualDeliverySupplyChainEvent'))
  }
  if (despatchAdviceReferencedDocument) {
    convertReferencedDocument(despatchAdviceReferencedDocument, parent.node('ram:DespatchAdviceReferencedDocument'))
  }
  if (receivingAdviceReferencedDocument) {
    convertReferencedDocument(receivingAdviceReferencedDocument, parent.node('ram:ReceivingAdviceReferencedDocument'))
  }
  if (deliveryNoteReferencedDocument) {
    convertReferencedDocument(deliveryNoteReferencedDocument, parent.node('ram:DeliveryNoteReferencedDocument'))
  }
}

function convertSupplyChainConsignment({ specifiedLogisticsTransportMovement }: ram.SupplyChainConsignmentType, parent: XMLElement): void {
  if (specifiedLogisticsTransportMovement && specifiedLogisticsTransportMovement.length > 0) {
    specifiedLogisticsTransportMovement.forEach((m) => {
      parent.node('ram:SpecifiedLogisticsTransportMovement').node('ram:ModeCode', m.modeCode.value)
    })
  }
}

function convertSupplyChainEvent({ occurrenceDateTime }: ram.SupplyChainEventType, parent: XMLElement): void {
  if (occurrenceDateTime) {
    convertDateTime(occurrenceDateTime, parent.node('ram:OccurrenceDateTime'))
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
  parent: XMLElement,
): void {
  if (creditorReferenceID) {
    convertID(creditorReferenceID, parent.node('ram:CreditorReferenceID'))
  }
  if (paymentReference) {
    convertText(paymentReference, parent.node('ram:PaymentReference'))
  }
  if (taxCurrencyCode) {
    parent.node('ram:TaxCurrencyCode', taxCurrencyCode.value)
  }

  parent.node('ram:InvoiceCurrencyCode', invoiceCurrencyCode.value)

  // The following are EXTENDED-only header parties
  if (invoiceIssuerReference) {
    convertText(invoiceIssuerReference, parent.node('ram:InvoiceIssuerReference'))
  }
  if (invoicerTradeParty) {
    convertTradeParty(invoicerTradeParty, parent.node('ram:InvoicerTradeParty'))
  }
  if (invoiceeTradeParty) {
    convertTradeParty(invoiceeTradeParty, parent.node('ram:InvoiceeTradeParty'))
  }
  if (payeeTradeParty) {
    convertTradeParty(payeeTradeParty, parent.node('ram:PayeeTradeParty'))
  }
  if (payerTradeParty) {
    convertTradeParty(payerTradeParty, parent.node('ram:PayerTradeParty'))
  }
  if (taxApplicableTradeCurrencyExchange) {
    convertTradeCurrencyExchange(taxApplicableTradeCurrencyExchange, parent.node('ram:TaxApplicableTradeCurrencyExchange'))
  }

  if (specifiedTradeSettlementPaymentMeans && specifiedTradeSettlementPaymentMeans.length > 0) {
    specifiedTradeSettlementPaymentMeans.forEach(pm => convertPaymentMeans(pm, parent.node('ram:SpecifiedTradeSettlementPaymentMeans')))
  }

  if (applicableTradeTax && applicableTradeTax.length > 0) {
    applicableTradeTax.forEach(tax => convertTradeTax(tax, parent.node('ram:ApplicableTradeTax')))
  }

  if (billingSpecifiedPeriod) {
    convertSpecifiedPeriod(billingSpecifiedPeriod, parent.node('ram:BillingSpecifiedPeriod'))
  }

  if (specifiedTradeAllowanceCharge && specifiedTradeAllowanceCharge.length > 0) {
    specifiedTradeAllowanceCharge.forEach(ac => convertAllowanceCharge(ac, parent.node('ram:SpecifiedTradeAllowanceCharge')))
  }

  if (specifiedLogisticsServiceCharge && specifiedLogisticsServiceCharge.length > 0) {
    specifiedLogisticsServiceCharge.forEach(c => convertLogisticsServiceCharge(c, parent.node('ram:SpecifiedLogisticsServiceCharge')))
  }

  if (specifiedTradePaymentTerms && specifiedTradePaymentTerms.length > 0) {
    specifiedTradePaymentTerms.forEach(t => convertPaymentTerms(t, parent.node('ram:SpecifiedTradePaymentTerms')))
  }

  convertTradeSettlementHeaderMonetarySummation(
    specifiedTradeSettlementHeaderMonetarySummation,
    parent.node('ram:SpecifiedTradeSettlementHeaderMonetarySummation'),
  )

  if (specifiedFinancialAdjustment && specifiedFinancialAdjustment.length > 0) {
    specifiedFinancialAdjustment.forEach(a => convertFinancialAdjustment(a, parent.node('ram:SpecifiedFinancialAdjustment')))
  }

  if (invoiceReferencedDocument && invoiceReferencedDocument.length > 0) {
    invoiceReferencedDocument.forEach(d => convertReferencedDocument(d, parent.node('ram:InvoiceReferencedDocument')))
  }

  if (receivableSpecifiedTradeAccountingAccount && receivableSpecifiedTradeAccountingAccount.length > 0) {
    receivableSpecifiedTradeAccountingAccount.forEach(a => convertTradeAccountingAccount(a, parent.node('ram:ReceivableSpecifiedTradeAccountingAccount')))
  }

  if (specifiedAdvancePayment && specifiedAdvancePayment.length > 0) {
    specifiedAdvancePayment.forEach(p => convertAdvancePayment(p, parent.node('ram:SpecifiedAdvancePayment')))
  }
}

function convertTradeCurrencyExchange(
  { sourceCurrencyCode, targetCurrencyCode, conversionRate, conversionRateDateTime }: ram.TradeCurrencyExchangeType,
  parent: XMLElement,
): void {
  parent.node('ram:SourceCurrencyCode', sourceCurrencyCode.value)
  parent.node('ram:TargetCurrencyCode', targetCurrencyCode.value)
  parent.node('ram:ConversionRate', String(conversionRate.value))
  if (conversionRateDateTime) {
    convertDateTime(conversionRateDateTime, parent.node('ram:ConversionRateDateTime'))
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
  parent: XMLElement,
): void {
  parent.node('ram:TypeCode', typeCode.value)
  if (information) {
    convertText(information, parent.node('ram:Information'))
  }
  if (applicableTradeSettlementFinancialCard) {
    const el = parent.node('ram:ApplicableTradeSettlementFinancialCard')
    convertID(applicableTradeSettlementFinancialCard.id, el.node('ram:ID'))
    if (applicableTradeSettlementFinancialCard.cardholderName) {
      convertText(applicableTradeSettlementFinancialCard.cardholderName, el.node('ram:CardholderName'))
    }
  }
  if (payerPartyDebtorFinancialAccount) {
    const el = parent.node('ram:PayerPartyDebtorFinancialAccount')
    convertID(payerPartyDebtorFinancialAccount.ibanID, el.node('ram:IBANID'))
    if (payerPartyDebtorFinancialAccount.accountName) {
      convertText(payerPartyDebtorFinancialAccount.accountName, el.node('ram:AccountName'))
    }
  }
  if (payeePartyCreditorFinancialAccount) {
    const el = parent.node('ram:PayeePartyCreditorFinancialAccount')
    if (payeePartyCreditorFinancialAccount.ibanID) {
      convertID(payeePartyCreditorFinancialAccount.ibanID, el.node('ram:IBANID'))
    }
    if (payeePartyCreditorFinancialAccount.accountName) {
      convertText(payeePartyCreditorFinancialAccount.accountName, el.node('ram:AccountName'))
    }
    if (payeePartyCreditorFinancialAccount.proprietaryID) {
      convertID(payeePartyCreditorFinancialAccount.proprietaryID, el.node('ram:ProprietaryID'))
    }
  }
  if (payerSpecifiedDebtorFinancialInstitution?.bicID) {
    convertID(payerSpecifiedDebtorFinancialInstitution.bicID, parent.node('ram:PayerSpecifiedDebtorFinancialInstitution').node('ram:BICID'))
  }
  if (payeeSpecifiedCreditorFinancialInstitution?.bicID) {
    convertID(payeeSpecifiedCreditorFinancialInstitution.bicID, parent.node('ram:PayeeSpecifiedCreditorFinancialInstitution').node('ram:BICID'))
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
  parent: XMLElement,
): void {
  if (calculatedAmount) {
    convertAmount(calculatedAmount, parent.node('ram:CalculatedAmount'))
  }
  if (typeCode) {
    parent.node('ram:TypeCode', typeCode.value)
  }
  if (exemptionReason) {
    convertText(exemptionReason, parent.node('ram:ExemptionReason'))
  }
  if (basisAmount) {
    convertAmount(basisAmount, parent.node('ram:BasisAmount'))
  }
  if (lineTotalBasisAmount) {
    convertAmount(lineTotalBasisAmount, parent.node('ram:LineTotalBasisAmount'))
  }
  if (allowanceChargeBasisAmount) {
    convertAmount(allowanceChargeBasisAmount, parent.node('ram:AllowanceChargeBasisAmount'))
  }
  if (categoryCode) {
    parent.node('ram:CategoryCode', categoryCode.value)
  }
  if (exemptionReasonCode) {
    convertCode(exemptionReasonCode, parent.node('ram:ExemptionReasonCode'))
  }
  if (taxPointDate) {
    convertDate(taxPointDate, parent.node('ram:TaxPointDate'))
  }
  if (dueDateTypeCode) {
    parent.node('ram:DueDateTypeCode', dueDateTypeCode.value)
  }
  if (rateApplicablePercent) {
    parent.node('ram:RateApplicablePercent', String(rateApplicablePercent.value))
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
  parent: XMLElement,
): void {
  convertIndicator(chargeIndicator, parent.node('ram:ChargeIndicator'))
  if (sequenceNumeric) {
    parent.node('ram:SequenceNumeric', String(sequenceNumeric.value))
  }
  if (calculationPercent) {
    parent.node('ram:CalculationPercent', String(calculationPercent.value))
  }
  if (basisAmount) {
    convertAmount(basisAmount, parent.node('ram:BasisAmount'))
  }
  if (basisQuantity) {
    convertQuantity(basisQuantity, parent.node('ram:BasisQuantity'))
  }
  if (actualAmount) {
    convertAmount(actualAmount, parent.node('ram:ActualAmount'))
  }
  if (reasonCode) {
    parent.node('ram:ReasonCode', reasonCode.value)
  }
  if (reason) {
    convertText(reason, parent.node('ram:Reason'))
  }
  if (categoryTradeTax) {
    convertTradeTax(categoryTradeTax, parent.node('ram:CategoryTradeTax'))
  }
}

function convertLogisticsServiceCharge(
  { description, appliedAmount, appliedTradeTax }: ram.LogisticsServiceChargeType,
  parent: XMLElement,
): void {
  convertText(description, parent.node('ram:Description'))
  convertAmount(appliedAmount, parent.node('ram:AppliedAmount'))
  if (appliedTradeTax && appliedTradeTax.length > 0) {
    appliedTradeTax.forEach(t => convertTradeTax(t, parent.node('ram:AppliedTradeTax')))
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
  parent: XMLElement,
): void {
  if (description) {
    convertText(description, parent.node('ram:Description'))
  }
  if (dueDateDateTime) {
    convertDateTime(dueDateDateTime, parent.node('ram:DueDateDateTime'))
  }
  if (directDebitMandateID) {
    convertID(directDebitMandateID, parent.node('ram:DirectDebitMandateID'))
  }
  if (partialPaymentAmount) {
    convertAmount(partialPaymentAmount, parent.node('ram:PartialPaymentAmount'))
  }
  if (applicableTradePaymentPenaltyTerms) {
    convertPaymentPenaltyTerms(applicableTradePaymentPenaltyTerms, parent.node('ram:ApplicableTradePaymentPenaltyTerms'))
  }
  if (applicableTradePaymentDiscountTerms) {
    convertPaymentDiscountTerms(applicableTradePaymentDiscountTerms, parent.node('ram:ApplicableTradePaymentDiscountTerms'))
  }
  if (payeeTradeParty) {
    convertTradeParty(payeeTradeParty, parent.node('ram:PayeeTradeParty'))
  }
}

function convertPaymentPenaltyTerms(
  { basisDateTime, basisPeriodMeasure, basisAmount, calculationPercent, actualPenaltyAmount }: ram.TradePaymentPenaltyTermsType,
  parent: XMLElement,
): void {
  if (basisDateTime) {
    convertDateTime(basisDateTime, parent.node('ram:BasisDateTime'))
  }
  if (basisPeriodMeasure) {
    convertMeasure(basisPeriodMeasure, parent.node('ram:BasisPeriodMeasure'))
  }
  if (basisAmount) {
    convertAmount(basisAmount, parent.node('ram:BasisAmount'))
  }
  if (calculationPercent) {
    parent.node('ram:CalculationPercent', String(calculationPercent.value))
  }
  if (actualPenaltyAmount) {
    convertAmount(actualPenaltyAmount, parent.node('ram:ActualPenaltyAmount'))
  }
}

function convertPaymentDiscountTerms(
  { basisDateTime, basisPeriodMeasure, basisAmount, calculationPercent, actualDiscountAmount }: ram.TradePaymentDiscountTermsType,
  parent: XMLElement,
): void {
  if (basisDateTime) {
    convertDateTime(basisDateTime, parent.node('ram:BasisDateTime'))
  }
  if (basisPeriodMeasure) {
    convertMeasure(basisPeriodMeasure, parent.node('ram:BasisPeriodMeasure'))
  }
  if (basisAmount) {
    convertAmount(basisAmount, parent.node('ram:BasisAmount'))
  }
  if (calculationPercent) {
    parent.node('ram:CalculationPercent', String(calculationPercent.value))
  }
  if (actualDiscountAmount) {
    convertAmount(actualDiscountAmount, parent.node('ram:ActualDiscountAmount'))
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
  parent: XMLElement,
): void {
  if (lineTotalAmount) {
    convertAmount(lineTotalAmount, parent.node('ram:LineTotalAmount'))
  }
  if (chargeTotalAmount) {
    convertAmount(chargeTotalAmount, parent.node('ram:ChargeTotalAmount'))
  }
  if (allowanceTotalAmount) {
    convertAmount(allowanceTotalAmount, parent.node('ram:AllowanceTotalAmount'))
  }
  convertAmount(taxBasisTotalAmount, parent.node('ram:TaxBasisTotalAmount'))
  if (taxTotalAmount && taxTotalAmount.length > 0) {
    taxTotalAmount.forEach(a => convertAmount(a, parent.node('ram:TaxTotalAmount')))
  }
  if (roundingAmount) {
    convertAmount(roundingAmount, parent.node('ram:RoundingAmount'))
  }
  convertAmount(grandTotalAmount, parent.node('ram:GrandTotalAmount'))
  if (totalPrepaidAmount) {
    convertAmount(totalPrepaidAmount, parent.node('ram:TotalPrepaidAmount'))
  }
  convertAmount(duePayableAmount, parent.node('ram:DuePayableAmount'))
}

function convertFinancialAdjustment({ reason, actualAmount }: ram.FinancialAdjustmentType, parent: XMLElement): void {
  convertText(reason, parent.node('ram:Reason'))
  convertAmount(actualAmount, parent.node('ram:ActualAmount'))
}

function convertTradeAccountingAccount({ id, typeCode }: ram.TradeAccountingAccountType, parent: XMLElement): void {
  convertID(id, parent.node('ram:ID'))
  if (typeCode) {
    parent.node('ram:TypeCode', typeCode.value)
  }
}

function convertAdvancePayment(
  { paidAmount, formattedReceivedDateTime, includedTradeTax, invoiceSpecifiedReferencedDocument }: ram.AdvancePaymentType,
  parent: XMLElement,
): void {
  convertAmount(paidAmount, parent.node('ram:PaidAmount'))
  if (formattedReceivedDateTime) {
    convertFormattedDateTime(formattedReceivedDateTime, parent.node('ram:FormattedReceivedDateTime'))
  }
  if (includedTradeTax && includedTradeTax.length > 0) {
    includedTradeTax.forEach(t => convertTradeTax(t, parent.node('ram:IncludedTradeTax')))
  }
  if (invoiceSpecifiedReferencedDocument) {
    convertReferencedDocument(invoiceSpecifiedReferencedDocument, parent.node('ram:InvoiceSpecifiedReferencedDocument'))
  }
}

// ---------------------------------------------------------------------------
// Referenced document (shared)
// ---------------------------------------------------------------------------

function convertReferencedDocument(
  { issuerAssignedID, uriID, lineID, typeCode, name, attachmentBinaryObject, referenceTypeCode, formattedIssueDateTime }: ram.ReferencedDocumentType,
  parent: XMLElement,
): void {
  if (issuerAssignedID) {
    convertID(issuerAssignedID, parent.node('ram:IssuerAssignedID'))
  }
  if (uriID) {
    convertID(uriID, parent.node('ram:URIID'))
  }
  if (lineID) {
    convertID(lineID, parent.node('ram:LineID'))
  }
  if (typeCode) {
    parent.node('ram:TypeCode', typeCode.value)
  }
  if (name && name.length > 0) {
    name.forEach(n => convertText(n, parent.node('ram:Name')))
  }
  if (attachmentBinaryObject) {
    convertBinaryObject(attachmentBinaryObject, parent.node('ram:AttachmentBinaryObject'))
  }
  if (referenceTypeCode) {
    parent.node('ram:ReferenceTypeCode', referenceTypeCode.value)
  }
  if (formattedIssueDateTime) {
    convertFormattedDateTime(formattedIssueDateTime, parent.node('ram:FormattedIssueDateTime'))
  }
}
