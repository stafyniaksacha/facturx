import { defineBuildConfig } from 'unbuild'

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
      target: 'esnext',
    },
    emitCJS: false,
    cjsBridge: false,
  },
})
