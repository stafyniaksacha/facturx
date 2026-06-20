// Generates the "Model reference" pages (docs/api/models/*.md) from the
// Factur-X model classes in src/lib/models/facturx/*.ts.
//
// Each exported class becomes a section with its JSDoc description and a
// table of its public properties (name, type, required/optional). Types that
// resolve to another model class are linked across pages (typedoc-style).
//
// This script is chained from `docs:dev` / `docs:build` — never edit the
// generated pages by hand. Run directly with: `node scripts/gen-models.mjs`.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { Project } from 'ts-morph'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../..')
const modelsDir = resolve(repoRoot, 'src/lib/models/facturx')
const outDir = resolve(__dirname, '../api/models')

/** One entry per model source file → output page. Order = sidebar order. */
const FILES = [
  {
    src: 'crossIndustryInvoice.ts',
    out: 'cross-industry-invoice',
    title: 'Cross Industry Invoice',
    intro: 'The top-level document and its header aggregates (XML namespace `rsm`). Start from [`CrossIndustryInvoiceType`](#crossindustryinvoicetype).',
  },
  {
    src: 'reusableTypes.ts',
    out: 'reusable-types',
    title: 'Reusable types',
    intro: 'Reusable aggregate business-information entities — parties, addresses, taxes, line items, payment means, etc. (XML namespace `ram`).',
  },
  {
    src: 'qualifiedTypes.ts',
    out: 'qualified-types',
    title: 'Qualified types',
    intro: 'Code-list-backed qualified data types, e.g. currency, country and tax codes (XML namespace `qdt`).',
  },
  {
    src: 'unqualifiedTypes.ts',
    out: 'unqualified-types',
    title: 'Unqualified types',
    intro: 'Primitive value wrappers — amounts, identifiers, text, dates, indicators (XML namespace `udt`).',
  },
]

const project = new Project({
  skipAddingFilesFromTsConfig: true,
  compilerOptions: { allowJs: false },
})

// Load every model file up front so cross-file type references resolve.
for (const f of FILES)
  project.addSourceFileAtPath(resolve(modelsDir, f.src))

// VitePress slugifies a heading to lowercase, alphanumerics + hyphens. Class
// names are alphanumeric, so the anchor is simply the lowercased name.
const anchor = name => name.toLowerCase()

// Pass 1 — map every exported class name → the page + anchor it lives on.
const classMap = new Map()
for (const f of FILES) {
  const sf = project.getSourceFileOrThrow(resolve(modelsDir, f.src))
  for (const cls of sf.getClasses()) {
    const name = cls.getName()
    if (name && cls.isExported())
      classMap.set(name, { page: f.out, anchor: anchor(name) })
  }
}

/** Render a written type string: drop ns prefixes, link known classes, keep table-safe. */
function renderType(typeText) {
  const cleaned = typeText
    .replace(/\b(?:udt|ram|qdt)\./g, '') // strip namespace prefixes
    .replace(/\s+/g, ' ') // collapse whitespace (multi-line types)
    .trim()
  // Link any identifier that is a known model class to its page#anchor.
  const linked = cleaned.replace(/[A-Z_]\w*/g, (word) => {
    const target = classMap.get(word)
    return target ? `[${word}](/api/models/${target.page}#${target.anchor})` : word
  })
  // Escape pipes so union types can't break the Markdown table.
  return linked.replace(/\|/g, '\\|')
}

/** First paragraph of a class's JSDoc, whitespace-collapsed. */
function describe(cls) {
  const docs = cls.getJsDocs()
  if (!docs.length)
    return ''
  return docs[docs.length - 1].getDescription().replace(/\s+/g, ' ').trim()
}

/** Minimum Factur-X profile from the class's `@profile` JSDoc tag (or ''). */
function profileOf(cls) {
  const docs = cls.getJsDocs()
  if (!docs.length)
    return ''
  const tag = docs[docs.length - 1].getTags().find(t => t.getTagName() === 'profile')
  return tag ? (tag.getCommentText() ?? '').replace(/\s+/g, ' ').trim() : ''
}

// VitePress <Badge> type per profile, ascending by richness.
const BADGE_TYPE = {
  'MINIMUM': 'info',
  'BASIC WL': 'info',
  'BASIC': 'tip',
  'EN 16931': 'warning',
  'EXTENDED': 'danger',
}

mkdirSync(outDir, { recursive: true })

let total = 0
for (const f of FILES) {
  const sf = project.getSourceFileOrThrow(resolve(modelsDir, f.src))
  const classes = sf.getClasses().filter(c => c.isExported() && c.getName())

  const lines = [
    '---',
    `title: ${f.title}`,
    '---',
    '',
    '<!-- Generated from the TypeScript source by docs/scripts/gen-models.mjs — do not edit by hand. -->',
    '',
    `# ${f.title}`,
    '',
    f.intro,
    '',
    `::: tip Generated reference`,
    `These tables are generated from \`src/lib/models/facturx/${f.src}\` and always match the code.`,
    `See [Models](/api/models) for the conceptual overview and a build-an-invoice example.`,
    `:::`,
    '',
  ]

  for (const cls of classes) {
    const name = cls.getName()
    const desc = describe(cls)
    const profile = profileOf(cls)
    const badge = profile
      ? ` <Badge type="${BADGE_TYPE[profile] ?? 'info'}" text="${profile}" />`
      : ''
    lines.push(`## ${name}${badge}`, '')
    if (desc)
      lines.push(desc, '')

    const props = cls.getProperties()
    if (!props.length) {
      lines.push('_No fields._', '')
      continue
    }

    lines.push('| Property | Type | Required |', '| --- | --- | --- |')
    for (const p of props) {
      const typeText = p.getTypeNode()?.getText() ?? p.getType().getText()
      const required = p.hasQuestionToken() ? 'optional' : 'required'
      lines.push(`| \`${p.getName()}\` | ${renderType(typeText)} | ${required} |`)
    }
    lines.push('')
  }

  writeFileSync(resolve(outDir, `${f.out}.md`), `${lines.join('\n').trimEnd()}\n`)
  total += classes.length
  // eslint-disable-next-line no-console
  console.log(`  ${f.out}.md — ${classes.length} classes`)
}

// eslint-disable-next-line no-console
console.log(`Generated ${FILES.length} model reference pages (${total} classes) in docs/api/models/`)
process.exitCode = 0
