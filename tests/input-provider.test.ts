import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
// Internal module: the Windows failure it guards against only shows up on a
// Windows host, so the path mapping is pinned here for every platform.
import { toFilePath } from '../src/lib/input-provider'

describe('toFilePath', () => {
  it('keeps POSIX paths, including spaces', () => {
    expect(toFilePath('/srv/my app/xsd/a.xsd')).toBe('/srv/my app/xsd/a.xsd')
  })

  it('keeps Windows drive paths (not a `d:` URL scheme)', () => {
    expect(toFilePath('D:/a/_temp/xsd/a.xsd')).toBe('D:/a/_temp/xsd/a.xsd')
    expect(toFilePath('C:\\Users\\Jane Doe\\xsd\\a.xsd')).toBe('C:\\Users\\Jane Doe\\xsd\\a.xsd')
  })

  it('keeps relative paths', () => {
    expect(toFilePath('a.xsd')).toBe('a.xsd')
    expect(toFilePath('../common/b.xsd')).toBe('../common/b.xsd')
  })

  it('decodes file: URLs', () => {
    const path = resolve(join('my dir', 'a é.xsd'))
    expect(toFilePath(pathToFileURL(path).href)).toBe(path)
  })

  it('rejects other URL schemes', () => {
    expect(toFilePath('http://www.w3.org/2001/xml.xsd')).toBeUndefined()
    expect(toFilePath('https://example.com/a.xsd')).toBeUndefined()
  })
})
