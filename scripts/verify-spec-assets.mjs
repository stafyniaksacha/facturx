#!/usr/bin/env node
/**
 * Prove that every vendored Factur-X validation asset in src/lib/xsd/facturx/
 * traces back to the official distribution committed under spec/.
 *
 * - `*.xsd` and `*_codedb.xml` must be byte-identical to the spec.
 * - `*.xslt` / `*.xsl` must be byte-identical to the spec's `_XSLT_<LEVEL>`
 *   transform once `scripts/patch-schematron-sum.mjs` is applied (the only
 *   documented local modification, see src/lib/xsd/facturx/SCHEMATRON.md).
 * - With `--sef`, each `*.sef.json.gz` is recompiled from the vendored XSLT and
 *   compared, ignoring the build timestamp, its checksum and absolute base URIs.
 *
 * Any vendored file without a spec counterpart fails the check (untraceable).
 * Order-X assets are reported as unverifiable: that spec is not vendored.
 *
 * Usage: node scripts/verify-spec-assets.mjs [--sef]
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const vendored = join(repoRoot, 'src/lib/xsd/facturx')
const specAssets = join(repoRoot, 'spec/factur-x-1.09/distribution/4. FACTUR-X_1.09_XSD_SCHEMATRON_2026-06-10')
const withSef = process.argv.includes('--sef')

const PROFILES = {
  minimum: { dir: '0. Factur-X_1.09_MINIMUM', xslt: '_XSLT_MINIMUM' },
  basicwl: { dir: '1. Factur-X_1.09_BASICWL', xslt: '_XSLT_BASICWL' },
  basic: { dir: '2. Factur-X_1.09_BASIC', xslt: '_XSLT_BASIC' },
  en16931: { dir: '3. Factur-X_1.09_EN16931', xslt: '_XSLT_EN16931' },
  extended: { dir: '4. Factur-X_1.09_EXTENDED', xslt: '_XSLT_EXTENDED' },
}

const work = mkdtempSync(join(tmpdir(), 'facturx-verify-'))
let failures = 0

function report(ok, level, file, detail = '') {
  if (!ok)
    failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${level.padEnd(8)} ${file}${detail ? `  (${detail})` : ''}`)
}

function same(a, b) {
  return readFileSync(a).equals(readFileSync(b))
}

function patchedCopy(src) {
  const tmp = join(work, `patched-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  copyFileSync(src, tmp)
  const run = spawnSync(process.execPath, [join(repoRoot, 'scripts/patch-schematron-sum.mjs'), tmp], { encoding: 'utf8' })
  if (run.status !== 0)
    throw new Error(`patch-schematron-sum failed: ${run.stderr}`)
  return tmp
}

/** Drop fields that legitimately differ between two compilations of the same XSLT. */
function normalizeSef(json) {
  return JSON.stringify(JSON.parse(json), (key, value) => {
    if (key === 'buildDateTime' || key === 'Σ')
      return undefined
    if (key === 'base' && typeof value === 'string' && value.startsWith('file://'))
      return value.slice(value.lastIndexOf('/') + 1)
    return value
  })
}

function verifySef(level, xsltFile, sefFile) {
  const out = join(work, `${level}.sef.json`)
  const run = spawnSync(process.execPath, [
    join(repoRoot, 'node_modules/xslt3/xslt3.js'),
    `-xsl:${xsltFile}`,
    `-export:${out}`,
    '-relocate:on',
    '-nogo',
  ], { encoding: 'utf8' })
  if (run.status !== 0)
    return report(false, level, sefFile, `xslt3 failed: ${run.stderr.trim()}`)
  const ok = normalizeSef(readFileSync(out, 'utf8')) === normalizeSef(gunzipSync(readFileSync(join(vendored, level, sefFile))).toString('utf8'))
  report(ok, level, sefFile, ok ? 'recompiled from vendored XSLT' : 'differs from a fresh compilation of the vendored XSLT')
}

try {
  if (!existsSync(specAssets)) {
    console.error(`Spec distribution not found at ${specAssets}`)
    process.exit(2)
  }

  for (const [level, { dir, xslt }] of Object.entries(PROFILES)) {
    const files = readdirSync(join(vendored, level)).sort()
    const xsltFile = files.find(f => /\.xslt?$/.test(f))

    for (const file of files) {
      const local = join(vendored, level, file)

      if (file.endsWith('.sef.json.gz')) {
        if (withSef && xsltFile)
          verifySef(level, join(vendored, level, xsltFile), file)
        else if (!withSef)
          console.log(`skip  ${level.padEnd(8)} ${file}  (run with --sef to recompile)`)
        else
          report(false, level, file, 'no vendored XSLT to compile it from')
        continue
      }

      const candidate = file.endsWith('.xsd')
        ? join(specAssets, dir, file)
        : join(specAssets, dir, xslt, file)

      if (!existsSync(candidate)) {
        report(false, level, file, 'no counterpart in spec/ — untraceable')
        continue
      }

      if (/\.xslt?$/.test(file)) {
        const ok = same(patchedCopy(candidate), local)
        report(ok, level, file, ok ? 'identical after sum() patch' : 'differs from spec even after sum() patch')
      }
      else {
        report(same(candidate, local), level, file)
      }
    }
  }

  console.log('note  orderx   XSDs not verifiable: the Order-X specification is not vendored under spec/')
}
finally {
  rmSync(work, { recursive: true, force: true })
}

if (failures) {
  console.error(`\n${failures} vendored asset(s) do not match the spec.`)
  process.exit(1)
}
console.log('\nAll vendored Factur-X assets match spec/factur-x-1.09.')
