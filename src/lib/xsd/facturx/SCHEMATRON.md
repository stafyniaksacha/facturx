# Vendored Factur-X 1.09 validation assets

Each profile folder (`minimum`, `basicwl`, `basic`, `en16931`, `extended`) contains, per the
official **Factur-X 1.09 / ZUGFeRD 2.5 (FINAL 2026-06-10)** distribution:

| File | Purpose | Shipped in package |
|---|---|---|
| `Factur-X_1.09_<LEVEL>*.xsd` | Structural (XSD) validation — used by `check()` | yes |
| `FACTUR-X_<LEVEL>.xslt` / `.xsl` | ISO-Schematron compiled to XSLT 2.0 (provenance / regeneration source) | **no** |
| `FACTUR-X_<LEVEL>.sef.json.gz` | Above XSLT precompiled to a relocatable Saxon SEF, gzipped — used by `validateSchematron()` | yes |
| `FACTUR-X_<LEVEL>_codedb.xml` | Code-list database loaded by the Schematron via `document(...)` | yes |

The `.sef.json.gz` files are the runtime artifact; the `.xslt`/`.xsl` are kept only so the SEF can be
audited and regenerated. At runtime the SEF is decompressed next to its `codedb.xml` in a temp
directory so the transform's relative `document()` call resolves (see `../../schematron.ts`).

The committed `.xslt`/`.xsl` are the spec's `_XSLT_<LEVEL>` transforms with one patch applied: every
`sum(...)` is wrapped in `xs:decimal(...)` (see `scripts/patch-schematron-sum.mjs`). This works around a
SaxonJS-HE static-typing bug (`XPTY0004`) where `round(sum(untyped)) op xs:decimal(N)` is inferred as
decimal arithmetic but `sum()` returns `xs:double` at runtime — it surfaced on the EXTENDED profile's
FLWOR-based BR-CO rules. The patch does not change rule semantics (monetary sums are decimals).

The `*_codedb.xml` files are vendored **verbatim** from the spec. Some country-code lists contain
duplicate `<enumeration>` entries (e.g. `1A`, `XI`) — this is a spec-level artifact and is harmless:
the Schematron checks set membership (`cl[@id=N]/enumeration[@value=$x]`), for which duplicates are
inconsequential. They are intentionally left unmodified to keep the files identical to the spec.

## Regenerating the SEF (e.g. when upgrading the spec)

```bash
# from the repo root, per profile (example: en16931); start from the spec's _XSLT_ transform
cp "<spec>/3. Factur-X_1.09_EN16931/_XSLT_EN16931/FACTUR-X_EN16931.xslt"       src/lib/xsd/facturx/en16931/
cp "<spec>/3. Factur-X_1.09_EN16931/_XSLT_EN16931/FACTUR-X_EN16931_codedb.xml" src/lib/xsd/facturx/en16931/

# 1. apply the SaxonJS XPTY0004 workaround
node scripts/patch-schematron-sum.mjs src/lib/xsd/facturx/en16931/FACTUR-X_EN16931.xslt

# 2. compile to a relocatable SEF and gzip it
npx xslt3 -xsl:src/lib/xsd/facturx/en16931/FACTUR-X_EN16931.xslt \
  -export:/tmp/FACTUR-X_EN16931.sef.json -relocate:on -nogo
gzip -9 -c /tmp/FACTUR-X_EN16931.sef.json > src/lib/xsd/facturx/en16931/FACTUR-X_EN16931.sef.json.gz
```

`-relocate:on` is required so `document('…codedb.xml')` resolves relative to the SEF's runtime
location rather than its compile-time path.
