#!/usr/bin/env node
/**
 * Wrap every XPath `sum(...)` call in a Schematron XSLT with `xs:decimal(...)`.
 *
 * Why: SaxonJS-HE statically infers `round(sum(...)) op xs:decimal(N)` as decimal
 * arithmetic, but `sum()` over untyped source nodes returns xs:double at runtime,
 * which raises `XPTY0004` ("first operand of 'arith' is xs:decimal; supplied value
 * is xs:double") — notably on the EXTENDED profile's FLWOR-based BR-CO rules.
 * Casting the sum to xs:decimal up front aligns the runtime type with the inferred
 * type without changing the rule semantics (monetary sums are decimals).
 *
 * Usage: node scripts/patch-schematron-sum.mjs <file.xslt> [<file.xsl> ...]
 * Idempotent enough for our needs: re-running yields xs:decimal(xs:decimal(sum(...)))
 * which is harmless. Run against the spec's `_XSLT_<LEVEL>` transforms before
 * compiling them to SEF (see src/lib/xsd/facturx/SCHEMATRON.md).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import process from 'node:process'

const isNameChar = c => /[\w:.\-]/.test(c)

function wrapSums(src) {
  let out = ''
  let i = 0
  let count = 0
  while (i < src.length) {
    if (src.startsWith('sum(', i) && (i === 0 || !isNameChar(src[i - 1]))) {
      let depth = 0
      let j = i + 3
      let quote = null
      for (; j < src.length; j++) {
        const c = src[j]
        if (quote) {
          if (c === quote)
            quote = null
          continue
        }
        if (c === '"' || c === '\'') {
          quote = c
          continue
        }
        if (c === '(') {
          depth++
        }
        else if (c === ')') {
          depth--
          if (depth === 0)
            break
        }
      }
      out += `xs:decimal(${src.slice(i, j + 1)})`
      i = j + 1
      count++
    }
    else {
      out += src[i]
      i++
    }
  }
  return { out, count }
}

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('usage: node scripts/patch-schematron-sum.mjs <file> [<file> ...]')
  process.exit(1)
}
for (const file of files) {
  const { out, count } = wrapSums(readFileSync(file, 'utf8'))
  writeFileSync(file, out)
  console.log(`${file}: wrapped ${count} sum() call(s)`)
}
