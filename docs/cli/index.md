# CLI reference

Installing `@stafyniaksacha/facturx` exposes a `facturx` command. You can also run it without
installing, via your package runner.

## Invocation

::: code-group

```bash [npx]
npx @stafyniaksacha/facturx <command> [options]
```

```bash [pnpm]
pnpm dlx @stafyniaksacha/facturx <command> [options]
```

```bash [bun]
bunx @stafyniaksacha/facturx <command> [options]
```

```bash [installed]
# when the package is a dependency of your project
facturx <command> [options]
```

:::

## Commands

| Command | Purpose |
| --- | --- |
| [`generate`](/cli/generate) | Embed an XML into a PDF to produce a Factur-X / Order-X PDF/A-3. |
| [`extract`](/cli/extract) | Extract the embedded XML from a PDF/A-3. |
| [`check`](/cli/check) | Validate an XML invoice against the XSD (and optionally Schematron). |

## Global options

| Option | Description |
| --- | --- |
| `--help`, `-h` | Show help for the CLI or a specific command. |
| `--version` | Print the installed version. |

```bash
npx @stafyniaksacha/facturx --help
npx @stafyniaksacha/facturx generate --help
npx @stafyniaksacha/facturx --version
```

## Common options

Several options are shared across commands and behave identically everywhere:

| Option | Alias | Description |
| --- | --- | --- |
| `--flavor` | `-f` | Schema flavor: `facturx`, `orderx`, `zugferd`. Autodetected from the XML if omitted. |
| `--level` | `-l` | Schema level (e.g. `en16931`). Autodetected from the XML if omitted. |
| `--output` | `-o` | Output file path. |
| `--check` | | Run XSD validation (default `true`; pass `--no-check` to skip). |

See [Profiles & flavors](/guide/profiles-and-flavors) for the valid `flavor` / `level` combinations.
