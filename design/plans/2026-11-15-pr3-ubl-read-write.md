# PR ③ — UBL reader and writer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write and read UBL 2.1 Invoice / CreditNote from the EN 16931 model of PR ②, at `en16931` and `extended-ctc-fr`, proven against the 12 annex B UBL examples and against their CII twins.

**Architecture:** `invoiceToUbl` builds a libxml2-wasm DOM in UBL 2.1 `xs:sequence` order, the way `src/lib/converters/facturx.ts` builds CII; `ublToInvoice` reads it back with XPath, the way `src/lib/parsers/facturx.ts` reads CII. The reader computes `dropped` by difference, like `fromCii`: read → write → compare element paths with content. Two root-level helpers pick the syntax.

**Tech Stack:** TypeScript (ESM), libxml2-wasm, vitest on the built `dist/`.

**Spec:** [`design/2026-11-15-ubl-en16931-model-design.md`](../2026-11-15-ubl-en16931-model-design.md), section "PR ③ — UBL reader and writer". **Stacked on PR ②.**

## Global Constraints

- Everything in PR ① and PR ② Global Constraints applies.
- Mapping sources, in this order: the vendored UBL XSD and Schematrons (`src/lib/xsd/ubl/`), then the annex B UBL examples, then annex A `annex-a--Flux_2_UBL_EN16931_FR.csv` / `annex-a--Flux_2_UBL_EXT-CTC-FR.csv` (column 1 `ID`, column 8 `Xpath`). Every disagreement between them gets a `CONFORMANCE.md` entry.
- Root element: `CreditNote` (`cbc:CreditNoteTypeCode`) when BT-3 is one of `81 83 261 262 296 308 381 396 420 458 502 503 532` (BR-CL-01 of `EN16931-UBL-validation`; confirm `EXTENDED-CTC-FR-UBL` uses the same list and record it if not), otherwise `Invoice` (`cbc:InvoiceTypeCode`). Option `root` overrides.
- `cbc:CustomizationID`: `urn:cen.eu:en16931:2017` at `en16931`, `urn:cen.eu:en16931:2017#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr` at `extended-ctc-fr`.
- Dates written ISO `YYYY-MM-DD`; amounts with `currencyID`; unit prices and quantities never rounded (reuse the decimal formatting helpers of `converters/facturx.ts`, which avoid exponent notation, CG-28).
- Writers throw, naming the term, for a value the target can't carry (an `EXT-FR-FE` value at `en16931`; a term with no UBL place, e.g. `EXT-FR-FE-184` / `EXT-FR-FE-158` once confirmed against the XSD and Schematron). Readers return `{ invoice, dropped }`.
- Return types follow the CII API: writers return `Promise<XmlDocument>` like `invoiceToXml` (the design doc wrote "string"; `XmlDocument` keeps the two writers interchangeable — the caller serialises with `.toString()` and disposes).

## Review Focus

1. **A Peppol BIS UBL invoice** (CIUS `#compliant#` id) with UBL elements outside the model: reading it returns them in `dropped`, never silently. → Task 2 test.
2. **A credit note** (UC5b) round-trips as `CreditNote`, and a 381 invoice built from scratch is written as `CreditNote`. → Task 1 test.
3. **Line-level allowances with sub-cent unit prices** (UC11, UC13) keep their digits. → Task 1 test.
4. **XML-special and non-ASCII text** survives write → read. → Task 1 test.
5. **An `XmlDocument` passed by the caller to `ublToInvoice`** is not disposed. → Task 2 test.

---

### Task 1: UBL writer

**Files:** Create `src/lib/converters/ubl.ts`; Test `tests/ubl-writer.test.ts`.

**Interfaces:**
- Consumes: PR ② `Invoice`, `En16931Level`, `Identifier`; PR ① constants `UBL_INVOICE_NS`, `UBL_CREDITNOTE_NS`, `UBL_CBC_NS`, the two CustomizationID constants; `check()`.
- Produces: `export async function invoiceToUbl(invoice: Invoice, options: { level: 'en16931' | 'extended-ctc-fr', root?: 'Invoice' | 'CreditNote' }): Promise<XmlDocument>`; `export const UBL_CREDIT_NOTE_TYPE_CODES: ReadonlySet<string>`.

- [ ] **Step 1: Write the failing tests.** Inputs come from the CII twins of the annex B UBL files (PR ② `fromCii(xmlToInvoice(cii))`), so the writer is tested before the reader exists.

```text
it.each(twins)('$name: written UBL passes XSD + profile + BR-FR at its level', ...)
// twins: each annex B UBL file paired with the CII file of the same case and level (F202500001, UC1, UC4, UC4b, UC5, UC5b at EN16931; F202500001, UC1, UC10–UC13 at EXTENDED-CTC-FR — match by case id and level token in the file name)
// check({ xml: (await invoiceToUbl(invoice, { level })).toString(), schematron: true, frCtc: true }) → valid, no error, no warning
it('writes a credit note as CreditNote with CreditNoteTypeCode', ...)  // UC5b → root 'CreditNote', namespace UBL_CREDITNOTE_NS
it('writes type code 381 built from scratch as CreditNote', ...)
it('keeps sub-cent unit prices and long quantities exact', ...)       // UC11/UC13: cbc:PriceAmount text equals the annex B UBL file's
it('escapes XML-special and non-ASCII text', ...)                     // seller name 'Société & Fils <SARL> €' → well-formed, read back equal by XPath
it('throws on an EXT-FR-FE value at en16931', ...)
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm build && pnpm vitest run tests/ubl-writer.test.ts` (module not found).
- [ ] **Step 3: Implement** element by element in XSD sequence order (header → parties → delivery → payment → allowances/charges → tax total → monetary total → lines). A Schematron finding on a twin is a mapping bug unless the UBL file itself shows the same construct; then record it.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(ubl): write UBL 2.1 invoices and credit notes from the EN 16931 model`

### Task 2: UBL reader and round trip

**Files:** Create `src/lib/parsers/ubl.ts`; Test `tests/ubl-reader.test.ts`.

**Interfaces:**
- Consumes: Task 1 `invoiceToUbl`; PR ① `getUblLevel`.
- Produces: `export async function ublToInvoice(xml: string | Buffer | XmlDocument): Promise<{ invoice: Invoice, dropped: string[] }>`. `dropped` = every element/attribute path with content in the input that has no equal counterpart in `invoiceToUbl(invoice, { level: getUblLevel(doc), root })`; paths XPath-like with UBL prefixes (`/Invoice/cac:…/cbc:…[n]`).

- [ ] **Step 1: Write the failing tests**

```text
it.each(ublExamples)('$name: read → write → read gives the same model and nothing dropped', ...)
it.each(ublExamples)('$name: re-written UBL passes XSD + profile + BR-FR', ...)
it('reports UBL elements outside the model in dropped', ...) // add a cac:ProjectReference-like element allowed by XSD and only warned by UBL-CR-* (pick one from EN16931-UBL-validation) to a Peppol-ID'd copy → its path in dropped
it('does not dispose an XmlDocument passed by the caller', ...)
it('rejects a non-UBL document', ...)                         // CII input → throws /UBL/
```

- [ ] **Step 2: Run, expect FAIL.** `pnpm build && pnpm vitest run tests/ubl-reader.test.ts`
- [ ] **Step 3: Implement** the reader as the inverse of Task 1 (same lockstep rule as the CII converter ⇄ parser).
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(ubl): read UBL 2.1 invoices and credit notes into the EN 16931 model`

### Task 3: Cross-syntax proof, convenience API, docs, register

**Files:** Create `tests/ubl-cross-syntax.test.ts`; Modify `src/index.ts` (export `invoiceToUbl`, `ublToInvoice`, `en16931ToXml`, `xmlToEn16931`; add the first two to `EN16931`-subpath entry too), create `src/lib/en16931.ts` for the two helpers; docs (`docs/guide/en16931-model.md` UBL section, `validation.md`, `README.md`, `upgrading.md`), an `examples/` script, `CONFORMANCE.md`.

**Interfaces:**
- `export async function en16931ToXml(invoice: Invoice, options: { syntax: 'cii' | 'ubl', level: En16931Level }): Promise<XmlDocument>` — `cii` → `invoiceToXml(toCii(invoice, { level }))`; `ubl` → `invoiceToUbl` (level must be `en16931` | `extended-ctc-fr`, else throw).
- `export async function xmlToEn16931(xml: string | Buffer | XmlDocument): Promise<{ invoice: Invoice, dropped: string[], syntax: 'cii' | 'ubl' }>` — dispatch on `getFlavor`: `facturx` → `fromCii(await xmlToInvoice(xml))`, `ubl` → `ublToInvoice`; anything else throws.

- [ ] **Step 1: Write the failing tests**

```text
it.each(twins)('$name: the UBL and CII publications give the same model', async ({ ubl, cii }) => {
  const a = (await ublToInvoice(await readFile(ubl))).invoice
  const b = fromCii(await xmlToInvoice(await readFile(cii))).invoice
  expect(a).toEqual(b)
})
// A genuine difference between the two published files is listed in a KNOWN_DIFFERENCES table in the test (case, term id, reason) and in CONFORMANCE.md; the comparison deletes only those terms. Never loosen toEqual otherwise.
it('converts CII to UBL and back', ...)  // xmlToEn16931(cii) → en16931ToXml(..., {syntax:'ubl'}) → xmlToEn16931 → same invoice
it('xmlToEn16931 rejects Order-X', ...)
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the helpers; write the docs (UBL is XML-only, not embeddable; `dropped` and the writer throws are documented); `CONFORMANCE.md` Verified rows for the UBL round trip and the cross-syntax equality, plus one entry per known difference or annex A disagreement found.
- [ ] **Step 4: Full verification** — `pnpm build && pnpm lint && pnpm typecheck && pnpm test && pnpm spec:verify && pnpm docs:build && pnpm --filter @stafyniaksacha/facturx-examples run examples`, Expected: all green, `tests/api-surface.test.ts` unchanged.
- [ ] **Step 5: Spec-conformance review** on PR ②'s tip`..HEAD`; re-check each finding.
- [ ] **Step 6: Commit** `feat(ubl): convert between CII and UBL through the EN 16931 model`
