import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  declaration: 'node16',
  clean: true,
  entries: [
    'src/index.ts',
    'src/cli.ts',
    'src/models.ts',
    {
      input: 'src/utils/xsd/',
      outDir: 'dist/xsd',
      pattern: ['**/*.xsd'],
    }
  ],
  rollup: {
    esbuild: {
      target: 'esnext',
    },
    emitCJS: false,
    cjsBridge: false,
  },
})
