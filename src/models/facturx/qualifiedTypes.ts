/**
 * QualifiedDataType classes for Factur-X
 * Based on urn:un:unece:uncefact:data:standard:QualifiedDataType:100
 */

import { TextType } from './unqualifiedTypes';

/**
 * Accounting account type code content
 */
export class AccountingAccountTypeCodeType {
  constructor({ value }: { value: string }) {
    this.value = value;
  }

  value: string;
}

/**
 * Allowance charge reason code
 */
export class AllowanceChargeReasonCodeType {
  constructor({ value }: { value: string }) {
    this.value = value;
  }

  value: string;
}

/**
 * Contact type code
 */
export class ContactTypeCodeType {
  constructor({ value }: { value: string }) {
    this.value = value;
  }

  value: string;
}

/**
 * Country ID code
 */
export class CountryIDType {
  constructor({ value }: { value: string }) {
    this.value = value;
  }

  value: string;
}

/**
 * Currency code
 */
export class CurrencyCodeType {
  constructor({ value }: { value: string }) {
    this.value = value;
  }

  value: string;
}

/**
 * Delivery terms code
 */
export class DeliveryTermsCodeType {
  constructor({ value }: { value: string }) {
    this.value = value;
  }

  value: string;
}

/**
 * Document code
 */
export class DocumentCodeType {
  constructor({ value }: { value: string }) {
    this.value = value;
  }

  value: string;
}

/**
 * Formatted date time type
 */
export class FormattedDateTimeType {
  constructor({ dateTimeString, format }: { dateTimeString: string; format: string }) {
    this.dateTimeString = dateTimeString;
    this.format = format;
  }

  dateTimeString: string;
  format: string;
}

/**
 * Line status code
 */
export class LineStatusCodeType {
  constructor({ value }: { value: string }) {
    this.value = value;
  }

  value: string;
}

/**
 * Party role code
 */
export class PartyRoleCodeType {
  constructor({ value }: { value: string }) {
    this.value = value;
  }

  value: string;
}

/**
 * Payment means code
 */
export class PaymentMeansCodeType {
  constructor({ value }: { value: string }) {
    this.value = value;
  }

  value: string;
}

/**
 * Reference code
 */
export class ReferenceCodeType {
  constructor({ value }: { value: string }) {
    this.value = value;
  }

  value: string;
}

/**
 * Tax category code
 */
export class TaxCategoryCodeType {
  constructor({ value }: { value: string }) {
    this.value = value;
  }

  value: string;
}

/**
 * Tax type code
 */
export class TaxTypeCodeType {
  constructor({ value }: { value: string }) {
    this.value = value;
  }

  value: string;
}

/**
 * Time reference code
 */
export class TimeReferenceCodeType {
  constructor({ value }: { value: string }) {
    this.value = value;
  }

  value: string;
}

/**
 * Transport mode code
 */
export class TransportModeCodeType {
  constructor({ value }: { value: string }) {
    this.value = value;
  }

  value: string;
} 