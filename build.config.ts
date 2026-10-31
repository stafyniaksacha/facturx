import { defineBuildConfig } from 'unbuild'
import pkg from './package.json' with { type: 'json' }

// Lower syntax to the oldest Node we support (e.g. `using` → try/finally) so
// code written on a newer Node still parses on the `engines.node` floor.
const nodeFloor = /^>=\s*(\d+\.\d+\.\d+)$/.exec(pkg.engines.node)?.[1]
if (!nodeFloor)
  throw new Error(`engines.node must look like ">=x.y.z" to derive the build target, got "${pkg.engines.node}"`)

export default defineBuildConfig({
  declaration: 'node16',
  clean: true,
  entries: [
    'src/index.ts',
    'src/cli.ts',
    'src/models.ts',
    {
      input: 'src/lib/xsd/',
      outDir: 'dist/shared/xsd',
      // XSDs for structural validation + compiled Schematron (gzipped SEF) and
      // code lists for business-rule validation. The .xslt sources are kept in
      // the repo for provenance but are not shipped (not needed at runtime).
      pattern: ['**/*.xsd', '**/*.sef.json.gz', '**/*_codedb.xml'],
    },
  ],
  rollup: {
    esbuild: {
      target: `node${nodeFloor}`,
    },
    emitCJS: false,
    cjsBridge: false,
  },
})
