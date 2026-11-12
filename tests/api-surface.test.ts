import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as api from '@stafyniaksacha/facturx'
import * as models from '@stafyniaksacha/facturx/models'
import { describe, expect, it } from 'vitest'

// Backward compatibility: the runtime surface of the last release must still exist. Additions are
// fine; a removal or rename needs the old name kept as a deprecated alias instead (AGENTS.md).
// The baseline is generated from the released package, never edited to make this test pass.
const baseline: { index: string[], models: Record<string, string[] | null> } = JSON.parse(
  readFileSync(resolve(import.meta.dirname, 'fixtures/api-surface-0.6.1.json'), 'utf8'),
)

function modelSurface(): Record<string, string[] | null> {
  const out: Record<string, string[] | null> = {}
  const walk = (obj: Record<string, unknown>, path: string): void => {
    for (const key of Object.keys(obj)) {
      const value = obj[key]
      if (typeof value === 'function') {
        try {
          out[path + key] = Object.keys(new (value as new (init: object) => object)({}))
        }
        catch {
          out[path + key] = null
        }
      }
      else if (value && typeof value === 'object') {
        walk(value as Record<string, unknown>, `${path}${key}.`)
      }
    }
  }
  walk(models as unknown as Record<string, unknown>, '')
  return out
}

describe('public API surface (backward compatibility with 0.6.1)', () => {
  it('keeps every export of the package entry point', () => {
    expect(Object.keys(api)).toEqual(expect.arrayContaining(baseline.index))
  })

  const current = modelSurface()
  it.each(Object.entries(baseline.models))('keeps model %s and its properties', (name, props) => {
    expect(Object.keys(current)).toContain(name)
    if (props)
      expect(current[name] ?? []).toEqual(expect.arrayContaining(props))
  })
})
