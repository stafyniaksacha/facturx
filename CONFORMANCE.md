# Conformance register

What this library verifiably conforms to, and every **known** deviation from the specification, with
evidence. Reviewers (human or agent) check new work against this file: a finding that matches an
open entry is "known", anything else is new.

- **Spec of record:** Factur-X 1.09 / ZUGFeRD 2.5, FINAL 2026-06-10, vendored in
  [`spec/factur-x-1.09/`](spec/README.md). Citations are `§section, p.N` of
  `distribution/1. FACTUR-X 1.09 2026 06 10 EN.pdf` (PDF page = printed page for p.1–91), or a rule
  id (`BR-*`, `BR-HYBRID-*`) / code list from `spec/factur-x-1.09/text/*.csv`.
- **Severity** is the spec's own (`Fatal` / `Warning` / `Information`) where a rule id exists;
  otherwise `data-loss`, `interop` or `docs`.
- **Last audited:** 2026-10-26, against `0.5.0` (commit `0062024`).

## Verified (with the command that proves it)

| Claim | Proof |
| --- | --- |
| All vendored XSD and `_codedb.xml` are byte-identical to the spec; all XSLT identical after the documented `sum()` patch; all `.sef.json.gz` reproducible from them | `pnpm spec:verify` |
| All 56 official example PDFs (11–12 per profile) extract, pass XSD + Schematron at their profile, and round-trip through `xmlToInvoice` → `invoiceToXml` with an identical model | `pnpm build && pnpm vitest run tests/spec-examples.test.ts` |
| External XML entities are not expanded with the parse options used by `resolveXml` / `xmlToInvoice` (no XXE) | probe in the audit; keep libxmljs `noent` / `dtdload` off |

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
| CG-06 | XMP | XMP packet header | interop | `xpacket id` is random instead of the fixed XMP value |
| CG-07 | embedding | §6.2.2 p.26–27, BR-HYBRID-11 | Warning | `AFRelationship` hard-coded to `Data` |
| CG-08 | Order-X | BR-HYBRID-06/07 | Fatal | Order-X PDFs get Factur-X `INVOICE` XMP and empty conformance level |
| CG-09 | ZUGFeRD | BR-HYBRID-08/13, §6.3.2 p.29 | Fatal | `generate({ flavor: 'zugferd' })` writes a non-conformant hybrid |
| CG-10 | spec | BR-HYBRID-04 vs §6.3.1 p.28 | — | Spec is internally inconsistent on the XMP namespace URI |
| CG-11 | API vs docs | — | docs | `extract()` never autodetects `level`; README implies it does |
| CG-12 | profiles | §7.7, `codelists--HybridConformance.csv` | interop | XRECHNUNG reference profile unsupported; no DE profile restrictions |

### CG-01 — Unit prices truncated to 2 decimals

- **Spec:** §7.1.5 p.35 — *Amount* has at most 2 decimals, but *Unit Price Amount* has no limit
  (example `1000.3454`); quantities and percentages are unbounded too.
- **Code:** `convertAmount` (`src/lib/converters/facturx.ts:47`) applies `value.toFixed(2)` to every
  `udt.AmountType`, including item net/gross price `ram:ChargeAmount` and price-level
  `ram:AppliedTradeAllowanceCharge/ram:ActualAmount` (BT-146 / BT-148 / BT-147). Separately,
  `parseAmount` (`src/lib/parsers/facturx.ts:93`) stores amounts as binary floats (`parseFloat`).
- **Evidence:** set an EN16931 example's `NetPriceProductTradePrice/ChargeAmount` to `0.3456`, run
  `xmlToInvoice` → `invoiceToXml`: output is `0.35`. The official examples do not catch it (all their
  prices are whole cents). Directly affects per-kWh energy pricing.

### CG-02 — XMP packet not UTF-8

- **Code:** `src/lib/xmp.ts:97` passes a JS string to `pdf.context.stream()`; pdf-lib keeps the low
  byte of each UTF-16 code unit. `é` is written as `0xE9` (Latin-1), `€` as `0xAC`.
- **Spec:** the XMP packet (`begin=""` ⇒ UTF-8) must be valid UTF-8 for BR-HYBRID-03 and PDF/A
  metadata validation.
- **Evidence:** `generate()` with seller name `Société … €`, read the `/Metadata` stream bytes.

### CG-03 — XMP values not XML-escaped (also a security issue)

- **Code:** `src/lib/xmp.ts:9-95` interpolates `title`, `subject`, `author`, `producer`, `creator`,
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

### CG-06 — `xpacket id` is random

- **Code:** `src/lib/xmp.ts:10` writes `id="${documentId}"` (the random PDF document ID).
- **Reference:** the spec's packet `distribution/2. FACTUR-X_extension_schema_exemple.xmp.txt` uses
  the fixed XMP value `W5M0MpCehiHzreSzNTczkc9d`. Confirm the validator impact with veraPDF before
  ranking higher.

### CG-07 — `AFRelationship` hard-coded to `Data`

- **Spec:** §6.2.2 table p.27. France: MINIMUM / BASIC WL `Data`; BASIC / EN 16931 / EXTENDED
  `Alternative`, `Source` or `Data`. Germany: `Alternative` mandatory for BASIC and above.
  BR-HYBRID-11 (Warning).
- **Code:** `src/lib/generate.ts:96`. `Data` is valid for every profile in France, so this is a
  missing option, not a wrong default. It blocks German-compliant output.

### CG-08 — Order-X hybrid metadata

- **Spec:** hybrid code lists (`text/codelists--HybridDocument.csv`, `--HybridConformance.csv`):
  Order-X `fx:DocumentType` ∈ {`ORDER`, `ORDER_CHANGE`, `ORDER_RESPONSE`}, `fx:ConformanceLevel` ∈
  {`BASIC`, `COMFORT`, `EXTENDED`}. BR-HYBRID-06/07 are Fatal.
- **Code:** `src/lib/xmp.ts:87` always writes `INVOICE`; `src/lib/generate.ts:67-70` leaves
  `conformanceLevel` empty for `orderx`. The namespace question is CG-10.

### CG-09 — `generate()` with `flavor: 'zugferd'`

- **Code:** `src/lib/generate.ts:71-74` embeds `zugferd-invoice.xml` with the Factur-X `fx:` XMP and
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

### CG-11 — `extract()` never returns an autodetected `level`

- **Code:** `src/lib/extract.ts:84-89` returns `options.level` (undefined unless passed).
- **Docs:** README quick start destructures `level` from `extract()` and says flavor and level are
  autodetected. `docs/api/extract.md:37` is correct ("The level, if provided").
- **Evidence:** `examples/quickstart.ts` prints `facturx undefined`.

### CG-12 — Reference profile XRECHNUNG and German restrictions

- XRECHNUNG (§7.7, `xrechnung.xml`, conformance `XRECHNUNG`) is not supported: `getLevel()` cannot
  parse its guideline ID and `generate()` never writes it. It is not applicable in France.
- MINIMUM and BASIC WL are "not allowed in Germany from 2025-01-01" as invoices
  (`codelists--HybridConformance.csv`). BR-HYBRID-DE-01 (Fatal, DE): MINIMUM is forbidden when buyer
  and seller are both in Germany. The library gives no warning for either.

## Changing this file

- Add an entry when a gap is confirmed **with evidence** (a command and its output, or a failing
  test). Suspicions go to an issue, not here.
- Close an entry by moving its proof (test name or command) to **Verified**, in the same PR as the fix.
- Re-run every proof in **Verified** when the spec version or a vendored asset changes.
