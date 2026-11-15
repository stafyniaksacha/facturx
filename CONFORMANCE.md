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
| 1.09.2.fixFR04 behaviour: EXTENDED accepts a line VAT block without `TypeCode`/`CategoryCode` (XSD `minOccurs="0"`, release notes p.5) and the model round-trips it, EN 16931 still rejects it; detail lines, BG-23 and document allowances/charges still need both codes (`BR-FXEXT-CO-04`, `BR-47`, structural `count(ram:TypeCode)=1`); `BR-FXEXT-S-01` still accepts several S breakdowns and now catches S lines without one (1.09 FINAL's `BR-S-01` did not); two Z breakdowns no longer fire `BR-Z-01` but still fail `BR-FXEXT-Z-08b`; `BR-FXEXT-06` no longer fires on an untyped parent line; `BR-FXEXT-BR-54-1/-2` replace `BR-54`; `BR-CO-27` is `CII-SR-470` in BASIC WL / EN 16931 and gone from EXTENDED | `pnpm build && pnpm vitest run tests/fixfr04.test.ts` |
| External XML entities are not expanded with the default libxml2-wasm parse options used by `resolveXml` / `xmlToInvoice` (no XXE) | probe in the audit (entity resolves to empty / `check()` rejects the document); keep `XML_PARSE_NOENT` / `XML_PARSE_DTDLOAD` / `XML_PARSE_XINCLUDE` off |
| The XMP packet header uses the fixed packet id `W5M0MpCehiHzreSzNTczkc9d` of the reference packet `distribution/2. FACTUR-X_extension_schema_exemple.xmp.txt` (was CG-06), and `generate()` keeps a source PDF's permanent trailer `/ID` (ISO 32000-1 §14.4) instead of throwing (#37), while rejecting encrypted (§6.1 p.25) and signed sources and sources that already embed a document of the kind being written (§6 p.24 for invoices; one order per PDF for Order-X is by analogy, no Order-X spec is vendored). That document is detected by content, whatever its file name: any stream of a file (`/EF` `/F`, `/UF` or a deprecated key) in the EmbeddedFiles name tree or catalog `/AF` whose root element (namespace and name) is a CII invoice, or an Order-X order when an order is written, including UTF-8 and UTF-16 with a BOM and invoices hidden behind tricky prolog comments. A file whose name tree key, `/F` or `/UF` is a recognized invoice name (`factur-x.xml`, `xrechnung.xml`, ZUGFeRD names; `order-x.xml` for orders) is rejected too, whatever its content can be read as, and so is one already using the filename being written. Other XML is accepted as a supporting file (§6.4 p.30–32), including an Order-X order attached to an invoice. Reading untrusted input is bounded: each distinct stream is read once, inflated with node:zlib in growing slices (at most 64 KiB of compressed input and 2 MiB of output per attempt), 64 KiB of text is examined, and per PDF at most 256 distinct streams and 128 MiB of inflation are allowed (a failed attempt is charged as much as it could have produced); past either limit the PDF is rejected. Known misses are listed in CG-14 | `pnpm build && pnpm vitest run tests/generate.test.ts` |
| Schematron findings are classified by the rule's own SVRL `flag`: `warning`/`information` are reported in `warnings` and don't affect validity unless `warningsAsErrors` is set; unflagged and `fatal` ones are errors. Fired `<report>`s count like failed `<assert>`s (the Factur-X Schematrons express profile restrictions such as "@schemeID not used in the given context" as reports; before this they were silently dropped). In the vendored Factur-X XSLTs the warning-flagged rules are: MINIMUM `BR-FXEXT-{G,IC,O,Z}-08ini/-08rev`; BASIC `PEPPOL-EN16931-R008`, `BR-FX-EN-04`, `BR-FXEXT-Z-08rev`; BASIC WL none; EN 16931 `PEPPOL-EN16931-R008`, `CII-SR-474/475/476`; EXTENDED `PEPPOL-EN16931-R008`, `BR-FXEXT-04`, `CII-SR-475/476` and the `-08ini/-08rev` pairs, each backed by a blocking `-08b` rule (spelled `BR-FXEXT-S08b` for S upstream) | `pnpm build && pnpm vitest run tests/schematron.test.ts tests/fixfr04.test.ts` (severity inventory) |
| README and docs no longer claim `extract()` detects the level: it returns the flavor (from the attachment filename) and echoes `options.level`; the quick start reads the level from `check()` on the extracted XML (was CG-11) | `pnpm build && pnpm --filter @stafyniaksacha/facturx-examples run examples` (quickstart prints `facturx en16931`, not `facturx undefined`) |
| French CTC rules `BR-FR-Flux2` (FNFE-MPE Schematrons FR CTC v1.4.0.04, step 3 of the release notes p.9): the vendored `src/lib/xsd/fr-ctc/BR-FR-Flux2-Schematron-CII.xslt` is byte-identical to all five copies in the release, standard (all 171 asserts `fatal`) variant only, and its shipped SEF is reproducible and embeds no local path. `validateFrCtc` / `check({ frCtc: true })` check the document itself (the rules read neither root nor profile) and accept only a CII invoice declaring BASIC WL, EN16931 or EXTENDED (p.9, p.11; plain-CII `EXTENDED-CTC-FR` as `extended`); they throw for MINIMUM, BASIC, Order-X, UBL and a `level` that contradicts the document. All 24 Factur-X examples of XP Z12-012 v1.4 Annex B (EN16931 and EXTENDED, incl. multi-vendor, bidirectional, sub-line) pass XSD + the Factur-X profile Schematron (1.09.2.fixFR04, CG-16) + BR-FR with no finding, and the 6 plain-CII `EXTENDED-CTC-FR` examples pass BR-FR at level `extended`. Over the 34 in-scope official Factur-X 1.09 examples, 28 pass and 6 (`_Factur-X_1.08-Exemples_CS/*/Facture_F2026003{0,1}-*`) fail `BR-FR-32` (SIREN `303 656 847` written with spaces) and `BR-FR-CO-10` (seller GlobalID scheme `0088` twice), both genuine in the example data. `id` is the rule (`BR-FR-05`), taken from the SVRL `@id`, never from the message | `pnpm spec:verify`; `pnpm build && pnpm vitest run tests/fr-ctc.test.ts` |
| Every value `generate()` writes into the XMP packet (title, subject, author from the invoice or `meta`, producer, creator, filename, conformance level) is XML-escaped and stripped of characters XML 1.0 cannot carry, so a seller name with `&`, `<` or markup parses back as the same text and cannot inject properties such as a second `fx:ConformanceLevel` (BR-HYBRID-02, BR-HYBRID-03; was CG-03). The veraPDF run in the UTF-8 row below covers `&` and `<` too | `pnpm build && pnpm vitest run tests/generate.test.ts -t CG-03` |
| The XMP packet is written as UTF-8 bytes (`begin=""`), with `/Length` its byte length: a seller name with `é`, `€` and a non-BMP character decodes strictly as UTF-8 and parses back unchanged (BR-HYBRID-02 via PDF/A metadata clauses 6.6.2.1 / 6.6.4, BR-HYBRID-03; was CG-02). `begin` is kept empty, the UTF-8 form of the XMP spec (ISO 16684-1, not vendored), where the reference packet writes a U+FEFF BOM; veraPDF accepts it. **External validator:** veraPDF 1.30.4 (`verapdf/cli@sha256:f085855d442ad415e79fabbabcdd1803c2db4ee097cd5b94506c95ecdcfa1728`, `--flavour 3b`), on the input that failed before the fix (at `2741b28`: `6.6.2.1 t4` ×5, `6.6.2.1 t5` ×5, `6.6.4 t1`, XMP not well-formed): the official EN 16931 example `Facture_F20260023-…_EN_16931.pdf` stripped of its embedded files, `/AF` and `/PageMode` and of unreferenced objects as base, its XML with seller name `Société Dupont & Fils <SARL> €`. After CG-02 and CG-03 (2026-11-15, `89ee517`), base and output both PASS 3b, and the XMP reads `Société Dupont &amp; Fils &lt;SARL&gt; €`. Manual run, not a CI test | `pnpm build && pnpm vitest run tests/generate.test.ts -t CG-02`; veraPDF run as described |
| `invoiceToXml()` writes *Unit Price Amount*s (item net/gross price BT-146/BT-148, price discount/charge BT-147/BT-X-302, their base amounts BT-X-35/BT-X-301) unrounded, in the shortest `xs:decimal` form with no exponent (`0.3456`, `1000.3454`, `0.0000001`), and every other *Amount* with 2 decimals (§7.1.5 p.35; was CG-01). The 2 annex B examples with sub-cent unit prices (UC11, UC13) now round-trip with an identical model. Unit prices are stored as `number` (public model type), so precision beyond an IEEE-754 double (about 15 significant digits) is not kept | `pnpm build && pnpm vitest run tests/unit-price.test.ts tests/annex-b-examples.test.ts` |
| `generate()` refuses the `zugferd` flavor, given or auto-detected, and any ZUGFeRD 1.0 `CrossIndustryDocument` root even under an explicit `flavor: 'facturx'`, before reading or marking the PDF: it wrote `zugferd-invoice.xml` with the Factur-X `fx:` XMP and an empty conformance level, which matches neither §6.3.1 nor the deprecated ZUGFeRD 2.0 settings of §6.3.2 p.29 (`zugferd-invoice.xml` + `zf:` schema), and the filename is not a HybridDocumentFilename (BR-HYBRID-08/13, Fatal; see CG-27). ZUGFeRD 2.x invoices are generated as `facturx` (was CG-09) | `pnpm build && pnpm vitest run tests/generate.test.ts -t CG-09` |
| README, `docs/` and the CLI help no longer claim `generate()` produces PDF/A-3: they say it attaches the XML and writes the XMP, and that the caller supplies a PDF/A-3 base (was the docs part of CG-05) | `grep -rniE 'compliant PDF/A\|PDF-A/3\|→ PDF/A-3' README.md docs src/commands --include='*.md' --include='*.ts' \| grep -v docs/api/models` (no match) |
| `generate({ afRelationship })` writes `Data` (default), `Alternative` or `Source` as the embedded XML's `/AFRelationship`, checked against §6.2.2 table p.27 (BR-HYBRID-11): MINIMUM and BASIC WL accept `Data` only (p.26: `Data` "must be used" when the visual holds more data than the XML), BASIC / EN 16931 / EXTENDED all three; `Supplement`, `Unspecified` and any other value are rejected; Order-X is not restricted (no table vendored); the German column is documented, not enforced. The level is matched by the same key as `fx:ConformanceLevel` (CG-30) (was CG-07) | `pnpm build && pnpm vitest run tests/af-relationship.test.ts` |
| `extract()` finds an invoice embedded as `xrechnung.xml` (§6.2 p.25, `text/codelists--Filename.csv`) and returns it with flavor `facturx`, which `getFlavor()` gives its `CrossIndustryInvoice` root. The fixture is a Factur-X EN 16931 invoice renamed to `xrechnung.xml` (the evidence recipe of CG-12), not a real XRECHNUNG hybrid (none is vendored): `extract({ check: true })` validates it only because its guideline ID is a Factur-X one, and fails on a real XRECHNUNG ID (CG-12) | `pnpm build && pnpm vitest run tests/extract.test.ts` |
| `extract()` reads an EmbeddedFiles name tree with one or two `/Kids` levels (§6.2.2 p.27, §6.4 p.31), in tree order, ignoring `/Limits`. The tree is untrusted: past two `/Kids` levels or 4096 nodes it throws `Unsupported EmbeddedFiles name tree`, and a cycle, a shared kid, a node with both `/Kids` and `/Names` or a non-dictionary kid throw `Malformed EmbeddedFiles name tree` (ISO 32000-1 §7.9.6 Table 36). Decoding the entries is not bounded (CG-29) (reader side of CG-13) | `pnpm build && pnpm vitest run tests/name-tree.test.ts` |
| Without `meta`, the Info `CreationDate`/`ModDate`, the embedded file's `Params` `CreationDate`/`ModDate` (§6.2 p.25) and the XMP `CreateDate`/`ModifyDate`/`MetadataDate` are the generation time, written in UTC, and identical under `TZ=UTC`, `Europe/Paris` and `Pacific/Kiritimati`; the title and subject keep BT-2 as a calendar date. A `meta.date` the caller passes is used unchanged. No vendored rule defines these dates; the choice follows the reference packet's generation timestamp and is an inference (was CG-25) | `pnpm build && pnpm vitest run tests/pdf-metadata.test.ts -t CG-25` |
| Info `Producer` equals XMP `pdf:Producer` (the library name and version, instead of pdf-lib's default) and XMP `pdf:Keywords` equals Info `Keywords`, escaped and UTF-8. Characters XML 1.0 cannot carry are dropped from `meta` once, before both are written, so control characters cannot make them differ. This is consistency between the two metadata stores (`AGENTS.md`), not a proven PDF/A requirement: the Factur-X spec says nothing (§6.3 p.28–29), ISO 19005-3 is not vendored, and veraPDF 1.30.4's PDF/A-3B profile has no Info↔XMP equivalence check (the mismatch passed it on 2026-11-15, `2741b28`) (was CG-04) | `pnpm build && pnpm vitest run tests/pdf-metadata.test.ts -t CG-04` |
| `generate({ preserveXmlBytes: true })` embeds the caller's XML bytes unchanged (a `Buffer` as is, a `string` as UTF-8) and `extract()` returns the attachment's decoded stream in `bytes` (CLI `generate --preserveXmlBytes`, `extract --raw`). Over all 56 official examples, `bytes` equals the `factur-x.xml` stream read from the PDF and inflated with node:zlib (not pdf-lib's decoder), and pass-through `generate()` of those bytes onto the example stripped of its attachments embeds them byte for byte (BOM, `'` declaration, CRLF), where the default still re-serializes. The bytes are still parsed with the default libxml2 options (no `XML_PARSE_NOENT`/`DTDLOAD`/`XINCLUDE`/`HUGE`) and checked from those same bytes with `check: true`; pass-through refuses an `XmlDocument`, any DOCTYPE (internal subset, `SYSTEM`, `PUBLIC` or none, string or `Buffer`), and an XML declaration naming a version other than 1.0 or an encoding other than UTF-8, wherever the attribute sits in the declaration (consistency rules: the bytes are parsed as UTF-8 XML 1.0; the vendored Factur-X text names neither), before the PDF is read or marked as used. No vendored rule requires byte identity: §4 p.21 asks archiving transformations to "respect the integrity of content" (was CG-26, interop). The default `xml` field and default embedding are unchanged (backward compatibility); the default path still embeds a DOCTYPE or an XML 1.1 declaration (CG-31) | `pnpm build && pnpm vitest run tests/xml-bytes.test.ts` |
| `generate()` also looks for an existing invoice (or order, for Order-X) in page-level associated files (a page's `/AF`, §6.2.1 p.25: the file specification "can be found in either the Document dictionary or the Page dictionary"), in annotation `/AF` (PDF 2.0 / PDF/A-3, not vendored: an inference) and in the `/FS` of `/FileAttachment` annotations (ISO 32000-1 §12.5.6.15, not vendored; direct or indirect annotation dictionaries), on every page including under intermediate `/Pages` nodes, with the same content and name rules as the name tree and catalog `/AF` (§6 p.24). The page tree is untrusted: it is walked iteratively without pdf-lib's traversal; each page tree node, annotation, `/AF` and `/Annots` array, file specification and file name string is read once however often it is referenced (a 1000-entry `/AF` shared by an annotation listed 65536 times took ~27 s when re-read; 4000 specifications sharing a 50000-character `/F` took ~8 s; both now run in well under 3–5 s), and a name longer than 1024 bytes is decoded from its first 1024 bytes only (a 300000-character name overflowed pdf-lib's decoder; this also applies to `extract()`); a node reached twice through `/Kids` (a cycle, or a node listed twice, as pdf-lib's `addPage()` of an existing page writes) is rejected as `Malformed page tree`, since pdf-lib's recursive page count in `save()` overflows on a cycle and is exponential on shared nodes (single `/Parent`: ISO 32000-1, not vendored); more than 65536 distinct page tree nodes or annotations, more than 1048576 `/Kids`, `/Annots` and `/AF` entries, or a page tree deeper than 256 levels (pdf-lib overflowed at ~20000) reject the PDF (`could not check it for an existing invoice`; 65536 distinct annotations are accepted). Their files count toward the existing 256-stream limit. A non-invoice attachment there and a file attachment pointing to an external file are still accepted (narrows CG-14) | `pnpm build && pnpm vitest run tests/page-attachments.test.ts` |
| Plain-CII `EXTENDED-CTC-FR` invoices (XP Z12-012 v1.4, guideline ID `…urn.cpro.gouv.fr:1p0:extended-ctc-fr`) are detected as level `extended-ctc-fr` (flavor `facturx`) on that exact Annex A ID only (a BT-24 merely ending in `:extended-ctc-fr` is `Unknown level`, since nothing downstream checks BT-24 for this profile) and validated by the sequence of the FNFE-MPE release notes p.9: the "uncoupled" UN/CEFACT CII D22B XSD, which "SHALL BE USED" for CII (step 1), the dedicated `EXTENDED-CTC-FR-CII` Schematron (step 2; vendored with the documented `sum()` patch, 91 calls, applied for uniformity: same verdicts as unpatched on amounts with at most 2 decimals; 327 `fatal` and 446 `warning` asserts; see CG-33 and CG-40 for rules that never run), and BR-FR (step 3). All 6 `*_EXTENDED-CTC-FR_CII_*.xml` examples of Annex B pass all three with no error and no warning; a broken BT-112 fails `BR-FREXT-CO-15` and `BR-CO-16`; an unknown element fails the XSD. `generate()` refuses a document declaring the profile before reading the PDF, even with an explicit `level` or `flavor` (it also refuses any flavor that contradicts the root element), and `extract({ check: true })` refuses a `factur-x.xml` declaring it: it is not a HybridConformance value (BR-HYBRID-07/15). `validateFrCtc` accepts `extended-ctc-fr` and, as before, `extended` for such a document. The dedicated Schematron does not constrain the BT-24 value, so `validateSchematron({ level: 'extended-ctc-fr' })` checks it first (throws unless exact) and reports a repeated BT-24 container or ID as `CII-SR-009` / `CII-SR-010` instead of letting the transform abort with an XPTY0004 that quotes document values; it reads the input once and copies a `Buffer`, so the precheck and the transform see the same bytes. Using it resolves the practical side of CG-24 (release notes p.9 say Factur-X EXTENDED can validate the profile; its Schematron rejects the guideline ID, `FX-SCH-A-000636`): with `level: 'extended'` that rejection is unchanged and pinned by a test. CG-24 is closed by its own condition; the upstream contradiction (p.9 calls Factur-X EXTENDED both "broader" than EXTENDED-CTC-FR and its "subset") is still unreported (was CG-24; narrows CG-18) | `pnpm spec:verify`; `pnpm build && pnpm vitest run tests/extended-ctc-fr.test.ts` |

Not verified anywhere yet: PDF/A-3 validity of `generate()` output (no test or CI run; manual veraPDF
runs are recorded in the XMP UTF-8 and Info/XMP consistency rows above and in CG-05), any Order-X
asset (no Order-X spec vendored), field-by-field coverage of the 1.09 EXTENDED additions (BT-173…177,
BT-193, BT-215, BT-216, BT-X-591; §version history p.7) against the models.

## Open gaps

| ID | Area | Rule / citation | Severity | Summary |
| --- | --- | --- | --- | --- |
| CG-05 | PDF/A | BR-HYBRID-02 | Fatal | `generate()` does not make the PDF PDF/A-3 (the caller supplies a PDF/A-3 base); preserving a PDF/A-3b base is not tested |
| CG-08 | Order-X | BR-HYBRID-06/07 | Fatal | Order-X PDFs get Factur-X `INVOICE` XMP and empty conformance level |
| CG-10 | spec | BR-HYBRID-04 vs §6.3.1 p.28 | — | Spec is internally inconsistent on the XMP namespace URI |
| CG-12 | profiles | §7.7, §6.2 p.25, `codelists--HybridConformance.csv`, `codelists--Filename.csv`, BR-HYBRID-12/13 | interop | XRECHNUNG level not detected and never generated; no DE profile restrictions |
| CG-13 | embedding | §6.2.2 p.27, §6.4 p.31 | interop | `generate()` rejects a source whose EmbeddedFiles name tree has `/Kids` levels |
| CG-14 | embedding | §6 p.24 | interop | `generate()` can miss an existing invoice whose content it cannot read and whose name it does not recognize |
| CG-15 | spec, licence | FNFE CTC FR 1.4.0 release notes p.6, p.8 | — | The FNFE CTC FR 1.4.0.04 release contradicts itself on its licence and its applicability dates |
| CG-16 | spec, provenance | FNFE CTC FR 1.4.0 release notes p.4–6, p.9, p.11 | — | BASIC WL / EN 16931 / EXTENDED validate against Factur-X 1.09.2.fixFR04 taken from the FNFE CTC FR release, not from an official Factur-X 1.09.2 distribution; MINIMUM / BASIC stay on 1.09 FINAL |
| CG-17 | spec | 1.09 FINAL `_XSLT_*` vs `.sch` | — | The 1.09 FINAL compiled XSLTs (still used for MINIMUM and BASIC) enforce rules absent from their own `.sch` |
| CG-18 | French CTC, profiles | Annex A `annex-a--CII_D22B_FX_EXT-CTC-FR.csv` | data-loss | `EXTENDED-CTC-FR` CII invoices are detected and validated, but the models, converter and parser don't know the `EXT-FR-FE-*` fields |
| CG-19 | French CTC, syntax | release notes p.9-10 (`BR-FR-Flux2-Schematron-UBL`) | interop | UBL 2.1 invoices are not supported |
| CG-20 | French CTC, lifecycle | release notes p.10 (`BR-FR-CDV-*`); Annex A `annex-a--CDV_FE_-_CDAR.csv` | interop | CDAR lifecycle status messages are not validated |
| CG-21 | French CTC, e-reporting | Annex A `annex-a--E-REPORTING_-_Flux_10.csv` | interop | Flux 10 e-reporting is not supported (no licence in the release) |
| CG-22 | French CTC, coverage | release notes p.8-10; Annex A `annex-a--BR-France_CTC.csv`, `annex-a--BR-France-CTC-CPRO.csv` | interop | Annex A BR-FR rules the published Schematron does not implement (incl. `BR-FR-CPRO-*`); release notes contradict each other and the XSLT on coverage |
| CG-23 | French CTC, upstream | `BR-FR-Flux2-Schematron-CII.xslt` | — | SVRL `test` of 4 BR-FR asserts loses its regex quantifier (`^\d{9}$` reported as `^\d9$`) |
| CG-27 | spec, ZUGFeRD | §6.3.2 p.29 vs BR-HYBRID-08/13, `codelists--Filename.csv` | — | Spec says ZUGFeRD 2.0 legacy XMP settings are still supported, but its filename `zugferd-invoice.xml` is not an allowed hybrid filename |
| CG-28 | converter | XSD `xs:decimal`; §7.1.5 p.35 | Fatal (XSD) | Quantities, percentages and rates below 1e-6 are written in exponent notation |
| CG-29 | extraction, security | — | interop | `extract()` decodes every embedded file, with no budget, before matching the file name |
| CG-30 | XMP | BR-HYBRID-07 | Fatal | A `level` option outside the lower-case keys (`BASIC WL`, `BASICWL`, `MINIMUM`) writes an empty `fx:ConformanceLevel` |
| CG-31 | embedding, security | AGENTS.md Security | interop | Default `generate()` re-serializes but keeps a DOCTYPE (incl. `SYSTEM`/`PUBLIC` ids) and an XML 1.1 declaration in the embedded invoice |
| CG-33 | spec, French CTC, upstream | `EXTENDED-CTC-FR-CII.sch` BR-DEC-19/20 | Fatal (rules not run) | The EXTENDED-CTC-FR Schematron never fires BR-DEC-19/20 on VAT breakdowns of categories that have their own rules (first-match shadowing) |
| CG-40 | spec, French CTC, upstream | `EXTENDED-CTC-FR-CII.sch` BR-EXT-CL-07 | Fatal (rule not run) | The EXTENDED-CTC-FR Schematron never checks a `ReferenceTypeCode` against UNTDID 1153 (always-true guard) |

### CG-05 — `generate()` does not produce PDF/A-3

- **Spec:** BR-HYBRID-02 (appendix 3.d, PDF p.158–159): the envelope SHALL be PDF/A-3 (or PDF/A-4f).
- **Code:** `generate()` only attaches the XML, sets the AF relationship, Info and XMP. Fonts, ICC
  output intent and the rest of PDF/A are the caller's job (see `tests/generate/index.ts`, which
  embeds a font, an sRGB OutputIntent and a TrimBox by hand). This is by design and now documented
  (`docs/api/generate.md`, "Supplying the PDF base"); the docs overclaim is fixed (see Verified). No
  test validates the output with veraPDF.
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
  - This is a manual run, not a CI test, so the "Not verified anywhere yet" note above still applies
    until a test pins it.

### CG-08 — Order-X hybrid metadata

- **Spec:** hybrid code lists (`text/codelists--HybridDocument.csv`, `--HybridConformance.csv`):
  Order-X `fx:DocumentType` ∈ {`ORDER`, `ORDER_CHANGE`, `ORDER_RESPONSE`}, `fx:ConformanceLevel` ∈
  {`BASIC`, `COMFORT`, `EXTENDED`}. BR-HYBRID-06/07 are Fatal.
- **Code:** `src/lib/xmp.ts:92` always writes `INVOICE`; `src/lib/generate.ts:80-83` leaves
  `conformanceLevel` empty for `orderx`. The namespace question is CG-10.

### CG-10 — Spec inconsistency on the XMP namespace (unresolved)

- §6.3.1 p.28 and the reference packet: `urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#`.
- BR-HYBRID-04 (PDF p.159, `text/fields--Business_Rules_HYBRID.csv`):
  `urn:factur-x:pdfa:CrossIndustryDocument:1p0#`, Fatal.
- The library uses the §6.3.1 form for every flavor. **Do not change it** on the strength of one
  reading. Settle it with an external validator result first, and record that result here.

### CG-12 — Reference profile XRECHNUNG and German restrictions

- XRECHNUNG (§7.7, `xrechnung.xml`, conformance `XRECHNUNG`) is only partly supported. `extract()`
  finds `xrechnung.xml` (see Verified), but `getLevel()` cannot parse its guideline ID, so `check()`,
  `extract({ check: true })` and the CLI `extract` (which checks by default) throw on a real
  XRechnung, and `generate()` never writes `xrechnung.xml` or the `XRECHNUNG` conformance level
  (§7.7 p.70: always `Alternative`). It is not applicable in France.
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
  basis of the Apache-2.0 statement and to ask FNFE upstream for clarification. Tier 3 (CG-18) ships
  the compiled `EXTENDED-CTC-FR-CII` Schematron of the same release: the maintainer decided on
  2026-11-15 to ship it on the same basis for now, knowing two facts that weaken that basis: release notes p.10 §2.1 list the
  publication's Schematrons as BR-FR-Flux2 (CII, UBL) and BR-FR-CDV only (p.9 does call
  EXTENDED-CTC-FR "a dedicated Schematron, published with this version 1.4.0"), and its `.sch` header
  reads "Schematron dérivé du schematron EN16931 preprocessed Licensed under … EUPL version 1.4.0",
  i.e. derived from the CEN EN 16931 Schematron, whose vendored copy
  (`CII/EN16931/schematron/EN16931-CII-validation-preprocessed.sch`) says EUPL 1.2. The uncoupled
  UN/CEFACT CII D22B XSDs carry no licence header.
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
### CG-18 — `EXTENDED-CTC-FR` CII profile: French extension fields

- **Spec:** XP Z12-012 v1.4 defines an `EXTENDED-CTC-FR` profile for plain CII (guideline ID
  `urn:cen.eu:en16931:2017#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr`), with French extension
  fields `EXT-FR-FE-*` (Annex A `annex-a--CII_D22B_FX_EXT-CTC-FR.csv`).
- **Done (Tier 3):** level `extended-ctc-fr` is detected and validated with the "uncoupled" CII D22B
  XSD and the dedicated `CII/EXTENDED-CTC-FR` Schematron, plus BR-FR; `generate()` refuses it (see
  Verified).
- **Still open:** models, converter and parser don't know the `EXT-FR-FE-*` fields, so
  `xmlToInvoice()` drops them and `invoiceToXml()` can't write them. That is the next PR.
- **Evidence:** `grep -c 'EXT-FR-FE' spec/afnor-xp-z12-012-1.4/text/annex-a--CII_D22B_FX_EXT-CTC-FR.csv`
  against `grep -rn 'EXT-FR-FE' src/lib/models` (no match).

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

### CG-28 — Exponent notation for small quantities, percentages and rates

- **Code:** `convertQuantity`, `convertMeasure`, the currency `ConversionRate` and the percentage
  writers in `src/lib/converters/facturx.ts` use `String(value)`, which writes values below 1e-6 as
  `1e-7`. `xs:decimal` has no exponent, so the output fails the XSD. Unit prices use
  `formatDecimal` since CG-01 and are not affected.
- **Evidence:** read `examples/Facture_FR_EN16931.xml` with `xmlToInvoice`, set line 1
  `billedQuantity.value = 1e-7`, `invoiceToXml` → `<ram:BilledQuantity unitCode="C62">1e-7`;
  `check({ level: 'en16931' })` → `'1e-7' is not a valid value of the atomic type 'xs:decimal'`.
- **Fix direction:** write every decimal through `formatDecimal`.

## Changing this file

- Add an entry when a gap is confirmed **with evidence** (a command and its output, or a failing
  test). Suspicions go to an issue, not here.
- Close an entry by moving its proof (test name or command) to **Verified**, in the same PR as the fix.
- Re-run every proof in **Verified** when the spec version or a vendored asset changes.

### CG-29 — `extract()` decodes every attachment without a bound

- **Code:** `extractAttachments` (`src/lib/pdf.ts`) decodes each EmbeddedFiles entry with pdf-lib's
  `decodePDFRawStream(…).decode()` before `extract()` matches the file name. Nothing is deduplicated,
  capped or charged to a budget, unlike `generate()` (`InflateBudget`, see Verified). A file
  specification without `/EF` throws a raw pdf-lib error.
- **Effect:** a small untrusted PDF can make `extract()` spend seconds of CPU and gigabytes of memory.
  It predates the `/Kids` reader; a flat `/Names` array allows the same.
- **Evidence:** spec review probe (2026-11-15): a 53 KB PDF whose name tree has N file specifications
  sharing one Flate stream of 50 MB of zeros, split over two `/Kids` leaves. `extract()` answers
  `No attachment found` after ~6.9 s and ~2 GB RSS for N = 100 (90 ms for N = 1), linear in N.
- **Fix direction:** match on the tree key, `/F` and `/UF` first, decode only the match, once, through
  the capped inflate path and budget `generate()` uses.

### CG-30 — Unrecognized `level` spelling gives an empty conformance level

- **Spec:** BR-HYBRID-07 (Fatal): `fx:ConformanceLevel` SHALL be a value of the HybridConformance code
  list.
- **Code:** `generate()` looks `level` up in `FACTURX_CONFORMANCE_LEVEL` by its exact lower-case key
  (`src/lib/generate.ts`); any other spelling silently writes an empty `fx:ConformanceLevel`. The
  `afRelationship` check uses the same exact key, so the two stay consistent.
- **Evidence:** `generate({ pdf, xml: <EN 16931 XML>, level: 'BASIC WL' })` (or `'BASICWL'`,
  `'MINIMUM'`) → `<fx:ConformanceLevel></fx:ConformanceLevel>`; `'minimum'` → `MINIMUM`.
- **Fix direction:** validate `level` against the known levels of the flavor and throw on unknown
  values.

### CG-31 — Default `generate()` keeps a DOCTYPE and an XML 1.1 declaration

- **Rule:** no vendored rule; AGENTS.md "Security" (untrusted XML, metadata injection). CII documents
  carry no DOCTYPE, and the vendored Factur-X text names no XML version.
- **Code:** without `preserveXmlBytes`, `generate()` embeds `xml.toString()` (`src/lib/generate.ts`).
  libxml2's serialization keeps the DOCTYPE (internal subset, `SYSTEM` or `PUBLIC` id) and the
  `version="1.1"` declaration of the input. The parse used the safe default options, so nothing was
  loaded or expanded here, but every later reader of the PDF gets the DOCTYPE. An XML 1.1 reader
  treats NEL and U+2028 as line ends where libxml2 checked the document as 1.0. `preserveXmlBytes`
  refuses both.
- **Evidence:** spec review probe (2026-11-15): `generate({ pdf, xml: <EN 16931 example with
  <!DOCTYPE rsm:CrossIndustryInvoice SYSTEM "file:///etc/passwd"> after the declaration>, check: true })`
  succeeds, and the embedded `factur-x.xml` still starts with that DOCTYPE; the same with
  `<?xml version="1.1"?>` embeds `version="1.1"`.
- **Fix direction:** refuse (or strip, with a documented reason) a DOCTYPE and a non-1.0 version on
  the default path too. It changes behaviour for callers, so it needs an `upgrading.md` entry.

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
