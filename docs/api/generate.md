# `generate()`

Embed an XML invoice into a PDF and return the resulting hybrid document as bytes. `generate()` does
**not** convert the PDF to PDF/A-3: [supply a PDF/A-3 base](#supplying-the-pdf-base).

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
  afRelationship?: 'Data' | 'Alternative' | 'Source'
}): Promise<Uint8Array>
```

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `pdf` | `string \| Buffer \| PDFDocument` | — | **Required.** Source PDF as bytes (`Buffer`), a base64 string, or a `pdf-lib` document. **Not a file path**: read the file first. |
| `xml` | `string \| Buffer \| XmlDocument` | — | **Required.** Invoice XML to embed (the XML content, not a file path). |
| `check` | `boolean` | `false` | Set `true` to run XSD validation before embedding; throws on invalid XML. |
| `flavor` | `string` | autodetect | `facturx` or `orderx`. `zugferd` (extraction only) throws. |
| `level` | `string` | autodetect | Schema level (e.g. `en16931`). |
| `language` | `string` | — | PDF language code (RFC 3066), e.g. `en-GB`. |
| `meta` | `PdfMetadata` | derived from XML | Override the PDF document metadata. |
| `afRelationship` | `'Data' \| 'Alternative' \| 'Source'` | `'Data'` | Relationship between the embedded XML and the PDF (see below). |

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

`Promise<Uint8Array>` — the bytes of the generated PDF, ready to write to disk or stream.

## Behaviour

- Chooses the embedded filename from the flavor, `factur-x.xml` or `order-x.xml`, and writes the
  PDF/A-3 XMP metadata (including the Factur-X `conformanceLevel` for the level).
  ::: warning Order-X metadata is not conformant yet
  For `orderx`, the XMP still says `fx:DocumentType` `INVOICE` and leaves `fx:ConformanceLevel`
  empty, where the hybrid code lists require `ORDER` / `ORDER_CHANGE` / `ORDER_RESPONSE` and
  `BASIC` / `COMFORT` / `EXTENDED` (BR-HYBRID-06/07, Fatal). See CG-08 in
  [`CONFORMANCE.md`](https://github.com/stafyniaksacha/facturx/blob/main/CONFORMANCE.md).
  :::
- Writes the embedded XML with the `afRelationship` you pass, `Data` by default. Factur-X §6.2.2
  (table p.27, BR-HYBRID-11) allows only `Data` for MINIMUM and BASIC WL, and `Alternative`,
  `Source` or `Data` for BASIC, EN 16931 and EXTENDED. `generate()` throws
  `afRelationship "<value>" is not allowed for the <level> profile` for the former, and
  `Invalid afRelationship` for any other value. `Data` is valid for every profile in France; for
  Germany, pass `Alternative` for BASIC and above (not enforced). Order-X is not restricted.
- When `meta` is omitted, the title/author/subject/date are derived from the invoice XML.
- Keeps the source PDF's document ID: the first (permanent) element of the trailer `/ID` is
  preserved and a new second (changing) element is written, as ISO 32000-1 §14.4 requires for a
  modified file. A PDF without an `/ID` gets a new one.
- Keeps the embedded files name tree sorted.
- Throws `Invalid XML format (<flavor> - <level>)` when `check` is enabled and validation fails, and
  `Unknown schema flavor` for an unrecognised flavor.
- Throws `Cannot generate the "zugferd" flavor: …` for `flavor: 'zugferd'` or a ZUGFeRD 1.0
  (`CrossIndustryDocument`) XML, whatever the flavor option, before reading the PDF. The `zugferd-invoice.xml` filename and the
  `zf:` XMP schema are the deprecated ZUGFeRD 2.0 legacy settings (§6.3.2 p.29), and the filename is
  not in the hybrid filename code list (BR-HYBRID-08/13). A ZUGFeRD 2.x invoice is a Factur-X
  `CrossIndustryInvoice`: generate it as `facturx`.
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
| `Unsupported EmbeddedFiles name tree: …` | The source's attachment list has more than two `/Kids` levels or more than 4096 nodes. |

## Supplying the PDF base

Factur-X requires the hybrid document to be PDF/A-3 (or PDF/A-4f), BR-HYBRID-02. `generate()` only
attaches the XML as an associated file, sets the Info dictionary and writes the PDF/A-3 + Factur-X XMP
metadata. It does **not** embed fonts, add an output intent or fix anything else PDF/A needs, so the
PDF you pass must already be PDF/A-3 (PDF/A-3b at least). Produce it with your PDF tool's PDF/A
export, or see the repo's `tests/generate/index.ts` for a `pdf-lib` base with an embedded font and an
sRGB output intent.

Given a PDF/A-3b base, the output stayed PDF/A-3b in a manual veraPDF run on every Factur-X profile.
No automated test checks this yet; see CG-05 in
[`CONFORMANCE.md`](https://github.com/stafyniaksacha/facturx/blob/main/CONFORMANCE.md). Validate your
own output with a PDF/A validator such as veraPDF.

## Example

This is a real, runnable script from the repo's
[`examples/`](https://github.com/stafyniaksacha/facturx/tree/main/examples) — it reads the bundled
fixtures and embeds the XML:

<<< ../../examples/generate.ts#main{ts}

## See also

- CLI equivalent: [`facturx generate`](/cli/generate)
- [`extract()`](/api/extract) — the inverse operation
