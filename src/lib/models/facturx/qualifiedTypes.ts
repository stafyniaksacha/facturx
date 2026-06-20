/**
 * QualifiedDataType classes for Factur-X
 * Based on urn:un:unece:uncefact:data:standard:QualifiedDataType:100
 */

/**
 * Code identifying the type of a buyer accounting account.
 * @profile EXTENDED
 */
export class AccountingAccountTypeCodeType {
  constructor({ value }: { value: string }) {
    this.value = value
  }

  value: string
}

/**
 * Coded reason for an allowance or charge (UNTDID 5189 for allowances, UNTDID 7161 for charges).
 * @profile BASIC WL
 */
export class AllowanceChargeReasonCodeType {
  constructor({ value }: { value: string }) {
    this.value = value
  }

  value: string
}

/**
 * Code identifying the type or role of a trade contact.
 * @profile EXTENDED
 */
export class ContactTypeCodeType {
  constructor({ value }: { value: string }) {
    this.value = value
  }

  value: string
}

/**
 * ISO 3166-1 alpha-2 country code.
 * @profile MINIMUM
 */
export class CountryIDType {
  constructor({ value }: { value: string }) {
    this.value = value
  }

  value: string
}

/**
 * ISO 4217 currency code.
 * @profile MINIMUM
 */
export class CurrencyCodeType {
  constructor({ value }: { value: string }) {
    this.value = value
  }

  value: string
}

/**
 * Incoterms code identifying the applicable delivery terms.
 * @profile EXTENDED
 */
export class DeliveryTermsCodeType {
  constructor({ value }: { value: string }) {
    this.value = value
  }

  value: string
}

/**
 * UNTDID 1001 code giving the document / invoice type.
 * @profile MINIMUM
 */
export class DocumentCodeType {
  constructor({ value }: { value: string }) {
    this.value = value
  }

  value: string
}

/**
 * A date/time expressed with an explicit format qualifier.
 * @profile BASIC WL
 */
export class FormattedDateTimeType {
  constructor({ dateTimeString, format }: { dateTimeString: string, format: string }) {
    this.dateTimeString = dateTimeString
    this.format = format
  }

  dateTimeString: string
  format: string
}

/**
 * Code giving the status of an invoice line.
 * @profile EXTENDED
 */
export class LineStatusCodeType {
  constructor({ value }: { value: string }) {
    this.value = value
  }

  value: string
}

/**
 * Code identifying the role a trade party plays.
 * @profile EXTENDED
 */
export class PartyRoleCodeType {
  constructor({ value }: { value: string }) {
    this.value = value
  }

  value: string
}

/**
 * UNTDID 4461 code identifying the means of payment.
 * @profile BASIC WL
 */
export class PaymentMeansCodeType {
  constructor({ value }: { value: string }) {
    this.value = value
  }

  value: string
}

/**
 * UNTDID 1153 code qualifying the type of a referenced document.
 * @profile EN 16931
 */
export class ReferenceCodeType {
  constructor({ value }: { value: string }) {
    this.value = value
  }

  value: string
}

/**
 * VAT category code (UNTDID 5305), e.g. standard rate, zero-rated, exempt or reverse charge.
 * @profile BASIC WL
 */
export class TaxCategoryCodeType {
  constructor({ value }: { value: string }) {
    this.value = value
  }

  value: string
}

/**
 * Code identifying the type of tax, typically VAT (UNTDID 5153).
 * @profile BASIC WL
 */
export class TaxTypeCodeType {
  constructor({ value }: { value: string }) {
    this.value = value
  }

  value: string
}

/**
 * Code identifying the event a date refers to, e.g. the basis for a VAT due date.
 * @profile BASIC WL
 */
export class TimeReferenceCodeType {
  constructor({ value }: { value: string }) {
    this.value = value
  }

  value: string
}

/**
 * Code identifying the mode of transport.
 * @profile EXTENDED
 */
export class TransportModeCodeType {
  constructor({ value }: { value: string }) {
    this.value = value
  }

  value: string
}
