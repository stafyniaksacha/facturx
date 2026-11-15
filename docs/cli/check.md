# `check`

Validate an XML invoice against the Factur-X **XSD** (official 1.09 for MINIMUM/BASIC, FNFE-MPE 1.09.2.fixFR04 for BASIC WL/EN 16931/EXTENDED), or a **UBL 2.1** invoice or credit note against the UBL 2.1 XSD, and optionally the EN 16931 **Schematron**
business rules and the French `BR-FR` rules.

## Synopsis

```bash
facturx check <xml> [options]
```

## Arguments

| Argument | Required | Description |
| --- | --- | --- |
| `xml` | yes | Input XML file (positional). |

## Options

| Option | Alias | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `--flavor` | `-f` | string | autodetect | `facturx`, `orderx`, `zugferd` or `ubl`. |
| `--level` | `-l` | string | autodetect | Schema level (e.g. `en16931`). For `ubl`: `en16931` or `extended-ctc-fr`, read from `cbc:CustomizationID`. |
| `--schematron` | `-s` | boolean | `false` | Also run Schematron (EN 16931 `BR-*`) validation. **Factur-X and UBL**; Order-X has no Schematron. |
| `--fr-ctc` | | boolean | `false` | Also run the French e-invoicing rules `BR-FR-Flux2` ([guide](/guide/french-ctc)). **Factur-X BASIC WL, EN16931 and EXTENDED, plain-CII EXTENDED-CTC-FR, and UBL (EN16931, EXTENDED-CTC-FR), only.** Combine with `--schematron` for the full validation sequence. |
| `--warnings-as-errors` | `-W` | boolean | `false` | With `--schematron` or `--fr-ctc`, also fail on rules flagged `warning`/`information`. Without it, those are printed as `[Schematron warning]` / `[BR-FR warning]` and don't change the exit code. |

## Behaviour

- Runs **XSD** structural validation against the detected (or supplied) flavor and level.
- With `--schematron` / `-s`, additionally runs the EN 16931 business-rule and code-list checks.
  This works for **Factur-X and UBL**; Order-X has no Schematron, so using it there throws (see [Validation](/guide/validation)). For UBL it runs the EN 16931 UBL Schematron, or the EXTENDED-CTC-FR UBL one when `cbc:CustomizationID` declares that extension. CIUS rules such as Peppol BIS are **not** run.
- **Output:**
  - Valid → prints `Valid XML format (<flavor> - <level>, <mode>)` where *mode* is `XSD` or
    `XSD + Schematron`, with ` + BR-FR` appended when `--fr-ctc` is set.
  - Invalid → prints each error to stderr, prefixed with `[XSD]`, `[Schematron]` or
    `[BR-FR] <assert id>:`, and exits with code **`1`**. BR-FR messages are in French and may quote
    invoice data: mind where this output goes.
  - `--fr-ctc` on MINIMUM, BASIC, Order-X or a UBL file outside the EN16931 / EXTENDED-CTC-FR levels prints why and exits with code **`1`**.
  - Schematron rules flagged `warning`/`information` are printed to stderr as
    `[Schematron warning]` without changing the exit code, even when the document is valid. With
    `--warnings-as-errors` / `-W` they are listed as `[Schematron]` / `[BR-FR]` errors and make the command fail.

This non-zero exit code makes `check` easy to use in CI pipelines and shell scripts.

## Examples

```bash
# Autodetect flavor/level, XSD only
npx @stafyniaksacha/facturx check factur-x.xml

# Full EN 16931 validation (structure + business rules)
npx @stafyniaksacha/facturx check factur-x.xml --schematron # [!code highlight]

# A UBL 2.1 invoice: XSD, level Schematron, then the French rules
npx @stafyniaksacha/facturx check invoice-ubl.xml --schematron --fr-ctc

# Pin the flavor and level explicitly
npx @stafyniaksacha/facturx check factur-x.xml -f facturx -l en16931 -s
```

::: tip CI-friendly: everything is in the exit code
`check` exits `1` on any error, so it drops straight into a pipeline or shell script — no output
parsing required.

```bash
if npx @stafyniaksacha/facturx check factur-x.xml -s; then
  echo "compliant ✅"
else
  echo "not compliant ❌"
fi
```
:::

## See also

- SDK equivalents: [`check()`](/api/check) and [`validateSchematron()`](/api/validate-schematron)
- [Validation](/guide/validation) — XSD vs Schematron explained
