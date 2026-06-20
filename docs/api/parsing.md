# Parsing & serializing

Beyond moving XML in and out of PDFs, the library can turn an invoice **XML into a fully-typed
model** and back. This is what you want when you need to *read* invoice data programmatically or
*build* an invoice in memory.

- [`xmlToInvoice(xml)`](#xmltoinvoice) — XML → `CrossIndustryInvoiceType`
- [`invoiceToXml(invoice)`](#invoicetoxml) — `CrossIndustryInvoiceType` → XML

The model classes themselves are documented on the [Models](/api/models) page.

## `xmlToInvoice()`

```ts
function xmlToInvoice(xml: string | Buffer): Promise<CrossIndustryInvoiceType>
```

Parses a Factur-X XML document into a `CrossIndustryInvoiceType` instance. Every aggregate emitted
by [`invoiceToXml`](#invoicetoxml) is read back, so the two are mirror images.

<<< ../../examples/parse.ts#main{ts}

Throws `Invalid XML: no root element` if the input has no document root.

## `invoiceToXml()`

```ts
function invoiceToXml(invoice: CrossIndustryInvoiceType): Promise<XMLDocument>
```

Serializes a `CrossIndustryInvoiceType` model back to XML. Element order follows the `xs:sequence`
of the Factur-X 1.09 (CII D22B) **EXTENDED** schema — a superset of all lower profiles — and only
fields present on the model are emitted, so the same converter produces valid output for every
profile from `MINIMUM` to `EXTENDED`.

The return value is a `libxmljs` `XMLDocument`; call `.toString()` for the serialized XML.

```ts
import { invoiceToXml } from '@stafyniaksacha/facturx'

const doc = await invoiceToXml(invoice)
const xmlString = doc.toString()
```

## Round-trip

Because the parser and converter mirror each other, you can read, modify and re-serialize:

<<< ../../examples/roundtrip.ts#main{ts}

To build an invoice from scratch (rather than parsing one), see [Models](/api/models).

## See also

- [Models](/api/models) — the `CrossIndustryInvoiceType` tree and how to construct it
- [`generate()`](/api/generate) — embed the serialized XML into a PDF
