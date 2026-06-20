# `validateSchematron()`

Run **Schematron** (EN 16931 `BR-*` business-rule and code-list) validation against a Factur-X XML
document. This is the business-rule layer that [`check()`](/api/check) runs when you pass
`schematron: true`; call it directly when you only want the rule check.

## Signature

```ts
function validateSchematron(options: {
  xml: string | Buffer
  flavor?: string
  level: string
}): Promise<{
  valid: boolean
  errors: SchematronError[]
}>
```

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `xml` | `string \| Buffer` | — | **Required.** The invoice XML. |
| `flavor` | `string` | — | If given, must be `facturx` — any other value throws. |
| `level` | `string` | — | **Required.** Profile to validate against: `minimum`, `basicwl`, `basic`, `en16931` or `extended`. |

::: warning Factur-X only
The spec ships no Order-X Schematron. Passing a `flavor` other than `facturx` throws
`Schematron validation is only available for the "facturx" flavor`. An unknown `level` throws
`No Factur-X Schematron available for level`.
:::

## Returns

| Field | Type | Description |
| --- | --- | --- |
| `valid` | `boolean` | `true` when there are no failed assertions. |
| `errors` | `SchematronError[]` | One entry per failed assertion. |

### `SchematronError`

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

## Example

<<< ../../examples/schematron.ts#main{ts}

## How it works

The library vendors the official ISO-Schematron for each profile, precompiled to a relocatable
Saxon transform (a gzipped SEF) plus the matching code-list database, and runs it with SaxonJS. The
resulting SVRL report is parsed into the `SchematronError[]` above. The `id` (e.g. `BR-16`,
`BR-CO-10`) maps to the rule numbers in the EN 16931 specification.

## See also

- [`check()`](/api/check) — combined XSD + Schematron validation
- [Validation](/guide/validation) — the two validation layers explained
