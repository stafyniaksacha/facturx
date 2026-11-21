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

Throws `Invalid XML: no root element` if the input has no document root, and
`xmlToInvoice: the document has a DOCTYPE …` for a document with a DOCTYPE, read from the raw prolog (comments and
processing instructions before the root element are accepted; a prolog the reader cannot scan, such as a UTF-16
document, falls back to accepting only comments there). `xmlToInvoice()` honours the encoding of a Buffer (BOM or
declaration), while `check()` and the other validators parse UTF-8 only (CG-78): CII uses no DOCTYPE, and an internal entity, which is
never expanded, would hide the content it stands for from the reader. The error quotes nothing from the document.

## `invoiceToXml()`

```ts
function invoiceToXml(invoice: CrossIndustryInvoiceType): Promise<XmlDocument>
```

Serializes a `CrossIndustryInvoiceType` model back to XML. Element order follows the `xs:sequence`
of the Factur-X 1.09 (CII D22B) **EXTENDED** schema — a superset of all lower profiles — and only
fields present on the model are emitted, so the same converter produces valid output for every
profile from `MINIMUM` to `EXTENDED`.

The return value is a `libxml2-wasm` `XmlDocument`; call `.toString()` for the serialized XML. Its nodes carry the
CII namespaces: namespace-bound XPath works on it, and you can pass it to `check()` as it is. Nothing is parsed, so a
large value (a BT-125 attachment over 10 MB) is written; reading such a document back hits libxml2's default 10 MB
text node limit (CG-76).

```ts
import { invoiceToXml } from '@stafyniaksacha/facturx'

const doc = await invoiceToXml(invoice)
const xmlString = doc.toString()
```

The returned `XmlDocument` holds WebAssembly-allocated memory that is not
garbage-collected. Free it explicitly when you are done:

```ts
doc.dispose()
```

Or use a TypeScript 5.2 `using` declaration to dispose it automatically at the
end of the block:

```ts
using doc = await invoiceToXml(invoice)
// doc is automatically disposed at the end of this block
```

See the [libxml2-wasm memory management docs](https://jameslan.github.io/libxml2-wasm/v0.7/documents/Memory_Management.html#object-disposal) for details.

## Round-trip

Because the parser and converter mirror each other, you can read, modify and re-serialize:

<<< ../../examples/roundtrip.ts#main{ts}

To build an invoice from scratch (rather than parsing one), see [Models](/api/models).

## See also

- [Models](/api/models) — the `CrossIndustryInvoiceType` tree and how to construct it
- [`generate()`](/api/generate) — embed the serialized XML into a PDF
