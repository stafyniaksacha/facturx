# `extract`

Extract the embedded XML invoice from a Factur-X / Order-X / ZUGFeRD **PDF/A-3**.

## Synopsis

```bash
facturx extract <pdf> [options]
```

## Arguments

| Argument | Required | Description |
| --- | --- | --- |
| `pdf` | yes | Input PDF/A-3 file (positional). |

## Options

| Option | Alias | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `--check` | | boolean | `true` | Validate the extracted XML (XSD). Use `--no-check` to skip. |
| `--flavor` | `-f` | string | autodetect | Expected `facturx`, `orderx` or `zugferd`. Throws if the PDF's attachment doesn't match. |
| `--level` | `-l` | string | autodetect | Schema level (e.g. `en16931`). |
| `--output` | `-o` | string | stdout | Output XML file. When omitted, the XML is written to **stdout**. |

## Behaviour

- Locates the embedded attachment by filename (`factur-x.xml`, `order-x.xml`, or a ZUGFeRD
  filename) and writes its XML out.
- The flavor is determined from the attachment filename; pass `--flavor` to assert an expectation
  (mismatches throw).
- With `--check` (default), the extracted XML is XSD-validated and the command fails on invalid XML.
- Without `--output`, the XML goes to stdout — convenient for piping or redirection.
- Throws `No attachment found` if the PDF contains no recognised e-invoice XML.

## Examples

```bash
# Print the XML to the terminal
npx @stafyniaksacha/facturx extract facturx.pdf

# Redirect to a file
npx @stafyniaksacha/facturx extract facturx.pdf > factur-x.xml

# Write to a file explicitly, asserting it is a Factur-X document
npx @stafyniaksacha/facturx extract facturx.pdf -o factur-x.xml --flavor facturx

# Extract without validating
npx @stafyniaksacha/facturx extract facturx.pdf --no-check > factur-x.xml
```

## See also

- SDK equivalent: [`extract()`](/api/extract)
- [`check`](/cli/check) to validate the extracted XML
