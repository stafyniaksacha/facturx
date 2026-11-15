# UBL 2.1 support and a syntax-neutral EN 16931 model

Status: draft for approval · 2026-11-15 · closes CG-19

## Intent

Be compliant with the UBL half of the FNFE-MPE "Schematrons FR CTC" v1.4.0.04 release
(`spec/fnfe-ctc-fr-1.4.0.04/distribution/UBL/`), the same way the library already is for its CII half:
a UBL 2.1 invoice or credit note at the **EN16931** or **EXTENDED-CTC-FR** profile goes through the
three validation steps of the release notes (`text/release-notes-en.txt` p.9):

1. structure: UBL 2.1 XSD (`UBL-Invoice-2.1.xsd` or `UBL-CreditNote-2.1.xsd`);
2. profile rules: `EN16931-UBL-validation` (CEN) or `EXTENDED-CTC-FR-UBL`;
3. French rules: `BR-FR-Flux2-Schematron-UBL`.

Then go further than validation: read and write UBL, through a new model keyed by EN 16931 business
terms (BT/BG) that both syntaxes map to, so a caller builds an invoice once and gets CII, Factur-X
or UBL from it, and so CII ⇄ UBL conversion falls out of the design.

Delivered as a **stack of three PRs**: ① validation, ② the neutral model with its CII mapping, ③ the
UBL reader and writer.

## Goals

- `check()` / `validateSchematron()` / `validateFrCtc()` and `facturx check` accept UBL Invoice and
  CreditNote at `en16931` and `extended-ctc-fr`, running steps 1–3 above. (PR ①)
- A public, typed EN 16931 model covering every EN 16931 BT/BG plus the `EXT-FR-FE-*` fields of
  EXTENDED-CTC-FR, with a lossless mapping to and from the existing CII model for documents within
  that scope. (PR ②)
- UBL 2.1 writer and reader for that model, Invoice and CreditNote. (PR ③)
- Every claim proven by a test on official data (Factur-X corpus, XP Z12-012 annex B), and recorded
  in `CONFORMANCE.md`.

## Non-goals

- UBL inside a PDF. Factur-X / ZUGFeRD hybrids carry CII only; `generate()` and `extract()` don't
  change, except that `generate()` rejects UBL with a clear message.
- Factur-X-only fields (`BT-X-*`, the parts of Factur-X EXTENDED outside EXTENDED-CTC-FR) in the
  neutral model. Callers who need them keep using the CII classes (`Models`).
- MINIMUM and BASIC WL in the neutral model: they are not EN 16931 invoices (no lines, missing
  mandatory BTs). `fromCii()` rejects them.
- Peppol BIS, XRechnung UBL and other CIUS-specific rules (see "CustomizationID" for how their
  documents are treated). Step 4 (`BR-France-CTC-CPRO`, Chorus Pro) is not published.
- Flux 1 / Flux 10 (e-reporting, CG-21), browser support, PDF rendering.

## Anti-goals (a failure even if it works)

- **Silent data loss.** A mapping that drops a value without saying so. Anything not representable
  is reported (see `fromCii`).
- **Weakening a check to pass.** If an annex B UBL example fails a vendored rule, it is recorded as a
  `CG-xx` entry with evidence, not skipped, patched or excluded quietly.
- **Breaking the public API.** No removal or rename of an existing export, option, result field,
  model class or property (`tests/api-surface.test.ts`). The CII classes stay the CII API.
- **Hand-edited vendored assets.** Everything under `src/lib/xsd/ubl/` comes from the release through
  a `SCHEMATRON.md` and `pnpm spec:verify`.

## Constraints (from the project)

- Order of truth (AGENTS.md): vendored assets → spec text → docs. When the annex A mapping tables,
  the Schematron and the annex B examples disagree, record it in `CONFORMANCE.md`, don't pick.
- No new runtime dependency. libxml2-wasm and SaxonJS already cover XSD + Schematron; the writer uses
  the same libxml2-wasm DOM API as `src/lib/converters/facturx.ts`.
- Must keep installing on IBM i / Power / Z (CI consumer installs): no native code.
- Security: parse UBL with the default libxml2-wasm options (no `XML_PARSE_NOENT` / `DTDLOAD` /
  `XINCLUDE` / `HUGE`); Schematron messages may quote invoice values, so never put them in thrown
  errors (follow `check.ts` / `cdar.ts`, which keep only the XPath error code).
- libxml2-wasm memory: dispose what you create, never what the caller passed.
- Conventional Commits, `spec-conformance-reviewer` on every PR (CLAUDE.md).

## Approaches considered

**PR ① (validation)** has one sensible shape: follow the `cdar.ts` / `fr-ctc.ts` pattern (vendored
folder, `SCHEMATRON.md`, `spec:verify`, a runner on `runSchematron`). No alternative was worth
weighing.

**PRs ②–③ (how to model)**:

1. *CII model as the pivot*: the UBL reader and writer use the existing CII classes. Cheapest, and
   EXTENDED-CTC-FR fields already round-trip in CII (CG-18 closed). Rejected: UBL callers would build
   objects named after CII elements, and no neutral model is delivered.
2. *Hand-written BT/BG model, both syntaxes bound to it, CII through an adapter*. **Chosen** by the
   maintainer. Largest, but it is the only option that gives a syntax-neutral API, and keeping CII
   behind an adapter means the CII writer (`invoiceToXml`) stays the single CII code path, still proven
   by the existing corpora.
3. *Generate the model and the mappings from the annex A tables* (`annex-a--Flux_2_UBL_*.csv`,
   `annex-a--CII_D22B_FX_*.csv`, both keyed by BT/BG/EXT-FR-FE id). Rejected: CG-39 shows annex A gives
   some rows a neighbouring row's XPath, and the tables don't carry XSD sequence order or repeating
   group structure. They are a reference for the hand-written mapping, not its source.

## Design

### PR ① — UBL validation

**Vendored assets** in `src/lib/xsd/ubl/`, all from `spec/fnfe-ctc-fr-1.4.0.04/distribution/UBL/`,
with a `SCHEMATRON.md` (source, SHA-256, compile command) and `pnpm spec:verify` coverage:

| Step | EN16931 | EXTENDED-CTC-FR |
| --- | --- | --- |
| 1 | `1xsd_UBL2.1/maindoc/UBL-Invoice-2.1.xsd`, `UBL-CreditNote-2.1.xsd` and the `common/` files they import | same |
| 2 | `EN16931/…/EN16931-UBL-validation` | `EXTENDED-CTC-FR/…/EXTENDED-CTC-FR-UBL` |
| 3 | `BR-FR-Flux2-Schematron-UBL` | same |

- Only the two maindoc XSDs (and their import closure) are vendored, not the other 60+ UBL documents.
- Step 3: the **standard ("fatal") variant only**, as for CII (`src/lib/xsd/fr-ctc/SCHEMATRON.md`:
  the `_WARNING` variant was for the transition window).
- `.sef.json.gz` compiled with the same neutral path convention as the other SEFs
  (`/tmp/facturx-sef/<level>/`). The build ships them (check `build.config.ts` globs).

**Detection.**

- Flavor `ubl` when the root is `Invoice` in `urn:oasis:names:specification:ubl:schema:xsd:Invoice-2`
  or `CreditNote` in `urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2`. Check the namespace,
  not just the local name (`getFlavor()` matches local names today; `Invoice` is too generic).
- Level from `cbc:CustomizationID`:
  - `urn:cen.eu:en16931:2017#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr` → `extended-ctc-fr`;
  - `urn:cen.eu:en16931:2017` or `urn:cen.eu:en16931:2017#compliant#…` (a CIUS such as Peppol BIS)
    → `en16931`: a CIUS document is an EN 16931 document, so the CEN rules apply; the CIUS's own rules
    are not run (say so in the docs);
  - any other value (incl. another `#conformant#` extension) → throw, naming the value and the
    `level` option. An explicit `level` overrides detection.
- The XSD is chosen by root element, the Schematron by level. The XSD cache key includes the root.

**API surface (additive).**

- `check({ xml, schematron, frCtc })` works unchanged on UBL and reports `flavor: 'ubl'`.
- `validateSchematron({ flavor: 'ubl', level })` runs step 2; `validateFrCtc` runs step 3 and stops
  rejecting UBL (the "UBL documents throw" note in `docs/guide/upgrading.md` becomes history).
- `generate()` throws a clear error for flavor `ubl` ("UBL cannot be embedded in a Factur-X PDF").
- CLI: `facturx check` accepts UBL; `--level` help lists the UBL levels.
- Rule ids: SVRL `@id` as-is (`BR-*`, `UBL-CR-*`, `UBL-FREXT-*`, `BR-FR-*`); reuse the `idFromAssert`
  mechanism if the UBL asserts need it.

**Proof.** `tests/ubl-check.test.ts`: all 12 annex B UBL documents
(`spec/afnor-xp-z12-012-1.4/…/*_UBL_Commentee.xml`; 11 Invoice, 1 CreditNote; 6 EN16931 and
6 EXTENDED-CTC-FR by `CustomizationID`) pass steps 1–3 at the level in their file name, no error and no warning. Plus
negative cases (missing BT-1, wrong CustomizationID, a CII root with a UBL-like name, an `Invoice` in
another namespace) and an XXE probe. Any example that fails is a new `CG-xx` entry with the failing
rule, not a test exclusion.

**Docs and register.** `docs/guide/validation.md`, `french-ctc.md` ("Not covered: UBL" goes),
`profiles-and-flavors.md`, README features, `upgrading.md` (new features); `CONFORMANCE.md`: close
CG-19 with the test as proof, add a Verified row. CG-19's text is stale on one point (it implies the
UBL XSD isn't in the release; it is, `distribution/UBL/1xsd_UBL2.1/`, listed in `SHA256SUMS`).

### PR ② — the EN 16931 model and its CII mapping

**Where and how it's exposed.**

- `src/lib/models/en16931/`, exported as a new `EN16931` namespace from the package root and as a
  subpath `@stafyniaksacha/facturx/en16931`. `Models` (CII) is untouched.
- Functions: `toCii(invoice, { level })` → CII `CrossIndustryInvoiceType` (then the existing
  `invoiceToXml`), and `fromCii(cii)` → `{ invoice, dropped }`.

**Shape.** Classes with an object constructor, like the CII models, so `docs/scripts/gen-models.mjs`
can document them (extend it for a `@bt` tag). One class per business group, named after the EN 16931
term, properties named after the business terms:

- root `Invoice` (BG-0): BT-1…BT-24 scalars, then `seller` (BG-4), `buyer` (BG-7), `payee` (BG-10),
  `sellerTaxRepresentative` (BG-11), `delivery` (BG-13), `paymentInstructions` (BG-16),
  `allowances` (BG-20), `charges` (BG-21), `totals` (BG-22), `vatBreakdown` (BG-23),
  `additionalDocuments` (BG-24), `lines` (BG-25), and the other BGs in the same way.
- Every property carries its id in JSDoc (`@bt BT-1`, `@bg BG-4`, `@ext EXT-FR-FE-12`).
- `EXT-FR-FE-*` fields sit in the group they belong to in annex A (not in a separate bag), so a caller
  reads `invoice.seller.…` the same way for EN16931 and EXTENDED-CTC-FR data.
- Cardinality: the **wider** of EN 16931 and EXTENDED-CTC-FR (e.g. BT-60 becomes `0..n` in
  EXTENDED-CTC-FR, release notes p.2, "Removed UBL-SR-20": an array). Sub-lines (annex B UC12) are
  part of this scope: the model represents the line hierarchy once, and each syntax binds it its own
  way. Mandatory EN 16931 terms are required properties.

**Value types.**

- Amounts, quantities, unit prices, percentages: `number`, like the CII model, so the adapter is a
  copy and precision behaviour is the CII writer's (CG-28 applies to both).
- Dates: ISO `YYYY-MM-DD` strings. The CII adapter converts to and from format `102`; UBL uses ISO
  directly.
- Identifiers with a scheme: `{ value, schemeId? }`. Codes: `string` (code lists are checked by
  the Schematron, not the type system); JSDoc names the code list.

**Mapping rules.**

- `toCii` writes each term where the EN16931 / EXTENDED field matrices
  (`spec/factur-x-1.09/text/fields--…EN16931.csv`, `…EXTENDED.csv`) and annex A
  (`annex-a--CII_D22B_FX_EXT-CTC-FR.csv`) put it. `level` decides the guideline id (BT-24) and is
  validated against the content (an `EXT-FR-FE` field with `level: 'en16931'` is an error).
- `fromCii` throws for MINIMUM and BASIC WL, and returns in `dropped` the path of every CII element
  that holds data and has no place in the neutral model (typically `BT-X-*`). It never drops silently.
- CII paths follow the Factur-X field matrices at every level, EXTENDED-CTC-FR included, as the
  existing CII writer and `tests/extended-ctc-fr-fields.test.ts` already do. Where annex A disagrees,
  it is annex A that is shifted by a row (CG-39, already recorded); no level-dependent placement.
- "BT-X" means a Factur-X EXTENDED field with **no** EN 16931 or `EXT-FR-FE` id. Most `EXT-FR-FE`
  ids are existing EXTENDED elements under a new label (`CONFORMANCE.md`, CG-18 row); those are in
  the model, whatever the document's level. `dropped` holds only the true BT-X content.
- `toCii` accepts `EXT-FR-FE` fields at `extended` and `extended-ctc-fr` (Factur-X EXTENDED is a
  superset of EXTENDED-CTC-FR, release notes p.9) and rejects them at `basic` / `en16931`.

**Proof.**

- For every corpus document at BASIC, EN16931, EXTENDED, and every annex B CII document
  (`tests/spec-examples.test.ts`, `tests/annex-b-examples.test.ts` corpora):
  `fromCii(xmlToInvoice(xml))` → `toCii` → `invoiceToXml` passes XSD + Schematron at the same level.
- For BASIC and EN16931 documents, and EXTENDED-CTC-FR documents, `dropped` is empty and the CII model
  after the trip deep-equals the original.
- For Factur-X EXTENDED documents, `dropped` lists exactly their `BT-X-*` content; nothing else
  changes.
- A round-trip test that stresses decimals (sub-cent unit prices, many-digit quantities), XML
  escaping and non-ASCII text.

### PR ③ — UBL reader and writer

- `src/lib/converters/ubl.ts`: `invoiceToUbl(invoice, { level })` → string, elements in UBL 2.1 XSD
  `xs:sequence` order. Root: `CreditNote` (with `cbc:CreditNoteTypeCode`) for credit-note type codes,
  `Invoice` (with `cbc:InvoiceTypeCode`) otherwise. The set of credit-note codes comes from the CEN UBL
  binding as enforced by `EN16931-UBL-validation` (find the rule that constrains
  `CreditNoteTypeCode`), not from memory; a `root` option overrides.
- `src/lib/parsers/ubl.ts`: `ublToInvoice(xml)` → `{ invoice, dropped }`, reading back everything the
  writer emits (same lockstep rule as `converters/facturx.ts` ⇄ `parsers/facturx.ts`). The UBL
  Schematrons flag almost every `UBL-CR-*` restriction as `warning` (676 of 678 in
  `EN16931-UBL-validation`), so a rule-valid UBL invoice can carry elements the model doesn't hold:
  each one with content goes into `dropped`, as in `fromCii`.
- **One data-loss contract for the whole model API.** Readers (`fromCii`, `ublToInvoice`,
  `xmlToEn16931`) return `{ invoice, dropped }`. Writers (`toCii`, `invoiceToUbl`, `en16931ToXml`)
  throw, naming the term, when the invoice holds a value the target syntax or level can't carry
  (e.g. `EXT-FR-FE-184` or `EXT-FR-FE-158`, which annex A maps in CII but not in UBL — confirm against
  the UBL XSD and Schematron first). The caller put that value there, so dropping it on write would be
  silent loss. These signatures are public and can't change shape after release.
- Convenience, exported from the root: `en16931ToXml(invoice, { syntax: 'cii' | 'ubl', level })` and
  `xmlToEn16931(xml)` (detects the syntax). Names are a proposal; keep them consistent with
  `invoiceToXml` / `xmlToInvoice`.
- Mapping source, in the AGENTS.md order of truth: the vendored UBL XSD and Schematron first, then the
  annex B examples, then annex A `Flux_2_UBL_EN16931_FR` / `Flux_2_UBL_EXT-CTC-FR` as the index of
  BT/BG/EXT-FR-FE → XPath. The writer follows the highest-ranked source that settles the question;
  every disagreement gets a `CONFORMANCE.md` entry.

**Proof.**

- All 12 annex B UBL documents: `ublToInvoice` → `invoiceToUbl` passes steps 1–3 at their level,
  and the neutral model is identical after a second trip.
- **Cross-syntax**: annex B publishes the same invoice in CII and UBL for several cases (F202500001,
  UC1, UC4/UC4b, UC5/UC5b, UC10–UC13, at EN16931 and/or EXTENDED-CTC-FR). For each pair,
  `ublToInvoice(ubl)` deep-equals `fromCii(xmlToInvoice(cii)).invoice`. Each real difference
  between the two published files is listed in the test with its reason (and in `CONFORMANCE.md` if
  it's a spec inconsistency), never absorbed by loosening the comparison.
- Stress test as in PR ②, writing UBL.

## Decided by the maintainer

- Scope: the UBL bundle of FNFE CTC FR 1.4.0.04 (EN16931 and EXTENDED-CTC-FR), validation **and**
  read/write.
- Approach 2 (hand-written neutral model, CII through an adapter).
- Delivery as a stacked set of PRs.

## Calls made in this document (check these)

- Three PRs in the stack, in the order ① → ② → ③.
- Standard ("fatal") BR-FR variant only.
- CIUS documents (`#compliant#`) validated as `en16931`; other extensions rejected.
- MINIMUM and BASIC WL out of the neutral model; true `BT-X-*` (no EN 16931 / `EXT-FR-FE` id) out
  of the neutral model, reported in `dropped`; relabelled `EXT-FR-FE` fields kept at every level.
- Readers return `{ invoice, dropped }`; writers throw on a value the target can't carry.
- CII paths follow the Factur-X matrices (annex A's shifted rows, CG-39, are not followed); UBL paths
  follow XSD/Schematron → annex B → annex A.
- `number` for decimals, ISO strings for dates, classes rather than plain interfaces.
- Names: `EN16931` namespace, `toCii` / `fromCii`, `invoiceToUbl` / `ublToInvoice`,
  `en16931ToXml` / `xmlToEn16931`.
- This document lives in `design/`, not `docs/`, because VitePress publishes everything under `docs/`.

## Left to the builder

- Exact class and property names inside the model, following the rules above.
- The import closure of the UBL XSDs, the compile commands, and whether the UBL XSLTs need a
  `_codedb.xml`.
- Test file split and fixtures layout.
- Whether `getFlavor()` grows a namespace check for all flavors or only for UBL.
- How `dropped` paths are written (XPath-like strings are fine).
