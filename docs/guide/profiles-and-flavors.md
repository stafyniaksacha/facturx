# Profiles & flavors

Two concepts decide how an invoice is interpreted and validated: the **flavor** (which standard /
schema family) and the **level** (which profile within that family). Almost every function in the
library accepts optional `flavor` and `level` options — and autodetects them from the XML when you
omit them.

## Flavors

| Flavor | Levels | Validation | Embedded filename |
| --- | --- | --- | --- |
| `facturx` | `minimum`, `basicwl`, `basic`, `en16931`, `extended` | XSD **+ Schematron** | `factur-x.xml` |
| `orderx` | `basic`, `comfort`, `extended` | XSD | `order-x.xml` |
| `zugferd` | — | extraction only | `zugferd-invoice.xml`, `ZUGFeRD-invoice.xml` |

- **`facturx`** — Factur-X / ZUGFeRD 2.x invoices (Cross Industry Invoice). Fully supported:
  generate, extract, parse, build, XSD + Schematron validation.
- **`orderx`** — Order-X purchase orders (SCRDMCCBDACIO message). Generate, extract and XSD
  validation. There is no Schematron for Order-X.
- **`zugferd`** — recognised on **extraction** by its embedded filename. ZUGFeRD 2.x is technically
  identical to Factur-X, so once extracted the XML validates as `facturx`.

## Factur-X profiles (levels)

Profiles are increasing supersets of data, from the bare legal minimum to a fully detailed invoice.

| Level | Conformance label | What it carries |
| --- | --- | --- |
| `minimum` | `MINIMUM` | Issuer, buyer, totals and VAT summary — the legal minimum (often only valid for some flows). |
| `basicwl` | `BASIC WL` | "Basic Without Lines" — header-level data and tax breakdown, **no line items**. |
| `basic` | `BASIC` | BASIC WL **plus** invoice line items. |
| `en16931` | `EN 16931` | The full EN 16931 "COMFORT" core model — covers the vast majority of B2B invoices. |
| `extended` | `EXTENDED` | A superset of EN 16931 with additional cross-industry fields. |

The `conformanceLevel` strings above are written into the PDF/A-3 XMP metadata by
[`generate()`](/api/generate).

## Autodetection

When you don't pass `flavor` / `level`, the library reads them from the XML itself:

- **Flavor** comes from the XML **root element**: `CrossIndustryInvoice` → `facturx`,
  `SCRDMCCBDACIOMessageStructure` → `orderx`, `CrossIndustryDocument` → `zugferd`.
- **Level** comes from the **specification identifier** in
  `…/GuidelineSpecifiedDocumentContextParameter/ID` — e.g. `urn:factur-x.eu:1p0:minimum` resolves to
  `minimum`, `urn:cen.eu:en16931:2017` resolves to `en16931`.

On **extraction**, the flavor is determined from the *embedded attachment filename* (`factur-x.xml`,
`order-x.xml`, or a ZUGFeRD filename).

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
