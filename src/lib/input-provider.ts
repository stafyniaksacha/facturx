import type { XmlInputProvider } from 'libxml2-wasm'
import { closeSync, existsSync, openSync, readSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Map a location libxml2 asks to open (e.g. an `xs:import` resolved against
 * the importing schema) to a local file path, or `undefined` if it is not one.
 *
 * Replaces libxml2-wasm's `xmlRegisterFsInputProviders`, which parses Windows
 * paths such as `D:/xsd/a.xsd` as URLs with the scheme `d:` and refuses them
 * (breaking every XSD import on Windows), and does not percent-decode `file:`
 * URLs.
 */
export function toFilePath(location: string): string | undefined {
  if (location.startsWith('file:')) {
    try {
      return fileURLToPath(location)
    }
    catch {
      return undefined
    }
  }
  // Any other URL scheme (http:, …) is not ours. A single letter is a drive.
  if (/^[a-z][a-z\d+.-]+:/i.test(location))
    return undefined
  return location
}

export const fileInputProvider: XmlInputProvider = {
  match(location) {
    const path = toFilePath(location)
    return path !== undefined && existsSync(path)
  },
  open(location) {
    const path = toFilePath(location)
    if (path === undefined)
      return undefined
    try {
      return openSync(path, 'r')
    }
    catch {
      return undefined
    }
  },
  read(fd, buf) {
    try {
      return readSync(fd, buf, 0, buf.byteLength, null)
    }
    catch {
      return -1
    }
  },
  close(fd) {
    try {
      closeSync(fd)
    }
    catch {
      // nothing left to release
    }
    return true
  },
}
