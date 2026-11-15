# Factur-X and Order-X JS library

Generate, extract, parse and validate Factur-X / ZUGFeRD and Order-X e-invoices in TypeScript, using [pdf-lib](https://github.com/Hopding/pdf-lib) and [libxml2-wasm](https://github.com/jameslan/libxml2-wasm).

Conforms to **Factur-X 1.09 / ZUGFeRD 2.5** (the EN 16931 European e-invoicing standard, CII D22B).

> 📖 **[Read the full documentation →](https://stafyniaksacha.github.io/facturx/)**

## Features

- 📎 **Generate** a PDF-A/3 invoice by embedding the XML into a PDF — `generate`
- 📤 **Extract** the XML back out of a Factur-X / Order-X / ZUGFeRD PDF — `extract`
- 🔁 **Parse** an XML invoice into a fully-typed model — `xmlToInvoice`
- 🧱 **Build** a Cross Industry Invoice model and serialize it to XML — `invoiceToXml`
- ✅ **Validate** against the Factur-X **XSD** (1.09 for MINIMUM/BASIC, the FNFE-MPE 1.09.2.fixFR04 assets for BASIC WL/EN 16931/EXTENDED), and optionally the **Schematron** EN 16931 `BR-*` business rules and code lists — `check` (`schematron: true`) / `validateSchematron`
- 🇫🇷 **French e-invoicing rules** `BR-FR-Flux2` (XP Z12-012 v1.4.0) for Factur-X BASIC WL, EN16931 and EXTENDED, opt-in — `check` (`frCtc: true`) / `validateFrCtc` / `facturx check --fr-ctc`
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
// (the flavor comes from the attachment filename)
const { xml: extractedXml, flavor } = await extract({ pdf })

// Validate against the XSD (and, with schematron: true, the EN 16931 business rules)
const { valid, errors, level } = await check({ xml: extractedXml })
```

`generate` and `check` autodetect the `flavor` and `level` from the XML when not provided. `extract`
reports only the flavor; run `check` on the extracted XML to get its level.

## Documentation

Full guides and the complete API reference live on the docs site:

- **[Getting started](https://stafyniaksacha.github.io/facturx/guide/getting-started)** — install to a working invoice in a couple of minutes
- **[What are Factur-X & ZUGFeRD?](https://stafyniaksacha.github.io/facturx/guide/what-is-facturx)** — the concepts behind the formats
- **[Profiles & flavors](https://stafyniaksacha.github.io/facturx/guide/profiles-and-flavors)** — which flavor/level to target
- **[Validation](https://stafyniaksacha.github.io/facturx/guide/validation)** — XSD vs Schematron, and how to read the errors
- **[French e-invoicing rules](https://stafyniaksacha.github.io/facturx/guide/french-ctc)** — the `BR-FR` rules of the reform (not legal advice)
- **[Upgrading from 0.6.1](https://stafyniaksacha.github.io/facturx/guide/upgrading)** — breaking changes (Schematron warnings, 1.09.2.fixFR04 rule ids, `categoryCode`) and new features
- **[CLI reference](https://stafyniaksacha.github.io/facturx/cli/)** — every command and flag
- **[SDK reference](https://stafyniaksacha.github.io/facturx/api/)** — `generate` / `extract` / `check` / parsing
- **[Model reference](https://stafyniaksacha.github.io/facturx/api/models)** — the Cross Industry Invoice tree and how to build one from scratch

## Useful links

- https://fnfe-mpe.org/factur-x/
- https://fnfe-mpe.org/factur-x/order-x/

## License

Based on original work of [`akretion/factur-x`](https://github.com/akretion/factur-x) python library by [`Alexis de Lattre`](https://github.com/alexis-via)
