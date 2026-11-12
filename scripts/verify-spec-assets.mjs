#!/usr/bin/env node
/**
 * Prove that every vendored Factur-X validation asset in src/lib/xsd/facturx/
 * traces back to an official distribution committed under spec/.
 *
 * Each vendored folder is mapped to its source in `SOURCES` below (one entry per
 * folder: which spec, which XSD dir, which XSLT dir).
 *
 * - `*.xsd` and `*_codedb.xml` must be byte-identical to the source.
 * - `*.xslt` / `*.xsl` must be byte-identical to the source transform once
 *   `scripts/patch-schematron-sum.mjs` is applied (the only documented local
 *   modification, see src/lib/xsd/facturx/SCHEMATRON.md); applying it twice
 *   must give the same bytes as applying it once.
 * - With `--sef`, each `<name>.sef.json.gz` is recompiled from the vendored
 *   `<name>.xslt` / `<name>.xsl` next to it and compared, ignoring the build
 *   timestamp, its checksum and absolute base URIs.
 *
 * Any vendored file or folder without a source counterpart fails the check
 * (untraceable). Order-X assets are reported as unverifiable: that spec is not
 * vendored.
 *
 * Usage: node scripts/verify-spec-assets.mjs [--sef]
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const vendored = join(repoRoot, 'src/lib/xsd/facturx')
const withSef = process.argv.includes('--sef')

const FX109 = 'spec/factur-x-1.09/distribution/4. FACTUR-X_1.09_XSD_SCHEMATRON_2026-06-10'
const FR04 = 'spec/fnfe-ctc-fr-1.4.0.04/distribution/Factur-X_1.09.2.fixFR04'

/**
 * Where each vendored folder comes from. To vendor another asset set, add one entry.
 * - `folder`: folder under src/lib/xsd/facturx/
 * - `spec`: human-readable spec of record (printed in the report)
 * - `xsd`: source folder for `*.xsd` (repo-relative)
 * - `xslt`: source folder for `*.xslt` / `*.xsl` / `*_codedb.xml` (repo-relative)
 * - `rename` (optional): vendored file name -> source file name, when they differ.
 * Files are compared byte for byte: line endings are kept as shipped upstream
 * (CRLF in 1.09 FINAL, LF in 1.09.2.fixFR04).
 */
const SOURCES = [
  { folder: 'minimum', spec: 'Factur-X 1.09 FINAL', xsd: `${FX109}/0. Factur-X_1.09_MINIMUM`, xslt: `${FX109}/0. Factur-X_1.09_MINIMUM/_XSLT_MINIMUM` },
  { folder: 'basic', spec: 'Factur-X 1.09 FINAL', xsd: `${FX109}/2. Factur-X_1.09_BASIC`, xslt: `${FX109}/2. Factur-X_1.09_BASIC/_XSLT_BASIC` },
  // FNFE-MPE ships 1.09.2.fixFR04 only for the profiles in scope of the French reform
  // (release notes p.9/p.11); MINIMUM and BASIC stay on 1.09 FINAL.
  { folder: 'basicwl', spec: 'Factur-X 1.09.2.fixFR04 (FNFE-MPE FR CTC 1.4.0.04)', xsd: `${FR04}/BASICWL/1xsd`, xslt: `${FR04}/BASICWL/2xslt` },
  { folder: 'en16931', spec: 'Factur-X 1.09.2.fixFR04 (FNFE-MPE FR CTC 1.4.0.04)', xsd: `${FR04}/EN16931/1xsd`, xslt: `${FR04}/EN16931/2xslt` },
  { folder: 'extended', spec: 'Factur-X 1.09.2.fixFR04 (FNFE-MPE FR CTC 1.4.0.04)', xsd: `${FR04}/EXTENDED/1xsd`, xslt: `${FR04}/EXTENDED/2xslt` },
]

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

function runPatch(file) {
  const run = spawnSync(process.execPath, [join(repoRoot, 'scripts/patch-schematron-sum.mjs'), file], { encoding: 'utf8' })
  if (run.status !== 0)
    throw new Error(`patch-schematron-sum failed: ${run.stderr}`)
}

/** Copy `src`, apply the sum() patch, and check that a second run is a no-op (idempotency). */
function patchedCopy(src) {
  const tmp = join(work, `patched-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  copyFileSync(src, tmp)
  runPatch(tmp)
  const once = readFileSync(tmp)
  runPatch(tmp)
  if (!readFileSync(tmp).equals(once))
    throw new Error(`patch-schematron-sum is not idempotent on ${src}`)
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
  const out = join(work, `${level}-${sefFile.replace(/\.gz$/, '')}`)
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
  const known = new Set(SOURCES.map(s => s.folder))
  for (const entry of readdirSync(vendored)) {
    if (statSync(join(vendored, entry)).isDirectory() && !known.has(entry))
      report(false, entry, '', 'folder has no entry in SOURCES — untraceable')
  }

  for (const { folder, spec, xsd, xslt, rename = {} } of SOURCES) {
    for (const dir of [xsd, xslt]) {
      if (!existsSync(join(repoRoot, dir))) {
        console.error(`Spec source not found: ${dir}`)
        process.exit(2)
      }
    }
    console.log(`----  ${folder.padEnd(8)} ${spec}`)

    const files = readdirSync(join(vendored, folder)).sort()
    for (const file of files) {
      const local = join(vendored, folder, file)

      if (file.endsWith('.sef.json.gz')) {
        const base = file.slice(0, -'.sef.json.gz'.length)
        const source = files.find(f => f === `${base}.xslt` || f === `${base}.xsl`)
        if (withSef && source)
          verifySef(folder, join(vendored, folder, source), file)
        else if (!withSef)
          console.log(`skip  ${folder.padEnd(8)} ${file}  (run with --sef to recompile)`)
        else
          report(false, folder, file, `no vendored ${base}.xslt to compile it from`)
        continue
      }

      const candidate = join(repoRoot, file.endsWith('.xsd') ? xsd : xslt, rename[file] ?? file)
      if (!existsSync(candidate)) {
        report(false, folder, file, 'no counterpart in spec/ — untraceable')
        continue
      }

      if (/\.xslt?$/.test(file)) {
        const ok = same(patchedCopy(candidate), local)
        report(ok, folder, file, ok ? 'identical after sum() patch' : 'differs from spec even after sum() patch')
      }
      else {
        report(same(candidate, local), folder, file)
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
console.log('\nAll vendored Factur-X assets match their spec sources.')
