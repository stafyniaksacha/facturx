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
**Factur-X 1.09 / ZUGFeRD 2.5** XSD for the detected (or supplied) flavor and level:

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
```

Or call [`validateSchematron()`](/api/validate-schematron) directly when you only want the
business-rule layer:

```ts
import { validateSchematron } from '@stafyniaksacha/facturx'

const { valid, errors } = await validateSchematron({
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
  /** Business rule id parsed from the message, e.g. "BR-16" (when present). */
  id?: string
  /** The failing XPath test expression. */
  test?: string
  /** Location of the offending node. */
  location?: string
  /** Severity flag from the rule (e.g. "fatal", "warning"). */
  flag?: string
}
```

```ts
for (const e of result.schematronErrors ?? [])
  console.log(e.id, '→', e.message)
// e.g. "BR-16 → [BR-16]-An Invoice shall have at least one Invoice line ..."
```

The `id` (like `BR-16`, `BR-CO-10`) maps directly to the rule numbers in the EN 16931 specification,
which makes it easy to look up exactly what failed.

## Validation during generate / extract

Both [`generate()`](/api/generate) and [`extract()`](/api/extract) run an XSD `check` by default
(`check: true`) and throw on invalid XML, so you can't accidentally embed or trust a malformed
invoice. Pass `check: false` to skip it (e.g. when you've already validated, or are working with a
known-imperfect document).

```ts
// Skip the built-in XSD check
await generate({ pdf, xml, check: false })
```

## From the CLI

```bash
# XSD only
npx @stafyniaksacha/facturx check invoice.xml

# XSD + EN 16931 business rules
npx @stafyniaksacha/facturx check invoice.xml --schematron
```

The command prints each error prefixed with `[XSD]` or `[Schematron]` and exits with code `1` when
the document is invalid. See the [`check` CLI page](/cli/check).
