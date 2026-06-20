# `check()`

Validate an XML invoice against the official **XSD**, and optionally the EN 16931 **Schematron**
business rules.

## Signature

```ts
function check(options: {
  xml: string | Buffer | XMLDocument
  flavor?: string
  level?: string
  schematron?: boolean
}): Promise<{
  valid: boolean
  errors: any[]
  flavor: string
  level: string
  schematronValid?: boolean
  schematronErrors?: SchematronError[]
}>
```

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `xml` | `string \| Buffer \| XMLDocument` | — | **Required.** The invoice XML. |
| `flavor` | `string` | autodetect | `facturx`, `orderx` or `zugferd`. |
| `level` | `string` | autodetect | Schema level (e.g. `en16931`). |
| `schematron` | `boolean` | `false` | Also run Schematron business-rule validation. **Factur-X only** — throws otherwise. |

## Returns

| Field | Type | Description |
| --- | --- | --- |
| `valid` | `boolean` | XSD result — or XSD **and** Schematron when `schematron: true`. |
| `errors` | `any[]` | XSD validation errors (empty when structurally valid). |
| `flavor` | `string` | Detected (or supplied) flavor. |
| `level` | `string` | Detected (or supplied) level. |
| `schematronValid` | `boolean?` | Schematron result on its own (only when `schematron: true`). |
| `schematronErrors` | `SchematronError[]?` | Business-rule failures (only when `schematron: true`). See [`SchematronError`](/api/validate-schematron#schematronerror). |

When `schematron: true`, `valid` is `true` only if **both** the XSD and the Schematron pass.

## Examples

<<< ../../examples/check.ts#main{ts}

::: warning Schematron is Factur-X only
`schematron: true` for a non-`facturx` flavor throws. See [Validation](/guide/validation).
:::

## See also

- CLI equivalent: [`facturx check`](/cli/check)
- [`validateSchematron()`](/api/validate-schematron) — the business-rule layer on its own
- [Validation](/guide/validation) — the two validation layers explained
