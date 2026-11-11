# Vendored Factur-X validation assets

Each profile folder comes from one of two official sources (see `SOURCES` in
[`scripts/verify-spec-assets.mjs`](../../../../scripts/verify-spec-assets.mjs) and CG-16 in
[`CONFORMANCE.md`](../../../../CONFORMANCE.md)):

| Folder | Source | Spec path (`<src>` below) |
| --- | --- | --- |
| `minimum`, `basic` | Factur-X **1.09 / ZUGFeRD 2.5 FINAL (2026-06-10)** | `spec/factur-x-1.09/distribution/4. FACTUR-X_1.09_XSD_SCHEMATRON_2026-06-10/<n>. Factur-X_1.09_<LEVEL>/` (XSLT in `_XSLT_<LEVEL>/`) |
| `basicwl`, `en16931`, `extended` | Factur-X **1.09.2.fixFR04**, from FNFE-MPE "Schematrons FR CTC" 1.4.0.04 | `spec/fnfe-ctc-fr-1.4.0.04/distribution/Factur-X_1.09.2.fixFR04/<LEVEL>/` (XSD in `1xsd/`, XSLT in `2xslt/`) |

FNFE-MPE only ships 1.09.2.fixFR04 for the three profiles in scope of the French reform (release
notes p.9, p.11), so MINIMUM and BASIC stay on 1.09 FINAL. Files keep their upstream names and line
endings (CRLF in 1.09 FINAL, LF in 1.09.2.fixFR04).

| File | Purpose | Shipped in package |
|---|---|---|
| `Factur-X_[1.09_]<LEVEL>.xsd` + `Factur-X_1.09[.2]_<LEVEL>_urn_*.xsd` | Structural (XSD) validation — used by `check()` | yes |
| `FACTUR-X_<LEVEL>.xslt` | ISO-Schematron compiled to XSLT 2.0 (provenance / regeneration source) | **no** |
| `FACTUR-X_<LEVEL>.sef.json.gz` | Above XSLT precompiled to a relocatable Saxon SEF, gzipped — used by `validateSchematron()` | yes |
| `FACTUR-X_<LEVEL>_codedb.xml` | Code-list database loaded by the Schematron via `document(...)` | yes |

The `.sef.json.gz` files are the runtime artifact; the `.xslt` are kept only so the SEF can be
audited and regenerated. At runtime the SEF is decompressed next to its `codedb.xml` in a temp
directory so the transform's relative `document()` call resolves (see `../../schematron.ts`).

The committed `.xslt` are the upstream transforms with one patch applied: every `sum(...)` not already
written `xs:decimal(sum(...))` is wrapped in `xs:decimal(...)` (see `scripts/patch-schematron-sum.mjs`;
the patch is idempotent). This works around a SaxonJS-HE static-typing bug (`XPTY0004`) where
`round(sum(untyped)) op xs:decimal(N)` is inferred as decimal arithmetic but `sum()` returns `xs:double`
at runtime — it surfaced on the EXTENDED profile's FLWOR-based BR-CO rules. The patch does not change
rule semantics (monetary sums are decimals). Upstream already casts a few sums itself (2 in BASIC and
EN16931, 8 in EXTENDED).

The `*_codedb.xml` files are vendored **verbatim** from the spec. Some country-code lists contain
duplicate `<enumeration>` entries (e.g. `1A`, `XI`) — this is a spec-level artifact and is harmless:
the Schematron checks set membership (`cl[@id=N]/enumeration[@value=$x]`), for which duplicates are
inconsequential. They are intentionally left unmodified to keep the files identical to the spec.

## Regenerating the SEF (e.g. when upgrading the spec)

The official distributions are versioned under [`spec/`](../../../../spec/README.md).

```bash
# from the repo root, per profile (example: en16931 from 1.09.2.fixFR04)
FR04=spec/fnfe-ctc-fr-1.4.0.04/distribution/Factur-X_1.09.2.fixFR04/EN16931
cp "$FR04"/1xsd/*.xsd                                                 src/lib/xsd/facturx/en16931/
cp "$FR04"/2xslt/FACTUR-X_EN16931.xslt "$FR04"/2xslt/FACTUR-X_EN16931_codedb.xml src/lib/xsd/facturx/en16931/

# 1. apply the SaxonJS XPTY0004 workaround
node scripts/patch-schematron-sum.mjs src/lib/xsd/facturx/en16931/FACTUR-X_EN16931.xslt

# 2. compile to a relocatable SEF from a neutral path, and gzip it
mkdir -p /tmp/facturx-sef/en16931
cp src/lib/xsd/facturx/en16931/FACTUR-X_EN16931.xslt /tmp/facturx-sef/en16931/
npx xslt3 -xsl:/tmp/facturx-sef/en16931/FACTUR-X_EN16931.xslt \
  -export:/tmp/facturx-sef/en16931/FACTUR-X_EN16931.sef.json -relocate:on -nogo
gzip -9 -n -c /tmp/facturx-sef/en16931/FACTUR-X_EN16931.sef.json > src/lib/xsd/facturx/en16931/FACTUR-X_EN16931.sef.json.gz
```

`-relocate:on` is required so `document('…codedb.xml')` resolves relative to the SEF's runtime
location rather than its compile-time path. The SEF still records the absolute path of the XSLT it was
compiled from (`base`), hence the neutral `/tmp/facturx-sef/<level>/` location: compiling inside the
checkout would leak that path into the published package. Every shipped SEF is
compiled this way.

Then run `pnpm spec:verify`: it checks every `.xsd` / `_codedb.xml` is byte-identical to its source,
every `.xslt` is identical after the `sum()` patch (and that a second patch run is a no-op), and every
`.sef.json.gz` matches a fresh compilation of the `.xslt` of the same name (ignoring build timestamp,
checksum and absolute base URIs). A new vendored folder needs one entry in `SOURCES`.
