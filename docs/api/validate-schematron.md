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
  warningsAsErrors?: boolean
}): Promise<{
  valid: boolean
  errors: SchematronError[]
  warnings: SchematronError[]
}>
```

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `xml` | `string \| Buffer` | — | **Required.** The invoice XML. |
| `flavor` | `string` | — | If given, must be `facturx` — any other value throws. |
| `level` | `string` | — | **Required.** Profile to validate against: `minimum`, `basicwl`, `basic`, `en16931` or `extended`. |
| `warningsAsErrors` | `boolean` | `false` | Also count rules flagged `warning`/`information` as errors (like a compiler's `-Werror`). |

::: warning Factur-X only
The spec ships no Order-X Schematron. Passing a `flavor` other than `facturx` throws
`Schematron validation is only available for the "facturx" flavor`. An unknown `level` throws
`No Factur-X Schematron available for level`.
:::

## Returns

| Field | Type | Description |
| --- | --- | --- |
| `valid` | `boolean` | `true` when no finding of severity `error` was raised (with `warningsAsErrors`, when there is no finding at all). A finding is a failed `<assert>` or a fired `<report>`. |
| `errors` | `SchematronError[]` | Findings (failed asserts and fired reports) that make the document invalid. With `warningsAsErrors`, the warnings are listed here too. |
| `warnings` | `SchematronError[]` | Findings flagged `warning`/`information`, always reported. |

Some rules are non-blocking by design and flagged `warning` in the spec's Schematron (for example
`PEPPOL-EN16931-R008` in EN16931, or the EXTENDED ini/rev rules). They are reported in `warnings`
and don't affect `valid` unless you pass `warningsAsErrors: true`.

### `SchematronError`

```ts
interface SchematronError {
  /** Human-readable assertion message, e.g. "[BR-16]-An Invoice shall have ...". */
  message: string
  /**
   * Rule id from the "[BR-16]" message prefix. Undefined when the message has none, e.g. for
   * structural checks; the raw SVRL id, if the rule sets one, is in `assertId`.
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
