/**
 * UnqualifiedDataType classes for Factur-X
 * Based on urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100
 */

/**
 * A monetary amount, optionally tagged with its ISO 4217 currency.
 * @profile MINIMUM
 */
export class AmountType {
  constructor({ value, currencyID }: { value: number, currencyID?: string }) {
    this.value = value
    this.currencyID = currencyID
  }

  value: number
  currencyID?: string
}

/**
 * An embedded binary attachment (e.g. a supporting document or image) with its MIME type and filename.
 * @profile EN 16931
 */
export class BinaryObjectType {
  constructor({ value, mimeCode, filename }: { value: string, mimeCode: string, filename: string }) {
    this.value = value
    this.mimeCode = mimeCode
    this.filename = filename
  }

  value: string
  mimeCode: string
  filename: string
}

/**
 * A coded value drawn from a code list, optionally identifying the list and its version.
 * @profile BASIC WL
 */
export class CodeType {
  constructor({ value, listID, listVersionID }: { value: string, listID?: string, listVersionID?: string }) {
    this.value = value
    this.listID = listID
    this.listVersionID = listVersionID
  }

  value: string
  listID?: string
  listVersionID?: string
}

/**
 * A date/time value paired with a format code describing how its string is encoded.
 * @profile MINIMUM
 */
export class DateTimeType {
  constructor({ dateTimeString, format }: { dateTimeString: string, format: string }) {
    this.dateTimeString = dateTimeString
    this.format = format
  }

  dateTimeString: string
  format: string
}

/**
 * A date value paired with a format code describing how its string is encoded.
 * @profile EN 16931
 */
export class DateType {
  constructor({ dateString, format }: { dateString: string, format: string }) {
    this.dateString = dateString
    this.format = format
  }

  dateString: string
  format: string
}

/**
 * An identifier value, optionally qualified by the scheme under which it is issued.
 * @profile MINIMUM
 */
export class IDType {
  constructor({ value, schemeID }: { value: string, schemeID?: string }) {
    this.value = value
    this.schemeID = schemeID
  }

  value: string
  schemeID?: string
}

/**
 * A boolean flag.
 * @profile BASIC WL
 */
export class IndicatorType {
  constructor({ indicator }: { indicator: boolean }) {
    this.indicator = indicator
  }

  indicator: boolean
}

/**
 * A measured physical quantity, optionally tagged with its unit of measure.
 * @profile EXTENDED
 */
export class MeasureType {
  constructor({ value, unitCode }: { value: number, unitCode?: string }) {
    this.value = value
    this.unitCode = unitCode
  }

  value: number
  unitCode?: string
}

/**
 * A plain numeric value.
 * @profile EXTENDED
 */
export class NumericType {
  constructor({ value }: { value: number }) {
    this.value = value
  }

  value: number
}

/**
 * A percentage value.
 * @profile BASIC WL
 */
export class PercentType {
  constructor({ value }: { value: number }) {
    this.value = value
  }

  value: number
}

/**
 * A counted quantity, optionally tagged with its unit of measure.
 * @profile BASIC
 */
export class QuantityType {
  constructor({ value, unitCode }: { value: number, unitCode?: string }) {
    this.value = value
    this.unitCode = unitCode
  }

  value: number
  unitCode?: string
}

/**
 * A rate value, such as a currency conversion rate.
 * @profile EXTENDED
 */
export class RateType {
  constructor({ value }: { value: number }) {
    this.value = value
  }

  value: number
}

/**
 * A free-text string value.
 * @profile MINIMUM
 */
export class TextType {
  constructor({ value }: { value: string }) {
    this.value = value
  }

  value: string
}
