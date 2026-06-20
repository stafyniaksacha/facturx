/**
 * ReusableAggregateBusinessInformationEntity classes for Factur-X
 * Based on urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100
 */

import type * as qdt from './qualifiedTypes'
import type * as udt from './unqualifiedTypes'

/**
 * A time period given by start and end (or a single complete) date-time, such as an invoicing or billing period.
 * @profile BASIC WL
 */
export class SpecifiedPeriodType {
  constructor({
    description,
    startDateTime,
    endDateTime,
    completeDateTime,
  }: {
    description?: udt.TextType
    startDateTime?: udt.DateTimeType
    endDateTime?: udt.DateTimeType
    completeDateTime?: udt.DateTimeType
  }) {
    this.description = description
    this.startDateTime = startDateTime
    this.endDateTime = endDateTime
    this.completeDateTime = completeDateTime
  }

  description?: udt.TextType
  startDateTime?: udt.DateTimeType
  endDateTime?: udt.DateTimeType
  completeDateTime?: udt.DateTimeType
}

/**
 * A reference to a related document such as an order, contract, despatch advice or supporting attachment, with its identifier, type and optional embedded binary content.
 * @profile MINIMUM
 */
export class ReferencedDocumentType {
  constructor({
    issuerAssignedID,
    uriID,
    lineID,
    typeCode,
    name,
    attachmentBinaryObject,
    referenceTypeCode,
    formattedIssueDateTime,
  }: {
    issuerAssignedID?: udt.IDType
    uriID?: udt.IDType
    lineID?: udt.IDType
    typeCode?: qdt.DocumentCodeType
    name?: udt.TextType[]
    attachmentBinaryObject?: udt.BinaryObjectType
    referenceTypeCode?: qdt.ReferenceCodeType
    formattedIssueDateTime?: qdt.FormattedDateTimeType
  }) {
    this.issuerAssignedID = issuerAssignedID
    this.uriID = uriID
    this.lineID = lineID
    this.typeCode = typeCode
    this.name = name
    this.attachmentBinaryObject = attachmentBinaryObject
    this.referenceTypeCode = referenceTypeCode
    this.formattedIssueDateTime = formattedIssueDateTime
  }

  issuerAssignedID?: udt.IDType
  uriID?: udt.IDType
  lineID?: udt.IDType
  typeCode?: qdt.DocumentCodeType
  name?: udt.TextType[]
  attachmentBinaryObject?: udt.BinaryObjectType
  referenceTypeCode?: qdt.ReferenceCodeType
  formattedIssueDateTime?: qdt.FormattedDateTimeType
}

/**
 * The applicable delivery terms, given as an Incoterms-style code and an optional relevant location.
 * @profile EXTENDED
 */
export class TradeDeliveryTermsType {
  constructor({
    deliveryTypeCode,
    relevantTradeLocation,
  }: {
    deliveryTypeCode: qdt.DeliveryTermsCodeType
    relevantTradeLocation?: TradeLocationType
  }) {
    this.deliveryTypeCode = deliveryTypeCode
    this.relevantTradeLocation = relevantTradeLocation
  }

  deliveryTypeCode: qdt.DeliveryTermsCodeType
  relevantTradeLocation?: TradeLocationType
}

/**
 * A geographic location, identified by country code and/or name.
 * @profile EXTENDED
 */
export class TradeLocationType {
  constructor({
    countryID,
    name,
  }: {
    countryID?: qdt.CountryIDType
    name?: udt.TextType
  }) {
    this.countryID = countryID
    this.name = name
  }

  countryID?: qdt.CountryIDType
  name?: udt.TextType
}

/**
 * The procurement project or contract reference the invoice relates to, identified by its identifier and name.
 * @profile EN 16931
 */
export class ProcuringProjectType {
  constructor({
    id,
    name,
  }: {
    id: udt.IDType
    name: udt.TextType
  }) {
    this.id = id
    this.name = name
  }

  id: udt.IDType
  name: udt.TextType
}

/**
 * An advance (prepaid) payment: its paid amount, receipt date, included VAT and the prepayment invoice it refers to.
 * @profile EXTENDED
 */
export class AdvancePaymentType {
  constructor({
    paidAmount,
    formattedReceivedDateTime,
    includedTradeTax,
    invoiceSpecifiedReferencedDocument,
  }: {
    paidAmount: udt.AmountType
    formattedReceivedDateTime?: qdt.FormattedDateTimeType
    includedTradeTax: TradeTaxType[]
    invoiceSpecifiedReferencedDocument?: ReferencedDocumentType
  }) {
    this.paidAmount = paidAmount
    this.formattedReceivedDateTime = formattedReceivedDateTime
    this.includedTradeTax = includedTradeTax
    this.invoiceSpecifiedReferencedDocument = invoiceSpecifiedReferencedDocument
  }

  paidAmount: udt.AmountType
  formattedReceivedDateTime?: qdt.FormattedDateTimeType
  includedTradeTax: TradeTaxType[]
  invoiceSpecifiedReferencedDocument?: ReferencedDocumentType
}

/**
 * A financial adjustment to the settlement, given as a reason and an amount.
 * @profile EXTENDED
 */
export class FinancialAdjustmentType {
  constructor({
    reason,
    actualAmount,
  }: {
    reason: udt.TextType
    actualAmount: udt.AmountType
  }) {
    this.reason = reason
    this.actualAmount = actualAmount
  }

  reason: udt.TextType
  actualAmount: udt.AmountType
}

/**
 * The payee's receiving bank account, identified by IBAN or a proprietary number, with an optional account name.
 * @profile BASIC WL
 */
export class CreditorFinancialAccountType {
  constructor({
    ibanID,
    accountName,
    proprietaryID,
  }: {
    ibanID?: udt.IDType
    accountName?: udt.TextType
    proprietaryID?: udt.IDType
  }) {
    this.ibanID = ibanID
    this.accountName = accountName
    this.proprietaryID = proprietaryID
  }

  ibanID?: udt.IDType
  accountName?: udt.TextType
  proprietaryID?: udt.IDType
}

/**
 * The payee's bank, identified by its BIC.
 * @profile EN 16931
 */
export class CreditorFinancialInstitutionType {
  constructor({ bicID }: { bicID: udt.IDType }) {
    this.bicID = bicID
  }

  bicID: udt.IDType
}

/**
 * The payer's bank account, identified by IBAN, used notably for direct debit.
 * @profile BASIC WL
 */
export class DebtorFinancialAccountType {
  constructor({ ibanID, accountName }: { ibanID: udt.IDType, accountName?: udt.TextType }) {
    this.ibanID = ibanID
    this.accountName = accountName
  }

  ibanID: udt.IDType
  accountName?: udt.TextType
}

/**
 * The payer's bank, identified by its BIC.
 * @profile EXTENDED
 */
export class DebtorFinancialInstitutionType {
  constructor({ bicID }: { bicID?: udt.IDType }) {
    this.bicID = bicID
  }

  bicID?: udt.IDType
}

/**
 * A context parameter carrying the identifier of a guideline or business process.
 * @profile MINIMUM
 */
export class DocumentContextParameterType {
  constructor({ id }: { id: udt.IDType }) {
    this.id = id
  }

  id: udt.IDType
}

/**
 * A free-text note, optionally qualified by subject and content codes.
 * @profile BASIC WL
 */
export class NoteType {
  constructor({
    contentCode,
    content,
    subjectCode,
  }: {
    contentCode?: udt.CodeType
    content: udt.TextType
    subjectCode?: udt.CodeType
  }) {
    this.contentCode = contentCode
    this.content = content
    this.subjectCode = subjectCode
  }

  contentCode?: udt.CodeType
  content: udt.TextType
  subjectCode?: udt.CodeType
}

/**
 * Line-level document header: the line number, optional parent line, status code and free-text notes.
 * @profile BASIC
 */
export class DocumentLineDocumentType {
  constructor({
    lineID,
    parentLineID,
    lineStatusCode,
    lineStatusReasonCode,
    includedNote,
  }: {
    lineID: udt.IDType
    parentLineID?: udt.IDType
    lineStatusCode?: qdt.LineStatusCodeType
    lineStatusReasonCode?: udt.CodeType
    includedNote?: NoteType[]
  }) {
    this.lineID = lineID
    this.parentLineID = parentLineID
    this.lineStatusCode = lineStatusCode
    this.lineStatusReasonCode = lineStatusReasonCode
    this.includedNote = includedNote
  }

  lineID: udt.IDType
  parentLineID?: udt.IDType
  lineStatusCode?: qdt.LineStatusCodeType
  lineStatusReasonCode?: udt.CodeType
  includedNote?: NoteType[]
}

/**
 * A VAT breakdown entry for one combination of category and rate: the taxable basis, the resulting tax amount and an optional exemption reason.
 * @profile BASIC WL
 */
export class TradeTaxType {
  constructor({
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
  }: {
    calculatedAmount?: udt.AmountType
    typeCode?: qdt.TaxTypeCodeType
    exemptionReason?: udt.TextType
    basisAmount?: udt.AmountType
    lineTotalBasisAmount?: udt.AmountType
    allowanceChargeBasisAmount?: udt.AmountType
    categoryCode: qdt.TaxCategoryCodeType
    exemptionReasonCode?: udt.CodeType
    taxPointDate?: udt.DateType
    dueDateTypeCode?: qdt.TimeReferenceCodeType
    rateApplicablePercent?: udt.PercentType
  }) {
    this.calculatedAmount = calculatedAmount
    this.typeCode = typeCode
    this.exemptionReason = exemptionReason
    this.basisAmount = basisAmount
    this.lineTotalBasisAmount = lineTotalBasisAmount
    this.allowanceChargeBasisAmount = allowanceChargeBasisAmount
    this.categoryCode = categoryCode
    this.exemptionReasonCode = exemptionReasonCode
    this.taxPointDate = taxPointDate
    this.dueDateTypeCode = dueDateTypeCode
    this.rateApplicablePercent = rateApplicablePercent
  }

  calculatedAmount?: udt.AmountType
  typeCode?: qdt.TaxTypeCodeType
  exemptionReason?: udt.TextType
  basisAmount?: udt.AmountType
  lineTotalBasisAmount?: udt.AmountType
  allowanceChargeBasisAmount?: udt.AmountType
  categoryCode: qdt.TaxCategoryCodeType
  exemptionReasonCode?: udt.CodeType
  taxPointDate?: udt.DateType
  dueDateTypeCode?: qdt.TimeReferenceCodeType
  rateApplicablePercent?: udt.PercentType
}

/**
 * A postal address: street lines, city, post code, ISO 3166-1 country code and country sub-division.
 * @profile MINIMUM
 */
export class TradeAddressType {
  constructor({
    postcodeCode,
    lineOne,
    lineTwo,
    lineThree,
    cityName,
    countryID,
    countrySubDivisionName,
  }: {
    postcodeCode?: udt.CodeType
    lineOne?: udt.TextType
    lineTwo?: udt.TextType
    lineThree?: udt.TextType
    cityName?: udt.TextType
    countryID: qdt.CountryIDType
    countrySubDivisionName?: udt.TextType[]
  }) {
    this.postcodeCode = postcodeCode
    this.lineOne = lineOne
    this.lineTwo = lineTwo
    this.lineThree = lineThree
    this.cityName = cityName
    this.countryID = countryID
    this.countrySubDivisionName = countrySubDivisionName
  }

  postcodeCode?: udt.CodeType
  lineOne?: udt.TextType
  lineTwo?: udt.TextType
  lineThree?: udt.TextType
  cityName?: udt.TextType
  countryID: qdt.CountryIDType
  countrySubDivisionName?: udt.TextType[]
}

/**
 * A communication channel, holding either a URI/email address or a phone or fax number.
 * @profile BASIC WL
 */
export class UniversalCommunicationType {
  constructor({
    uriID,
    completeNumber,
  }: {
    uriID?: udt.IDType
    completeNumber?: udt.TextType
  }) {
    this.uriID = uriID
    this.completeNumber = completeNumber
  }

  uriID?: udt.IDType
  completeNumber?: udt.TextType
}

/**
 * A contact person for a party: name, department and telephone, fax and email channels.
 * @profile EN 16931
 */
export class TradeContactType {
  constructor({
    personName,
    departmentName,
    typeCode,
    telephoneUniversalCommunication,
    faxUniversalCommunication,
    emailURIUniversalCommunication,
  }: {
    personName?: udt.TextType
    departmentName?: udt.TextType
    typeCode?: qdt.ContactTypeCodeType
    telephoneUniversalCommunication?: UniversalCommunicationType
    faxUniversalCommunication?: UniversalCommunicationType
    emailURIUniversalCommunication?: UniversalCommunicationType
  }) {
    this.personName = personName
    this.departmentName = departmentName
    this.typeCode = typeCode
    this.telephoneUniversalCommunication = telephoneUniversalCommunication
    this.faxUniversalCommunication = faxUniversalCommunication
    this.emailURIUniversalCommunication = emailURIUniversalCommunication
  }

  personName?: udt.TextType
  departmentName?: udt.TextType
  typeCode?: qdt.ContactTypeCodeType
  telephoneUniversalCommunication?: UniversalCommunicationType
  faxUniversalCommunication?: UniversalCommunicationType
  emailURIUniversalCommunication?: UniversalCommunicationType
}

/**
 * A party's legal registration: its legal identifier, trading name and registered address.
 * @profile MINIMUM
 */
export class LegalOrganizationType {
  constructor({
    id,
    tradingBusinessName,
    postalTradeAddress,
  }: {
    id?: udt.IDType
    tradingBusinessName?: udt.TextType
    postalTradeAddress?: TradeAddressType
  }) {
    this.id = id
    this.tradingBusinessName = tradingBusinessName
    this.postalTradeAddress = postalTradeAddress
  }

  id?: udt.IDType
  tradingBusinessName?: udt.TextType
  postalTradeAddress?: TradeAddressType
}

/**
 * A party's tax registration identifier, such as its VAT identifier.
 * @profile MINIMUM
 */
export class TaxRegistrationType {
  constructor({ id }: { id: udt.IDType }) {
    this.id = id
  }

  id: udt.IDType
}

/**
 * A party involved in the trade (seller, buyer, payee, ship-to, tax representative, …): its identifiers, name, role, legal organization, address, contacts and tax registrations.
 * @profile MINIMUM
 */
export class TradePartyType {
  constructor({
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
  }: {
    id?: udt.IDType[]
    globalID?: udt.IDType[]
    name?: udt.TextType
    roleCode?: qdt.PartyRoleCodeType
    description?: udt.TextType
    specifiedLegalOrganization?: LegalOrganizationType
    definedTradeContact?: TradeContactType[]
    postalTradeAddress?: TradeAddressType
    uriUniversalCommunication?: UniversalCommunicationType
    specifiedTaxRegistration?: TaxRegistrationType[]
  }) {
    this.id = id
    this.globalID = globalID
    this.name = name
    this.roleCode = roleCode
    this.description = description
    this.specifiedLegalOrganization = specifiedLegalOrganization
    this.definedTradeContact = definedTradeContact
    this.postalTradeAddress = postalTradeAddress
    this.uriUniversalCommunication = uriUniversalCommunication
    this.specifiedTaxRegistration = specifiedTaxRegistration
  }

  id?: udt.IDType[]
  globalID?: udt.IDType[]
  name?: udt.TextType
  roleCode?: qdt.PartyRoleCodeType
  description?: udt.TextType
  specifiedLegalOrganization?: LegalOrganizationType
  definedTradeContact?: TradeContactType[]
  postalTradeAddress?: TradeAddressType
  uriUniversalCommunication?: UniversalCommunicationType
  specifiedTaxRegistration?: TaxRegistrationType[]
}

/**
 * A supply-chain event, such as the actual delivery, given by its occurrence date-time.
 * @profile BASIC WL
 */
export class SupplyChainEventType {
  constructor({
    occurrenceDateTime,
  }: {
    occurrenceDateTime: udt.DateTimeType
  }) {
    this.occurrenceDateTime = occurrenceDateTime
  }

  occurrenceDateTime: udt.DateTimeType
}

/**
 * A consignment within the delivery, carrying its specified transport movements.
 * @profile EXTENDED
 */
export class SupplyChainConsignmentType {
  constructor({
    specifiedLogisticsTransportMovement,
  }: {
    specifiedLogisticsTransportMovement?: LogisticsTransportMovementType[]
  }) {
    this.specifiedLogisticsTransportMovement = specifiedLogisticsTransportMovement
  }

  specifiedLogisticsTransportMovement?: LogisticsTransportMovementType[]
}

/**
 * A transport movement, identified by its mode of transport.
 * @profile EXTENDED
 */
export class LogisticsTransportMovementType {
  constructor({
    modeCode,
  }: {
    modeCode: qdt.TransportModeCodeType
  }) {
    this.modeCode = modeCode
  }

  modeCode: qdt.TransportModeCodeType
}

/**
 * A buyer accounting reference, such as a cost-centre code, with an optional account type code.
 * @profile BASIC WL
 */
export class TradeAccountingAccountType {
  constructor({
    id,
    typeCode,
  }: {
    id: udt.IDType
    typeCode?: qdt.AccountingAccountTypeCodeType
  }) {
    this.id = id
    this.typeCode = typeCode
  }

  id: udt.IDType
  typeCode?: qdt.AccountingAccountTypeCodeType
}

/**
 * A currency conversion between source and target currencies, with the conversion rate and its date.
 * @profile EXTENDED
 */
export class TradeCurrencyExchangeType {
  constructor({
    sourceCurrencyCode,
    targetCurrencyCode,
    conversionRate,
    conversionRateDateTime,
  }: {
    sourceCurrencyCode: qdt.CurrencyCodeType
    targetCurrencyCode: qdt.CurrencyCodeType
    conversionRate: udt.RateType
    conversionRateDateTime?: udt.DateTimeType
  }) {
    this.sourceCurrencyCode = sourceCurrencyCode
    this.targetCurrencyCode = targetCurrencyCode
    this.conversionRate = conversionRate
    this.conversionRateDateTime = conversionRateDateTime
  }

  sourceCurrencyCode: qdt.CurrencyCodeType
  targetCurrencyCode: qdt.CurrencyCodeType
  conversionRate: udt.RateType
  conversionRateDateTime?: udt.DateTimeType
}

/**
 * An allowance (deduction) or charge: a charge indicator, an amount or percentage with its basis, a reason and the applicable VAT category.
 * @profile BASIC WL
 */
export class TradeAllowanceChargeType {
  constructor({
    chargeIndicator,
    sequenceNumeric,
    calculationPercent,
    basisAmount,
    basisQuantity,
    actualAmount,
    reasonCode,
    reason,
    categoryTradeTax,
  }: {
    chargeIndicator: udt.IndicatorType
    sequenceNumeric?: udt.NumericType
    calculationPercent?: udt.PercentType
    basisAmount?: udt.AmountType
    basisQuantity?: udt.QuantityType
    actualAmount: udt.AmountType
    reasonCode?: qdt.AllowanceChargeReasonCodeType
    reason?: udt.TextType
    categoryTradeTax?: TradeTaxType
  }) {
    this.chargeIndicator = chargeIndicator
    this.sequenceNumeric = sequenceNumeric
    this.calculationPercent = calculationPercent
    this.basisAmount = basisAmount
    this.basisQuantity = basisQuantity
    this.actualAmount = actualAmount
    this.reasonCode = reasonCode
    this.reason = reason
    this.categoryTradeTax = categoryTradeTax
  }

  chargeIndicator: udt.IndicatorType
  sequenceNumeric?: udt.NumericType
  calculationPercent?: udt.PercentType
  basisAmount?: udt.AmountType
  basisQuantity?: udt.QuantityType
  actualAmount: udt.AmountType
  reasonCode?: qdt.AllowanceChargeReasonCodeType
  reason?: udt.TextType
  categoryTradeTax?: TradeTaxType
}

/**
 * A logistics service charge, given by its description, amount and applicable tax.
 * @profile EXTENDED
 */
export class LogisticsServiceChargeType {
  constructor({
    description,
    appliedAmount,
    appliedTradeTax,
  }: {
    description: udt.TextType
    appliedAmount: udt.AmountType
    appliedTradeTax?: TradeTaxType[]
  }) {
    this.description = description
    this.appliedAmount = appliedAmount
    this.appliedTradeTax = appliedTradeTax
  }

  description: udt.TextType
  appliedAmount: udt.AmountType
  appliedTradeTax?: TradeTaxType[]
}

/**
 * Late-payment penalty terms: the basis date, period and amount together with the penalty percentage or amount.
 * @profile EXTENDED
 */
export class TradePaymentPenaltyTermsType {
  constructor({
    basisDateTime,
    basisPeriodMeasure,
    basisAmount,
    calculationPercent,
    actualPenaltyAmount,
  }: {
    basisDateTime?: udt.DateTimeType
    basisPeriodMeasure?: udt.MeasureType
    basisAmount?: udt.AmountType
    calculationPercent?: udt.PercentType
    actualPenaltyAmount?: udt.AmountType
  }) {
    this.basisDateTime = basisDateTime
    this.basisPeriodMeasure = basisPeriodMeasure
    this.basisAmount = basisAmount
    this.calculationPercent = calculationPercent
    this.actualPenaltyAmount = actualPenaltyAmount
  }

  basisDateTime?: udt.DateTimeType
  basisPeriodMeasure?: udt.MeasureType
  basisAmount?: udt.AmountType
  calculationPercent?: udt.PercentType
  actualPenaltyAmount?: udt.AmountType
}

/**
 * Early-payment discount terms: the basis date, period and amount together with the discount percentage or amount.
 * @profile EXTENDED
 */
export class TradePaymentDiscountTermsType {
  constructor({
    basisDateTime,
    basisPeriodMeasure,
    basisAmount,
    calculationPercent,
    actualDiscountAmount,
  }: {
    basisDateTime?: udt.DateTimeType
    basisPeriodMeasure?: udt.MeasureType
    basisAmount?: udt.AmountType
    calculationPercent?: udt.PercentType
    actualDiscountAmount?: udt.AmountType
  }) {
    this.basisDateTime = basisDateTime
    this.basisPeriodMeasure = basisPeriodMeasure
    this.basisAmount = basisAmount
    this.calculationPercent = calculationPercent
    this.actualDiscountAmount = actualDiscountAmount
  }

  basisDateTime?: udt.DateTimeType
  basisPeriodMeasure?: udt.MeasureType
  basisAmount?: udt.AmountType
  calculationPercent?: udt.PercentType
  actualDiscountAmount?: udt.AmountType
}

/**
 * Payment terms: textual description, due date, direct-debit mandate, partial-payment amount and the applicable penalty and discount terms.
 * @profile BASIC WL
 */
export class TradePaymentTermsType {
  constructor({
    description,
    dueDateDateTime,
    directDebitMandateID,
    partialPaymentAmount,
    applicableTradePaymentPenaltyTerms,
    applicableTradePaymentDiscountTerms,
    payeeTradeParty,
  }: {
    description?: udt.TextType
    dueDateDateTime?: udt.DateTimeType
    directDebitMandateID?: udt.IDType
    partialPaymentAmount?: udt.AmountType
    applicableTradePaymentPenaltyTerms?: TradePaymentPenaltyTermsType
    applicableTradePaymentDiscountTerms?: TradePaymentDiscountTermsType
    payeeTradeParty?: TradePartyType
  }) {
    this.description = description
    this.dueDateDateTime = dueDateDateTime
    this.directDebitMandateID = directDebitMandateID
    this.partialPaymentAmount = partialPaymentAmount
    this.applicableTradePaymentPenaltyTerms = applicableTradePaymentPenaltyTerms
    this.applicableTradePaymentDiscountTerms = applicableTradePaymentDiscountTerms
    this.payeeTradeParty = payeeTradeParty
  }

  description?: udt.TextType
  dueDateDateTime?: udt.DateTimeType
  directDebitMandateID?: udt.IDType
  partialPaymentAmount?: udt.AmountType
  applicableTradePaymentPenaltyTerms?: TradePaymentPenaltyTermsType
  applicableTradePaymentDiscountTerms?: TradePaymentDiscountTermsType
  payeeTradeParty?: TradePartyType
}

/**
 * A payment card used for settlement, identified by a (masked) card number and cardholder name.
 * @profile EN 16931
 */
export class TradeSettlementFinancialCardType {
  constructor({
    id,
    cardholderName,
  }: {
    id: udt.IDType
    cardholderName?: udt.TextType
  }) {
    this.id = id
    this.cardholderName = cardholderName
  }

  id: udt.IDType
  cardholderName?: udt.TextType
}

/**
 * A means of payment: its UNTDID 4461 type code plus the card, debtor/creditor accounts and financial institutions involved.
 * @profile BASIC WL
 */
export class TradeSettlementPaymentMeansType {
  constructor({
    typeCode,
    information,
    applicableTradeSettlementFinancialCard,
    payerPartyDebtorFinancialAccount,
    payeePartyCreditorFinancialAccount,
    payerSpecifiedDebtorFinancialInstitution,
    payeeSpecifiedCreditorFinancialInstitution,
  }: {
    typeCode: qdt.PaymentMeansCodeType
    information?: udt.TextType
    applicableTradeSettlementFinancialCard?: TradeSettlementFinancialCardType
    payerPartyDebtorFinancialAccount?: DebtorFinancialAccountType
    payeePartyCreditorFinancialAccount?: CreditorFinancialAccountType
    payerSpecifiedDebtorFinancialInstitution?: DebtorFinancialInstitutionType
    payeeSpecifiedCreditorFinancialInstitution?: CreditorFinancialInstitutionType
  }) {
    this.typeCode = typeCode
    this.information = information
    this.applicableTradeSettlementFinancialCard = applicableTradeSettlementFinancialCard
    this.payerPartyDebtorFinancialAccount = payerPartyDebtorFinancialAccount
    this.payeePartyCreditorFinancialAccount = payeePartyCreditorFinancialAccount
    this.payerSpecifiedDebtorFinancialInstitution = payerSpecifiedDebtorFinancialInstitution
    this.payeeSpecifiedCreditorFinancialInstitution = payeeSpecifiedCreditorFinancialInstitution
  }

  typeCode: qdt.PaymentMeansCodeType
  information?: udt.TextType
  applicableTradeSettlementFinancialCard?: TradeSettlementFinancialCardType
  payerPartyDebtorFinancialAccount?: DebtorFinancialAccountType
  payeePartyCreditorFinancialAccount?: CreditorFinancialAccountType
  payerSpecifiedDebtorFinancialInstitution?: DebtorFinancialInstitutionType
  payeeSpecifiedCreditorFinancialInstitution?: CreditorFinancialInstitutionType
}

/**
 * Document-level monetary totals: line, charge and allowance totals, tax basis and VAT amount, grand total, prepaid amount and the amount due for payment.
 * @profile MINIMUM
 */
export class TradeSettlementHeaderMonetarySummationType {
  constructor({
    lineTotalAmount,
    chargeTotalAmount,
    allowanceTotalAmount,
    taxBasisTotalAmount,
    taxTotalAmount,
    roundingAmount,
    grandTotalAmount,
    totalPrepaidAmount,
    duePayableAmount,
  }: {
    lineTotalAmount?: udt.AmountType
    chargeTotalAmount?: udt.AmountType
    allowanceTotalAmount?: udt.AmountType
    taxBasisTotalAmount: udt.AmountType
    taxTotalAmount?: udt.AmountType[]
    roundingAmount?: udt.AmountType
    grandTotalAmount: udt.AmountType
    totalPrepaidAmount?: udt.AmountType
    duePayableAmount: udt.AmountType
  }) {
    this.lineTotalAmount = lineTotalAmount
    this.chargeTotalAmount = chargeTotalAmount
    this.allowanceTotalAmount = allowanceTotalAmount
    this.taxBasisTotalAmount = taxBasisTotalAmount
    this.taxTotalAmount = taxTotalAmount
    this.roundingAmount = roundingAmount
    this.grandTotalAmount = grandTotalAmount
    this.totalPrepaidAmount = totalPrepaidAmount
    this.duePayableAmount = duePayableAmount
  }

  lineTotalAmount?: udt.AmountType
  chargeTotalAmount?: udt.AmountType
  allowanceTotalAmount?: udt.AmountType
  // 1.09: TaxBasisTotalAmount (BT-109) is single & required; TaxTotalAmount (BT-110/111) is 0..2
  taxBasisTotalAmount: udt.AmountType
  taxTotalAmount?: udt.AmountType[]
  roundingAmount?: udt.AmountType
  // 1.09: GrandTotalAmount (BT-112) is single & required
  grandTotalAmount: udt.AmountType
  totalPrepaidAmount?: udt.AmountType
  duePayableAmount: udt.AmountType
}

/**
 * A product attribute, given as a description and value, optionally with a measured value and type code.
 * @profile EN 16931
 */
export class ProductCharacteristicType {
  constructor({
    typeCode,
    description,
    valueMeasure,
    value,
  }: {
    typeCode?: udt.CodeType
    description: udt.TextType
    valueMeasure?: udt.MeasureType
    value: udt.TextType
  }) {
    this.typeCode = typeCode
    this.description = description
    this.valueMeasure = valueMeasure
    this.value = value
  }

  typeCode?: udt.CodeType
  description: udt.TextType
  valueMeasure?: udt.MeasureType
  value: udt.TextType
}

/**
 * A product classification, given as a classification code and/or class name.
 * @profile EN 16931
 */
export class ProductClassificationType {
  constructor({
    classCode,
    className,
  }: {
    classCode?: udt.CodeType
    className?: udt.TextType
  }) {
    this.classCode = classCode
    this.className = className
  }

  classCode?: udt.CodeType
  className?: udt.TextType
}

/**
 * A specific instance of an item, identified by batch and/or supplier-assigned serial number.
 * @profile EXTENDED
 */
export class TradeProductInstanceType {
  constructor({
    batchID,
    supplierAssignedSerialID,
  }: {
    batchID?: udt.IDType
    supplierAssignedSerialID?: udt.IDType
  }) {
    this.batchID = batchID
    this.supplierAssignedSerialID = supplierAssignedSerialID
  }

  batchID?: udt.IDType
  supplierAssignedSerialID?: udt.IDType
}

/**
 * The country of origin of an item, given as an ISO 3166-1 country code.
 * @profile EN 16931
 */
export class TradeCountryType {
  constructor({
    id,
  }: {
    id?: qdt.CountryIDType
  }) {
    this.id = id
  }

  id?: qdt.CountryIDType
}

/**
 * A component or included product, with its identifiers, name, description and unit quantity.
 * @profile EXTENDED
 */
export class ReferencedProductType {
  constructor({
    id,
    globalID,
    sellerAssignedID,
    buyerAssignedID,
    industryAssignedID,
    name,
    description,
    unitQuantity,
  }: {
    id?: udt.IDType
    globalID?: udt.IDType[]
    sellerAssignedID?: udt.IDType
    buyerAssignedID?: udt.IDType
    industryAssignedID?: udt.IDType
    name: udt.TextType
    description?: udt.TextType
    unitQuantity?: udt.QuantityType
  }) {
    this.id = id
    this.globalID = globalID
    this.sellerAssignedID = sellerAssignedID
    this.buyerAssignedID = buyerAssignedID
    this.industryAssignedID = industryAssignedID
    this.name = name
    this.description = description
    this.unitQuantity = unitQuantity
  }

  id?: udt.IDType
  globalID?: udt.IDType[]
  sellerAssignedID?: udt.IDType
  buyerAssignedID?: udt.IDType
  industryAssignedID?: udt.IDType
  name: udt.TextType
  description?: udt.TextType
  unitQuantity?: udt.QuantityType
}

/**
 * The invoiced item: its identifiers, name, description, attributes, classifications, country of origin and manufacturer.
 * @profile BASIC
 */
export class TradeProductType {
  constructor({
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
  }: {
    id?: udt.IDType
    globalID?: udt.IDType
    sellerAssignedID?: udt.IDType
    buyerAssignedID?: udt.IDType
    industryAssignedID?: udt.IDType
    modelID?: udt.IDType
    name: udt.TextType
    description?: udt.TextType
    batchID?: udt.IDType[]
    brandName?: udt.TextType
    modelName?: udt.TextType
    applicableProductCharacteristic?: ProductCharacteristicType[]
    designatedProductClassification?: ProductClassificationType[]
    individualTradeProductInstance?: TradeProductInstanceType[]
    originTradeCountry?: TradeCountryType
    manufacturerTradeParty?: TradePartyType
    includedReferencedProduct?: ReferencedProductType[]
  }) {
    this.id = id
    this.globalID = globalID
    this.sellerAssignedID = sellerAssignedID
    this.buyerAssignedID = buyerAssignedID
    this.industryAssignedID = industryAssignedID
    this.modelID = modelID
    this.name = name
    this.description = description
    this.batchID = batchID
    this.brandName = brandName
    this.modelName = modelName
    this.applicableProductCharacteristic = applicableProductCharacteristic
    this.designatedProductClassification = designatedProductClassification
    this.individualTradeProductInstance = individualTradeProductInstance
    this.originTradeCountry = originTradeCountry
    this.manufacturerTradeParty = manufacturerTradeParty
    this.includedReferencedProduct = includedReferencedProduct
  }

  id?: udt.IDType
  globalID?: udt.IDType
  sellerAssignedID?: udt.IDType
  buyerAssignedID?: udt.IDType
  industryAssignedID?: udt.IDType
  modelID?: udt.IDType
  name: udt.TextType
  description?: udt.TextType
  batchID?: udt.IDType[]
  brandName?: udt.TextType
  modelName?: udt.TextType
  applicableProductCharacteristic?: ProductCharacteristicType[]
  designatedProductClassification?: ProductClassificationType[]
  individualTradeProductInstance?: TradeProductInstanceType[]
  originTradeCountry?: TradeCountryType
  manufacturerTradeParty?: TradePartyType
  includedReferencedProduct?: ReferencedProductType[]
}

/**
 * An item price (gross or net): the price amount, its basis quantity and any applied allowances/charges or included tax.
 * @profile BASIC
 */
export class TradePriceType {
  constructor({
    chargeAmount,
    basisQuantity,
    appliedTradeAllowanceCharge,
    includedTradeTax,
  }: {
    chargeAmount: udt.AmountType
    basisQuantity?: udt.QuantityType
    appliedTradeAllowanceCharge?: TradeAllowanceChargeType[]
    includedTradeTax?: TradeTaxType
  }) {
    this.chargeAmount = chargeAmount
    this.basisQuantity = basisQuantity
    this.appliedTradeAllowanceCharge = appliedTradeAllowanceCharge
    this.includedTradeTax = includedTradeTax
  }

  chargeAmount: udt.AmountType
  basisQuantity?: udt.QuantityType
  appliedTradeAllowanceCharge?: TradeAllowanceChargeType[]
  includedTradeTax?: TradeTaxType
}

/**
 * Line-level trade agreement (price details): the gross and net unit prices and references to the related order, contract and quotation.
 * @profile BASIC
 */
export class LineTradeAgreementType {
  constructor({
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
  }: {
    applicableTradeDeliveryTerms?: TradeDeliveryTermsType
    sellerOrderReferencedDocument?: ReferencedDocumentType
    buyerOrderReferencedDocument?: ReferencedDocumentType
    quotationReferencedDocument?: ReferencedDocumentType
    contractReferencedDocument?: ReferencedDocumentType
    additionalReferencedDocument?: ReferencedDocumentType[]
    grossPriceProductTradePrice?: TradePriceType
    netPriceProductTradePrice?: TradePriceType
    itemSellerTradeParty?: TradePartyType
    ultimateCustomerOrderReferencedDocument?: ReferencedDocumentType[]
  }) {
    this.applicableTradeDeliveryTerms = applicableTradeDeliveryTerms
    this.sellerOrderReferencedDocument = sellerOrderReferencedDocument
    this.buyerOrderReferencedDocument = buyerOrderReferencedDocument
    this.quotationReferencedDocument = quotationReferencedDocument
    this.contractReferencedDocument = contractReferencedDocument
    this.additionalReferencedDocument = additionalReferencedDocument
    this.grossPriceProductTradePrice = grossPriceProductTradePrice
    this.netPriceProductTradePrice = netPriceProductTradePrice
    this.itemSellerTradeParty = itemSellerTradeParty
    this.ultimateCustomerOrderReferencedDocument = ultimateCustomerOrderReferencedDocument
  }

  applicableTradeDeliveryTerms?: TradeDeliveryTermsType
  sellerOrderReferencedDocument?: ReferencedDocumentType
  buyerOrderReferencedDocument?: ReferencedDocumentType
  quotationReferencedDocument?: ReferencedDocumentType
  contractReferencedDocument?: ReferencedDocumentType
  additionalReferencedDocument?: ReferencedDocumentType[]
  grossPriceProductTradePrice?: TradePriceType
  netPriceProductTradePrice?: TradePriceType
  itemSellerTradeParty?: TradePartyType
  ultimateCustomerOrderReferencedDocument?: ReferencedDocumentType[]
}

/**
 * Line-level delivery: the billed and packaging quantities, ship-to party, delivery event and despatch/receiving/delivery-note references.
 * @profile BASIC
 */
export class LineTradeDeliveryType {
  constructor({
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
  }: {
    billedQuantity?: udt.QuantityType
    chargeFreeQuantity?: udt.QuantityType
    packageQuantity?: udt.QuantityType
    perPackageUnitQuantity?: udt.QuantityType
    shipToTradeParty?: TradePartyType
    ultimateShipToTradeParty?: TradePartyType
    actualDeliverySupplyChainEvent?: SupplyChainEventType
    despatchAdviceReferencedDocument?: ReferencedDocumentType
    receivingAdviceReferencedDocument?: ReferencedDocumentType
    deliveryNoteReferencedDocument?: ReferencedDocumentType
  }) {
    this.billedQuantity = billedQuantity
    this.chargeFreeQuantity = chargeFreeQuantity
    this.packageQuantity = packageQuantity
    this.perPackageUnitQuantity = perPackageUnitQuantity
    this.shipToTradeParty = shipToTradeParty
    this.ultimateShipToTradeParty = ultimateShipToTradeParty
    this.actualDeliverySupplyChainEvent = actualDeliverySupplyChainEvent
    this.despatchAdviceReferencedDocument = despatchAdviceReferencedDocument
    this.receivingAdviceReferencedDocument = receivingAdviceReferencedDocument
    this.deliveryNoteReferencedDocument = deliveryNoteReferencedDocument
  }

  billedQuantity?: udt.QuantityType
  chargeFreeQuantity?: udt.QuantityType
  packageQuantity?: udt.QuantityType
  perPackageUnitQuantity?: udt.QuantityType
  shipToTradeParty?: TradePartyType
  ultimateShipToTradeParty?: TradePartyType
  actualDeliverySupplyChainEvent?: SupplyChainEventType
  despatchAdviceReferencedDocument?: ReferencedDocumentType
  receivingAdviceReferencedDocument?: ReferencedDocumentType
  deliveryNoteReferencedDocument?: ReferencedDocumentType
}

/**
 * Line-level monetary totals: the net line amount plus any charge, allowance and tax totals.
 * @profile BASIC
 */
export class TradeSettlementLineMonetarySummationType {
  constructor({
    lineTotalAmount,
    chargeTotalAmount,
    allowanceTotalAmount,
    taxTotalAmount,
    grandTotalAmount,
    totalAllowanceChargeAmount,
  }: {
    lineTotalAmount: udt.AmountType
    chargeTotalAmount?: udt.AmountType
    allowanceTotalAmount?: udt.AmountType
    taxTotalAmount?: udt.AmountType
    grandTotalAmount?: udt.AmountType
    totalAllowanceChargeAmount?: udt.AmountType
  }) {
    this.lineTotalAmount = lineTotalAmount
    this.chargeTotalAmount = chargeTotalAmount
    this.allowanceTotalAmount = allowanceTotalAmount
    this.taxTotalAmount = taxTotalAmount
    this.grandTotalAmount = grandTotalAmount
    this.totalAllowanceChargeAmount = totalAllowanceChargeAmount
  }

  lineTotalAmount: udt.AmountType
  chargeTotalAmount?: udt.AmountType
  allowanceTotalAmount?: udt.AmountType
  taxTotalAmount?: udt.AmountType
  grandTotalAmount?: udt.AmountType
  totalAllowanceChargeAmount?: udt.AmountType
}

/**
 * Line-level settlement: the applicable VAT, invoice line period, line allowances/charges, line totals and accounting reference.
 * @profile BASIC
 */
export class LineTradeSettlementType {
  constructor({
    applicableTradeTax,
    billingSpecifiedPeriod,
    specifiedTradeAllowanceCharge,
    specifiedTradeSettlementLineMonetarySummation,
    invoiceReferencedDocument,
    additionalReferencedDocument,
    receivableSpecifiedTradeAccountingAccount,
  }: {
    applicableTradeTax: TradeTaxType[]
    billingSpecifiedPeriod?: SpecifiedPeriodType
    specifiedTradeAllowanceCharge?: TradeAllowanceChargeType[]
    specifiedTradeSettlementLineMonetarySummation?: TradeSettlementLineMonetarySummationType
    invoiceReferencedDocument?: ReferencedDocumentType
    additionalReferencedDocument?: ReferencedDocumentType[]
    receivableSpecifiedTradeAccountingAccount?: TradeAccountingAccountType[]
  }) {
    this.applicableTradeTax = applicableTradeTax
    this.billingSpecifiedPeriod = billingSpecifiedPeriod
    this.specifiedTradeAllowanceCharge = specifiedTradeAllowanceCharge
    this.specifiedTradeSettlementLineMonetarySummation = specifiedTradeSettlementLineMonetarySummation
    this.invoiceReferencedDocument = invoiceReferencedDocument
    this.additionalReferencedDocument = additionalReferencedDocument
    this.receivableSpecifiedTradeAccountingAccount = receivableSpecifiedTradeAccountingAccount
  }

  applicableTradeTax: TradeTaxType[]
  billingSpecifiedPeriod?: SpecifiedPeriodType
  specifiedTradeAllowanceCharge?: TradeAllowanceChargeType[]
  specifiedTradeSettlementLineMonetarySummation?: TradeSettlementLineMonetarySummationType
  invoiceReferencedDocument?: ReferencedDocumentType
  additionalReferencedDocument?: ReferencedDocumentType[]
  receivableSpecifiedTradeAccountingAccount?: TradeAccountingAccountType[]
}

/**
 * An invoice line: its line document, the specified item, and the line-level agreement, delivery and settlement.
 * @profile BASIC
 */
export class SupplyChainTradeLineItemType {
  constructor({
    associatedDocumentLineDocument,
    specifiedTradeProduct,
    specifiedLineTradeAgreement,
    specifiedLineTradeDelivery,
    specifiedLineTradeSettlement,
  }: {
    associatedDocumentLineDocument: DocumentLineDocumentType
    specifiedTradeProduct: TradeProductType
    specifiedLineTradeAgreement?: LineTradeAgreementType
    specifiedLineTradeDelivery?: LineTradeDeliveryType
    specifiedLineTradeSettlement: LineTradeSettlementType
  }) {
    this.associatedDocumentLineDocument = associatedDocumentLineDocument
    this.specifiedTradeProduct = specifiedTradeProduct
    this.specifiedLineTradeAgreement = specifiedLineTradeAgreement
    this.specifiedLineTradeDelivery = specifiedLineTradeDelivery
    this.specifiedLineTradeSettlement = specifiedLineTradeSettlement
  }

  associatedDocumentLineDocument: DocumentLineDocumentType
  specifiedTradeProduct: TradeProductType
  specifiedLineTradeAgreement?: LineTradeAgreementType
  specifiedLineTradeDelivery?: LineTradeDeliveryType
  specifiedLineTradeSettlement: LineTradeSettlementType
}
