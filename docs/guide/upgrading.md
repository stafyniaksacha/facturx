# Upgrading from 0.6.1

This page lists everything that changes for you when you move from `0.6.1` to the next release. The
first section covers what can break your code or your CI, and the later sections cover what you can
adopt at your own pace.

::: tip TL;DR
1. If you read `valid` / `schematronValid`, decide whether Schematron **warnings** should still fail
   your pipeline. If they should, pass `warningsAsErrors: true` (CLI: `-W`).
2. If you match Schematron rule ids (`BR-CO-27`, `BR-S-01`, `BR-54`, …), update them for the
   BASIC WL, EN 16931 and EXTENDED profiles, which now run the Factur-X **1.09.2.fixFR04** rules.
3. If you read `TradeTaxType.categoryCode`, a line's `lineTotalAmount` or a product characteristic's
   `description` / `value` in TypeScript, handle `undefined`.
4. If you target the French e-invoicing reform, turn on the new `BR-FR` rules with `frCtc: true`
   (CLI: `--fr-ctc`).
:::

## Breaking changes

### Schematron warnings no longer make a document invalid

Each Schematron finding now has a `severity`, taken from the rule's own `flag`:

- **`warning`** for rules flagged `warning` or `information`. The spec marks these as non-blocking,
  for example `PEPPOL-EN16931-R008` (empty elements) or the EXTENDED `-08ini`/`-08rev` rules, which
  are each backed by a blocking `-08b` rule.
- **`error`** for everything else.

Warnings are returned in their own list and no longer affect `valid`:

```ts
const result = await check({ xml, schematron: true })

result.valid // XSD && no Schematron *error*
result.schematronErrors // errors only
result.schematronWarnings // new: always reported, never affect `valid` by default
```

```ts
const { valid, errors, warnings } = await validateSchematron({ xml, level: 'en16931' })
```

To keep 0.6.1's strictness, where any failed rule made the document invalid, pass
`warningsAsErrors: true`. Warnings are then also listed in `errors` / `schematronErrors`, and still in
`warnings`:

```ts
await check({ xml, schematron: true, warningsAsErrors: true })
await validateSchematron({ xml, level: 'en16931', warningsAsErrors: true })
```

```bash
# CLI: warnings are printed as [Schematron warning] without changing the exit code…
npx @stafyniaksacha/facturx check invoice.xml --schematron
# …unless you ask for -Werror-like behaviour
npx @stafyniaksacha/facturx check invoice.xml --schematron --warnings-as-errors   # or -W
```

### Schematron `report` findings are no longer dropped

The Factur-X Schematrons express some profile restrictions as `<report>` rather than `<assert>`, for
example "Attribute @schemeID marked as not used in the given context". 0.6.1 silently ignored those
findings. They are now listed in `schematronErrors` and make the document invalid.

**Effect:** a document that passed in 0.6.1 can now fail, typically because it carries an attribute
the profile does not allow. The most common case is a `schemeID` on a contact e-mail address
(`DefinedTradeContact/EmailURIUniversalCommunication/URIID`, BT-43 / BT-58): EN 16931 defines no scheme
for it, so `schemeID="SMTP"` there fails. The repository's own examples carried it and were fixed. Only
the electronic address (`URIUniversalCommunication/URIID`, BT-34 / BT-49) takes a `schemeID`. Remove the
attribute the message points to.

### BASIC WL, EN 16931 and EXTENDED validate against Factur-X 1.09.2.fixFR04

For the three profiles in scope of the French e-invoicing reform, the XSD and Schematron now come from
the **1.09.2.fixFR04** assets that FNFE-MPE publishes with its CTC FR 1.4.0.04 release. MINIMUM and
BASIC stay on Factur-X 1.09 FINAL. These assets don't come from an official Factur-X 1.09.2
distribution.

What you may notice:

| Profile | Change |
| --- | --- |
| BASIC WL, EN 16931 | `BR-CO-27` is now reported as `CII-SR-470` (same check). |
| BASIC WL | New blocking rules `BR-CO-18` and `CII-SR-467` … `CII-SR-473`. The warning `BR-FXEXT-Z-08rev` is no longer emitted. `BR-51` is gone, but it could not fire on BASIC WL anyway: the XSD has no payment card. |
| EN 16931 | `BR-FXEXT-12` is gone, so some documents it used to reject now pass. New blocking rules `CII-SR-467` … `CII-SR-469` and `CII-SR-471` … `CII-SR-473`. New warning rules `CII-SR-474/475/476`. The warnings `BR-FX-EN-04` and `BR-FXEXT-Z-08rev` are no longer emitted. |
| EXTENDED | `BR-S-01`, `BR-Z-01`, `BR-E-01`, `BR-AE-01`, `BR-IC-01`, `BR-G-01`, `BR-O-01`, `BR-AF-01`, `BR-AG-01` become `BR-FXEXT-<category>-01`. They count `DETAIL` lines, document allowances and charges, and logistics charges, and no longer reject several breakdowns of one category by themselves. Some splits can still fail the `-08b` basis rules, which compare each breakdown's taxable amount (BT-116) with the matching line and allowance/charge totals: matched by VAT rate (BT-119) for every category except `O`, with an alternative calculation by exemption reason. In `tests/fixfr04.test.ts`, several `S` breakdowns at different rates pass, and the two-`Z` split built there fails `BR-FXEXT-Z-08b`. |
| EXTENDED | New blocking rules `CII-SR-467` … `CII-SR-469` and `CII-SR-471` … `CII-SR-473`. New warning rules `CII-SR-475/476`. |
| EXTENDED | `BR-54` becomes `BR-FXEXT-BR-54-1` and `BR-FXEXT-BR-54-2`. `BR-CO-27` is no longer checked. |
| EXTENDED | The XSD makes a VAT block's `TypeCode` / `CategoryCode` optional, so information and group sub-lines can leave them out. The Schematron still requires them on detail lines, on the VAT breakdown (BG-23) and on document-level allowances and charges. |

The new blocking `CII-SR-*` rules check that BT-81 and BT-82 have a single value across payment means,
and that BT-83, an allowance or charge amount, and an allowance or charge VAT block appear at most
once. The messages of `CII-SR-471` / `CII-SR-472` say BT-95 / BT-96 must be present, but the rules
only cap the count, and `CII-SR-472` can never fire. Presence of the VAT category code is still
checked by `BR-32` / `BR-37`.

If you filter or translate findings by `id`, update the mapping above.

### `TradeTaxType.categoryCode` is optional (TypeScript)

Following the EXTENDED XSD change above, `categoryCode` on `TradeTaxType` is now typed as optional.
The converter omits it when it is unset, and the parser leaves it `undefined` when the XML doesn't
have it. Code that reads it must handle the missing case. Don't
substitute a default category: on an EXTENDED information or group sub-line the code is absent on
purpose, and treating it as `S` would classify the line as standard-rated.

```ts
const code = tax.categoryCode?.value // string | undefined
if (code === undefined) {
  // no VAT category on this line (e.g. an EXTENDED information or group sub-line)
}
```

### Line net amount and item attribute name/value are optional (TypeScript)

In EXTENDED, Factur-X 1.09 makes three fields optional that the lower profiles require: the invoice
line net amount (BT-131, for sublines) and the item attribute name and value (BT-160, BT-161). The
model now types them as optional:

- `TradeSettlementLineMonetarySummationType.lineTotalAmount`
- `ProductCharacteristicType.description`
- `ProductCharacteristicType.value`

`xmlToInvoice()` leaves them `undefined` when the XML doesn't have them. It used to fill a missing
line net amount with `0` and a missing name or value with an empty text, so `invoiceToXml()` wrote
back a `<ram:LineTotalAmount>0.00</ram:LineTotalAmount>` or an empty element the source did not
have. An element that is present but empty is still read as an empty text and written back.

Constructors accept the same arguments as before, so code that builds models is unchanged. Code that
reads these properties must handle the missing case:

```ts
const net = line.specifiedLineTradeSettlement
  .specifiedTradeSettlementLineMonetarySummation
  ?.lineTotalAmount
  ?.value // number | undefined: absent on an EXTENDED subline that has no net amount

const name = characteristic.description?.value // string | undefined
```

Don't substitute `0`: a missing amount on an EXTENDED subline means "not stated", not "free".

### `generate()` rejects the `zugferd` flavor

`generate({ flavor: 'zugferd' })`, and `generate()` on a ZUGFeRD 1.0 `CrossIndustryDocument` XML,
now throw `Cannot generate the "zugferd" flavor: …` before reading the PDF. 0.6.1 embedded the XML
as `zugferd-invoice.xml` with Factur-X `fx:` XMP and an empty conformance level: that filename is
not in the hybrid filename code list, and the legacy ZUGFeRD 2.0 hybrid
that used it has its own `zf:` XMP schema, so the output matched neither. `zugferd` stays supported by
`extract()`.

A ZUGFeRD 2.x invoice is a Factur-X `CrossIndustryInvoice`: drop `flavor: 'zugferd'` (it is then
detected as `facturx`) or pass `flavor: 'facturx'`. It is embedded as `factur-x.xml`.

### `generate()` rejects an unknown `level`

For Factur-X, `generate({ level })` now throws `Unknown level "<level>" for the facturx flavor:
expected one of …` before reading the PDF when the level has no conformance value (`minimum`,
`basicwl`, `basic`, `en16931`, `extended`). 0.6.1 wrote an empty `fx:ConformanceLevel` instead,
which breaks BR-HYBRID-07 (Fatal). The same check applies when `level` is omitted and the level comes
from the XML's guideline ID (BT-24), e.g. a Factur-X invoice that declares the Order-X `comfort`
profile. A blank `level` (`'  '`) is treated like no level, for every flavor.

A Factur-X level is also read more leniently: case, surrounding spaces, inner spaces and underscores are
ignored, so the spellings of the hybrid code list (`BASIC WL`, `EN 16931`, `MINIMUM`) now work.
They used to give the same empty conformance level.

## Other behaviour changes

These shipped on `main` after 0.6.1 and are included in the next release.

- **`extract({ check: true })` validates ZUGFeRD attachments** ([#38](https://github.com/stafyniaksacha/facturx/issues/38)). 0.6.1 threw
  `Unknown schema flavor: "zugferd"` for any PDF whose invoice is named `zugferd-invoice.xml` or
  `ZUGFeRD-invoice.xml`, which also broke `facturx extract` (it checks by default). A ZUGFeRD 2.x
  invoice is now validated as `facturx`, and `flavor` is still reported as `zugferd`. A ZUGFeRD 1.0
  `CrossIndustryDocument` throws `ZUGFeRD 1.0 validation is not supported…` instead.

- **`generate()` accepts PDFs that already have a trailer `/ID`** ([#39](https://github.com/stafyniaksacha/facturx/pull/39)). Most real-world PDFs have
  one, and 0.6.1 threw `Not implemented yet: Document ID already set` on them. The permanent first
  element is now kept. In exchange, `generate()` now **rejects**, before writing the invoice:
  encrypted or signed PDFs, PDFs that already embed an invoice (detected best effort: an attachment
  whose content can't be read and whose name isn't a known invoice name can be missed), PDFs
  with a `/Kids` name tree, a
  reused `PDFDocument`, and PDFs with too many or too large attachments to inspect. The full list of
  error messages is in [`generate()`](/api/generate#source-pdfs-that-are-rejected). If you pass a
  `pdf-lib` `PDFDocument` rather than bytes, load it again after a rejection: from the
  existing-invoice check onward, `generate()` has already marked it as used and may have written
  attachments you queued with `attach()` into its name tree. Bytes you pass are never modified. The
  EmbeddedFiles name tree is also kept sorted, so existing attachments can come back in a different
  order. The existing-invoice check also reads page-level associated files and file attachment
  annotations, so their files count toward the 256-stream limit, and a page tree with more than
  65536 nodes or deeper than 256 levels, a page tree node reached twice (including a page added twice
  with `pdf-lib`'s `addPage()`), more than 65536 annotations or more than 1048576 `/Kids`, `/Annots`
  and `/AF` entries is rejected.
- **`xmlToInvoice()` reads EXTENDED logistics service charges** (`SpecifiedLogisticsServiceCharge`).
  They were written by `invoiceToXml()` but dropped on parsing, so `specifiedLogisticsServiceCharge`
  was always undefined in parsed models. It is now an array: the charges, or `[]` when there are none,
  like the other repeated fields.
- **`xmlToInvoice()` reads every EXTENDED subtree `invoiceToXml()` writes.** These were written but
  dropped on parsing, so they were always undefined in parsed models and lost when you parse and
  write an invoice again: advance payments (`specifiedAdvancePayment`, with their included taxes and
  preceding invoice reference), the tax currency exchange (`taxApplicableTradeCurrencyExchange`), item
  instances (`individualTradeProductInstance`, batch and serial IDs), included items
  (`includedReferencedProduct`) and the header consignment (`relatedSupplyChainConsignment`, transport
  modes). Repeated ones are arrays, `[]` when there are none, like the other repeated fields. The
  `schemeID` of the document ID, line IDs, document context parameter IDs, procuring project ID,
  payment card ID, debtor IBAN and accounting account ID is also read back now; it used to be dropped. An optional code element that is present but empty (a party `RoleCode`, a
  charge `ReasonCode`, a tax `TypeCode`, …) is now read as an empty value instead of `undefined`, so
  it is written back.
- **Non-VAT tax codes on charges** (EXTENDED): `AllowanceChargeReasonCodeType` has an optional
  `listID`. Set it to `'5153'` to write a UNTDID 5153 tax code instead of a charge reason, on a
  document charge, a line charge or a gross price charge; `xmlToInvoice()` reads it back. It used to
  be dropped, so such a code was read as a charge reason.
- **A malformed EmbeddedFiles name tree** now throws `Malformed EmbeddedFiles name tree: <reason>`
  from `extract()` and `generate()`, instead of a raw `pdf-lib` error ([#41](https://github.com/stafyniaksacha/facturx/pull/41)). A `/Name` key, which
  0.6.1 decoded, is now rejected.
- **The converter writes `RoleCode`, contact `TypeCode` and `LineStatusCode` as element text** ([#25](https://github.com/stafyniaksacha/facturx/pull/25)).
  0.6.1 wrote them without their value.
- **`check()`, `generate()`, `xmlToInvoice()` and the CLI work on Windows again** ([#26](https://github.com/stafyniaksacha/facturx/pull/26)): XSD imports
  failed to load on drive-letter paths.
- **The XMP metadata `generate()` writes is well-formed UTF-8**. Values taken from
  the invoice or `meta` (seller name, title, subject…) are XML-escaped, so a name with `&` or `<` no
  longer breaks the XMP and cannot inject XMP properties; characters XML 1.0 cannot carry (control
  characters) are dropped, from the Info dictionary too, so both carry the same value. Non-ASCII text such as `Société` or `€` is encoded as UTF-8 instead of
  being truncated to one byte per character.
- **`invoiceToXml()` no longer rounds unit prices to cents**. Item net and gross prices
  (BT-146, BT-148), the price discount or charge (BT-147, BT-X-302) and their base amounts
  (BT-X-35, BT-X-301) are *Unit Price Amount*s, which have no decimal limit: `0.3456`
  is now written as `0.3456`, not `0.35`. They are written in their shortest form, so `4.10` reads
  back and is written again as `4.1`. All other amounts are still written with 2 decimals. If you
  relied on the rounding, round the prices yourself before building the model.
- **The XMP packet id** is the fixed `W5M0MpCehiHzreSzNTczkc9d` from the reference packet.
  `XmpMetadata.documentId` is kept but deprecated.
- **PDF dates are the generation time, in UTC**. When you don't pass `meta`, 0.6.1 used the
  invoice issue date (BT-2) at midnight in the server's time zone for the Info `CreationDate` /
  `ModDate`, the XMP `CreateDate` / `ModifyDate` / `MetadataDate` and the embedded file's `Params`
  dates, so the output changed with `TZ`. They are now the time `generate()` runs. The title and
  subject still show the issue date as a calendar date (`dated 20260131`). To keep a fixed date, pass
  `meta` with your own `date`; it is used as before.
- **The Info `Producer` is the library's name and version**, the same value as the XMP
  `pdf:Producer`, instead of `pdf-lib (https://github.com/Hopding/pdf-lib)`. The XMP also gets a
  `pdf:Keywords` equal to the Info `Keywords`.
- **`extract()` finds `xrechnung.xml`** (reference profile XRECHNUNG) and reports it as flavor `facturx` (checking it still fails on a real
  XRECHNUNG guideline ID: use `check: false` / `--no-check`), and
  **reads attachment lists with one or two `/Kids` levels**, which 0.6.1 reported as
  `No attachment found`. Deeper or larger trees throw `Unsupported EmbeddedFiles name tree: …`.
  `generate()` still rejects sources with `/Kids`.

## New features

### French e-invoicing rules (BR-FR), opt-in

The FNFE-MPE `BR-FR-Flux2` rules (XP Z12-012 v1.4.0) can run after the XSD and the profile
Schematron, for Factur-X BASIC WL, EN 16931 and EXTENDED:

```ts
import { check, validateFrCtc } from '@stafyniaksacha/facturx'

// The full sequence from the release notes: XSD → profile Schematron → BR-FR
const result = await check({ xml, schematron: true, frCtc: true })
result.frCtcValid
result.frCtcErrors // id: "BR-FR-05", assertId: "BR-FR-05_BT-22_PMT"

// Or BR-FR on its own
const { valid, errors } = await validateFrCtc({ xml })
```

```bash
npx @stafyniaksacha/facturx check invoice.xml --schematron --fr-ctc
```

`frCtc` doesn't turn on `schematron`; pass both to get the full sequence. MINIMUM, BASIC, Order-X and
UBL documents throw. The messages are in French and quote invoice values, so treat them as personal
data in logs. See [French e-invoicing rules](/guide/french-ctc) for scope and known gaps. This is not
legal advice.

### `afRelationship` option for `generate()`

`generate({ pdf, xml, afRelationship: 'Alternative' })` (CLI `--afRelationship Alternative`) sets the
`AFRelationship` of the embedded XML. The default stays `Data`. MINIMUM and BASIC WL accept only `Data`;
Germany expects `Alternative` for BASIC and above. See
[`generate()`](/api/generate#behaviour).

### Lifecycle status messages (CDAR): `validateCdar()`

`validateCdar({ xml })` (CLI `facturx check-cdar <xml>`) validates a French lifecycle status message
in CDAR D22B against the "uncoupled" CDAR XSD and the `BR-FR-CDV` rules (XP Z12-012 v1.4.0). It
returns `{ valid, errors, schematronErrors, schematronWarnings }`. Validation only. See
[`validateCdar()`](/api/validate-cdar).

### EXTENDED-CTC-FR (plain CII) validation

`check()` now recognises the guideline ID `…urn.cpro.gouv.fr:1p0:extended-ctc-fr` as level
`extended-ctc-fr` (it used to throw `Unknown level: "1p0"`) and validates it with the UN/CEFACT CII
D22B "uncoupled" XSD and the FNFE-MPE EXTENDED-CTC-FR Schematron (`schematron: true`), plus BR-FR with
`frCtc: true`. Only that exact guideline ID is recognised. `validateFrCtc()` accepts
`level: 'extended-ctc-fr'`; `level: 'extended'` keeps working for such a document. `generate()` throws
for a document declaring this profile, even with an explicit `level: 'extended'` (which used to embed
it as EXTENDED), and `extract({ check: true })` throws for a `factur-x.xml` declaring it (it used to
throw `Unknown level`): it is not a Factur-X profile.

### Second line VAT total: `taxTotalAmountInAccountingCurrency`

EXTENDED (and EXTENDED-CTC-FR) allows two `TaxTotalAmount` on an invoice line: the line VAT amount
(BT-X-329) and the same amount in the VAT accounting currency (BT-X-590, with BT-6 as `currencyID`).
`xmlToInvoice()` used to keep only the first element. It now reads the second element into the new
optional `TradeSettlementLineMonetarySummationType.taxTotalAmountInAccountingCurrency`, and
`invoiceToXml()` writes that property right after `taxTotalAmount`, which is unchanged. The two are
read by position, not by `currencyID`: put the invoice-currency amount first. A third element is
still dropped.

### Byte-exact XML: `preserveXmlBytes` and `extract().bytes`

`generate({ pdf, xml, preserveXmlBytes: true })` (CLI `--preserveXmlBytes`) embeds the XML bytes you
pass unchanged instead of libxml2's re-serialization, and `extract()` now also returns `bytes`, the
attachment exactly as embedded (CLI `extract --raw`). A hash or signature taken over the issued XML
then matches what is in the PDF. The default and the `xml` field are unchanged. `preserveXmlBytes`
needs a `string` or `Buffer`, XML 1.0, UTF-8, with no DOCTYPE. See [`generate()`](/api/generate#behaviour).

### New fields on `SchematronError`

| Field | Meaning |
| --- | --- |
| `severity` | `'error'` or `'warning'` (see above). **Required** in the type, so code that builds `SchematronError` objects itself (mocks, adapters) must set it. |
| `assertId` | Raw SVRL assert id, set only when the rule declares one. It is an internal number such as `FX-SCH-A-000372` for many structural checks, sometimes the rule itself in 1.09.2, or the exact assertion for BR-FR. It is absent for every `report` finding and for structural checks without an id. |

The types `SchematronError`, `SchematronResult` (the `{ valid, errors, warnings }` returned by
`validateSchematron()` and `validateFrCtc()`) and `SchematronConfig` are now exported by name.

`id` also recognises rule ids with lowercase suffixes now, for example `BR-FXEXT-Z-08rev`, which 0.6.1
left undefined.

## Checklist

- [ ] Search your code for `schematronValid`, `schematronErrors` and `validateSchematron`, and decide
      on `warningsAsErrors`.
- [ ] Update any rule-id mapping for BASIC WL, EN 16931 and EXTENDED (table above).
- [ ] Run `tsc`: fix reads of `TradeTaxType.categoryCode`, of a line's `lineTotalAmount` and of a
      product characteristic's `description` / `value`.
- [ ] Re-run your invoice corpus with `check({ schematron: true })`: new `@schemeID`-style failures
      come from the `report` findings that are no longer dropped.
- [ ] If `generate()` used to throw `Document ID already set` and you worked around it, drop the
      workaround. Then check the new rejection list against your source PDFs.
- [ ] If you call `generate()` with `flavor: 'zugferd'`, use `facturx` instead.
- [ ] If you pass `level` to `generate()`, make sure it is a level of the flavor (an unknown one now throws).
- [ ] For the French reform: add `frCtc: true` (CLI `--fr-ctc`).
- [ ] If you compare PDF dates with the invoice date, or snapshot `generate()` output, pass `meta.date`
      or expect the generation time.
- [ ] Make sure the PDF you pass to `generate()` is already PDF/A-3: it is not converted (the docs
      used to say otherwise).
