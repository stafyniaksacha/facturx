#!/usr/bin/env node
/**
 * Validate `generate()` output with veraPDF (PDF/A-3B), the external validator CONFORMANCE.md relies on
 * for BR-HYBRID-02 (the hybrid SHALL be PDF/A-3). ISO 19005-3 itself is not vendored: the verdict is
 * veraPDF's.
 *
 * `generate()` does not convert a PDF to PDF/A (CG-05). The cases:
 *
 * - `base-pdfa3b.pdf`: a PDF/A-3B base built with pdf-lib (embedded font, sRGB OutputIntent, its own
 *   XMP with the PDF/A-3B identification, trailer /ID), validated alone. It must be compliant, so the
 *   next cases really start from PDF/A-3B.
 * - `<level>.pdf`: `generate()` on that base with the F20260023 example XML shipped with Factur-X 1.09
 *   for each profile (MINIMUM, BASIC WL, BASIC, EN 16931, EXTENDED). Each must stay compliant.
 * - `ready-en16931.pdf`: `generate()` on a PDF/A-ready base (font and OutputIntent, but no XMP and no
 *   /ID). It must be compliant: `generate()` writes the XMP identification and an /ID itself.
 * - `negative-not-pdfa-base.pdf`: the EN 16931 XML on `examples/source-invoice.pdf` (not PDF/A:
 *   unembedded font, no OutputIntent). It must fail on those rules, which proves the run detects
 *   failures. Its XMP still declares PDF/A-3B (CG-41).
 *
 * Every job must end normally under the PDF/A-3B profile. Needs the built package (`pnpm build`) and
 * Docker. The veraPDF image is pinned by digest and runs without network.
 *
 * Usage: node scripts/verify-pdfa.mjs [--keep]   (--keep leaves the PDFs and the report in the temp dir)
 *        node scripts/verify-pdfa.mjs --print-image   (prints the pinned veraPDF image and exits)
 */
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import fontkit from '@pdf-lib/fontkit'
import { PageSizes, PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// veraPDF 1.30.4, the build the manual runs in CONFORMANCE.md used. A multi-arch index (amd64, arm64).
const VERAPDF_IMAGE = 'verapdf/cli@sha256:f085855d442ad415e79fabbabcdd1803c2db4ee097cd5b94506c95ecdcfa1728'

// CI pulls the image first, with retries, from this single pinned reference.
if (process.argv.includes('--print-image')) {
  console.log(VERAPDF_IMAGE)
  process.exit(0)
}

const EXAMPLES = join(repoRoot, 'spec/factur-x-1.09/distribution/5. FACTUR-X 1.09 - Examples/_Factur-X_1.08-Exemples_CS')
const PROFILES = [
  ['minimum', '0.MINIMUM'],
  ['basicwl', '1.BASIC WL'],
  ['basic', '2.BASIC'],
  ['en16931', '3.EN16931'],
  ['extended', '4.EXTENDED'],
]
// The PDF/A-3B identification schema, as in the reference packet
// `distribution/2. FACTUR-X_extension_schema_exemple.xmp.txt`.
const BASE_XMP = `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`

// A file URL, not a path: import() takes URLs, so a Windows drive or a `#` in the path would break.
const { extract, generate } = await import(new URL('../dist/index.mjs', import.meta.url))

/**
 * A pdf-lib base with an embedded font and an sRGB OutputIntent. With `pdfa`, also its own XMP
 * identification and a trailer /ID, which makes it PDF/A-3B on its own.
 */
async function pdfLibBase({ pdfa }) {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const font = await pdf.embedFont(readFileSync(join(repoRoot, 'tests/generate/roboto-latin-400-normal.ttf')))
  const icc = readFileSync(join(repoRoot, 'tests/generate/sRGB2014.icc'))
  const outputIntent = pdf.context.obj({
    Type: 'OutputIntent',
    S: 'GTS_PDFA1',
    OutputConditionIdentifier: PDFString.of('sRGB'),
    DestOutputProfile: pdf.context.register(pdf.context.stream(icc, { N: 3 })),
  })
  pdf.catalog.set(PDFName.of('OutputIntents'), pdf.context.obj([pdf.context.register(outputIntent)]))
  const page = pdf.addPage(PageSizes.A4)
  page.drawText('Factur-X PDF/A-3B base', { x: 70, y: PageSizes.A4[1] - 100, size: 18, font })
  if (pdfa) {
    const xmp = pdf.context.stream(new TextEncoder().encode(BASE_XMP), { Type: 'Metadata', Subtype: 'XML' })
    pdf.catalog.set(PDFName.of('Metadata'), pdf.context.register(xmp))
    const id = PDFHexString.of(randomBytes(16).toString('hex'))
    pdf.context.trailerInfo.ID = pdf.context.obj([id, id])
  }
  return pdf
}

/** The XML of the F20260023 example of a profile folder. */
async function exampleXml(folder) {
  const dir = join(EXAMPLES, folder)
  const name = readdirSync(dir).find(f => f.startsWith('Facture_F20260023-') && f.endsWith('.pdf'))
  if (!name)
    throw new Error(`no F20260023 example PDF in ${dir}`)
  return (await extract({ pdf: readFileSync(join(dir, name)) })).xml
}

const out = mkdtempSync(join(tmpdir(), 'facturx-pdfa-'))
// mkdtemp gives 0700; the veraPDF image runs as its own user (uid 100), which must read the mount.
chmodSync(out, 0o755)
const write = (file, bytes) => writeFileSync(join(out, file), bytes, { mode: 0o644 })
const cases = []
try {
  write('base-pdfa3b.pdf', await (await pdfLibBase({ pdfa: true })).save())
  cases.push({ file: 'base-pdfa3b.pdf', expectCompliant: true })
  for (const [level, folder] of PROFILES) {
    write(`${level}.pdf`, await generate({ pdf: await pdfLibBase({ pdfa: true }), xml: await exampleXml(folder) }))
    cases.push({ file: `${level}.pdf`, expectCompliant: true })
  }
  const en16931 = await exampleXml('3.EN16931')
  write('ready-en16931.pdf', await generate({ pdf: await pdfLibBase({ pdfa: false }), xml: en16931 }))
  cases.push({ file: 'ready-en16931.pdf', expectCompliant: true })
  write('negative-not-pdfa-base.pdf', await generate({ pdf: readFileSync(join(repoRoot, 'examples/source-invoice.pdf')), xml: en16931 }))
  // Unembedded font, device colour without an OutputIntent: what the base lacks.
  cases.push({ file: 'negative-not-pdfa-base.pdf', expectCompliant: false, expectRules: ['6.2.11.4.1', '6.2.4.3'] })

  const run = spawnSync('docker', [
    'run',
    '--rm',
    '--network',
    'none',
    '-v',
    `${out}:/data:ro`,
    VERAPDF_IMAGE,
    '--flavour',
    '3b',
    '--format',
    'mrr',
    ...cases.map(c => `/data/${c.file}`),
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (run.error)
    throw run.error
  const report = run.stdout
  write('report.xml', report)
  // veraPDF exits 1 when a file is not compliant, which the negative control is: judge the report.
  if (!report.includes('<report>')) {
    process.stderr.write(run.stderr)
    throw new Error(`veraPDF produced no report (exit ${run.status})`)
  }

  let failed = 0
  for (const c of cases) {
    const job = report.split('<job>').find(j => j.includes(`<name>/data/${c.file}</name>`)) ?? ''
    const verdict = job.match(/<validationReport[^>]*isCompliant="(true|false)"/)?.[1]
    const profile = job.match(/<validationReport[^>]*profileName="([^"]*)"/)?.[1] ?? ''
    const ended = /jobEndStatus="normal"/.test(job)
    const rules = [...job.matchAll(/<rule [^>]*clause="([^"]+)"[^>]*testNumber="(\d+)"[^>]*status="failed"/g)].map(r => `${r[1]} t${r[2]}`)
    const problems = []
    if (!verdict)
      problems.push('no validation result in the report')
    if (!ended)
      problems.push('job did not end normally')
    if (!profile.startsWith('PDF/A-3b'))
      problems.push(`profile is "${profile}", not PDF/A-3b`)
    if (verdict && (verdict === 'true') !== c.expectCompliant)
      problems.push(c.expectCompliant ? 'expected compliant' : 'expected NOT compliant')
    for (const clause of c.expectRules ?? []) {
      if (!rules.some(r => r.startsWith(`${clause} `)))
        problems.push(`expected a failure of ${clause}`)
    }
    if (problems.length)
      failed++
    const state = verdict === 'true' ? 'compliant' : `not compliant (${rules.join(', ') || 'see report'})`
    console.log(`${problems.length ? 'FAIL ' : 'ok   '} ${c.file}  ${state}${problems.length ? `: ${problems.join('; ')}` : ''}`)
  }
  if (failed) {
    console.log(`\n${failed} case(s) did not match. Report: ${process.argv.includes('--keep') ? join(out, 'report.xml') : 'rerun with --keep'}`)
    process.exitCode = 1
  }
  else {
    console.log(`\nveraPDF PDF/A-3B: base compliant, ${PROFILES.length} profiles kept compliant, PDF/A-ready base made compliant, negative control rejected`)
  }
}
finally {
  if (process.argv.includes('--keep'))
    console.log(`kept: ${out}`)
  else
    rmSync(out, { recursive: true, force: true })
}
