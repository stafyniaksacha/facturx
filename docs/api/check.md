# `check()`

Validate an XML invoice against the Factur-X **XSD** (official 1.09 for MINIMUM/BASIC, FNFE-MPE 1.09.2.fixFR04 for BASIC WL/EN 16931/EXTENDED), or a UBL 2.1 invoice or credit note against the UBL 2.1 XSD, and optionally the EN 16931 **Schematron**
business rules and the French `BR-FR` rules.

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
| `flavor` | `string` | autodetect | `facturx`, `orderx`, `zugferd` or `ubl`. |
| `level` | `string` | autodetect | Schema level (e.g. `en16931`). For `ubl`: `en16931` or `extended-ctc-fr`, read from `cbc:CustomizationID`. |
| `schematron` | `boolean` | `false` | Also run Schematron business-rule validation. **Factur-X and UBL** — throws for Order-X and ZUGFeRD 1.0. |
| `frCtc` | `boolean` | `false` | Also run the French e-invoicing rules `BR-FR-Flux2` ([guide](/guide/french-ctc)). Independent of `schematron`. **Factur-X BASIC WL, EN16931 and EXTENDED, plain-CII EXTENDED-CTC-FR, and UBL (EN16931, EXTENDED-CTC-FR) only** — throws otherwise, including when a forced `level` differs from the one the document declares. |
| `warningsAsErrors` | `boolean` | `false` | With `schematron` and/or `frCtc`, also count rules flagged `warning`/`information` as errors. |

## Returns

| Field | Type | Description |
| --- | --- | --- |
| `valid` | `boolean` | `true` only if the XSD and every enabled business-rule layer pass: the Schematron with `schematron: true`, BR-FR with `frCtc: true`. |
| `errors` | `any[]` | XSD validation errors (empty when structurally valid), or the single DOCTYPE entry (below). |
| `flavor` | `string` | Detected (or supplied) flavor. |
| `level` | `string` | Detected (or supplied) level. |
| `schematronValid` | `boolean?` | Schematron result on its own (only when `schematron: true`). |
| `schematronErrors` | `SchematronError[]?` | Business-rule failures (only when `schematron: true`). See [`SchematronError`](/api/validate-schematron#schematronerror). |
| `schematronWarnings` | `SchematronError[]?` | Rules flagged `warning`/`information` that failed, always reported (only when `schematron: true`). |
| `frCtcValid` | `boolean?` | BR-FR result on its own (only when `frCtc: true`). |
| `frCtcErrors` | `SchematronError[]?` | Failed BR-FR rules: `id` is the rule (`BR-FR-05`), `assertId` the assertion (only when `frCtc: true`). Messages may quote invoice data. |
| `frCtcWarnings` | `SchematronError[]?` | BR-FR rules flagged `warning`/`information` that failed: none with the vendored rules (only when `frCtc: true`). |

`valid` is `true` only if **every** layer that ran passes: the XSD, plus the Schematron with `schematron: true`, plus BR-FR with `frCtc: true`.

A document with a DOCTYPE is not validated (for text input the raw prolog decides, so comments and processing
instructions before the root element are fine; for an `XmlDocument` you pass, only comments may precede it): `check()` returns `valid: false` with one entry in `errors`, `The document has a DOCTYPE
…`, whatever the flavor, and does not throw. `flavor` and `level` are read when they can be (an entity may hide BT-24:
`level` is then `''`), and with `schematron` or `frCtc` that layer is reported invalid with a single `… was not run: the
document has a DOCTYPE` entry. No invoice or order uses a DOCTYPE, and an entity it declares is never expanded, so the
XSD and the readers would not see the content it stands for. `extract({ check: true })` therefore refuses such an
attachment (`Invalid XML`).

When the XSD fails and a business-rule transform cannot run on the invalid data (for example a
non-decimal amount), `check()` keeps the XSD errors and reports that layer as invalid with a single
`could not run on this XSD-invalid document (<code>)` entry, where `<code>` is the SaxonJS error code such as `FORG0001`, instead of throwing.

## Examples

<<< ../../examples/check.ts#main{ts}

::: warning Schematron is Factur-X and UBL only
`schematron: true` for Order-X (or ZUGFeRD 1.0) throws. See [Validation](/guide/validation).
:::

::: info UBL
A UBL 2.1 `Invoice` or `CreditNote` is detected as flavor `ubl`. The level comes from `cbc:CustomizationID`: `urn:cen.eu:en16931:2017` (or a `#compliant#` CIUS id, validated as EN 16931 only) gives `en16931`, the exact EXTENDED-CTC-FR id gives `extended-ctc-fr`, anything else throws unless you pass `level`: an explicit `level: 'en16931'` may be forced on a document that declares none or an unsupported id (a CIUS followed by a `#conformant#` extension counts as unsupported), whereas `level: 'extended-ctc-fr'` requires the exact EXTENDED-CTC-FR id; a level that contradicts a declared one throws. An explicit `flavor: 'facturx'` on a UBL document throws. CIUS rule sets such as Peppol BIS are **not** run. UBL is XML only: it cannot be embedded in a PDF by [`generate()`](/api/generate).
:::

## See also

- CLI equivalent: [`facturx check`](/cli/check)
- [`validateSchematron()`](/api/validate-schematron) — the business-rule layer on its own
- [`validateFrCtc()`](/api/validate-fr-ctc) — the French rules on their own
- [Validation](/guide/validation) — the two validation layers explained
