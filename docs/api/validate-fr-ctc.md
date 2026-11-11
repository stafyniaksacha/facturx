# `validateFrCtc()`

Check a Factur-X invoice against the French e-invoicing business rules **`BR-FR-Flux2`** (XP Z12-012
v1.4.0, FNFE-MPE "Schematrons FR CTC" v1.4.0.04). This is the layer that [`check()`](/api/check)
runs when you pass `frCtc: true`. See [French e-invoicing rules](/guide/french-ctc) for the scope.

## Signature

```ts
function validateFrCtc(options: {
  xml: string | Buffer
  level: string
  flavor?: string
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
| `xml` | `string \| Buffer` | — | **Required.** The invoice XML (CII D22B). |
| `level` | `string` | — | **Required.** `basicwl`, `en16931` or `extended`. Anything else throws. |
| `flavor` | `string` | `facturx` | If given, must be `facturx`: any other value throws. |
| `warningsAsErrors` | `boolean` | `false` | Also count rules flagged `warning`/`information` as errors. Every vendored BR-FR rule is `fatal`, so this has no effect today. |

## Returns

| Field | Type | Description |
| --- | --- | --- |
| `valid` | `boolean` | `true` when no BR-FR rule failed. |
| `errors` | `SchematronError[]` | Failed rules. `id` is the rule (`BR-FR-05`), `assertId` the assertion (`BR-FR-05_BT-22_PMT`). |
| `warnings` | `SchematronError[]` | Failed rules flagged `warning`/`information`: none with the vendored rules. |

`SchematronError` is described on [`validateSchematron()`](/api/validate-schematron#schematronerror).
Messages are in French and may quote invoice values: treat them as personal data.

## Example

```ts
import { validateFrCtc } from '@stafyniaksacha/facturx'

const { valid, errors } = await validateFrCtc({ xml, level: 'en16931' })

if (!valid) {
  for (const e of errors)
    console.error(e.assertId) // e.g. "BR-FR-05_BT-22_PMT"; e.message may contain invoice data
}
```

This checks the French rules only, not the structure (XSD) nor the profile rules. Use
`check({ xml, schematron: true, frCtc: true })` for the full sequence.

## See also

- [French e-invoicing rules](/guide/french-ctc)
- [`check()`](/api/check)
