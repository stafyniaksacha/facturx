# EN 16931 model

`EN16931` is a syntax-neutral invoice model. Its classes are keyed by the **business terms** of the
European standard EN 16931 (`BT-1` invoice number, `BG-4` seller, `BG-25` invoice line, …) instead of the
elements of one XML syntax, so the same object can be written to, and read from, different syntaxes.
Two syntaxes are mapped: **CII** (Factur-X and plain-CII EXTENDED-CTC-FR), through `toCii()` and `fromCii()`, and
**UBL 2.1** (`Invoice` and `CreditNote`), through `invoiceToUbl()` and `ublToInvoice()`. `en16931ToXml()` and
`xmlToEn16931()` pick the syntax for you, so converting between CII and UBL is one read and one write
([CII and UBL](#cii-and-ubl-en16931toxml-and-xmltoen16931)).

The CII classes ([`Models`](/api/models)) stay the CII API, and `invoiceToXml()` stays the only code that
writes CII XML: `toCii()` produces a CII model, and you serialize that as before.

```ts
import { EN16931, en16931ToXml, fromCii, invoiceToUbl, invoiceToXml, toCii, ublToInvoice, xmlToEn16931 } from '@stafyniaksacha/facturx'
// or from the subpath, where the classes are exported flat (no `EN16931.` prefix):
import { fromCii, Invoice, invoiceToUbl, toCii, ublToInvoice } from '@stafyniaksacha/facturx/en16931'
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
- Optional terms are `undefined` when absent. The model never invents a value; `toCii()` writes the
  Factur-X default `Project reference` for BT-11-0 when BT-11 is set without a name (CG-49), and
  `fromCii()` reads exactly that default back as no name (`projectName` `undefined`), so the CII written
  again is the same. Any other name, `Project Reference` included, is kept.
- The text of a note (BT-22 in BG-1, BT-127 on a line) is optional in the model: EN 16931 makes BT-22
  mandatory, the EXTENDED XSD and annex A EXTENDED-CTC-FR do not. `fromCii()` reads `undefined` for a note
  without text. `toCii()` refuses a note without text at `basic` and `en16931`; at `extended` and
  `extended-ctc-fr` it writes the note without `ram:Content` when it has a subject code, and refuses a note
  with neither text nor subject code (it would write an empty `ram:IncludedNote`: at `extended` that avoids
  PEPPOL-EN16931-R008, at `extended-ctc-fr` it is a deliberate choice, stricter than that level's Schematron), except that Factur-X EXTENDED wants the text
  with a subject code (BR-FXEXT-01 / -02, CG-57), so a subject code alone needs `extended-ctc-fr`.
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
second. At the `extended` levels a group or information line (annex B UC10 to UC13) may have no price, quantity or VAT (CG-54);
a detail line may not (below).

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

- a mandatory term is empty or missing (a string of only XML whitespace, that is space, tab, CR or LF, counts
  as empty, as `normalize-space()` does in the Schematron; a no-break space does not): BT-1, BT-2, BT-3, BT-5, the seller (BG-4) and buyer (BG-7) with their
  names, postal addresses and country codes, the totals, the VAT breakdown, the lines and their mandatory
  terms. Below `extended`, a line needs its price (BG-29), quantity (BT-129) and VAT (BG-30). At `extended` and
  `extended-ctc-fr`, so does a line whose subtype EXT-FR-FE-163 is `DETAIL` or unset, with a VAT category code
  (BT-151): BR-FXEXT-BR-26 / -BR-22 / -CO-04 and BR-FREXT-BR-26 / -BR-22 / -CO-04. A `GROUP` or `INFORMATION`
  line may go without them;
- the invoice holds a term the level cannot carry: a term missing from the Factur-X BASIC matrix needs
  `en16931`, and an `EXT-FR-FE-*` field needs `extended` or `extended-ctc-fr`. A BASIC invoice with
  `EXT-FR-FE-12` set is an error, not a silent drop;
- BT-24 (`specificationIdentifier`) is set to anything but the exact identifier of the level (another level's
  id, an Order-X id or a CIUS identifier would make the document claim a profile it was not checked against).
  Leave it unset, or set it to `''`, to get the identifier of the level;
- a mandatory term of a group is empty: BT-25 in a preceding invoice reference (BR-55), BT-122 in a supporting
  document (BR-52), BT-125-1 (MIME code) and BT-125-2 (filename) of an attached document, BT-22 in a note and
  BT-127 in a line note at `basic` and `en16931` (at `extended`, with a subject code: BR-FXEXT-01 / -02), BT-84
  in a credit transfer (BR-50: an IBAN, or a national account number, BT-84-0; stricter than the vendored
  Schematron, which checks it only for payment means 30 and 58, CG-58), a note (BG-1 or a line note) with
  neither text nor subject code at `extended` and `extended-ctc-fr`,
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
name other than the CII default (BT-11-0), or a BT-24 that is the identifier of another syntax or level. The UBL
writer's list is in [UBL 2.1](#ubl-invoicetoubl-and-ubltoinvoice).

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

## UBL: `invoiceToUbl()` and `ublToInvoice()`

UBL is **XML only**. A Factur-X PDF carries CII, so a UBL invoice cannot be embedded in one: `generate()` refuses it
and `extract({ check: true })` refuses a UBL attachment. `check()` validates UBL documents
([UBL invoices](/guide/validation#ubl-invoices)).

### CII and UBL: `en16931ToXml()` and `xmlToEn16931()`

```ts
function en16931ToXml(invoice: Invoice, options:
  | { syntax: 'cii', level: En16931Level }
  | { syntax: 'ubl', level: 'en16931' | 'extended-ctc-fr', root?: 'Invoice' | 'CreditNote' }): Promise<XmlDocument>
function xmlToEn16931(xml: string | Buffer | XmlDocument): Promise<{ invoice: Invoice, dropped: string[], syntax: 'cii' | 'ubl' }>
```

`en16931ToXml()` is `invoiceToXml(toCii(invoice, { level }))` for `cii` and `invoiceToUbl(invoice, { level, root })`
for `ubl`, which accepts `en16931` and `extended-ctc-fr` only (the options type says so; another level also throws
at runtime, naming the two). `xmlToEn16931()` reads the root element: a Factur-X / EXTENDED-CTC-FR CII invoice goes
through `fromCii(await xmlToInvoice(xml))` (MINIMUM and BASIC WL still throw), a UBL invoice through `ublToInvoice()`;
Order-X, ZUGFeRD 1.0, CDAR and anything else throw, and so does a document with a DOCTYPE, in either syntax. An
`XmlDocument` you pass is never disposed. Converting a CII invoice to UBL:

<<< ../../examples/ubl.ts#main{ts}

#### Converting CII to UBL: `dropUblUncarried()`

A CII invoice read from Factur-X often holds values UBL has no place for, which `invoiceToUbl()` refuses. The example
above passes them through `dropUblUncarried(invoice, { level })` first. It is a separate, explicit call: it returns a
deep copy without those values (the input is never modified) and `dropped`, the model path of each one, so you can
see what the UBL document will not hold. It changes only these:

- reset (UBL has a place for it): BT-24 (specification identifier) when it is set and is not the UBL id of `level`
  is set to that id, and `.specificationIdentifier` is listed;
- removed because UBL has no place for them: BT-11-0 (project name) other than the Factur-X default
  `Project reference` (CG-59), BT-41-0 / BT-56-0 (seller / buyer contact department name, CG-59), BG-18 (payment card,
  CG-61), EXT-FR-FE-184 (line grand total, CG-60) on every line;
- removed because they are not an EN 16931 term (the writer refuses them through the party check it shares with
  `toCii()`): the department name of the seller agent, billing party, buyer agent, invoicee, payee and payer contacts.

Anything else `invoiceToUbl()` refuses still throws: an EXTENDED-CTC-FR term at `en16931` (choose
`extended-ctc-fr`), a term without the identifier its UBL element needs, an *Amount* with more than two decimals. On
every official CII invoice the model reads (64 documents (34 Factur-X PDFs and 30 annex B PDFs and commented XML files, several of the same invoice)), `dropUblUncarried()` then `invoiceToUbl()` gives UBL that passes
the UBL 2.1 XSD and the level Schematron, at `en16931` for BASIC / EN 16931 sources and `extended-ctc-fr` for EXTENDED
and EXTENDED-CTC-FR sources. That proof covers the XSD and the level Schematron only, a BT-24 reset to
`extended-ctc-fr` included, not the French BR-FR rules, which the writer does not gate: run
`check({ xml, schematron: true, frCtc: true })` on the result.

The per-syntax functions:

```ts
import { invoiceToUbl, ublToInvoice } from '@stafyniaksacha/facturx'

const doc = await invoiceToUbl(invoice, { level: 'en16931' }) // or 'extended-ctc-fr'
const xml = doc.toString()
doc.dispose()

const { invoice: read, dropped } = await ublToInvoice(xml) // string, Buffer or XmlDocument
```

### Writing: `invoiceToUbl(invoice, { level, root? })`

- `level` is `en16931` (`cbc:CustomizationID` `urn:cen.eu:en16931:2017`) or `extended-ctc-fr`
  (`urn:cen.eu:en16931:2017#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr`), the two levels with a UBL binding.
- The root is a `CreditNote` (`cbc:CreditNoteTypeCode`) when BT-3 is in the credit note list of BR-CL-01 (`81`,
  `83`, `261`, `262`, `296`, `308`, `381`, `396`, `420`, `458`, `502`, `503`, `532`), otherwise an `Invoice`.
  `root: 'Invoice' | 'CreditNote'` overrides it, and BT-3 must then be in the BR-CL-01 list of that root.
- It returns a libxml2-wasm `XmlDocument`, like `invoiceToXml()`: serialise it with `.toString()` and `dispose()` it.
  Its nodes carry the UBL namespaces, so namespace-bound XPath works on it, as on the CII writer's document.
- Dates are ISO `YYYY-MM-DD`, Amounts carry `currencyID` and have at most two decimals, unit prices and quantities
  are written unrounded without exponent notation, as in CII.
- Each credit transfer (BG-17) gets its own `cac:PaymentMeans` with the same BT-81 / BT-83. BT-82, the direct debit
  mandate (BG-19) and, in a `CreditNote`, the due date BT-9 sit in the first one. UBL has one account id, so BT-84-0
  (a national account number) is written in `cac:PayeeFinancialAccount/cbc:ID` when BT-84 is absent (CG-64).

The writer runs every check of `toCii()` that is not specific to CII (mandatory terms, BR-DEC Amount decimals, dates,
the plain-object guards ...) and the `EXT-FR-FE` level gate. It gates what the UBL 2.1 XSD and the level Schematron
(EN16931-UBL, EXTENDED-CTC-FR-UBL) would reject, **not** the opt-in French rules (BR-FR): validate its output with
`check({ xml, schematron: true, frCtc: true })`. In particular a schemeless identifier is written as given (BT-29,
BT-46, BT-60, BT-71, and the line deliver-to identifier EXT-FR-FE-146 without its scheme EXT-FR-FE-148): CII and the
UBL level Schematrons accept it, but the UBL BR-FR-CO-10 wants a `@schemeID` on each of them and rejects it (CG-63).
It also **throws, naming the term** (never quoting invoice content), on what UBL cannot carry or would read back
differently:

| Refused | Why | Register |
| --- | --- | --- |
| BT-41-0 / BT-56-0 (seller / buyer contact department name), BT-11-0 (project name) other than the CII default | no UBL element | CG-59 |
| EXT-FR-FE-184 (line grand total), a second EXT-FR-FE-146 (line deliver-to identifier) | no UBL element, one `cac:DeliveryLocation/cbc:ID` | CG-60 |
| BG-18 (payment card) | UBL requires the card network id (BT-87-1), which EN 16931 does not have | CG-61 |
| a BT-149-1 / BT-150-1 (gross price base quantity) that differs from BT-149 / BT-150 | one `cbc:BaseQuantity` | CG-62 |
| BT-14 without BT-13, EXT-FR-FE-144 without EXT-FR-FE-135 and similar | the UBL element needs its identifier | CG-65 |
| a missing BT-110 (VAT total) | UBL holds BG-23 in the `cac:TaxTotal` whose amount is BT-110 | CG-66 |
| EXT-FR-FE-180 without a line period | BR-CO-20 | CG-68 |
| at `extended-ctc-fr`, a `DETAIL` (or unset EXT-FR-FE-163) line without BG-29, BT-129, BG-30 or BT-151 (the check `toCii()` shares) | BR-26, BR-FREXT-22, BR-FREXT-CO-04 | CG-69 |
| an `EXT-FR-FE` term, or more than one BT-18, BT-46 or BT-60, at `en16931` | UBL-CR-*, UBL-SR-04 / -16 / -20 | |
| BT-24 other than the `cbc:CustomizationID` of `level` (a Factur-X id, a CIUS id) | the document would claim a profile it was not checked against; clear it (`undefined`) to get the level's id | |
| BT-84 and BT-84-0 together, BT-105 and BT-177, BT-145 and BT-193 | two terms in one UBL element | CG-64 (BT-84) |
| a note that would read back differently (see below) | `cbc:Note` holds the subject code | CG-70 |
| a BT-29 or BT-60 identifier with the scheme `SEPA` | UBL marks BT-90 (bank assigned creditor id) with that scheme (UBL-SR-29); it would read back as BT-90 | |
| the payer (EXT-FR-FE-BG-02), or the BT-9 of a `CreditNote`, without BG-16 (payment instructions) | UBL writes them in `cac:PaymentMeans` | |
| EXT-FR-FE-BG-06 (preceding invoice reference of the line) more than twice | annex A `0..2` | |
| an EXT-FR-FE-136 (line preceding invoice reference) that is blank, or equal to BT-1 | UBL keeps the BT-1 reference for the line status (EXT-FR-FE-163) | |

**Notes.** UBL has no element for a note subject code: it is written at the start of `cbc:Note` as `#code#text`, the
French convention of annex A, for BT-21 (invoice note) and, at `extended-ctc-fr`, EXT-FR-FE-183 (line note). The
writer refuses a subject code that is empty or contains `#`, and a note text that starts with `#…#` without a
subject code, since it would read back as one. At `en16931` EN 16931 has no line note subject code, so a line note is
written and read verbatim, `#…#` included (CG-70, a provisional reading of a contradiction in annex A).

### Reading: `ublToInvoice(xml)`

`ublToInvoice()` reads a UBL 2.1 `Invoice` or `CreditNote` whose `cbc:CustomizationID` is EN 16931 (or a
`#compliant#` CIUS of it, read as EN 16931) or EXTENDED-CTC-FR, and returns `{ invoice, dropped }`.

`dropped` follows the contract of `fromCii()`: it lists the path of **every value in the source with no equal
counterpart once the invoice is written back as UBL** (`/Invoice/cbc:IssueTime`,
`/Invoice/cac:PaymentMeans/cac:CardAccount/cbc:NetworkID`), positions only, never the values. An index `[n]`
appears on a name the source repeats under one parent. Siblings are paired by exact equality first, then by
position. What the model holds once lands in `dropped` when the source repeats it: a second `cac:Delivery` (CG-50),
a `cac:PaymentMeans` whose BT-81 or BT-83 differs from the first (CG-51).

Two limits of that contract:

- The write-back used for the difference skips every check of `invoiceToUbl()`. A value the model holds is not in
  `dropped`, even when the level cannot carry it (an EXTENDED-CTC-FR term in an `en16931` document, a card,
  a CIUS BT-24): it stays in the invoice and `invoiceToUbl()` throws on it later. An empty `dropped` does not mean
  `invoiceToUbl()` accepts the invoice: a level it cannot carry, a CIUS BT-24 or a card (BG-18) stay in the model
  and are refused only when written.
- `dropped` can over-report: a source with a payee may carry BT-90 (SEPA creditor id) on the seller; the model
  keeps it, and the writer puts it with the payee, so the seller-side identifier is listed although its value is
  kept (CG-72). Over-reporting is preferred to a silent loss.

An `XmlDocument` you pass stays yours: `ublToInvoice()` never disposes it.

**Security.** `ublToInvoice()`, `xmlToInvoice()` (and so `fromCii(await xmlToInvoice(xml))`) and `xmlToEn16931()`
refuse any document with a DOCTYPE: invoices never use one, and an entity could hide or replace content the reader would
then miss. The check is fail-closed: before the root element only comments are accepted, so a processing instruction
there is refused too. `check()` reports such a document as invalid instead of throwing. No path expands external
entities. Errors never quote text
content; a malformed input passes libxml2's parse error through, which can name elements.

### What is proven for UBL

- The 12 UBL documents of XP Z12-012 annex B (6 at EN 16931, 6 at EXTENDED-CTC-FR) are read, written back and read
  again into the same model with nothing dropped (UC10's card is refused by the writer, and the source's network id
  is in `dropped`, CG-61), and the written UBL
  passes the three validation steps (UBL 2.1 XSD, the level Schematron, BR-FR) with the source's own warnings.
- The model read from each annex B UBL document equals the model read from its CII twin, but for a listed set of
  differences between the two publications (`KNOWN_DIFFERENCES` in `tests/ubl-cross-syntax.test.ts`, each a
  `CONFORMANCE.md` entry: department names, line grand totals, the UC10 card, F202500001 content), after two
  normalisations of the CII side: a BT-149-1 / BT-150-1 equal to BT-149 / BT-150 is cleared (UBL holds one base
  quantity, CG-62), and the schemeless BT-29 / BT-71 the F202500001 UBL twins leave out are removed (CG-63).
- Each CII twin converts to UBL and back to the same invoice once the refused terms above are cleared, except that a
  gross price base quantity (BT-149-1 / BT-150-1) equal to BT-149 / BT-150 reads back absent (CG-62).

```bash
pnpm build && pnpm vitest run tests/ubl-writer.test.ts tests/ubl-reader.test.ts tests/ubl-cross-syntax.test.ts
```

## What is proven for CII

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

- UBL at `basic` and `extended`: UBL has a binding for EN 16931 and EXTENDED-CTC-FR only, so `invoiceToUbl()` writes
  those two levels.
- CIUS rule sets (Peppol BIS, XRechnung): `ublToInvoice()` reads a `#compliant#` EN 16931 invoice as EN 16931, and
  `invoiceToUbl()` writes only the plain EN 16931 or EXTENDED-CTC-FR identifier.
