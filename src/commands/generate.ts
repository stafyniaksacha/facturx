import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { defineCommand } from 'citty'

import { generate } from '../index'

export default defineCommand({
  meta: {
    name: 'generate',
    description: 'Embeds an XML file into a PDF (pass a PDF/A-3 file: it is not converted to PDF/A-3)',
  },
  args: {
    pdf: {
      type: 'string',
      description: 'Input PDF file (PDF/A-3)',
      required: true,
    },
    xml: {
      type: 'string',
      description: 'Input XML file',
      required: true,
    },
    output: {
      type: 'string',
      description: 'Output PDF file',
      required: true,
      alias: 'o',
    },
    check: {
      type: 'boolean',
      description: 'Validate the XML file',
      default: true,
    },
    flavor: {
      type: 'string',
      description: 'Schema flavor, autodetect by default (facturx, orderx; zugferd is extraction only)',
      alias: 'f',
    },
    level: {
      type: 'string',
      description: 'Schema level, autodetect by default; must match the profile the XML declares (orderx: basic, extended, comfort) (facturx: basic, basicwl, en16931, extended, minimum)',
      alias: 'l',
    },
    language: {
      type: 'string',
      description: 'Language code for the PDF (RFC 3066)',
    },
    afRelationship: {
      type: 'string',
      description: 'AFRelationship of the embedded XML: Data (default), Alternative or Source (minimum and basicwl: Data only)',
    },
    preserveXmlBytes: {
      type: 'boolean',
      description: 'Embed the XML file byte for byte instead of re-serializing it (XML 1.0, UTF-8, no DOCTYPE)',
      default: false,
    },
  },
  run: async (args) => {
    const pdf = await readFile(resolve(args.args.pdf))
    // Read as bytes when they are embedded as is, so a BOM or invalid UTF-8 is not altered by decoding.
    const xml = args.args.preserveXmlBytes
      ? await readFile(resolve(args.args.xml))
      : await readFile(resolve(args.args.xml), 'utf-8')

    const content = await generate({
      pdf,
      xml,
      flavor: args.args.flavor,
      language: args.args.language,
      level: args.args.level,
      check: args.args.check,
      afRelationship: args.args.afRelationship as 'Data' | 'Alternative' | 'Source' | undefined,
      preserveXmlBytes: args.args.preserveXmlBytes,
    })

    const out = resolve(args.args.output)
    await writeFile(out, content)

    // eslint-disable-next-line no-console
    console.log(`Saved to ${out}`)
  },
})
