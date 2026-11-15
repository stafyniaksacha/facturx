# Vendored French CTC rules (BR-FR-Flux2, CII)

The French e-invoicing reform business rules for invoices in UN/CEFACT CII D22B, hence for the
`factur-x.xml` of a Factur-X invoice. Source: FNFE-MPE **"Schematrons FR CTC" v1.4.0, fix 04**
(XP Z12-012 v1.4.0), vendored verbatim under
[`spec/fnfe-ctc-fr-1.4.0.04/`](../../../../spec/README.md). Used by `validateFrCtc()` and
`check({ frCtc: true })` (see `../../fr-ctc.ts`).

| File | Purpose | Shipped in package |
|---|---|---|
| `BR-FR-Flux2-Schematron-CII.xslt` | ISO-Schematron compiled to XSLT 2.0 by FNFE-MPE, **verbatim** (provenance / regeneration source) | **no** |
| `BR-FR-Flux2-Schematron-CII.sef.json.gz` | Above XSLT precompiled to a relocatable Saxon SEF, gzipped: the runtime artefact | yes |

## Provenance

- The release ships the same transform five times, byte-identical (SHA-256
  `02c9b97965438c1f587269a07daa5191b15efd3408f913b57bd35570f439ef10`):
  `Factur-X_1.09.2.fixFR04/{BASICWL,EN16931,EXTENDED}/2xslt/` and `CII/{EN16931,EXTENDED-CTC-FR}/2xslt/`.
  `pnpm spec:verify` checks the vendored copy against all five.
- **Standard ("fatal") variant only.** All 171 asserts are flagged `fatal`. The `_WARNING` variant (145 of
  its 171 asserts flagged `warning`) was meant for a transition window that closed on 2026-08-31 (sending)
  and 2026-09-30 (reception) (release notes p.6). It is not vendored, and `spec:verify` fails if it is.
- **No local modification.** Unlike the Factur-X transforms, it needs no `sum()` patch (no
  `round(sum(…))`), loads no code list (no `document()`), and has no `xsl:include` / `xsl:import`.
- **Licence.** Release notes p.8: royalty-free, "AS IS", under the Apache 2.0 licence. The `.sch` headers
  and the PDF footers say otherwise (`CONFORMANCE.md` CG-15). The maintainer decided to ship the compiled
  rules on the basis of the Apache-2.0 statement.
- **Rule ids** live in the SVRL `@id` of each assert (`BR-FR-01_BT-1`, `BR-FR-32-LEGALID`), not in a message
  prefix (one exception, `[BR-FR-28]`). `fr-ctc.ts` reports the rule (`BR-FR-01`) as `id` and the raw
  assert id as `assertId`. Messages are in French and quote invoice values: they are personal data.

## Regenerating the SEF

Compile from a **neutral directory**: the SEF records the absolute path of the XSLT it was compiled from
(`base`), and a path under a home directory or checkout would leak into the published package (the
`.sef.json.gz` carries a checksum, so the path can't be edited out afterwards). `spec:verify` fails if the
shipped SEF contains the home directory or the repository path.

```bash
# from the repo root; compiled with xslt3 / SaxonJS 2.7.0
release=spec/fnfe-ctc-fr-1.4.0.04/distribution
cp "$release/CII/EN16931/2xslt/BR-FR-Flux2-Schematron-CII.xslt" src/lib/xsd/fr-ctc/

mkdir -p /tmp/fr-ctc
cp src/lib/xsd/fr-ctc/BR-FR-Flux2-Schematron-CII.xslt /tmp/fr-ctc/
(cd /tmp/fr-ctc && node "$OLDPWD/node_modules/xslt3/xslt3.js" -xsl:BR-FR-Flux2-Schematron-CII.xslt \
  -export:BR-FR-Flux2-Schematron-CII.sef.json -relocate:on -nogo)
gzip -9 -n -c /tmp/fr-ctc/BR-FR-Flux2-Schematron-CII.sef.json > src/lib/xsd/fr-ctc/BR-FR-Flux2-Schematron-CII.sef.json.gz
rm -r /tmp/fr-ctc

pnpm spec:verify
```

The compilation emits no warning with SaxonJS 2.7.0. Review a regenerated SEF diff like code: SaxonJS
executes it.

On upgrade, move `spec/fnfe-ctc-fr-<version>/` and the `copies` list of `verifyFrCtc()` in
`scripts/verify-spec-assets.mjs` to the new release, read its release notes against `CONFORMANCE.md`,
and refresh the BR-FR expectations in `tests/fr-ctc.test.ts`.
