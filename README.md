# Factur-X and Order-X JS library

Generate and extract Factur-X and Order-X invoices in TypeScript, using [pdf-lib](https://github.com/Hopding/pdf-lib) and [libxmljs](https://github.com/libxmljs/libxmljs).

## Usage

### CLI

```bash
# Usage (Node.js)
npx @stafyniaksacha/facturx --help

# Usage (Bun)
bunx @stafyniaksacha/facturx --help
```

```bash
# Generate a Factur-X/Order-X PDF-A/3 invoice
npx @stafyniaksacha/facturx generate \
  --pdf input.pdf \
  --xml input.xml \
  --output output.pdf

# Extract a Factur-X/Order-X XML from a PDF
npx @stafyniaksacha/facturx extract input.pdf > output.xml

# Check a Factur-X/Order-X XML file, display validation errors
npx @stafyniaksacha/facturx check input.xml \
  --flavor facturx \ # autodetects the flavor if not provided
  --level en16931 # autodetects the level if not provided
```

### Node.js

```bash
npm install @stafyniaksacha/facturx
```

```typescript
import { readFile } from 'node:fs/promises'

import { check, extract, generate } from '@stafyniaksacha/facturx'

const pdf = await readFile('/path/to/input.pdf')
const xml = await readFile('/path/to/input.xml')

// Generate a Factur-X/Order-X PDF-A/3 invoice
const buffer = await generate({
  pdf, // string, buffer or PDFDocument
  xml, // string, buffer or XMLDocument

  // Optional
  check: true, // set to false to disable the check
  flavor: 'facturx', // autodetects the flavor if not provided
  level: 'en16931', // autodetects the level if not provided
  language: 'en-GB',
  meta: { // extracted from xml if not provided
    author: 'John Doe',
    title: 'John Doe',
    subject: 'John Doe',
    keywords: ['John', 'Doe'],
    date: new Date(),
  },
})

// Extract a Factur-X/Order-X XML from a PDF
const { filename, xml, flavor, level } = await extract({
  pdf, // string, buffer or PDFDocument

  // Optional
  check: true, // set to false to disable the check
  flavor: 'facturx', // autodetects the flavor if not provided
  level: 'en16931', // autodetects the level if not provided
})

// Validate a Factur-X/Order-X XML against the XSD (and optionally Schematron)
const { valid, errors, flavor, level, schematronValid, schematronErrors } = await check({
  xml, // string, buffer or XMLDocument

  // Optional
  flavor: 'facturx', // autodetects the flavor if not provided
  level: 'en16931', // autodetects the level if not provided
  schematron: true, // also run EN16931/Factur-X business rules (facturx only); default false
})
```

`check` validates the XML structure against the Factur-X 1.09 (ZUGFeRD 2.5) XSD. With
`schematron: true` it additionally runs the official compiled Schematron (EN16931 `BR-*`
business rules and code-list checks), returning `schematronValid` and `schematronErrors`.
You can also call `validateSchematron({ xml, flavor: 'facturx', level })` directly.

```typescript
import { invoiceToXml } from '@stafyniaksacha/facturx'
import {
  AmountType,
  CountryIDType,
  CrossIndustryInvoiceType,
  CurrencyCodeType,
  DateTimeType,
  DocumentCodeType,
  DocumentContextParameterType,
  ExchangedDocumentContextType,
  ExchangedDocumentType,
  HeaderTradeAgreementType,
  HeaderTradeDeliveryType,
  HeaderTradeSettlementType,
  IDType,
  SupplyChainTradeTransactionType,
  TaxCategoryCodeType,
  TaxTypeCodeType,
  TextType,
  TradeAddressType,
  TradePartyType,
  TradeSettlementHeaderMonetarySummationType,
  TradeTaxType,
} from '@stafyniaksacha/facturx/models'

// Create a FacturX model (minimum version)
const guidelineID = new IDType({ value: 'urn:factur-x.eu:1p0:minimum' })
const guidelineParameter = new DocumentContextParameterType({ id: guidelineID })
const documentContext = new ExchangedDocumentContextType({
  guidelineSpecifiedDocumentContextParameter: guidelineParameter
})

// Document
const invoiceID = new IDType({ value: 'INV-2023-001' })
const typeCode = new DocumentCodeType({ value: '380' })
const issueDT = new DateTimeType({ dateTimeString: '20230415', format: '102' })
const document = new ExchangedDocumentType({
  id: invoiceID,
  typeCode,
  issueDateTime: issueDT
})

// Seller and buyer
const sellerName = new TextType({ value: 'Acme Corporation' })
const sellerAddress = new TradeAddressType({
  countryID: new CountryIDType({ value: 'FR' })
})
const sellerParty = new TradePartyType({
  name: sellerName,
  postalTradeAddress: sellerAddress
})

const buyerName = new TextType({ value: 'Sample Customer' })
const buyerAddress = new TradeAddressType({
  countryID: new CountryIDType({ value: 'FR' })
})
const buyerParty = new TradePartyType({
  name: buyerName,
  postalTradeAddress: buyerAddress
})

// Trade agreement
const tradeAgreement = new HeaderTradeAgreementType({
  sellerTradeParty: sellerParty,
  buyerTradeParty: buyerParty
})

// Trade delivery
const tradeDelivery = new HeaderTradeDeliveryType({})

// Trade settlement
const currencyCode = new CurrencyCodeType({ value: 'EUR' })
const tradeTax = new TradeTaxType({
  categoryCode: new TaxCategoryCodeType({ value: 'S' }),
  typeCode: new TaxTypeCodeType({ value: 'VAT' }),
  rateApplicablePercent: { value: 20 }
})

const taxBasisTotalAmount = new AmountType({ value: 100, currencyID: 'EUR' })
const taxTotalAmount = new AmountType({ value: 20, currencyID: 'EUR' })
const grandTotalAmount = new AmountType({ value: 120, currencyID: 'EUR' })
const duePayableAmount = new AmountType({ value: 120, currencyID: 'EUR' })

const summation = new TradeSettlementHeaderMonetarySummationType({
  lineTotalAmount: new AmountType({ value: 100, currencyID: 'EUR' }),
  taxBasisTotalAmount, // single amount (BT-109)
  taxTotalAmount: [taxTotalAmount], // 0..2 amounts (BT-110/111)
  grandTotalAmount, // single amount (BT-112)
  duePayableAmount
})

const tradeSettlement = new HeaderTradeSettlementType({
  invoiceCurrencyCode: currencyCode,
  applicableTradeTax: [tradeTax],
  specifiedTradeSettlementHeaderMonetarySummation: summation
})

const transaction = new SupplyChainTradeTransactionType({
  applicableHeaderTradeAgreement: tradeAgreement,
  applicableHeaderTradeDelivery: tradeDelivery,
  applicableHeaderTradeSettlement: tradeSettlement
})

const invoice = new CrossIndustryInvoiceType({
  exchangedDocumentContext: documentContext,
  exchangedDocument: document,
  supplyChainTradeTransaction: transaction
})

// Convert the model to XML
const xml = await invoiceToXml(invoice)
const xmlString = xml.toString()
```

## Usefull links

- https://fnfe-mpe.org/factur-x/
- https://fnfe-mpe.org/factur-x/order-x/

## License

Based on original work of [`akretion/factur-x`](https://github.com/akretion/factur-x) python library by [`Alexis de Lattre`](https://github.com/alexis-via)
