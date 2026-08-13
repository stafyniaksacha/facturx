# Factur-X and Order-X JS library

Generate, extract, parse and validate Factur-X / ZUGFeRD and Order-X e-invoices in TypeScript, using [pdf-lib](https://github.com/Hopding/pdf-lib) and [libxml2-wasm](https://github.com/jameslan/libxml2-wasm).

Conforms to **Factur-X 1.09 / ZUGFeRD 2.5** (the EN 16931 European e-invoicing standard, CII D22B).

> 📖 **[Read the full documentation →](https://stafyniaksacha.github.io/facturx/)**

## Features

- 📎 **Generate** a PDF-A/3 invoice by embedding the XML into a PDF — `generate`
- 📤 **Extract** the XML back out of a Factur-X / Order-X / ZUGFeRD PDF — `extract`
- 🔁 **Parse** an XML invoice into a fully-typed model — `xmlToInvoice`
- 🧱 **Build** a Cross Industry Invoice model and serialize it to XML — `invoiceToXml`
- ✅ **Validate** against the official 1.09 **XSD**, and optionally the **Schematron** EN 16931 `BR-*` business rules and code lists — `check` (`schematron: true`) / `validateSchematron`
- 🗂 All five Factur-X profiles: `minimum`, `basicwl`, `basic`, `en16931`, `extended`

See [Profiles & flavors](https://stafyniaksacha.github.io/facturx/guide/profiles-and-flavors) for the supported flavors, levels and autodetection rules.

## Install

```bash
npm install @stafyniaksacha/facturx
```

Requires Node.js ≥ 20.11.0. The package is ESM-only and ships its own types.

## Quick start

```bash
# CLI — no install required
npx @stafyniaksacha/facturx extract invoice.pdf > factur-x.xml
npx @stafyniaksacha/facturx check factur-x.xml --schematron
```

```ts
import { check, extract, generate } from '@stafyniaksacha/facturx'

// Embed an XML invoice into a PDF → compliant PDF/A-3 bytes
const facturxPdf = await generate({ pdf, xml })

// Pull the embedded XML back out of a Factur-X / Order-X / ZUGFeRD PDF
const { xml: extractedXml, flavor, level } = await extract({ pdf })

// Validate against the XSD (and, with schematron: true, the EN 16931 business rules)
const { valid, errors } = await check({ xml })
```

The `flavor` and `level` are autodetected from the XML when not provided.

## Documentation

Full guides and the complete API reference live on the docs site:

- **[Getting started](https://stafyniaksacha.github.io/facturx/guide/getting-started)** — install to a working invoice in a couple of minutes
- **[What are Factur-X & ZUGFeRD?](https://stafyniaksacha.github.io/facturx/guide/what-is-facturx)** — the concepts behind the formats
- **[Profiles & flavors](https://stafyniaksacha.github.io/facturx/guide/profiles-and-flavors)** — which flavor/level to target
- **[Validation](https://stafyniaksacha.github.io/facturx/guide/validation)** — XSD vs Schematron, and how to read the errors
- **[CLI reference](https://stafyniaksacha.github.io/facturx/cli/)** — every command and flag
- **[SDK reference](https://stafyniaksacha.github.io/facturx/api/)** — `generate` / `extract` / `check` / parsing
- **[Model reference](https://stafyniaksacha.github.io/facturx/api/models)** — the Cross Industry Invoice tree and how to build one from scratch

## Useful links

- https://fnfe-mpe.org/factur-x/
- https://fnfe-mpe.org/factur-x/order-x/

## License

Based on original work of [`akretion/factur-x`](https://github.com/akretion/factur-x) python library by [`Alexis de Lattre`](https://github.com/alexis-via)
