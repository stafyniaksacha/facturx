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
  (`CONFORMANCE.md` CG-46).
- **XSD provenance.** The release notes (p.9, p.11) and `UBL2.1_README.md` say the UBL 2.1 XSD is not
  provided (get it from OASIS), yet `1xsd_UBL2.1/` is in the distribution. `pnpm spec:verify` proves the
  vendored copy identical to it, not to OASIS os-UBL-2.1, which is unverified (`CONFORMANCE.md` CG-48).

## Source SHA-256

SHA-256 of each source file in the release (`spec/fnfe-ctc-fr-1.4.0.04/distribution/UBL/<path>`), as listed in
`spec/fnfe-ctc-fr-1.4.0.04/SHA256SUMS`; each was also recomputed here and matches the listed value. The vendored
`.xslt` of the two profile Schematrons differ from their source by the `sum()` patch, the SEFs are derived
(`pnpm spec:verify` recompiles them), so only sources are listed. The compile command is under "Regenerating".

| Source file | SHA-256 | Origin of the value |
|---|---|---|
| `1xsd_UBL2.1/maindoc/UBL-Invoice-2.1.xsd` | `40fae8cb436f3a9506d7acce65ba162caef3b0bed4d5cbc0992b2153ded4edf4` | listed, matches |
| `1xsd_UBL2.1/maindoc/UBL-CreditNote-2.1.xsd` | `a54651b1225052f811bf2ba01346f13f2454e7cc3e0be290c91dd680dc7b7b1a` | listed, matches |
| `1xsd_UBL2.1/common/CCTS_CCT_SchemaModule-2.1.xsd` | `dd546e4809df86b6445589f69f0d6c9df162840ae386574ddfc1da7638103e15` | listed, matches |
| `1xsd_UBL2.1/common/UBL-CommonAggregateComponents-2.1.xsd` | `939172ad8dd057cd403e7f763f6532184dd5ed4b9de24c42ebb35db4792ba613` | listed, matches |
| `1xsd_UBL2.1/common/UBL-CommonBasicComponents-2.1.xsd` | `bd4ad043ee1d9da1c7f8018dabf739cfafdfb59143d0d16b9ef769e6b7c408a7` | listed, matches |
| `1xsd_UBL2.1/common/UBL-CommonExtensionComponents-2.1.xsd` | `ad7a4e490978adfbcfc5ec0bb20941cf11ac960ccf0c4de8791a7c731a8dbe87` | listed, matches |
| `1xsd_UBL2.1/common/UBL-CommonSignatureComponents-2.1.xsd` | `3db472305f029bba5c1ae157bfd0178f715c3f9b94bd8e6c557dbce5e88da874` | listed, matches |
| `1xsd_UBL2.1/common/UBL-ExtensionContentDataType-2.1.xsd` | `fcee77a11870208e6377ea6311b9f2a050bca24bdad8606ea02d71e9f9e72f8d` | listed, matches |
| `1xsd_UBL2.1/common/UBL-QualifiedDataTypes-2.1.xsd` | `7dcb156e610239c97ae70940cf4653b88e48c3595bf5f56a2204a32e2893e6cf` | listed, matches |
| `1xsd_UBL2.1/common/UBL-SignatureAggregateComponents-2.1.xsd` | `17bb6b62d709b4fd81449a37655af36aa6a1276ad4fdb1b2e249a5ed4b7c2172` | listed, matches |
| `1xsd_UBL2.1/common/UBL-SignatureBasicComponents-2.1.xsd` | `cef924d7ba3d1d8ade14469325cde1364f8c174e46f0198ec02da8e9e748a489` | listed, matches |
| `1xsd_UBL2.1/common/UBL-UnqualifiedDataTypes-2.1.xsd` | `09052d406b4293e2a5f9c2bfee6df10ad4d8d5f0b36e24a6349d7f7936d89eb6` | listed, matches |
| `1xsd_UBL2.1/common/UBL-XAdESv132-2.1.xsd` | `a4f726bcf8cc3f7d9ffa4dab99e005535a8e8b60dced1e5d94578d2e05afa96e` | listed, matches |
| `1xsd_UBL2.1/common/UBL-XAdESv141-2.1.xsd` | `1fa4625e9cefcb7a9abb5ac1b64315547450031eece8a55bd584e4ba4b79dbc1` | listed, matches |
| `1xsd_UBL2.1/common/UBL-xmldsig-core-schema-2.1.xsd` | `101909c9f06456d61ddcc4fb982f1d40dc357b439f393b1a2eb46e42acd60809` | listed, matches |
| `EN16931/2xslt/EN16931-UBL-validation.xslt` | `39f9d282867f1a49e7708d9e29a53da89643e1ee56f10cec1ebcf1277595fcbd` | listed, matches |
| `EXTENDED-CTC-FR/2xslt/EXTENDED-CTC-FR-UBL.xslt` | `5a30860a106680629afbbd6159d829bf5f353b835fd9eda24ea8e8e13587d4f9` | listed, matches |
| `EN16931/2xslt/BR-FR-Flux2-Schematron-UBL.xslt` | `5ab722085cf69301acdecbb70b38620524488c602316bfba34b00fb78deb8631` | listed, matches |

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
