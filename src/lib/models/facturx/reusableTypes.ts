/**
 * ReusableAggregateBusinessInformationEntity classes for Factur-X
 * Based on urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100
 */

import type * as qdt from './qualifiedTypes'
import type * as udt from './unqualifiedTypes'

/**
 * Specified period type
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
 * Referenced document type
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
 * Trade delivery terms type
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
 * Trade location type (EXTENDED)
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
 * Procuring project type
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
 * Advance payment type
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
 * Financial adjustment type (EXTENDED)
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
 * Creditor financial account type
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
 * Creditor financial institution type
 */
export class CreditorFinancialInstitutionType {
  constructor({ bicID }: { bicID: udt.IDType }) {
    this.bicID = bicID
  }

  bicID: udt.IDType
}

/**
 * Debtor financial account type
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
 * Debtor financial institution type (EXTENDED)
 */
export class DebtorFinancialInstitutionType {
  constructor({ bicID }: { bicID?: udt.IDType }) {
    this.bicID = bicID
  }

  bicID?: udt.IDType
}

/**
 * Document context parameter type
 */
export class DocumentContextParameterType {
  constructor({ id }: { id: udt.IDType }) {
    this.id = id
  }

  id: udt.IDType
}

/**
 * Note type
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
 * Document line document type
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
 * Trade tax type
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
 * Trade address type
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
 * Universal communication type
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
 * Trade contact type
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
 * Legal organization type
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
 * Tax registration type
 */
export class TaxRegistrationType {
  constructor({ id }: { id: udt.IDType }) {
    this.id = id
  }

  id: udt.IDType
}

/**
 * Trade party type
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
 * Supply chain event type
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
 * Supply chain consignment type
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
 * Logistics transport movement type
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
 * Trade accounting account type
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
 * Trade currency exchange type
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
 * Trade allowance charge type
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
 * Logistics service charge type
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
 * Trade payment penalty terms type
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
 * Trade payment discount terms type
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
 * Trade payment terms type
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
 * Trade settlement financial card type
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
 * Trade settlement payment means type
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
 * Trade settlement header monetary summation type
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
 * Product characteristic type
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
 * Product classification type
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
 * Trade product instance type
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
 * Trade country type
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
 * Referenced product type
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
 * Trade product type
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
 * Trade price type
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
 * Line trade agreement type
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
 * Line trade delivery type
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
 * Trade settlement line monetary summation type
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
 * Line trade settlement type
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
 * Supply chain trade line item type
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
