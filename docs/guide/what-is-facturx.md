# What are Factur-X & ZUGFeRD?

If you've ever received an invoice as a PDF, you know the problem: a human can read it, but a
computer can't reliably understand it. Accounting software has to guess at the total, the VAT, the
due date — or someone has to retype everything. **Hybrid e-invoicing** solves this, and Factur-X
and ZUGFeRD are the two best-known implementations of it in Europe.

## The idea: one file, two readers

A Factur-X (or ZUGFeRD) invoice is an ordinary **PDF/A-3** document with a structured **XML**
file embedded inside it as an attachment.

- **Humans** open the PDF and see the invoice exactly as before.
- **Machines** read the embedded XML — a precise, structured description of every invoice field
  (seller, buyer, line items, taxes, totals, payment terms…).

Because both live in a single file, there is nothing to keep in sync and nothing extra to send.
The visual document and the machine-readable data are guaranteed to travel together.

```
┌─────────────────────────────────────────┐
│  invoice.pdf  (PDF/A-3)                   │
│                                           │
│   ┌───────────────────────────────────┐  │
│   │  Human-readable invoice (visual)  │  │  ← what a person sees
│   └───────────────────────────────────┘  │
│                                           │
│   📎 factur-x.xml  (Cross Industry        │  ← what software reads
│      Invoice — structured data)           │
└─────────────────────────────────────────┘
```

## EN 16931 — the European standard

[**EN 16931**](https://en.wikipedia.org/wiki/EN_16931) is the European standard that defines the
*semantic data model* of an electronic invoice — the list of business terms (`BT-*`) and business
groups (`BG-*`) an invoice can contain, and the rules (`BR-*`) they must satisfy. It was created so
that a single invoice format could be accepted across the EU.

Factur-X and ZUGFeRD both express EN 16931 using the UN/CEFACT **Cross Industry Invoice (CII)** XML
syntax. This library targets **Factur-X 1.09 / ZUGFeRD 2.5**, based on **CII D22B**.

## Factur-X

**Factur-X** is the French hybrid e-invoice format, published by the
[FNFE-MPE](https://fnfe-mpe.org/factur-x/) (Forum National de la Facture Électronique). It is a
PDF/A-3 with an embedded `factur-x.xml` CII file, and it defines several **profiles** (levels of
data richness) from `MINIMUM` up to `EXTENDED` — see [Profiles & flavors](/guide/profiles-and-flavors).

## ZUGFeRD

**ZUGFeRD** (*Zentraler User Guide des Forums elektronische Rechnung Deutschland*) is the German
hybrid e-invoice format, published by [FeRD](https://www.ferd-net.de/). From **version 2.x onward,
ZUGFeRD and Factur-X are technically the same format** — the same CII XML, the same profiles, the
same PDF/A-3 container. The two organisations align their releases:

| Factur-X | ZUGFeRD | CII |
| --- | --- | --- |
| 1.0 | 2.0 | D16B |
| 1.09 | 2.5 | D22B |

The main practical difference you'll meet in code is the **filename of the embedded XML**: Factur-X
uses `factur-x.xml`, while older/other German invoices may use `zugferd-invoice.xml`. This library
recognises both — see the `zugferd` flavor in [Profiles & flavors](/guide/profiles-and-flavors).

## Order-X

**Order-X** is the sibling standard for **purchase orders** (rather than invoices), also published
by FNFE-MPE. It uses the same hybrid PDF/A-3 + XML approach, but the embedded file is `order-x.xml`
and uses the UN/CEFACT *SCRDMCCBDACIOMessageStructure* (Order) schema with its own `basic`,
`comfort` and `extended` levels. This library can generate, extract and XSD-validate Order-X files.

## Why it matters now

E-invoicing is becoming **mandatory** across Europe. France is rolling out a national e-invoicing
reform for business-to-business transactions, Germany has begun phasing in mandatory B2B
e-invoice *reception*, and many other member states are following under the EU's *VAT in the
Digital Age* (ViDA) initiative. Factur-X / ZUGFeRD is one of the formats explicitly recognised by
these mandates, which is why being able to produce and validate it from code is increasingly useful.

## What this library does

`@stafyniaksacha/facturx` gives you the building blocks for working with these formats in
TypeScript / JavaScript:

- [**Generate**](/api/generate) a compliant PDF/A-3 by embedding XML into a PDF.
- [**Extract**](/api/extract) the XML back out of a Factur-X / Order-X / ZUGFeRD PDF.
- [**Parse & build**](/api/parsing) — turn XML into a typed model and back.
- [**Validate**](/guide/validation) against the official XSD and the EN 16931 Schematron rules.

Ready to try it? Head to [Getting started](/guide/getting-started).

## Useful links

- Factur-X — <https://fnfe-mpe.org/factur-x/>
- Order-X — <https://fnfe-mpe.org/factur-x/order-x/>
- ZUGFeRD (FeRD) — <https://www.ferd-net.de/>
- EN 16931 — <https://en.wikipedia.org/wiki/EN_16931>
