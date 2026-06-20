import type { XMLDocument } from 'libxmljs'
import type {
  FACTURX_SCHEMA_TYPE,
  ORDERX_SCHEMA_TYPE,
} from './constants'

import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import {
  FACTURX_SCHEMA,
  ORDERX_SCHEMA,
} from './constants'
import { resolveXml } from './resolve'

const _cache = {} as Record<string, Record<string, XMLDocument>>

export async function getXsd(flavor: string, level: string, cache = true): Promise<XMLDocument> {
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
export async function getFacturxXsd(level: FACTURX_SCHEMA_TYPE): Promise<XMLDocument> {
  if (!level || !(level in FACTURX_SCHEMA)) {
    throw new Error(`Unknown Factur-X level: "${level}", expected: "${Object.keys(FACTURX_SCHEMA).join('", "')}"`)
  }

  const url = resolve(join(import.meta.dirname, FACTURX_SCHEMA[level]))
  const buffer = await readFile(url)

  return await resolveXml(buffer, {
    url,
  })
}
export async function getOrderxXsd(level: ORDERX_SCHEMA_TYPE): Promise<XMLDocument> {
  if (!level || !(level in ORDERX_SCHEMA)) {
    throw new Error(`Unknown Order-X level: "${level}", expected: "${Object.keys(ORDERX_SCHEMA).join('", "')}"`)
  }

  const url = resolve(join(import.meta.dirname, ORDERX_SCHEMA[level]))
  const buffer = await readFile(url)

  return await resolveXml(buffer, {
    url,
  })
}
