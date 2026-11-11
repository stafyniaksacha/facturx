# Validation

There are **two independent layers** of validation for an e-invoice, and they answer different
questions:

| Layer | Question it answers | Available for |
| --- | --- | --- |
| **XSD** (structure) | Is the XML *shaped* correctly — right elements, right order, right data types? | all flavors |
| **Schematron** (business rules) | Do the *values* satisfy the EN 16931 `BR-*` rules and use valid codes? | `facturx` only |

::: tip Valid structure ≠ valid business rules
A document can be perfectly valid XSD-wise and still break business rules (e.g. totals that don't
add up, or a missing VAT breakdown). For full EN 16931 compliance you need **both** layers.
:::

## XSD validation

This is the default. [`check()`](/api/check) validates the XML structure against the official
**Factur-X / ZUGFeRD** XSD for the detected (or supplied) flavor and level: Factur-X 1.09 / ZUGFeRD 2.5
for MINIMUM and BASIC, and Factur-X **1.09.2** (the `fixFR04` assets published by FNFE-MPE for the
French e-invoicing reform) for BASIC WL, EN 16931 and EXTENDED. The Schematron below follows the same
split.

```ts
import { check } from '@stafyniaksacha/facturx'

const { valid, errors, flavor, level } = await check({ xml })

if (!valid) {
  for (const e of errors)
    console.error(e.message)
}
```

`errors` is the list of structural problems reported by the XSD validator (empty when `valid` is
`true`).

## Schematron (business-rule) validation

Since the 1.09 XSDs no longer enumerate code lists, the **Schematron** rules are what enforce valid
codes *and* the EN 16931 `BR-*` business rules. The library ships the official ISO-Schematron
compiled to a relocatable Saxon transform (one per profile) and runs it with SaxonJS.

Turn it on by adding `schematron: true` to `check()`:

```ts
const result = await check({ xml, schematron: true })

result.valid // ← true only if XSD *and* Schematron both pass
result.schematronValid // ← Schematron result on its own
result.schematronErrors // ← SchematronError[]
result.schematronWarnings // ← rules flagged warning/information, always reported
```

Rules the spec flags `warning` (or `information`) don't make the document invalid. Pass
`warningsAsErrors: true` to fail on them as well, like a compiler's `-Werror`; they stay in
`schematronWarnings` either way.

Or call [`validateSchematron()`](/api/validate-schematron) directly when you only want the
business-rule layer:

```ts
import { validateSchematron } from '@stafyniaksacha/facturx'

const { valid, errors, warnings } = await validateSchematron({
  xml,
  flavor: 'facturx',
  level: 'en16931',
})
```

::: warning Schematron is Factur-X only
The spec ships no Order-X Schematron. Passing `schematron: true` for a non-`facturx` flavor (or
calling `validateSchematron` with another flavor) **throws**. XSD validation works for all flavors.
:::

## Reading Schematron errors

Each entry is a `SchematronError`:

```ts
interface SchematronError {
  /** Human-readable assertion message, e.g. "[BR-16]-An Invoice shall have ...". */
  message: string
  /**
   * Rule id from a "[BR-16]" tag in the message (validateSchematron). Undefined when the message
   * has none, e.g. for structural checks; the raw SVRL id, if the rule sets one, is in `assertId`.
   */
  id?: string
  /** Raw SVRL assert id, when the rule sets one (e.g. "FX-SCH-A-000372"). */
  assertId?: string
  /** The failing XPath test expression. */
  test?: string
  /** Location of the offending node. */
  location?: string
  /** Severity flag from the rule (e.g. "fatal", "warning"). */
  flag?: string
  /** "warning" for rules flagged warning/information, "error" otherwise. */
  severity: 'error' | 'warning'
}
```

```ts
for (const e of result.schematronErrors ?? [])
  console.log(e.id, '→', e.message)
// e.g. "BR-16 → [BR-16]-An Invoice shall have at least one Invoice line ..."
```

Every failed assert and every fired report is listed. Structural checks (e.g. "Element
'ram:SellerTradeParty' must occur exactly 1 times") carry no `id`. The `id` (like `BR-16`, `BR-CO-10`) maps directly to the rule numbers in the EN 16931 specification,
which makes it easy to look up exactly what failed.

## Validation during generate / extract

Both [`generate()`](/api/generate) and [`extract()`](/api/extract) can run an XSD `check` and throw
on invalid XML, so you don't accidentally embed or trust a malformed invoice. Validation is **off by
default** — pass `check: true` to opt in (e.g. skip it when you've already validated, or are working
with a known-imperfect document).

```ts
// Validate the XML before embedding it
await generate({ pdf, xml, check: true })
```

## From the CLI

```bash
# XSD only
npx @stafyniaksacha/facturx check invoice.xml

# XSD + EN 16931 business rules
npx @stafyniaksacha/facturx check invoice.xml --schematron

# ... and fail on rules flagged warning too
npx @stafyniaksacha/facturx check invoice.xml --schematron --warnings-as-errors
```

The command prints each error prefixed with `[XSD]` or `[Schematron]` (warnings with
`[Schematron warning]`, on stderr, even when the document is valid) and exits with code `1` when
the document is invalid. See the [`check` CLI page](/cli/check).
