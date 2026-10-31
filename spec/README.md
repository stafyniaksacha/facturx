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
