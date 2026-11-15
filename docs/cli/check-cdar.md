# `check-cdar`

Validate a French lifecycle status message (CDAR D22B) against the "uncoupled" CDAR **XSD** and the
**`BR-FR-CDV`** rules of XP Z12-012 v1.4.0. See [`validateCdar()`](/api/validate-cdar).

## Synopsis

```bash
facturx check-cdar <xml> [options]
```

## Arguments

| Argument | Required | Description |
| --- | --- | --- |
| `xml` | yes | Input CDAR XML file (positional). |

## Options

| Option | Alias | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `--warnings-as-errors` | `-W` | boolean | `false` | Fail on rules flagged `warning` too. Warnings are always printed. |

## Behaviour

- Prints `Valid CDAR lifecycle message (XSD + BR-FR-CDV)` and exits 0 when the message is valid.
- Otherwise prints each XSD error and each failed rule (`[BR-FR-CDV] <assert id>: <message>`) and
  exits 1. A file that is not a CDAR message exits 1 with `Not a CDAR lifecycle message`.
