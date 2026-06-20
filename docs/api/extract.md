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
  flavor?: string
  level?: string
}>
```

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `pdf` | `string \| Buffer \| PDFDocument` | — | **Required.** The PDF to read. |
| `check` | `boolean` | `true` | XSD-validate the extracted XML; throws `Invalid XML` on failure. |
| `flavor` | `string` | autodetect | Assert an expected flavor; mismatches throw. |
| `level` | `string` | autodetect | Schema level used for the validation step. |

## Returns

| Field | Type | Description |
| --- | --- | --- |
| `filename` | `string` | The embedded attachment filename (e.g. `factur-x.xml`). |
| `xml` | `string` | The extracted XML as a string. |
| `flavor` | `string?` | The detected (or asserted) flavor. |
| `level` | `string?` | The level, if provided. |

## Behaviour

- Scans the PDF attachments for a recognised e-invoice filename (`factur-x.xml`, `order-x.xml`, or a
  ZUGFeRD filename) and returns the first match.
- The flavor is inferred from the attachment filename. Passing `flavor` asserts an expectation:
  e.g. `flavor: 'facturx'` throws `Invalid flavor, expected facturx but found orderx` if the PDF
  actually contains an Order-X file.
- Throws `No attachment found` when no recognised XML is present.
- With `check: true` (default), the XML is XSD-validated and `Invalid XML` is thrown on failure.

## Example

<<< ../../examples/extract.ts#main{ts}

```ts
// Skip validation, and only accept a Factur-X document
const { xml } = await extract({ pdf, flavor: 'facturx', check: false })
```

## See also

- CLI equivalent: [`facturx extract`](/cli/extract)
- [`xmlToInvoice()`](/api/parsing) — turn the extracted XML into a typed model
- [`generate()`](/api/generate) — the inverse operation
