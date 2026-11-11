# `generate()`

Embed an XML invoice into a PDF and return a compliant **PDF/A-3** as bytes.

## Signature

```ts
function generate(options: {
  pdf: string | Buffer | PDFDocument
  xml: string | Buffer | XmlDocument
  check?: boolean
  flavor?: string
  level?: string
  language?: string
  meta?: PdfMetadata
}): Promise<Uint8Array>
```

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `pdf` | `string \| Buffer \| PDFDocument` | — | **Required.** Source PDF (path/bytes already read, or a `pdf-lib` document). |
| `xml` | `string \| Buffer \| XmlDocument` | — | **Required.** Invoice XML to embed. |
| `check` | `boolean` | `false` | Set `true` to run XSD validation before embedding; throws on invalid XML. |
| `flavor` | `string` | autodetect | `facturx`, `orderx` or `zugferd`. |
| `level` | `string` | autodetect | Schema level (e.g. `en16931`). |
| `language` | `string` | — | PDF language code (RFC 3066), e.g. `en-GB`. |
| `meta` | `PdfMetadata` | derived from XML | Override the PDF document metadata. |

`PdfMetadata`:

```ts
interface PdfMetadata {
  author: string
  title: string
  subject: string
  keywords: string[]
  date: Date
}
```

## Returns

`Promise<Uint8Array>` — the bytes of the generated PDF/A-3, ready to write to disk or stream.

## Behaviour

- Chooses the embedded filename from the flavor: `factur-x.xml`, `order-x.xml` or
  `zugferd-invoice.xml`, and writes the matching PDF/A-3 XMP metadata (including the Factur-X
  `conformanceLevel` for the level).
- When `meta` is omitted, the title/author/subject/date are derived from the invoice XML.
- Keeps the source PDF's permanent document ID (the first trailer `/ID` element) and writes a new
  second element. A source without an `/ID` gets a new one.
- Keeps the embedded files name tree sorted.
- Throws `Invalid XML format (<flavor> - <level>)` when `check` is enabled and validation fails, and
  `Unknown schema flavor` for an unrecognised flavor.
- Throws, before changing anything, when the source PDF cannot take the invoice correctly:
  - it is encrypted, or signed (sign the PDF after `generate()`);
  - its embedded files name tree is malformed, or has `/Kids` levels;
  - it already embeds an invoice (or an order, when writing Order-X): detected by content, by a
    known invoice filename, or by the filename about to be written. Detection is best effort; see
    CG-14 in `CONFORMANCE.md`;
  - it has more embedded file streams, or more compressed data, than can be checked within bounded
    work (256 distinct streams, 128 MiB inflated);
  - the same `PDFDocument` object was already passed to `generate()`, even if that call failed:
    load a new one for each call.

## Example

This is a real, runnable script from the repo's
[`examples/`](https://github.com/stafyniaksacha/facturx/tree/main/examples) — it reads the bundled
fixtures and embeds the XML:

<<< ../../examples/generate.ts#main{ts}

## See also

- CLI equivalent: [`facturx generate`](/cli/generate)
- [`extract()`](/api/extract) — the inverse operation
