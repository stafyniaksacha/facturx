# Getting started

`@stafyniaksacha/facturx` works both as a **command-line tool** and as a **library**. This page
gets you from install to a working invoice in a couple of minutes. New to the formats themselves?
Read [What are Factur-X & ZUGFeRD?](/guide/what-is-facturx) first.

## Requirements

- **Node.js ≥ 20.11.0**
- A package manager — examples below use **pnpm**, but npm / yarn / bun work too.

## Install

::: code-group

```bash [pnpm]
pnpm add @stafyniaksacha/facturx
```

```bash [npm]
npm install @stafyniaksacha/facturx
```

```bash [bun]
bun add @stafyniaksacha/facturx
```

:::

The package is ESM-only and ships its own TypeScript types.

## Use it from the command line

You don't even need to install it to try the CLI:

```bash
# Show all commands
npx @stafyniaksacha/facturx --help

# Extract the embedded XML from a Factur-X PDF
npx @stafyniaksacha/facturx extract invoice.pdf > factur-x.xml

# Check that an XML invoice is valid (structure + business rules)
npx @stafyniaksacha/facturx check factur-x.xml --schematron

# Embed an XML into a PDF to produce a compliant PDF/A-3
npx @stafyniaksacha/facturx generate --pdf invoice.pdf --xml factur-x.xml --output facturx.pdf
```

See the full [CLI reference](/cli/) for every command and flag.

## Use it from code

The three everyday operations — **generate**, **extract** and **check** — share the same shape:
you pass a PDF and/or XML (as a string, `Buffer`, or already-parsed document) and get back a
result. The `flavor` and `level` are autodetected from the XML when you don't specify them.

<<< ../../examples/quickstart.ts#tour{ts}

Each function is documented in the [SDK reference](/api/) with its full signature, options and
return shape.

## Try it with the bundled examples

The repository ships real, valid invoices under
[`examples/`](https://github.com/stafyniaksacha/facturx/tree/main/examples) that you can use to
experiment:

| File | Flavor / level |
| --- | --- |
| `Facture_FR_EN16931.pdf` / `.xml` | Factur-X · `en16931` |
| `Facture_FR_MINIMUM.pdf` / `.xml` | Factur-X · `minimum` |
| `Avoir_FR_type381_EN16931.pdf` / `.xml` | Factur-X credit note (type 381) · `en16931` |
| `ORDER-X_EX03_ORDER_BASIC_DATA-COMFORT.pdf` | Order-X · `comfort` |
| `ORDER-X_EX11_ORDER_PICK-UP-BASIC.pdf` / `.xml` | Order-X · `basic` |

```bash
# Round-trip: extract the XML, then check it
npx @stafyniaksacha/facturx extract examples/Facture_FR_EN16931.pdf > out.xml
npx @stafyniaksacha/facturx check out.xml --schematron
```

## Next steps

- [What are Factur-X & ZUGFeRD?](/guide/what-is-facturx) — the concepts behind the format
- [Profiles & flavors](/guide/profiles-and-flavors) — which flavor/level to target
- [Validation](/guide/validation) — XSD vs Schematron, and how to read the errors
- [CLI reference](/cli/) and [SDK reference](/api/)
