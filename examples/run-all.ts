// Runs every example script in sequence (used to verify they all still work
// against the bundled fixtures). Run with: `pnpm --filter ...-examples run examples`.
const examples = ['generate', 'extract', 'check', 'parse', 'roundtrip', 'schematron', 'quickstart']

for (const name of examples) {
  console.log(`\n── ${name} ──`)
  await import(`./${name}.ts`)
}
