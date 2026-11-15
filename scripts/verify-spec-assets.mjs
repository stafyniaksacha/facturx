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
 * French CTC (src/lib/xsd/fr-ctc/, outside the SOURCES table, see verifyFrCtc): the
 * vendored BR-FR-Flux2 XSLT must be byte-identical to every copy in the FNFE-MPE
 * release, embed no local path in its SEF, and its SEF must be reproducible.
 *
 * CDAR (src/lib/xsd/cdar/, see verifyCdar): the uncoupled CDAR XSDs and the BR-FR-CDV XSLT must be
 * byte-identical to the release, and the SEF reproducible with no local path.
 *
 * UBL (src/lib/xsd/ubl/, see verifyUbl): the UBL 2.1 Invoice / CreditNote XSDs with their import closure
 * (byte-identical), the two step-2 transforms (identical after the sum() patch), the BR-FR-Flux2 UBL
 * transform (identical to both release copies), SEFs reproducible with no local path.
 *
 * Usage: node scripts/verify-spec-assets.mjs [--sef]
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const vendored = join(repoRoot, 'src/lib/xsd/facturx')
const withSef = process.argv.includes('--sef')

const FX109 = 'spec/factur-x-1.09/distribution/4. FACTUR-X_1.09_XSD_SCHEMATRON_2026-06-10'
const FR04 = 'spec/fnfe-ctc-fr-1.4.0.04/distribution/Factur-X_1.09.2.fixFR04'
const FRCII = 'spec/fnfe-ctc-fr-1.4.0.04/distribution/CII'

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
  // Plain CII in the EXTENDED-CTC-FR profile: the "uncoupled" UN/CEFACT D22B XSD (step 1) and FNFE-MPE's
  // dedicated Schematron (step 2), release notes p.9.
  { folder: 'extended-ctc-fr', spec: 'CII D22B uncoupled + EXTENDED-CTC-FR (FNFE-MPE FR CTC 1.4.0.04)', xsd: `${FRCII}/1xsd-CII_D22B_uncoupled`, xslt: `${FRCII}/EXTENDED-CTC-FR/2xslt` },
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

function verifySef(level, xsltFile, sefFile, sefDir = join(vendored, level)) {
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
  const ok = normalizeSef(readFileSync(out, 'utf8')) === normalizeSef(gunzipSync(readFileSync(join(sefDir, sefFile))).toString('utf8'))
  report(ok, level, sefFile, ok ? 'recompiled from vendored XSLT' : 'differs from a fresh compilation of the vendored XSLT')
}

/**
 * French CTC rules (BR-FR-Flux2, FNFE-MPE Schematrons FR CTC v1.4.0.04): the release ships the same
 * CII transform five times (Factur-X BASICWL/EN16931/EXTENDED, CII EN16931/EXTENDED-CTC-FR); the
 * vendored copy must be identical to all of them. Only the standard ("fatal") variant may be vendored:
 * the _WARNING variant's transition window closed (release notes p.6).
 */
function verifyFrCtc() {
  const frDir = join(repoRoot, 'src/lib/xsd/fr-ctc')
  const release = join(repoRoot, 'spec/fnfe-ctc-fr-1.4.0.04/distribution')
  const name = 'BR-FR-Flux2-Schematron-CII'
  const copies = [
    'Factur-X_1.09.2.fixFR04/BASICWL',
    'Factur-X_1.09.2.fixFR04/EN16931',
    'Factur-X_1.09.2.fixFR04/EXTENDED',
    'CII/EN16931',
    'CII/EXTENDED-CTC-FR',
  ].map(d => join(release, d, '2xslt', `${name}.xslt`))

  const expected = new Set([`${name}.xslt`, `${name}.sef.json.gz`, 'SCHEMATRON.md'])
  for (const file of readdirSync(frDir).sort()) {
    if (!expected.has(file))
      report(false, 'fr-ctc', file, /_WARNING/.test(file) ? 'the _WARNING variant must not be vendored' : 'no counterpart in spec/ — untraceable')
  }

  const xslt = join(frDir, `${name}.xslt`)
  const missing = copies.filter(c => !existsSync(c))
  if (missing.length)
    return report(false, 'fr-ctc', `${name}.xslt`, `release copy not found: ${missing.join(', ')}`)
  const ok = copies.every(c => same(c, xslt))
  report(ok, 'fr-ctc', `${name}.xslt`, ok ? `identical to all ${copies.length} release copies` : 'differs from a release copy')

  // The SEF embeds the absolute path it was compiled from; it must be a neutral one (SCHEMATRON.md).
  const sef = gunzipSync(readFileSync(join(frDir, `${name}.sef.json.gz`))).toString('utf8')
  const leak = [homedir(), repoRoot].find(p => sef.includes(p))
  report(!leak, 'fr-ctc', `${name}.sef.json.gz`, leak ? 'embeds a local path, recompile from a neutral directory' : 'no local path embedded')

  if (withSef)
    verifySef('fr-ctc', xslt, `${name}.sef.json.gz`, frDir)
  else
    console.log(`skip  fr-ctc   ${name}.sef.json.gz  (run with --sef to recompile)`)
}

/**
 * CDAR lifecycle messages (FNFE-MPE Schematrons FR CTC v1.4.0.04, release notes p.10): the uncoupled
 * CDAR D22B XSDs and the standard BR-FR-CDV transform, all byte-identical to the release (the transform
 * needs no sum() patch); the SEF is reproducible and embeds no local path; the _WARNING variant is not
 * vendored.
 */
function verifyCdar() {
  const cdarDir = join(repoRoot, 'src/lib/xsd/cdar')
  const release = join(repoRoot, 'spec/fnfe-ctc-fr-1.4.0.04/distribution/CDAR')
  const name = 'BR-FR-CDV-Schematron-CDAR'
  console.log('----  cdar     CDAR D22B uncoupled + BR-FR-CDV (FNFE-MPE FR CTC 1.4.0.04)')

  // Required inventory first: comparing only the files present would let a deleted schema pass.
  // Every XSD of the release, the transform and its SEF must be vendored, and every schemaLocation
  // reachable from the root schema must resolve inside the folder.
  const xsdSource = join(release, '1xsd-CDAR_D22B_uncoupled')
  const required = [...readdirSync(xsdSource).filter(f => f.endsWith('.xsd')), `${name}.xslt`, `${name}.sef.json.gz`]
  for (const file of required) {
    if (!existsSync(join(cdarDir, file)))
      report(false, 'cdar', file, 'required file missing from src/lib/xsd/cdar/')
  }
  const root = 'CrossDomainAcknowledgementAndResponse_100pD22B.xsd'
  const folder = resolve(cdarDir)
  const pending = [join(folder, root)]
  const reached = new Set()
  while (pending.length) {
    const xsd = pending.pop()
    if (reached.has(xsd))
      continue
    reached.add(xsd)
    const shown = relative(folder, xsd)
    if (shown.startsWith('..') || isAbsolute(shown)) {
      report(false, 'cdar', shown, 'schemaLocation resolves outside src/lib/xsd/cdar/')
      continue
    }
    if (!existsSync(xsd)) {
      report(false, 'cdar', shown, 'imported schema missing from src/lib/xsd/cdar/')
      continue
    }
    // import, include and redefine; single or double quotes, whitespace around `=`. Each location is
    // resolved against the schema that names it.
    for (const [, , location] of readFileSync(xsd, 'utf8').matchAll(/\bschemaLocation\s*=\s*(["'])(.*?)\1/g))
      pending.push(resolve(dirname(xsd), location.trim()))
  }
  report(reached.size > 1, 'cdar', root, `import closure: ${reached.size} schemas`)
  for (const file of readdirSync(cdarDir).sort()) {
    if (file === 'SCHEMATRON.md' || file === `${name}.sef.json.gz`)
      continue
    if (/_WARNING/.test(file)) {
      report(false, 'cdar', file, 'the _WARNING variant must not be vendored')
      continue
    }
    const source = join(release, file.endsWith('.xsd') ? '1xsd-CDAR_D22B_uncoupled' : '2xslt', file)
    if (!existsSync(source)) {
      report(false, 'cdar', file, 'no counterpart in spec/ — untraceable')
      continue
    }
    report(same(source, join(cdarDir, file)), 'cdar', file)
  }

  // A missing SEF was reported above; skip the checks that read it.
  if (!existsSync(join(cdarDir, `${name}.sef.json.gz`)))
    return
  const sef = gunzipSync(readFileSync(join(cdarDir, `${name}.sef.json.gz`))).toString('utf8')
  const leak = [homedir(), repoRoot].find(p => sef.includes(p))
  report(!leak, 'cdar', `${name}.sef.json.gz`, leak ? 'embeds a local path, recompile from a neutral directory' : 'no local path embedded')
  if (withSef)
    verifySef('cdar', join(cdarDir, `${name}.xslt`), `${name}.sef.json.gz`, cdarDir)
  else
    console.log(`skip  cdar     ${name}.sef.json.gz  (run with --sef to recompile)`)
}

/**
 * UBL 2.1 invoices (FNFE-MPE Schematrons FR CTC v1.4.0.04): step 1 is the UBL 2.1 XSD (Invoice and
 * CreditNote maindocs plus their import closure), step 2 the level Schematron (EN16931 or
 * EXTENDED-CTC-FR, identical to the release after the sum() patch), step 3 the standard BR-FR-Flux2 UBL
 * transform (unpatched, identical to both release copies). The _WARNING variant is not vendored.
 */
function verifyUbl() {
  const ublDir = resolve(repoRoot, 'src/lib/xsd/ubl')
  const release = join(repoRoot, 'spec/fnfe-ctc-fr-1.4.0.04/distribution/UBL')
  const xsdSource = join(release, '1xsd_UBL2.1')
  const brfr = 'BR-FR-Flux2-Schematron-UBL'
  const maindocs = ['maindoc/UBL-Invoice-2.1.xsd', 'maindoc/UBL-CreditNote-2.1.xsd']
  const step2 = [
    { folder: 'en16931', name: 'EN16931-UBL-validation', source: 'EN16931' },
    { folder: 'extended-ctc-fr', name: 'EXTENDED-CTC-FR-UBL', source: 'EXTENDED-CTC-FR' },
  ]
  const brfrCopies = ['EN16931', 'EXTENDED-CTC-FR'].map(d => join(release, d, '2xslt', `${brfr}.xslt`))
  console.log('----  ubl      UBL 2.1 XSD + EN16931 / EXTENDED-CTC-FR / BR-FR-Flux2 (FNFE-MPE FR CTC 1.4.0.04)')

  // schemaLocation closure of the two maindocs within `root` (paths relative to it). Reports a schema
  // that is missing or resolves outside `root`.
  function closure(root, label) {
    const pending = maindocs.map(m => join(root, m))
    const reached = new Set()
    while (pending.length) {
      const xsd = pending.pop()
      if (reached.has(xsd))
        continue
      reached.add(xsd)
      const shown = relative(root, xsd)
      if (shown.startsWith('..') || isAbsolute(shown)) {
        report(false, 'ubl', shown, `schemaLocation resolves outside ${label}`)
        continue
      }
      if (!existsSync(xsd)) {
        report(false, 'ubl', shown, `imported schema missing from ${label}`)
        continue
      }
      for (const [, , location] of readFileSync(xsd, 'utf8').matchAll(/\bschemaLocation\s*=\s*(["'])(.*?)\1/g))
        pending.push(resolve(dirname(xsd), location.trim()))
    }
    return [...reached].map(f => relative(root, f)).filter(f => !f.startsWith('..') && !isAbsolute(f)).sort()
  }

  // Required inventory first: comparing only the files present would let a deleted schema pass.
  const required = [
    ...closure(xsdSource, 'the release 1xsd_UBL2.1/'),
    ...step2.flatMap(({ folder, name }) => [`${folder}/${name}.xslt`, `${folder}/${name}.sef.json.gz`]),
    `fr-ctc/${brfr}.xslt`,
    `fr-ctc/${brfr}.sef.json.gz`,
  ]
  for (const file of required) {
    if (!existsSync(join(ublDir, file)))
      report(false, 'ubl', file, 'required file missing from src/lib/xsd/ubl/')
  }
  if (maindocs.every(m => existsSync(join(ublDir, m)))) {
    const reached = closure(ublDir, 'src/lib/xsd/ubl/')
    report(reached.length > maindocs.length, 'ubl', 'maindoc/*.xsd', `import closure: ${reached.length} schemas`)
  }

  // Every vendored file needs a source, else it is untraceable.
  const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)])
  const sefs = []
  for (const abs of existsSync(ublDir) ? walk(ublDir).sort() : []) {
    const file = relative(ublDir, abs).split(/[\\/]/).join('/')
    if (file === 'SCHEMATRON.md')
      continue
    if (/_WARNING/.test(file)) {
      report(false, 'ubl', file, 'the _WARNING variant must not be vendored')
      continue
    }
    if (file.endsWith('.sef.json.gz')) {
      if (required.includes(file))
        sefs.push(file)
      else
        report(false, 'ubl', file, 'no counterpart in spec/ — untraceable')
      continue
    }
    const [folder, ...rest] = file.split('/')
    if (file.endsWith('.xsd') && (folder === 'maindoc' || folder === 'common')) {
      const source = join(xsdSource, file)
      if (existsSync(source))
        report(same(source, abs), 'ubl', file)
      else
        report(false, 'ubl', file, 'no counterpart in spec/ — untraceable')
      continue
    }
    const step = step2.find(s => s.folder === folder && rest.join('/') === `${s.name}.xslt`)
    if (step) {
      const source = join(release, step.source, '2xslt', `${step.name}.xslt`)
      if (!existsSync(source)) {
        report(false, 'ubl', file, 'no counterpart in spec/ — untraceable')
        continue
      }
      const ok = same(patchedCopy(source), abs)
      report(ok, 'ubl', file, ok ? 'identical after sum() patch' : 'differs from spec even after sum() patch')
      continue
    }
    if (file === `fr-ctc/${brfr}.xslt`) {
      const missing = brfrCopies.filter(c => !existsSync(c))
      if (missing.length) {
        report(false, 'ubl', file, `release copy not found: ${missing.join(', ')}`)
        continue
      }
      const ok = brfrCopies.every(c => same(c, abs))
      report(ok, 'ubl', file, ok ? `identical to both ${brfrCopies.length} release copies` : 'differs from a release copy')
      continue
    }
    report(false, 'ubl', file, 'no counterpart in spec/ — untraceable')
  }

  // SEFs embed no local path and, with --sef, recompile from the vendored XSLT next to them.
  for (const file of sefs) {
    const sefDir = join(ublDir, dirname(file))
    const base = file.slice(file.lastIndexOf('/') + 1, -'.sef.json.gz'.length)
    const sef = gunzipSync(readFileSync(join(ublDir, file))).toString('utf8')
    const leak = [homedir(), repoRoot].find(p => sef.includes(p))
    report(!leak, 'ubl', file, leak ? 'embeds a local path, recompile from a neutral directory' : 'no local path embedded')
    if (withSef)
      verifySef(`ubl-${dirname(file)}`, join(sefDir, `${base}.xslt`), `${base}.sef.json.gz`, sefDir)
    else
      console.log(`skip  ubl      ${file}  (run with --sef to recompile)`)
  }
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

  verifyFrCtc()
  verifyCdar()
  verifyUbl()

  console.log('note  orderx   XSDs not verifiable: the Order-X specification is not vendored under spec/')
}
finally {
  rmSync(work, { recursive: true, force: true })
}

if (failures) {
  console.error(`\n${failures} vendored asset(s) do not match the spec.`)
  process.exit(1)
}
console.log('\nAll vendored Factur-X, French CTC, CDAR and UBL assets match their spec sources.')
