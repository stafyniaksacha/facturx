#!/usr/bin/env node
/**
 * Regenerate spec/<version>/text/ from spec/<version>/distribution/.
 *
 * - PDFs (main specification + per-profile technical appendices) → plain text,
 *   one `=== PDF page N ===` marker per page so findings can cite a page.
 * - XLSX (field matrix, business rules, code lists) → one CSV per worksheet.
 *
 * The output is derived data: never edit it by hand, regenerate it and commit
 * the result together with the distribution change that caused it.
 *
 * Usage (from the repo root):
 *   pnpm --dir spec/scripts install --ignore-workspace
 *   pnpm --dir spec/scripts run extract [factur-x-1.09]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const specRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const version = process.argv[2] || 'factur-x-1.09'
const dist = join(specRoot, version, 'distribution')
const out = join(specRoot, version, 'text')

const PDFS = [
  ['1. FACTUR-X 1.09 2026 06 10 EN.pdf', 'spec-main.txt'],
  ['7. FACTUR-X 1.09_Zugferd 2.5 technical appendices/0.Factur-X_1.09_ZUGFeRD_2.5_technical_appendix_profile_minimum.pdf', 'appendix-minimum.txt'],
  ['7. FACTUR-X 1.09_Zugferd 2.5 technical appendices/1.Factur-X_1.09_ZUGFeRD_2.5_technical_appendix_profile_basic_wl.pdf', 'appendix-basic_wl.txt'],
  ['7. FACTUR-X 1.09_Zugferd 2.5 technical appendices/2.Factur-X_1.09_ZUGFeRD_2.5_technical_appendix_profile_basic.pdf', 'appendix-basic.txt'],
  ['7. FACTUR-X 1.09_Zugferd 2.5 technical appendices/3.Factur-X_1.09_ZUGFeRD_2.5_technical_appendix_profile_en16931.pdf', 'appendix-en16931.txt'],
  ['7. FACTUR-X 1.09_Zugferd 2.5 technical appendices/4.Factur-X_1.09_ZUGFeRD_2.5_technical_appendix_profile_extended.pdf', 'appendix-extended.txt'],
]

const WORKBOOKS = [
  ['3. FACTUR-X 1.09 - 2026 06 10 - EN FR VF.xlsx', 'fields'],
  ['EN16931 code lists values v17b - used from 2026-05-15 - Fx 1.09.xlsx', 'codelists'],
]

async function pdfToText(file) {
  const doc = await getDocument({ data: new Uint8Array(readFileSync(file)), useSystemFonts: true }).promise
  let text = ''
  for (let p = 1; p <= doc.numPages; p++) {
    text += `\n=== PDF page ${p} ===\n`
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    let line = ''
    let lastY = null
    for (const item of content.items) {
      // Start a new line whenever the baseline moves.
      const y = item.transform?.[5]
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        text += `${line}\n`
        line = ''
      }
      line += item.str
      lastY = y
    }
    text += `${line}\n`
  }
  return { text, pages: doc.numPages }
}

function csvCell(value) {
  if (value == null)
    return ''
  if (typeof value === 'object' && ('formula' in value || 'sharedFormula' in value))
    value = value.result ?? '' // formula cells: keep the cached value, never the formula
  else if (typeof value === 'object')
    value = value.richText ? value.richText.map(r => r.text).join('') : (value.text ?? value.hyperlink ?? value.error ?? JSON.stringify(value))
  if (value instanceof Date)
    value = value.toISOString().slice(0, 10)
  if (value != null && typeof value === 'object')
    value = value.error ?? JSON.stringify(value)
  const s = String(value).replace(/\r?\n/g, ' ')
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

async function workbookToCsv(file, prefix) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)
  const written = []
  for (const ws of wb.worksheets) {
    const rows = []
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells = []
      for (let c = 1; c <= ws.columnCount; c++)
        cells.push(csvCell(row.getCell(c).value))
      rows.push(cells.join(',').replace(/,+$/, ''))
    })
    const name = `${prefix}--${ws.name.replace(/[^\w.-]+/g, '_')}.csv`
    writeFileSync(join(out, name), rows.join('\n'))
    written.push(`${name} (${rows.length} rows)`)
  }
  return written
}

mkdirSync(out, { recursive: true })

for (const [src, dest] of PDFS) {
  const { text, pages } = await pdfToText(join(dist, src))
  writeFileSync(join(out, dest), text)
  console.log(`${dest} ← ${basename(src)} (${pages} pages)`)
}

for (const [src, prefix] of WORKBOOKS) {
  for (const line of await workbookToCsv(join(dist, src), prefix))
    console.log(line)
}
