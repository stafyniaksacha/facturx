import { XMLDocument, XMLElement, parseXmlAsync } from 'libxmljs';
import { 
  CrossIndustryInvoiceType, 
  ExchangedDocumentContextType,
  ExchangedDocumentType,
  SupplyChainTradeTransactionType,
  HeaderTradeAgreementType,
  HeaderTradeDeliveryType,
  HeaderTradeSettlementType
} from '../models/facturx/crossIndustryInvoice';
import * as udt from '../models/facturx/unqualifiedTypes';
import * as qdt from '../models/facturx/qualifiedTypes';
import * as ram from '../models/facturx/reusableTypes';

/**
 * Converter interface for converting model objects to XML elements
 */
interface Converter<T> {
  toXml(object: T, parent: XMLElement): XMLElement;
}

/**
 * Converter for UnqualifiedDataTypes
 */
const udtConverters = {
  /**
   * Convert AmountType to XML
   */
  convertAmount({ value, currencyID }: udt.AmountType, parent: XMLElement): XMLElement {
    parent.text(String(value));
    
    if (currencyID) {
      parent.attr({ currencyID });
    }
    
    return parent;
  },

  /**
   * Convert IDType to XML
   */
  convertID({ value, schemeID }: udt.IDType, parent: XMLElement): XMLElement {
    parent.text(value);
    
    if (schemeID) {
      parent.attr({ schemeID });
    }
    
    return parent;
  },

  /**
   * Convert TextType to XML
   */
  convertText({ value }: udt.TextType, parent: XMLElement): XMLElement {
    parent.text(value);
    return parent;
  },

  /**
   * Convert DateTimeType to XML
   */
  convertDateTime({ dateTimeString, format }: udt.DateTimeType, parent: XMLElement): XMLElement {
    const dateTimeStringElement = parent.node('udt:DateTimeString', dateTimeString);
    dateTimeStringElement.attr({ format });
    return parent;
  },

  /**
   * Convert IndicatorType to XML
   */
  convertIndicator({ indicator }: udt.IndicatorType, parent: XMLElement): XMLElement {
    parent.node('udt:Indicator', String(indicator));
    return parent;
  }
};

/**
 * Converter for FacturX CrossIndustryInvoice model to XML
 */
export async function modelToXml(invoice: CrossIndustryInvoiceType): Promise<XMLDocument> {
  // Create XML document with namespaces
  const xmlString = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice 
  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" 
  xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
</rsm:CrossIndustryInvoice>`;
  
  const doc = await parseXmlAsync(xmlString);
  const rootElement = doc.root() as XMLElement;
  
  // Convert ExchangedDocumentContext
  convertExchangedDocumentContext(invoice.exchangedDocumentContext, rootElement);
  
  // Convert ExchangedDocument
  convertExchangedDocument(invoice.exchangedDocument, rootElement);
  
  // Convert SupplyChainTradeTransaction
  convertSupplyChainTradeTransaction(invoice.supplyChainTradeTransaction, rootElement);

  return doc;
}

/**
 * Convert ExchangedDocumentContextType to XML
 */
function convertExchangedDocumentContext(
  { testIndicator, businessProcessSpecifiedDocumentContextParameter, guidelineSpecifiedDocumentContextParameter }: ExchangedDocumentContextType, 
  parent: XMLElement
): void {
  const context = parent.node('rsm:ExchangedDocumentContext');
  
  if (testIndicator) {
    const testIndicatorEl = context.node('ram:TestIndicator');
    udtConverters.convertIndicator(testIndicator, testIndicatorEl);
  }

  if (businessProcessSpecifiedDocumentContextParameter) {
    const businessProcessEl = context.node('ram:BusinessProcessSpecifiedDocumentContextParameter');
    convertDocumentContextParameter(businessProcessSpecifiedDocumentContextParameter, businessProcessEl);
  }

  const guidelineEl = context.node('ram:GuidelineSpecifiedDocumentContextParameter');
  convertDocumentContextParameter(guidelineSpecifiedDocumentContextParameter, guidelineEl);
}

/**
 * Convert DocumentContextParameterType to XML
 */
function convertDocumentContextParameter(
  { id }: ram.DocumentContextParameterType,
  parent: XMLElement
): void {
  const idEl = parent.node('ram:ID');
  udtConverters.convertID(id, idEl);
}

/**
 * Convert ExchangedDocumentType to XML
 */
function convertExchangedDocument(
  { id, name, typeCode, issueDateTime, copyIndicator, languageID, includedNote, effectiveSpecifiedPeriod }: ExchangedDocumentType,
  parent: XMLElement
): void {
  const doc = parent.node('rsm:ExchangedDocument');
  
  const idEl = doc.node('ram:ID');
  udtConverters.convertID(id, idEl);
  
  if (name) {
    const nameEl = doc.node('ram:Name');
    udtConverters.convertText(name, nameEl);
  }
  
  const typeCodeEl = doc.node('ram:TypeCode');
  typeCodeEl.text(typeCode.value);
  
  const issueDateTimeEl = doc.node('ram:IssueDateTime');
  udtConverters.convertDateTime(issueDateTime, issueDateTimeEl);
  
  if (copyIndicator) {
    const copyIndicatorEl = doc.node('ram:CopyIndicator');
    udtConverters.convertIndicator(copyIndicator, copyIndicatorEl);
  }
  
  if (languageID && languageID.length > 0) {
    languageID.forEach(lang => {
      const langEl = doc.node('ram:LanguageID');
      udtConverters.convertID(lang, langEl);
    });
  }
  
  if (includedNote && includedNote.length > 0) {
    includedNote.forEach(note => convertNote(note, doc));
  }
  
  if (effectiveSpecifiedPeriod) {
    const periodEl = doc.node('ram:EffectiveSpecifiedPeriod');
    convertSpecifiedPeriod(effectiveSpecifiedPeriod, periodEl);
  }
}

/**
 * Convert NoteType to XML
 */
function convertNote(
  { content, subjectCode }: ram.NoteType,
  parent: XMLElement
): void {
  const noteEl = parent.node('ram:IncludedNote');
  
  const contentEl = noteEl.node('ram:Content');
  udtConverters.convertText(content, contentEl);
  
  if (subjectCode) {
    const subjectCodeEl = noteEl.node('ram:SubjectCode');
    udtConverters.convertText(subjectCode, subjectCodeEl);
  }
}

/**
 * Convert SpecifiedPeriodType to XML
 */
function convertSpecifiedPeriod(
  { startDateTime, endDateTime, completeDateTime, description }: ram.SpecifiedPeriodType,
  parent: XMLElement
): void {
  if (startDateTime) {
    const startDateTimeEl = parent.node('ram:StartDateTime');
    udtConverters.convertDateTime(startDateTime, startDateTimeEl);
  }
  
  if (endDateTime) {
    const endDateTimeEl = parent.node('ram:EndDateTime');
    udtConverters.convertDateTime(endDateTime, endDateTimeEl);
  }
  
  if (completeDateTime) {
    const completeDateTimeEl = parent.node('ram:CompleteDateTime');
    udtConverters.convertDateTime(completeDateTime, completeDateTimeEl);
  }
  
  if (description) {
    const descriptionEl = parent.node('ram:Description');
    udtConverters.convertText(description, descriptionEl);
  }
}

/**
 * Convert SupplyChainTradeTransactionType to XML
 */
function convertSupplyChainTradeTransaction(
  { includedSupplyChainTradeLineItem, applicableHeaderTradeAgreement, applicableHeaderTradeDelivery, applicableHeaderTradeSettlement }: SupplyChainTradeTransactionType,
  parent: XMLElement
): void {
  const transaction = parent.node('rsm:SupplyChainTradeTransaction');
  
  // Convert line items
  if (includedSupplyChainTradeLineItem && includedSupplyChainTradeLineItem.length > 0) {
    includedSupplyChainTradeLineItem.forEach(lineItem => {
      const lineItemEl = transaction.node('ram:IncludedSupplyChainTradeLineItem');
      convertSupplyChainTradeLineItem(lineItem, lineItemEl);
    });
  }
  
  // Convert header trade agreement
  const agreementEl = transaction.node('ram:ApplicableHeaderTradeAgreement');
  convertHeaderTradeAgreement(applicableHeaderTradeAgreement, agreementEl);
  
  // Convert header trade delivery
  const deliveryEl = transaction.node('ram:ApplicableHeaderTradeDelivery');
  convertHeaderTradeDelivery(applicableHeaderTradeDelivery, deliveryEl);
  
  // Convert header trade settlement
  const settlementEl = transaction.node('ram:ApplicableHeaderTradeSettlement');
  convertHeaderTradeSettlement(applicableHeaderTradeSettlement, settlementEl);
}

/**
 * Convert SupplyChainTradeLineItemType to XML
 */
function convertSupplyChainTradeLineItem(
  lineItem: ram.SupplyChainTradeLineItemType,
  parent: XMLElement
): void {
  // Implementation required based on the model structure
  // This is a placeholder for the full implementation
  if (lineItem.associatedDocumentLineDocument) {
    const docLineEl = parent.node('ram:AssociatedDocumentLineDocument');
    
    if (lineItem.associatedDocumentLineDocument.lineID) {
      const lineIDEl = docLineEl.node('ram:LineID');
      udtConverters.convertID(lineItem.associatedDocumentLineDocument.lineID, lineIDEl);
    }
  }
  
  if (lineItem.specifiedTradeProduct) {
    const productEl = parent.node('ram:SpecifiedTradeProduct');
    
    if (lineItem.specifiedTradeProduct.name) {
      const nameEl = productEl.node('ram:Name');
      udtConverters.convertText(lineItem.specifiedTradeProduct.name, nameEl);
    }
  }
}

/**
 * Convert HeaderTradeAgreementType to XML
 */
function convertHeaderTradeAgreement(
  { buyerReference, sellerTradeParty, buyerTradeParty, buyerOrderReferencedDocument }: HeaderTradeAgreementType,
  parent: XMLElement
): void {
  if (buyerReference) {
    const refEl = parent.node('ram:BuyerReference');
    udtConverters.convertText(buyerReference, refEl);
  }
  
  // Convert seller party
  const sellerPartyEl = parent.node('ram:SellerTradeParty');
  convertTradeParty(sellerTradeParty, sellerPartyEl);
  
  // Convert buyer party
  const buyerPartyEl = parent.node('ram:BuyerTradeParty');
  convertTradeParty(buyerTradeParty, buyerPartyEl);
  
  // Convert buyer order reference document if available
  if (buyerOrderReferencedDocument) {
    const docEl = parent.node('ram:BuyerOrderReferencedDocument');
    
    if (buyerOrderReferencedDocument.issuerAssignedID) {
      const idEl = docEl.node('ram:IssuerAssignedID');
      udtConverters.convertID(buyerOrderReferencedDocument.issuerAssignedID, idEl);
    }
  }
}

/**
 * Convert TradePartyType to XML
 */
function convertTradeParty(
  { name, specifiedLegalOrganization, postalTradeAddress, specifiedTaxRegistration }: ram.TradePartyType,
  parent: XMLElement
): void {
  if (name) {
    const nameEl = parent.node('ram:Name');
    udtConverters.convertText(name, nameEl);
  }
  
  if (specifiedLegalOrganization) {
    const orgEl = parent.node('ram:SpecifiedLegalOrganization');
    
    if (specifiedLegalOrganization.id) {
      const idEl = orgEl.node('ram:ID');
      udtConverters.convertID(specifiedLegalOrganization.id, idEl);
    }
  }
  
  if (postalTradeAddress) {
    const addressEl = parent.node('ram:PostalTradeAddress');
    convertTradeAddress(postalTradeAddress, addressEl);
  }
  
  if (specifiedTaxRegistration && specifiedTaxRegistration.length > 0) {
    specifiedTaxRegistration.forEach(tax => {
      const taxEl = parent.node('ram:SpecifiedTaxRegistration');
      
      if (tax.id) {
        const idEl = taxEl.node('ram:ID');
        udtConverters.convertID(tax.id, idEl);
      }
    });
  }
}

/**
 * Convert TradeAddressType to XML
 */
function convertTradeAddress(
  { countryID, postcodeCode, cityName, lineOne }: ram.TradeAddressType,
  parent: XMLElement
): void {
  if (postcodeCode) {
    const postcodeEl = parent.node('ram:PostcodeCode');
    udtConverters.convertText(postcodeCode, postcodeEl);
  }
  
  if (lineOne) {
    const lineOneEl = parent.node('ram:LineOne');
    udtConverters.convertText(lineOne, lineOneEl);
  }
  
  if (cityName) {
    const cityNameEl = parent.node('ram:CityName');
    udtConverters.convertText(cityName, cityNameEl);
  }
  
  if (countryID) {
    const countryIDEl = parent.node('ram:CountryID');
    countryIDEl.text(countryID.value);
  }
}

/**
 * Convert HeaderTradeDeliveryType to XML
 */
function convertHeaderTradeDelivery(
  delivery: HeaderTradeDeliveryType,
  parent: XMLElement
): void {
  // Basic implementation - can be expanded as needed
  if (delivery.shipToTradeParty) {
    const shipToEl = parent.node('ram:ShipToTradeParty');
    convertTradeParty(delivery.shipToTradeParty, shipToEl);
  }
}

/**
 * Convert HeaderTradeSettlementType to XML
 */
function convertHeaderTradeSettlement(
  { invoiceCurrencyCode, applicableTradeTax, specifiedTradeSettlementHeaderMonetarySummation }: HeaderTradeSettlementType,
  parent: XMLElement
): void {
  // Convert currency code
  const currencyEl = parent.node('ram:InvoiceCurrencyCode');
  currencyEl.text(invoiceCurrencyCode.value);
  
  // Convert applicable trade tax
  if (applicableTradeTax && applicableTradeTax.length > 0) {
    applicableTradeTax.forEach(tax => {
      const taxEl = parent.node('ram:ApplicableTradeTax');
      convertTradeTax(tax, taxEl);
    });
  }
  
  // Convert monetary summation
  const summationEl = parent.node('ram:SpecifiedTradeSettlementHeaderMonetarySummation');
  convertTradeSettlementHeaderMonetarySummation(specifiedTradeSettlementHeaderMonetarySummation, summationEl);
}

/**
 * Convert TradeTaxType to XML
 */
function convertTradeTax(
  { typeCode, categoryCode, rateApplicablePercent }: ram.TradeTaxType,
  parent: XMLElement
): void {
  if (typeCode) {
    const typeCodeEl = parent.node('ram:TypeCode');
    typeCodeEl.text(typeCode.value);
  }
  
  if (categoryCode) {
    const categoryCodeEl = parent.node('ram:CategoryCode');
    categoryCodeEl.text(categoryCode.value);
  }
  
  if (rateApplicablePercent) {
    const rateEl = parent.node('ram:RateApplicablePercent');
    rateEl.text(String(rateApplicablePercent.value));
  }
}

/**
 * Convert TradeSettlementHeaderMonetarySummationType to XML
 */
function convertTradeSettlementHeaderMonetarySummation(
  { lineTotalAmount, taxBasisTotalAmount, taxTotalAmount, grandTotalAmount, duePayableAmount }: ram.TradeSettlementHeaderMonetarySummationType,
  parent: XMLElement
): void {
  if (lineTotalAmount) {
    const lineTotalEl = parent.node('ram:LineTotalAmount');
    udtConverters.convertAmount(lineTotalAmount, lineTotalEl);
  }
  
  if (taxBasisTotalAmount && taxBasisTotalAmount.length > 0) {
    taxBasisTotalAmount.forEach(amount => {
      const taxBasisEl = parent.node('ram:TaxBasisTotalAmount');
      udtConverters.convertAmount(amount, taxBasisEl);
    });
  }
  
  if (taxTotalAmount && taxTotalAmount.length > 0) {
    taxTotalAmount.forEach(amount => {
      const taxTotalEl = parent.node('ram:TaxTotalAmount');
      udtConverters.convertAmount(amount, taxTotalEl);
    });
  }
  
  if (grandTotalAmount && grandTotalAmount.length > 0) {
    grandTotalAmount.forEach(amount => {
      const grandTotalEl = parent.node('ram:GrandTotalAmount');
      udtConverters.convertAmount(amount, grandTotalEl);
    });
  }
  
  if (duePayableAmount) {
    const duePayableEl = parent.node('ram:DuePayableAmount');
    udtConverters.convertAmount(duePayableAmount, duePayableEl);
  }
} 