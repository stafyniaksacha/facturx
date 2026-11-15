# `extract()`

Extract the embedded XML invoice from a Factur-X / Order-X / ZUGFeRD PDF.

## Signature

```ts
function extract(options: {
  pdf: string | Buffer | PDFDocument
  check?: boolean
  flavor?: string
  level?: string
}): Promise<{
  filename: string
  xml: string
  bytes: Uint8Array
  flavor?: string
  level?: string
}>
```

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `pdf` | `string \| Buffer \| PDFDocument` | — | **Required.** The PDF to read, as bytes (`Buffer`), a base64 string, or a `pdf-lib` document. **Not a file path.** |
| `check` | `boolean` | `false` | Set `true` to XSD-validate the extracted XML; throws `Invalid XML` on failure. |
| `flavor` | `string` | autodetect | Assert an expected flavor; mismatches throw. |
| `level` | `string` | autodetect | Schema level used for the validation step. |

## Returns

| Field | Type | Description |
| --- | --- | --- |
| `filename` | `string` | The embedded attachment filename (e.g. `factur-x.xml`). |
| `xml` | `string` | The extracted XML as a string, re-serialized by libxml2 (a BOM, the declaration's quotes and CRLF line endings are not kept). |
| `bytes` | `Uint8Array` | The attachment exactly as embedded in the PDF (only its stream compression undone). Use it to check a hash or signature over the issued XML. CLI: `--raw`. |
| `flavor` | `string?` | The detected (or asserted) flavor. |
| `level` | `string?` | The `level` option, echoed back. It is **not** detected from the XML. |

## Behaviour

- Scans the PDF attachments for a recognised e-invoice filename (`factur-x.xml`, `xrechnung.xml`,
  `order-x.xml`, or a ZUGFeRD filename) and returns the first match. `xrechnung.xml` (reference
  profile XRECHNUNG) is reported as flavor `facturx`, but `check()` does not know the
  XRECHNUNG level yet.
- Reads the attachment list whether it is a flat name tree or has one or two `/Kids` levels.
  Deeper trees, trees with more than 4096 nodes and corrupt trees throw
  `Unsupported EmbeddedFiles name tree: …` or `Malformed EmbeddedFiles name tree: …`.
- The flavor is inferred from the attachment filename. Passing `flavor` asserts an expectation:
  e.g. `flavor: 'facturx'` throws `Invalid flavor, expected facturx but found orderx` if the PDF
  actually contains an Order-X file.
- Does not detect the level. `level` in the result is the option you passed (or `undefined`); call
  [`check()`](/api/check) on the extracted XML to get the detected level.
- Matches on names only, so no other attachment is decoded: the name tree keys first, in tree
  order, then, when no key is a recognised name, each file specification's `/F` and `/UF`.
  `filename` is the name that matched.
- Decodes the matching attachment once, with its `/Filter` chain (`FlateDecode`, `LZWDecode`,
  `ASCII85Decode`, `ASCIIHexDecode`, `RunLengthDecode`), and throws
  `The embedded file <name> is too large: more than 128 MiB once decoded` past that size. A matching
  file specification without an embedded stream throws `Malformed embedded file <name>: …`; another
  filter, a `/Predictor` or corrupt data throws `Cannot decode the embedded file <name>: …`.
- Throws `No attachment found` when no recognised XML is present.
- Throws `Malformed EmbeddedFiles name tree: …` when the PDF's attachment list is corrupt (for
  example a name without a value), instead of an internal `pdf-lib` error.
- Validation is **off by default**; pass `check: true` to XSD-validate the extracted XML (`Invalid
  XML` is thrown on failure).
- With `check: true`, an attachment under a ZUGFeRD filename (`zugferd-invoice.xml`,
  `ZUGFeRD-invoice.xml`) is validated by what its root element is, while `flavor` in the result stays
  `zugferd`. A ZUGFeRD 2.x `CrossIndustryInvoice` is validated as `facturx`. A ZUGFeRD 1.0
  `CrossIndustryDocument` throws `ZUGFeRD 1.0 validation is not supported…`, since no ZUGFeRD 1.0
  schema is shipped; extract it with `check: false`. An Order-X order under that name throws.

## Example

<<< ../../examples/extract.ts#main{ts}

```ts
// Require the PDF to be Factur-X, and XSD-validate the extracted XML
const { xml } = await extract({ pdf, flavor: 'facturx', check: true })
```

## See also

- CLI equivalent: [`facturx extract`](/cli/extract)
- [`xmlToInvoice()`](/api/parsing) — turn the extracted XML into a typed model
- [`generate()`](/api/generate) — the inverse operation
