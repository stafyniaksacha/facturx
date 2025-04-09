/**
 * UnqualifiedDataType classes for Factur-X
 * Based on urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100
 */

/**
 * Represents a monetary amount with optional currency
 */
export class AmountType {
  constructor({ value, currencyID }: { value: number; currencyID?: string }) {
    this.value = value;
    this.currencyID = currencyID;
  }

  value: number;
  currencyID?: string;
}

/**
 * Represents binary data with required MIME type and filename
 */
export class BinaryObjectType {
  constructor({ value, mimeCode, filename }: { value: string; mimeCode: string; filename: string }) {
    this.value = value;
    this.mimeCode = mimeCode;
    this.filename = filename;
  }

  value: string;
  mimeCode: string;
  filename: string;
}

/**
 * Represents a code with optional list identification
 */
export class CodeType {
  constructor({ value, listID, listVersionID }: { value: string; listID?: string; listVersionID?: string }) {
    this.value = value;
    this.listID = listID;
    this.listVersionID = listVersionID;
  }

  value: string;
  listID?: string;
  listVersionID?: string;
}

/**
 * Represents a datetime with format
 */
export class DateTimeType {
  constructor({ dateTimeString, format }: { dateTimeString: string; format: string }) {
    this.dateTimeString = dateTimeString;
    this.format = format;
  }

  dateTimeString: string;
  format: string;
}

/**
 * Represents a date with format
 */
export class DateType {
  constructor({ dateString, format }: { dateString: string; format: string }) {
    this.dateString = dateString;
    this.format = format;
  }

  dateString: string;
  format: string;
}

/**
 * Represents an identifier with optional scheme
 */
export class IDType {
  constructor({ value, schemeID }: { value: string; schemeID?: string }) {
    this.value = value;
    this.schemeID = schemeID;
  }

  value: string;
  schemeID?: string;
}

/**
 * Represents a boolean indicator
 */
export class IndicatorType {
  constructor({ indicator }: { indicator: boolean }) {
    this.indicator = indicator;
  }

  indicator: boolean;
}

/**
 * Represents a measure with optional unit code
 */
export class MeasureType {
  constructor({ value, unitCode }: { value: number; unitCode?: string }) {
    this.value = value;
    this.unitCode = unitCode;
  }

  value: number;
  unitCode?: string;
}

/**
 * Represents a numeric value
 */
export class NumericType {
  constructor({ value }: { value: number }) {
    this.value = value;
  }

  value: number;
}

/**
 * Represents a percentage value
 */
export class PercentType {
  constructor({ value }: { value: number }) {
    this.value = value;
  }

  value: number;
}

/**
 * Represents a quantity with optional unit code
 */
export class QuantityType {
  constructor({ value, unitCode }: { value: number; unitCode?: string }) {
    this.value = value;
    this.unitCode = unitCode;
  }

  value: number;
  unitCode?: string;
}

/**
 * Represents a rate value
 */
export class RateType {
  constructor({ value }: { value: number }) {
    this.value = value;
  }

  value: number;
}

/**
 * Represents text content
 */
export class TextType {
  constructor({ value }: { value: string }) {
    this.value = value;
  }

  value: string;
} 