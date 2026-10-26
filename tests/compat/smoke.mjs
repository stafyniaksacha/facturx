/**
 * Consumer smoke test: exercises the *published* package through its public
 * entry points, the way a downstream project does after `npm install`.
 *
 * Plain ESM on purpose (no TypeScript, no test framework): it must run on the
 * `engines.node` floor, which is below what the dev toolchain (pnpm, vitest)
 * supports, and on emulated IBM Z / Power where every extra dependency costs.
 *
 * Usage: node smoke.mjs [<fixtures-dir>]   (defaults to the repo's examples/)
 * Resolves `@stafyniaksacha/facturx` from the script's own location, so in CI
 * it is copied next to a node_modules holding the packed tarball. In the repo
 * it resolves through the tests workspace package (run `pnpm build` first).
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { endianness } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { check, extract, generate, invoiceToXml, validateSchematron, xmlToInvoice } from '@stafyniaksacha/facturx'
import { main } from '@stafyniaksacha/facturx/cli'
import { CrossIndustryInvoiceType } from '@stafyniaksacha/facturx/models'

const here = dirname(fileURLToPath(import.meta.url))
const fixtures = resolve(process.argv[2] ?? join(here, '../../examples'))
const fixture = name => readFile(join(fixtures, name))

const steps = []
function step(name, fn) {
  steps.push({ name, fn })
}

step('entry points resolve', () => {
  assert.equal(typeof main, 'object')
  assert.equal(typeof CrossIndustryInvoiceType, 'function')
})

step('generate + extract (Factur-X EN 16931)', async () => {
  const pdf = await generate({
    pdf: await fixture('source-invoice.pdf'),
    xml: await fixture('Facture_FR_EN16931.xml'),
  })
  assert.equal(new TextDecoder().decode(pdf.subarray(0, 5)), '%PDF-')

  const extracted = await extract({ pdf, check: true })
  assert.equal(extracted.flavor, 'facturx')
  assert.match(extracted.xml, /CrossIndustryInvoice/)
})

step('extract (Order-X)', async () => {
  const { flavor } = await extract({ pdf: await fixture('ORDER-X_EX11_ORDER_PICK-UP-BASIC.pdf') })
  assert.equal(flavor, 'orderx')
})

step('check: XSD + Schematron accept a valid invoice', async () => {
  const result = await check({ xml: await fixture('Facture_FR_EN16931.xml'), schematron: true })
  assert.deepEqual(result.errors, [])
  assert.equal(result.valid, true)
  assert.equal(result.schematronValid, true)
})

step('check: XSD rejects an invalid invoice', async () => {
  const xml = (await fixture('Facture_FR_EN16931.xml')).toString().replace('<rsm:ExchangedDocument>', '<rsm:ExchangedDocument><ram:Unexpected/>')
  const result = await check({ xml })
  assert.equal(result.valid, false)
  assert.ok(result.errors.length > 0)
})

step('validateSchematron', async () => {
  const result = await validateSchematron({
    xml: await fixture('Facture_FR_EN16931.xml'),
    flavor: 'facturx',
    level: 'en16931',
  })
  assert.deepEqual(result.errors, [])
})

step('xmlToInvoice -> invoiceToXml round trip stays valid', async () => {
  const invoice = await xmlToInvoice(await fixture('Facture_FR_EN16931.xml'))
  const xml = (await invoiceToXml(invoice)).toString()
  const result = await check({ xml })
  assert.deepEqual(result.errors, [])
})

step('CLI: check --schematron and extract', () => {
  const pkgDir = dirname(fileURLToPath(import.meta.resolve('@stafyniaksacha/facturx'))).replace(/[\\/]dist$/, '')
  const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
  const bin = join(pkgDir, pkg.bin.facturx)
  const cli = (...args) => execFileSync(process.execPath, [bin, ...args], { encoding: 'utf8' })

  cli('check', join(fixtures, 'Facture_FR_EN16931.xml'), '--schematron')
  assert.match(cli('extract', join(fixtures, 'Facture_FR_EN16931.pdf')), /CrossIndustryInvoice/)
})

console.log(`node ${process.version} ${process.platform}/${process.arch} (${endianness()})`)
let failed = 0
for (const { name, fn } of steps) {
  const start = performance.now()
  try {
    await fn()
    console.log(`  ok   ${name} (${Math.round(performance.now() - start)} ms)`)
  }
  catch (error) {
    failed++
    console.log(`  FAIL ${name}`)
    console.log(error)
  }
}
if (failed > 0) {
  console.log(`${failed}/${steps.length} smoke checks failed`)
  process.exit(1)
}
console.log(`${steps.length} smoke checks passed`)
