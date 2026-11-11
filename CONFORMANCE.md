# Conformance register

What this library verifiably conforms to, and every **known** deviation from the specification, with
evidence. Reviewers (human or agent) check new work against this file: a finding that matches an
open entry is "known", anything else is new.

- **Spec of record:** Factur-X 1.09 / ZUGFeRD 2.5, FINAL 2026-06-10, vendored in
  [`spec/factur-x-1.09/`](spec/README.md). Citations are `§section, p.N` of
  `distribution/1. FACTUR-X 1.09 2026 06 10 EN.pdf` (PDF page = printed page for p.1–91), or a rule
  id (`BR-*`, `BR-HYBRID-*`) / code list from `spec/factur-x-1.09/text/*.csv`. The validation assets
  (XSD + Schematron) come from two sources (CG-16):

  | Profile | XSD and Schematron of record |
  | --- | --- |
  | MINIMUM, BASIC | Factur-X 1.09 FINAL, `spec/factur-x-1.09/distribution/4. FACTUR-X_1.09_XSD_SCHEMATRON_2026-06-10/` |
  | BASIC WL, EN 16931, EXTENDED | Factur-X **1.09.2.fixFR04**, `spec/fnfe-ctc-fr-1.4.0.04/distribution/Factur-X_1.09.2.fixFR04/` (FNFE-MPE Schematrons FR CTC 1.4.0.04; release notes `text/release-notes-en.txt` p.4–5) |

  For the French reform, field cardinalities and examples are also checked against XP Z12-012 v1.4
  annexes A and B (`spec/afnor-xp-z12-012-1.4/`).
- **Severity** is the spec's own (`Fatal` / `Warning` / `Information`) where a rule id exists;
  otherwise `data-loss`, `interop` or `docs`.
- **Last audited:** 2026-10-26, against `0.6.1` (commit `1b906cd`) plus the converter fix in #25.
  Verified proofs re-run on 2026-11-11 after the move to 1.09.2.fixFR04.

## Verified (with the command that proves it)

| Claim | Proof |
| --- | --- |
| All vendored XSD and `_codedb.xml` are byte-identical to their source (per profile, see Spec of record); all XSLT identical after the documented `sum()` patch, which is idempotent; all `.sef.json.gz` reproducible from them; no vendored folder without a declared source | `pnpm spec:verify` |
| All 56 official example PDFs (11–12 per profile) extract, pass XSD + Schematron at their profile (no error and no warning), and round-trip through `xmlToInvoice` → `invoiceToXml` with an identical model (this is what caught the 0.6.x `RoleCode` regression fixed in #25) | `pnpm build && pnpm vitest run tests/spec-examples.test.ts` |
| All 24 Factur-X documents of XP Z12-012 v1.4 annex B (12 PDFs + their 12 commented CII XML, EN 16931 and EXTENDED) pass XSD + profile Schematron at the level in their name with no error and no warning, and re-serialize XSD-valid; the model round-trip is identical except for the two examples hit by CG-01, where only BT-146/BT-148 differ and only by rounding to cents | `pnpm build && pnpm vitest run tests/annex-b-examples.test.ts` |
| 1.09.2.fixFR04 behaviour: EXTENDED accepts a line VAT block without `TypeCode`/`CategoryCode` (XSD `minOccurs="0"`, release notes p.5) and the model round-trips it, EN 16931 still rejects it; detail lines, BG-23 and document allowances/charges still need both codes (`BR-FXEXT-CO-04`, `BR-47`, structural `count(ram:TypeCode)=1`); `BR-FXEXT-S-01` still accepts several S breakdowns and now catches S lines without one (1.09 FINAL's `BR-S-01` did not); two Z breakdowns no longer fire `BR-Z-01` but still fail `BR-FXEXT-Z-08b`; `BR-FXEXT-06` no longer fires on an untyped parent line; `BR-FXEXT-BR-54-1/-2` replace `BR-54`; `BR-CO-27` is `CII-SR-470` in BASIC WL / EN 16931 and gone from EXTENDED | `pnpm build && pnpm vitest run tests/fixfr04.test.ts` |
| External XML entities are not expanded with the default libxml2-wasm parse options used by `resolveXml` / `xmlToInvoice` (no XXE) | probe in the audit (entity resolves to empty / `check()` rejects the document); keep `XML_PARSE_NOENT` / `XML_PARSE_DTDLOAD` / `XML_PARSE_XINCLUDE` off |
| The XMP packet header uses the fixed packet id `W5M0MpCehiHzreSzNTczkc9d` of the reference packet `distribution/2. FACTUR-X_extension_schema_exemple.xmp.txt` (was CG-06), and `generate()` keeps a source PDF's permanent trailer `/ID` (ISO 32000-1 §14.4) instead of throwing (#37), while rejecting encrypted (§6.1 p.25) and signed sources and sources that already embed a document of the kind being written (§6 p.24 for invoices; one order per PDF for Order-X is by analogy, no Order-X spec is vendored). That document is detected by content, whatever its file name: any stream of a file (`/EF` `/F`, `/UF` or a deprecated key) in the EmbeddedFiles name tree or catalog `/AF` whose root element (namespace and name) is a CII invoice, or an Order-X order when an order is written, including UTF-8 and UTF-16 with a BOM and invoices hidden behind tricky prolog comments. A file whose name tree key, `/F` or `/UF` is a recognized invoice name (`factur-x.xml`, `xrechnung.xml`, ZUGFeRD names; `order-x.xml` for orders) is rejected too, whatever its content can be read as, and so is one already using the filename being written. Other XML is accepted as a supporting file (§6.4 p.30–32), including an Order-X order attached to an invoice. Reading untrusted input is bounded: each distinct stream is read once, inflated with node:zlib in growing slices (at most 64 KiB of compressed input and 2 MiB of output per attempt), 64 KiB of text is examined, and per PDF at most 256 distinct streams and 128 MiB of inflation are allowed (a failed attempt is charged as much as it could have produced); past either limit the PDF is rejected. Known misses are listed in CG-14 | `pnpm build && pnpm vitest run tests/generate.test.ts` |
| Schematron findings are classified by the rule's own SVRL `flag`: `warning`/`information` are reported in `warnings` and don't affect validity unless `warningsAsErrors` is set; unflagged and `fatal` ones are errors. Fired `<report>`s count like failed `<assert>`s (the Factur-X Schematrons express profile restrictions such as "@schemeID not used in the given context" as reports; before this they were silently dropped). In the vendored Factur-X XSLTs the warning-flagged rules are: MINIMUM `BR-FXEXT-{G,IC,O,Z}-08ini/-08rev`; BASIC `PEPPOL-EN16931-R008`, `BR-FX-EN-04`, `BR-FXEXT-Z-08rev`; BASIC WL none; EN 16931 `PEPPOL-EN16931-R008`, `CII-SR-474/475/476`; EXTENDED `PEPPOL-EN16931-R008`, `BR-FXEXT-04`, `CII-SR-475/476` and the `-08ini/-08rev` pairs, each backed by a blocking `-08b` rule (spelled `BR-FXEXT-S08b` for S upstream) | `pnpm build && pnpm vitest run tests/schematron.test.ts tests/fixfr04.test.ts` (severity inventory) |
| README and docs no longer claim `extract()` detects the level: it returns the flavor (from the attachment filename) and echoes `options.level`; the quick start reads the level from `check()` on the extracted XML (was CG-11) | `pnpm build && pnpm --filter @stafyniaksacha/facturx-examples run examples` (quickstart prints `facturx en16931`, not `facturx undefined`) |
| French CTC rules `BR-FR-Flux2` (FNFE-MPE Schematrons FR CTC v1.4.0.04, step 3 of the release notes p.9): the vendored `src/lib/xsd/fr-ctc/BR-FR-Flux2-Schematron-CII.xslt` is byte-identical to all five copies in the release, standard (all 171 asserts `fatal`) variant only, and its shipped SEF is reproducible and embeds no local path. `validateFrCtc` / `check({ frCtc: true })` check the document itself (the rules read neither root nor profile) and accept only a CII invoice declaring BASIC WL, EN16931 or EXTENDED (p.9, p.11; plain-CII `EXTENDED-CTC-FR` as `extended`); they throw for MINIMUM, BASIC, Order-X, UBL and a `level` that contradicts the document. All 24 Factur-X examples of XP Z12-012 v1.4 Annex B (EN16931 and EXTENDED, incl. multi-vendor, bidirectional, sub-line) pass XSD + the Factur-X profile Schematron (1.09.2.fixFR04, CG-16) + BR-FR with no finding, and the 6 plain-CII `EXTENDED-CTC-FR` examples pass BR-FR at level `extended`. Over the 34 in-scope official Factur-X 1.09 examples, 28 pass and 6 (`_Factur-X_1.08-Exemples_CS/*/Facture_F2026003{0,1}-*`) fail `BR-FR-32` (SIREN `303 656 847` written with spaces) and `BR-FR-CO-10` (seller GlobalID scheme `0088` twice), both genuine in the example data. `id` is the rule (`BR-FR-05`), taken from the SVRL `@id`, never from the message | `pnpm spec:verify`; `pnpm build && pnpm vitest run tests/fr-ctc.test.ts` |

Not verified anywhere yet: PDF/A-3 validity of `generate()` output (no veraPDF run), any Order-X
asset (no Order-X spec vendored), field-by-field coverage of the 1.09 EXTENDED additions (BT-173…177,
BT-193, BT-215, BT-216, BT-X-591; §version history p.7) against the models.

## Open gaps

| ID | Area | Rule / citation | Severity | Summary |
| --- | --- | --- | --- | --- |
| CG-01 | converter | §7.1.5 p.35 | data-loss | Unit prices truncated to 2 decimals |
| CG-02 | XMP | BR-HYBRID-02/03 | Fatal | XMP packet not UTF-8 |
| CG-03 | XMP, security | BR-HYBRID-03 | Fatal | XMP values not XML-escaped (malformed XMP, metadata injection) |
| CG-04 | PDF/A | BR-HYBRID-02 | Fatal | Info dictionary and XMP disagree (Producer, Keywords) |
| CG-05 | PDF/A | BR-HYBRID-02 | Fatal | `generate()` does not make the PDF PDF/A-3; docs claim it does |
| CG-07 | embedding | §6.2.2 p.26–27, BR-HYBRID-11 | Warning | `AFRelationship` hard-coded to `Data` |
| CG-08 | Order-X | BR-HYBRID-06/07 | Fatal | Order-X PDFs get Factur-X `INVOICE` XMP and empty conformance level |
| CG-09 | ZUGFeRD | BR-HYBRID-08/13, §6.3.2 p.29 | Fatal | `generate({ flavor: 'zugferd' })` writes a non-conformant hybrid |
| CG-10 | spec | BR-HYBRID-04 vs §6.3.1 p.28 | — | Spec is internally inconsistent on the XMP namespace URI |
| CG-12 | profiles | §7.7, `codelists--HybridConformance.csv` | interop | XRECHNUNG reference profile unsupported; no DE profile restrictions |
| CG-13 | embedding | §6.2.2 p.27, §6.4 p.31 | interop | `/Kids` levels in the EmbeddedFiles name tree: `extract()` finds no invoice, `generate()` rejects the source |
| CG-14 | embedding | §6 p.24 | interop | `generate()` can miss an existing invoice whose content it cannot read and whose name it does not recognize |
| CG-15 | spec, licence | FNFE CTC FR 1.4.0 release notes p.6, p.8 | — | The FNFE CTC FR 1.4.0.04 release contradicts itself on its licence and its applicability dates |
| CG-16 | spec, provenance | FNFE CTC FR 1.4.0 release notes p.4–6, p.9, p.11 | — | BASIC WL / EN 16931 / EXTENDED validate against Factur-X 1.09.2.fixFR04 taken from the FNFE CTC FR release, not from an official Factur-X 1.09.2 distribution; MINIMUM / BASIC stay on 1.09 FINAL |
| CG-17 | spec | 1.09 FINAL `_XSLT_*` vs `.sch` | — | The 1.09 FINAL compiled XSLTs (still used for MINIMUM and BASIC) enforce rules absent from their own `.sch` |
| CG-18 | French CTC, profiles | Annex A `annex-a--CII_D22B_FX_EXT-CTC-FR.csv`; release notes p.9 | interop | `EXTENDED-CTC-FR` CII invoices: level not detected, no XSD / Schematron |
| CG-19 | French CTC, syntax | release notes p.9-10 (`BR-FR-Flux2-Schematron-UBL`) | interop | UBL 2.1 invoices are not supported |
| CG-20 | French CTC, lifecycle | release notes p.10 (`BR-FR-CDV-*`); Annex A `annex-a--CDV_FE_-_CDAR.csv` | interop | CDAR lifecycle status messages are not validated |
| CG-21 | French CTC, e-reporting | Annex A `annex-a--E-REPORTING_-_Flux_10.csv` | interop | Flux 10 e-reporting is not supported (no licence in the release) |
| CG-22 | French CTC, coverage | release notes p.8-10; Annex A `annex-a--BR-France_CTC.csv`, `annex-a--BR-France-CTC-CPRO.csv` | interop | Annex A BR-FR rules the published Schematron does not implement (incl. `BR-FR-CPRO-*`); release notes contradict each other and the XSLT on coverage |
| CG-24 | spec, French CTC | FNFE CTC FR 1.4.0 release notes p.9 vs EXTENDED `FX-SCH-A-000636` | — | Release says Factur-X EXTENDED validates `EXTENDED-CTC-FR`; the shipped EXTENDED Schematron rejects its guideline ID (unresolved) |
| CG-23 | French CTC, upstream | `BR-FR-Flux2-Schematron-CII.xslt` | — | SVRL `test` of 4 BR-FR asserts loses its regex quantifier (`^\d{9}$` reported as `^\d9$`) |

### CG-01 — Unit prices truncated to 2 decimals

- **Spec:** §7.1.5 p.35 — *Amount* has at most 2 decimals, but *Unit Price Amount* has no limit
  (example `1000.3454`); quantities and percentages are unbounded too.
- **Code:** `convertAmount` (`src/lib/converters/facturx.ts:55`) applies `value.toFixed(2)` to every
  `udt.AmountType`, including item net/gross price `ram:ChargeAmount` and price-level
  `ram:AppliedTradeAllowanceCharge/ram:ActualAmount` (BT-146 / BT-148 / BT-147). Separately,
  `parseAmount` (`src/lib/parsers/facturx.ts:101`) stores amounts as binary floats (`parseFloat`).
- **Evidence:** set an EN16931 example's `NetPriceProductTradePrice/ChargeAmount` to `0.3456`, run
  `xmlToInvoice` → `invoiceToXml`: output is `0.35`. The Factur-X 1.09 examples do not catch it (all
  their prices are whole cents), but two XP Z12-012 annex B examples do: UC11 (BT-146 `0.6925` →
  `0.69`, 4 lines) and UC13 (BT-146/BT-148 on 5 lines, e.g. `489.057` → `489.06`, `-3.049` → `-3.05`), pinned as expected round-trip losses in
  `tests/annex-b-examples.test.ts` (`CG01_ROUND_TRIP_LOSS`, to empty when this is fixed). Directly
  affects per-kWh energy pricing.

### CG-02 — XMP packet not UTF-8

- **Code:** `src/lib/xmp.ts:102` passes a JS string to `pdf.context.stream()`; pdf-lib keeps the low
  byte of each UTF-16 code unit. `é` is written as `0xE9` (Latin-1), `€` as `0xAC`.
- **Spec:** the XMP packet (`begin=""` ⇒ UTF-8) must be valid UTF-8 for BR-HYBRID-03 and PDF/A
  metadata validation.
- **Evidence:** `generate()` with seller name `Société … €`, read the `/Metadata` stream bytes.

### CG-03 — XMP values not XML-escaped (also a security issue)

- **Code:** `src/lib/xmp.ts:14-100` interpolates `title`, `subject`, `author`, `producer`, `creator`,
  `filename`, `conformanceLevel` raw into XML. Title/subject/author come from the invoice (seller,
  buyer, number) via `baseInfo2PdfMetadata`.
- **Effect:** a seller name containing `&` or `<` yields malformed XMP (fails BR-HYBRID-03). A crafted
  seller name can inject XMP elements, e.g. a second `fx:ConformanceLevel`.
- **Evidence:** seller name `Dupont &amp; Fils` → XMP fails to parse (`xmlParseEntityRef: no name`).

### CG-04 — Info dictionary and XMP disagree

- **Code:** `generate()` sets Info `Creator` but not `Producer`, so pdf-lib's default
  `pdf-lib (https://github.com/Hopding/pdf-lib)` stays in Info while XMP `pdf:Producer` says
  `@stafyniaksacha/facturx …`. Info `Keywords` is set with no XMP `pdf:Keywords`.
- **Spec:** PDF/A requires Info-dictionary entries to be equivalent to their XMP counterparts
  (BR-HYBRID-02 → PDF/A-3). veraPDF reports this.
- **Evidence:** load the `generate()` output with `updateMetadata: false`, compare
  `getProducer()` / `getKeywords()` with the XMP.

### CG-05 — `generate()` does not produce PDF/A-3

- **Spec:** BR-HYBRID-02 (appendix 3.d, PDF p.158–159): the envelope SHALL be PDF/A-3 (or PDF/A-4f).
- **Code:** `generate()` only attaches the XML, sets the AF relationship, Info and XMP. Fonts, ICC
  output intent and the rest of PDF/A are the caller's job (see `tests/generate/index.ts`, which
  embeds a font, an sRGB OutputIntent and a TrimBox by hand). No test validates the output with
  veraPDF.
- **Docs overclaim:** README ("compliant PDF/A-3 bytes"), `docs/api/generate.md:3,45`,
  `docs/guide/getting-started.md:46`.

### CG-07 — `AFRelationship` hard-coded to `Data`

- **Spec:** §6.2.2 table p.27. France: MINIMUM / BASIC WL `Data`; BASIC / EN 16931 / EXTENDED
  `Alternative`, `Source` or `Data`. Germany: `Alternative` mandatory for BASIC and above.
  BR-HYBRID-11 (Warning).
- **Code:** `src/lib/generate.ts:110`. `Data` is valid for every profile in France, so this is a
  missing option, not a wrong default. It blocks German-compliant output.

### CG-08 — Order-X hybrid metadata

- **Spec:** hybrid code lists (`text/codelists--HybridDocument.csv`, `--HybridConformance.csv`):
  Order-X `fx:DocumentType` ∈ {`ORDER`, `ORDER_CHANGE`, `ORDER_RESPONSE`}, `fx:ConformanceLevel` ∈
  {`BASIC`, `COMFORT`, `EXTENDED`}. BR-HYBRID-06/07 are Fatal.
- **Code:** `src/lib/xmp.ts:92` always writes `INVOICE`; `src/lib/generate.ts:80-83` leaves
  `conformanceLevel` empty for `orderx`. The namespace question is CG-10.

### CG-09 — `generate()` with `flavor: 'zugferd'`

- **Code:** `src/lib/generate.ts:84-87` embeds `zugferd-invoice.xml` with the Factur-X `fx:` XMP and
  an empty conformance level. `getFlavor()` maps only the ZUGFeRD 1.0 root (`CrossIndustryDocument`)
  to `zugferd`, and `check()` has no XSD for it (throws).
- **Spec:** `zugferd-invoice.xml` is not in the HybridDocumentFilename code list (BR-HYBRID-08/13,
  Fatal). ZUGFeRD 2.0 legacy XMP uses a different schema (`zf:`, §6.3.2 p.29).
- **Docs** say `zugferd` is extraction-only (`docs/guide/profiles-and-flavors.md`). Either reject it in
  `generate()` or implement the legacy schema deliberately.

### CG-10 — Spec inconsistency on the XMP namespace (unresolved)

- §6.3.1 p.28 and the reference packet: `urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#`.
- BR-HYBRID-04 (PDF p.159, `text/fields--Business_Rules_HYBRID.csv`):
  `urn:factur-x:pdfa:CrossIndustryDocument:1p0#`, Fatal.
- The library uses the §6.3.1 form for every flavor. **Do not change it** on the strength of one
  reading. Settle it with an external validator result first, and record that result here.

### CG-12 — Reference profile XRECHNUNG and German restrictions

- XRECHNUNG (§7.7, `xrechnung.xml`, conformance `XRECHNUNG`) is not supported: `getLevel()` cannot
  parse its guideline ID and `generate()` never writes it. It is not applicable in France.
- MINIMUM and BASIC WL are "not allowed in Germany from 2025-01-01" as invoices
  (`codelists--HybridConformance.csv`). BR-HYBRID-DE-01 (Fatal, DE): MINIMUM is forbidden when buyer
  and seller are both in Germany. The library gives no warning for either.

### CG-13 — `/Kids` levels in the EmbeddedFiles name tree

- **Spec:** §6.2.2 p.27 and §6.4 p.31: "it is also allowed to insert one or two “/Kids” steps level
  between “/EmbeddedFiles” and “/Names”", and readers should accept this structure.
- **Code:** `readEmbeddedFilesNames` (`src/lib/pdf.ts`) only reads a `/Names` array on the tree root,
  so `extract()` throws `No attachment found`. `generate()` rejects such a source on purpose
  (`assertEmbeddable` in `src/lib/generate.ts`), because pdf-lib would append a `/Names` array next to
  the root's `/Kids` and produce an invalid name tree (ISO 32000-1 §7.9.6).
- **Evidence:** load `examples/Facture_FR_EN16931.pdf` with pdf-lib, move the EmbeddedFiles `/Names`
  array into a leaf under `/Kids`, save, and call `extract()` on it: `No attachment found`. For
  `generate()`, see the test `rejects inputs it cannot embed into correctly > embedded files name tree
  with /Kids` in `tests/generate.test.ts`.

### CG-14 — Existing-invoice detection is best effort

- **Spec:** §6 p.24: only one invoice XML file per PDF/A-3 document.
- **Code:** `assertNoEmbeddedInvoice` (`src/lib/generate.ts`) rejects a source PDF that already holds an
  invoice, detected by content (root element) or by a recognized file name. An embedded file whose
  content it cannot classify is accepted unless its name tree key, `/F` or `/UF` is a recognized
  invoice name. Such content includes:
  - a filter other than none or a single `/FlateDecode` without `/DecodeParms`, or broken Flate data;
  - XML with a DOCTYPE, an unterminated construct, more than 64 KiB of prolog, or a start tag that
    does not parse;
  - encodings other than UTF-8 and UTF-16 with a BOM, e.g. UTF-32 or UTF-16 without a BOM that does
    not start with `<`.

  Page-level `/AF` and file attachment annotations are not scanned. The ZUGFeRD 1 root namespace
  (`urn:ferd:CrossIndustryDocument:invoice:1p0`) is not vendored, so its detection is unverified.
- **Evidence:** the tests `accepts, as a documented gap (CG-14), an unreadable invoice with no
  recognized name: …` in `tests/generate.test.ts` cover a long prolog, `/DecodeParms`, corrupt Flate
  data and a non-dictionary `/EF`. Reviewer probes also showed UTF-32 (no BOM) invoices accepted.
- **Why not fail closed:** rejecting every file whose content cannot be classified also rejected
  legitimate §6.4 attachments (XML with a DOCTYPE, other filters, text such as `<name@host>`), and
  each hardening round of the hand-written classifier found new edge cases. The maintainer chose
  best effort plus a name backstop.

### CG-15 — FNFE CTC FR 1.4.0.04 release is internally inconsistent (unresolved)

- **Source:** [`spec/fnfe-ctc-fr-1.4.0.04/`](spec/README.md), vendored verbatim.
- **Licence:** the EN release notes state Apache-2.0 (p.8, `text/release-notes-en.txt`); the
  `BR-FR-*` and `EXTENDED-CTC-FR` `.sch` headers say "EUPL version 1.4.0", a version that does not
  exist (the CEN EN16931 files say EUPL 1.2); every PDF page footer says "All rights reserved";
  `Flux10/` has no licence text. The maintainer decided to ship compiled `BR-FR-Flux2` rules on the
  basis of the Apache-2.0 statement and to ask FNFE upstream for clarification.
- **Dates:** both release notes (p.6) say sending with the FATAL version starts September 1, 2026; the
  headers of the FATAL `BR-FR-*` and `EXTENDED-CTC-FR` `.sch` files say October 1, 2026. The reception
  deadline (no later than October 1) agrees. The PDFs describe 1.4.0 (2026-06-30), the files are fix 04
  (2026-09-04).
- **Severity:** p.6 says the standard version carries the "FATAL" flag and the `_WARNING` version
  "PASS[ES] ALL RULES"; p.11 says all implemented BR-FR-Flux2 rules are set to "warning" except those
  "related to Multi-Vendor" (p.10 groups `BR-FR-MV-01…14` with `BR-FR-BD-02` and `BR-FR-BD-13`). The
  standard variant flags all 171 asserts `fatal`, which matches p.6 but not p.11 read on its own. The
  `_WARNING` variant keeps 26 asserts `fatal`: 20 `BR-FR-MV-*`, 3 `BR-FR-BD-02`, 1 `BR-FR-BD-13` and
  2 `BR-FR-BD-14`. If "related to Multi-Vendor" means the p.10 group, only the 2 `BR-FR-BD-14` asserts
  contradict the notes (it is not in the p.10 list); if it means `BR-FR-MV-*` only, the 6 `BR-FR-BD-*`
  asserts do. Recorded without picking a reading.
- **Evidence** (`R=spec/fnfe-ctc-fr-1.4.0.04`):
  - Licence: `grep -n 'Apache 2.0' $R/text/release-notes-en.txt` → l.325 "governed by the terms of the
    Apache 2.0 License"; `grep -n EUPL $R/distribution/CII/EN16931/schematron/BR-FR-Flux2-Schematron-CII.sch`
    → l.5 "European Union Public Licence (EUPL) version 1.4.0";
    `grep -c 'All rights reserved' $R/text/release-notes-en.txt` → 14 (one per page footer).
  - Dates: `sed -n 255,268p $R/text/release-notes-en.txt` (p.6: reception "NO LATER THAN OCTOBER 1",
    the standard version on sending side "STARTING SEPTEMBER 1ST 2026"); `sed -n 10p $R/distribution/CII/EN16931/schematron/BR-FR-Flux2-Schematron-CII.sch`
    → "EN RECEPTION AU PLUS TARD LE 1ER OCTOBRE 2026 ET EN EMISSION A COMPTER DU 1ER OCTOBRE 2026".
  - Severity: `sed -n 462,466p $R/text/release-notes-en.txt` (p.11: "All implemented BR-FR-Flux2
    Schematron rules are set to “warning” mode, except for those related to Multi-Vendor, and are
    therefore non-blocking (“fatal”), so that they can be used without blocking the exchange of
    invoices (since the France-specific rules will apply no later than September 1st 2026)". The
    sentence itself calls the non-blocking mode "fatal", so p.11 is ambiguous on its own);
    `grep -c 'name="flag">fatal' $R/distribution/CII/EN16931/2xslt/BR-FR-Flux2-Schematron-CII.xslt` → 171 and
    `grep -c 'name="flag">warning'` on the same file → 0 (standard variant);
    `grep -c 'name="flag">fatal' $R/distribution/CII/EN16931/2xslt/BR-FR-Flux2-Schematron-CII_WARNING.xslt` → 26.
- **Not legal advice:** confirm applicability dates with the official reform sources.

### CG-16 — Mixed provenance of the validation assets (until an official 1.09.2 is vendored)

- **What:** MINIMUM and BASIC run the Factur-X 1.09 FINAL XSD and Schematron; BASIC WL, EN 16931
  and EXTENDED run **1.09.2.fixFR04**, which FNFE-MPE ships inside "Schematrons FR CTC 1.4.0.04"
  only for the three profiles in scope of the French reform (release notes p.9, p.11). No official
  Factur-X 1.09.2 distribution (specification PDF, field matrix, examples) is vendored, so the
  1.09.2 deltas have no normative text here beyond the release notes and the `.sch` files.
- **Deltas found by diffing the assets** (`scripts/verify-spec-assets.mjs` sources; rule ids from
  the bracketed messages of the compiled XSLTs):
  - XSD: file names change (`Factur-X_<LEVEL>.xsd`, imports `Factur-X_1.09.2_<LEVEL>_*`), line
    endings are LF instead of CRLF. Only EXTENDED changes content: `TradeTaxType/TypeCode` and
    `CategoryCode` become `minOccurs="0"` (RABIE XSD l.472/477). The type is shared by line, header
    (BG-23), allowance/charge and logistics VAT blocks; the profile Schematron still requires both
    on BG-23 and on allowances/charges (unnumbered structural asserts) and on detail lines
    (`BR-FXEXT-CO-04`). XP Z12-012 annex A agrees (BT-151 0..1, BT-118 1..1 in EXTENDED-CTC-FR).
    The model's `TradeTaxType.categoryCode` is optional accordingly.
  - Schematron, all three: `BR-CO-27` disappears. In BASIC WL and EN 16931 the same assert (same
    context and test) is now `CII-SR-470`; in EXTENDED it is gone, so a payee account with both an
    IBAN and a proprietary ID (BT-84) is no longer reported. `CII-SR-467…476` are added (EXTENDED:
    all but 470 and 474; BASIC WL: 467–473; `CII-SR-474/475/476` are warnings). BASIC WL gains
    `BR-CO-18` (blocking) and loses `BR-51` and `BR-FXEXT-Z-08rev`; its 1.09.2 `.sch` now contains
    `BR-CO-19`, which the 1.09 FINAL `.sch` lacked (CG-17). EN 16931 loses `BR-FXEXT-12` (blocking),
    `BR-FX-EN-04` and `BR-FXEXT-Z-08rev` (warnings), so it now accepts documents `BR-FXEXT-12`
    rejected.
  - Schematron, `CII-SR-471` / `CII-SR-472` (context `//ram:SpecifiedTradeAllowanceCharge`): the
    messages say each allowance/charge "shall contain a VAT category code (BT-95)" / "should contain a
    VAT rate (BT-96)", but the tests are `count(ram:CategoryTradeTax) <= 1` and
    `count(ram:RateApplicablePercent) <= 1`: they cap a count, they don't require presence. The
    472 test also targets a child `TradeAllowanceChargeType` doesn't have (the rate sits under
    `CategoryTradeTax`), so it can never fire. The library runs the rules as published; presence of
    the VAT category code is enforced elsewhere (`BR-32` for BT-95, `BR-37` for BT-102).
  - Schematron, EXTENDED: `BR-S/Z/E/AE/IC/G/O/AF/AG-01` are replaced by
    `BR-FXEXT-{S,Z,E,AE,IC,G,O,AF,AG}-01`, which count `DETAIL` lines (BT-X-8), document
    allowances/charges and logistics charges (BT-X-273). The old Z/E/… rules required exactly one
    breakdown of the category, the new ones at least one (several S breakdowns were already
    accepted); the per-category `-08b` basis rules still reject such a split. The new S rule also
    catches S lines with no S breakdown, which 1.09 FINAL's `BR-S-01` (lines + breakdowns ≥ 2) let
    through. `BR-54` is replaced by `BR-FXEXT-BR-54-1` and `BR-FXEXT-BR-54-2`.
  - Schematron, EXTENDED, same id but changed test: `BR-FXEXT-06` no longer requires BT-X-8 on a
    line that is the parent of other lines, only on lines carrying a `ParentLineID` (a relaxation,
    in neither the release notes nor the `.sch` header); `BR-FXEXT-08` rounds the sum of child lines
    to cents before comparing; `BR-FXEXT-CO-04` additionally requires `TypeCode = 'VAT'`;
    `BR-FXEXT-CO-10/12/13` cast each summed item to `xs:decimal` (`.sch` header: "to avoid rounding
    issues"). Read from the XSLT tests; only `BR-FXEXT-06` is reproduced by a test.
  - codedb, EXTENDED: EAS codes `0245`–`0248` added.
- **Release notes vs files:** p.5 says `BR-FXEXT-CO-04` was changed to allow INFORMATION and GROUP
  lines without a VAT category, but its 1.09 FINAL context already excluded them; the change in the
  files is the XSD cardinality and the added `TypeCode` test. p.6 and p.9 call the EXTENDED fix
  "1.09.2Beta, which will be released in early August as V1.09.2", while the `.sch` and codedb headers
  of all three profiles say "Version: 1.09.2, Release date: 2026-08-04, Effective date: 2026-09-01";
  the EXTENDED `.sch` header also says applicable on emission from October 1, 2026, contradicting its
  own effective date (the same September/October conflict as CG-15, now in shipped assets). p.6 says the profile XSDs and Schematrons are unchanged apart from code
  lists except for EXTENDED; the BASIC WL and EN 16931 rule changes above contradict it. p.4 names
  the new rules `BR-FREXT-S-01 … BR-FREXT-O-01` and `BR-FXEXT-54-1/-2`; the shipped Factur-X files
  use `BR-FXEXT-S-01 …` and `BR-FXEXT-BR-54-1/-2` (cite those).
- **Licence:** the 1.09.2.fixFR04 Factur-X `.sch` files carry no licence text; they ship (compiled)
  under the release's Apache-2.0 statement, like the rest of CG-15.
- **The library's own conformance claims** still cite 1.09 FINAL text (§, p.N) for every profile.
- **Close when:** the official Factur-X 1.09.2 distribution is vendored under `spec/` and
  `SOURCES` in `scripts/verify-spec-assets.mjs` points every profile at it.
- **Evidence:** `pnpm spec:verify` (prints the source of each folder);
  `diff <(git show b2e6f77:src/lib/xsd/facturx/extended/Factur-X_1.09_EXTENDED_urn_un_unece_uncefact_data_standard_ReusableAggregateBusinessInformationEntity_100.xsd | tr -d '\r') src/lib/xsd/facturx/extended/Factur-X_1.09.2_EXTENDED_urn_un_unece_uncefact_data_standard_ReusableAggregateBusinessInformationEntity_100.xsd`;
  `pnpm vitest run tests/fixfr04.test.ts`.

### CG-17 — 1.09 FINAL XSLTs enforce rules missing from their `.sch` (unresolved)

- **What:** the compiled `_XSLT_<LEVEL>` transforms of Factur-X 1.09 FINAL, which are what actually
  runs, contain rules that their own `Factur-X_1.09_<LEVEL>.sch` does not:
  - MINIMUM: `BR-FXEXT-{G,IC,O,Z}-08b/-08ini/-08rev`, `CII-SR-463`, `CII-SR-465`, `CII-SR-466`;
  - BASIC: `BR-FX-EN-04`, `BR-FXEXT-12`, `BR-FXEXT-Z-08rev`;
  - BASIC WL (before this move): `BR-51`, `BR-CO-19`, `BR-FXEXT-Z-08rev`;
  - EN 16931 (before this move): `BR-FX-EN-04`, `BR-FXEXT-12`, `BR-FXEXT-Z-08rev`.
  EXTENDED's XSLT and `.sch` agree. The 1.09.2.fixFR04 XSLTs for BASIC WL, EN 16931 and EXTENDED
  agree with their `.sch`, so only MINIMUM and BASIC are still affected.
- **Impact:** the library follows the order of truth and runs the XSLT as shipped (it is what the
  spec's own validator would run); a document built against the `.sch` alone can still fail these
  rules at MINIMUM or BASIC.
- **Close when:** an upstream Factur-X release reconciles them (then re-vendor).
- **Evidence:** for each profile,
  `diff <(grep -oE '\[(BR|CII|FX)[A-Za-z0-9_-]*\]' "spec/factur-x-1.09/distribution/4. FACTUR-X_1.09_XSD_SCHEMATRON_2026-06-10/0. Factur-X_1.09_MINIMUM/Factur-X_1.09_MINIMUM.sch" | sort -u) <(grep -oE '\[(BR|CII|FX)[A-Za-z0-9_-]*\]' src/lib/xsd/facturx/minimum/FACTUR-X_MINIMUM.xslt | sort -u)`
  (the same with `2. Factur-X_1.09_BASIC` / `basic/FACTUR-X_BASIC.xslt`; for BASIC WL and EN 16931
  use the 1.09 `_XSLT_*` files in `spec/factur-x-1.09/`).
### CG-18 — `EXTENDED-CTC-FR` CII profile

- **Spec:** XP Z12-012 v1.4 defines an `EXTENDED-CTC-FR` profile for plain CII (guideline ID
  `urn:cen.eu:en16931:2017#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr`), with French extension
  fields `EXT-FR-FE-*` (Annex A `annex-a--CII_D22B_FX_EXT-CTC-FR.csv`) and its own Schematron
  (`spec/fnfe-ctc-fr-1.4.0.04/distribution/CII/EXTENDED-CTC-FR/`). Release notes p.9 say the
  Factur-X EXTENDED components can validate it, being a superset; the vendored EXTENDED Schematron
  disagrees (CG-24).
- **Code:** `getLevel` (`src/lib/xml.ts`) throws `Unknown level: "1p0"` on that guideline ID, so
  `check()` without an explicit level can't run on it; with `level: 'extended'` it runs, XSD passes
  and the Factur-X EXTENDED Schematron fails (CG-24). Models, converter and parser don't know the
  `EXT-FR-FE-*` fields. `validateFrCtc({ level: 'extended' })` does run BR-FR on it.
- **Evidence:** the 6 `*_EXTENDED-CTC-FR_CII_*.xml` files of Annex B, e.g.
  `node bin/facturx.mjs check "spec/afnor-xp-z12-012-1.4/distribution/XP_Z12-012_Annexe_B_EXEMPLES_V1.4/Factures/F202500001/_EXTENDED-CTC-FR/F202500001_INV_20250201_EXTENDED-CTC-FR_CII_Commentee.xml"`
  prints `Unknown level: "1p0"`. Annex B has CII examples to test a fix against.

### CG-19 — UBL syntax

- **Spec:** the reform accepts UBL 2.1 invoices and credit notes; the release ships
  `BR-FR-Flux2-Schematron-UBL` and the EN16931 / `EXTENDED-CTC-FR` UBL Schematrons (release notes
  p.9-10), Annex A has `annex-a--Flux_2_UBL_*.csv` and Annex B has `*_UBL_*.xml` examples.
- **Code:** this package handles CII only (`getFlavor` in `src/lib/xml.ts`); UBL would be a new flavor,
  and the UBL XSD is not in the release (p.11: get it from OASIS).

### CG-20 — CDAR lifecycle messages

- **Spec:** release notes p.10: a lifecycle status message (Cross Domain Acknowledgement and Response
  D22B) is validated by the "uncoupled" CDAR XSD, then `BR-FR-CDV-Schematron-CDAR` (`BR-FR-CDV-01…16`,
  `BR-FR-CDV-CL-01…11`). Both are in `spec/fnfe-ctc-fr-1.4.0.04/distribution/CDAR/`; Annex A describes
  the statuses (`annex-a--CDV_FE_-_CDAR.csv`, `annex-a--Tableau_des_motifs_de_STATUTS.csv`) and Annex B
  has CDAR examples under `Cycle de Vie - CDAR/`.
- **Code:** not supported. A validate-only feature (XSD + `BR-FR-CDV`, tested on the Annex B CDAR
  examples) is the cheapest next step; building CDAR messages is a larger one.

### CG-21 — Flux 10 e-reporting

- **Spec:** `spec/fnfe-ctc-fr-1.4.0.04/distribution/Flux10/` (XSD + Schematron), Annex A
  `annex-a--E-REPORTING_-_Flux_10.csv`.
- **Code:** not supported. `Flux10/` carries no licence statement (CG-15), so its Schematron can't be
  shipped until that is clarified.

### CG-22 — BR-FR rules not implemented by the published Schematron

- **Spec:** XP Z12-012 Annex A (`annex-a--BR-France_CTC.csv`) defines the `BR-FR-*` rules for flows 2,
  8 and 9; `annex-a--BR-France-CTC-CPRO.csv` the B2G (Chorus Pro) rules, optional step 4 (release
  notes p.9).
- **Code:** `validateFrCtc` runs the published Schematron as is, so it checks only what that implements:
  59 rules. Not implemented (no assert in the XSLT): `BR-FR-07`, `-14`, `-19`, `BR-FR-CO-01`, `-02`,
  `-06`, `-11`, `-13`, `-16`, `-17`, `BR-FR-MV-04`, and all `BR-FR-CPRO-*` (no Schematron published).
  Annex A itself marks `BR-FR-CO-01` "Règle non présente dans le schématron" (depends on the processing
  date). The `BR-FR-MAP-*`, `-MVMAP-*`, `-BDMAP-*` mapping rules are out of scope by design (p.10).
- **Spec inconsistency (unresolved):** p.10 lists `BR-FR-CO-01…17`, `BR-FR-MV-01…14`, `BR-FR-BD-02`
  and `-13`; p.8 says multi-vendor rules (`BR-FR-MV`) "will be published in a later version"; the XSLT
  implements `BR-FR-MV-01…14` except `-04`, and also `BR-FR-BD-14` (not listed on p.10).
- **Evidence:** list the rules of the XSLT and of Annex A and compare:
  `grep -A1 'name="id"' src/lib/xsd/fr-ctc/BR-FR-Flux2-Schematron-CII.xslt | grep -oE '>BR-FR-([A-Z]+-)?[0-9]+' | sort -u`
  and `grep -oE '^"?BR-FR-([A-Z]+-)?[0-9]+' spec/afnor-xp-z12-012-1.4/text/annex-a--BR-France_CTC.csv | sort -u`.
- **Not fixed locally:** hand-written rules would not be traceable to an official artefact; wait for
  FNFE-MPE.

### CG-23 — Mangled `test` in BR-FR SVRL output (upstream)

- **Source:** `src/lib/xsd/fr-ctc/BR-FR-Flux2-Schematron-CII.xslt` (verbatim from the release). The
  compiled XSLT copies each assert's test into a literal `test="…"` attribute of `svrl:failed-assert`,
  which XSLT evaluates as an attribute value template: `{9}` in `matches(…, '^\d{9}$')` is evaluated to
  `9`. The rule itself is evaluated correctly (the `xsl:when` test is not an AVT); only the reported
  `SchematronError.test` is wrong. Affects 4 asserts (`BR-FR-10_BT-30`, `BR-FR-11_BT-47`,
  `BR-FR-32-LEGALID`, `BR-FR-32-GLOBALID`). The vendored Factur-X EXTENDED XSLT has the same pattern.
- **Evidence:** `grep -n 'svrl:failed-assert' -A1 src/lib/xsd/fr-ctc/BR-FR-Flux2-Schematron-CII.xslt | grep -c 'test="[^"]*{[0-9]'`
  prints `4`; `validateFrCtc` on `examples/Facture_FR_EN16931.xml` reports `BR-FR-32-LEGALID` with
  `test` `matches(normalize-space(.), '^\d9$')`.
- **Not fixed locally:** vendored assets are not edited by hand. To report upstream (the skeleton should
  escape braces as `{{`/`}}`).

### CG-24 — Release notes vs EXTENDED Schematron on `EXTENDED-CTC-FR` (unresolved)

- **Spec says (1):** FNFE CTC FR 1.4.0 release notes p.9 (`spec/fnfe-ctc-fr-1.4.0.04/text/release-notes-en.txt`):
  the Factur-X EXTENDED profile, being broader than EXTENDED-CTC-FR, "can be used for the CII's
  EXTENDED-CTC-FR profile".
- **Spec says (2):** the same release's Factur-X 1.09.2.fixFR04 EXTENDED Schematron checks BT-24 against
  code list 1 of `FACTUR-X_EXTENDED_codedb.xml` (assert `FX-SCH-A-000636`), which only allows
  `…urn:factur-x.eu:1p0:extended` and `…urn:zugferd.de:2p0:extended`, not
  `…urn.cpro.gouv.fr:1p0:extended-ctc-fr`. Factur-X 1.09 FINAL had the same rule and list.
- **Code:** follows the vendored Schematron (never edited); `validateFrCtc` maps EXTENDED-CTC-FR to
  `extended` for BR-FR only, which doesn't read the profile.
- **Evidence:** `find spec/afnor-xp-z12-012-1.4/distribution/XP_Z12-012_Annexe_B_EXEMPLES_V1.4/Factures -name '*_EXTENDED-CTC-FR_CII_*.xml' -exec node bin/facturx.mjs check --level extended --schematron {} \;`
  → each of the 6 examples fails only `Value of 'ram:ID' is not allowed.` (XSD passes).
- **Close when:** FNFE clarifies, or the dedicated `CII/EXTENDED-CTC-FR` Schematron is supported (CG-18).

## Changing this file

- Add an entry when a gap is confirmed **with evidence** (a command and its output, or a failing
  test). Suspicions go to an issue, not here.
- Close an entry by moving its proof (test name or command) to **Verified**, in the same PR as the fix.
- Re-run every proof in **Verified** when the spec version or a vendored asset changes.
