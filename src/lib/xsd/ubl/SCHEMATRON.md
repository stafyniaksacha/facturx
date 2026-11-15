# Vendored UBL 2.1 invoice assets (EN16931, EXTENDED-CTC-FR, BR-FR-Flux2)

UBL 2.1 invoices and credit notes, validated in the three steps of the FNFE-MPE release notes (p.9): the
UBL 2.1 XSD, the level Schematron, then the French CTC rules. Source: FNFE-MPE **"Schematrons FR CTC"
v1.4.0, fix 04**, vendored verbatim under
[`spec/fnfe-ctc-fr-1.4.0.04/distribution/UBL/`](../../../../spec/README.md), except for the `sum()` patch
below.

| File | Purpose | Shipped in package |
|---|---|---|
| `maindoc/UBL-Invoice-2.1.xsd`, `maindoc/UBL-CreditNote-2.1.xsd` | UBL 2.1 root schemas: step 1. Byte-identical to `1xsd_UBL2.1/maindoc/` | yes |
| `common/*.xsd` | The import closure of the two maindocs only (13 of the release's 14 `common/` schemas; `UBL-CoreComponentParameters-2.1.xsd` is not imported). Byte-identical to `1xsd_UBL2.1/common/`; the maindocs import `../common/…`, so the layout is kept | yes |
| `en16931/EN16931-UBL-validation.xslt` | EN 16931 UBL Schematron compiled to XSLT 2.0 by FNFE-MPE, with the `sum()` patch (provenance / regeneration source) | **no** |
| `en16931/EN16931-UBL-validation.sef.json.gz` | Above XSLT precompiled to a relocatable Saxon SEF, gzipped: the runtime artefact (step 2) | yes |
| `extended-ctc-fr/EXTENDED-CTC-FR-UBL.xslt` | EXTENDED-CTC-FR UBL Schematron, with the `sum()` patch | **no** |
| `extended-ctc-fr/EXTENDED-CTC-FR-UBL.sef.json.gz` | Its SEF (step 2) | yes |
| `fr-ctc/BR-FR-Flux2-Schematron-UBL.xslt` | BR-FR-Flux2 for UBL, **verbatim** | **no** |
| `fr-ctc/BR-FR-Flux2-Schematron-UBL.sef.json.gz` | Its SEF (step 3) | yes |

## Provenance

- **Standard ("fatal") variant only.** The release also ships `BR-FR-Flux2-Schematron-UBL_WARNING.xslt`;
  its transition window closed (release notes p.6). It is not vendored, and `pnpm spec:verify` fails if
  any `_WARNING` file appears here.
- **BR-FR UBL is one file.** `BR-FR-Flux2-Schematron-UBL.xslt` is byte-identical in `EN16931/2xslt/` and
  `EXTENDED-CTC-FR/2xslt/`; `pnpm spec:verify` checks the vendored copy against both. It has no
  `round(sum(` and is vendored unpatched, like `../fr-ctc/`.
- **`sum()` patch on the two step-2 transforms.** `EN16931-UBL-validation.xslt` (6 `round(sum(`) and
  `EXTENDED-CTC-FR-UBL.xslt` (58) get the same patch as the Factur-X folders (see
  [`../facturx/SCHEMATRON.md`](../facturx/SCHEMATRON.md), `scripts/patch-schematron-sum.mjs`): every
  `sum(...)` not already written `xs:decimal(sum(...))` is wrapped in `xs:decimal(...)` (152 and 60 calls
  respectively; idempotent). Reason: SaxonJS-HE static typing (`XPTY0004`) on `round(sum(untyped)) op
  xs:decimal(N)`. Checked on the 12 annex B UBL examples (`spec/afnor-xp-z12-012-1.4/`, `*_UBL_Commentee.xml`,
  EN16931 and EXTENDED-CTC-FR transforms respectively): the unpatched transforms raised no `XPTY0004`, and
  the patched and unpatched transforms returned the same failed-assert ids on all 12. The patch is applied
  for uniformity with the Factur-X folders and for decimal-correct sums on amounts with more than 2
  decimals, not because the corpus needs it.
- **No `document()`, no `xsl:include` / `xsl:import`** in any of the three transforms: no codedb is
  shipped.
- **Licence.** Same release, same terms as BR-FR-Flux2 CII: release notes p.8 say Apache 2.0; the `.sch`
  header says "EUPL version 1.4.0" (`CONFORMANCE.md` CG-15). Shipped on the same basis as BR-FR.
- **Only fatal findings are errors**: the vendored Schematrons mark asserts `fatal` or `warning`;
  `warning` is reported as a warning, never as an error (`check()`, `validateSchematron()`,
  `validateFrCtc()`).
- **Rule ids are the assert `@id`** (`idSource: 'assert'` in `UBL_SCHEMATRON`): in
  `EXTENDED-CTC-FR-UBL.xslt` 8 asserts have a message `[ID]` prefix that is not their `@id`
  (`CONFORMANCE.md` CG-43).
- **XSD provenance.** The release notes (p.9, p.11) and `UBL2.1_README.md` say the UBL 2.1 XSD is not
  provided (get it from OASIS), yet `1xsd_UBL2.1/` is in the distribution. `pnpm spec:verify` proves the
  vendored copy identical to it, not to OASIS os-UBL-2.1, which is unverified (`CONFORMANCE.md` CG-45).

## Regenerating

```bash
# from the repo root; compiled with xslt3 / SaxonJS 2.7.0
release=spec/fnfe-ctc-fr-1.4.0.04/distribution/UBL
u=src/lib/xsd/ubl
mkdir -p $u/maindoc $u/common $u/en16931 $u/extended-ctc-fr $u/fr-ctc
cp "$release"/1xsd_UBL2.1/maindoc/UBL-Invoice-2.1.xsd "$release"/1xsd_UBL2.1/maindoc/UBL-CreditNote-2.1.xsd $u/maindoc/
# the import closure of the two maindocs (13 schemas): everything in common/ except UBL-CoreComponentParameters-2.1.xsd
for f in "$release"/1xsd_UBL2.1/common/*.xsd; do
  [ "$(basename "$f")" = UBL-CoreComponentParameters-2.1.xsd ] || cp "$f" $u/common/
done
cp "$release"/EN16931/2xslt/EN16931-UBL-validation.xslt $u/en16931/
cp "$release"/EXTENDED-CTC-FR/2xslt/EXTENDED-CTC-FR-UBL.xslt $u/extended-ctc-fr/
cp "$release"/EN16931/2xslt/BR-FR-Flux2-Schematron-UBL.xslt $u/fr-ctc/
node scripts/patch-schematron-sum.mjs $u/en16931/EN16931-UBL-validation.xslt
node scripts/patch-schematron-sum.mjs $u/extended-ctc-fr/EXTENDED-CTC-FR-UBL.xslt

build() { # <folder> <name>
  mkdir -p /tmp/facturx-sef/ubl-$1
  cp $u/$1/$2.xslt /tmp/facturx-sef/ubl-$1/
  npx xslt3 -xsl:/tmp/facturx-sef/ubl-$1/$2.xslt -export:/tmp/facturx-sef/ubl-$1/$2.sef.json -relocate:on -nogo
  gzip -9 -n -c /tmp/facturx-sef/ubl-$1/$2.sef.json > $u/$1/$2.sef.json.gz
}
build en16931 EN16931-UBL-validation
build extended-ctc-fr EXTENDED-CTC-FR-UBL
build fr-ctc BR-FR-Flux2-Schematron-UBL

pnpm spec:verify
```

Compile from the neutral `/tmp/facturx-sef/ubl-<folder>/` paths: the SEF records the absolute path it was
compiled from (`file:///private/tmp/…` on macOS). Review a regenerated SEF diff like code: SaxonJS
executes it. `pnpm spec:verify` walks the `schemaLocation` closure of both maindocs (it fails on a missing
schema, or one resolving outside this folder), requires every vendored file to trace to a release file,
and with `--sef` recompiles each SEF.
