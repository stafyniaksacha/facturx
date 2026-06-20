# `check`

Validate an XML invoice against the official **XSD**, and optionally the EN 16931 **Schematron**
business rules.

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
| `--flavor` | `-f` | string | autodetect | `facturx`, `orderx` or `zugferd`. |
| `--level` | `-l` | string | autodetect | Schema level (e.g. `en16931`). |
| `--schematron` | `-s` | boolean | `false` | Also run Schematron (EN 16931 `BR-*`) validation. **Factur-X only.** |

## Behaviour

- Runs **XSD** structural validation against the detected (or supplied) flavor and level.
- With `--schematron` / `-s`, additionally runs the EN 16931 business-rule and code-list checks.
  This is **Factur-X only** — using it on another flavor throws (see [Validation](/guide/validation)).
- **Output:**
  - Valid → prints `Valid XML format (<flavor> - <level>, <mode>)` where *mode* is `XSD` or
    `XSD + Schematron`.
  - Invalid → prints each error to stderr, prefixed with `[XSD]` or `[Schematron]`, and exits with
    code **`1`**.

This non-zero exit code makes `check` easy to use in CI pipelines and shell scripts.

## Examples

```bash
# Autodetect flavor/level, XSD only
npx @stafyniaksacha/facturx check factur-x.xml

# Full EN 16931 validation (structure + business rules)
npx @stafyniaksacha/facturx check factur-x.xml --schematron # [!code highlight]

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
