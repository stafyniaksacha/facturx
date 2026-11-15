# PR ① — UBL validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `check()`, `validateSchematron()`, `validateFrCtc()` and `facturx check` validate UBL 2.1 Invoice / CreditNote at `en16931` and `extended-ctc-fr` with the three steps of the FNFE-MPE FR CTC 1.4.0.04 release, closing CG-19.

**Architecture:** Vendor the UBL half of the release into `src/lib/xsd/ubl/` (XSD, two step-2 Schematrons, the BR-FR UBL Schematron), traced by `pnpm spec:verify`. Add a `ubl` flavor detected by root element **and namespace**, a level read from `cbc:CustomizationID`, and route the existing XSD / `runSchematron` machinery to the UBL assets. No new runtime dependency.

**Tech Stack:** TypeScript (ESM), libxml2-wasm (`XsdValidator`), SaxonJS 2.7 via `runSchematron`, xslt3 (SEF compile), vitest (tests import the built `dist/`, so `pnpm build` first).

**Spec:** [`design/2026-11-15-ubl-en16931-model-design.md`](../2026-11-15-ubl-en16931-model-design.md), section "PR ① — UBL validation". Read it and `AGENTS.md` before starting.

## Global Constraints

- Order of truth: vendored assets → spec text → docs. Never hand-edit a vendored file; never loosen a check or exclude an example to make a test pass. A failing official example becomes a new `CG-xx` in `CONFORMANCE.md` with the failing rule id.
- No new runtime dependency (`package.json` `dependencies` unchanged).
- Parse input with default libxml2-wasm options only (no `XML_PARSE_NOENT` / `DTDLOAD` / `XINCLUDE` / `HUGE`).
- Errors and thrown messages never quote invoice content; Schematron dynamic errors keep only the XPath error code (pattern in `src/lib/check.ts` `runOnInvalid`).
- Dispose every `XmlDocument` / `XsdValidator` you create; never one the caller passed.
- Standard ("fatal") BR-FR variant only; `pnpm spec:verify` must fail if a `_WARNING` file is vendored.
- SEFs compiled from the neutral path `/tmp/facturx-sef/<folder>/`, `gzip -9 -n`.
- Backward compatibility: additive only; `tests/api-surface.test.ts` must stay green.
- Commits: Conventional Commits, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Levels: `en16931` ⇐ `CustomizationID` = `urn:cen.eu:en16931:2017` or starts with `urn:cen.eu:en16931:2017#compliant#`; `extended-ctc-fr` ⇐ exactly `urn:cen.eu:en16931:2017#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr`; anything else throws, naming the `level` option.
- UBL namespaces: Invoice `urn:oasis:names:specification:ubl:schema:xsd:Invoice-2`, CreditNote `urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2`, cbc `urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2`.

## Review Focus

1. **A non-UBL `<Invoice>`** (any other namespace, or none) must not be detected as `ubl`: `check()` throws "not recognized", like today. → Task 2 test `rejects an Invoice root outside the UBL namespace`.
2. **CIUS documents** (Peppol BIS `…#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0`) validate as `en16931`; an unknown `#conformant#` extension throws and names `level`. → Task 2 tests.
3. **Explicit `level: 'extended-ctc-fr'` on an EN16931 document** must throw, as `check.ts` already does for CII (the UBL step-2 Schematron may not read `CustomizationID`). → Task 3 test `rejects an explicit level the document does not declare`.
4. **XSD-invalid UBL with a non-decimal amount** must return XSD errors plus the "could not run" Schematron entry, not throw a SaxonJS error. → Task 3 test.
5. **A UBL string with a UTF-8 BOM** (annex B files have one) validates. → Task 2 test.

---

### Task 1: Vendor the UBL assets and trace them in `spec:verify`

**Files:**
- Create: `src/lib/xsd/ubl/maindoc/UBL-Invoice-2.1.xsd`, `src/lib/xsd/ubl/maindoc/UBL-CreditNote-2.1.xsd`, `src/lib/xsd/ubl/common/*.xsd` (the import closure only)
- Create: `src/lib/xsd/ubl/en16931/EN16931-UBL-validation.xslt` + `.sef.json.gz`
- Create: `src/lib/xsd/ubl/extended-ctc-fr/EXTENDED-CTC-FR-UBL.xslt` + `.sef.json.gz`
- Create: `src/lib/xsd/ubl/fr-ctc/BR-FR-Flux2-Schematron-UBL.xslt` + `.sef.json.gz`
- Create: `src/lib/xsd/ubl/SCHEMATRON.md`
- Modify: `scripts/verify-spec-assets.mjs` (new `verifyUbl()`, called after `verifyCdar()`; header comment)

**Interfaces:**
- Produces (paths relative to `src/lib/`): `./xsd/ubl/maindoc/UBL-Invoice-2.1.xsd`, `./xsd/ubl/maindoc/UBL-CreditNote-2.1.xsd`, `./xsd/ubl/en16931/EN16931-UBL-validation.sef.json.gz`, `./xsd/ubl/extended-ctc-fr/EXTENDED-CTC-FR-UBL.sef.json.gz`, `./xsd/ubl/fr-ctc/BR-FR-Flux2-Schematron-UBL.sef.json.gz`. `build.config.ts` already ships `**/*.xsd` and `**/*.sef.json.gz`; no change there.

Sources (release root `R=spec/fnfe-ctc-fr-1.4.0.04/distribution/UBL`):
- XSD: `$R/1xsd_UBL2.1/maindoc/` and `$R/1xsd_UBL2.1/common/`, keeping the `maindoc/` + `common/` layout (the maindocs import `../common/…`). Vendor the transitive closure of the two maindocs only.
- Step 2: `$R/EN16931/2xslt/EN16931-UBL-validation.xslt`, `$R/EXTENDED-CTC-FR/2xslt/EXTENDED-CTC-FR-UBL.xslt`. Both contain `round(sum(…))` (6 and 58 occurrences): apply `node scripts/patch-schematron-sum.mjs <file>` before compiling, as for the Factur-X folders, and record the reason in `SCHEMATRON.md`.
- Step 3: `BR-FR-Flux2-Schematron-UBL.xslt` (byte-identical in `$R/EN16931/2xslt/` and `$R/EXTENDED-CTC-FR/2xslt/`). It has no `round(sum(`: vendor it **unpatched**, like `src/lib/xsd/fr-ctc/`.

- [ ] **Step 1: Write `verifyUbl()`** modelled on `verifyCdar()` (`scripts/verify-spec-assets.mjs:175-239`): required inventory (the two maindocs, the three `.xslt`, the three `.sef.json.gz`); import-closure walk from each maindoc, failing on a missing schema or one resolving outside `src/lib/xsd/ubl/`; every `.xsd` byte-identical to its `1xsd_UBL2.1/` counterpart; the two step-2 `.xslt` identical to source **after** the `sum()` patch and idempotent under a second patch (reuse the existing helper the `SOURCES` loop uses); the BR-FR `.xslt` byte-identical to **both** release copies; any `_WARNING` file → FAIL; any file without a source → FAIL ("untraceable"); no `homedir()` / repo path inside a SEF; `--sef` recompiles via `verifySef()`.

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm spec:verify`
Expected: `FAIL  ubl …  required file missing from src/lib/xsd/ubl/` lines; exit code ≠ 0.

- [ ] **Step 3: Copy the assets, patch, compile.** Write `SCHEMATRON.md` (file table, provenance, licence note pointing to CG-15, the "fatal only" rule, the regeneration commands) following `src/lib/xsd/cdar/SCHEMATRON.md`; run the commands it documents. Compile each XSLT with `npx xslt3 -xsl:/tmp/facturx-sef/ubl-<folder>/<name>.xslt -export:/tmp/facturx-sef/ubl-<folder>/<name>.sef.json -relocate:on -nogo`, then `gzip -9 -n -c … > src/lib/xsd/ubl/<folder>/<name>.sef.json.gz`.

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm spec:verify`
Expected: every `ubl` line `ok`, ending with no `FAIL`; exit code 0. Also `git status` shows no file outside `src/lib/xsd/ubl/` and `scripts/` changed.

- [ ] **Step 5: Prove the verifier bites.** Temporarily copy `$R/EN16931/2xslt/BR-FR-Flux2-Schematron-UBL_WARNING.xslt` into `src/lib/xsd/ubl/fr-ctc/`, run `pnpm spec:verify`, expect `FAIL … _WARNING variant must not be vendored`; delete it, expect pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/xsd/ubl scripts/verify-spec-assets.mjs
git commit -m "feat(ubl): vendor UBL 2.1 XSD and FR CTC 1.4.0.04 UBL Schematrons"
```

---

### Task 2: Detect UBL and validate its structure (step 1)

**Files:**
- Modify: `src/lib/xml.ts` (`getFlavor`, new `getUblLevel`, `getLevel` dispatch)
- Modify: `src/lib/constants.ts` (UBL namespaces, CustomizationID constants, `UBL_SCHEMA`)
- Modify: `src/lib/xsd.ts` (`getXsd('ubl', level, …)` picks the XSD by root, cache key includes the root)
- Modify: `src/lib/check.ts` (pass the root kind through; `extended-ctc-fr` guard for UBL)
- Test: `tests/ubl-check.test.ts`

**Interfaces:**
- Produces in `src/lib/xml.ts`:
  - `getFlavor(doc: XmlDocument): string` — now returns `'ubl'` for `Invoice` in `UBL_INVOICE_NS` or `CreditNote` in `UBL_CREDITNOTE_NS`; existing flavors unchanged.
  - `getUblLevel(doc: XmlDocument): 'en16931' | 'extended-ctc-fr'` — throws `Error` naming the CustomizationID value and the `level` option for anything else, and when `cbc:CustomizationID` is absent.
  - `getLevel(doc)` — dispatches to `getUblLevel` when `getFlavor(doc) === 'ubl'`.
- Produces in `src/lib/constants.ts`: `UBL_INVOICE_NS`, `UBL_CREDITNOTE_NS`, `UBL_CBC_NS`, `UBL_EN16931_CUSTOMIZATION_ID = 'urn:cen.eu:en16931:2017'`, `UBL_EXTENDED_CTC_FR_CUSTOMIZATION_ID = 'urn:cen.eu:en16931:2017#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr'`, `UBL_SCHEMA = { Invoice: './xsd/ubl/maindoc/UBL-Invoice-2.1.xsd', CreditNote: './xsd/ubl/maindoc/UBL-CreditNote-2.1.xsd' }`, `UBL_LEVELS = ['en16931', 'extended-ctc-fr'] as const`.
- Produces in `src/lib/xsd.ts`: `getXsd(flavor: string, level: string, cache = true, root?: 'Invoice' | 'CreditNote'): Promise<XmlDocument>` — `root` is required when `flavor === 'ubl'` (throw if missing); level is validated against `UBL_LEVELS`.

- [ ] **Step 1: Write the failing tests** in `tests/ubl-check.test.ts`. Collect annex B UBL files with the `readdirSync(…, { recursive: true })` pattern of `tests/cdar.test.ts`, filtered on `_UBL_Commentee.xml`, under `spec/afnor-xp-z12-012-1.4/distribution/XP_Z12-012_Annexe_B_EXEMPLES_V1.4/Factures`. Expected level: `/EXTENDED-CTC-FR/.test(name) ? 'extended-ctc-fr' : 'en16931'`.

```text
it('finds the 12 annex B UBL examples (6 EN16931, 6 EXTENDED-CTC-FR, 1 CreditNote)', ...)
// expect(examples).toHaveLength(12); counts by level 6/6; exactly one file whose root is CreditNote (UC5b)

it.each(examples)('$name passes the UBL 2.1 XSD at its level', async ({ file, level }) => {
  const r = await check({ xml: await readFile(file) })
  expect(r).toMatchObject({ flavor: 'ubl', level, valid: true, errors: [] })
})

it('accepts a string with a BOM', ...)                         // readFile(file, 'utf8'), charCodeAt(0) === 0xFEFF, valid
it('rejects an Invoice root outside the UBL namespace', ...)   // '<Invoice xmlns="urn:example"/>' → rejects /not recognized/
it('treats a CIUS CustomizationID as en16931', ...)            // replace the ID with 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0' → level 'en16931'
it('rejects an unknown extension and names the level option', ...) // '…#conformant#urn:example:1p0:other' → rejects /level/
it('rejects a document without CustomizationID', ...)          // remove the element → rejects /CustomizationID/
it('reports XSD errors for a structurally broken invoice', ...) // drop <cbc:ID> of the invoice (BT-1) → valid false, errors.length > 0
it('does not expand external entities', ...)                    // DOCTYPE with SYSTEM "file:///etc/passwd" entity in cbc:Note → no 'root:' in errors/messages
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm build && pnpm vitest run tests/ubl-check.test.ts`
Expected: FAIL, `XML not recognized as Factur-X, Order-X or ZUGFeRD`.

- [ ] **Step 3: Implement** the Interfaces above. `getFlavor` checks `root.namespaceUri` for UBL (leave the CII/Order-X branches as they are). `check()` computes `root` once from the parsed document and passes it to `getXsd`. Update `getFlavor`'s error message to mention UBL.

- [ ] **Step 4: Run to see them pass**

Run: `pnpm build && pnpm vitest run tests/ubl-check.test.ts tests/check.test.ts`
Expected: PASS. If an annex B file fails the XSD, stop: record a `CG-xx` (file, libxml2 message without invoice values) and mark that row `it.fails` with a comment citing the CG id; do not edit the file or the XSD.

- [ ] **Step 5: Commit** `feat(ubl): detect UBL invoices and validate them against the UBL 2.1 XSD`

---

### Task 3: Profile rules for UBL (step 2)

**Files:**
- Modify: `src/lib/schematron.ts` (`UBL_SCHEMATRON` map; `validateSchematron` routes `flavor: 'ubl'`)
- Modify: `src/lib/check.ts` (`schematron: true` works for `ubl`; level-mismatch guard)
- Test: `tests/ubl-check.test.ts` (extend)

**Interfaces:**
- Consumes: Task 1 SEF paths; Task 2 `getFlavor`, `getUblLevel`, `UBL_LEVELS`.
- Produces: `export const UBL_SCHEMATRON: Map<string, SchematronConfig>` with `en16931` → `{ sef: './xsd/ubl/en16931/EN16931-UBL-validation.sef.json.gz' }` and `extended-ctc-fr` → `{ sef: './xsd/ubl/extended-ctc-fr/EXTENDED-CTC-FR-UBL.sef.json.gz' }` (no codedb: the transforms call no `document()`). Set `idFromAssert` only if Step 4 shows the rule ids are in the SVRL `@id` rather than a `[ID]` message prefix. `validateSchematron({ xml, flavor: 'ubl', level })` returns the existing `SchematronResult`.

- [ ] **Step 1: Write the failing tests**

```text
it.each(examples)('$name passes XSD + profile Schematron with no error and no warning', async ({ file, level }) => {
  const r = await check({ xml: await readFile(file), schematron: true })
  expect(r).toMatchObject({ flavor: 'ubl', level, valid: true, schematronErrors: [], schematronWarnings: [] })
})
it('reports BR-CO-15 as an error when the totals do not add up', ...) // change cbc:TaxInclusiveAmount of an EN16931 example → schematronErrors contains id 'BR-CO-15'
it('reports a UBL-CR restriction as a warning, not an error', ...)   // add an element the CEN binding forbids (pick one asserted by a UBL-CR-* rule flagged warning) → valid true, schematronWarnings has that id
it('rejects an explicit level the document does not declare', ...)   // EN16931 file + { level: 'extended-ctc-fr' } → rejects /does not match/
it('keeps XSD errors when the profile rules cannot run on invalid data', ...) // cbc:PayableAmount 'abc' → valid false, errors non-empty, schematronErrors[0].message matches /could not run/
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm build && pnpm vitest run tests/ubl-check.test.ts`
Expected: FAIL on the new tests (no Schematron for flavor `ubl`).

- [ ] **Step 3: Implement** the map and routing. The mismatch guard mirrors the CII `extended-ctc-fr` guard in `check.ts`: for `ubl`, an explicit `level` must equal `getUblLevel(doc)`.

- [ ] **Step 4: Run to see them pass**

Run: `pnpm build && pnpm vitest run tests/ubl-check.test.ts tests/schematron.test.ts`
Expected: PASS. A failing official example → `CG-xx` with the rule id, `it.fails` citing it.

- [ ] **Step 5: Commit** `feat(ubl): run the EN16931 and EXTENDED-CTC-FR UBL Schematrons`

---

### Task 4: French rules for UBL (step 3)

**Files:**
- Modify: `src/lib/fr-ctc.ts` (`FR_CTC_UBL_SCHEMATRON`; `assertFrCtcApplicable`, `declaredLevel`, `validateFrCtc` accept UBL)
- Test: `tests/fr-ctc.test.ts` (add a `describe('UBL')` block) and `tests/ubl-check.test.ts`

**Interfaces:**
- Consumes: Task 1 SEF; Task 2 `getUblLevel`.
- Produces: `export const FR_CTC_UBL_SCHEMATRON: SchematronConfig = { sef: './xsd/ubl/fr-ctc/BR-FR-Flux2-Schematron-UBL.sef.json.gz', idFromAssert: true }` (check Step 4 that `@id` carries `BR-FR-*`, as in CII). `assertFrCtcApplicable(flavor, level)` accepts `('ubl', 'en16931' | 'extended-ctc-fr')` and keeps every current CII behaviour. `validateFrCtc` picks the CII or UBL transform from the document's root, never from the caller's `flavor` alone.

- [ ] **Step 1: Write the failing tests**

```text
it.each(examples)('$name passes the full sequence (XSD + profile + BR-FR) with no finding', async ({ file, level }) => {
  const r = await check({ xml: await readFile(file), schematron: true, frCtc: true })
  expect(r).toMatchObject({ valid: true, frCtcValid: true, frCtcErrors: [], frCtcWarnings: [] })
})
it('reports a BR-FR rule on UBL with the rule as id', ...)   // break a BR-FR-checked value (e.g. a SIREN of 8 digits) → frCtcErrors contains id /^BR-FR-\d+$/ and assertId set
it('validateFrCtc no longer throws for UBL', ...)            // validateFrCtc({ xml }) resolves for an annex B UBL file
it('still rejects UBL at a level outside the reform', ...)   // validateFrCtc({ xml, level: 'basic' }) → rejects
```
Update the existing CII test that expects UBL to throw (search `tests/fr-ctc.test.ts` for `UBL`): it now asserts the UBL path, not a throw. That is a behaviour change, not a weakened check: note it in `docs/guide/upgrading.md` (Task 5).

- [ ] **Step 2: Run to see them fail**

Run: `pnpm build && pnpm vitest run tests/fr-ctc.test.ts tests/ubl-check.test.ts`
Expected: FAIL, `French CTC rules (BR-FR) apply to Factur-X / CII D22B invoices only`.

- [ ] **Step 3: Implement.** Error texts that mention "CII only" now say "CII or UBL".

- [ ] **Step 4: Run to see them pass** — same command, Expected: PASS.

- [ ] **Step 5: Commit** `feat(ubl): run the French CTC rules BR-FR-Flux2 on UBL invoices`

---

### Task 5: Reject UBL where it can't go; CLI, docs, register

**Files:**
- Modify: `src/lib/generate.ts` (throw for flavor `ubl` before any PDF work), `src/lib/xml.ts` `extractBaseInfo` (throw for `ubl`)
- Modify: `src/commands/check.ts` (descriptions: flavors incl. `ubl`; `ubl: en16931, extended-ctc-fr` in `--level`; `--schematron` text no longer "Factur-X only"; `--fr-ctc` lists UBL)
- Modify: `README.md`, `docs/guide/validation.md`, `docs/guide/french-ctc.md` (remove "Not covered: UBL invoices"), `docs/guide/profiles-and-flavors.md`, `docs/guide/upgrading.md`, `docs/cli/*` for `check`
- Modify: `CONFORMANCE.md` (close CG-19, add a Verified row with the proof command; fix CG-19's stale claim about the XSD in the closing note)
- Test: `tests/generate.test.ts`, `tests/ubl-check.test.ts`

- [ ] **Step 1: Write the failing tests**

```text
it('generate() refuses a UBL invoice', ...)     // generate({ pdf, xml: <annex B UBL> }) → rejects /UBL cannot be embedded/
it('CLI check validates a UBL file', ...)       // run node bin/facturx.mjs check <UBL file> --schematron --fr-ctc → exit 0, stdout mentions 'ubl'
```
(Use the existing CLI-test pattern in `tests/` if there is one; otherwise spawn `process.execPath` on `bin/facturx.mjs`.)

- [ ] **Step 2: Run to see them fail** — `pnpm build && pnpm vitest run tests/generate.test.ts tests/ubl-check.test.ts`, Expected: FAIL.

- [ ] **Step 3: Implement** the rejections and CLI text; update docs so every claim matches behaviour (say CIUS rules such as Peppol BIS are not run, and step 4 / Chorus Pro is unpublished).

- [ ] **Step 4: Full verification**

Run: `pnpm build && pnpm lint && pnpm typecheck && pnpm test && pnpm spec:verify && pnpm --filter @stafyniaksacha/facturx-examples run examples`
Expected: all green; `tests/api-surface.test.ts` passes unchanged.

- [ ] **Step 5: Spec-conformance review.** Run the `spec-conformance-reviewer` subagent on `main..HEAD`. Re-check each finding against the cited rule; fix or record it in `CONFORMANCE.md`.

- [ ] **Step 6: Commit** `feat(ubl): reject UBL in generate(), document UBL validation, close CG-19`
