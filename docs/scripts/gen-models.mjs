// Generates the "Model reference" pages (docs/api/models/*.md) from the
// Factur-X model classes in src/lib/models/facturx/*.ts, and the EN 16931 model
// pages (docs/api/models/en16931/*.md) from src/lib/models/en16931/*.ts, where each
// property also lists the business-term ids of its `@bt` / `@bg` / `@ext` JSDoc tags.
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
const en16931Dir = resolve(repoRoot, 'src/lib/models/en16931')
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

/** EN 16931 model: one page per source file, under docs/api/models/en16931/. */
const EN16931_FILES = [
  {
    src: 'invoice.ts',
    out: 'en16931/invoice',
    title: 'EN 16931 - Invoice',
    intro: 'The syntax-neutral invoice (BG-0) and its document-level groups. Start from [`Invoice`](#invoice).',
  },
  {
    src: 'parties.ts',
    out: 'en16931/parties',
    title: 'EN 16931 - Parties and delivery',
    intro: 'Seller (BG-4), buyer (BG-7), seller tax representative (BG-11), delivery (BG-13) and their addresses and contacts.',
  },
  {
    src: 'additional-parties.ts',
    out: 'en16931/additional-parties',
    title: 'EN 16931 - Additional parties',
    intro: 'Payee (BG-10) and the EXTENDED-CTC-FR parties (`EXT-FR-FE-*`): buyer agent, payer, seller agent, invoicee, billing party.',
  },
  {
    src: 'settlement.ts',
    out: 'en16931/settlement',
    title: 'EN 16931 - Settlement',
    intro: 'Payment instructions (BG-16), document allowances and charges (BG-20, BG-21), totals (BG-22), VAT breakdown (BG-23) and currency exchange.',
  },
  {
    src: 'lines.ts',
    out: 'en16931/lines',
    title: 'EN 16931 - Invoice lines',
    intro: 'The invoice line (BG-25), its period (BG-26), allowances (BG-27) and charges (BG-28).',
  },
  {
    src: 'line-item.ts',
    out: 'en16931/line-item',
    title: 'EN 16931 - Line price, VAT and item',
    intro: 'Price details (BG-29), line VAT (BG-30), item information (BG-31) and item attributes (BG-32).',
  },
  {
    src: 'line-extensions.ts',
    out: 'en16931/line-extensions',
    title: 'EN 16931 - Line extensions',
    intro: 'The EXTENDED-CTC-FR line groups (`EXT-FR-FE-BG-06` to `-BG-15`): references, deliver-to, seller, delivery terms.',
  },
  {
    src: 'common.ts',
    out: 'en16931/common',
    title: 'EN 16931 - Shared types',
    intro: 'Value classes shared by several groups: `Identifier`, `PostalAddress`, `AttachedDocument`.',
  },
].map(f => ({ ...f, dir: en16931Dir, ids: true }))

const project = new Project({
  skipAddingFilesFromTsConfig: true,
  compilerOptions: { allowJs: false },
})

for (const f of FILES)
  f.dir = modelsDir
const ALL_FILES = [...FILES, ...EN16931_FILES]

// Load every model file up front so cross-file type references resolve.
for (const f of ALL_FILES)
  project.addSourceFileAtPath(resolve(f.dir, f.src))

// VitePress slugifies a heading to lowercase, alphanumerics + hyphens. Class
// names are alphanumeric, so the anchor is simply the lowercased name.
const anchor = name => name.toLowerCase()

// Pass 1 — map every exported class name → the page + anchor it lives on.
const classMap = new Map()
for (const f of ALL_FILES) {
  const sf = project.getSourceFileOrThrow(resolve(f.dir, f.src))
  for (const cls of sf.getClasses()) {
    const name = cls.getName()
    if (!name || !cls.isExported())
      continue
    // Links are by bare class name: the two model families must not share one.
    if (classMap.has(name))
      throw new Error(`gen-models: class ${name} is exported twice (${classMap.get(name).page} and ${f.out})`)
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

/** Business-term ids (`@bt` / `@bg` / `@ext` tags) of a class or property, in tag order, de-duplicated. */
function idsOf(node) {
  const docs = node.getJsDocs()
  if (!docs.length)
    return []
  const ids = []
  for (const tag of docs[docs.length - 1].getTags()) {
    if (!['bt', 'bg', 'ext'].includes(tag.getTagName()))
      continue
    for (const id of (tag.getCommentText() ?? '').split(/\s+/).filter(Boolean)) {
      if (!ids.includes(id))
        ids.push(id)
    }
  }
  return ids
}

/** The description of a property's JSDoc, whitespace-collapsed and table-safe. */
function describeProperty(p) {
  const docs = p.getJsDocs()
  if (!docs.length)
    return ''
  return docs[docs.length - 1].getDescription().replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|')
}

mkdirSync(outDir, { recursive: true })
mkdirSync(resolve(outDir, 'en16931'), { recursive: true })

let total = 0
for (const f of ALL_FILES) {
  const sf = project.getSourceFileOrThrow(resolve(f.dir, f.src))
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
    `These tables are generated from \`src/lib/models/${f.ids ? 'en16931' : 'facturx'}/${f.src}\` and always match the code.`,
    f.ids
      ? `See the [EN 16931 model guide](/guide/en16931-model) for the conceptual overview. The Ids column gives the business term each property holds (\`BT\` / \`BG\`: EN 16931, \`EXT-FR-FE\`: XP Z12-012 EXTENDED-CTC-FR).`
      : `See [Models](/api/models) for the conceptual overview and a build-an-invoice example.`,
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
    const classIds = f.ids ? idsOf(cls) : []
    lines.push(`## ${name}${badge}`, '')
    if (desc)
      lines.push(desc, '')
    if (classIds.length)
      lines.push(`Ids: ${classIds.map(i => `\`${i}\``).join(', ')}`, '')

    const props = cls.getProperties()
    if (!props.length) {
      lines.push('_No fields._', '')
      continue
    }

    lines.push(f.ids ? '| Property | Type | Required | Ids | Description |' : '| Property | Type | Required |', f.ids ? '| --- | --- | --- | --- | --- |' : '| --- | --- | --- |')
    for (const p of props) {
      const typeText = p.getTypeNode()?.getText() ?? p.getType().getText()
      const required = p.hasQuestionToken() ? 'optional' : 'required'
      if (f.ids) {
        const ids = idsOf(p).map(i => `\`${i}\``).join(' ')
        lines.push(`| \`${p.getName()}\` | ${renderType(typeText)} | ${required} | ${ids} | ${describeProperty(p)} |`)
      }
      else {
        lines.push(`| \`${p.getName()}\` | ${renderType(typeText)} | ${required} |`)
      }
    }
    lines.push('')
  }

  writeFileSync(resolve(outDir, `${f.out}.md`), `${lines.join('\n').trimEnd()}\n`)
  total += classes.length
  console.log(`  ${f.out}.md — ${classes.length} classes`)
}

console.log(`Generated ${ALL_FILES.length} model reference pages (${total} classes) in docs/api/models/`)
process.exitCode = 0
