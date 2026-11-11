# French e-invoicing rules (BR-FR)

France's e-invoicing reform (CTC, *contrôle continu des transactions*) adds French business rules on
top of EN 16931. They are defined by the AFNOR standard **XP Z12-012 v1.4.0** and published as
Schematron by FNFE-MPE ("Schematrons FR CTC" v1.4.0). This library ships the rules for invoices in
CII, hence for Factur-X: **`BR-FR-Flux2`**, from release v1.4.0.04 (fix 04, 2026-09-04).

::: warning Not legal advice
This page describes what the library checks, not what the law requires of you. The release gives
conflicting dates for when the rules apply (see `CONFORMANCE.md`, CG-15). Confirm your obligations
with the official reform sources.
:::

## Where it fits

The FNFE-MPE release notes (p.9) define three validation steps for an invoice:

| Step | What | In this library |
| --- | --- | --- |
| 1 | XSD of the profile | `check()` (always) |
| 2 | Schematron of the profile (EN 16931 `BR-*`, Factur-X rules) | `schematron: true`: Factur-X **1.09.2.fixFR04** Schematrons from this release for BASIC WL, EN16931 and EXTENDED (p.6, CG-16) |
| 3 | French rules `BR-FR-Flux2` | `frCtc: true` |

`frCtc` runs step 3 only: it neither requires nor implies `schematron`. Pass both to run the whole
sequence:

```ts
import { check } from '@stafyniaksacha/facturx'

const result = await check({ xml, schematron: true, frCtc: true })

result.valid // ← XSD, profile Schematron and BR-FR all pass
result.frCtcValid // ← BR-FR result on its own
result.frCtcErrors // ← SchematronError[]
result.frCtcWarnings // ← always empty today: every vendored BR-FR rule is fatal
```

From the CLI, `--fr-ctc` does the same and prints each failure as `[BR-FR] <assert id>: <message>`:

```bash
npx @stafyniaksacha/facturx check factur-x.xml --schematron --fr-ctc
```

Or call [`validateFrCtc()`](/api/validate-fr-ctc) for step 3 alone.

## Scope

- **Factur-X BASIC WL, EN16931 and EXTENDED** only: the three profiles the release selects (release
  notes p.9, p.11, which adds "BASIC WL for the first year only"; XP Z12-012 Annex A lists guideline
  IDs for these three). The rules themselves read neither the root element nor the profile, so the
  library checks the document: a non-CII document, a MINIMUM or BASIC invoice, or a `level` that
  differs from the one the document declares **throws** instead of passing silently. A plain-CII
  `EXTENDED-CTC-FR` invoice is checked as `extended` (p.9).
- The rules **the published Schematron implements**: 59 of the `BR-FR-*` rules of XP Z12-012 Annex A
  (`BR-FR-01…32`, `-CO-*`, `-DEC-*`, `-MV-*`, `-BD-*`, with gaps). A pass doesn't mean every Annex A
  rule holds: some depend on external data or aren't published yet, e.g. `BR-FR-CO-01` (no
  post-dating) or the Chorus Pro rules `BR-FR-CPRO-*` (step 4). See `CONFORMANCE.md`, CG-22.
- The **standard ("fatal") variant**: every rule is an error. The `_WARNING` variant was meant for a
  transition window that has closed (release notes p.6) and is not shipped.
- Not covered: UBL invoices, the `EXTENDED-CTC-FR` profile's own XSD and Schematron, lifecycle
  statuses (CDAR, `BR-FR-CDV`) and e-reporting (flux 10). See `CONFORMANCE.md`, CG-18 to CG-21.

## Reading BR-FR errors

BR-FR findings use the same [`SchematronError`](/api/validate-schematron#schematronerror) shape:

- `id` is the business rule, e.g. `BR-FR-05`.
- `assertId` is the exact assertion, e.g. `BR-FR-05_BT-22_PMT` (the PMT note is missing). One rule
  often has several assertions, one per field or case.
- `message` is in **French**, as published by FNFE-MPE.

::: danger Messages contain invoice data
Many BR-FR messages quote the offending value ("Valeur actuelle : …"): invoice numbers, SIREN/SIRET,
names. Treat them like the invoice itself. Don't send them to logs, CI output, tickets or error
trackers where invoice contents would not be allowed; report `assertId` instead.
:::

## Example

A pre-reform EN 16931 invoice (`examples/Facture_FR_EN16931.xml`) passes XSD but breaks these rules:

| Rule | Why |
| --- | --- |
| `BR-FR-05` | The mandatory notes `PMT`, `PMD` and `AAB` (BT-22) are missing |
| `BR-FR-08` | No billing mode (BT-23) |
| `BR-FR-10` | No valid seller SIREN (BT-30) |
| `BR-FR-12`, `BR-FR-13` | No buyer / seller electronic address (BT-49, BT-34) |
| `BR-FR-32` | A SIRET (14 digits) is given where scheme `0002` requires a SIREN (9 digits), for the seller and the buyer |

The official examples of XP Z12-012 v1.4 Annex B (Factur-X EN16931 and EXTENDED, incl. multi-vendor,
bidirectional and sub-line invoices) pass all three steps; the test suite runs them.
