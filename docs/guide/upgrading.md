# Upgrading from 0.6.1

This page lists everything that changes for you when you move from `0.6.1` to the next release. The
first section covers what can break your code or your CI, and the later sections cover what you can
adopt at your own pace.

::: tip TL;DR
1. If you read `valid` / `schematronValid`, decide whether Schematron **warnings** should still fail
   your pipeline. If they should, pass `warningsAsErrors: true` (CLI: `-W`).
2. If you match Schematron rule ids (`BR-CO-27`, `BR-S-01`, `BR-54`, …), update them for the
   BASIC WL, EN 16931 and EXTENDED profiles, which now run the Factur-X **1.09.2.fixFR04** rules.
3. If you read `TradeTaxType.categoryCode` in TypeScript, handle `undefined`.
4. If you target the French e-invoicing reform, turn on the new `BR-FR` rules with `frCtc: true`
   (CLI: `--fr-ctc`).
:::

## Breaking changes

### Schematron warnings no longer make a document invalid

Each Schematron finding now has a `severity`, taken from the rule's own `flag`:

- **`warning`** for rules flagged `warning` or `information`. The spec marks these as non-blocking,
  for example `PEPPOL-EN16931-R008` (empty elements) or the EXTENDED `-08ini`/`-08rev` rules, which
  are each backed by a blocking `-08b` rule.
- **`error`** for everything else.

Warnings are returned in their own list and no longer affect `valid`:

```ts
const result = await check({ xml, schematron: true })

result.valid // XSD && no Schematron *error*
result.schematronErrors // errors only
result.schematronWarnings // new: always reported, never affect `valid` by default
```

```ts
const { valid, errors, warnings } = await validateSchematron({ xml, level: 'en16931' })
```

To keep 0.6.1's strictness, where any failed rule made the document invalid, pass
`warningsAsErrors: true`. Warnings are then also listed in `errors` / `schematronErrors`, and still in
`warnings`:

```ts
await check({ xml, schematron: true, warningsAsErrors: true })
await validateSchematron({ xml, level: 'en16931', warningsAsErrors: true })
```

```bash
# CLI: warnings are printed as [Schematron warning] without changing the exit code…
npx @stafyniaksacha/facturx check invoice.xml --schematron
# …unless you ask for -Werror-like behaviour
npx @stafyniaksacha/facturx check invoice.xml --schematron --warnings-as-errors   # or -W
```

### Schematron `report` findings are no longer dropped

The Factur-X Schematrons express some profile restrictions as `<report>` rather than `<assert>`, for
example "Attribute @schemeID marked as not used in the given context". 0.6.1 silently ignored those
findings. They are now listed in `schematronErrors` and make the document invalid.

**Effect:** a document that passed in 0.6.1 can now fail, typically because it carries an attribute
the profile does not allow. The repository's own `examples/Facture_FR_EN16931.xml` is one case: it now
fails two `@schemeID` reports at EN 16931. Remove the attribute the message points to.

### BASIC WL, EN 16931 and EXTENDED validate against Factur-X 1.09.2.fixFR04

For the three profiles in scope of the French e-invoicing reform, the XSD and Schematron now come from
the **1.09.2.fixFR04** assets that FNFE-MPE publishes with its CTC FR 1.4.0.04 release. MINIMUM and
BASIC stay on Factur-X 1.09 FINAL. These assets don't come from an official Factur-X 1.09.2
distribution; see CG-16 in
[`CONFORMANCE.md`](https://github.com/stafyniaksacha/facturx/blob/main/CONFORMANCE.md).

What you may notice:

| Profile | Change |
| --- | --- |
| BASIC WL, EN 16931 | `BR-CO-27` is now reported as `CII-SR-470` (same check). |
| BASIC WL | New blocking rules `BR-CO-18` and `CII-SR-467` … `CII-SR-473`. |
| EN 16931 | `BR-FXEXT-12` is gone, so some documents it used to reject now pass. New warning rules `CII-SR-474/475/476`. |
| EXTENDED | `BR-S-01`, `BR-Z-01`, `BR-E-01`, `BR-AE-01`, `BR-IC-01`, `BR-G-01`, `BR-O-01`, `BR-AF-01`, `BR-AG-01` become `BR-FXEXT-<category>-01`. They count `DETAIL` lines and accept several breakdowns of one category. |
| EXTENDED | `BR-54` becomes `BR-FXEXT-BR-54-1` and `BR-FXEXT-BR-54-2`. `BR-CO-27` is no longer checked. |
| EXTENDED | The XSD makes a VAT block's `TypeCode` / `CategoryCode` optional, so information and group sub-lines can leave them out. The Schematron still requires them on detail lines, on the VAT breakdown (BG-23) and on document-level allowances and charges. |

If you filter or translate findings by `id`, update the mapping above.

### `TradeTaxType.categoryCode` is optional (TypeScript)

Following the EXTENDED XSD change above, `categoryCode` on `TradeTaxType` is now typed as optional.
The converter omits it when it is unset, and the parser leaves it `undefined` when the XML doesn't
have it. Code that reads it needs a guard:

```ts
const code = tax.categoryCode ?? 'S' // or handle the missing case explicitly
```

## Other behaviour changes

These shipped on `main` after 0.6.1 and are included in the next release.

- **`generate()` accepts PDFs that already have a trailer `/ID`** ([#39](https://github.com/stafyniaksacha/facturx/pull/39)). Most real-world PDFs have
  one, and 0.6.1 threw `Not implemented yet: Document ID already set` on them. The permanent first
  element is now kept. In exchange, `generate()` now **rejects**, before changing anything:
  encrypted or signed PDFs, PDFs that already embed an invoice, PDFs with a `/Kids` name tree, a
  reused `PDFDocument`, and PDFs with too many or too large attachments to inspect. The full list of
  error messages is in [`generate()`](/api/generate#source-pdfs-that-are-rejected).
- **A malformed EmbeddedFiles name tree** now throws `Malformed EmbeddedFiles name tree: <reason>`
  from `extract()` and `generate()`, instead of a raw `pdf-lib` error ([#41](https://github.com/stafyniaksacha/facturx/pull/41)). A `/Name` key, which
  0.6.1 decoded, is now rejected.
- **The converter writes `RoleCode`, contact `TypeCode` and `LineStatusCode` as element text** ([#25](https://github.com/stafyniaksacha/facturx/pull/25)).
  0.6.1 wrote them without their value.
- **`check()`, `generate()`, `xmlToInvoice()` and the CLI work on Windows again** ([#26](https://github.com/stafyniaksacha/facturx/pull/26)): XSD imports
  failed to load on drive-letter paths.
- **The XMP packet id** is the fixed `W5M0MpCehiHzreSzNTczkc9d` from the reference packet.
  `XmpMetadata.documentId` is kept but deprecated.

## New features

### French e-invoicing rules (BR-FR), opt-in

The FNFE-MPE `BR-FR-Flux2` rules (XP Z12-012 v1.4.0) can run after the XSD and the profile
Schematron, for Factur-X BASIC WL, EN 16931 and EXTENDED:

```ts
import { check, validateFrCtc } from '@stafyniaksacha/facturx'

// The full sequence from the release notes: XSD → profile Schematron → BR-FR
const result = await check({ xml, schematron: true, frCtc: true })
result.frCtcValid
result.frCtcErrors // id: "BR-FR-05", assertId: "BR-FR-05_BT-22_PMT"

// Or BR-FR on its own
const { valid, errors } = await validateFrCtc({ xml })
```

```bash
npx @stafyniaksacha/facturx check invoice.xml --schematron --fr-ctc
```

`frCtc` doesn't turn on `schematron`; pass both to get the full sequence. MINIMUM, BASIC, Order-X and
UBL documents throw. The messages are in French and quote invoice values, so treat them as personal
data in logs. See [French e-invoicing rules](/guide/french-ctc) for scope and known gaps. This is not
legal advice.

### New fields on `SchematronError`

| Field | Meaning |
| --- | --- |
| `severity` | `'error'` or `'warning'` (see above). |
| `assertId` | Raw SVRL assert id: an internal number such as `FX-SCH-A-000372` for structural checks, sometimes the rule itself in 1.09.2, or the exact assertion for BR-FR. |

`id` also recognises rule ids with lowercase suffixes now, for example `BR-FXEXT-Z-08rev`, which 0.6.1
left undefined.

## Checklist

- [ ] Search your code for `schematronValid`, `schematronErrors` and `validateSchematron`, and decide
      on `warningsAsErrors`.
- [ ] Update any rule-id mapping for BASIC WL, EN 16931 and EXTENDED (table above).
- [ ] Run `tsc`: fix reads of `TradeTaxType.categoryCode`.
- [ ] Re-run your invoice corpus with `check({ schematron: true })`: new `@schemeID`-style failures
      come from the `report` findings that are no longer dropped.
- [ ] If `generate()` used to throw `Document ID already set` and you worked around it, drop the
      workaround. Then check the new rejection list against your source PDFs.
- [ ] For the French reform: add `frCtc: true` (CLI `--fr-ctc`).
