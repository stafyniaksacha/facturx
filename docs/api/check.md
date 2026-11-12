# `check()`

Validate an XML invoice against the Factur-X **XSD** (official 1.09 for MINIMUM/BASIC, FNFE-MPE 1.09.2.fixFR04 for BASIC WL/EN 16931/EXTENDED), and optionally the EN 16931 **Schematron**
business rules.

## Signature

```ts
function check(options: {
  xml: string | Buffer | XmlDocument
  flavor?: string
  level?: string
  schematron?: boolean
  frCtc?: boolean
  warningsAsErrors?: boolean
}): Promise<{
  valid: boolean
  errors: any[]
  flavor: string
  level: string
  schematronValid?: boolean
  schematronErrors?: SchematronError[]
  schematronWarnings?: SchematronError[]
  frCtcValid?: boolean
  frCtcErrors?: SchematronError[]
  frCtcWarnings?: SchematronError[]
}>
```

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `xml` | `string \| Buffer \| XmlDocument` | — | **Required.** The invoice XML. |
| `flavor` | `string` | autodetect | `facturx`, `orderx` or `zugferd`. |
| `level` | `string` | autodetect | Schema level (e.g. `en16931`). |
| `schematron` | `boolean` | `false` | Also run Schematron business-rule validation. **Factur-X only** — throws otherwise. |
| `frCtc` | `boolean` | `false` | Also run the French e-invoicing rules `BR-FR-Flux2` ([guide](/guide/french-ctc)). Independent of `schematron`. **Factur-X BASIC WL, EN16931 and EXTENDED only** — throws otherwise, including when a forced `level` differs from the one the document declares. |
| `warningsAsErrors` | `boolean` | `false` | With `schematron` and/or `frCtc`, also count rules flagged `warning`/`information` as errors. |

## Returns

| Field | Type | Description |
| --- | --- | --- |
| `valid` | `boolean` | `true` only if the XSD and every enabled business-rule layer pass: the Schematron with `schematron: true`, BR-FR with `frCtc: true`. |
| `errors` | `any[]` | XSD validation errors (empty when structurally valid). |
| `flavor` | `string` | Detected (or supplied) flavor. |
| `level` | `string` | Detected (or supplied) level. |
| `schematronValid` | `boolean?` | Schematron result on its own (only when `schematron: true`). |
| `schematronErrors` | `SchematronError[]?` | Business-rule failures (only when `schematron: true`). See [`SchematronError`](/api/validate-schematron#schematronerror). |
| `schematronWarnings` | `SchematronError[]?` | Rules flagged `warning`/`information` that failed, always reported (only when `schematron: true`). |
| `frCtcValid` | `boolean?` | BR-FR result on its own (only when `frCtc: true`). |
| `frCtcErrors` | `SchematronError[]?` | Failed BR-FR rules: `id` is the rule (`BR-FR-05`), `assertId` the assertion (only when `frCtc: true`). Messages may quote invoice data. |
| `frCtcWarnings` | `SchematronError[]?` | BR-FR rules flagged `warning`/`information` that failed: none with the vendored rules (only when `frCtc: true`). |

`valid` is `true` only if **every** layer that ran passes: the XSD, plus the Schematron with `schematron: true`, plus BR-FR with `frCtc: true`.

When the XSD fails and a business-rule transform cannot run on the invalid data (for example a
non-decimal amount), `check()` keeps the XSD errors and reports that layer as invalid with a single
`could not run on this XSD-invalid document (<code>)` entry, where `<code>` is the SaxonJS error code such as `FORG0001`, instead of throwing.

## Examples

<<< ../../examples/check.ts#main{ts}

::: warning Schematron is Factur-X only
`schematron: true` for a non-`facturx` flavor throws. See [Validation](/guide/validation).
:::

## See also

- CLI equivalent: [`facturx check`](/cli/check)
- [`validateSchematron()`](/api/validate-schematron) — the business-rule layer on its own
- [`validateFrCtc()`](/api/validate-fr-ctc) — the French rules on their own
- [Validation](/guide/validation) — the two validation layers explained
