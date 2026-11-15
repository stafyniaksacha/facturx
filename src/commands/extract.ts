import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { defineCommand } from 'citty'

import { extract } from '../index'

export default defineCommand({
  meta: {
    name: 'extract',
    description: 'Extracts the Factur-X/Order-X XML file from a PDF',
  },
  args: {
    pdf: {
      type: 'positional',
      description: 'Input PDF file',
      required: true,
    },
    check: {
      type: 'boolean',
      description: 'Validate the XML file',
      default: true,
    },
    flavor: {
      type: 'string',
      description: 'Schema flavor, autodetect by default (facturx, orderx, zugferd)',
      alias: 'f',
    },
    level: {
      type: 'string',
      description: 'Schema level, autodetect by default (orderx: basic, extended, comfort) (facturx: basic, basicwl, en16931, extended, minimum, extended-ctc-fr)',
      alias: 'l',
    },
    output: {
      type: 'string',
      description: 'Output XML file, defaults to stdout',
      alias: 'o',
    },
    raw: {
      type: 'boolean',
      description: 'Write the attachment bytes exactly as embedded instead of the re-serialized XML',
      default: false,
    },
  },
  run: async (args) => {
    const pdf = await readFile(resolve(args.args.pdf))

    const result = await extract({
      pdf,
      flavor: args.args.flavor,
      level: args.args.level,
      check: args.args.check,
    })
    const xml = args.args.raw ? result.bytes : result.xml

    if (args.args.output) {
      const out = resolve(args.args.output)
      await writeFile(out, xml)

      // eslint-disable-next-line no-console
      console.log(`Saved to ${out}`)
    }
    else {
      // write to stdout
      process.stdout.write(xml)
    }
  },
})
