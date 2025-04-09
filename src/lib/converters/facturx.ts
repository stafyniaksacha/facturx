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
 * Converter for FacturX CrossIndustryInvoice model to XML
 */
export async function invoiceToXml(invoice: CrossIndustryInvoiceType): Promise<XMLDocument> {
  // Create XML document with namespaces
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

  // Convert ExchangedDocumentContext
  convertExchangedDocumentContext(invoice.exchangedDocumentContext, rootElement)

  // Convert ExchangedDocument
  convertExchangedDocument(invoice.exchangedDocument, rootElement)

  // Convert SupplyChainTradeTransaction
  convertSupplyChainTradeTransaction(invoice.supplyChainTradeTransaction, rootElement)

  return doc
}

/**
 * Convert AmountType to XML
 */
function convertAmount({ value, currencyID }: udt.AmountType, parent: XMLElement): XMLElement {
  parent.text(value.toFixed(2))

  if (currencyID) {
    parent.attr({ currencyID })
  }

  return parent
}

/**
 * Convert IDType to XML
 */
function convertID({ value, schemeID }: udt.IDType, parent: XMLElement): XMLElement {
  parent.text(value)

  if (schemeID) {
    parent.attr({ schemeID })
  }

  return parent
}

/**
 * Convert TextType to XML
 */
function convertText({ value }: udt.TextType, parent: XMLElement): XMLElement {
  parent.text(value)
  return parent
}

/**
 * Convert DateTimeType to XML
 */
function convertDateTime({ dateTimeString, format }: udt.DateTimeType, parent: XMLElement): XMLElement {
  const dateTimeStringElement = parent.node('udt:DateTimeString', dateTimeString)
  dateTimeStringElement.attr({ format })
  return parent
}
/**
 * Convert DateType to XML
 */
function convertDate({ dateString, format }: udt.DateType, parent: XMLElement): XMLElement {
  const dateStringElement = parent.node('udt:DateString', dateString)
  dateStringElement.attr({ format })
  return parent
}

/**
 * Convert IndicatorType to XML
 */
function convertIndicator({ indicator }: udt.IndicatorType, parent: XMLElement): XMLElement {
  parent.node('udt:Indicator', String(indicator))
  return parent
}

/**
 * Convert ExchangedDocumentContextType to XML
 */
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
    const testIndicatorEl = context.node('ram:TestIndicator')
    convertIndicator(testIndicator, testIndicatorEl)
  }

  if (businessProcessSpecifiedDocumentContextParameter) {
    const businessProcessEl = context.node('ram:BusinessProcessSpecifiedDocumentContextParameter')
    convertDocumentContextParameter(businessProcessSpecifiedDocumentContextParameter, businessProcessEl)
  }

  const guidelineEl = context.node('ram:GuidelineSpecifiedDocumentContextParameter')
  convertDocumentContextParameter(guidelineSpecifiedDocumentContextParameter, guidelineEl)
}

/**
 * Convert DocumentContextParameterType to XML
 */
function convertDocumentContextParameter(
  { id }: ram.DocumentContextParameterType,
  parent: XMLElement,
): void {
  const idEl = parent.node('ram:ID')
  convertID(id, idEl)
}

/**
 * Convert ExchangedDocumentType to XML
 */
function convertExchangedDocument(
  { id, name, typeCode, issueDateTime, copyIndicator, languageID, includedNote, effectiveSpecifiedPeriod }: ExchangedDocumentType,
  parent: XMLElement,
): void {
  const doc = parent.node('rsm:ExchangedDocument')

  const idEl = doc.node('ram:ID')
  convertID(id, idEl)

  if (name) {
    const nameEl = doc.node('ram:Name')
    convertText(name, nameEl)
  }

  const typeCodeEl = doc.node('ram:TypeCode')
  typeCodeEl.text(typeCode.value)

  const issueDateTimeEl = doc.node('ram:IssueDateTime')
  convertDateTime(issueDateTime, issueDateTimeEl)

  if (copyIndicator) {
    const copyIndicatorEl = doc.node('ram:CopyIndicator')
    convertIndicator(copyIndicator, copyIndicatorEl)
  }

  if (languageID && languageID.length > 0) {
    languageID.forEach((lang) => {
      const langEl = doc.node('ram:LanguageID')
      convertID(lang, langEl)
    })
  }

  if (includedNote && includedNote.length > 0) {
    includedNote.forEach(note => convertNote(note, doc))
  }

  if (effectiveSpecifiedPeriod) {
    const periodEl = doc.node('ram:EffectiveSpecifiedPeriod')
    convertSpecifiedPeriod(effectiveSpecifiedPeriod, periodEl)
  }
}

/**
 * Convert NoteType to XML
 */
function convertNote(
  { content, subjectCode }: ram.NoteType,
  parent: XMLElement,
): void {
  const noteEl = parent.node('ram:IncludedNote')

  const contentEl = noteEl.node('ram:Content')
  convertText(content, contentEl)

  if (subjectCode) {
    const subjectCodeEl = noteEl.node('ram:SubjectCode')
    convertText(subjectCode, subjectCodeEl)
  }
}

/**
 * Convert SpecifiedPeriodType to XML
 */
function convertSpecifiedPeriod(
  { startDateTime, endDateTime, completeDateTime, description }: ram.SpecifiedPeriodType,
  parent: XMLElement,
): void {
  if (startDateTime) {
    const startDateTimeEl = parent.node('ram:StartDateTime')
    convertDateTime(startDateTime, startDateTimeEl)
  }

  if (endDateTime) {
    const endDateTimeEl = parent.node('ram:EndDateTime')
    convertDateTime(endDateTime, endDateTimeEl)
  }

  if (completeDateTime) {
    const completeDateTimeEl = parent.node('ram:CompleteDateTime')
    convertDateTime(completeDateTime, completeDateTimeEl)
  }

  if (description) {
    const descriptionEl = parent.node('ram:Description')
    convertText(description, descriptionEl)
  }
}

/**
 * Convert SupplyChainTradeTransactionType to XML
 */
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

  // Include line items before the header elements
  if (includedSupplyChainTradeLineItem && includedSupplyChainTradeLineItem.length > 0) {
    includedSupplyChainTradeLineItem.forEach((lineItem) => {
      const lineItemEl = transaction.node('ram:IncludedSupplyChainTradeLineItem')
      convertSupplyChainTradeLineItem(lineItem, lineItemEl)
    })
  }

  // Convert header trade agreement - required element
  const agreementEl = transaction.node('ram:ApplicableHeaderTradeAgreement')
  convertHeaderTradeAgreement(applicableHeaderTradeAgreement, agreementEl)

  // Convert header trade delivery - required element
  const deliveryEl = transaction.node('ram:ApplicableHeaderTradeDelivery')
  convertHeaderTradeDelivery(applicableHeaderTradeDelivery, deliveryEl)

  // Convert header trade settlement - required element
  const settlementEl = transaction.node('ram:ApplicableHeaderTradeSettlement')
  convertHeaderTradeSettlement(applicableHeaderTradeSettlement, settlementEl)
}

/**
 * Convert SupplyChainTradeLineItemType to XML
 */
function convertSupplyChainTradeLineItem(
  lineItem: ram.SupplyChainTradeLineItemType,
  parent: XMLElement,
): void {
  if (lineItem.associatedDocumentLineDocument) {
    const docLineEl = parent.node('ram:AssociatedDocumentLineDocument')

    if (lineItem.associatedDocumentLineDocument.lineID) {
      const lineIDEl = docLineEl.node('ram:LineID')
      convertID(lineItem.associatedDocumentLineDocument.lineID, lineIDEl)
    }
  }

  if (lineItem.specifiedTradeProduct) {
    const productEl = parent.node('ram:SpecifiedTradeProduct')

    if (lineItem.specifiedTradeProduct.globalID) {
      const globalIDEl = productEl.node('ram:GlobalID')
      convertID(lineItem.specifiedTradeProduct.globalID, globalIDEl)
    }

    if (lineItem.specifiedTradeProduct.name) {
      const nameEl = productEl.node('ram:Name')
      convertText(lineItem.specifiedTradeProduct.name, nameEl)
    }

    if (lineItem.specifiedTradeProduct.description) {
      const descEl = productEl.node('ram:Description')
      convertText(lineItem.specifiedTradeProduct.description, descEl)
    }
  }

  if (lineItem.specifiedLineTradeAgreement) {
    const agreementEl = parent.node('ram:SpecifiedLineTradeAgreement')
    convertLineTradeAgreement(lineItem.specifiedLineTradeAgreement, agreementEl)
  }

  if (lineItem.specifiedLineTradeDelivery) {
    const deliveryEl = parent.node('ram:SpecifiedLineTradeDelivery')
    convertLineTradeDelivery(lineItem.specifiedLineTradeDelivery, deliveryEl)
  }

  if (lineItem.specifiedLineTradeSettlement) {
    const settlementEl = parent.node('ram:SpecifiedLineTradeSettlement')
    convertLineTradeSettlement(lineItem.specifiedLineTradeSettlement, settlementEl)
  }
}

/**
 * Convert HeaderTradeAgreementType to XML
 */
function convertHeaderTradeAgreement(
  {
    buyerReference,
    sellerTradeParty,
    buyerTradeParty,
    buyerOrderReferencedDocument,
    additionalReferencedDocument,
    applicableTradeDeliveryTerms,
    buyerAgentTradeParty,
    buyerTaxRepresentativeTradeParty,
    contractReferencedDocument,
    productEndUserTradeParty,
    quotationReferencedDocument,
    salesAgentTradeParty,
    sellerOrderReferencedDocument,
    sellerTaxRepresentativeTradeParty,
    specifiedProcuringProject,
    ultimateCustomerOrderReferencedDocument,
  }: HeaderTradeAgreementType,
  parent: XMLElement,
): void {
  if (buyerReference) {
    const refEl = parent.node('ram:BuyerReference')
    convertText(buyerReference, refEl)
  }

  // Convert seller party
  const sellerPartyEl = parent.node('ram:SellerTradeParty')
  convertTradeParty(sellerTradeParty, sellerPartyEl)

  // Convert buyer party
  const buyerPartyEl = parent.node('ram:BuyerTradeParty')
  convertTradeParty(buyerTradeParty, buyerPartyEl)

  // Convert buyer order reference document if available
  if (buyerOrderReferencedDocument) {
    const docEl = parent.node('ram:BuyerOrderReferencedDocument')

    if (buyerOrderReferencedDocument.issuerAssignedID) {
      const idEl = docEl.node('ram:IssuerAssignedID')
      convertID(buyerOrderReferencedDocument.issuerAssignedID, idEl)
    }
  }

  if (additionalReferencedDocument) {
    additionalReferencedDocument.forEach((doc) => {
      const docEl = parent.node('ram:AdditionalReferencedDocument')
      convertReferencedDocument(doc, docEl)
    })
  }

  if (applicableTradeDeliveryTerms) {
    // TODO: implement
  }

  if (salesAgentTradeParty) {
    const agentEl = parent.node('ram:SalesAgentTradeParty')
    convertTradeParty(salesAgentTradeParty, agentEl)
  }

  if (buyerAgentTradeParty) {
    const agentEl = parent.node('ram:BuyerAgentTradeParty')
    convertTradeParty(buyerAgentTradeParty, agentEl)
  }

  if (buyerTaxRepresentativeTradeParty) {
    const taxEl = parent.node('ram:BuyerTaxRepresentativeTradeParty')
    convertTradeParty(buyerTaxRepresentativeTradeParty, taxEl)
  }

  if (sellerTaxRepresentativeTradeParty) {
    const taxEl = parent.node('ram:SellerTaxRepresentativeTradeParty')
    convertTradeParty(sellerTaxRepresentativeTradeParty, taxEl)
  }

  if (productEndUserTradeParty) {
    const endUserEl = parent.node('ram:ProductEndUserTradeParty')
    convertTradeParty(productEndUserTradeParty, endUserEl)
  }

  if (quotationReferencedDocument) {
    const docEl = parent.node('ram:QuotationReferencedDocument')
    convertReferencedDocument(quotationReferencedDocument, docEl)
  }

  if (contractReferencedDocument) {
    const docEl = parent.node('ram:ContractReferencedDocument')
    convertReferencedDocument(contractReferencedDocument, docEl)
  }

  if (sellerOrderReferencedDocument) {
    const docEl = parent.node('ram:SellerOrderReferencedDocument')
    convertReferencedDocument(sellerOrderReferencedDocument, docEl)
  }

  if (specifiedProcuringProject) {
    // @TODO: implement
  }

  if (ultimateCustomerOrderReferencedDocument) {
    ultimateCustomerOrderReferencedDocument.forEach((doc) => {
      const docEl = parent.node('ram:UltimateCustomerOrderReferencedDocument')
      convertReferencedDocument(doc, docEl)
    })
  }
}
/**
 * Convert TradePartyType to XML
 */
function convertTradeParty(
  {
    name,
    specifiedLegalOrganization,
    postalTradeAddress,
    specifiedTaxRegistration,
    definedTradeContact,
    description,
    globalID,
    id,
    roleCode,
    uriUniversalCommunication,
  }: ram.TradePartyType,
  parent: XMLElement,
): void {
  if (name) {
    const nameEl = parent.node('ram:Name')
    convertText(name, nameEl)
  }

  if (specifiedLegalOrganization) {
    const orgEl = parent.node('ram:SpecifiedLegalOrganization')

    if (specifiedLegalOrganization.id) {
      const idEl = orgEl.node('ram:ID')
      convertID(specifiedLegalOrganization.id, idEl)
    }
  }

  if (postalTradeAddress) {
    const addressEl = parent.node('ram:PostalTradeAddress')
    convertTradeAddress(postalTradeAddress, addressEl)
  }

  if (specifiedTaxRegistration && specifiedTaxRegistration.length > 0) {
    specifiedTaxRegistration.forEach((tax) => {
      const taxEl = parent.node('ram:SpecifiedTaxRegistration')

      if (tax.id) {
        const idEl = taxEl.node('ram:ID')
        convertID(tax.id, idEl)
      }
    })
  }

  if (definedTradeContact) {
    // @TODO: implement
  }

  if (description) {
    const descriptionEl = parent.node('ram:Description')
    convertText(description, descriptionEl)
  }

  if (globalID) {
    globalID.forEach((id) => {
      const globalIDEl = parent.node('ram:GlobalID')
      convertID(id, globalIDEl)
    })
  }

  if (id) {
    // @TODO: implement
  }

  if (roleCode) {
    const roleCodeEl = parent.node('ram:RoleCode')
    convertText(roleCode, roleCodeEl)
  }

  if (uriUniversalCommunication) {
    // @TODO: implement
  }
}

/**
 * Convert TradeAddressType to XML
 */
function convertTradeAddress(
  { countryID, postcodeCode, cityName, lineOne }: ram.TradeAddressType,
  parent: XMLElement,
): void {
  if (postcodeCode) {
    const postcodeEl = parent.node('ram:PostcodeCode')
    convertText(postcodeCode, postcodeEl)
  }

  if (lineOne) {
    const lineOneEl = parent.node('ram:LineOne')
    convertText(lineOne, lineOneEl)
  }

  if (cityName) {
    const cityNameEl = parent.node('ram:CityName')
    convertText(cityName, cityNameEl)
  }

  if (countryID) {
    const countryIDEl = parent.node('ram:CountryID')
    countryIDEl.text(countryID.value)
  }
}

/**
 * Convert HeaderTradeDeliveryType to XML
 */
function convertHeaderTradeDelivery(
  delivery: HeaderTradeDeliveryType,
  parent: XMLElement,
): void {
  // Basic implementation - can be expanded as needed
  if (delivery.shipToTradeParty) {
    const shipToEl = parent.node('ram:ShipToTradeParty')
    convertTradeParty(delivery.shipToTradeParty, shipToEl)
  }
}

/**
 * Convert HeaderTradeSettlementType to XML
 */
function convertHeaderTradeSettlement(
  {
    invoiceCurrencyCode,
    applicableTradeTax,
    specifiedTradeSettlementHeaderMonetarySummation,
    specifiedTradeSettlementPaymentMeans,
    billingSpecifiedPeriod,
    specifiedTradeAllowanceCharge,
    creditorReferenceID,
    paymentReference,
    taxCurrencyCode,
    invoiceIssuerReference,
    invoicerTradeParty,
    invoiceeTradeParty,
    payeeTradeParty,
    payerTradeParty,
  }: HeaderTradeSettlementType,
  parent: XMLElement,
): void {
  // Follow the exact sequence order defined in the XSD schema

  // Process optional elements first
  if (creditorReferenceID) {
    const creditorReferenceIDEl = parent.node('ram:CreditorReferenceID')
    convertID(creditorReferenceID, creditorReferenceIDEl)
  }

  if (paymentReference) {
    const paymentReferenceEl = parent.node('ram:PaymentReference')
    convertText(paymentReference, paymentReferenceEl)
  }

  if (taxCurrencyCode) {
    const taxCurrencyCodeEl = parent.node('ram:TaxCurrencyCode')
    taxCurrencyCodeEl.text(taxCurrencyCode.value)
  }

  // Required element
  const currencyEl = parent.node('ram:InvoiceCurrencyCode')
  currencyEl.text(invoiceCurrencyCode.value)

  if (invoiceIssuerReference) {
    const invoiceIssuerReferenceEl = parent.node('ram:InvoiceIssuerReference')
    convertID(invoiceIssuerReference, invoiceIssuerReferenceEl)
  }

  if (invoicerTradeParty) {
    const invoicerEl = parent.node('ram:InvoicerTradeParty')
    convertTradeParty(invoicerTradeParty, invoicerEl)
  }

  if (invoiceeTradeParty) {
    const invoiceeEl = parent.node('ram:InvoiceeTradeParty')
    convertTradeParty(invoiceeTradeParty, invoiceeEl)
  }

  if (payeeTradeParty) {
    const payeeEl = parent.node('ram:PayeeTradeParty')
    convertTradeParty(payeeTradeParty, payeeEl)
  }

  if (payerTradeParty) {
    const payerEl = parent.node('ram:PayerTradeParty')
    convertTradeParty(payerTradeParty, payerEl)
  }

  // Handle the payment means
  if (specifiedTradeSettlementPaymentMeans && specifiedTradeSettlementPaymentMeans.length > 0) {
    specifiedTradeSettlementPaymentMeans.forEach((paymentMeans) => {
      const paymentMeansEl = parent.node('ram:SpecifiedTradeSettlementPaymentMeans')
      // Implementation for payment means would be here
      if (paymentMeans.typeCode) {
        const typeCodeEl = paymentMeansEl.node('ram:TypeCode')
        typeCodeEl.text(paymentMeans.typeCode.value)
      }
    })
  }

  // Convert applicable trade tax - required in all profiles
  if (applicableTradeTax && applicableTradeTax.length > 0) {
    applicableTradeTax.forEach((tax) => {
      const taxEl = parent.node('ram:ApplicableTradeTax')
      convertTradeTax(tax, taxEl)
    })
  }

  if (billingSpecifiedPeriod) {
    const billingPeriodEl = parent.node('ram:BillingSpecifiedPeriod')
    convertSpecifiedPeriod(billingSpecifiedPeriod, billingPeriodEl)
  }

  if (specifiedTradeAllowanceCharge && specifiedTradeAllowanceCharge.length > 0) {
    specifiedTradeAllowanceCharge.forEach((allowanceCharge) => {
      const allowanceChargeEl = parent.node('ram:SpecifiedTradeAllowanceCharge')
      convertAllowanceCharge(allowanceCharge, allowanceChargeEl)
    })
  }

  // Convert monetary summation - required in all profiles
  const summationEl = parent.node('ram:SpecifiedTradeSettlementHeaderMonetarySummation')
  convertTradeSettlementHeaderMonetarySummation(specifiedTradeSettlementHeaderMonetarySummation, summationEl)
}

/**
 * Convert TradeTaxType to XML
 */
function convertTradeTax(
  {
    typeCode,
    categoryCode,
    rateApplicablePercent,
    allowanceChargeBasisAmount,
    basisAmount,
    lineTotalBasisAmount,
    exemptionReason,
    exemptionReasonCode,
    taxPointDate,
    dueDateTypeCode,
    calculatedAmount,
  }: ram.TradeTaxType,
  parent: XMLElement,
): void {
  if (typeCode) {
    const typeCodeEl = parent.node('ram:TypeCode')
    typeCodeEl.text(typeCode.value)
  }

  if (categoryCode) {
    const categoryCodeEl = parent.node('ram:CategoryCode')
    categoryCodeEl.text(categoryCode.value)
  }

  if (rateApplicablePercent) {
    const rateEl = parent.node('ram:RateApplicablePercent')
    rateEl.text(String(rateApplicablePercent.value))
  }

  if (allowanceChargeBasisAmount) {
    const basisAmountEl = parent.node('ram:AllowanceChargeBasisAmount')
    convertAmount(allowanceChargeBasisAmount, basisAmountEl)
  }

  if (basisAmount) {
    // @TODO: We'll omit BasisAmount as it's causing validation errors
    // This element is likely only valid in certain contexts or profiles
  }

  if (lineTotalBasisAmount) {
    const lineTotalBasisAmountEl = parent.node('ram:LineTotalBasisAmount')
    convertAmount(lineTotalBasisAmount, lineTotalBasisAmountEl)
  }

  if (exemptionReason) {
    const exemptionReasonEl = parent.node('ram:ExemptionReason')
    convertText(exemptionReason, exemptionReasonEl)
  }

  if (exemptionReasonCode) {
    const exemptionReasonCodeEl = parent.node('ram:ExemptionReasonCode')
    convertText(exemptionReasonCode, exemptionReasonCodeEl)
  }

  if (taxPointDate) {
    const taxPointDateEl = parent.node('ram:TaxPointDate')
    convertDate(taxPointDate, taxPointDateEl)
  }

  if (dueDateTypeCode) {
    const dueDateTypeCodeEl = parent.node('ram:DueDateTypeCode')
    dueDateTypeCodeEl.text(dueDateTypeCode.value)
  }

  if (calculatedAmount) {
    const calculatedAmountEl = parent.node('ram:CalculatedAmount')
    convertAmount(calculatedAmount, calculatedAmountEl)
  }
}

/**
 * Convert TradeSettlementHeaderMonetarySummationType to XML
 */
function convertTradeSettlementHeaderMonetarySummation(
  {
    lineTotalAmount,
    taxBasisTotalAmount,
    taxTotalAmount,
    grandTotalAmount,
    duePayableAmount,
    allowanceTotalAmount,
    chargeTotalAmount,
    roundingAmount,
    totalPrepaidAmount,
  }: ram.TradeSettlementHeaderMonetarySummationType,
  parent: XMLElement,
): void {
  // Required field in all profiles
  const lineTotalEl = parent.node('ram:LineTotalAmount')
  convertAmount(lineTotalAmount, lineTotalEl)

  if (chargeTotalAmount) {
    const chargeTotalEl = parent.node('ram:ChargeTotalAmount')
    convertAmount(chargeTotalAmount, chargeTotalEl)
  }

  if (allowanceTotalAmount) {
    const allowanceTotalEl = parent.node('ram:AllowanceTotalAmount')
    convertAmount(allowanceTotalAmount, allowanceTotalEl)
  }

  if (taxBasisTotalAmount && taxBasisTotalAmount.length > 0) {
    taxBasisTotalAmount.forEach((amount) => {
      const taxBasisEl = parent.node('ram:TaxBasisTotalAmount')
      convertAmount(amount, taxBasisEl)
    })
  }

  if (taxTotalAmount && taxTotalAmount.length > 0) {
    taxTotalAmount.forEach((amount) => {
      const taxTotalEl = parent.node('ram:TaxTotalAmount')
      convertAmount(amount, taxTotalEl)
    })
  }

  if (roundingAmount) {
    const roundingEl = parent.node('ram:RoundingAmount')
    convertAmount(roundingAmount, roundingEl)
  }

  if (grandTotalAmount && grandTotalAmount.length > 0) {
    grandTotalAmount.forEach((amount) => {
      const grandTotalEl = parent.node('ram:GrandTotalAmount')
      convertAmount(amount, grandTotalEl)
    })
  }

  if (totalPrepaidAmount) {
    const totalPrepaidEl = parent.node('ram:TotalPrepaidAmount')
    convertAmount(totalPrepaidAmount, totalPrepaidEl)
  }

  if (duePayableAmount) {
    const duePayableEl = parent.node('ram:DuePayableAmount')
    convertAmount(duePayableAmount, duePayableEl)
  }
}

/**
 * Convert LineTradeAgreementType to XML
 */
function convertLineTradeAgreement(
  {
    buyerOrderReferencedDocument,
    quotationReferencedDocument,
    contractReferencedDocument,
    additionalReferencedDocument,
    grossPriceProductTradePrice,
    netPriceProductTradePrice,
    ultimateCustomerOrderReferencedDocument,
  }: ram.LineTradeAgreementType,
  parent: XMLElement,
): void {
  if (buyerOrderReferencedDocument) {
    const docEl = parent.node('ram:BuyerOrderReferencedDocument')
    convertReferencedDocument(buyerOrderReferencedDocument, docEl)
  }

  if (quotationReferencedDocument) {
    const docEl = parent.node('ram:QuotationReferencedDocument')
    convertReferencedDocument(quotationReferencedDocument, docEl)
  }

  if (contractReferencedDocument) {
    const docEl = parent.node('ram:ContractReferencedDocument')
    convertReferencedDocument(contractReferencedDocument, docEl)
  }

  if (additionalReferencedDocument && additionalReferencedDocument.length > 0) {
    additionalReferencedDocument.forEach((doc) => {
      const docEl = parent.node('ram:AdditionalReferencedDocument')
      convertReferencedDocument(doc, docEl)
    })
  }

  if (grossPriceProductTradePrice) {
    const priceEl = parent.node('ram:GrossPriceProductTradePrice')
    convertTradePrice(grossPriceProductTradePrice, priceEl)
  }

  const netPriceEl = parent.node('ram:NetPriceProductTradePrice')
  convertTradePrice(netPriceProductTradePrice, netPriceEl)

  if (ultimateCustomerOrderReferencedDocument && ultimateCustomerOrderReferencedDocument.length > 0) {
    ultimateCustomerOrderReferencedDocument.forEach((doc) => {
      const docEl = parent.node('ram:UltimateCustomerOrderReferencedDocument')
      convertReferencedDocument(doc, docEl)
    })
  }
}

/**
 * Convert ReferencedDocumentType to XML
 */
function convertReferencedDocument(
  { issuerAssignedID, lineID }: ram.ReferencedDocumentType,
  parent: XMLElement,
): void {
  if (issuerAssignedID) {
    const idEl = parent.node('ram:IssuerAssignedID')
    convertID(issuerAssignedID, idEl)
  }

  if (lineID) {
    const idEl = parent.node('ram:LineID')
    convertID(lineID, idEl)
  }
}

/**
 * Convert TradePriceType to XML
 */
function convertTradePrice(
  { chargeAmount, basisQuantity }: ram.TradePriceType,
  parent: XMLElement,
): void {
  if (chargeAmount) {
    const amountEl = parent.node('ram:ChargeAmount')
    convertAmount(chargeAmount, amountEl)
  }

  if (basisQuantity) {
    const quantityEl = parent.node('ram:BasisQuantity')
    convertQuantity(basisQuantity, quantityEl)
  }
}

/**
 * Convert QuantityType to XML
 */
function convertQuantity(
  { value, unitCode }: udt.QuantityType,
  parent: XMLElement,
): void {
  parent.text(String(value))

  if (unitCode) {
    parent.attr({ unitCode })
  }
}

/**
 * Convert TradeAllowanceChargeType to XML
 */
function convertAllowanceCharge(
  { chargeIndicator, actualAmount, reasonCode, reason }: ram.TradeAllowanceChargeType,
  parent: XMLElement,
): void {
  if (chargeIndicator) {
    const indicatorEl = parent.node('ram:ChargeIndicator')
    convertIndicator(chargeIndicator, indicatorEl)
  }

  if (actualAmount) {
    const amountEl = parent.node('ram:ActualAmount')
    convertAmount(actualAmount, amountEl)
  }

  if (reasonCode) {
    const codeEl = parent.node('ram:ReasonCode')
    convertText(reasonCode, codeEl)
  }

  if (reason) {
    const reasonEl = parent.node('ram:Reason')
    convertText(reason, reasonEl)
  }
}

/**
 * Convert LineTradeDeliveryType to XML
 */
function convertLineTradeDelivery(
  {
    billedQuantity,
    chargeFreeQuantity,
    packageQuantity,
    shipToTradeParty,
    ultimateShipToTradeParty,
    actualDeliverySupplyChainEvent,
    despatchAdviceReferencedDocument,
    receivingAdviceReferencedDocument,
    deliveryNoteReferencedDocument,
  }: ram.LineTradeDeliveryType,
  parent: XMLElement,
): void {
  const billedQuantityEl = parent.node('ram:BilledQuantity')
  convertQuantity(billedQuantity, billedQuantityEl)

  if (chargeFreeQuantity) {
    const quantityEl = parent.node('ram:ChargeFreeQuantity')
    convertQuantity(chargeFreeQuantity, quantityEl)
  }

  if (packageQuantity) {
    const quantityEl = parent.node('ram:PackageQuantity')
    convertQuantity(packageQuantity, quantityEl)
  }

  if (shipToTradeParty) {
    const partyEl = parent.node('ram:ShipToTradeParty')
    convertTradeParty(shipToTradeParty, partyEl)
  }

  if (ultimateShipToTradeParty) {
    const partyEl = parent.node('ram:UltimateShipToTradeParty')
    convertTradeParty(ultimateShipToTradeParty, partyEl)
  }

  if (actualDeliverySupplyChainEvent) {
    const eventEl = parent.node('ram:ActualDeliverySupplyChainEvent')
    convertSupplyChainEvent(actualDeliverySupplyChainEvent, eventEl)
  }

  if (despatchAdviceReferencedDocument) {
    const docEl = parent.node('ram:DespatchAdviceReferencedDocument')
    convertReferencedDocument(despatchAdviceReferencedDocument, docEl)
  }

  if (receivingAdviceReferencedDocument) {
    const docEl = parent.node('ram:ReceivingAdviceReferencedDocument')
    convertReferencedDocument(receivingAdviceReferencedDocument, docEl)
  }

  if (deliveryNoteReferencedDocument) {
    const docEl = parent.node('ram:DeliveryNoteReferencedDocument')
    convertReferencedDocument(deliveryNoteReferencedDocument, docEl)
  }
}

/**
 * Convert SupplyChainEventType to XML
 */
function convertSupplyChainEvent(
  { occurrenceDateTime }: ram.SupplyChainEventType,
  parent: XMLElement,
): void {
  if (occurrenceDateTime) {
    const dateTimeEl = parent.node('ram:OccurrenceDateTime')
    convertDateTime(occurrenceDateTime, dateTimeEl)
  }
}

/**
 * Convert LineTradeSettlementType to XML
 */
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
    applicableTradeTax.forEach((tax) => {
      const taxEl = parent.node('ram:ApplicableTradeTax')
      convertTradeTax(tax, taxEl)
    })
  }

  if (billingSpecifiedPeriod) {
    const periodEl = parent.node('ram:BillingSpecifiedPeriod')
    convertSpecifiedPeriod(billingSpecifiedPeriod, periodEl)
  }

  if (specifiedTradeAllowanceCharge && specifiedTradeAllowanceCharge.length > 0) {
    specifiedTradeAllowanceCharge.forEach((charge) => {
      const chargeEl = parent.node('ram:SpecifiedTradeAllowanceCharge')
      convertAllowanceCharge(charge, chargeEl)
    })
  }

  const summationEl = parent.node('ram:SpecifiedTradeSettlementLineMonetarySummation')
  convertTradeSettlementLineMonetarySummation(specifiedTradeSettlementLineMonetarySummation, summationEl)

  if (invoiceReferencedDocument) {
    const docEl = parent.node('ram:InvoiceReferencedDocument')
    convertReferencedDocument(invoiceReferencedDocument, docEl)
  }

  if (additionalReferencedDocument && additionalReferencedDocument.length > 0) {
    additionalReferencedDocument.forEach((doc) => {
      const docEl = parent.node('ram:AdditionalReferencedDocument')
      convertReferencedDocument(doc, docEl)
    })
  }

  if (receivableSpecifiedTradeAccountingAccount) {
    const accountEl = parent.node('ram:ReceivableSpecifiedTradeAccountingAccount')
    convertTradeAccountingAccount(receivableSpecifiedTradeAccountingAccount, accountEl)
  }
}

/**
 * Convert TradeSettlementLineMonetarySummationType to XML
 */
function convertTradeSettlementLineMonetarySummation(
  {
    lineTotalAmount,
    chargeTotalAmount,
    allowanceTotalAmount,
    taxTotalAmount,
    grandTotalAmount,
    totalAllowanceChargeAmount,
  }: ram.TradeSettlementLineMonetarySummationType,
  parent: XMLElement,
): void {
  if (lineTotalAmount) {
    const amountEl = parent.node('ram:LineTotalAmount')
    convertAmount(lineTotalAmount, amountEl)
  }

  if (chargeTotalAmount) {
    const amountEl = parent.node('ram:ChargeTotalAmount')
    convertAmount(chargeTotalAmount, amountEl)
  }

  if (allowanceTotalAmount) {
    const amountEl = parent.node('ram:AllowanceTotalAmount')
    convertAmount(allowanceTotalAmount, amountEl)
  }

  if (taxTotalAmount) {
    const amountEl = parent.node('ram:TaxTotalAmount')
    convertAmount(taxTotalAmount, amountEl)
  }

  if (grandTotalAmount) {
    const amountEl = parent.node('ram:GrandTotalAmount')
    convertAmount(grandTotalAmount, amountEl)
  }

  if (totalAllowanceChargeAmount) {
    const amountEl = parent.node('ram:TotalAllowanceChargeAmount')
    convertAmount(totalAllowanceChargeAmount, amountEl)
  }
}

/**
 * Convert TradeAccountingAccountType to XML
 */
function convertTradeAccountingAccount(
  { id }: ram.TradeAccountingAccountType,
  parent: XMLElement,
): void {
  if (id) {
    const idEl = parent.node('ram:ID')
    convertID(id, idEl)
  }
}
