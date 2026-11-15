import type { SchematronError } from '../index'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

import { defineCommand } from 'citty'
import { validateCdar } from '../index'

// BR-FR-CDV messages don't always name their rule (it lives in the assert @id), so print it first.
function format(error: SchematronError): string {
  return `${error.assertId ?? error.id ?? '?'}: ${error.message}`
}

export default defineCommand({
  meta: {
    name: 'check-cdar',
    description: 'Checks a French lifecycle status message (CDAR D22B): XSD + BR-FR-CDV rules (XP Z12-012 v1.4.0)',
  },
  args: {
    'xml': {
      type: 'positional',
      description: 'Input CDAR XML file',
      required: true,
    },
    'warnings-as-errors': {
      type: 'boolean',
      description: 'Fail on rules flagged warning too (warnings are always printed)',
      alias: 'W',
      default: false,
    },
  },
  run: async (args) => {
    const xml = await readFile(resolve(args.args.xml))

    let result: Awaited<ReturnType<typeof validateCdar>>
    try {
      result = await validateCdar({ xml, warningsAsErrors: args.args['warnings-as-errors'] })
    }
    catch (error) {
      console.error((error as Error).message)
      process.exit(1)
    }

    if (!args.args['warnings-as-errors']) {
      for (const warning of result.schematronWarnings)
        console.warn(`  [BR-FR-CDV warning] ${format(warning)}`)
    }

    if (!result.valid) {
      console.error('Invalid CDAR lifecycle message (XSD + BR-FR-CDV):')
      for (const error of result.errors)
        console.error(`  [XSD] ${error.message}`)
      for (const error of result.schematronErrors)
        console.error(`  [BR-FR-CDV] ${format(error)}`)
      process.exit(1)
    }

    // eslint-disable-next-line no-console
    console.log('Valid CDAR lifecycle message (XSD + BR-FR-CDV)')
  },
})
