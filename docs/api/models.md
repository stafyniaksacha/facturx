# Models

The model classes describe a UN/CEFACT **Cross Industry Invoice (CII D22B)** in TypeScript. They
cover the full **EXTENDED** profile — parties, addresses and contacts, referenced documents and
attachments, delivery, payment means (IBAN/BIC), allowances/charges, payment terms, taxes, line
items and product details. You only populate the fields relevant to your target
[profile](/guide/profiles-and-flavors).

## Importing

The classes are exposed two ways:

```ts
// 1. As a namespace from the main entry
import { Models } from '@stafyniaksacha/facturx'
const id = new Models.IDType({ value: 'INV-2023-001' })

// 2. Individually from the /models subpath
import { CrossIndustryInvoiceType, IDType } from '@stafyniaksacha/facturx/models'
```

## Structure

The model is grouped into four families (mirroring the CII namespaces):

| Group | What it holds | XML namespace |
| --- | --- | --- |
| **Cross Industry Invoice** | The top-level document and header aggregates: `CrossIndustryInvoiceType`, `ExchangedDocumentContextType`, `ExchangedDocumentType`, `SupplyChainTradeTransactionType`, `HeaderTradeAgreementType`, `HeaderTradeDeliveryType`, `HeaderTradeSettlementType`. | `rsm` |
| **Reusable (aggregate) types** | Business entities reused across the document: `TradePartyType`, `TradeAddressType`, `TradeTaxType`, `TradeSettlementHeaderMonetarySummationType`, line items, etc. | `ram` |
| **Qualified types** | Code-list-backed types such as `CountryIDType`, `CurrencyCodeType`, `DocumentCodeType`, `TaxCategoryCodeType`, `TaxTypeCodeType`. | `qdt` |
| **Unqualified types** | Primitive value wrappers: `IDType`, `TextType`, `AmountType`, `DateTimeType`, etc. | `udt` |

The document tree, roughly:

```text
CrossIndustryInvoiceType
├─ exchangedDocumentContext      (ExchangedDocumentContextType)  → guideline ID = profile
├─ exchangedDocument             (ExchangedDocumentType)         → id, typeCode, issueDateTime
└─ supplyChainTradeTransaction   (SupplyChainTradeTransactionType)
   ├─ applicableHeaderTradeAgreement   → seller / buyer parties
   ├─ applicableHeaderTradeDelivery
   └─ applicableHeaderTradeSettlement  → currency, taxes, monetary summation
```

## Field reference

Every model class and its fields (name, type, required/optional) are documented in the generated
**Model reference**, kept in sync with the TypeScript source:

- [Cross Industry Invoice](/api/models/cross-industry-invoice) — the document & header aggregates (`rsm`)
- [Reusable types](/api/models/reusable-types) — parties, addresses, taxes, line items… (`ram`)
- [Qualified types](/api/models/qualified-types) — code-list-backed types (`qdt`)
- [Unqualified types](/api/models/unqualified-types) — primitive value wrappers (`udt`)

## Building an invoice (MINIMUM profile)

```ts
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

// Profile (guideline) — picks the MINIMUM profile
const documentContext = new ExchangedDocumentContextType({
  guidelineSpecifiedDocumentContextParameter: new DocumentContextParameterType({
    id: new IDType({ value: 'urn:factur-x.eu:1p0:minimum' }),
  }),
})

// Document header
const document = new ExchangedDocumentType({
  id: new IDType({ value: 'INV-2023-001' }),
  typeCode: new DocumentCodeType({ value: '380' }), // 380 = Invoice
  issueDateTime: new DateTimeType({ dateTimeString: '20230415', format: '102' }),
})

// Parties
const sellerParty = new TradePartyType({
  name: new TextType({ value: 'Acme Corporation' }),
  postalTradeAddress: new TradeAddressType({ countryID: new CountryIDType({ value: 'FR' }) }),
})
const buyerParty = new TradePartyType({
  name: new TextType({ value: 'Sample Customer' }),
  postalTradeAddress: new TradeAddressType({ countryID: new CountryIDType({ value: 'FR' }) }),
})

// Settlement: currency, VAT line and totals
const tradeTax = new TradeTaxType({
  categoryCode: new TaxCategoryCodeType({ value: 'S' }),
  typeCode: new TaxTypeCodeType({ value: 'VAT' }),
  rateApplicablePercent: { value: 20 },
})

const summation = new TradeSettlementHeaderMonetarySummationType({
  lineTotalAmount: new AmountType({ value: 100, currencyID: 'EUR' }),
  taxBasisTotalAmount: new AmountType({ value: 100, currencyID: 'EUR' }), // BT-109 (single)
  taxTotalAmount: [new AmountType({ value: 20, currencyID: 'EUR' })], // BT-110/111 (0..2)
  grandTotalAmount: new AmountType({ value: 120, currencyID: 'EUR' }), // BT-112 (single)
  duePayableAmount: new AmountType({ value: 120, currencyID: 'EUR' }),
})

const transaction = new SupplyChainTradeTransactionType({
  applicableHeaderTradeAgreement: new HeaderTradeAgreementType({
    sellerTradeParty: sellerParty,
    buyerTradeParty: buyerParty,
  }),
  applicableHeaderTradeDelivery: new HeaderTradeDeliveryType({}),
  applicableHeaderTradeSettlement: new HeaderTradeSettlementType({
    invoiceCurrencyCode: new CurrencyCodeType({ value: 'EUR' }),
    applicableTradeTax: [tradeTax],
    specifiedTradeSettlementHeaderMonetarySummation: summation,
  }),
})

const invoice = new CrossIndustryInvoiceType({
  exchangedDocumentContext: documentContext,
  exchangedDocument: document,
  supplyChainTradeTransaction: transaction,
})

const xml = (await invoiceToXml(invoice)).toString()
```

::: warning Cardinality (breaking change since 1.09)
On `TradeSettlementHeaderMonetarySummationType`, `taxBasisTotalAmount` (**BT-109**) and
`grandTotalAmount` (**BT-112**) are **single `AmountType` values** (previously arrays), matching the
schema. `taxTotalAmount` (**BT-110/111**) remains an array (`0..2`).
:::

## See also

- [Parsing & serializing](/api/parsing) — `xmlToInvoice` / `invoiceToXml`
- [Profiles & flavors](/guide/profiles-and-flavors) — which fields each profile needs
