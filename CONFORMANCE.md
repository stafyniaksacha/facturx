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
  | EXTENDED-CTC-FR (plain CII, level `extended-ctc-fr`) | UN/CEFACT CII D22B "uncoupled" XSD and FNFE-MPE `EXTENDED-CTC-FR-CII` Schematron, `spec/fnfe-ctc-fr-1.4.0.04/distribution/CII/` (release notes p.9 steps 1–2) |

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
| All 24 Factur-X documents of XP Z12-012 v1.4 annex B (12 PDFs + their 12 commented CII XML, EN 16931 and EXTENDED) pass XSD + profile Schematron at the level in their name with no error and no warning, and re-serialize XSD-valid; the model round-trip is identical, including the sub-cent unit prices of UC11 and UC13 | `pnpm build && pnpm vitest run tests/annex-b-examples.test.ts` |
| The EN 16931 model (`EN16931.Invoice`, `fromCii()` / `toCii()`) maps the official examples to CII without loss: for all 64 documents of the two corpora (34 Factur-X 1.09 PDFs at BASIC, EN 16931 and EXTENDED, and the 30 annex B Factur-X documents, 12 PDFs and 18 commented CII XML, EN 16931, EXTENDED and EXTENDED-CTC-FR; MINIMUM and BASIC WL are not EN 16931 invoices and `fromCii()` rejects them) `fromCii` then `toCii` then `invoiceToXml` passes the XSD and the profile Schematron at the document's own level with no error and no warning; for every document `dropped` is empty (none of them carries content outside the model, the Factur-X EXTENDED ones included) and the CII model read back from the written XML equals the original, also compared path by path in both directions, so no value is lost and none is added or changed on write (BT-7 / BT-8 on the first VAT entry only in F20260023, -24 and -31 is the one normalisation: `toCii()` writes them on every entry; the BT-11-0 default `Project reference` of the annex B documents reads as no project name and is written back). `dropped` is proven on F20260023 Factur-X EXTENDED with injected content (BT-X-1 test indicator, BT-X-7 line status code, BT-X-543 seller role code, BT-X-302 gross price charge, BT-X-265 sequence number on a document charge moved before the allowances): it holds exactly those 6 paths, each with a `BT-X-*` matrix row and no `EXT-FR-FE` twin (the two gross price charge paths share their XPath with BT-147 and are told apart by the `ChargeIndicator` value, so the test checks their BT-X-302 / BT-X-302-02 rows directly), and nothing else changes in either direction. Text with `&`, `<` and non-ASCII characters survives the trip | `pnpm build && pnpm vitest run tests/en16931-corpus.test.ts` |
| Every EN 16931 id and every `EXT-FR-FE` id of Annex A (CII and UBL) in the model's scope has a model property, and every `@bt` / `@bg` / `@ext` tag names an id of the matrices or Annex A | `pnpm vitest run tests/en16931-coverage.test.ts` |
| `toCii()` refuses what the level's XSD / Schematron or the spec would reject or silently change, naming the term and never quoting content: an *Amount* with more than 2 decimals (§7.1.5 p.35, BR-DEC; unit prices, quantities, percentages and rates stay free), more buyer (BT-46, BT-46-0) or payee (BT-60, BT-60-0) identifiers than the level carries (FX-SCH-A-000163 / -000164 / -000467), and an empty BT-25 (BR-55), BT-122 / BT-17 / BT-18 (BR-52), BT-22 / BT-127 at basic and en16931 (and with a subject code at Factur-X EXTENDED, BR-FXEXT-01 / -02; a note without text is written without `ram:Content` at the extended levels), BT-125-1 / BT-125-2 with a BT-125 (matrix `1..1`), a credit transfer without BT-84 or BT-84-0 (BR-50), or a BG-14 without BT-73 / BT-74 (BR-CO-19); a plain-object invoice gets the same named errors, an optional repeatable group left out reading as empty; `fromCii()`'s `dropped` pairs repeated elements by exact equality before position, so a writer reordering (VA / FC registrations, document types 50 / 130 / 916, allowances and charges, BT-110 / BT-111) is not reported and a lost element is blamed rather than a kept near-duplicate, in time linear in the document (5000 lines with one `BT-X` value each: about 0.6 s) | `pnpm build && pnpm vitest run tests/en16931-strict.test.ts` |
| 1.09.2.fixFR04 behaviour: EXTENDED accepts a line VAT block without `TypeCode`/`CategoryCode` (XSD `minOccurs="0"`, release notes p.5) and the model round-trips it, EN 16931 still rejects it; detail lines, BG-23 and document allowances/charges still need both codes (`BR-FXEXT-CO-04`, `BR-47`, structural `count(ram:TypeCode)=1`); `BR-FXEXT-S-01` still accepts several S breakdowns and now catches S lines without one (1.09 FINAL's `BR-S-01` did not); two Z breakdowns no longer fire `BR-Z-01` but still fail `BR-FXEXT-Z-08b`; `BR-FXEXT-06` no longer fires on an untyped parent line; `BR-FXEXT-BR-54-1/-2` replace `BR-54`; `BR-CO-27` is `CII-SR-470` in BASIC WL / EN 16931 and gone from EXTENDED | `pnpm build && pnpm vitest run tests/fixfr04.test.ts` |
| External XML entities are not expanded with the default libxml2-wasm parse options used by `resolveXml` / `xmlToInvoice` (no XXE) | probe in the audit (entity resolves to empty / `check()` rejects the document); keep `XML_PARSE_NOENT` / `XML_PARSE_DTDLOAD` / `XML_PARSE_XINCLUDE` off |
| The XMP packet header uses the fixed packet id `W5M0MpCehiHzreSzNTczkc9d` of the reference packet `distribution/2. FACTUR-X_extension_schema_exemple.xmp.txt` (was CG-06), and `generate()` keeps a source PDF's permanent trailer `/ID` (ISO 32000-1 §14.4) instead of throwing (#37), while rejecting encrypted (§6.1 p.25) and signed sources and sources that already embed a document of the kind being written (§6 p.24 for invoices; one order per PDF for Order-X is by analogy, no Order-X spec is vendored). That document is detected by content, whatever its file name: any stream of a file (`/EF` `/F`, `/UF` or a deprecated key) in the EmbeddedFiles name tree or catalog `/AF` whose root element (namespace and name) is a CII invoice, or an Order-X order when an order is written, including UTF-8 and UTF-16 with a BOM and invoices hidden behind tricky prolog comments. A file whose name tree key, `/F` or `/UF` is a recognized invoice name (`factur-x.xml`, `xrechnung.xml`, ZUGFeRD names; `order-x.xml` for orders) is rejected too, whatever its content can be read as, and so is one already using the filename being written. Other XML is accepted as a supporting file (§6.4 p.30–32), including an Order-X order attached to an invoice. Reading untrusted input is bounded: each distinct stream is read once, inflated with node:zlib in growing slices (at most 64 KiB of compressed input and 2 MiB of output per attempt), 64 KiB of text is examined, and per PDF at most 256 distinct streams and 128 MiB of inflation are allowed (a failed attempt is charged as much as it could have produced); past either limit the PDF is rejected. Known misses are listed in CG-14 | `pnpm build && pnpm vitest run tests/generate.test.ts` |
| Schematron findings are classified by the rule's own SVRL `flag`: `warning`/`information` are reported in `warnings` and don't affect validity unless `warningsAsErrors` is set; unflagged and `fatal` ones are errors. Fired `<report>`s count like failed `<assert>`s (the Factur-X Schematrons express profile restrictions such as "@schemeID not used in the given context" as reports; before this they were silently dropped). In the vendored Factur-X XSLTs the warning-flagged rules are: MINIMUM `BR-FXEXT-{G,IC,O,Z}-08ini/-08rev`; BASIC `PEPPOL-EN16931-R008`, `BR-FX-EN-04`, `BR-FXEXT-Z-08rev`; BASIC WL none; EN 16931 `PEPPOL-EN16931-R008`, `CII-SR-474/475/476`; EXTENDED `PEPPOL-EN16931-R008`, `BR-FXEXT-04`, `CII-SR-475/476` and the `-08ini/-08rev` pairs, each backed by a blocking `-08b` rule (spelled `BR-FXEXT-S08b` for S upstream) | `pnpm build && pnpm vitest run tests/schematron.test.ts tests/fixfr04.test.ts` (severity inventory) |
| README and docs no longer claim `extract()` detects the level: it returns the flavor (from the attachment filename) and echoes `options.level`; the quick start reads the level from `check()` on the extracted XML (was CG-11) | `pnpm build && pnpm --filter @stafyniaksacha/facturx-examples run examples` (quickstart prints `facturx en16931`, not `facturx undefined`) |
| French CTC rules `BR-FR-Flux2` (FNFE-MPE Schematrons FR CTC v1.4.0.04, step 3 of the release notes p.9): the vendored `src/lib/xsd/fr-ctc/BR-FR-Flux2-Schematron-CII.xslt` is byte-identical to all five copies in the release, standard (all 171 asserts `fatal`) variant only, and its shipped SEF is reproducible and embeds no local path. `validateFrCtc` / `check({ frCtc: true })` check the document itself (the rules read neither root nor profile) and accept only a CII invoice declaring BASIC WL, EN16931 or EXTENDED (p.9, p.11; plain-CII `EXTENDED-CTC-FR` as `extended`); they throw for MINIMUM, BASIC, Order-X and a `level` that contradicts the document. UBL invoices are handled by the separate UBL row below. All 24 Factur-X examples of XP Z12-012 v1.4 Annex B (EN16931 and EXTENDED, incl. multi-vendor, bidirectional, sub-line) pass XSD + the Factur-X profile Schematron (1.09.2.fixFR04, CG-16) + BR-FR with no finding, and the 6 plain-CII `EXTENDED-CTC-FR` examples pass BR-FR at level `extended`. Over the 34 in-scope official Factur-X 1.09 examples, 28 pass and 6 (`_Factur-X_1.08-Exemples_CS/*/Facture_F2026003{0,1}-*`) fail `BR-FR-32` (SIREN `303 656 847` written with spaces) and `BR-FR-CO-10` (seller GlobalID scheme `0088` twice), both genuine in the example data. `id` is the rule (`BR-FR-05`), taken from the SVRL `@id`, never from the message | `pnpm spec:verify`; `pnpm build && pnpm vitest run tests/fr-ctc.test.ts` |
| Every value `generate()` writes into the XMP packet (title, subject, author from the invoice or `meta`, producer, creator, filename, conformance level) is XML-escaped and stripped of characters XML 1.0 cannot carry, so a seller name with `&`, `<` or markup parses back as the same text and cannot inject properties such as a second `fx:ConformanceLevel` (BR-HYBRID-02, BR-HYBRID-03; was CG-03). The veraPDF run in the UTF-8 row below covers `&` and `<` too | `pnpm build && pnpm vitest run tests/generate.test.ts -t CG-03` |
| The XMP packet is written as UTF-8 bytes (`begin=""`), with `/Length` its byte length: a seller name with `é`, `€` and a non-BMP character decodes strictly as UTF-8 and parses back unchanged (BR-HYBRID-02 via PDF/A metadata clauses 6.6.2.1 / 6.6.4, BR-HYBRID-03; was CG-02). `begin` is kept empty, the UTF-8 form of the XMP spec (ISO 16684-1, not vendored), where the reference packet writes a U+FEFF BOM; veraPDF accepts it. **External validator:** veraPDF 1.30.4 (`verapdf/cli@sha256:f085855d442ad415e79fabbabcdd1803c2db4ee097cd5b94506c95ecdcfa1728`, `--flavour 3b`), on the input that failed before the fix (at `2741b28`: `6.6.2.1 t4` ×5, `6.6.2.1 t5` ×5, `6.6.4 t1`, XMP not well-formed): the official EN 16931 example `Facture_F20260023-…_EN_16931.pdf` stripped of its embedded files, `/AF` and `/PageMode` and of unreferenced objects as base, its XML with seller name `Société Dupont & Fils <SARL> €`. After CG-02 and CG-03 (2026-11-15, `89ee517`), base and output both PASS 3b, and the XMP reads `Société Dupont &amp; Fils &lt;SARL&gt; €`. Manual run, not a CI test | `pnpm build && pnpm vitest run tests/generate.test.ts -t CG-02`; veraPDF run as described |
| `invoiceToXml()` writes *Unit Price Amount*s (item net/gross price BT-146/BT-148, price discount/charge BT-147/BT-X-302, their base amounts BT-X-35/BT-X-301) unrounded, in the shortest `xs:decimal` form with no exponent (`0.3456`, `1000.3454`, `0.0000001`), and every other *Amount* with 2 decimals (§7.1.5 p.35; was CG-01). The 2 annex B examples with sub-cent unit prices (UC11, UC13) now round-trip with an identical model. Unit prices are stored as `number` (public model type), so precision beyond an IEEE-754 double (about 15 significant digits) is not kept | `pnpm build && pnpm vitest run tests/unit-price.test.ts tests/annex-b-examples.test.ts` |
| `invoiceToXml()` writes every other `xs:decimal` in plain notation too: quantities, measures, the currency `ConversionRate`, VAT and allowance/charge percentages and `SequenceNumeric` go through the same `formatDecimal` as unit prices, and an *Amount* from 1e21 up (where `toFixed(2)` switches to `1e+21`) is written in full. `1e-7` → `0.0000001`, `1.2345678901234569e+23` → `123456789012345690000000`, `-1.5e-7` → `-0.00000015`. The test sets a line `BilledQuantity`, a line VAT rate, the `ConversionRate`, a document allowance's `SequenceNumeric` and `CalculationPercent`, a payment penalty's `BasisPeriodMeasure` and `CalculationPercent`, and a `LineTotalAmount`; the other quantity elements share the same writer. The result is XSD-valid (EXTENDED) and round-trips (`xs:decimal` has no exponent, XSD; §7.1.5 p.35; was CG-28) | `pnpm build && pnpm vitest run tests/decimal-notation.test.ts` |
| `generate()` refuses the `zugferd` flavor, given or auto-detected, and any ZUGFeRD 1.0 `CrossIndustryDocument` root even under an explicit `flavor: 'facturx'`, before reading or marking the PDF: it wrote `zugferd-invoice.xml` with the Factur-X `fx:` XMP and an empty conformance level, which matches neither §6.3.1 nor the deprecated ZUGFeRD 2.0 settings of §6.3.2 p.29 (`zugferd-invoice.xml` + `zf:` schema), and the filename is not a HybridDocumentFilename (BR-HYBRID-08/13, Fatal; see CG-27). ZUGFeRD 2.x invoices are generated as `facturx` (was CG-09) | `pnpm build && pnpm vitest run tests/generate.test.ts -t CG-09` |
| README, `docs/` and the CLI help no longer claim `generate()` produces PDF/A-3: they say it attaches the XML and writes the XMP, and that the caller supplies a PDF/A-3 base (was the docs part of CG-05) | `grep -rniE 'compliant PDF/A\|PDF-A/3\|→ PDF/A-3' README.md docs src/commands --include='*.md' --include='*.ts' \| grep -v docs/api/models` (no match) |
| `generate({ afRelationship })` writes `Data` (default), `Alternative` or `Source` as the embedded XML's `/AFRelationship`, checked against §6.2.2 table p.27 (BR-HYBRID-11): MINIMUM and BASIC WL accept `Data` only (p.26: `Data` "must be used" when the visual holds more data than the XML), BASIC / EN 16931 / EXTENDED all three; `Supplement`, `Unspecified` and any other value are rejected; Order-X is not restricted (no table vendored); the German column is documented, not enforced. The level is normalized and checked once, then used for both `fx:ConformanceLevel` and this check (was CG-07) | `pnpm build && pnpm vitest run tests/af-relationship.test.ts` |
| `generate()` never writes an empty `fx:ConformanceLevel` for Factur-X: `level` is read ignoring case, spaces and underscores (`BASIC WL`, `BASICWL`, `EN 16931`, `MINIMUM` work), and a level with no HybridConformance value for the flavor (e.g. `comfort` or `xrechnung` for Factur-X) throws before the PDF is read (BR-HYBRID-07, Fatal; was CG-30). | `pnpm build && pnpm vitest run tests/generate.test.ts -t "CG-30"` |
| `generate()` writes Order-X hybrid metadata from the code lists: `fx:DocumentType` `ORDER` / `ORDER_CHANGE` / `ORDER_RESPONSE` (`text/codelists--HybridDocument.csv`) from the message type code `220` / `230` / `231`, and `fx:ConformanceLevel` `BASIC` / `COMFORT` / `EXTENDED` (`text/codelists--HybridConformance.csv`); another type code, or a Factur-X-only level, throws before the PDF is read (BR-HYBRID-06/07, Fatal; was CG-08). Factur-X still writes `INVOICE`. The type-code mapping and the restriction to those three codes rest on the UNTDID 1001 names and the Order-X spec, which is not vendored (the hybrid code list has no mapping, the Order-X XSD allows any UNTDID 1001 code); `220` → `ORDER` matches the two Order-X example PDFs in `examples/`. The extension-schema property descriptions now use the reference packet's neutral wording. The namespace URI is CG-10, unchanged | `pnpm build && pnpm vitest run tests/generate.test.ts -t "CG-08"` |
| `generate()` refuses an explicit `level` that does not name the profile the guideline ID (BT-24) declares, for Factur-X and Order-X, before the PDF is read (library policy; was CG-42). BR-HYBRID-15 asks that `fx:ConformanceLevel` match the embedded XML's profile; its EN/FR/DE texts disagree on how strongly (CG-44), and matching output satisfies every reading. The level is taken from the last `:` segment of BT-24, or from the one before it when the last is not a level (a date revision: `urn:cen.eu:en16931:2017` → `en16931`, Order-X IDs with a revision) (`levelFromGuidelineId`), so the match is with that segment. BT-24 itself is checked against the profile's code list only by the Schematron (`check({ schematron: true })` → "Value of 'ram:ID' is not allowed."): `generate({ check: true })` runs the XSD only, which types it as `udt:IDType`, so it accepts e.g. `urn:example:minimum` with `level: 'minimum'`. Every guideline ID enumerated in the vendored Factur-X codedb files (`<cl id="1">` of each profile: `factur-x.eu:1p0` and `zugferd.de:2p0` forms, plain `urn:cen.eu:en16931:2017`) is accepted with its matching level; the test reads those files, so it follows the vendored lists. An explicit level on a document whose BT-24 names no known level (e.g. XRechnung) throws `Unknown level`, and on one without BT-24 `No ID found in the document` | `pnpm build && pnpm vitest run tests/generate.test.ts -t "CG-42"` |
| `extract()` finds an invoice embedded as `xrechnung.xml` (§6.2 p.25, `text/codelists--Filename.csv`) and returns it with flavor `facturx`, which `getFlavor()` gives its `CrossIndustryInvoice` root. The fixture is a Factur-X EN 16931 invoice renamed to `xrechnung.xml` (the evidence recipe of CG-12), not a real XRECHNUNG hybrid (none is vendored): `extract({ check: true })` validates it only because its guideline ID is a Factur-X one, and fails on a real XRECHNUNG ID (CG-12) | `pnpm build && pnpm vitest run tests/extract.test.ts` |
| `extract({ check: true })` validates an attachment under a ZUGFeRD file name (`zugferd-invoice.xml`, the ZUGFeRD 2.0 name of §6.3.2 p.29; `ZUGFeRD-invoice.xml`) by its root element (#38): a `CrossIndustryInvoice` against the Factur-X 1.09 XSD for its level, with the EXTENDED-CTC-FR rejection kept (BR-HYBRID-07/15); a ZUGFeRD 1.0 `CrossIndustryDocument` throws "not supported" (no ZUGFeRD 1.0 schema is vendored); an Order-X order throws. The result's `flavor` stays `zugferd`. Fixtures: the Factur-X EN 16931 example renamed, plus the MINIMUM and EN 16931 examples declaring the deprecated ZUGFeRD 2.0 IDs that the 1.09 code lists still carry (`urn:zugferd.de:2p0:minimum`, `…#conformant#urn:zugferd.de:2p0:extended`). Not covered: the `2p0:basicwl` / `2p0:basic` IDs, real ZUGFeRD 2.0 (CII D16B) documents (none vendored: they are checked against the 1.09 D22B rules, not their own), XRECHNUNG under these names (CG-12) | `pnpm build && pnpm vitest run tests/extract.test.ts` |
| `extract()` reads an EmbeddedFiles name tree with one or two `/Kids` levels (§6.2.2 p.27, §6.4 p.31), in tree order, ignoring `/Limits`. The tree is untrusted: past two `/Kids` levels or 4096 nodes it throws `Unsupported EmbeddedFiles name tree`, and a cycle, a shared kid, a node with both `/Kids` and `/Names` or a non-dictionary kid throw `Malformed EmbeddedFiles name tree` (ISO 32000-1 §7.9.6 Table 36). (reader side of CG-13) | `pnpm build && pnpm vitest run tests/name-tree.test.ts` |
| `extract()` matches the invoice on names before decoding anything: name tree keys in tree order, then, when no key matches, each file specification's `/F` and `/UF`. It decodes only the match, once, each `/Filter` stage in turn (Flate by node:zlib with a capped output; ASCIIHex, ASCII85 and RunLength by pdf-lib in slices, tested; LZW by the same path, untested), and throws past 128 MiB decoded (each stage, and all stages of a chain together), for a matching file specification without `/EF`, for a `/Predictor` other than 1, an unknown filter, invalid or truncated Flate data. `bytes` is an owned copy of exactly the decoded length (not a view into the PDF or a zlib buffer). Other entries, even 500 sharing one undecodable stream or 100 sharing a 129 MiB Flate bomb over two `/Kids` leaves, are never decoded (was CG-29: ~7 s and ~2 GB for that bomb). No vendored rule; AGENTS.md "Security" | `pnpm build && pnpm vitest run tests/extract-budget.test.ts` |
| Without `meta`, the Info `CreationDate`/`ModDate`, the embedded file's `Params` `CreationDate`/`ModDate` (§6.2 p.25) and the XMP `CreateDate`/`ModifyDate`/`MetadataDate` are the generation time, written in UTC, and identical under `TZ=UTC`, `Europe/Paris` and `Pacific/Kiritimati`; the title and subject keep BT-2 as a calendar date. A `meta.date` the caller passes is used unchanged. No vendored rule defines these dates; the choice follows the reference packet's generation timestamp and is an inference (was CG-25) | `pnpm build && pnpm vitest run tests/pdf-metadata.test.ts -t CG-25` |
| Info `Producer` equals XMP `pdf:Producer` (the library name and version, instead of pdf-lib's default) and XMP `pdf:Keywords` equals Info `Keywords`, escaped and UTF-8. Characters XML 1.0 cannot carry are dropped from `meta` once, before both are written, so control characters cannot make them differ. This is consistency between the two metadata stores (`AGENTS.md`), not a proven PDF/A requirement: the Factur-X spec says nothing (§6.3 p.28–29), ISO 19005-3 is not vendored, and veraPDF 1.30.4's PDF/A-3B profile has no Info↔XMP equivalence check (the mismatch passed it on 2026-11-15, `2741b28`) (was CG-04) | `pnpm build && pnpm vitest run tests/pdf-metadata.test.ts -t CG-04` |
| `generate({ preserveXmlBytes: true })` embeds the caller's XML bytes unchanged (a `Buffer` as is, a `string` as UTF-8) and `extract()` returns the attachment's decoded stream in `bytes` (CLI `generate --preserveXmlBytes`, `extract --raw`). Over all 56 official examples, `bytes` equals the `factur-x.xml` stream read from the PDF and inflated with node:zlib (not pdf-lib's decoder), and pass-through `generate()` of those bytes onto the example stripped of its attachments embeds them byte for byte (BOM, `'` declaration, CRLF), where the default still re-serializes. The bytes are still parsed with the default libxml2 options (no `XML_PARSE_NOENT`/`DTDLOAD`/`XINCLUDE`/`HUGE`) and checked from those same bytes with `check: true`; pass-through refuses an `XmlDocument`, any DOCTYPE (internal subset, `SYSTEM`, `PUBLIC` or none, string or `Buffer`), and an XML declaration naming a version other than 1.0 or an encoding other than UTF-8, wherever the attribute sits in the declaration (consistency rules: the bytes are parsed as UTF-8 XML 1.0; the vendored Factur-X text names neither), before the PDF is read or marked as used. No vendored rule requires byte identity: §4 p.21 asks archiving transformations to "respect the integrity of content" (was CG-26, interop). The default `xml` field and default embedding are unchanged (backward compatibility); the default path refuses a DOCTYPE and XML 1.1 too (was CG-31, see below) | `pnpm build && pnpm vitest run tests/xml-bytes.test.ts` |
| Without `preserveXmlBytes`, `generate()` refuses XML with a DOCTYPE (internal subset, `SYSTEM`, `PUBLIC` or no id) and an XML declaration naming a version other than 1.0, from a `string`, a `Buffer` or an `XmlDocument`, with or without `check`, checked on the serialization it would embed, before the PDF is read or marked as used (the same `PDFDocument` then takes a valid invoice). It embedded libxml2's re-serialization, which keeps both (was CG-31). No vendored rule: AGENTS.md "Security"; CII documents carry no DOCTYPE, and libxml2 checks the document as XML 1.0 | `pnpm build && pnpm vitest run tests/generate-doctype.test.ts` |
| `generate()` also looks for an existing invoice (or order, for Order-X) in page-level associated files (a page's `/AF`, §6.2.1 p.25: the file specification "can be found in either the Document dictionary or the Page dictionary"), in annotation `/AF` (PDF 2.0 / PDF/A-3, not vendored: an inference) and in the `/FS` of `/FileAttachment` annotations (ISO 32000-1 §12.5.6.15, not vendored; direct or indirect annotation dictionaries), on every page including under intermediate `/Pages` nodes, with the same content and name rules as the name tree and catalog `/AF` (§6 p.24). The page tree is untrusted: it is walked iteratively without pdf-lib's traversal; each page tree node, annotation, `/AF` and `/Annots` array, file specification and file name string is read once however often it is referenced (a 1000-entry `/AF` shared by an annotation listed 65536 times took ~27 s when re-read; 4000 specifications sharing a 50000-character `/F` took ~8 s; both now run in well under 3–5 s), and a name longer than 1024 bytes is decoded from its first 1024 bytes only (a 300000-character name overflowed pdf-lib's decoder; this also applies to `extract()`); a node reached twice through `/Kids` (a cycle, or a node listed twice, as pdf-lib's `addPage()` of an existing page writes) is rejected as `Malformed page tree`, since pdf-lib's recursive page count in `save()` overflows on a cycle and is exponential on shared nodes (single `/Parent`: ISO 32000-1, not vendored); more than 65536 distinct page tree nodes or annotations, more than 1048576 `/Kids`, `/Annots` and `/AF` entries, or a page tree deeper than 256 levels (pdf-lib overflowed at ~20000) reject the PDF (`could not check it for an existing invoice`; 65536 distinct annotations are accepted). Their files count toward the existing 256-stream limit. A non-invoice attachment there and a file attachment pointing to an external file are still accepted (narrows CG-14) | `pnpm build && pnpm vitest run tests/page-attachments.test.ts` |
| Plain-CII `EXTENDED-CTC-FR` invoices (XP Z12-012 v1.4, guideline ID `…urn.cpro.gouv.fr:1p0:extended-ctc-fr`) are detected as level `extended-ctc-fr` (flavor `facturx`) on that exact Annex A ID only (a BT-24 merely ending in `:extended-ctc-fr` is `Unknown level`, since nothing downstream checks BT-24 for this profile) and validated by the sequence of the FNFE-MPE release notes p.9: the "uncoupled" UN/CEFACT CII D22B XSD, which "SHALL BE USED" for CII (step 1), the dedicated `EXTENDED-CTC-FR-CII` Schematron (step 2; vendored with the documented `sum()` patch, 91 calls, applied for uniformity: same verdicts as unpatched on amounts with at most 2 decimals; 327 `fatal` and 446 `warning` asserts; see CG-33 and CG-40 for rules that never run), and BR-FR (step 3). All 6 `*_EXTENDED-CTC-FR_CII_*.xml` examples of Annex B pass all three with no error and no warning; a broken BT-112 fails `BR-FREXT-CO-15` and `BR-CO-16`; an unknown element fails the XSD. `generate()` refuses a document declaring the profile before reading the PDF, even with an explicit `level` or `flavor` (it also refuses any flavor that contradicts the root element), and `extract({ check: true })` refuses a `factur-x.xml` declaring it: it is not a HybridConformance value (BR-HYBRID-07/15). `validateFrCtc` accepts `extended-ctc-fr` and, as before, `extended` for such a document. The dedicated Schematron does not constrain the BT-24 value, so `validateSchematron({ level: 'extended-ctc-fr' })` checks it first (throws unless exact) and reports a repeated BT-24 container or ID as `CII-SR-009` / `CII-SR-010` instead of letting the transform abort with an XPTY0004 that quotes document values; it reads the input once and copies a `Buffer`, so the precheck and the transform see the same bytes. Using it resolves the practical side of CG-24 (release notes p.9 say Factur-X EXTENDED can validate the profile; its Schematron rejects the guideline ID, `FX-SCH-A-000636`): with `level: 'extended'` that rejection is unchanged and pinned by a test. CG-24 is closed by its own condition; the upstream contradiction (p.9 calls Factur-X EXTENDED both "broader" than EXTENDED-CTC-FR and its "subset") is still unreported (was CG-24; narrows CG-18) | `pnpm spec:verify`; `pnpm build && pnpm vitest run tests/extended-ctc-fr.test.ts` |
| UBL 2.1 invoices and credit notes (was CG-19) are validated with the three steps of the FNFE-MPE release notes p.9-10: the UBL 2.1 XSD (`Invoice` / `CreditNote` roots in the OASIS namespaces), the level Schematron (`EN16931-UBL-validation` for `urn:cen.eu:en16931:2017` and its `#compliant#` CIUS ids, `EXTENDED-CTC-FR-UBL` for the exact `#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr` id), then `BR-FR-Flux2-Schematron-UBL` (standard fatal variant only, byte-identical in both release folders). Flavor `ubl`; level from `cbc:CustomizationID` (`urn:cen.eu:en16931:2017`, or a `#compliant#` CIUS id with no `#conformant#` extension after it, or the exact EXTENDED-CTC-FR id; anything else throws, naming `level`, unless an explicit `level` is given for a document that declares none or an unsupported id; a declared level is never overridden). `validateSchematron` without `flavor` reads it from the root and refuses a contradicting `flavor`. The profile Schematron reports the assert `@id` as `id` (CG-46). All 12 UBL examples of XP Z12-012 v1.4 Annex B (6 EN16931 and 6 EXTENDED-CTC-FR; one of the 12 is a CreditNote) pass XSD and BR-FR with no finding and no error under the profile Schematron; 11 have no warning either, and `F202500001_…EXTENDED-CTC-FR_UBL_Commentee.xml` raises exactly one warning, `BR-FREXT-IC-08rev` (CG-45). A CIUS rule set such as Peppol BIS or XRechnung is **not** run (`#compliant#` ids are validated as EN 16931 only), and step 4 (Chorus Pro `BR-France-CTC-CPRO`) has no published Schematron (CG-22). UBL is XML only: `generate()` refuses it (a hybrid PDF embeds a CII invoice, §6.2 p.25) and `extract({ check: true })` refuses a UBL attachment | `pnpm spec:verify`; `pnpm build && pnpm vitest run tests/ubl-check.test.ts tests/fr-ctc.test.ts tests/generate.test.ts tests/extract.test.ts` |
| French lifecycle status messages (CDV) in CDAR D22B are validated by `validateCdar()` / `facturx check-cdar` with the two steps of the FNFE-MPE release notes p.10: the "uncoupled" CDAR D22B XSD (`CrossDomainAcknowledgementAndResponse_100pD22B.xsd`), then the published `BR-FR-CDV-Schematron-CDAR` (an assert for every Annex A `BR-FR-CDV-01…16`, `BR-FR-CDV-CL-01…11` and `BR-FR-04` id, though some cannot fail, see CG-34; standard variant, verbatim, 40 `fatal` and 3 `warning` asserts; `_WARNING` variant not vendored). XSDs and XSLT are byte-identical to `spec/fnfe-ctc-fr-1.4.0.04/distribution/CDAR/`, the SEF is reproducible and embeds no local path. All 11 CDAR examples of XP Z12-012 v1.4 Annex B (`Cycle de Vie - CDAR/`) pass both steps with no finding; a wrong MDT-77 fails `BR-FR-CDV-09`; an unknown MDT-105 status code is only a warning (`BR-FR-CDV-CL-06`, upstream's flag), an error with `warningsAsErrors`; an unknown element fails the XSD; a non-CDAR root throws. `id` is the rule, from the SVRL `@id`. Building CDAR messages is not supported (validate-only). A pass means the published rules pass, not that every Annex A rule holds (CG-34) (was CG-20) | `pnpm spec:verify`; `pnpm build && pnpm vitest run tests/cdar.test.ts` |
| The fields Factur-X 1.09 added to EXTENDED (§version history p.7–8; matrix `text/fields--Factur-X_CII_D22B_EXTENDED.csv` "Change 1.09" column), each 0..1 unless noted, are in the models, written by `invoiceToXml()` at their EXTENDED XSD position and read back by `xmlToInvoice()`: BT-173/BT-174 and BT-175/BT-176 (`ExemptionReason`/`ExemptionReasonCode` of a document allowance's / charge's `CategoryTradeTax`); BT-177/BT-177-1, BT-193/BT-193-1 and BT-X-616/BT-X-616-1 (the `ReasonCode` of a document / line / gross price charge with `@listID="5153"`, a UNTDID 5153 non-VAT tax code; without the attribute the same element is BT-105 / BT-145 / BT-X-313, and the EXTENDED Schematron checks it against the charge list, so a 5153-only code such as `AAJ` passes only with the attribute); BT-215 (`PayerSpecifiedDebtorFinancialInstitution/BICID`); BT-216 (`PayerPartyDebtorFinancialAccount/AccountName`); BT-X-591/BT-X-592 (`ExemptionReason`/`ExemptionReasonCode` of a logistics service charge's `AppliedTradeTax`); BG-34 BT-179/BT-180 (`SpecifiedFinancialAdjustment` `Reason`/`ActualAmount`, 1..1). BT-X-590 (the second line `TaxTotalAmount`, VAT accounting currency) is covered by the EXTENDED-CTC-FR fields row below. An invoice carrying all of them (with `&`, `<` and non-ASCII text) is EXTENDED XSD valid, each value is at its matrix XPath, it survives a second round trip with an identical model, and the EXTENDED Schematron raises nothing on its `ReasonCode`s. The audit fixed two data losses the corpus round trip could not see (both sides go through the parser): `xmlToInvoice()` dropped every `SpecifiedLogisticsServiceCharge` (BG-X-42) and every `ReasonCode/@listID` (the model had no `listID`; added, optional). Not covered here: the BG-X-93 manufacturer block beyond its name (read in code, not round-trip tested); the 1.09 cardinality changes of BT-131/BT-160/BT-161 are in the parser round-trip row below; version-history inconsistencies are CG-36 | `pnpm build && pnpm vitest run tests/extended-109.test.ts` |
| The XP Z12-012 v1.4 French extension fields of the plain-CII `EXTENDED-CTC-FR` profile (Annex A `annex-a--CII_D22B_FX_EXT-CTC-FR.csv`, 240 `EXT-FR-FE-*` rows) survive `xmlToInvoice()` then `invoiceToXml()`, including the 4 rows under `TaxApplicableTradeCurrencyExchange` (EXT-FR-FE-192, -192-00, -192-1 and the misplaced -199-1), read since the parser round-trip fix (was CG-32). All of them are Factur-X EXTENDED elements (the all-groups test document is also valid against the Factur-X EXTENDED XSD once its guideline ID is EXTENDED), mostly `BT-X-*` fields Annex A re-labels, already in the models. The one data loss, for plain Factur-X EXTENDED too, was the second line `TaxTotalAmount`: BT-X-329 (EXT-FR-FE-181) and the 1.09 field BT-X-590 (EXT-FR-FE-182, VAT accounting currency, `currencyID` = BT-6; Annex A calls it `BT-X-ZZZ`) share the element, `0..2` in Annex A and the matrix (EXTENDED XSD `maxOccurs="2"`). The parser kept only the first; the second now goes to the new optional `TradeSettlementLineMonetarySummationType.taxTotalAmountInAccountingCurrency`, written right after `taxTotalAmount`. Both are read by position, not by `@currencyID` (no rule fixes their order; the XML order is kept), so a model with only the new property set reads back with the amount in `taxTotalAmount`. Proof: one synthetic invoice per field group (17 groups; most free-text values carry `&`, `<`, `>` and non-ASCII, incl. characters outside Latin-1) is valid against the uncoupled CII D22B XSD, has its values at the Annex A XPaths, and comes back from a round trip with the same elements and attributes (path, value and count; decimals by value), re-serialized XSD valid. All groups together are stable over a second round trip, and every Annex A `EXT-FR-FE` XPath (the 4 above excepted) occurs in that document. The 6 Annex B `*_EXTENDED-CTC-FR_CII_*.xml` examples, re-serialized, lose no path and still pass the XSD, the EXTENDED-CTC-FR Schematron and BR-FR. Annex A shifts several XPaths by one row (CG-39); the tests follow the Factur-X matrix there. A third line `TaxTotalAmount` (allowed by the uncoupled XSD, not by Annex A or Factur-X EXTENDED) is dropped (was CG-18) | `pnpm build && pnpm vitest run tests/extended-ctc-fr-fields.test.ts` |
| `xmlToInvoice()` reads back every element and attribute `invoiceToXml()` writes (AGENTS.md lockstep convention; was CG-32): no element or attribute name the converter writes is missing from the parser's queries, and the tests below cover the dropped ones. It used to drop `SpecifiedAdvancePayment` (BG-X-45, with `IncludedTradeTax` BG-X-46, `PaidAmount/@currencyID` and the BG-X-85 preceding invoice reference), `TaxApplicableTradeCurrencyExchange` (BG-X-41, BT-X-258…261), `IndividualTradeProductInstance` (BG-X-84, BT-X-306 `BatchID`, BT-X-307), `IncludedReferencedProduct` (BG-X-1, BT-X-308, BT-X-309, BT-X-15/15-1, BT-X-16…20-1) and `RelatedSupplyChainConsignment` (BG-X-24, BT-X-152), and the `@schemeID` of the IDs it rebuilt from their text (context parameters BT-23 and BT-24, BT-1, BT-126, the procuring project, card, debtor IBAN and accounting account IDs). Optional code elements are read by presence, so a present-but-empty one (an empty BT-23, party `RoleCode`, allowance `ReasonCode`, …) stays present; it used to be dropped. Proof: an EXTENDED XSD-valid model with each subtree and attribute set (`&`, `<`, non-ASCII text, unit and rate decimals) goes `invoiceToXml` → `xmlToInvoice` → `invoiceToXml`; the element and attribute paths of both documents are compared both ways (nothing dropped, nothing fabricated), the two documents are identical, and the test asserts each expected path is present so an unset subtree cannot pass; it fails on the previous parser. The 56 official and 24 Annex B examples are also compared by path, original against re-serialized, which the model comparison (parser on both sides) cannot see; a third test round-trips an empty BT-23, `RoleCode` and `ReasonCode` (EXTENDED XSD valid) unchanged. Number formatting: see the plain-notation row above (was CG-28) | `pnpm build && pnpm vitest run tests/parser-roundtrip.test.ts tests/spec-examples.test.ts tests/annex-b-examples.test.ts` |
| The 1.09 EXTENDED cardinality changes are kept (matrix "Change 1.09"; EXTENDED XSD `minOccurs="0"`; was CG-35): a missing BT-131 `LineTotalAmount` and a missing BT-160 `Description` / BT-161 `Value` of an item attribute stay absent in the model and are not written back; they used to come back as `0.00` and as empty elements. A present but empty `Description`/`Value` stays present. The model properties are optional (TypeScript type change for readers, in `docs/guide/upgrading.md`). Proof: a subline with an empty line summation and attributes with only a name, only a value, neither, or empty ones is EXTENDED XSD valid, parses to `undefined` for each missing field, and is written back identical | `pnpm build && pnpm vitest run tests/parser-roundtrip.test.ts -t "stay absent"` |
| On the pdf-lib test base of `scripts/verify-pdfa.mjs`, `generate()` output is PDF/A-3B for every Factur-X profile, whether the base carries its own XMP and `/ID` or not (BR-HYBRID-02; CG-05 is that it does not convert a base). This is shown for that one base, not for every PDF/A-3B base. veraPDF 1.30.4 (`verapdf/cli@sha256:f085855d…`, pinned in the script, `--flavour 3b`, run offline; every job must end normally under the PDF/A-3b profile) first validates the base alone: a pdf-lib PDF with an embedded font, an sRGB OutputIntent, its own XMP PDF/A-3B identification and a trailer `/ID`, compliant. `generate()` on that base with the `Facture_F20260023` example XML shipped with 1.09 for each profile (MINIMUM, BASIC WL, BASIC, EN 16931, EXTENDED): all five compliant, so the base's own XMP being replaced by the Factur-X one keeps it compliant. The same pdf-lib base without its XMP and `/ID` also comes out compliant, as `generate()` writes the XMP identification and an `/ID` itself; a base may lack only those two and must meet every other PDF/A-3b requirement. A negative control, the EN 16931 XML on `examples/source-invoice.pdf` (not PDF/A), must fail `6.2.11.4.1` (font not embedded) and `6.2.4.3` (device colour without an OutputIntent) and does, so the run cannot pass by not validating; that output still declares PDF/A-3B (CG-41). Runs in CI as the `PDF/A-3B (veraPDF)` job, required by `CI OK`. ISO 19005-3 is not vendored: the verdict is veraPDF's. Not covered: PDF/A-3A/3U and PDF/A-4f, Order-X output, bases from other producers (the manual run in CG-05 used a stripped official example) | `pnpm build && pnpm pdfa:verify` (needs Docker) |

Not verified anywhere yet: any Order-X
asset (no Order-X spec vendored), field-by-field coverage of the EXTENDED profile beyond the 1.09
additions audited above, including the 1.09 manufacturer block BG-X-93. The parser round trip below
covers what `invoiceToXml()` writes, not EXTENDED fields the models lack (see CG-18 for EXT-FR-FE).

## Open gaps

| ID | Area | Rule / citation | Severity | Summary |
| --- | --- | --- | --- | --- |
| CG-05 | PDF/A | BR-HYBRID-02 | Fatal | `generate()` does not make the PDF PDF/A-3 (the caller supplies a PDF/A-3 base); preserving a PDF/A-3B base is verified in CI (see Verified) |
| CG-10 | spec | BR-HYBRID-04 vs §6.3.1 p.28 | — | Spec is internally inconsistent on the XMP namespace URI |
| CG-12 | profiles | §7.7, §6.2 p.25, `codelists--HybridConformance.csv`, `codelists--Filename.csv`, BR-HYBRID-12/13 | interop | XRECHNUNG level not detected and never generated; no DE profile restrictions |
| CG-13 | embedding | §6.2.2 p.27, §6.4 p.31 | interop | `generate()` rejects a source whose EmbeddedFiles name tree has `/Kids` levels |
| CG-14 | embedding | §6 p.24 | interop | `generate()` can miss an existing invoice whose content it cannot read and whose name it does not recognize |
| CG-15 | spec, licence | FNFE CTC FR 1.4.0 release notes p.6, p.8 | — | The FNFE CTC FR 1.4.0.04 release contradicts itself on its licence and its applicability dates |
| CG-16 | spec, provenance | FNFE CTC FR 1.4.0 release notes p.4–6, p.9, p.11 | — | BASIC WL / EN 16931 / EXTENDED validate against Factur-X 1.09.2.fixFR04 taken from the FNFE CTC FR release, not from an official Factur-X 1.09.2 distribution; MINIMUM / BASIC stay on 1.09 FINAL |
| CG-17 | spec | 1.09 FINAL `_XSLT_*` vs `.sch` | — | The 1.09 FINAL compiled XSLTs (still used for MINIMUM and BASIC) enforce rules absent from their own `.sch` |
| CG-21 | French CTC, e-reporting | Annex A `annex-a--E-REPORTING_-_Flux_10.csv` | interop | Flux 10 e-reporting is not supported (no licence in the release) |
| CG-22 | French CTC, coverage | release notes p.8-10; Annex A `annex-a--BR-France_CTC.csv`, `annex-a--BR-France-CTC-CPRO.csv` | interop | Annex A BR-FR rules the published Schematron does not implement (incl. `BR-FR-CPRO-*`); release notes contradict each other and the XSLT on coverage |
| CG-23 | French CTC, upstream | `BR-FR-Flux2-Schematron-CII.xslt` | — | SVRL `test` of 4 BR-FR asserts loses its regex quantifier (`^\d{9}$` reported as `^\d9$`) |
| CG-27 | spec, ZUGFeRD | §6.3.2 p.29 vs BR-HYBRID-08/13, `codelists--Filename.csv` | — | Spec says ZUGFeRD 2.0 legacy XMP settings are still supported, but its filename `zugferd-invoice.xml` is not an allowed hybrid filename |
| CG-33 | spec, French CTC, upstream | `EXTENDED-CTC-FR-CII.sch` BR-DEC-19/20 | Fatal (rules not run) | The EXTENDED-CTC-FR Schematron never fires BR-DEC-19/20 on VAT breakdowns of categories that have their own rules (first-match shadowing) |
| CG-40 | spec, French CTC, upstream | `EXTENDED-CTC-FR-CII.sch` BR-EXT-CL-07 | Fatal (rule not run) | The EXTENDED-CTC-FR Schematron never checks a `ReferenceTypeCode` against UNTDID 1153 (always-true guard) |
| CG-41 | PDF/A, XMP | BR-HYBRID-02 (via CG-05) | interop | `generate()` writes `pdfaid` PDF/A-3B into the XMP whatever the source, so a non-PDF/A base gives output that falsely claims PDF/A-3B |
| CG-44 | spec | BR-HYBRID-15 EN/FR/DE wording | — | BR-HYBRID-15 is "SHOULD" in EN and DE but "DOIT" (must) in FR, all flagged Warning (unresolved) |
| CG-45 | French CTC, UBL, upstream | `EXTENDED-CTC-FR-UBL.sch` BR-FREXT-IC-08rev | Warning | Annex B example F202500001 (EXTENDED-CTC-FR, UBL) raises the warning `BR-FREXT-IC-08rev` under the UBL profile Schematron |
| CG-46 | French CTC, UBL/CII, upstream | message `[ID]` prefix vs assert `@id` in the vendored Schematrons | interop | 8 EXTENDED-CTC-FR-UBL asserts, 13 EXTENDED-CTC-FR-CII asserts and 1 BR-FR UBL assert carry a message prefix that is not their `@id`; the UBL profile Schematrons now report `@id`, the CII one still the prefix |
| CG-47 | French CTC, spec, upstream | release notes p.8 vs `EXTENDED-CTC-FR-UBL.sch` BR-FREXT-IC-08 / -08rev | Warning | The notes make exemption reasons on document-level allowances/charges mandatory "as of July 2026", yet the fatal BR-FREXT-IC-08 passes without them and only the `rev` variant (a warning) checks them |
| CG-48 | UBL, provenance | release notes p.9, p.11; `UBL/1xsd_UBL2.1/UBL2.1_README.md` | docs | The release says the UBL 2.1 XSD is not provided (get it from OASIS) yet vendors it; identity to OASIS os-UBL-2.1 is not verified |
| CG-49 | spec | `fields--Factur-X_CII_D22B_EN16931.csv` / `_EXTENDED.csv` BT-11-0; `spec-main.txt` p.125 | — | The default value of BT-11-0 (project name) is written "Project Reference" in one cell and "Project reference" in the next (unresolved) |
| CG-50 | spec, French CTC, UBL | Annex A `annex-a--Flux_2_UBL_EXT-CTC-FR.csv` BG-13 vs `UBL-SR-24` (both vendored UBL Schematrons) | interop | BG-13 delivery is `0..n` in Annex A (EXTENDED-CTC-FR UBL) and "at most once" at header level in UBL-SR-24; the model holds one |
| CG-51 | models, spec | BG-16 (EN 16931 `0..1`) vs the Factur-X matrices and Annex A CII (`0..n`) | interop | `EN16931.PaymentInstructions` is a single group, CII allows several `SpecifiedTradeSettlementPaymentMeans`; a differing later means is reported in `dropped` |
| CG-52 | models, spec | BG-30 line VAT: EN 16931 `1..1`, Annex A CII `1..n`, EXTENDED matrix `0..n` | interop | `EN16931.LineVat` is a single group; a later `ApplicableTradeTax` of a line is reported in `dropped` |
| CG-53 | spec, French CTC | EXT-FR-FE-192 / BT-X-261 in the EXTENDED matrix vs Annex A | — | The matrix marks the exchange rate date (BT-X-261) EXTENDED only, Annex A puts it in EXTENDED-CTC-FR (unresolved) |
| CG-54 | spec, French CTC | Annex A UBL BG-29, BT-129, BG-30 `1..1` vs the EXTENDED matrix `0..1` and annex B UC10–UC13 | — | Annex A makes the price, quantity and VAT of every line mandatory, yet the EXTENDED matrix does not and the annex B examples carry lines without them (unresolved) |
| CG-55 | models, spec | EXTENDED matrix BT-X-565 (EXTENDED-CTC-FR column `X`) vs Annex A | interop | BT-X-565 (line delivery terms, trade location name) is in the EXTENDED-CTC-FR profile of the matrix but has no `EXT-FR-FE` id, so the EN 16931 model has no place for it; it is reported in `dropped` |
| CG-56 | parser | `src/lib/parsers/facturx.ts` | data-loss | `xmlToInvoice()` reads a missing mandatory amount (BT-92 / BT-99, BT-109, BT-112, BT-115, BT-167) as `0`, so neither the CII model nor `fromCii()` can tell it from a real zero (pre-existing) |
| CG-57 | models, spec | `fields--Business_Rules.csv` BR-FXEXT-01 / -02 (Factur-X EXTENDED Schematron) vs annex A EXTENDED-CTC-FR BT-22 / BT-127 `0..1` | interop | At Factur-X EXTENDED a note subject code needs the text or the coded text (BT-X-5 / BT-X-9), which the model does not hold: a note with a subject code and only a coded text reads into the model, and `toCii()` refuses to write it back at `extended` |
| CG-58 | models, spec | `fields--Business_Rules.csv` BR-50 vs the vendored Schematron context (`TypeCode` 30 or 58) | interop | BR-50 reads "BT-84 shall be present if BG-16 is provided"; the Schematron checks it only under payment means TypeCode 30 / 58. A document with another TypeCode whose `PayeePartyCreditorFinancialAccount` holds only BT-85 / BT-86 reads with `fromCii()`, and `toCii()` refuses to write it back (BR-50) |
| CG-59 | models, UBL, spec | Factur-X CII sub-terms BT-11-0, BT-41-0, BT-56-0 vs the UBL 2.1 XSD and annex A UBL | data-loss (refused) | The project name and the seller / buyer contact department names have no UBL element and no annex A UBL row; `invoiceToUbl()` throws on them, and the 12 annex B UBL examples silently leave out the department names all their CII twins carry |
| CG-60 | models, UBL, spec | EXT-FR-FE-184 and a second EXT-FR-FE-146 vs annex A UBL EXT-CTC-FR | data-loss (refused) | The line grand total (EXT-FR-FE-184) has an annex A CII row but no UBL row or element, and UBL `cac:DeliveryLocation` holds one identifier where the model holds several; `invoiceToUbl()` throws; annex B UC10, UC11, UC13 UBL drop the grand total |
| CG-61 | models, UBL, spec | UBL `cac:CardAccount/cbc:NetworkID` (XSD `minOccurs="1"`, annex A BT-87-1 `1..1`) vs EN 16931 BG-18 | data-loss (refused) | UBL needs a card network id that EN 16931 and the model do not have, so `invoiceToUbl()` throws on BG-18; annex B UC10 UBL invents `4` and writes a different primary account number than its CII twin |
| CG-62 | UBL, spec | BT-148 / BT-149-1 / BT-150-1 vs UBL `cac:Price` (one `cbc:BaseQuantity`; `cac:AllowanceCharge/cbc:Amount` `1..1`) | interop | A gross price without discount is written with a zero discount, as annex B does, so the UBL document itself cannot tell "no discount" from "discount 0"; a gross price base quantity that differs from BT-149 is refused |
| CG-63 | French CTC, UBL/CII, upstream | `BR-FR-Flux2-Schematron-UBL` vs `-CII` BR-FR-CO-10 | interop | For the ten identifiers BR-FR-CO-10 covers (BT-29, BT-46, BT-60, BT-71, EXT-FR-FE-06, -46, -69, -92, -115, -146) the UBL rule wants a `@schemeID` on every `cbc:ID`, the CII rule only on `ram:GlobalID`: a schemeless identifier passes BR-FR in CII and fails it in UBL; annex B F202500001 UBL drops the schemeless BT-29 and BT-71 its CII twin carries |
| CG-64 | models, UBL | BT-84-0 (Factur-X `ProprietaryID`) vs UBL `cac:PayeeFinancialAccount/cbc:ID` | interop | UBL has one account id: `invoiceToUbl()` writes BT-84-0 there when BT-84 is absent and refuses both; the written UBL no longer says which of the two it was; no annex B twin uses `ProprietaryID` |
| CG-65 | UBL, spec | XSD-mandatory identifiers (`OrderReference/cbc:ID`, `DocumentReference/cbc:ID`, `LineReference/cbc:LineID`, `OrderLineReference/cbc:LineID`) vs annex A `0..1` | interop | Annex A makes BT-13 optional yet nests BT-14 and EXT-FR-FE-197 under `cac:OrderReference`, whose `cbc:ID` the XSD requires (likewise EXT-FR-FE-01 / -198 / -199, -135 / -144 / -145 / -200, the line despatch and receipt references): `invoiceToUbl()` refuses those terms without the identifier |
| CG-66 | UBL, spec | EN 16931 BT-110 `0..1` vs UBL `cac:TaxTotal/cbc:TaxAmount` `1..1` holding BG-23 | interop | UBL keeps the VAT breakdown inside the `cac:TaxTotal` whose amount is BT-110, so `invoiceToUbl()` throws when BT-110 is missing (it never computes it) |
| CG-67 | spec, UBL | annex A `annex-a--Flux_2_UBL_EXT-CTC-FR.csv` XPath and cardinality cells | docs | Typos and gaps in the UBL rows (attribute `@Name` for `@name`, unprefixed or misspelt steps, EXT-FR-FE-BG-12 / -164-00 `0..0` though annex B uses them, no `cbc:ID` value for the line status reference, CreditNote BG-1 `0..1`, CreditNote contract date labelled EXT-FR-FE-01, CreditNote column ids and XPaths of EXT-FR-FE-191, -162, -182, BT-173 … BT-176, EXT-FR-FE-161); the writer follows the XSD, the Schematrons and annex B |
| CG-68 | UBL, spec | annex A UBL EXT-FR-FE-180 in the line `cac:InvoicePeriod` vs BR-CO-20 (both UBL Schematrons) | interop (refused) | UBL holds the line VAT point date code in the line period, which BR-CO-20 wants with a start or end date; CII holds it in the line `ApplicableTradeTax`. `invoiceToUbl()` refuses EXT-FR-FE-180 without BT-134 / BT-135 |
| CG-69 | spec, French CTC, models | annex A UBL BG-29 / BT-146 `1..1` vs EXTENDED-CTC-FR BR-26 (UBL `BR-FREXT-26`, CII `BR-FREXT-BR-26`) | Fatal | Annex A makes the line price mandatory, the Schematrons only on a line whose subtype EXT-FR-FE-163 is `DETAIL` or unset (same for BT-129, BG-30). `invoiceToUbl()` refuses such a line without them; `toCii()` at `extended-ctc-fr` does not and writes CII its Schematron refuses (open, fixed outside this PR) |
| CG-70 | spec, UBL | annex A `annex-a--Flux_2_UBL_EN16931_FR.csv` BT-127 row (`0..1`, no EXT-FR-FE-183) vs its BT-21 row usage note ("Uniquement en UBL : entre ## en début de Note de ligne"); annex B `F202500001_…EN16931_UBL` line note `#BLU#…` | interop | Annex A EN 16931 UBL contradicts itself on line note subject codes. Provisional reading: at `en16931` `ublToInvoice()` keeps a line note verbatim as BT-127 and `invoiceToUbl()` writes it back unchanged; the CII twin's BT-127 lacks the `#BLU#` prefix |
| CG-71 | spec | annex B `F202500001` UBL vs CII twins (BT-158-2, BG-32) | docs | The two renderings of the same invoice differ: the UBL twins add `listVersionID="ATTR2"` to the item classification of line 2, and lack the second item attribute (`CO2(g)` = `30`) the CII twins give line 3 |
| CG-72 | UBL, spec | BT-90 in annex A: a seller row and a payee row (both UBL CSVs) vs one model term | interop | A source with a payee may carry BT-90 on the seller. `ublToInvoice()` reads it (UBL-SR-29 counts `SEPA` ids document-wide); `invoiceToUbl()` writes BT-90 with the payee, so `dropped` reports the seller-side identifier although the value is kept |
| CG-73 | security, data integrity, CII | internal DTD entities vs `xmlToInvoice()` / `fromCii()` | data-loss (silent, open) | A CII document whose DOCTYPE declares an entity standing for an element (e.g. `ram:BuyerReference`) loses it: the parser does not expand entities (default options, on purpose) and reads around the reference, and `fromCii()` cannot see it, so `dropped` is empty. `ublToInvoice()` refuses any DOCTYPE; the CII side is fixed outside this PR |
| CG-74 | API, CII | `invoiceToXml()` returned `XmlDocument` vs XML namespaces | interop (open) | The children of the returned document are built with `addElement('ram:X')`, which in libxml2-wasm gives an element named `ram:X` with no namespace in memory: namespace-bound XPath on the returned document finds nothing; its serialisation is correct. `invoiceToUbl()` re-parses before returning; the CII writer is fixed outside this PR |
| CG-34 | French CTC, lifecycle, upstream | Annex A `annex-a--BR-FR-CDV_pour_factures.csv`, `annex-a--Tableau_des_motifs_de_STATUTS.csv` vs `BR-FR-CDV-Schematron-CDAR` | interop | The published BR-FR-CDV Schematron cannot fail on several Annex A rules, and some of its code lists differ from Annex A |
| CG-36 | spec | §version history p.7–8 vs the EXTENDED field matrix | — | The 1.09 version history contradicts the field matrix on several new fields (unresolved) |
| CG-37 | parser, models | EXTENDED XSD `NoteType/Content` `minOccurs="0"` | data-loss | A note without `Content` (BT-22 / BT-127) comes back with an empty `Content` element |
| CG-38 | spec | EXTENDED field matrix, its two XPath columns | — | The two XPath columns of the field matrix disagree on 9 rows (BT-X-261/261-0, BT-X-550…554, BT-X-562, BT-X-565) |
| CG-39 | spec, French CTC | Annex A `annex-a--CII_D22B_FX_EXT-CTC-FR.csv` vs `fields--Factur-X_CII_D22B_EXTENDED.csv` | — | Annex A gives several `EXT-FR-FE` rows the XPath of a neighbouring row (unresolved) |
| CG-43 | spec, extraction | §6.3.1 p.28, appendix p.71 vs §6.2 p.25 | — | The spec ties the invoice's name to the file specification's `/F`, not to the EmbeddedFiles name tree key; `extract()` prefers the key when they disagree |

### CG-05 — `generate()` does not produce PDF/A-3

- **Spec:** BR-HYBRID-02 (appendix 3.d, PDF p.158–159): the envelope SHALL be PDF/A-3 (or PDF/A-4f).
- **Code:** `generate()` only attaches the XML, sets the AF relationship, Info and XMP. Fonts, ICC
  output intent and the rest of PDF/A are the caller's job (see `tests/generate/index.ts`, which
  embeds a font, an sRGB OutputIntent and a TrimBox by hand). This is by design and now documented
  (`docs/api/generate.md`, "Supplying the PDF base"); the docs overclaim is fixed (see Verified).
  That `generate()` keeps a PDF/A-3B base compliant is now checked in CI by veraPDF on one pdf-lib
  test base, validated first (see Verified); that it also claims PDF/A-3B on a non-PDF/A base is CG-41.
- **What does hold (2026-11-15, `2741b28`):** `generate()` *preserves* PDF/A-3b when its input already is
  PDF/A-3b.
  - Base: the official EN 16931 example `Facture_F20260023-…_EN_16931.pdf` with its embedded files,
    `/AF` and `/PageMode` removed and unreferenced objects dropped, so that it is compliant.
  - The output passes for all five profiles (MINIMUM, BASIC WL, BASIC, EN 16931, EXTENDED), both with
    the base's trailer `/ID` kept (the default path, see the Verified row above) and with it stripped:
    10/10 runs compliant.
  - Validator: veraPDF 1.30.4, pinned as in the XMP UTF-8 row of Verified.
  - The base itself passes. With its `/ID` stripped it fails only `6.1.3 t1`, which `generate()` fixes
    by writing an `/ID`.
  - That run predates the Info and XMP changes of CG-04 and CG-25 (generation-time dates, Info
    `Producer`, XMP `pdf:Keywords`); it has not been repeated on that output.
  - The CI job (Verified, PDF/A-3B row) covers the same claim on the current output, including the
    CG-04 / CG-25 changes, with a pdf-lib base that it validates as PDF/A-3B first; it does not repeat
    this run's stripped-example base.

### CG-10 — Spec inconsistency on the XMP namespace (unresolved)

- §6.3.1 p.28 and the reference packet: `urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#`.
- BR-HYBRID-04 (PDF p.159, `text/fields--Business_Rules_HYBRID.csv`):
  `urn:factur-x:pdfa:CrossIndustryDocument:1p0#`, Fatal.
- The library uses the §6.3.1 form for every flavor. **Do not change it** on the strength of one
  reading. Settle it with an external validator result first, and record that result here.
- **Evidence for the BR-HYBRID-04 form (Order-X):** the two Order-X example PDFs in `examples/`
  (`ORDER-X_EX11_ORDER_PICK-UP-BASIC.pdf`, `ORDER-X_EX03_ORDER_BASIC_DATA-COMFORT.pdf`, added in the
  initial commit, provenance not recorded) declare `xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:1p0#"`
  with `ORDER` and `BASIC` / `COMFORT`; `generate()` writes the same values under the §6.3.1 URI.
  Not a validator result, so the rule above still holds. Read with pdf-lib:
  `PDFDocument.load(…)`, decode the catalog `/Metadata` stream, `grep xmlns:fx`.

### CG-12 — Reference profile XRECHNUNG and German restrictions

- XRECHNUNG (§7.7, `xrechnung.xml`, conformance `XRECHNUNG`) is only partly supported. `extract()`
  finds `xrechnung.xml` (see Verified), but `getLevel()` cannot parse its guideline ID, so `check()`,
  `extract({ check: true })` and the CLI `extract` (which checks by default) throw on a real
  XRechnung, and `generate()` never writes `xrechnung.xml` or the `XRECHNUNG` conformance level
  (§7.7 p.70: always `Alternative`). It is not applicable in France. The same `Unknown level`
  error now also comes from `extract({ check: true })` on an XRechnung under a ZUGFeRD file name
  (validated as `facturx` since #38); before, that threw `Unknown schema flavor`.
- `generate()` refuses a real XRechnung given an explicit `level` (`Unknown level`, since CG-42 is
  fixed); before, it embedded it as `factur-x.xml` with the level passed.
- MINIMUM and BASIC WL are "not allowed in Germany from 2025-01-01" as invoices
  (`codelists--HybridConformance.csv`). BR-HYBRID-DE-01 (Fatal, DE): MINIMUM is forbidden when buyer
  and seller are both in Germany. The library gives no warning for either.

### CG-13 — `/Kids` levels in the EmbeddedFiles name tree

- **Spec:** §6.2.2 p.27 and §6.4 p.31: "it is also allowed to insert one or two “/Kids” steps level
  between “/EmbeddedFiles” and “/Names”", and readers should accept this structure.
- **Code:** `readEmbeddedFilesNames` (`src/lib/pdf.ts`) walks one or two `/Kids` levels, so
  `extract()` finds the invoice (see Verified). `generate()` still rejects such a source on purpose
  (`assertEmbeddable` in `src/lib/generate.ts`), because pdf-lib would append a `/Names` array next to
  the root's `/Kids` and produce an invalid name tree (ISO 32000-1 §7.9.6). Trees deeper than two
  `/Kids` levels, which ISO 32000-1 allows but Factur-X does not mention, are refused by both.
- **Evidence:** `generate() still rejects a source whose tree has /Kids` in `tests/name-tree.test.ts`
  and `rejects inputs it cannot embed into correctly > embedded files name tree with /Kids` in
  `tests/generate.test.ts`.
- **Close when:** `generate()` inserts the invoice into a leaf (keeping `/Limits` right) instead of
  relying on pdf-lib's `attach()`.

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

  Page-level `/AF` (§6.2.1 p.25), annotation `/AF` and the `/FS` of `/FileAttachment` annotations are
  scanned since Tier 3 (Verified, `tests/page-attachments.test.ts`). Still not scanned: any other route
  to a file specification, for example an `/FS` key on an annotation subtype other than
  `/FileAttachment` (non-standard as far as the reviewers know; an invoice behind a `/Screen /FS` is
  accepted), rendition or rich-media assets of `/Screen`, `/Sound`,
  `/Movie` and `/RichMedia` annotations, widget annotations reachable only from `/AcroForm /Fields`,
  `/GoToE` actions, `/AF` on form XObjects, structure elements and marked content (PDF 2.0 / PDF/A-3,
  not vendored), and file specifications not reachable from the catalog at all. The ZUGFeRD 1 root
  namespace (`urn:ferd:CrossIndustryDocument:invoice:1p0`) is not vendored, so its detection is unverified.
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
  basis of the Apache-2.0 statement and to ask FNFE upstream for clarification. Tier 3 ships the
  compiled `EXTENDED-CTC-FR-CII` (was CG-18) and `BR-FR-CDV-Schematron-CDAR` (was CG-20) Schematrons of
  the same release: the maintainer decided on 2026-11-15 to ship them on the same basis for now,
  knowing two facts that weaken that basis for `EXTENDED-CTC-FR-CII`: release notes p.10 §2.1 list the
  publication's Schematrons as BR-FR-Flux2 (CII, UBL) and BR-FR-CDV only (p.9 does call
  EXTENDED-CTC-FR "a dedicated Schematron, published with this version 1.4.0"), and its `.sch` header
  reads "Schematron dérivé du schematron EN16931 preprocessed Licensed under … EUPL version 1.4.0",
  i.e. derived from the CEN EN 16931 Schematron, whose vendored copy
  (`CII/EN16931/schematron/EN16931-CII-validation-preprocessed.sch`) says EUPL 1.2. The uncoupled
  UN/CEFACT CII D22B and CDAR XSDs carry no licence header.
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

### CG-27 — ZUGFeRD 2.0 legacy settings vs the hybrid filename code list (unresolved)

- §6.3.2 p.29 ("Legacy: PDF/A Extension schema for ZUGFeRD 2.0"): although deprecated, ZUGFeRD still
  supports the ZUGFeRD 2.0 XMP settings: `zf:` schema `urn:zugferd:pdfa:CrossIndustryDocument:invoice:1p0#`,
  `zf:DocumentFileName` `zugferd-invoice.xml`, `zf:Version` `2p0`.
- BR-HYBRID-08/13 (Fatal, `text/fields--Business_Rules_HYBRID.csv`): the embedded file name SHALL be
  in the HybridDocumentFilename list (`text/codelists--Filename.csv`): `factur-x.xml`, `xrechnung.xml`,
  `order-x.xml`. `zugferd-invoice.xml` is not in it.
- The library does not pick a side: `generate()` writes neither (it refuses `zugferd`, see the CG-09
  Verified row), and `extract()` still finds `zugferd-invoice.xml`. Settle it with an external
  validator result (e.g. Mustang) before writing the legacy settings.
- **Evidence:** `grep -n "6.3.2\|zugferd-invoice" spec/factur-x-1.09/text/spec-main.txt`;
  `cat spec/factur-x-1.09/text/codelists--Filename.csv`.

### CG-33 — EXTENDED-CTC-FR Schematron shadows BR-DEC-19/20 (upstream)

- **Rule:** BR-DEC-19 (BT-116) and BR-DEC-20 (BT-117), `fatal`, in the rule with context
  `//ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax` of the `EN16931-CII-Model` pattern
  (`spec/fnfe-ctc-fr-1.4.0.04/distribution/CII/EXTENDED-CTC-FR/schematron/EXTENDED-CTC-FR-CII.sch`
  :931, :942-943).
- **Upstream:** earlier rules of the same pattern match the same nodes with a category filter (e.g.
  `ram:ApplicableTradeTax[ram:CategoryCode='S'][upper-case(ram:TypeCode)='VAT']`, :793, and :281–:869
  for AE, L, M, E, G, K, O, S, Z). In ISO Schematron only the first matching rule of a pattern fires,
  so BR-DEC-19/20 never run on those breakdowns. The CEN `EN16931-CII-validation-preprocessed.sch`
  (rule at :333) has no such earlier rules. Not patched here (vendored assets are never edited).
- **Effect:** at level `extended-ctc-fr`, `check({ schematron: true })` accepts a BT-117 with 3
  decimals; with `frCtc: true`, BR-FR-DEC-01 still rejects it, so the full sequence is invalid.
- **Evidence:** spec review probe (2026-11-15): Annex B F202500001 with BT-117 `7.80` → `7.800`:
  `check({ schematron: true })` at level `extended-ctc-fr` → no Schematron error; at `level: 'extended'`
  → `BR-DEC-20`.
- **Close when:** FNFE-MPE fixes the Schematron (to be reported upstream).

### CG-40 — EXTENDED-CTC-FR Schematron never runs BR-EXT-CL-07 (upstream)

- **Rule:** BR-EXT-CL-07 (`fatal`): an object identifier scheme (`ram:ReferenceTypeCode`, e.g. BT-18-1,
  BT-128-1) must be a UNTDID 1153 code.
- **Upstream:** `spec/fnfe-ctc-fr-1.4.0.04/distribution/CII/EXTENDED-CTC-FR/schematron/EXTENDED-CTC-FR-CII.sch`
  :1740 tests `not(self::ram:ContractReferencedDocument) or (…1153 list…)` in a rule whose context is
  `ram:ReferenceTypeCode`. The context node is never a `ContractReferencedDocument`, so the first branch
  is always true and the list is never consulted. The comment above it (:1736, "V1.3.1 CYS4") says the
  guard was added to exclude EXT-FR-FE-01, a `ContractReferencedDocument`'s scheme: testing the parent
  (`not(parent::ram:ContractReferencedDocument)`) would have done that. Annex A itself gives EXT-FR-FE-01
  two XPaths: `…/ram:ContractReferencedDocument/ram:ReferenceTypeCode` (`annex-a--FE_EN16931_EXTENDED.csv`
  line 22) and `…/ram:ContractReferencedDocument/ram:FormattedIssueDateTime`
  (`annex-a--CII_D22B_FX_EXT-CTC-FR.csv` line 318), both saying "Utiliser les codes de l'UNTDID 1153";
  the reading above follows the first. Compiled as such in the vendored
  `src/lib/xsd/facturx/extended-ctc-fr/EXTENDED-CTC-FR-CII.xslt` (template at :13100, assert at
  :13104–13108). Not patched here (vendored assets are never edited).
- **Effect:** at level `extended-ctc-fr`, `check({ schematron: true })` accepts any `ReferenceTypeCode`.
  The Factur-X EXTENDED Schematron does reject one outside its code list.
- **Evidence:** Annex B F202500001 (EXTENDED-CTC-FR) with BT-18-1 `IT` → `QQQ`: `validateSchematron({ level:
  'extended-ctc-fr' })` → no finding; `level: 'extended'` → "Value of 'ram:ReferenceTypeCode' is not
  allowed". Pinned by `tests/extended-ctc-fr.test.ts` "accepts, as a documented gap (CG-40)…".
- **Close when:** FNFE-MPE fixes the Schematron (to be reported upstream).

### CG-34 — Published BR-FR-CDV Schematron vs Annex A (upstream)

`validateCdar()` runs the vendored `BR-FR-CDV-Schematron-CDAR` unchanged. It has an assert for every
Annex A `BR-FR-CDV` id, but it does not enforce all of them. Recorded without picking a side; to be
reported to FNFE-MPE.

- **Rules that cannot fail** (Annex A `annex-a--BR-FR-CDV_pour_factures.csv`; cardinalities in
  `annex-a--CDV_FE_-_CDAR.csv`, e.g. MDG-4 and MDT-87 `1..1`):
  - `BR-FR-CDV-01/04/05/06/10` are written as `<rule context="X"><assert test=".">`: the assert only
    runs when X exists, and `.` is then true. The uncoupled XSD makes those elements optional, so a
    missing MDG-4 (`ExchangedDocument/IssueDateTime`) or MDT-87 (`IssuerAssignedID`) is not reported;
    an empty `<ram:IssuerAssignedID/>` passes too. CDV-05/06 problems surface only through
    `BR-FR-CDV-CL-02`.
  - `BR-FR-CDV-09` (MDT-77 mandatory) has the `TypeCode` element as context, so a missing MDT-77 is
    never reported as BR-FR-CDV-09; on the Annex B example the message still fails, through
    `BR-FR-CDV-07_MDT-38_yes` and `BR-FR-CDV-CL-05_MDT-88_23`. `BR-FR-CDV-13` (MDT-129 mandatory unless
    MDT-105 = 501) has the `IssuerTradeParty` as context: a missing group is not reported.
  - `BR-FR-CDV-07_MDT-38_no` sits in a second rule with the same context as the first rule of its
    pattern (only the first matching rule fires), and its test `count(…='DFH') ge 0` is always true.
- **Code lists that differ from Annex A:**
  - `BR-FR-CDV-CL-09_MDT-113_210B2G` omits `CONTACT_ACHTR`, which `annex-a--Tableau_des_motifs_de_STATUTS.csv`
    line 9 allows for "REFUSÉE B2G" (and which its own message lists): stricter than Annex A, a false
    rejection.
  - `BR-FR-CDV-CL-09_MDT-113_207` allows `DEST_INC`, which the table (line 17) does not mark for
    "EN LITIGE": looser.
  - `BR-FR-CDV-CL-04` allows `DFH` for MDT-59, absent from the Annex A list, although
    `BR-FR-CDV-07/-08` and the CDAR sheet use it.
  - `BR-FR-CDV-02` accepts `urn.cpro.gouv.fr:1p0:CDV:invoice` for a CDV sent to the PPF, where Annex A
    requires `…CDV:einvoicingF2` (the `.sch` comment keeps it "pour les échanges entre PA").
- **Out of reach of a message-only check:** `BR-FR-CDV-13` (one MDT-129 value must equal the seller's
  legal ID, BT-30 of the invoice) is only approximated by the warning `BR-FR-CDV-13_MDT-129-2`;
  `BR-FR-CDV-10`'s condition on the rejected file name is not checked.
- **Evidence**, all in `tests/cdar.test.ts`, on Annex B messages, each code-list case with a control
  showing the rule runs:
  - "accepts, as a documented gap (CG-34)…": missing MDG-4, MDT-87 and the MDT-129 group pass.
  - "documented gaps (CG-34) vs Annex A":
    - BR-FR-CDV-07: MDT-77 = 305 with an issuer MDT-38 and no DFH recipient passes.
    - BR-FR-CDV-09: a missing MDT-77 fails only `BR-FR-CDV-07_MDT-38_yes` and `BR-FR-CDV-CL-05_MDT-88_23`.
    - BR-FR-CDV-CL-09 (207): `DEST_INC` passes; `XXX_INC` fails `…_207`.
    - BR-FR-CDV-CL-09 (210 B2G, sender `GlobalID@0238` = 9999): `CONTACT_ACHTR` fails `…_210B2G`;
      `AUTRE` passes.
    - BR-FR-CDV-CL-04: MDT-59 `DFH` passes; `XXX` fails `BR-FR-CDV-CL-04_MDT-59`.
    - BR-FR-CDV-02: the POUR_PPF message with MDT-3 `CDV:invoice` passes.
- **Close when:** FNFE-MPE publishes a Schematron that enforces these rules, or Annex A is aligned.

### CG-36 — Version history vs field matrix for the 1.09 EXTENDED additions (unresolved)

- §version history p.7 writes BT-177-1 / BT-193-1 as `@listID (= 1153)`; the matrix rows say
  "Value = 5153" and the EXTENDED Schematron tests `@listID="5153"`. The code follows the Schematron.
- p.7 calls BT-193 a "Document-level non-VAT tax Type code"; the matrix row is the line-level one
  (`SpecifiedLineTradeSettlement`).
- p.8 numbers the manufacturer block "BG-X-94 … ID/GlobalID (BT-X-600), Name (BT-X-598), Postal
  Address (BG-X-93)"; the matrix has BG-X-93 = the party, BT-X-593/594 = ID/GlobalID, BT-X-595 = Name,
  BG-X-95 = address, BG-X-94 = contact, BT-X-600 = contact name, BT-X-598 = legal registration ID.
- Matrix BT-215: the usage note says "No Identification Scheme to be used", but its rules columns
  say "Use IBANID when appropriate, otherwise use ProprietaryID" (an account rule, for a BIC). The
  EXTENDED Schematron reports a `@schemeID` on that `BICID`.
- `text/codelists--Non-VAT_Tax_Code_5305_.csv` holds UNTDID 5153 codes under a "5305" name.
- p.7–8 list BT-X-590 (line VAT amount in accounting currency) as a new BT; its matrix row's change
  column says "Ref ID CTC-FR, Card 0..2", not "New".
- **Evidence:** `grep -n "1153\|BG-X-94" spec/factur-x-1.09/text/spec-main.txt`; the matrix rows
  `grep -n ',BT-177-1,\|,BT-193,\|,BT-215,' spec/factur-x-1.09/text/fields--Factur-X_CII_D22B_EXTENDED.csv`.

### CG-37 — A note without `Content` gets an empty one on a round trip

- **XSD:** in the EXTENDED XSD, `NoteType` has `Content` with `minOccurs="0"` (`ContentCode`,
  `Content`, `SubjectCode` are all optional). The field matrix gives BT-22 and BT-127 `1..1` in its
  "XML Cardinality" column and `0..1` in its "EXT PROFILES Cardinality" column.
- **Code:** `src/lib/parsers/facturx.ts` `parseNote()` fills a missing `Content` with an empty text,
  because `NoteType.content` is typed required; `invoiceToXml()` then writes
  `<ram:Content></ram:Content>`.
- **Evidence:** an `IncludedNote` with only a `SubjectCode` goes `invoiceToXml` → `xmlToInvoice` →
  `invoiceToXml` and comes back as
  `<ram:IncludedNote><ram:Content></ram:Content><ram:SubjectCode>AAI</ram:SubjectCode></ram:IncludedNote>`.
  Pinned as the expected loss by `tests/parser-roundtrip.test.ts` ("a note without Content (CG-37)",
  `CG37_ROUND_TRIP_LOSS`, to set to `false` when this is fixed):
  `pnpm build && pnpm vitest run tests/parser-roundtrip.test.ts -t "CG-37"`. Found by a scan
  of the EXTENDED XSD `minOccurs="0"` elements against the model properties typed required: the only
  others are BT-131/BT-160/BT-161 (fixed with CG-35) and `LineTradeSettlementType.applicableTradeTax`,
  an array, so an empty one writes nothing.
- **Fix direction:** make `NoteType.content` optional like `lineTotalAmount`, with an `upgrading.md`
  entry; it is read on every invoice, so it was left out of the CG-35 change.

### CG-38 — The two XPath columns of the EXTENDED field matrix disagree (unresolved)

`text/fields--Factur-X_CII_D22B_EXTENDED.csv` gives each field two XPaths: one with spaces between
the steps, one without. On these rows they name different elements (spaces removed):

- **BT-X-261, BT-X-261-0** (exchange rate date and its `@format`): `…/ram:ConversionRateDateTime/qdt:DateTimeString`
  vs `…/udt:DateTimeString`. The EXTENDED XSD types `ConversionRateDateTime` `udt:DateTimeType`, so
  only `udt:` is valid; the converter writes and the parser reads `udt:`.
- **BT-X-550 … BT-X-554** (`RoleCode` of the ship-to, ultimate ship-to, ship-from, invoicer and
  invoicee parties): the first column puts the party under `ram:ApplicableHeaderTradeAgreement`, the
  second under `ram:ApplicableHeaderTradeDelivery` (ship parties) or `ram:ApplicableHeaderTradeSettlement`
  (invoicer, invoicee). The XSD has these parties only where the second column puts them, which is
  where the code writes them.
- **BT-X-562** (delivery terms code): header `ApplicableHeaderTradeAgreement` vs line
  `SpecifiedLineTradeAgreement` `ApplicableTradeDeliveryTerms`.
- **BT-X-565**: `RelevantTradeLocation/ram:Name` vs `RelevantTradeLocation/ram:CountryID`.

The code follows the XSD where it decides; for BT-X-562 and BT-X-565 both readings are valid XSD
paths and the code supports both, so nothing here is picked.
- **Evidence:** compare the two XPath columns, e.g.
  `grep -n ',BT-X-261,\|,BT-X-261-0,\|,BT-X-55[0-4],\|,BT-X-562,\|,BT-X-565,' spec/factur-x-1.09/text/fields--Factur-X_CII_D22B_EXTENDED.csv`;
  `grep -n 'ConversionRateDateTime' src/lib/xsd/facturx/extended/*ReusableAggregate*.xsd`.

### CG-39 — Annex A shifts some EXT-FR-FE XPaths by one row (unresolved)

- **Spec:** XP Z12-012 v1.4 Annex A `annex-a--CII_D22B_FX_EXT-CTC-FR.csv` gives each `EXT-FR-FE-*` row
  an XPath (columns 9, 41 and 42). The Factur-X 1.09 EXTENDED matrix
  (`fields--Factur-X_CII_D22B_EXTENDED.csv`, column 7 = the `EXT-FR-FE` id) maps the same ids.
- **Inconsistency:** of the 210 ids both files have, they agree on 202. On the other 8, Annex A gives
  the row an XPath from a neighbouring row of the same block (the direction varies):
  - line seller address (BG-X-92): EXT-FR-FE-175 "code postal" → `CityName`, EXT-FR-FE-171
    "ligne 1" → `PostcodeCode`, EXT-FR-FE-172…174 → `LineOne`…`LineThree`, EXT-FR-FE-177 "code de
    pays" → `CountrySubDivisionName`, EXT-FR-FE-176 "subdivision" → `CountryID`; the matrix has the
    expected one for each;
  - EXT-FR-FE-01 "Type de contrat" (BT-X-405) → `ContractReferencedDocument/FormattedIssueDateTime`
    (matrix: `ContractReferencedDocument/ReferenceTypeCode`), and the contract date rows below it
    move down by one too, so EXT-FR-FE-199-1 ends on the exchange rate date `@format` (199-00, 199 and
    199-1 are not in the matrix: that reading rests on Annex A alone).
  - Columns 9 and 41 also write `SpecifiedLineTradeSettlementt` (EXT-FR-FE-180), put
    EXT-FR-FE-113 / -90 (invoicer / invoicee role) under `ApplicableHeaderTradeAgreement`, and
    type EXT-FR-FE-192 as `qdt:DateTimeString`; column 42 has the XSD-valid path.
  - EXT-FR-FE-181 and -182 are each `0..2` on the same element and filed under `SCT_HTS` (header
    totals) although the XPath is on the line; EXT-FR-FE-182 is `BT-X-ZZZ` in Annex A, BT-X-590 in the
    matrix; EXT-FR-FE-181-1 (`@currencyID`) is `1..1` in Annex A, BT-X-329-0 is `0..1` ("if present")
    in the matrix.
- EXT-FR-FE-193 (BT-X-562, line incoterms) has the header path `ApplicableHeaderTradeAgreement/ApplicableTradeDeliveryTerms/DeliveryTypeCode`
  in Annex A CII (row 49), while Annex A UBL (`/Invoice/cac:InvoiceLine/cac:DeliveryTerms/cbc:ID`) and the matrix
  (`SpecifiedLineTradeAgreement/ApplicableTradeDeliveryTerms/DeliveryTypeCode`) make it the line incoterm; and
  EXT-FR-FE-199 (the contract date, BT-X-148) carries the `/@format` XPath of its qualifier row EXT-FR-FE-199-1
  (the matrix puts the value at `.../qdt:DateTimeString`). The model follows the matrix and Annex A UBL.
- **Code:** unaffected: these are existing EXTENDED elements, written at their XSD position whatever
  label they carry. `tests/extended-ctc-fr-fields.test.ts` follows the matrix for EXT-FR-FE-01 and
  checks that every Annex A column-42 XPath occurs in its document.
- **Evidence:** compare column 42 of the Annex A rows with column 19 of the matrix rows sharing an
  `EXT-FR-FE` id, e.g. `grep -n ',EXT-FR-FE-01,\|,EXT-FR-FE-175,' spec/factur-x-1.09/text/fields--Factur-X_CII_D22B_EXTENDED.csv`
  and the same ids in `spec/afnor-xp-z12-012-1.4/text/annex-a--CII_D22B_FX_EXT-CTC-FR.csv`.
- **Close when:** AFNOR publishes a corrected Annex A (to be reported).

### CG-41 — `generate()` declares PDF/A-3B on output that is not PDF/A

- **Spec:** BR-HYBRID-02 (appendix 3.d, PDF p.158–159): the hybrid SHALL be PDF/A-3 (or PDF/A-4f).
  Non-PDF/A output violates it whatever its metadata says (that is CG-05, Fatal). Nothing vendored
  says a false PDF/A claim is itself a violation, so this entry is rated interop. That `pdfaid` is
  how a PDF claims PDF/A conformance comes from ISO 19005-3 (not vendored) and veraPDF's reading of
  it; the reference packet `distribution/2. FACTUR-X_extension_schema_exemple.xmp.txt` carries
  `pdfaid:part` 3 / `pdfaid:conformance` B.
- **Code:** `src/lib/xmp.ts` always writes `pdfaid:part` `3` and `pdfaid:conformance` `B`, whatever
  the source PDF is. `generate()` does not convert to PDF/A (CG-05), so a non-PDF/A source gives
  output that claims a conformance it does not have. Receivers that trust the claim are misled; one
  that validates it rejects the invoice. The same line also turns a source declaring PDF/A-3A or 3U
  into a 3B claim (a one-off review probe saw a 3U base come out passing 3b and failing 3u on
  `6.6.4 t3`; not pinned by a test).
- **Evidence:** the negative control of `pnpm build && pnpm pdfa:verify`. `generate()` on
  `examples/source-invoice.pdf` (unembedded font, no OutputIntent) produces a PDF whose XMP declares
  PDF/A-3B, and veraPDF 1.30.4 (`--flavour 3b`) finds it not compliant: `6.2.4.3 t2` (device colour
  space without an OutputIntent) and `6.2.11.4.1 t1` (font not embedded), glosses as in veraPDF's
  report.
- **Fix direction:** write `pdfaid` only when the source already declares PDF/A-3 (or behind an
  option), or check the base and warn or refuse. Either changes behaviour: `docs/guide/upgrading.md`.

### CG-43 — Tree key or `/F`: which names the invoice

- **Spec:** §6.3.1 p.28: `fx:DocumentFileName` "must be identical to the value of the F-tag in the
  file specification dictionary"; appendix p.71 says the same of entry `/F`. §6.2 p.25 names the file
  `factur-x.xml` and requires it in the EmbeddedFiles name tree, but says nothing of the tree key.
- **Code:** `findInvoiceFile` (`src/lib/extract.ts`) tries every tree key first, in tree order, then
  `/F`, then `/UF` (since CG-29; before, only the key was read). A file keyed `factur-x.xml` wins over
  an earlier one whose `/F` is `factur-x.xml`.
- **Evidence:** `pnpm build && pnpm vitest run tests/extract-budget.test.ts -t "prefers a tree key"`.
- **Unresolved:** no vendored rule decides between them; the key-first order keeps every PDF that
  extracted before returning the same file.

### CG-45 — Annex B UBL example F202500001 raises BR-FREXT-IC-08rev (upstream)

- **Rule:** BR-FREXT-IC-08rev (`flag="warning"`), `spec/fnfe-ctc-fr-1.4.0.04/distribution/UBL/EXTENDED-CTC-FR/schematron/EXTENDED-CTC-FR-UBL.sch`
  :618, compiled in `src/lib/xsd/ubl/extended-ctc-fr/EXTENDED-CTC-FR-UBL.xslt` at :3598. For a VAT
  breakdown (BG-23) of category `K` it asserts
  `(abs($basisAmount - $calculatedAmountBT131 + $allowancesAmountBT92 - $chargesAmountBT99) le 0.01 * ($nbLineItems + $nbAllowancesOrCharges))`:
  the taxable amount (BT-116) must equal the line net amounts (BT-131) plus charges (BT-99) minus
  allowances (BT-92) of the same category, rate, exemption reason code and exemption reason text.
- **Upstream:** in the Annex B example
  `F202500001/_EXTENDED-CTC-FR/F202500001_INV_20250201_EXTENDED-CTC-FR_UBL_Commentee.xml` the `K`
  breakdown (`K` at :374) has BT-116 `2.00` with BT-121 `VATEX-EU-IC` and BT-120 `LIVRAISON INTRACOMMUNAUTAIRE`
  (:376–377). The only `K` item is a document-level charge of `2.00` (the `cac:AllowanceCharge` block at :307–319) whose `cac:TaxCategory`
  carries neither `cbc:TaxExemptionReasonCode` nor `cbc:TaxExemptionReason`. The `rev` variable
  matches charges (`$chargesAmountBT99`, `$nbAllowancesOrCharges`), allowances and lines on code and
  text too, so it counts none of them: the SVRL message reports `SumBT131 : 0`, `NBlines : 0`,
  `sumChargesBT-99 : 0`, `NBAllowCharges : 0` for `basisAmount : 2`, and `2 le 0` is false. The fatal
  sibling `BR-FREXT-IC-08` passes the same document through its `…ini` alternative, which ignores the
  exemption reason. Which is wrong, the rule or the example, is not for this package to decide, but the
  evidence points at the UBL example:
  - XP Z12-012 Annex A binds the document-level charge exemption reason in UBL: `annex-a--Flux_2_UBL_EXT-CTC-FR.csv`
    rows EXT-FR-FE-189 (BT-175) and EXT-FR-FE-190 (BT-176) →
    `/Invoice/cac:AllowanceCharge/cac:TaxCategory/cbc:TaxExemptionReason` / `…ReasonCode`.
  - The CII twin `F202500001_INV_20250201_EXTENDED-CTC-FR_CII_Commentee.xml` carries them on the K charge
    (`ram:ExemptionReason` :600, `ram:ExemptionReasonCode` :602) and raises no warning.
  - Adding the same two elements (`VATEX-EU-IC`, `LIVRAISON INTRACOMMUNAUTAIRE`) to the UBL K charge's
    `cac:TaxCategory` clears the warning.
  - Release notes p.8 (`release-notes-en.txt`:341) describe the ini/rev warnings as the designed signal:
    the check runs with and without reasons, and a failure of either is flagged as a warning, "specifying
    whether it relates to the 'ini' rule (WITHOUT grounds) or the 'rev' rule (WITH grounds)". See also CG-47.
- **Effect:** `check({ schematron: true })` on this example returns `valid: true` with one entry in
  `schematronWarnings` (`BR-FREXT-IC-08rev`); the other 11 UBL annex B examples have none. Warnings do
  not affect `valid` unless `warningsAsErrors` is set, which then makes this official example invalid.
- **Evidence:** `pnpm build && pnpm vitest run tests/ubl-check.test.ts`: the row for
  `F202500001_INV_20250201_EXTENDED-CTC-FR_UBL_Commentee.xml` is `it.fails` ("no error and no warning"
  does not hold), and a separate test pins the current outcome (`valid: true`, no error, exactly the
  warning `BR-FREXT-IC-08rev`), so the run goes red as soon as upstream changes either side.
- **Close when:** FNFE-MPE fixes the rule or the example (to be reported upstream); then drop the
  `it.fails` in `tests/ubl-check.test.ts`.

### CG-46 — Schematron message `[ID]` prefix vs assert `@id` (upstream)

- **Rule:** SVRL reports both an assert's `@id` and its message text, which usually starts with a
  `[ID]` prefix. `parseSvrl` (`src/lib/schematron.ts`) has always taken the prefix first. In the
  vendored transforms the two do not always agree.
- **UBL profile Schematrons (fixed here):** `EXTENDED-CTC-FR-UBL.xslt`: 8 of 953 asserts, `@id` →
  prefix: `BR-FREXT-26` → `BR-26` (fatal), `BR-FREXT-54-1` → `BR-54-1` (fatal), `BR-FREXT-54-2` →
  `BR-54-2` (fatal), `BR-FREXT-AE-08ini` → `BR-FREXT-AE-08` (warning), `BR-FREXT-O-08ini` →
  `BR-FREXT-o-08ini` (warning), `BR-FREXT-S-08` → `BR-FREXT-S-08ini` (fatal), `CII-FREXT-CR-490` →
  `CII-FREXT-SR-366` (warning), `UBL-FREXT-CR-645` → `UBL-FREXT-CR-410` (warning).
  `EN16931-UBL-validation.xslt` has none (979 asserts). Both UBL transforms are configured with
  `idSource: 'assert'`, so `id` is the `@id` (the same field as `assertId`); the message text is
  untouched. Proof: `tests/ubl-check.test.ts` "reports the assert @id as the rule id".
- **EXTENDED-CTC-FR-CII (open, behaviour unchanged):** `EXTENDED-CTC-FR-CII.xslt` has 13 asserts whose
  `@id` is not the prefix: `BR-FREXT-54-1` → `BR-54-1`, `BR-FREXT-54-2` → `BR-54-2`,
  `BR-FXEXT-AE-08ini` → `BR-FXEXT-AE-08`, `CII-FREXT-SR-069` → `CII-SR-069`, `-072` → `CII-SR-072`,
  `-106` → `CII-SR-106`, `-439` → `CII-SR-439`, `-293` → `CII-SR-293`, `CII-SR-04` → `CII-SR-004`,
  `CII-SR-05` → `CII-SR-005`, `CII-FREXTDT-027` → `CII-FREXT-DT-027`, and `BR-FREXT-BR-38` /
  `BR-FREXT-BR-44` whose prefix is `[A/B]` and parses as no id. The CII transform keeps reporting the
  message prefix (changing it would change released behaviour for CII users); `assertId` always has the
  `@id`.
- **BR-FR-Flux2-Schematron-UBL:** one assert has `@id` `BR-FR-MV-BD_BT-3` while its text says
  `[BR-FR-BD-13/BT-3]`; the CII twin's assert is `BR-FR-BD-13_BT-3`. `BR-FR-MV-BD_BT-3` does not match the
  BR-FR rule pattern (`src/lib/fr-ctc.ts` `RULE_RE`), so `id` stays that raw assert id instead of
  `BR-FR-MV-…`/`BR-FR-BD-13`.
- **Evidence:** from the repo root (prints one line per assert whose `@id` is not the first `[ID]` of its
  message; expect 8 lines for the UBL file, 13 for the CII one, none for `EN16931-UBL-validation.xslt`):

  ```bash
  python3 -c "
  import re, sys
  for p in sys.argv[1:]:
      for b in re.findall(r'<svrl:(?:failed-assert|successful-report)\b.*?</svrl:(?:failed-assert|successful-report)>', open(p).read(), re.S):
          i = re.search(r'name=.id.>([^<]*)<', b)
          m = re.search(r'\[([A-Z]+(?:-[\w.]+)+)\]', re.sub(r'\s+', ' ', re.search(r'<svrl:text>(.*?)</svrl:text>', b, re.S).group(1)))
          if i and (not m or m.group(1) != i.group(1)):
              print(p.split('/')[-1], i.group(1), m and m.group(1))
  " src/lib/xsd/ubl/extended-ctc-fr/EXTENDED-CTC-FR-UBL.xslt src/lib/xsd/facturx/extended-ctc-fr/EXTENDED-CTC-FR-CII.xslt
  ```
- **Close when:** FNFE-MPE aligns prefix and `@id` (to be reported); then `idSource` can go and the CII
  transform can be moved to `@id` too (a behaviour change, `docs/guide/upgrading.md`).

### CG-47 — Exemption reasons on document-level charges: "mandatory July 2026" vs the Schematron (spec, upstream)

- **Spec:** release notes p.8 (`spec/fnfe-ctc-fr-1.4.0.04/text/release-notes-en.txt`:347): for EXTENDED-CTC-FR
  and EXTENDED, exemption reasons on lines and on document-level allowances/charges for any VAT
  category other than `S` or `Z` "will become mandatory as of July 2026".
- **Schematron:** `EXTENDED-CTC-FR-UBL.sch` :605 BR-FREXT-IC-08 is `flag="fatal"` and passes through its
  `…ini` alternative, which ignores the reasons; :618 BR-FREXT-IC-08rev (the variant that takes them
  into account) is `flag="warning"`. So the published rules cannot fail a document for lacking the reasons.
- **Effect:** the library runs the rules as published: a K charge without a reason passes with at most the
  warning `BR-FREXT-IC-08rev` (see CG-45). This package does not add the check.
- **Close when:** FNFE-MPE publishes the rule at fatal level, or states the transition is open-ended.

### CG-48 — UBL 2.1 XSD provenance (docs)

- **Spec:** release notes p.9 and p.11 and `spec/fnfe-ctc-fr-1.4.0.04/distribution/UBL/1xsd_UBL2.1/UBL2.1_README.md`
  say the UBL 2.1 XSD "can be downloaded from OASIS" (`os-UBL-2.1`) and is not provided; yet the
  distribution contains `1xsd_UBL2.1/` and the package vendors it (`src/lib/xsd/ubl/maindoc`, `common`).
- **Effect:** `pnpm spec:verify` proves the vendored XSDs identical to `spec/`, not to OASIS os-UBL-2.1. That
  they are the OASIS files is **not verified** (no network in the audit).
- **Evidence:** `for f in src/lib/xsd/ubl/common/*.xsd; do cmp "$f" "spec/fnfe-ctc-fr-1.4.0.04/distribution/UBL/1xsd_UBL2.1/common/$(basename $f)"; done`
  prints nothing (identical to the release); comparing with a download of `UBL-2.1.zip` is what closes this.
- **Close when:** the vendored `maindoc/` and `common/` are compared with the OASIS os-UBL-2.1 archive.

### CG-49 — BT-11-0 default value: "Project Reference" vs "Project reference" (unresolved)

- **Spec:** the Factur-X matrices give BT-11-0 (`SpecifiedProcuringProject/Name`, project name, mandatory
  inside the project group) a usage note in two cells of the same row. The "Business Term" column says
  `Value : "Project Reference"` (capital R), the "CIUS" column says `Use "Project reference" as default value
  for Name.` (lower-case r). The EN 16931 appendix writes `Default = "Project reference"` and the main spec
  table (`spec-main.txt`, PDF page 125, line 10022) has both spellings in adjacent cells of the BT-11-0 row.
- **Inconsistency:** the two spellings differ in case only. Neither the XSD nor the Schematron checks the value.
- **Code:** the contradiction stays open, but the library has to write something when BT-11 is set without a
  name, and it writes the lower-case `Project reference` (the CIUS-column wording and the EN 16931 appendix's
  `Default = "Project reference"`, `header.ts` `DEFAULT_PROJECT_NAME`); nothing checks the value, so either
  spelling is accepted when read. A project name that is set is written as given, and `toCii()` throws when it
  is set without BT-11, as CII has the name only inside the project reference.
- **Evidence:** `grep -n 'BT-11-0,' spec/factur-x-1.09/text/fields--Factur-X_CII_D22B_EN16931.csv | cut -c1-300`;
  `sed -n 10022p spec/factur-x-1.09/text/spec-main.txt`; `sed -n 2503p spec/factur-x-1.09/text/appendix-en16931.txt`.

### CG-50 — BG-13 delivery: `0..n` in Annex A UBL EXTENDED-CTC-FR, "maximum once" in UBL-SR-24 (unresolved)

- **Spec:** Annex A `annex-a--Flux_2_UBL_EXT-CTC-FR.csv` gives BG-13 (`/Invoice/cac:Delivery`) the cardinality
  `0..1` for EN 16931 and `0..n` for EXTENDED-CTC-FR ("Card UBL XML EXTENDED", column 7). Both vendored UBL
  Schematrons, `EN16931-UBL-validation` and `EXTENDED-CTC-FR-UBL`, carry `UBL-SR-24` "Deliver to information
  shall occur maximum once". The CII side, `ApplicableHeaderTradeDelivery`, is single.
- **Effect:** the model keeps one delivery (`EN16931.Invoice.delivery`): the `0..n` cannot be written as a
  UBL document that passes UBL-SR-24, and the CII side is single. `ublToInvoice()` reads the first
  `cac:Delivery` and reports a second one in `dropped`.
- **Evidence:** `grep -n ',BG-13,' spec/afnor-xp-z12-012-1.4/text/annex-a--Flux_2_UBL_EXT-CTC-FR.csv | cut -d, -f2-7`;
  `grep -o 'UBL-SR-24[^<]\{0,60\}' src/lib/xsd/ubl/extended-ctc-fr/EXTENDED-CTC-FR-UBL.xslt src/lib/xsd/ubl/en16931/EN16931-UBL-validation.xslt`;
  `pnpm build && pnpm vitest run tests/ubl-reader.test.ts -t "second cac:Delivery"`.
- **Close when:** FNFE-MPE reconciles Annex A with the rule, or the rule is relaxed for EXTENDED-CTC-FR.

### CG-51 — BG-16 payment instructions: one group in the model, several payment means in CII (model limit)

- **Spec:** EN 16931 has BG-16 `0..1`. The Factur-X EXTENDED matrix row for
  `ApplicableHeaderTradeSettlement/SpecifiedTradeSettlementPaymentMeans` has "EXT PROFILES Cardinality"
  `0..n`, and Annex A CII agrees (EN 16931 `0..1`, EXTENDED `0..n`). The matrix repeats BT-81 / BT-82 on every
  means.
- **Model:** `EN16931.PaymentInstructions` is single (BG-16 `0..1`, EN 16931). BT-81, BT-82, the card and
  the debited account come from the first payment means, every credit transfer (BG-17) is read.
  What a later means holds beyond that is in `dropped`, positions only.
- **Effect:** `fromCii()` reports it, so nothing is lost silently; a caller who needs several payment means keeps
  the CII model. UBL repeats `cac:PaymentMeans` once per credit transfer: `ublToInvoice()` reads every means with the
  first one's BT-81 and BT-83 as a further credit transfer (BT-82, the card and the mandate only from the first,
  UBL-SR-46 / -55), and reports a means whose BT-81 or BT-83 differs in `dropped`.
- **Evidence:** `grep -n ',BG-16,' spec/factur-x-1.09/text/fields--Factur-X_CII_D22B_EXTENDED.csv | cut -c1-140`;
  `pnpm vitest run tests/en16931-settlement.test.ts -t "reports differing payment means"`;
  `pnpm build && pnpm vitest run tests/ubl-reader.test.ts -t "payment means whose BT-81 differs"`.

### CG-52 — BG-30 line VAT: one block in the model, `1..n` in Annex A CII (model limit)

- **Spec:** EN 16931 has BG-30 `1..1`; Annex A UBL EXTENDED-CTC-FR `1..1`; Annex A CII
  (`annex-a--CII_D22B_FX_EXT-CTC-FR.csv`, `SpecifiedLineTradeSettlement/ApplicableTradeTax`) `1..n`, and the
  EXTENDED matrix `0..n`.
- **Model:** `EN16931.LineVat` is single, as EN 16931 and UBL are. The first block is read, a later one is in
  `dropped` (by position). The block itself is optional at EXTENDED (see CG-54).
- **Evidence:** `grep -n ',BG-30,' spec/afnor-xp-z12-012-1.4/text/annex-a--CII_D22B_FX_EXT-CTC-FR.csv | cut -c1-220`;
  `grep -n ',BG-30,' spec/factur-x-1.09/text/fields--Factur-X_CII_D22B_EXTENDED.csv | cut -c1-120`.

### CG-53 — EXT-FR-FE-192 (BT-X-261, exchange rate date): EXTENDED only in the matrix, in CTC-FR in Annex A (unresolved)

- **Spec:** the EXTENDED matrix row `BT-X-261` (`TaxApplicableTradeCurrencyExchange/ConversionRateDateTime`)
  is marked `X` for EXTENDED-B2B-FR and EXTENDED, `-` for EXTENDED-CTC-FR (columns 30 to 32 of the file: EXTENDED-CTC-FR, EXTENDED-B2B-FR, EXTENDED). Annex A CII and UBL
  list the same element as `EXT-FR-FE-192`, a field of the EXTENDED-CTC-FR profile (CG-39 already records its
  qualifier row).
- **Code:** the model holds it (`EN16931.VatCurrencyExchange.exchangeRateDate`, `@ext EXT-FR-FE-192`) at `extended` and
  `extended-ctc-fr`: Annex A is the id source for the scope, and the element is valid in the plain CII XSD that
  EXTENDED-CTC-FR uses.
- **Evidence:** `grep -n ',BT-X-261,' spec/factur-x-1.09/text/fields--Factur-X_CII_D22B_EXTENDED.csv | cut -c1-80`
  and read columns 30 to 32; `grep -n 'EXT-FR-FE-192' spec/afnor-xp-z12-012-1.4/text/annex-a--CII_D22B_FX_EXT-CTC-FR.csv | cut -c1-120`.

### CG-54 — Annex A makes the line price, quantity and VAT mandatory; the matrix and annex B do not (unresolved)

- **Spec:** Annex A UBL EXTENDED-CTC-FR gives BG-29 (price), BT-146, BT-129 (quantity) and BG-30 `1..1`. The
  EXTENDED matrix has "EXT PROFILES Cardinality" `0..1` for BG-29 and BT-129 and `0..n` for BG-30. In the
  annex B Factur-X examples UC10, UC11 and UC13, the GROUP lines, and in UC12 the INFORMATION lines, carry no net
  price, no quantity and no VAT block, and pass the profile Schematron.
- **Model:** `EN16931.InvoiceLine.price`, `.invoicedQuantity` and `.vat` are optional and mandatory below
  `extended` only (`toCii()` throws naming BG-29, BT-129, BG-30, BT-151, BT-161 there). A UBL writer (PR ③) will
  need a rule for these lines: Annex A and the UBL Schematron have to be checked first.
- **Evidence:** `grep -n 'IncludedSupplyChainTradeLineItem' "spec/afnor-xp-z12-012-1.4/distribution/XP_Z12-012_Annexe_B_EXEMPLES_V1.4/Factures/Facture Sous Ligne - Multi-Vendeur - Bidirectionnelle/_Sous-ligne/UC12_F202600025_SOUS-LIGNE_EXTENDED-CTC-FR_CII_Commentee.xml"`
  (line 4 has no `NetPriceProductTradePrice` and no VAT); `grep -n ',BG-29,' spec/afnor-xp-z12-012-1.4/text/annex-a--Flux_2_UBL_EXT-CTC-FR.csv | cut -d, -f2-8`;
  `pnpm vitest run tests/en16931-lines.test.ts -t "annex B UC12"`.

### CG-55 — BT-X-565 is in the EXTENDED-CTC-FR column of the matrix, yet has no EXT-FR-FE id (model limit)

- **Spec:** the EXTENDED matrix row `BT-X-565` (`SpecifiedLineTradeAgreement/ApplicableTradeDeliveryTerms/RelevantTradeLocation/Name`,
  line delivery terms: trade location) is `X` for EXTENDED-CTC-FR. Annex A (CII and UBL) has no row for it, so it
  has neither an EN 16931 nor an `EXT-FR-FE` id; CG-38 already records that its two XPath columns disagree.
- **Model:** the scope is "every EN 16931 id and every `EXT-FR-FE` id", so BT-X-565 is not modelled and a
  document that carries it reports it in `dropped` (also in an `extended-ctc-fr` document).
- **Evidence:** `grep -n ',BT-X-565,' spec/factur-x-1.09/text/fields--Factur-X_CII_D22B_EXTENDED.csv | cut -c1-90`
  (column 30, EXTENDED-CTC-FR, is `X`); `grep -c 'BT-X-565' spec/afnor-xp-z12-012-1.4/text/annex-a--CII_D22B_FX_EXT-CTC-FR.csv` prints 0.
  The rest of the model scope notes (BT-X-7 and the other BT-X outside annex A) are in `docs/guide/en16931-model.md`.

### CG-56 — The CII parser zero-fills missing mandatory amounts (data integrity, pre-existing)

- **Code:** `src/lib/parsers/facturx.ts` reads a missing `ChargeAmount` of a trade price (BT-146 / BT-148, ~363),
  `ConversionRate` (BT-167, ~533), `TaxBasisTotalAmount` (BT-109), `GrandTotalAmount` (BT-112) and
  `DuePayableAmount` (BT-115) (~553 to 567), `AppliedAmount` of a logistics service charge (BT-X-272, ~697)
  and `ActualAmount` (~682, the shared `parseAllowanceCharge`: document allowances and charges BT-92 / BT-99,
  line ones BT-136 / BT-141 and the price discount BT-147) as `0`. A document that lacks them reads exactly like one that
  states `0`, so the CII model, and `fromCii()` on top of it, cannot report the omission; the XSD (BASIC and
  above) and the Schematron do, when the document is checked.
- **Effect:** `fromCii(await xmlToInvoice(xml))` on an unchecked document can return an invoice with a zero amount
  that the source never had. The EN 16931 model inherits it; a caller who reads untrusted documents runs `check()`
  first.
- **Close when:** the parser keeps the amount absent (a CII model typing change: these fields would become
  optional, a compatibility decision under AGENTS.md) or `fromCii()` is given the XML.
- **Evidence:** `grep -n "?? new udt.AmountType({ value: 0\|?? zero()\|ConversionRate')) ?? '0'" src/lib/parsers/facturx.ts`.

## Changing this file

- Add an entry when a gap is confirmed **with evidence** (a command and its output, or a failing
  test). Suspicions go to an issue, not here.
- Close an entry by moving its proof (test name or command) to **Verified**, in the same PR as the fix.
- Re-run every proof in **Verified** when the spec version or a vendored asset changes.

### CG-44 — BR-HYBRID-15 strength differs between its EN, FR and DE texts (unresolved)

- `text/fields--Business_Rules_HYBRID.csv` line 17: EN "The fx:ConformanceLevel SHOULD match the
  profile of the embedded XML document", FR "DOIT correspondre" (must), DE "SOLLTE … entsprechen"
  (should). All three are flagged Warning.
- The library does not pick a reading. `generate()` refuses an explicit `level` that contradicts BT-24
  as its own policy (Verified row, was CG-42): output that matches satisfies every reading. A
  reader-side check (e.g. `extract()` comparing the XMP with the XML) would have to choose a severity;
  none exists today.
- **Evidence:** `grep -n "HYBRID-15" spec/factur-x-1.09/text/fields--Business_Rules_HYBRID.csv`.

### CG-57 — Note subject code without text: BR-FXEXT-01 / -02 at Factur-X EXTENDED (model limit)

- **Spec:** EN 16931 makes BT-22 `1..1` in BG-1 (Factur-X BASIC and EN 16931 matrices too). The EXTENDED XSD
  `NoteType/Content` is `minOccurs="0"` (CG-37) and annex A EXTENDED-CTC-FR gives BT-22 and BT-127 `0..1`
  ("EXT PROFILES Cardinality"), so a note may have no text there. The Factur-X EXTENDED Schematron adds
  BR-FXEXT-01 (BT-21 needs BT-X-5 or BT-22) and BR-FXEXT-02 (BT-X-10 / EXT-FR-FE-183 needs BT-X-9 or
  BT-127); the EXTENDED-CTC-FR Schematron has no such rule.
- **Model:** `InvoiceNote.note` and `LineNote.note` are optional (the wider cardinality). `toCii()` refuses a
  note without text at `basic` and `en16931`, refuses a subject code without text at `extended`
  (BR-FXEXT-01 / -02), refuses a note with neither text nor subject code at both extended levels (it would
  write an empty `ram:IncludedNote`: at `extended` that avoids PEPPOL-EN16931-R008, at `extended-ctc-fr`, whose
  Schematron has no such rule, it is a deliberate choice, stricter than that level's Schematron), and otherwise writes a note without text without
  `ram:Content`. The coded texts
  BT-X-5 / BT-X-9 are true `BT-X` fields outside the model (reported in `dropped`).
- **Effect:** a Factur-X EXTENDED note holding a subject code and only a coded text reads into the model with
  no text (the coded text in `dropped`), and `toCii()` refuses to write it back at `extended`. No official
  example carries such a note.
- **Close when:** the model holds BT-X-5 / BT-X-9 (out of scope today), or BR-FXEXT-01 / -02 change.
- **Evidence:** `grep -n 'BR-FXEXT-01\|BR-FXEXT-02' spec/factur-x-1.09/text/fields--Business_Rules.csv`;
  `grep -n ',BT-22,\|,BT-127,\|EXT-FR-FE-183' spec/afnor-xp-z12-012-1.4/text/annex-a--CII_D22B_FX_EXT-CTC-FR.csv`;
  `pnpm build && pnpm vitest run tests/en16931-strict.test.ts -t "note"`.

### CG-58 — BR-50 in `toCii()` vs the vendored Schematron's payment means context (unresolved)

- **Spec:** BR-50 (`spec/factur-x-1.09/text/fields--Business_Rules.csv`): "A Payment account identifier (BT-84)
  shall be present if Credit transfer (BG-16) information is provided in the Invoice." The matrices give
  BT-84 `1..1` in BG-17. The vendored Schematrons (BASIC WL, BASIC, EN 16931, EXTENDED and EXTENDED-CTC-FR
  alike) fire BR-50 only in the context
  `//ram:SpecifiedTradeSettlementPaymentMeans[ram:TypeCode='30' or ram:TypeCode='58']/ram:PayeePartyCreditorFinancialAccount`
  (e.g. `src/lib/xsd/facturx/en16931/FACTUR-X_EN16931.xslt` l.3372). Under any other payment means type code
  the Schematron accepts a bank account block without BT-84; the rule text and the matrix do not.
- **Model:** `toCii()` follows the rule text: every BG-17 needs BT-84 or BT-84-0 (`settlement.ts`), whatever
  `paymentMeansTypeCode` is. The code is not weakened to match the Schematron.
- **Effect:** a document with payment means TypeCode other than 30 / 58 whose
  `PayeePartyCreditorFinancialAccount` has only BT-85 / BT-86 reads with `fromCii()`, but `toCii()` refuses to
  write it back (BR-50). No official example does this.
- **Status:** unresolved (spec contradiction between the rule text and the executable Schematron).
- **Close when:** the spec text or the Schematron context change, or the controller decides to align.
- **Evidence:** `grep -n "BR-50" spec/factur-x-1.09/text/fields--Business_Rules.csv`;
  `grep -n "BR-50\]" -B12 src/lib/xsd/facturx/en16931/FACTUR-X_EN16931.xslt | grep fired-rule`;
  `pnpm build && pnpm vitest run tests/en16931-strict.test.ts -t "CG-58"`.

### CG-59 — BT-11-0, BT-41-0, BT-56-0 have no UBL element (model limit, annex B drops them)

- **Spec:** the Factur-X matrices give BT-11-0 (`ram:SpecifiedProcuringProject/ram:Name`), BT-41-0 and BT-56-0
  (`ram:DefinedTradeContact/ram:DepartmentName`); annex A CII EXT-CTC-FR has a row for each. The UBL 2.1 XSD has
  no project name in `ProjectReferenceType` (`ID`, `UUID`, `IssueDate`, `WorkPhaseReference`) and no department in
  `ContactType` (`ID`, `Name`, `Telephone`, `Telefax`, `ElectronicMail`, `Note`, `OtherCommunication`); neither
  annex A UBL file has a row for the three ids.
- **Annex B:** every CII twin of the 12 UBL examples carries a seller and / or buyer `ram:DepartmentName`
  (`DEP ADV`, `DEP COMPTAFOUR`); none of the UBL examples carries the value anywhere.
- **Writer:** `invoiceToUbl()` throws, naming the term, on BT-41-0, BT-56-0 and on a BT-11-0 other than the CII
  default `Project reference` (CG-49), rather than dropping them. The writer tests strip them from the model read
  from the CII twin, and check that the twin holds exactly those terms and that each alone makes the writer throw.
- **Close when:** the binding gives these terms a UBL place, or the model drops them.
- **Evidence:** `grep -c ',BT-41-0,\|,BT-56-0,\|,BT-11-0,' spec/afnor-xp-z12-012-1.4/text/annex-a--Flux_2_UBL_EXT-CTC-FR.csv`
  (0); `pnpm build && pnpm vitest run tests/ubl-writer.test.ts -t "department|no-place|cannot carry"`.

### CG-60 — EXT-FR-FE-184 and several EXT-FR-FE-146 have no UBL place (model limit, annex B drops them)

- **Spec:** annex A CII EXT-CTC-FR binds EXT-FR-FE-184 (line grand total, `ram:GrandTotalAmount` of the line);
  annex A UBL EXT-CTC-FR has no EXT-FR-FE-184 row and `InvoiceLineType` has no element for it. The UBL
  `cac:InvoiceLine/cac:Delivery/cac:DeliveryLocation` holds one `cbc:ID` (EXT-FR-FE-146 `0..1`); the model holds
  the CII `ShipToTradeParty/GlobalID` list (`0..n`).
- **Annex B:** UC10, UC11 and UC13 carry EXT-FR-FE-184 in CII and not in UBL.
- **Writer:** `invoiceToUbl()` throws on EXT-FR-FE-184 (at both levels, before the level gate, so the message
  stays right at `en16931`) and on more than one EXT-FR-FE-146 of a line.
- **Evidence:** `grep -c ',EXT-FR-FE-184,' spec/afnor-xp-z12-012-1.4/text/annex-a--Flux_2_UBL_EXT-CTC-FR.csv` (0);
  `pnpm build && pnpm vitest run tests/ubl-writer.test.ts -t "no-place|EXT-FR-FE-146"`.

### CG-61 — UBL requires a card network id EN 16931 does not have (model limit, annex B UC10 invents it)

- **Spec:** `CardAccountType` in `src/lib/xsd/ubl/common/UBL-CommonAggregateComponents-2.1.xsd` (l.3122) has
  `cbc:NetworkID minOccurs="1"`; annex A UBL lists BT-87-1 `1..1` ("Mandatory element. Use card Network
  identifier."). EN 16931 BG-18 has BT-87 and BT-88 only; the model has no network id.
- **Annex B:** UC10 CII carries the card `4970xx0265`; the UBL twin writes `cbc:PrimaryAccountNumberID` `0265`
  and `cbc:NetworkID` `4`, a value the CII twin does not have.
- **Writer:** `invoiceToUbl()` throws on BG-18 naming BT-87-1, instead of inventing a network id. A card payment
  cannot be written in UBL until the model holds BT-87-1.
- **Reader:** `ublToInvoice()` reads BT-87 and BT-88 and reports `cac:CardAccount/cbc:NetworkID` in `dropped`
  (UC10: exactly that path). The invoice it returns is then refused by `invoiceToUbl()`; the round-trip test asserts
  that, then round-trips UC10 with the card cleared.
- **Close when:** the model gets a BT-87-1 property, or the binding drops the requirement.
- **Evidence:** `grep -n 'ref="cbc:NetworkID"' src/lib/xsd/ubl/common/UBL-CommonAggregateComponents-2.1.xsd`;
  `pnpm build && pnpm vitest run tests/ubl-writer.test.ts -t "BG-18|card"`;
  `pnpm build && pnpm vitest run tests/ubl-reader.test.ts -t "UC10"`.

### CG-62 — Gross price and base quantities in UBL `cac:Price` (interop)

- **Spec:** UBL `PriceType` has one `cbc:BaseQuantity` (BT-149 / BT-150) and the gross price BT-148 in
  `cac:AllowanceCharge/cbc:BaseAmount`, whose `cbc:Amount` (BT-147) is `1..1` (XSD and annex A). CII has a base
  quantity per price (Factur-X BT-149-1 / BT-150-1 for the gross one) and a gross price without discount.
- **Annex B:** every UBL example writes a gross price without discount as `cbc:Amount` `0.0000`; in every CII
  twin BT-149-1 / BT-150-1 equal BT-149 / BT-150.
- **Writer:** follows annex B (zero discount), writes BT-149-1 / BT-150-1 only when they equal BT-149 / BT-150
  (then nothing is lost) and throws otherwise. A discount without gross price is written without
  `cbc:BaseAmount` (optional in UBL, annex A BT-148 `0..1`; `toCii()` keeps refusing it, CII holds the discount
  in the gross price).
- **Reader:** `ublToInvoice()` reads `cbc:Amount` `0` with a `cbc:BaseAmount` as no discount (BT-147 absent), the
  shape the writer gives a gross price without discount, so the two writers' models agree with the CII twins; the
  writer writes both readings identically, so nothing is lost. It reads the one `cbc:BaseQuantity` as BT-149 /
  BT-150 only: BT-149-1 / BT-150-1 stay absent (the CII twins repeat BT-149 there).
- **Evidence:** `pnpm build && pnpm vitest run tests/ubl-writer.test.ts -t "sub-cent|cannot carry|BT-147 without BT-148"`;
  `pnpm build && pnpm vitest run tests/ubl-reader.test.ts -t "zero price discount|CII twin"`.

### CG-63 — BR-FR-CO-10 is stricter in UBL than in CII (upstream)

- **Rule:** BR-FR-CO-10 covers ten identifiers in both BR-FR Schematrons: BT-29, BT-46, BT-60, BT-71,
  EXT-FR-FE-06, -46, -69, -92, -115 and -146 (asserts `BR-FR-CO-10_<id>-1` and `-2`). In
  `src/lib/xsd/ubl/fr-ctc/BR-FR-Flux2-Schematron-UBL.xslt` the `-1` asserts test `empty(…cbc:ID[not(@schemeID)])`,
  so every UBL identifier needs a scheme; the CII variant tests `ram:GlobalID` only, so a CII private `ram:ID`
  (no scheme) passes.
- **Annex B:** F202500001 (EN16931 and EXTENDED-CTC-FR) CII carries `PRIVATE_123` (BT-29) and
  `PRIVATE_ID_DELIVERY` (BT-71); the UBL twins carry neither.
- **Writer:** writes a schemeless BT-29 / BT-71 (the EN 16931 UBL binding allows an identifier without scheme);
  BR-FR reports exactly `BR-FR-CO-10_BT-29-1` and `BR-FR-CO-10_BT-71-1`. It refuses a schemeless EXT-FR-FE-146
  of a line, as `toCii()` does (EXT-FR-FE-148 is `1..1` in CII and BR-FR-CO-10 wants it in UBL).
- **Evidence:** `grep -o 'BR-FR-CO-10_[A-Z0-9-]*' src/lib/xsd/ubl/fr-ctc/BR-FR-Flux2-Schematron-UBL.xslt src/lib/xsd/fr-ctc/BR-FR-Flux2-Schematron-CII.xslt | sort -u`;
  `pnpm build && pnpm vitest run tests/ubl-writer.test.ts -t "BR-FR-CO-10"`.

### CG-64 — BT-84-0 shares the UBL account id with BT-84 (interop)

- **Spec:** the Factur-X matrices split the account into `ram:IBANID` (BT-84) and `ram:ProprietaryID`
  (BT-84-0, "use IBANID when appropriate, otherwise use ProprietaryID"); EN 16931 BT-84 is any account
  identifier and UBL `cac:PayeeFinancialAccount` has one `cbc:ID`. Annex A UBL has no BT-84-0 row.
- **Writer:** writes BT-84, or BT-84-0 when BT-84 is absent, into `cbc:ID` (the one UBL element for an account
  identifier); throws when both are set. The written UBL does not say whether the value was an IBAN or a national
  account number. No annex B twin uses `ProprietaryID`.
- **Evidence:** `grep -c ',BT-84-0,' spec/afnor-xp-z12-012-1.4/text/annex-a--Flux_2_UBL_EXT-CTC-FR.csv` (0);
  `pnpm build && pnpm vitest run tests/ubl-writer.test.ts -t "BT-84-0"`.

### CG-65 — Annex A makes optional identifiers the UBL XSD requires (interop)

- **Spec:** annex A UBL gives BT-13 `0..1` yet binds BT-14 and EXT-FR-FE-197 to `cac:OrderReference/cbc:SalesOrderID`
  and `/cbc:IssueDate`, while `OrderReferenceType/cbc:ID` is `minOccurs="1"` in the XSD. Same for EXT-FR-FE-198 under
  `cac:DespatchDocumentReference` (BT-16), EXT-FR-FE-01 / -199 under `cac:ContractDocumentReference` (BT-12), the
  line EXT-FR-FE-135 / -145 under `cac:OrderLineReference` (`cbc:LineID` = BT-132), EXT-FR-FE-144 / -200 under its
  `cac:OrderReference` (EXT-FR-FE-135), and the line despatch / receipt references (`cbc:LineID` EXT-FR-FE-141 /
  -143, `cac:DocumentReference/cbc:ID` EXT-FR-FE-140). No vendored Schematron gives a placeholder value (no `NA`
  convention).
- **Writer:** throws, naming both terms, when one of them is set without the identifier of the element it sits in.
- **Evidence:**
  `python3 -I -c "import csv,sys; [print(r[1],r[6],r[8]) for r in csv.reader(open('spec/afnor-xp-z12-012-1.4/text/annex-a--Flux_2_UBL_EXT-CTC-FR.csv',encoding='utf-8')) if len(r)>8 and r[1] in sys.argv[1:]]" BT-13 BT-14`;
  `awk '/complexType name="OrderReferenceType"/{f=1} f&&/ref="cbc:ID"/{print NR": "$0; exit}' src/lib/xsd/ubl/common/UBL-CommonAggregateComponents-2.1.xsd`
  (`minOccurs="1"`); `pnpm build && pnpm vitest run tests/ubl-writer.test.ts -t "CG-65"`.

### CG-66 — BT-110 is needed to carry BG-23 in UBL (interop)

- **Spec:** EN 16931 BT-110 is `0..1`; UBL holds the VAT breakdown (BG-23) in `cac:TaxTotal/cac:TaxSubtotal`,
  and `TaxTotalType/cbc:TaxAmount` (BT-110) is `1..1`.
- **Writer:** throws when BT-110 is missing; it does not compute it from BG-23. Every annex B example has it.
- **Evidence:** `pnpm build && pnpm vitest run tests/ubl-writer.test.ts -t "cannot carry"` (case `missing BT-110`).

### CG-67 — Typos and gaps in the annex A UBL rows (docs)

- **Annex A** (`annex-a--Flux_2_UBL_EXT-CTC-FR.csv`, column 9): BT-82 `/@Name` (the UBL attribute is `name`,
  as annex B writes); unprefixed steps `/PartyLegalEntity` (EXT-FR-FE-66-00), `/DeliveryLocation`
  (EXT-FR-FE-186-00), `/TaxCategory` (BT-173 … BT-176), `/Price /AllowanceCharge` (EXT-FR-FE-195 / -196),
  `/OrderLineReference /OrderReference` (EXT-FR-FE-200); `cac:AgentPartyLegalEntity` (EXT-FR-FE-89-00, the element
  is `cac:PartyLegalEntity`); EXT-FR-FE-BG-12 and EXT-FR-FE-164-00 cardinality `0..0` although annex B UC10 … UC13
  use `cac:ManufacturerParty` and its `cac:PartyLegalEntity`; the line status reference (EXT-FR-FE-163-000) has no
  id and no value for its `cbc:ID`, which annex B and `EXTENDED-CTC-FR-UBL` (`$invoiceID`) set to BT-1.
- **CreditNote columns:** BG-1 (`/CreditNote/cbc:Note`) is `0..1` where the Invoice column has `0..n` and the
  UBL XSD and EN 16931 allow several (annex B UC5b, a CreditNote, has 6 notes); the CreditNote contract date
  (`cac:ContractDocumentReference/cbc:IssueDate`) is labelled EXT-FR-FE-01, the id of the contract type, instead of
  EXT-FR-FE-199.
- **CreditNote column (ids in column 49, XPath in column 55; 0-based 48 and 54):** EXT-FR-FE-191 / -191-1 point at
  `cac:Item/cbc:Description` (Invoice: `cbc:PackQuantity` / `@unitCode`); the line `BillingReferenceLine/cbc:ID`
  is labelled EXT-FR-FE-163 (Invoice: EXT-FR-FE-162); the line `TaxTotal/cbc:TaxAmount` and its `@currencyID` are
  labelled BT-110 / BT-110-1 (Invoice: EXT-FR-FE-182 / -182-1); BT-173 … BT-176 are labelled EXT-FR-FE-187 … -190;
  EXT-FR-FE-161 has `cac:AdditionalItemPropertycbc:ValueQuantity` (no separator).
- **Writer:** follows the XSD element names, the Schematrons and annex B; it writes every BG-1 in both roots.
- **Evidence:**
  `python3 -I -c "import csv,sys; [print(r[1],r[6],r[8]) for r in csv.reader(open('spec/afnor-xp-z12-012-1.4/text/annex-a--Flux_2_UBL_EXT-CTC-FR.csv',encoding='utf-8')) if len(r)>8 and r[1] in sys.argv[1:]]" BT-82 EXT-FR-FE-89-00 EXT-FR-FE-BG-12 EXT-FR-FE-164-00 EXT-FR-FE-163-000`;
  `python3 -I -c "import csv,sys; R=list(csv.reader(open('spec/afnor-xp-z12-012-1.4/text/annex-a--Flux_2_UBL_EXT-CTC-FR.csv',encoding='utf-8'))); h=[i for i,x in enumerate(R[1]) if x=='ID'][1]; [print(r[h],r[h+5],r[h+7]) for r in R[2:] if len(r)>h+7 and r[h+7].endswith(tuple(sys.argv[1:]))]" '/CreditNote  /cbc:Note' 'ContractDocumentReference  /cbc:IssueDate'`;
  `grep -c '<cbc:Note>#' "spec/afnor-xp-z12-012-1.4/distribution/XP_Z12-012_Annexe_B_EXEMPLES_V1.4/Factures/Facture et Avoir/UC5b_F202500011_00-CN_20250703_EN16931_UBL_Commentee.xml"` (6);
  `python3 -I -c "import csv,sys; [print(r[1],'| CN id:',r[48],'| CN XPath:',r[54]) for r in csv.reader(open('spec/afnor-xp-z12-012-1.4/text/annex-a--Flux_2_UBL_EXT-CTC-FR.csv',encoding='utf-8')) if len(r)>54 and r[1] in sys.argv[1:]]" EXT-FR-FE-191 EXT-FR-FE-191-1 EXT-FR-FE-162 EXT-FR-FE-182 EXT-FR-FE-182-1 BT-173 BT-174 BT-175 BT-176 EXT-FR-FE-161`.

### CG-68 — EXT-FR-FE-180 sits in the UBL line period, which BR-CO-20 constrains (interop)

- **Spec:** annex A UBL binds EXT-FR-FE-180 (line VAT point date code) to `cac:InvoiceLine/cac:InvoicePeriod/cbc:DescriptionCode`
  (CreditNote alike). BR-CO-20, in `EN16931-UBL-validation` and `EXTENDED-CTC-FR-UBL` (l.2131), asserts
  `exists(cbc:StartDate) or exists(cbc:EndDate)` on every line `cac:InvoicePeriod`. A line with EXT-FR-FE-180 and
  no line period (BT-134 / BT-135) therefore has no valid UBL form. CII holds the code in the line
  `ApplicableTradeTax/DueDateTypeCode`, unaffected.
- **Writer:** `invoiceToUbl()` refuses EXT-FR-FE-180 without BT-134 or BT-135.
- **Evidence:**
  `python3 -I -c "import csv,sys; [print(r[1],r[6],r[8]) for r in csv.reader(open('spec/afnor-xp-z12-012-1.4/text/annex-a--Flux_2_UBL_EXT-CTC-FR.csv',encoding='utf-8')) if len(r)>8 and r[1] in sys.argv[1:]]" EXT-FR-FE-180`;
  `grep -n -B12 '\[BR-CO-20\]' src/lib/xsd/ubl/extended-ctc-fr/EXTENDED-CTC-FR-UBL.xslt | grep 'test='`;
  `pnpm build && pnpm vitest run tests/ubl-writer.test.ts -t "CG-68"`.

### CG-69 — Line price, quantity and VAT: `1..1` in annex A, conditional in the Schematrons; `toCii()` gap (open)

- **Spec:** annex A UBL gives BG-29 / BT-146 `1..1` (and BT-129, BG-30, CG-54). The rule texts of
  `EXTENDED-CTC-FR-UBL` require them only "if the Subtype of invoice line item (EXT-FR-FE-163) has the value DETAIL
  or is not specified": BR-FREXT-26 (message `[BR-26]`, l.1886, BT-146), BR-FREXT-22 (l.1845, BT-129),
  BR-FREXT-CO-04 (l.1905, BT-151) and UBL-FREXT-SR-48 (l.15595, exactly one `cac:ClassifiedTaxCategory`), all
  fatal. The CII EXTENDED-CTC-FR Schematron applies the rule text as written: context
  `AssociatedDocumentLineDocument[not(ram:LineStatusReasonCode) or ram:LineStatusReasonCode = 'DETAIL']`
  (`src/lib/xsd/facturx/extended-ctc-fr/EXTENDED-CTC-FR-CII.xslt` l.1340) with BR-FREXT-BR-26 (BT-146), the
  `BilledQuantity` assert (l.1376) and the line VAT category assert.
- **UBL XPath vs rule text (upstream):** the UBL asserts test a `$lineInCalul` variable defined twice, differently.
  At l.1837 (BR-FREXT-22, -26, -CO-04) it is `not(cac:BillingReference/cac:InvoiceDocumentReference/cbc:ID = $invoiceID)`
  or that reference's status is `DETAIL`; at l.15587 (UBL-FREXT-SR-48) it is
  `not(cac:BillingReference/cac:InvoiceDocumentReference/cbc:ID)` (any billing reference) or status `DETAIL`. Both
  treat a line whose status reference (`cbc:ID` = BT-1) has a parent line but no `cbc:DocumentStatusCode` as out of
  the calculation, so the UBL Schematron accepts such a line without price, quantity or VAT category, while the rule
  text and the CII context require them; the l.15587 variant also exempts from UBL-FREXT-SR-48 a line that carries only a
  preceding invoice reference (EXT-FR-FE-BG-06), with no status reference.
- **Writer:** at `extended-ctc-fr`, `invoiceToUbl()` refuses a line whose EXT-FR-FE-163 is `DETAIL` or unset
  without BG-29, BT-129 or BG-30, deliberately following the rule text and the CII context, stricter than the UBL
  Schematron's XPath (below that level the shared checks require them always).
- **Open (fixed outside this PR):** `toCii()` at `extended-ctc-fr` accepts such a line (its line checks waive
  BG-29 / BT-129 / BG-30 at both extended levels) and writes CII that its own Schematron refuses with
  BR-FREXT-BR-26.
- **Evidence:** `grep -n -B10 'name="id">BR-FREXT-26' src/lib/xsd/ubl/extended-ctc-fr/EXTENDED-CTC-FR-UBL.xslt | grep 'test='`;
  `grep -n 'BR-FREXT-22\|BR-FREXT-CO-04\|UBL-FREXT-SR-48' src/lib/xsd/ubl/extended-ctc-fr/EXTENDED-CTC-FR-UBL.xslt`;
  `grep -n -A1 'name="lineInCalul"' src/lib/xsd/ubl/extended-ctc-fr/EXTENDED-CTC-FR-UBL.xslt`;
  `grep -n 'name="id">BR-FREXT-BR-26' src/lib/xsd/facturx/extended-ctc-fr/EXTENDED-CTC-FR-CII.xslt`;
  `pnpm build && pnpm vitest run tests/ubl-writer.test.ts -t "CG-69"` (includes the `toCii()` reproduction).

### CG-70 — Line note subject codes in EN 16931 UBL: annex A contradicts itself (interop, provisional)

- **Spec:** annex A `annex-a--Flux_2_UBL_EN16931_FR.csv` binds BT-127 to `cac:InvoiceLine/cbc:Note` (`0..1`) as
  plain text and has no EXT-FR-FE-183 row; but its BT-21 row (document note subject code) says in its usage note
  "Uniquement en UBL : entre ## en début de Note de ligne". Only `annex-a--Flux_2_UBL_EXT-CTC-FR.csv` has
  EXT-FR-FE-183. Annex B `F202500001_INV_20250201_EN16931_UBL_Commentee.xml` (EN 16931 id) writes the line note
  `#BLU#DONT 0,50 EUR de DEEE`, commented as BT-127 "DONT 0,50 EUR de DEEE"; its CII twin has the text without a
  subject code. The document passes all three validation steps.
- **Chosen reading (provisional, controller ruling):** at `en16931` there is no line note subject code, so
  `ublToInvoice()` keeps a line note verbatim as BT-127 (no `#code#` split): every character stays in a term the
  level carries. `invoiceToUbl()` at `en16931` does not apply the `#…#` refusal to line notes and writes the text
  back unchanged. Document notes (BT-21 / BT-22) and `extended-ctc-fr` keep the `#code#` convention.
- **Effect:** F202500001 EN16931 round-trips at its own level. Its model differs from the CII twin's in that note
  text (`#BLU#` prefix), declared in the twin comparison test. An `en16931` reader never yields EXT-FR-FE-183.
- **Close when:** annex A states whether the `##` convention applies to line notes at EN 16931.
- **Evidence:** `grep -n '#BLU#' 'spec/afnor-xp-z12-012-1.4/distribution/XP_Z12-012_Annexe_B_EXEMPLES_V1.4/Factures/F202500001/_EN16931/F202500001_INV_20250201_EN16931_UBL_Commentee.xml'`;
  `grep -n -B1 -A1 'DONT 0,50' 'spec/afnor-xp-z12-012-1.4/distribution/XP_Z12-012_Annexe_B_EXEMPLES_V1.4/Factures/F202500001/_EN16931/F202500001_INV_20250201_CII_EN16931_FX_CII_Commentee.xml'`;
  `python3 -I -c "import csv,sys; [print(f.split('--')[-1],r[1],r[6],r[8],'|',r[14]) for f in sys.argv[1:] for r in csv.reader(open(f,encoding='utf-8')) if len(r)>14 and r[1] in ('BT-21','BT-127','EXT-FR-FE-183')]" spec/afnor-xp-z12-012-1.4/text/annex-a--Flux_2_UBL_EN16931_FR.csv spec/afnor-xp-z12-012-1.4/text/annex-a--Flux_2_UBL_EXT-CTC-FR.csv`;
  `pnpm build && pnpm vitest run tests/ubl-reader.test.ts -t "F202500001 \(en16931\)|en16931 line note"`.

### CG-71 — Annex B F202500001 UBL and CII twins differ in two item details (docs)

- **Spec:** XP Z12-012 annex B gives each invoice in CII and UBL. For F202500001 (both levels) the UBL twins write
  `listVersionID="ATTR2"` on the item classification (BT-158-2) of line 2, which the CII twins do not have, and give
  line 3 one item attribute where the CII twins give two (BT-160 `CO2(g)` / BT-161 `30` is missing in UBL).
- **Effect:** none on the code. The test comparing the model read from each UBL example with the one read from its
  CII twin declares these two differences, next to the registered ones (CG-45, CG-59 to CG-63, CG-70).
- **Close when:** annex B aligns the twins.
- **Evidence:** `grep -c 'AdditionalItemProperty>' 'spec/afnor-xp-z12-012-1.4/distribution/XP_Z12-012_Annexe_B_EXEMPLES_V1.4/Factures/F202500001/_EN16931/F202500001_INV_20250201_EN16931_UBL_Commentee.xml'` (4: two attributes);
  `grep -c '<ram:ApplicableProductCharacteristic>' 'spec/afnor-xp-z12-012-1.4/distribution/XP_Z12-012_Annexe_B_EXEMPLES_V1.4/Factures/F202500001/_EN16931/F202500001_INV_20250201_CII_EN16931_FX_CII_Commentee.xml'` (3);
  `grep -rn 'ATTR2' 'spec/afnor-xp-z12-012-1.4/distribution/XP_Z12-012_Annexe_B_EXEMPLES_V1.4/Factures/F202500001'`;
  `pnpm build && pnpm vitest run tests/ubl-reader.test.ts -t "CII twin"`.

### CG-72 — BT-90 has a seller row and a payee row in annex A UBL (interop)

- **Spec:** both annex A UBL CSVs map BT-90 to `cac:AccountingSupplierParty/cac:Party/cac:PartyIdentification/cbc:ID`
  and to `cac:PayeeParty/cac:PartyIdentification/cbc:ID` (`@schemeID="SEPA"`); UBL-SR-29 allows one `SEPA`
  identifier in the whole document. The model has one BT-90 (`directDebit.bankAssignedCreditorIdentifier`).
- **Reader:** takes BT-90 from the payee's identifiers, else from the seller's, also when a payee is present
  without one (only with a `cac:PaymentMeans` to hold BG-19).
- **Writer:** writes BT-90 with the payee when there is one, else with the seller.
- **Effect:** for a source with a payee and BT-90 on the seller, the value is kept but its place is not:
  `dropped` reports the seller's `cac:PartyIdentification/cbc:ID` and its `@schemeID`. A second read of the
  written document drops nothing. This non-empty `dropped` for a kept BT-90 is a deliberate over-report (the writer
  places BT-90 with the payee), preferred to the risk of a silent loss.
- **Evidence:** `python3 -I -c "import csv,sys; [print(f.split('--')[-1],r[1],r[8]) for f in sys.argv[1:] for r in csv.reader(open(f,encoding='utf-8')) if len(r)>8 and r[1]=='BT-90']" spec/afnor-xp-z12-012-1.4/text/annex-a--Flux_2_UBL_EN16931_FR.csv spec/afnor-xp-z12-012-1.4/text/annex-a--Flux_2_UBL_EXT-CTC-FR.csv`;
  `grep -o '\[UBL-SR-29\][^<]*' src/lib/xsd/ubl/en16931/EN16931-UBL-validation.xslt | head -1`;
  `pnpm build && pnpm vitest run tests/ubl-reader.test.ts -t "BT-90 from the seller"`.

### CG-73 — Internal DTD entities hide CII content from `xmlToInvoice()` / `fromCii()` (security, data integrity, open)

- **Issue:** XML parsing uses the default libxml2 options on purpose (no `XML_PARSE_NOENT`, AGENTS.md), so an
  internal entity is kept as an unexpanded reference. A document whose DOCTYPE declares an entity standing for an
  element (`<!ENTITY br "<ram:BuyerReference …>…</ram:BuyerReference>">` used as `&br;`) is read without it:
  `xmlToInvoice()` finds no `ram:BuyerReference`, and `fromCii()` compares models, so its `dropped` is empty. The
  value is lost silently. Neither CII nor UBL uses a DOCTYPE.
- **UBL:** `ublToInvoice()` refuses any document with a DOCTYPE (string, Buffer or caller `XmlDocument`, never
  disposed) before reading; tests cover an internal entity, an external `SYSTEM` entity and a billion-laughs
  document.
- **Open (fixed outside this PR):** the CII parser / `fromCii()`; the test pins today's behaviour.
- **Evidence:** `pnpm build && pnpm vitest run tests/ubl-reader.test.ts -t "DOCTYPE"`.

### CG-74 — `invoiceToXml()` returns a document whose children carry no namespace in memory (interop, open)

- **Issue:** `src/lib/converters/facturx.ts` builds every child with `addElement('rsm:X')` / `addElement('ram:X')`.
  libxml2-wasm then creates an element whose name is `ram:X` and whose namespace is empty (the second argument of
  `addElement` is the prefix). `toString()` writes the right text, and every caller in the package serialises
  first, so the written XML is correct; but namespace-bound XPath, or any namespace-aware walk, on the returned
  `XmlDocument` finds nothing.
- **UBL:** `invoiceToUbl()` had the same trait (elements named `cbc:X` in the root's namespace). It now serialises
  and re-parses (default options) before returning; a test runs namespace-bound XPath on its result.
- **Open (fixed outside this PR):** `invoiceToXml()`; the test pins today's behaviour.
- **Evidence:** `pnpm build && pnpm vitest run tests/converter.test.ts -t "CG-74"`;
  `pnpm build && pnpm vitest run tests/ubl-writer.test.ts -t "real namespaces"`.
