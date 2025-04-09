import { readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'

import { XMLDocument } from 'libxmljs'
import {
  FACTURX_SCHEMA,
  FACTURX_SCHEMA_TYPE,
  ORDERX_SCHEMA,
  ORDERX_SCHEMA_TYPE,
} from './constants'
import { resolveXml } from './resolve'

const _cache = {} as Record<string, Record<string, XMLDocument>>

export async function getXsd(flavor: string, level: string, cache = true) {
  if (cache && flavor in _cache && level in _cache[flavor]) {
    return _cache[flavor][level]
  }

  switch (flavor) {
    case 'facturx': {
      const schema = await getFacturxXsd(level as FACTURX_SCHEMA_TYPE)
      if (cache) {
        _cache[flavor] ||= {}
        _cache[flavor][level] = schema
      }
      return schema
    }
    case 'orderx': {
      const schema = await getOrderxXsd(level as ORDERX_SCHEMA_TYPE)
      if (cache) {
        _cache[flavor] ||= {}
        _cache[flavor][level] = schema
      }
      return schema
    }
    default:
      throw new Error(`Unknown schema flavor: "${flavor}"`)
  }
}
export async function getFacturxXsd(level: FACTURX_SCHEMA_TYPE) {
  if (!level || !(level in FACTURX_SCHEMA)) {
    throw new Error(`Unknown Factur-X level: "${level}"`)
  }

  const url = resolve(join(import.meta.dirname, FACTURX_SCHEMA[level]))
  const buffer = await readFile(url)
  
  return await resolveXml(buffer, {
    url,
  })
}
export async function getOrderxXsd(level: ORDERX_SCHEMA_TYPE) {
  if (!level || !(level in ORDERX_SCHEMA)) {
    throw new Error(`Unknown Order-X level: "${level}"`)
  }

  const url = resolve(join(import.meta.dirname, ORDERX_SCHEMA[level]))
  const buffer = await readFile(url)

  return await resolveXml(buffer, {
    url,
  })
}
