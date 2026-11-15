# Vendored CDAR lifecycle message assets (BR-FR-CDV)

French e-invoicing lifecycle status messages ("cycle de vie", CDV) in UN/CEFACT Cross Domain
Acknowledgement and Response (CDAR) D22B. Source: FNFE-MPE **"Schematrons FR CTC" v1.4.0, fix 04**,
vendored verbatim under [`spec/fnfe-ctc-fr-1.4.0.04/distribution/CDAR/`](../../../../spec/README.md).
Used by `validateCdar()` (see `../../cdar.ts`). Validate-only: the library does not build CDAR messages.

| File | Purpose | Shipped in package |
|---|---|---|
| `CrossDomainAcknowledgementAndResponse_100pD22B*.xsd` | The "uncoupled" CDAR D22B XSD (code lists not enforced): step 1 of release notes p.10. Byte-identical to `1xsd-CDAR_D22B_uncoupled/` | yes |
| `BR-FR-CDV-Schematron-CDAR.xslt` | ISO-Schematron compiled to XSLT 2.0 by FNFE-MPE, **verbatim** (provenance / regeneration source) | **no** |
| `BR-FR-CDV-Schematron-CDAR.sef.json.gz` | Above XSLT precompiled to a relocatable Saxon SEF, gzipped: the runtime artefact (step 2) | yes |

## Provenance

- **Standard ("fatal") variant only.** 40 asserts are flagged `fatal` and 3 `warning`
  (`BR-FR-CDV-13_MDT-129-2`, `BR-FR-CDV-CL-06_MDT-105`, `BR-FR-CDV-CL-06_MDT-115`). The `_WARNING`
  variant (all 43 `warning`) is not vendored, and `pnpm spec:verify` fails if it is.
- **No local modification.** No `sum()`, no `document()`, no `xsl:include` / `xsl:import`.
- **Licence.** Same release, same terms as BR-FR-Flux2: release notes p.8 say Apache 2.0; the `.sch`
  header says "EUPL version 1.4.0" (`CONFORMANCE.md` CG-15). Shipped on the same basis as BR-FR.
- **Rule ids** live in the SVRL `@id` of each assert (`BR-FR-CDV-CL-09_MDT-113_200`). `cdar.ts` reports
  the rule (`BR-FR-CDV-CL-09`) as `id` and the raw assert id as `assertId`. Messages are in French and
  quote message values.

## Regenerating

```bash
# from the repo root; compiled with xslt3 / SaxonJS 2.7.0
release=spec/fnfe-ctc-fr-1.4.0.04/distribution/CDAR
cp "$release"/1xsd-CDAR_D22B_uncoupled/*.xsd "$release"/2xslt/BR-FR-CDV-Schematron-CDAR.xslt src/lib/xsd/cdar/

mkdir -p /tmp/facturx-sef/cdar
cp src/lib/xsd/cdar/BR-FR-CDV-Schematron-CDAR.xslt /tmp/facturx-sef/cdar/
npx xslt3 -xsl:/tmp/facturx-sef/cdar/BR-FR-CDV-Schematron-CDAR.xslt \
  -export:/tmp/facturx-sef/cdar/BR-FR-CDV-Schematron-CDAR.sef.json -relocate:on -nogo
gzip -9 -n -c /tmp/facturx-sef/cdar/BR-FR-CDV-Schematron-CDAR.sef.json > src/lib/xsd/cdar/BR-FR-CDV-Schematron-CDAR.sef.json.gz

pnpm spec:verify
```

Compile from the neutral `/tmp/facturx-sef/cdar/` path: the SEF records the absolute path it was
compiled from. Review a regenerated SEF diff like code: SaxonJS executes it.
