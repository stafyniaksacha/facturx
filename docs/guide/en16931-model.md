# EN 16931 model

`EN16931` is a syntax-neutral invoice model. Its classes are keyed by the **business terms** of the
European standard EN 16931 (`BT-1` invoice number, `BG-4` seller, `BG-25` invoice line, …) instead of the
elements of one XML syntax, so the same object can be written to, and read from, different syntaxes.
Today the only syntax is **CII**, through `toCii()` and `fromCii()`. A UBL 2.1 reader and writer are
planned on top of the same model, without a date.

The CII classes ([`Models`](/api/models)) stay the CII API, and `invoiceToXml()` stays the only code that
writes CII XML: `toCii()` produces a CII model, and you serialize that as before.

```ts
import { EN16931, fromCii, invoiceToXml, toCii } from '@stafyniaksacha/facturx'
// or from the subpath, where the classes are exported flat (no `EN16931.` prefix):
import { fromCii, Invoice, toCii } from '@stafyniaksacha/facturx/en16931'
```

## Build, write and read

<<< ../../examples/en16931.ts#main{ts}

The classes take an object in their constructor, like the CII models. Properties are named after the
business term without its group prefix (`BT-27 Seller name` on `Seller` is `name`), and every property
carries its id in JSDoc (`@bt BT-27`, `@bg BG-4`, `@ext EXT-FR-FE-12`), so your editor shows it on hover.
The [model reference](/api/models/en16931/invoice) lists every class with the ids and descriptions.

Conventions:

- Amounts, quantities, unit prices and percentages are `number`s; dates are ISO `YYYY-MM-DD` strings;
  an identifier with a scheme is `Identifier { value, schemeId? }`; codes are strings (the code list is
  named in the JSDoc, and checked by the Schematron, not by the type system).
- A repeatable term is an array and a mandatory term a required property. Where EN 16931 and
  EXTENDED-CTC-FR disagree on the cardinality, the model takes the **wider** (BT-60, for instance, is an array).
  The note text is the exception: annex A leaves BT-22 optional at EXTENDED-CTC-FR, the model keeps it
  mandatory, as EN 16931 does (CG-57).
- Optional terms are `undefined` when absent. The model never invents a value; `toCii()` writes the
  Factur-X default `Project reference` for BT-11-0 when BT-11 is set without a name (CG-49), and
  `fromCii()` reads exactly that default back as no name (`projectName` `undefined`), so the CII written
  again is the same. Any other name, `Project Reference` included, is kept.
- The text of a note (BT-22 in BG-1, BT-127 on a line) is the mandatory term of its group, so it is a
  required `string`. `fromCii()` reads `''` for a note without text, as the CII parser does, and `toCii()`
  refuses an empty one (CG-57).
- An invoice can be a plain object instead of class instances. The TypeScript types still require the
  array properties, but at runtime (plain JavaScript, data from JSON) `toCii()` guards them: an optional
  repeatable group left out (`notes`, `precedingInvoiceReferences`, a party's `identifiers`, a line's
  `notes` ...) reads as empty, and anything other than an array in its place, or a missing mandatory group
  (BG-23, BG-25), is an error naming the term, never a `TypeError`.

## Scope

In the model:

- every EN 16931 business term and group (`BT-*`, `BG-*`);
- every `EXT-FR-FE-*` field of XP Z12-012 v1.4 annex A (the French extension, profile
  `EXTENDED-CTC-FR`), in the group it belongs to, at every level that carries it: an invoice that holds
  `invoice.seller…` reads the same for EN 16931 and EXTENDED-CTC-FR data.

Not in the model, on purpose:

- **True `BT-X-*`**: Factur-X EXTENDED fields that have neither an EN 16931 id nor an `EXT-FR-FE` id
  (the line status code `BT-X-7`, party identifiers and contacts of the extended groups, the gross price
  charge, manufacturers, …). They are reported by `fromCii()` in `dropped`. Use the CII model if you need them.
- **`BT-179`, `BT-180`, `BT-215`, `BT-216` and `BG-34`**: EXTENDED-only rows of Factur-X 1.09 that annex A
  does not carry. Same treatment as `BT-X-*`.
- **MINIMUM and BASIC WL**: they are not EN 16931 invoices (no lines, no VAT breakdown). `fromCii()` throws on
  them; keep using the CII model for those profiles.

Two limits of the single-valued groups are worth knowing: the model holds one delivery (BG-13), one payment
instructions group (BG-16, the first payment means) and one line VAT block (BG-30), where some syntaxes
or profiles allow several. What `fromCii()` finds beyond them goes to `dropped`.
`CONFORMANCE.md` records the details (CG-50, CG-51, CG-52). A preceding invoice reference on a line
(`EXT-FR-FE-BG-06`) is an array, since the UBL annex allows two, but CII has room for one: `toCii()` throws on a
second. At the `extended` levels a group or information line (annex B UC10 to UC13) may have no price, quantity or VAT (CG-54).

## Levels: `toCii(invoice, { level })`

`level` is one of `basic`, `en16931`, `extended` and `extended-ctc-fr`. It decides BT-24 (the
specification identifier) and which terms may be present.

| Level | BT-24 written when the invoice has none |
| --- | --- |
| `basic` | `urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic` |
| `en16931` | `urn:cen.eu:en16931:2017` |
| `extended` | `urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended` |
| `extended-ctc-fr` | `urn:cen.eu:en16931:2017#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr` |

`toCii()` is strict. It **throws, naming the business term** (and never quoting the invoice's content) when:

- a mandatory term is empty or missing: BT-1, BT-2, BT-3, BT-5, the seller (BG-4) and buyer (BG-7) with their
  names, postal addresses and country codes, the totals, the VAT breakdown, the lines and their mandatory
  terms. Below `extended`, a line needs its price (BG-29), quantity (BT-129) and VAT (BG-30);
- the invoice holds a term the level cannot carry: a term missing from the Factur-X BASIC matrix needs
  `en16931`, and an `EXT-FR-FE-*` field needs `extended` or `extended-ctc-fr`. A BASIC invoice with
  `EXT-FR-FE-12` set is an error, not a silent drop;
- BT-24 (`specificationIdentifier`) is set to anything but the exact identifier of the level (another level's
  id, an Order-X id or a CIUS identifier would make the document claim a profile it was not checked against).
  Leave it unset, or set it to `''`, to get the identifier of the level;
- a mandatory term of a group is empty: BT-25 in a preceding invoice reference (BR-55), BT-122 in a supporting
  document (BR-52), BT-125-1 (MIME code) and BT-125-2 (filename) of an attached document, BT-22 in a note,
  BT-127 in a line note, BT-84 in a credit transfer (BR-50: an IBAN, or a national account number, BT-84-0),
  BT-17 or BT-18 set but empty, a BG-14 invoicing period with neither BT-73 nor BT-74 (BR-CO-19);
- the buyer (BT-46, BT-46-0) or the payee (BT-60, BT-60-0) holds more identifiers than the level carries:
  one private identifier below `extended-ctc-fr`, one global identifier (with a scheme) at `basic` and `en16931`;
- an *Amount* has more than two decimals (spec §7.1.5, BR-DEC): the XML writer would round it to cents, so
  `toCii()` refuses it and you round it first. Unit prices, quantities, percentages and rates are not *Amounts*
  and keep their decimals;
- a date is not a valid ISO date, or a sub-term is set without its parent (BT-11-0 without BT-11).

This is the same rule for every writer of the model: a value the caller put in the invoice and the target
cannot carry is an error, because dropping it would be silent data loss.

### Writing to other syntaxes

The model holds the terms of EN 16931 and of the French extension, and not every syntax has a place for
each of them. A term that a target syntax can't carry makes that syntax's writer throw, naming it, and
the caller clears it before writing: for instance a contact department name (BT-41-0, BT-56-0), a project
name other than the CII default (BT-11-0), or a BT-24 that is the identifier of another syntax. Only the
CII writer (`toCii()`) exists today; a UBL writer is planned for a later release.

## Reading: `fromCii(cii)`

`fromCii()` takes the CII model that `xmlToInvoice()` returns and gives `{ invoice, dropped }`. The level
comes from BT-24 of the document.

```ts
const { invoice, dropped } = fromCii(await xmlToInvoice(xml))
```

`dropped` lists the XPath-like path of **every value in the document that the model has no place for**
(`/rsm:CrossIndustryInvoice/…/ram:AssociatedDocumentLineDocument/ram:LineStatusCode`), positions only, never the
values; an index (`[2]`) appears only on repeatable elements. It is computed by mapping the invoice back to CII
and comparing with the document. Repeated elements (several additional documents, tax registrations,
allowances and charges, VAT totals) are first paired with an exactly equal element, at any position,
because the writer orders some of them differently from the source; the elements left over are then
compared by position, so a lost element is reported, not a kept one that resembles it. A path carries the
element's position in the source document. The comparison takes time linear in the size of the document,
so a large untrusted document can't make it blow up.

`dropped` is empty for the official examples of Factur-X 1.09 and of XP Z12-012 annex B (none carries
content outside the model); on a Factur-X EXTENDED document it holds the `BT-X-*` content (and the
excluded rows above).

`fromCii()` throws for MINIMUM and BASIC WL.

`dropped` covers what `xmlToInvoice()` reads. An XML element the CII parser does not read never reaches
the CII model, so neither `fromCii()` nor `dropped` can see it.

## Where a few terms land in CII

- **BT-7 and BT-8** (VAT point date and date code) are written on **every** `ApplicableTradeTax` of the VAT
  breakdown. This is the library's choice: annex B writes them that way, and annex A's note on BT-8 makes a
  repeated value identical. A source document that has them on the first entry only reads the
  same into the model and is written back with them on each entry. BT-8 is UNTDID 2005 in the model and
  UNTDID 2475 in CII (35 becomes 29), the same map is used for `EXT-FR-FE-180`, the line level BT-8.
- **BT-24** is kept as read: `fromCii()` sets `specificationIdentifier` to the document's own, and `toCii()`
  accepts only the exact identifier of the level.
- **BT-11-0** (project name) is the `Name` of the project and is written only with BT-11.
- **Amounts** are limited to two decimals (spec §7.1.5: only an *Amount* is), so `toCii()` throws, naming the term,
  on an *Amount* with more (floating point noise such as `0.1 + 0.2` is accepted and written as `0.30`). Unit
  prices (BT-146, BT-147, BT-148, …), quantities, percentages and rates are not limited and are
  not rounded, so a unit price of `489.057` is written as is. The model holds the `number` you gave it.
- **Sub-lines** (annex B UC12) are flat: a line carries `parentLineIdentifier`, the hierarchy is the parent
  references, as in CII.

## What is proven

On every official example (the Factur-X 1.09 corpus at BASIC, EN 16931 and EXTENDED, and the annex B
Factur-X documents, EN 16931, EXTENDED and EXTENDED-CTC-FR) the mapping `fromCii` → `toCii` → `invoiceToXml`
passes the XSD and the profile Schematron at the document's level, and the CII model read back from the
written XML is compared with the original in both directions: no value is lost beyond `dropped`, and no value
is added or changed on write. None of these examples carries content the model has no place for, so
`dropped` is empty for all of them, the Factur-X EXTENDED ones included, and the CII model read back equals
the original. `dropped` itself is proven on a Factur-X EXTENDED example with Factur-X-only content
injected (a test indicator, a line status code, a seller role code, a charge on a gross price, and a
sequence number on a document charge the writer reorders): it holds exactly those paths, and nothing else
changes. Every in-scope id has a property:

```bash
pnpm build && pnpm vitest run tests/en16931-corpus.test.ts tests/en16931-coverage.test.ts
```

## Not covered yet

- UBL: there is no `invoiceToUbl()` or `ublToInvoice()` yet; UBL documents are only validated
  ([UBL 2.1 validation](/guide/validation)).
