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
- Throws `Invalid XML format (<flavor> - <level>)` when `check` is enabled and validation fails, and
  `Unknown schema flavor` for an unrecognised flavor.

## Example

This is a real, runnable script from the repo's
[`examples/`](https://github.com/stafyniaksacha/facturx/tree/main/examples) — it reads the bundled
fixtures and embeds the XML:

<<< ../../examples/generate.ts#main{ts}

## See also

- CLI equivalent: [`facturx generate`](/cli/generate)
- [`extract()`](/api/extract) — the inverse operation
