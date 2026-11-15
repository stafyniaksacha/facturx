# `generate`

Generate a Factur-X / Order-X hybrid by embedding an XML invoice into an existing PDF. The command
does not convert the PDF to PDF/A-3: pass a PDF/A-3 file as `--pdf` (see
[`generate()`](/api/generate#supplying-the-pdf-base)).

## Synopsis

```bash
facturx generate --pdf <input.pdf> --xml <input.xml> --output <output.pdf> [options]
```

## Options

| Option | Alias | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `--pdf` | | string | — | **Required.** Input PDF file. |
| `--xml` | | string | — | **Required.** Input XML invoice file. |
| `--output` | `-o` | string | — | **Required.** Output PDF file path. |
| `--check` | | boolean | `true` | Validate the XML (XSD) before embedding. Use `--no-check` to skip. |
| `--flavor` | `-f` | string | autodetect | `facturx` or `orderx`. `zugferd` (extraction only) fails. |
| `--level` | `-l` | string | autodetect | Schema level (e.g. `en16931`). |
| `--language` | | string | — | Language code for the PDF (RFC 3066), e.g. `en-GB`. |
| `--afRelationship` | | string | `Data` | `Data`, `Alternative` or `Source` (MINIMUM and BASIC WL: `Data` only). See [`generate()`](/api/generate#behaviour). |
| `--preserveXmlBytes` | | boolean | `false` | Embed the XML file byte for byte instead of re-serializing it. The file must be XML 1.0, UTF-8, without a DOCTYPE. See [`generate()`](/api/generate#behaviour). |

## Behaviour

- Reads `--pdf` and `--xml` from disk, embeds the XML as the appropriate attachment
  (`factur-x.xml` / `order-x.xml`), writes the PDF/A-3 XMP metadata and saves the result to `--output`.
- With `--check` (the default), an XSD validation runs first; the command fails if the XML is
  invalid. Pass `--no-check` to bypass.
- PDF title, author and subject are derived from the XML; the PDF, XMP and attachment dates are
  the generation time (UTC).
- On success it prints `Saved to <path>`.
- Fails on source PDFs it cannot embed into correctly: encrypted or signed PDFs, PDFs that already
  contain an invoice XML, and PDFs with an unsupported or corrupt attachment list. See
  [Source PDFs that are rejected](/api/generate#source-pdfs-that-are-rejected).

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
