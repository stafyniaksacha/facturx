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
  preserveXmlBytes?: boolean
}): Promise<Uint8Array>
```

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `pdf` | `string \| Buffer \| PDFDocument` | — | **Required.** Source PDF as bytes (`Buffer`), a base64 string, or a `pdf-lib` document. **Not a file path**: read the file first. |
| `xml` | `string \| Buffer \| XmlDocument` | — | **Required.** Invoice XML to embed (the XML content, not a file path). |
| `check` | `boolean` | `false` | Set `true` to run XSD validation before embedding; throws on invalid XML. |
| `flavor` | `string` | autodetect | `facturx` or `orderx`. `zugferd` (extraction only) throws. |
| `level` | `string` | autodetect | Schema level (e.g. `en16931`). When given, it must name the profile the XML's guideline ID (BT-24) declares, so it is a check, not an override. Factur-X: `minimum`, `basicwl`, `basic`, `en16931`, `extended`; Order-X: `basic`, `comfort`, `extended`. Case, spaces and underscores are ignored, so `EN 16931` or `BASIC WL` work too, and any other value throws (BR-HYBRID-07). |
| `language` | `string` | — | PDF language code (RFC 3066), e.g. `en-GB`. |
| `meta` | `PdfMetadata` | derived from XML | Override the PDF document metadata. |
| `afRelationship` | `'Data' \| 'Alternative' \| 'Source'` | `'Data'` | Relationship between the embedded XML and the PDF (see below). |
| `preserveXmlBytes` | `boolean` | `false` | Embed the `xml` bytes exactly as given instead of re-serializing them (see below). |

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
  PDF/A-3 XMP metadata. `fx:DocumentType` is `INVOICE` for Factur-X; for Order-X it follows the
  message type code (`220` → `ORDER`, `230` → `ORDER_CHANGE`, `231` → `ORDER_RESPONSE`), and any
  other code throws `Cannot generate an Order-X PDF for the message type code …` before the PDF is
  read. `fx:ConformanceLevel` is the level's hybrid code (Factur-X `MINIMUM` … `EXTENDED`, Order-X
  `BASIC` / `COMFORT` / `EXTENDED`).
  ::: warning Order-X XMP namespace
  Order-X PDFs use the same `fx:` namespace URI as Factur-X
  (`urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#`). The Order-X specification is not
  vendored here, so that URI is not checked against it (CONFORMANCE.md CG-10).
  :::
- Writes the embedded XML with the `afRelationship` you pass, `Data` by default. Factur-X allows only `Data` for MINIMUM and BASIC WL, and `Alternative`,
  `Source` or `Data` for BASIC, EN 16931 and EXTENDED. `generate()` throws
  `afRelationship "<value>" is not allowed for the <level> profile` for the former, and
  `Invalid afRelationship` for any other value. `Data` is valid for every profile in France; for
  Germany, pass `Alternative` for BASIC and above (not enforced). Order-X is not restricted.
- By default the XML is parsed and re-serialized by libxml2 before it is embedded: the content is
  the same, but a BOM, the XML declaration's quotes and case, and CRLF line endings are not kept.
  With `preserveXmlBytes: true` the bytes you pass are embedded unchanged (a `string` as UTF-8, a
  `Buffer` as is), so a hash or signature taken over the issued XML still matches the embedded
  copy. The XML is still parsed, and validated with `check: true`, from those same bytes. It throws
  for an `XmlDocument` (it has no original bytes), for XML with a DOCTYPE (`preserveXmlBytes refuses
  XML with a DOCTYPE`), and for an XML declaration naming a version other than 1.0 or an encoding
  other than UTF-8. CLI: `--preserveXmlBytes`.
- When `meta` is omitted, the title/author/subject are derived from the invoice XML (the subject
  carries the issue date, BT-2) and the Info, XMP and embedded-file dates are the generation time,
  in UTC. A `meta.date` you pass is used for all of them instead.
- Keeps the source PDF's document ID: the first (permanent) element of the trailer `/ID` is
  preserved and a new second (changing) element is written, as the PDF standard requires for a
  modified file. A PDF without an `/ID` gets a new one.
- Keeps the embedded files name tree sorted.
- Throws `Invalid XML format (<flavor> - <level>)` when `check` is enabled and validation fails, and
  `Unknown schema flavor` for an unrecognised flavor. An explicit `flavor` that contradicts the XML
  root element (an invoice as `orderx`, an order as `facturx`) throws `The XML root element … does not
  match the … flavor`.
- Throws `Cannot generate the "zugferd" flavor: …` for `flavor: 'zugferd'` or a ZUGFeRD 1.0
  (`CrossIndustryDocument`) XML, whatever the flavor option, before reading the PDF. The `zugferd-invoice.xml` filename and the
  `zf:` XMP schema are the deprecated ZUGFeRD 2.0 legacy settings, and the filename is
  not in the hybrid filename code list. A ZUGFeRD 2.x invoice is a Factur-X
  `CrossIndustryInvoice`: generate it as `facturx`.
- Throws `Unknown level "<level>" for the <flavor> flavor: expected one of …`, before reading the
  PDF, when the level (the `level` option, or the one read from the guideline ID BT-24 when it is
  omitted or blank) has no Factur-X / Order-X conformance level for the flavor, so
  `fx:ConformanceLevel` is never written empty (BR-HYBRID-07).
- Throws `level "<level>" does not match the profile declared by the document ("<declared>")`, before
  reading the PDF, when an explicit `level` differs from the profile of the guideline ID (BT-24), so
  `fx:ConformanceLevel` always describes the embedded XML (BR-HYBRID-15). An explicit `level` on a
  document whose BT-24 names no known level throws `Unknown level`.
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
| `The PDF already has an embedded invoice (<filename>)` | The source already embeds an invoice XML. It is detected from the XML root element whatever the file name, in the attachment list, the document and page associated files (`/AF`) and file attachment annotations, and also by a known invoice file name (`factur-x.xml`, `xrechnung.xml`, ZUGFeRD names). Only one invoice XML is allowed per document: start from the plain PDF. For Order-X the message says `order`. Other XML attachments, such as a supporting purchase order, are allowed. Detection is best effort: an invoice whose content can't be read and whose name isn't recognised can be missed. |
| `The PDF already has an embedded file named <filename>` | An attachment already uses the file name `generate()` is about to write (e.g. `factur-x.xml`), even if it isn't an invoice. |
| `The PDF has more than 256 distinct embedded file streams: …` / `The PDF's embedded files are too large to check for an existing invoice` | Too many or too large attachments to inspect safely (limits: 256 distinct streams, 128 MiB decompressed). The PDF is rejected rather than accepted unchecked. |
| `The PDF has more than 65536 page tree nodes: …` / `… 65536 annotations: …` / `… 1048576 page tree, annotation and /AF entries: …` / `The PDF has a page tree deeper than 256 levels: …` | Too large or too deep a page tree, too many annotations, or too many entries in their arrays to scan for an attached invoice. The PDF is rejected rather than accepted unchecked. |
| `Malformed page tree: a page tree node is reached twice` | The page tree has a cycle or lists a node twice (each node should have a single parent). `pdf-lib`'s `addPage()` with an existing page produces such a file; add a copy of the page instead (`copyPages`). |
| `This PDFDocument was already passed to generate(): load a new one for each call` | The same `pdf-lib` `PDFDocument` object was passed again, even if the earlier call failed. Load the PDF again for each call. |
| `PDFs whose embedded files name tree has /Kids are not supported` | The source's attachments use a multi-level name tree, which `pdf-lib` cannot append to correctly. |
| `Malformed EmbeddedFiles name tree: …` | The source's attachment list is corrupt (e.g. a name without a value). |
| `Unsupported EmbeddedFiles name tree: …` | The source's attachment list has more than two `/Kids` levels or more than 4096 nodes. |

## Supplying the PDF base

Factur-X requires the hybrid document to be PDF/A-3 (or PDF/A-4f). `generate()` only
attaches the XML as an associated file, sets the Info dictionary and writes the PDF/A-3 + Factur-X XMP
metadata. It does **not** embed fonts, add an output intent or fix anything else PDF/A needs, so the
PDF you pass must already be PDF/A-3 (PDF/A-3b at least). Produce it with your PDF tool's PDF/A
export, or see the repo's `tests/generate/index.ts` for a `pdf-lib` base with an embedded font and an
sRGB output intent.

`generate()` does not touch what makes a PDF PDF/A, with two exceptions: it replaces the base's XMP
with the Factur-X one, which carries the PDF/A-3B identification, and it writes a trailer `/ID`. So a
base may lack exactly those two, but must meet every other PDF/A-3b requirement (embedded fonts and an
output intent are only part of them: no JavaScript, no encryption, …).

CI checks this with veraPDF on one `pdf-lib` test base (an embedded font and an sRGB output intent,
nothing else on the page), for every Factur-X profile (`scripts/verify-pdfa.mjs`): the base with its
own XMP and `/ID` is PDF/A-3b and stays so, and the same base without them comes out PDF/A-3b. That
proves it for this base, not for every PDF you might pass.

A base that misses any other requirement gives output that is not PDF/A, yet whose XMP still declares
PDF/A-3B. Validate your own output with a PDF/A validator such as veraPDF.

## Example

This is a real, runnable script from the repo's
[`examples/`](https://github.com/stafyniaksacha/facturx/tree/main/examples) — it reads the bundled
fixtures and embeds the XML:

<<< ../../examples/generate.ts#main{ts}

## See also

- CLI equivalent: [`facturx generate`](/cli/generate)
- [`extract()`](/api/extract) — the inverse operation
