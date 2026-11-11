# Vendored specifications

The normative sources this library implements, versioned so that every conformance claim in the
code, tests and docs can be audited against a fixed, reviewable copy of the spec.

## `factur-x-1.09/` — Factur-X 1.09 / ZUGFeRD 2.5 (FINAL, 2026-06-10)

Published by FNFE-MPE (France) and FeRD (Germany): <https://fnfe-mpe.org/factur-x/>.

| Path | What it is | Edit? |
| --- | --- | --- |
| `distribution/` | The official distribution, **verbatim** (only macOS `.DS_Store` / `Icon` files removed) | never |
| `SHA256SUMS` | Checksums of every file in `distribution/` | regenerate on upgrade |
| `text/` | Searchable extracts derived from `distribution/` by [`scripts/extract.mjs`](scripts/extract.mjs) | never — regenerate |

Key documents inside `distribution/`:

| File | Use it for |
| --- | --- |
| `1. FACTUR-X 1.09 2026 06 10 EN.pdf` | The specification: PDF/A-3 embedding (§6), XMP (§6.3), data types (§7.1.5), profiles (§7.2–7.7), hybrid rules `BR-HYBRID-*` (appendix 3.d) |
| `2. FACTUR-X_extension_schema_exemple.xmp.txt` | Reference XMP packet (what `src/lib/xmp.ts` must produce) |
| `3. FACTUR-X 1.09 - 2026 06 10 - EN FR VF.xlsx` | Field matrix per profile (BT/BG → XPath, cardinality), business rules, code lists, hybrid code lists |
| `4. FACTUR-X_1.09_XSD_SCHEMATRON_2026-06-10/` | XSD, Schematron (`.sch`) and compiled XSLT per profile — the source of `src/lib/xsd/facturx/` |
| `5. FACTUR-X 1.09 - Examples/` | Official example PDFs per profile — the conformance corpus run by `tests/spec-examples.test.ts` |
| `7. FACTUR-X 1.09_Zugferd 2.5 technical appendices/` | Per-profile technical appendices |
| `EN16931 code lists values v17b … .xlsx` | EN 16931 code lists in force from 2026-05-15 |

Searching: prefer `text/` (`grep -n` works; every page starts with a `=== PDF page N ===` marker, and for
pages 1–91 the PDF page equals the printed `Page N / 91` footer). The spreadsheets are exported one CSV
per worksheet, e.g. `text/fields--Factur-X_CII_D22B_EN16931.csv`, `text/fields--Business_Rules_HYBRID.csv`,
`text/codelists--Filename.csv`.

### Integrity checks

```bash
# distribution/ is byte-identical to what was vendored
(cd spec/factur-x-1.09/distribution && sha256sum -c --quiet ../SHA256SUMS)

# every validation asset shipped in src/lib/xsd/facturx/ traces back to distribution/
pnpm spec:verify

# text/ is reproducible from distribution/ (expect no diff afterwards)
pnpm --dir spec/scripts install --ignore-workspace
pnpm --dir spec/scripts run extract
git diff --stat spec/factur-x-1.09/text
```

`spec/scripts/` is a standalone package (not in the pnpm workspace), so its PDF/XLSX dependencies are
only installed when you regenerate the extracts.

### Licensing

Page 10 of the specification states the document is "copyright free, on an 'AS IS' basis … under
Apache 2.0 license terms", while every page footer reads "All rights reserved". The distribution is
vendored on the basis of the Apache 2.0 statement; the licensing of the spreadsheets and appendices is
not stated separately. Revisit before redistributing outside this repository (it is not shipped in the
npm package: `package.json` `files` only includes `bin` and `dist`).

## `fnfe-ctc-fr-1.4.0.04/` — FNFE-MPE Schematrons FR CTC v1.4.0, fix 04 (2026-09-04)

Validation components for the French e-invoicing reform (CTC, XP Z12-012 v1.4.0), published by
FNFE-MPE. Upstream: <https://github.com/fnfempe/France_RFE>. This copy was supplied by the maintainer
as a zip; cross-check `SHA256SUMS` against the upstream tag before relying on it.

| Path | What it is | Edit? |
| --- | --- | --- |
| `distribution/` | The release, **verbatim** (only macOS `.DS_Store` files removed) | never |
| `SHA256SUMS` | Checksums of every file in `distribution/` | regenerate on upgrade |
| `text/` | `release-notes-{en,fr}.txt`, derived from the two PDFs by [`scripts/extract.mjs`](scripts/extract.mjs) | never — regenerate |

Contents of `distribution/`:

| Path | What it is |
| --- | --- |
| `2026_06_30_FNFE_SCHEMATRONS_FR_CTC_V1.4.0{,_EN}.pdf` | Release notes (FR / EN): validation steps (XSD → profile Schematron → `BR-FR-Flux2`, plus an optional B2G step 4, p.9), profiles in scope, error vs `_WARNING` variants, dates |
| `Factur-X_1.09.2.fixFR04/{BASICWL,EN16931,EXTENDED}/` | Factur-X **1.09.2** XSD + Schematron for the three profiles in scope of the reform (no MINIMUM / BASIC), plus `BR-FR-Flux2` per profile |
| `CII/` | Plain CII D22B: EN16931 (CEN validation) and the `EXTENDED-CTC-FR` profile (since V1.3.0), each with `BR-FR-Flux2` |
| `UBL/` | UBL 2.1: EN16931 and `EXTENDED-CTC-FR`, each with `BR-FR-Flux2-…-UBL` |
| `CDAR/` | Cross Domain Acknowledgement and Response D22B (invoice lifecycle statuses) + `BR-FR-CDV` |
| `Flux10/` | E-reporting (flux 10) XSD + Schematron |

This is **not** the official Factur-X 1.09.2 distribution: it has no specification PDF, no field
matrix and no examples, and only covers BASIC WL, EN16931 and EXTENDED. `factur-x-1.09/` stays the
source for MINIMUM, BASIC, the specification text and the example corpus.

Known inconsistencies, to keep in mind when citing it (see `CONFORMANCE.md`):

- **Licence.** The EN release notes (p.8) state Apache-2.0, the `BR-FR-*` `.sch` headers say
  "EUPL version 1.4.0" (no such EUPL version exists), every PDF page footer says "All rights
  reserved", and `Flux10/` carries no licence. The maintainer decided to ship compiled `BR-FR-Flux2`
  rules in the npm package (once that module lands) on the basis of the Apache-2.0 statement;
  clarification is to be requested upstream. See CG-15.
- **Version and dates.** The PDFs describe 1.4.0 (2026-06-30); the files are fix 04 (2026-09-04) and
  the Factur-X 1.09.2 `.sch` metadata says released 2026-08-04, effective 2026-09-01. The headers of
  the FATAL `BR-FR-*` and `EXTENDED-CTC-FR` `.sch` files give October 1, 2026 for sending, where both
  release notes (p.6) give September 1; the reception deadline (no later than October 1) agrees.

```bash
(cd spec/fnfe-ctc-fr-1.4.0.04/distribution && shasum -a 256 -c --quiet ../SHA256SUMS)
pnpm --dir spec/scripts run extract fnfe-ctc-fr-1.4.0.04
```

## Not vendored

- **Order-X** specification: `src/lib/xsd/orderx/` cannot be traced to a vendored source yet. The
  Factur-X hybrid code lists above do cover Order-X XMP values (`ORDER`, `ORDER_CHANGE`,
  `ORDER_RESPONSE`, `BASIC` / `COMFORT` / `EXTENDED`, `order-x.xml`).
- **EN 16931-1** itself (CEN, paid standard) and the **XMP** / **PDF/A** ISO standards.

## Upgrading to a new Factur-X version

1. Add the new distribution as `spec/factur-x-<version>/distribution/` (keep the previous version until
   the code has moved over), then generate checksums and extracts:
   `(cd spec/factur-x-<version>/distribution && find . -type f | sort | xargs -d '\n' sha256sum > ../SHA256SUMS)`
   and `pnpm --dir spec/scripts run extract factur-x-<version>` (update the file lists in `extract.mjs`
   if names changed).
2. Re-vendor the XSD / codedb / XSLT and recompile the SEF as described in
   [`src/lib/xsd/facturx/SCHEMATRON.md`](../src/lib/xsd/facturx/SCHEMATRON.md); point
   `scripts/verify-spec-assets.mjs` and `tests/spec-examples.test.ts` at the new folder.
3. Read the version-history table at the start of the new spec and review every change against
   [`CONFORMANCE.md`](../CONFORMANCE.md).
4. `pnpm spec:verify && pnpm build && pnpm test` must pass.
