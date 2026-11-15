# Profiles & flavors

Two concepts decide how an invoice is interpreted and validated: the **flavor** (which standard /
schema family) and the **level** (which profile within that family). Almost every function in the
library accepts optional `flavor` and `level` options — and autodetects them from the XML when you
omit them.

## Flavors

| Flavor | Levels | Validation | Embedded filename |
| --- | --- | --- | --- |
| `facturx` | `minimum`, `basicwl`, `basic`, `en16931`, `extended`; `extended-ctc-fr` (plain CII, validation only) | XSD **+ Schematron** | `factur-x.xml` (`xrechnung.xml` is extracted as `facturx` too) |
| `orderx` | `basic`, `comfort`, `extended` | XSD | `order-x.xml` |
| `zugferd` | — | extraction only; 2.x content validates as `facturx` | `zugferd-invoice.xml`, `ZUGFeRD-invoice.xml` |

- **`facturx`** — Factur-X / ZUGFeRD 2.x invoices (Cross Industry Invoice). Fully supported:
  generate, extract, parse, build, XSD + Schematron validation.
- **`orderx`** — Order-X purchase orders (SCRDMCCBDACIO message). Generate, extract and XSD
  validation. There is no Schematron for Order-X.
- **`zugferd`** — recognised on **extraction** by its embedded filename. ZUGFeRD 2.x is technically
  identical to Factur-X, so its XML validates as `facturx`: `extract({ check: true })` does this on
  its own, and `check()` detects it from the root. ZUGFeRD 1.0 (`CrossIndustryDocument`) can be
  extracted but not validated. `generate()` throws for this flavor: generate a ZUGFeRD 2.x invoice as
  `facturx`.

## Factur-X profiles (levels)

Profiles are increasing supersets of data, from the bare legal minimum to a fully detailed invoice.

| Level | Conformance label | What it carries |
| --- | --- | --- |
| `minimum` | `MINIMUM` | Issuer, buyer, totals and VAT summary — the legal minimum (often only valid for some flows). |
| `basicwl` | `BASIC WL` | "Basic Without Lines" — header-level data and tax breakdown, **no line items**. |
| `basic` | `BASIC` | BASIC WL **plus** invoice line items. |
| `en16931` | `EN 16931` | The full EN 16931 "COMFORT" core model — covers the vast majority of B2B invoices. |
| `extended` | `EXTENDED` | A superset of EN 16931 with additional cross-industry fields. |

`extended-ctc-fr` is the French reform's EXTENDED-CTC-FR profile for **plain CII** invoices (XP Z12-012,
guideline ID `…urn.cpro.gouv.fr:1p0:extended-ctc-fr`), not a Factur-X profile. `check()` detects it and
always validates it with the UN/CEFACT CII D22B XSD. The dedicated EXTENDED-CTC-FR Schematron published
by FNFE-MPE runs only with `schematron: true`; `frCtc: true` adds the French rules but does not turn the
Schematron on, so pass both for the full sequence. Only the exact Annex A guideline ID is recognised, also when you pass `level: 'extended-ctc-fr'`. It
has no conformance label, so `generate()` refuses a document that declares it (even with an explicit
`level`), and `extract({ check: true })` rejects a PDF whose `factur-x.xml` declares it. Its French extension fields (`EXT-FR-FE-*`) are EXTENDED fields of the models: `xmlToInvoice()` reads
them and `invoiceToXml()` writes them back, including the VAT currency exchange
(`TaxApplicableTradeCurrencyExchange`, incl. the exchange rate date).

The `conformanceLevel` strings above are written into the PDF/A-3 XMP metadata by
[`generate()`](/api/generate).

The validation assets (XSD and Schematron) are not all the same version. `minimum` and `basic` use
Factur-X **1.09** (FINAL). `basicwl`, `en16931` and `extended` use Factur-X **1.09.2**
(`fixFR04`), the update FNFE-MPE publishes for the three profiles in scope of the French e-invoicing
reform. In `extended`, 1.09.2 makes the VAT category code and type code of a line optional, so that
`GROUP` / `INFORMATION` sub-lines can omit them (the `categoryCode` of `TradeTaxType` is optional in
the models for that reason); the Schematron still requires them on detail lines and on the VAT
breakdown.

## Autodetection

When you don't pass `flavor` / `level`, the library reads them from the XML itself:

- **Flavor** comes from the XML **root element**: `CrossIndustryInvoice` → `facturx`,
  `SCRDMCCBDACIOMessageStructure` → `orderx`, `CrossIndustryDocument` → `zugferd`.
- **Level** comes from the **specification identifier** in
  `…/GuidelineSpecifiedDocumentContextParameter/ID` — e.g. `urn:factur-x.eu:1p0:minimum` resolves to
  `minimum`, `urn:cen.eu:en16931:2017` resolves to `en16931`.

On **extraction**, the flavor is determined from the *embedded attachment filename* (`factur-x.xml` or
`xrechnung.xml` → `facturx`, `order-x.xml`, or a ZUGFeRD filename). `extract()` does not detect the level: its `level` field is
only what you passed in. Run [`check()`](/api/check) on the extracted XML to get it.

You only need to pass `flavor` / `level` explicitly to **override** detection or to fail fast when a
file isn't what you expect — for example `extract({ pdf, flavor: 'facturx' })` throws if the PDF
turns out to contain an Order-X attachment.

## Document type codes

The document type (invoice, credit note, order…) is carried in the XML as a **UNTDID 1001** code
(business term **BT-3**). The library exposes the subset used by Factur-X 1.09 and Order-X as the
`DOC_TYPE` map. The most common values:

| Code | Meaning |
| --- | --- |
| `380` | Invoice |
| `381` | Refund / credit note |
| `384` | Corrected invoice |
| `386` | Prepayment invoice |
| `389` | Self-billed invoice |
| `220` | Order *(Order-X)* |
| `230` | Order change *(Order-X)* |
| `231` | Order response *(Order-X)* |

::: details Full DOC_TYPE list
`71` Request for payment · `80` Debit note related to goods or services · `81` Credit note related
to goods or services · `82` Metered services invoice · `83` Credit note related to financial
adjustments · `84` Debit note related to financial adjustments · `261` Self billed credit note ·
`262` Consolidated credit note · `325` Proforma invoice · `326` Partial invoice · `380` Invoice ·
`381` Refund · `382` Commission note · `383` Debit note · `384` Corrected invoice · `385`
Consolidated invoice · `386` Prepayment invoice · `387` Hire invoice · `388` Tax invoice · `389`
Self-billed invoice · `393` Factored invoice · `395` Consignment invoice · `396` Factored credit
note · `575` Forwarder's invoice · `623` Forwarder's invoice discrepancy report · `780` Freight
invoice · `875` Partial construction invoice · `876` Partial final construction invoice · `877`
Final construction invoice · `935` Customs invoice · `220` Order · `230` Order Change · `231` Order
Response.
:::

## Next

- [Validation](/guide/validation) — how XSD and Schematron checking differ per flavor/level
- [SDK reference](/api/) — where `flavor` / `level` appear in each function
