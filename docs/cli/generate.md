# `generate`

Generate a Factur-X / Order-X **PDF/A-3** by embedding an XML invoice into an existing PDF.

## Synopsis

```bash
facturx generate --pdf <input.pdf> --xml <input.xml> --output <output.pdf> [options]
```

## Options

| Option | Alias | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `--pdf` | | string | — | **Required.** Input PDF file. |
| `--xml` | | string | — | **Required.** Input XML invoice file. |
| `--output` | `-o` | string | — | **Required.** Output PDF/A-3 file path. |
| `--check` | | boolean | `true` | Validate the XML (XSD) before embedding. Use `--no-check` to skip. |
| `--flavor` | `-f` | string | autodetect | `facturx`, `orderx` or `zugferd`. |
| `--level` | `-l` | string | autodetect | Schema level (e.g. `en16931`). |
| `--language` | | string | — | Language code for the PDF (RFC 3066), e.g. `en-GB`. |

## Behaviour

- Reads `--pdf` and `--xml` from disk, embeds the XML as the appropriate attachment
  (`factur-x.xml` / `order-x.xml` / `zugferd-invoice.xml`) and writes a PDF/A-3 to `--output`.
- With `--check` (the default), an XSD validation runs first; the command fails if the XML is
  invalid. Pass `--no-check` to bypass.
- PDF metadata (title, author, subject, dates…) is derived from the XML when not otherwise present.
- On success it prints `Saved to <path>`.

## Examples

```bash
# Generate from a plain PDF + a Factur-X XML
npx @stafyniaksacha/facturx generate \
  --pdf invoice.pdf \
  --xml factur-x.xml \
  --output facturx.pdf

# Force the flavor/level and set a language, skip validation
npx @stafyniaksacha/facturx generate \
  --pdf invoice.pdf \
  --xml factur-x.xml \
  --output facturx.pdf \
  --flavor facturx --level en16931 \
  --language fr-FR \
  --no-check
```

## See also

- SDK equivalent: [`generate()`](/api/generate)
- [Profiles & flavors](/guide/profiles-and-flavors)
