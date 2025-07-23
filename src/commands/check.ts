import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { defineCommand } from 'citty'

import { check } from '../index'

export default defineCommand({
  meta: {
    name: 'check',
    description: 'Checks if a XML file is a valid Factur-X/Order-X file',
  },
  args: {
    xml: {
      type: 'positional',
      description: 'Input XML file',
      required: true,
    },
    flavor: {
      type: 'string',
      description: 'Schema flavor, autodetect by default (facturx, orderx, zugferd)',
      alias: 'f',
    },
    level: {
      type: 'string',
      description: 'Schema level, autodetect by default (orderx: basic, extended, comfort) (facturx: basic, basicwl, en16931, extended, minimum)',
      alias: 'l',
    },
  },
  run: async (args) => {
    const xml = await readFile(resolve(args.args.xml), 'utf8')
    const options = {
      xml,
      flavor: args.args.flavor,
      level: args.args.level,
    }
    const result = await check(options)

    if (!result.valid) {
      console.error(`Invalid XML format (${result.flavor} - ${result.level}):`)

      for (const error of result.errors) {
        console.error(error.message)
      }

      process.exit(1)
    }

    // eslint-disable-next-line no-console
    console.log(`Valid XML format (${result.flavor} - ${result.level})`)
  },
})
