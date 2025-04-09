import type { XMLDocument } from 'libxmljs'

import type { Buffer } from 'node:buffer'

import { resolveXml } from './resolve'
import { getFlavor, getLevel } from './xml'
import { getXsd } from './xsd'

export async function check(options: {
  xml: string | Buffer | XMLDocument
  flavor?: string
  level?: string
}): Promise<{
    valid: boolean
    errors: any[]
    flavor: string
    level: string
  }> {
  const xml = await resolveXml(options.xml)

  const flavor = options.flavor || getFlavor(xml)
  const level = options.level || getLevel(xml)

  const xsd = await getXsd(flavor, level)

  const valid = xml.validate(xsd) as boolean

  const errors = xml.validationErrors

  return {
    valid,
    errors,
    flavor,
    level,
  }
}
