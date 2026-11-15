# `validateCdar()`

Validate a French e-invoicing **lifecycle status message** (CDV, "cycle de vie") in UN/CEFACT Cross
Domain Acknowledgement and Response (CDAR) D22B: the "uncoupled" CDAR XSD, then the French rules
**`BR-FR-CDV`** (XP Z12-012 v1.4.0, FNFE-MPE "Schematrons FR CTC" v1.4.0.04). This is validation
only: the library does not build CDAR messages.

## Signature

```ts
function validateCdar(options: {
  xml: string | Buffer | XmlDocument
  warningsAsErrors?: boolean
}): Promise<{
  valid: boolean
  errors: any[]
  schematronErrors: SchematronError[]
  schematronWarnings: SchematronError[]
}>
```

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `xml` | `string \| Buffer \| XmlDocument` | — | **Required.** The CDAR message (the XML content, not a file path). |
| `warningsAsErrors` | `boolean` | `false` | Also count rules flagged `warning` as errors. |

## Returns

| Field | Type | Description |
| --- | --- | --- |
| `valid` | `boolean` | `true` when the XSD passes and no `BR-FR-CDV` rule of severity `error` failed. |
| `errors` | `any[]` | XSD (structure) errors. |
| `schematronErrors` | `SchematronError[]` | Failed rules. `id` is the rule (`BR-FR-CDV-09`), `assertId` the assertion (`BR-FR-CDV-09_MDT-77`). |
| `schematronWarnings` | `SchematronError[]` | Failed rules flagged `warning`, always reported. |

## Behaviour

- Throws `Not a CDAR lifecycle message` when the root element is not a CDAR
  `CrossDomainAcknowledgementAndResponse`. Malformed XML, and a document using an entity reference,
  throw a libxml2 parse or validation error (entities are never expanded).
- Runs the rules **as FNFE-MPE publishes them**. Every Annex A `BR-FR-CDV` rule has an assertion, but
  some can never fail (for example a missing MDT-87 or MDG-4 is not reported), a few code lists differ
  from Annex A, and conditions that need the invoice itself (the seller's legal ID, the rejected file
  name) are not checked. A pass is not proof that every Annex A rule holds.
- Runs the standard ("fatal") variant of the rules: 40 assertions are errors, 3 are warnings
  (`BR-FR-CDV-13` on MDT-129, and `BR-FR-CDV-CL-06` on the status codes MDT-105 / MDT-115). An
  unknown status code is therefore only a warning unless you pass `warningsAsErrors: true`. This is
  how FNFE-MPE ships the rules.
- Messages are in French and quote values from the message (identifiers, names): treat them as
  personal data in logs.

## Example

```ts
import { readFile } from 'node:fs/promises'
import { validateCdar } from '@stafyniaksacha/facturx'

const result = await validateCdar({ xml: await readFile('status.xml') })
if (!result.valid)
  console.error(result.errors, result.schematronErrors)
```

CLI: [`facturx check-cdar`](/cli/check-cdar).

## See also

- [French e-invoicing rules](/guide/french-ctc)
- [`validateFrCtc()`](/api/validate-fr-ctc) — the BR-FR rules for invoices
