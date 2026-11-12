# SDK reference

`@stafyniaksacha/facturx` exposes a small, focused API. Everything is `async` and works with
strings, `Buffer`s or already-parsed documents.

## Imports

The main entry point exports the functions and a `Models` namespace:

```ts
import {
  check,
  extract,
  generate,
  invoiceToXml,
  Models,
  validateFrCtc,
  validateSchematron,
  xmlToInvoice,
} from '@stafyniaksacha/facturx'
```

The model classes are also available individually from the `/models` subpath (handy when building
an invoice from scratch):

```ts
import { AmountType, CrossIndustryInvoiceType, IDType /* … */ } from '@stafyniaksacha/facturx/models'
```

## Exports

| Export | Kind | Description |
| --- | --- | --- |
| [`generate(options)`](/api/generate) | `() => Promise<Uint8Array>` | Embed XML into a PDF → PDF/A-3 bytes. |
| [`extract(options)`](/api/extract) | `() => Promise<ExtractResult>` | Pull the embedded XML out of a PDF. |
| [`check(options)`](/api/check) | `() => Promise<CheckResult>` | XSD (+ optional Schematron) validation. |
| [`validateSchematron(options)`](/api/validate-schematron) | `() => Promise<{ valid, errors }>` | EN 16931 business-rule validation (Factur-X only). |
| [`validateFrCtc(options)`](/api/validate-fr-ctc) | `() => Promise<{ valid, errors }>` | French e-invoicing rules `BR-FR-Flux2` (Factur-X BASIC WL, EN16931, EXTENDED). |
| [`xmlToInvoice(xml)`](/api/parsing) | `() => Promise<CrossIndustryInvoiceType>` | Parse XML into a typed model. |
| [`invoiceToXml(invoice)`](/api/parsing) | `() => Promise<XmlDocument>` | Serialize a model back to XML. |
| [`Models`](/api/models) | namespace | All Cross Industry Invoice model classes & types. |

## Typical flows

**Produce a Factur-X PDF from an existing PDF + XML:**

```ts
import { readFile, writeFile } from 'node:fs/promises'
import { generate } from '@stafyniaksacha/facturx'

const pdf = await readFile('./invoice.pdf')
const xml = await readFile('./factur-x.xml')

const bytes = await generate({ pdf, xml, check: true }) // XSD-validates, then embeds
await writeFile('./facturx.pdf', bytes)
```

**Read the data out of a received invoice:**

```ts
import { readFile } from 'node:fs/promises'
import { extract, xmlToInvoice } from '@stafyniaksacha/facturx'

const pdf = await readFile('./received.pdf')
const { xml, flavor, level } = await extract({ pdf })

const invoice = await xmlToInvoice(xml)
const seller = invoice.supplyChainTradeTransaction
  .applicableHeaderTradeAgreement
  .sellerTradeParty
  .name
  ?.value
```

## Conventions

- **`flavor` / `level`** are optional on every function that takes XML — they're
  [autodetected](/guide/profiles-and-flavors#autodetection) from the document when omitted.
- **Inputs** accept `string | Buffer` (and `generate`/`check` also accept a parsed `XmlDocument`;
  `generate`/`extract` also accept a `PDFDocument`). A string is the document **content**, never a
  file path: read files yourself (`readFile`) and pass the `Buffer`. For a PDF, a string is decoded
  as base64 by pdf-lib.
- **Validation** is off by default in `generate()` and `extract()`; pass `check: true` to run the XSD
  check first. (The CLI is the other way round: `--check` is on unless you pass `--no-check`.)
- **Errors** are thrown as standard `Error`s (e.g. `No attachment found`, `Invalid XML`).
