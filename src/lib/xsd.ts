import type { XmlDocument } from 'libxml2-wasm'
import type {
  FACTURX_SCHEMA_TYPE,
  ORDERX_SCHEMA_TYPE,
  UBL_ROOT,
} from './constants'

import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { xmlRegisterInputProvider } from 'libxml2-wasm'
import {
  FACTURX_SCHEMA,
  ORDERX_SCHEMA,
  UBL_LEVELS,
  UBL_SCHEMA,
} from './constants'
import { fileInputProvider } from './input-provider'
import { resolveXml } from './resolve'

xmlRegisterInputProvider(fileInputProvider)

const _cache = {} as Record<string, Record<string, XmlDocument>>

export async function getXsd(flavor: string, level: string, cache = true, root?: UBL_ROOT): Promise<XmlDocument> {
  // Both UBL levels share one XSD per root element: the root is part of the key, and required.
  if (flavor === 'ubl') {
    if (!root)
      throw new Error('The UBL schema depends on the root element: pass "Invoice" or "CreditNote"')
    if (!(UBL_LEVELS as readonly string[]).includes(level))
      throw new Error(`Unknown UBL level: "${level}", expected: "${UBL_LEVELS.join('", "')}"`)
    const key = `${level}/${root}`
    if (cache && _cache.ubl?.[key])
      return _cache.ubl[key]
    const schema = await getUblXsd(root)
    if (cache) {
      _cache.ubl ||= {}
      _cache.ubl[key] = schema
    }
    return schema
  }

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
export async function getFacturxXsd(level: FACTURX_SCHEMA_TYPE): Promise<XmlDocument> {
  if (!level || !(level in FACTURX_SCHEMA)) {
    throw new Error(`Unknown Factur-X level: "${level}", expected: "${Object.keys(FACTURX_SCHEMA).join('", "')}"`)
  }

  const url = resolve(join(import.meta.dirname, FACTURX_SCHEMA[level]))
  const buffer = await readFile(url)

  return await resolveXml(buffer, {
    url,
  })
}
export async function getOrderxXsd(level: ORDERX_SCHEMA_TYPE): Promise<XmlDocument> {
  if (!level || !(level in ORDERX_SCHEMA)) {
    throw new Error(`Unknown Order-X level: "${level}", expected: "${Object.keys(ORDERX_SCHEMA).join('", "')}"`)
  }

  const url = resolve(join(import.meta.dirname, ORDERX_SCHEMA[level]))
  const buffer = await readFile(url)

  return await resolveXml(buffer, {
    url,
  })
}
export async function getUblXsd(root: UBL_ROOT): Promise<XmlDocument> {
  if (!root || !(root in UBL_SCHEMA)) {
    throw new Error(`Unknown UBL root element: "${root}", expected: "${Object.keys(UBL_SCHEMA).join('", "')}"`)
  }

  const url = resolve(join(import.meta.dirname, UBL_SCHEMA[root]))
  const buffer = await readFile(url)

  return await resolveXml(buffer, {
    url,
  })
}
