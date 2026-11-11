import type { SchematronError } from '../index'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

import { defineCommand } from 'citty'
import { check } from '../index'

// BR-FR messages don't always name their rule (it lives in the assert @id), so print it first.
function formatFrCtc(error: SchematronError): string {
  return `${error.assertId ?? error.id ?? '?'}: ${error.message}`
}

export default defineCommand({
  meta: {
    name: 'check',
    description: 'Checks if a XML file is a valid Factur-X/Order-X file',
  },
  args: {
    'xml': {
      type: 'positional',
      description: 'Input XML file',
      required: true,
    },
    'flavor': {
      type: 'string',
      description: 'Schema flavor, autodetect by default (facturx, orderx, zugferd)',
      alias: 'f',
    },
    'level': {
      type: 'string',
      description: 'Schema level, autodetect by default (orderx: basic, extended, comfort) (facturx: basic, basicwl, en16931, extended, minimum)',
      alias: 'l',
    },
    'schematron': {
      type: 'boolean',
      description: 'Also run Schematron business-rule validation (EN 16931 BR-*, Factur-X only)',
      alias: 's',
      default: false,
    },
    'fr-ctc': {
      type: 'boolean',
      description: 'Also run the French CTC business rules BR-FR-Flux2 (XP Z12-012 v1.4.0; Factur-X BASIC WL, EN16931, EXTENDED). Combine with --schematron for the full validation sequence',
      default: false,
    },
    'warnings-as-errors': {
      type: 'boolean',
      description: 'With --schematron/--fr-ctc, fail on rules flagged warning/information too (warnings are always printed)',
      alias: 'W',
      default: false,
    },
  },
  run: async (args) => {
    const xml = await readFile(resolve(args.args.xml), 'utf8')

    let result: Awaited<ReturnType<typeof check>>
    try {
      result = await check({
        xml,
        flavor: args.args.flavor,
        level: args.args.level,
        schematron: args.args.schematron,
        frCtc: args.args['fr-ctc'],
        warningsAsErrors: args.args['warnings-as-errors'],
      })
    }
    catch (error) {
      console.error((error as Error).message)
      process.exit(1)
    }

    const mode = ['XSD', args.args.schematron && 'Schematron', args.args['fr-ctc'] && 'BR-FR'].filter(Boolean).join(' + ')

    // Warnings are reported whatever the outcome; with -W they are also counted as errors.
    if (!args.args['warnings-as-errors']) {
      for (const warning of result.schematronWarnings ?? []) {
        console.warn(`  [Schematron warning] ${warning.message}`)
      }
      for (const warning of result.frCtcWarnings ?? []) {
        console.warn(`  [BR-FR warning] ${formatFrCtc(warning)}`)
      }
    }

    if (!result.valid) {
      console.error(`Invalid XML format (${result.flavor} - ${result.level}, ${mode}):`)

      for (const error of result.errors) {
        console.error(`  [XSD] ${error.message}`)
      }

      for (const error of result.schematronErrors ?? []) {
        console.error(`  [Schematron] ${error.message}`)
      }

      for (const error of result.frCtcErrors ?? []) {
        console.error(`  [BR-FR] ${formatFrCtc(error)}`)
      }

      process.exit(1)
    }

    // eslint-disable-next-line no-console
    console.log(`Valid XML format (${result.flavor} - ${result.level}, ${mode})`)
  },
})
