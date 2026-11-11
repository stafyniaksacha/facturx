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
| `pdf` | `string \| Buffer \| PDFDocument` | — | **Required.** Source PDF as bytes (`Buffer`), a base64 string, or a `pdf-lib` document. **Not a file path**: read the file first. |
| `xml` | `string \| Buffer \| XmlDocument` | — | **Required.** Invoice XML to embed (the XML content, not a file path). |
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
- Keeps the source PDF's document ID: the first (permanent) element of the trailer `/ID` is
  preserved and a new second (changing) element is written, as ISO 32000-1 §14.4 requires for a
  modified file. A PDF without an `/ID` gets a new one.
- Keeps the embedded files name tree sorted.
- Throws `Invalid XML format (<flavor> - <level>)` when `check` is enabled and validation fails, and
  `Unknown schema flavor` for an unrecognised flavor.
- Throws, before writing the invoice, when the source PDF cannot take the invoice correctly: see the
  table below. Bytes you pass are never modified. A `PDFDocument` you pass is marked as used before
  the existing-invoice check, and attachments you queued with `attach()` may already be written into
  its name tree, so load it again after a rejection.

### Source PDFs that are rejected

`generate()` rewrites the whole file and only appends an attachment, so it refuses inputs it cannot
turn into a correct hybrid document instead of producing a broken one:

| Error | Cause |
| --- | --- |
| `Encrypted PDFs are not supported` | The source is encrypted. A Factur-X document must not be encrypted. |
| `Signed PDFs are not supported: sign the document after generate()` | The source has a signed signature field or DocMDP/UR3 permissions. Saving would invalidate the signature; sign the generated PDF instead. |
| `The PDF already has an embedded invoice (<filename>)` | The source already embeds an invoice XML. It is detected from the XML root element whatever the file name, and also by a known invoice file name (`factur-x.xml`, `xrechnung.xml`, ZUGFeRD names). Only one invoice XML is allowed per document: start from the plain PDF. For Order-X the message says `order`. Other XML attachments, such as a supporting purchase order, are allowed. Detection is best effort: an invoice whose content can't be read and whose name isn't recognised can be missed (CG-14 in [`CONFORMANCE.md`](https://github.com/stafyniaksacha/facturx/blob/main/CONFORMANCE.md)). |
| `The PDF already has an embedded file named <filename>` | An attachment already uses the file name `generate()` is about to write (e.g. `factur-x.xml`), even if it isn't an invoice. |
| `The PDF has more than 256 distinct embedded file streams: …` / `The PDF's embedded files are too large to check for an existing invoice` | Too many or too large attachments to inspect safely (limits: 256 distinct streams, 128 MiB decompressed). The PDF is rejected rather than accepted unchecked. |
| `This PDFDocument was already passed to generate(): load a new one for each call` | The same `pdf-lib` `PDFDocument` object was passed again, even if the earlier call failed. Load the PDF again for each call. |
| `PDFs whose embedded files name tree has /Kids are not supported` | The source's attachments use a multi-level name tree, which `pdf-lib` cannot append to correctly. |
| `Malformed EmbeddedFiles name tree: …` | The source's attachment list is corrupt (e.g. a name without a value). |

## Example

This is a real, runnable script from the repo's
[`examples/`](https://github.com/stafyniaksacha/facturx/tree/main/examples) — it reads the bundled
fixtures and embeds the XML:

<<< ../../examples/generate.ts#main{ts}

## See also

- CLI equivalent: [`facturx generate`](/cli/generate)
- [`extract()`](/api/extract) — the inverse operation
