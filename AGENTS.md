# AGENTS.md

TypeScript library + CLI (`@stafyniaksacha/facturx`, ESM-only) to **generate**, **extract**, **parse**,
**build** and **validate** Factur-X / ZUGFeRD e-invoices and Order-X orders: CII D22B XML embedded in
PDF/A-3. Target spec: **Factur-X 1.09 / ZUGFeRD 2.5** (EN 16931), vendored in [`spec/`](spec/README.md).

## Conformance comes first

This library exists to produce and check legally meaningful documents. Every change is judged against the
specification, not against the current code, tests or docs.

1. **Order of truth.** (1) the vendored validation assets in `src/lib/xsd/facturx/`, executable and
   proven identical to the spec by `pnpm spec:verify`; (2) the spec text in `spec/factur-x-1.09/`;
   (3) README, `docs/` and JSDoc, which are *claims* that must match the code. When code and spec
   disagree the code is wrong; when docs and code disagree, at least one is wrong; when the spec
   contradicts itself, record it in `CONFORMANCE.md` instead of picking a side.
2. **Never make something pass by weakening the check.** Don't edit vendored files in
   `spec/factur-x-*/distribution/` or `src/lib/xsd/` by hand, don't loosen or skip a validation, and
   don't rewrite a test expectation so it matches buggy output. Vendored assets change only through
   [`SCHEMATRON.md`](src/lib/xsd/facturx/SCHEMATRON.md), followed by `pnpm spec:verify`.
3. **Cite and reproduce.** A conformance claim or finding names its rule (`BR-*`, `BR-HYBRID-*`, an
   XSD element, or `§x.y p.N` of the spec PDF) and comes with a command that shows it.
4. **Keep the register current.** [`CONFORMANCE.md`](CONFORMANCE.md) lists what is verified and every
   known gap (`CG-xx`). Fixing a gap closes its entry and adds a proof (a test) in the same PR; finding a
   new one adds an entry with evidence.
5. **Spec-review non-trivial changes.** Any change to `src/lib/`, `src/lib/xsd/` or conformance claims
   in the docs gets a spec-conformance review before it is called done (for Claude Code: the
   `spec-conformance-reviewer` subagent).

## Commands

Requires **Node 22** (`.nvmrc`). On Node 24, `pnpm install` fails: `libxmljs@1.0.11` has no prebuilt
binary for ABI 137 and its source does not compile against V8 13.

```bash
pnpm install
pnpm build            # REQUIRED before tests: tests import the built package (dist/), not src/
pnpm test             # vitest; includes the official-example corpus (~16 s of the run)
pnpm vitest run tests/spec-examples.test.ts   # just the corpus: 56 official PDFs
pnpm spec:verify      # vendored XSD/codedb/XSLT/SEF ⇔ spec/ (~1 min, recompiles every SEF)
pnpm lint             # @antfu/eslint-config (see "Current state": fails on main)
pnpm --filter @stafyniaksacha/facturx-examples run examples   # runs every example script
pnpm docs             # VitePress dev server; regenerates docs/api/models/ from the model sources
```

`node bin/facturx.mjs <extract|generate|check> …` runs the built CLI.

## Layout

| Path | Role |
| --- | --- |
| `src/index.ts` | Public API: `check`, `extract`, `generate`, `invoiceToXml`, `xmlToInvoice`, `validateSchematron`, `Models`. Subpath exports `./models`, `./cli` |
| `src/lib/check.ts`, `xsd.ts` | XSD validation via libxmljs; schemas cached per flavor/level |
| `src/lib/schematron.ts` | Business rules: gunzips the SEF next to its `codedb.xml` in a temp dir, runs SaxonJS, parses SVRL. Factur-X only |
| `src/lib/xml.ts` | Flavor from the root element; level from the last `:` segment of `GuidelineSpecifiedDocumentContextParameter/ID`; base info for PDF metadata. Namespaces are regex-extracted because libxmljs `namespaces()` segfaults |
| `src/lib/generate.ts`, `xmp.ts`, `metadata.ts` | Attach the XML (`AFRelationship`), set Info dict + PDF/A XMP. Does **not** make the PDF PDF/A (CG-05) |
| `src/lib/extract.ts`, `pdf.ts` | Find the attachment by filename (`factur-x.xml`, `order-x.xml`, ZUGFeRD names) |
| `src/lib/constants.ts` | Schema paths per flavor/level, XMP conformance labels, UNTDID 1001 `DOC_TYPE` |
| `src/lib/models/facturx/` | Classes mirroring CII D22B (`rsm`/`ram`/`qdt`/`udt`). JSDoc `@profile` = lowest profile using the type; feeds `docs/scripts/gen-models.mjs` |
| `src/lib/converters/facturx.ts` | Model → XML, emitted in the **EXTENDED `xs:sequence` order** (a superset of all profiles) |
| `src/lib/parsers/facturx.ts` | XML → model; must read back everything the converter writes |
| `src/lib/xsd/` | Vendored assets. Build ships only `*.xsd`, `*.sef.json.gz`, `*_codedb.xml` (`build.config.ts`) |
| `src/commands/` | citty CLI subcommands |
| `spec/` | Vendored spec + derived `text/`. `spec/scripts/` is a standalone package, not in the workspace |
| `tests/`, `examples/`, `docs/` | Workspace packages. Examples are embedded in docs via `#region` snippets |

## Conventions

- **Converter ⇄ parser ⇄ model stay in lockstep.** A new field is added to the model class, emitted by
  the converter at its XSD sequence position, read by the parser, and covered by a round-trip test.
  Check the field's profile and cardinality in
  `spec/factur-x-1.09/text/fields--Factur-X_CII_D22B_<PROFILE>.csv` (e.g. `grep -n ',BT-148,'`).
- **Decimals:** only *Amount* is limited to 2 decimals. Unit prices, quantities and percentages are
  not (§7.1.5 p.35). Don't round them (CG-01).
- **XMP / PDF metadata:** UTF-8, XML-escaped, consistent with the Info dict; mirror
  `spec/factur-x-1.09/distribution/2. FACTUR-X_extension_schema_exemple.xmp.txt`.
- **New flavor or level:** `constants.ts`, `xsd.ts`, the `FACTURX_SCHEMATRON` map, CLI `--level`
  help text, `docs/guide/profiles-and-flavors.md`, tests.
- **Style:** `@antfu/eslint-config` (no semicolons, single quotes, `node:` imports, ESM only). Comments
  explain *why*, usually citing the spec. Match the surrounding code.
- **Commits:** Conventional Commits (`feat(facturx): …`, `fix(cli): …`); `CHANGELOG.md` is generated at
  release, so don't edit it by hand.
- **Generated, never hand-edited:** `dist/`, `docs/api/models/`, `spec/factur-x-*/text/`, `CHANGELOG.md`.

## Verifying conformance

| You changed | Run / check |
| --- | --- |
| anything under `src/` | `pnpm build && pnpm test` |
| `src/lib/xsd/**`, `scripts/patch-schematron-sum.mjs` | `pnpm spec:verify` |
| models / converter / parser | field matrix CSV for profile + cardinality; corpus test; a round-trip test with values that stress decimals, escaping and non-ASCII text |
| `generate.ts` / `xmp.ts` / `metadata.ts` | diff the produced XMP against the reference packet; `BR-HYBRID-*` in `text/fields--Business_Rules_HYBRID.csv` and the hybrid code lists in `text/codelists--Hybrid*.csv` / `--Filename.csv`; PDF/A needs an external validator (veraPDF, not installed here) |
| README / `docs/` | every claim matches code behaviour; run the examples |

Searching the spec: `grep -n "<term>" spec/factur-x-1.09/text/spec-main.txt` (pages start with
`=== PDF page N ===`). Per-profile detail is in `text/appendix-<profile>.txt`, business rules in
`text/fields--Business_Rules.csv`, code lists in `text/codelists--*.csv`. The PDFs themselves need
poppler to read, which is often not installed; the extracts exist so you don't have to.

Use only the spec's examples (`spec/…/5. FACTUR-X 1.09 - Examples/`), `examples/` and
`tests/fixtures/` as test data.

## Security

The library parses untrusted XML and PDFs and emits documents with legal and tax value.

- **XML parsing:** external entities are not expanded today. Never enable libxmljs `noent`, `dtdload`
  or `huge` on input documents.
- **SEF files are executable code** run by SaxonJS. Regenerate them only from the vendored XSLT via
  `SCHEMATRON.md`, then `pnpm spec:verify`. Review their diffs like code.
- **Metadata injection:** invoice fields flow into XMP and the Info dict (CG-03). Escape them.
- **Personal data:** invoices carry names, addresses, VAT IDs, IBANs. Never commit real invoices as
  fixtures, and never log or paste document contents into errors, issues or PRs.
- **Supply chain:** keep GitHub Actions pinned by SHA, installs `--frozen-lockfile`, new runtime
  dependencies justified. `libxmljs` is a native addon (see the Node 24 note above).

## Current state (audited 2026-10-26, v0.5.0)

Known so you don't rediscover them; fix them deliberately, not as a side effect of other work.

- `pnpm lint` fails on `main`: 52 errors (39 `style/indent` in `src/lib/parsers/facturx.ts`, plus `docs/**/*.md`
  snippets and `pnpm-workspace.yaml`).
- `tsc --noEmit` fails: `import … assert { type: 'json' }` in `src/cli.ts:2` and
  `src/lib/generate.ts:14` must become `with`. The build still works because unbuild inlines the JSON.
- No CI runs build, lint, test or `spec:verify`; `.github/workflows/docs.yml` only deploys docs on tags,
  on the runner's default Node (breaks if that becomes 24).
- `engines.node` is `>=20.11.0`, but Node 20 is end-of-life and Node 24 can't install `libxmljs`.
- `tests/parser.test.ts:29` is skipped. The docs nav shows `v0.4.0` (`docs/.vitepress/config.ts`), and
  `docs/package.json` is also `0.4.0`.
- The shipped `.sef.json.gz` files embed the absolute path of the checkout they were compiled in.
- Spec-level gaps: see `CONFORMANCE.md`.
