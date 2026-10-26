import antfu from '@antfu/eslint-config'

export default antfu({
  type: 'lib',
  stylistic: true,
  ignores: [
    '**/fixtures',
    // Vendored verbatim from the official distribution: `lint:fix` must never rewrite it.
    'spec/factur-x-*/**',
    // ...globs
  ],
})
  // Runnable example scripts (embedded into the docs as code snippets):
  // top-level await and console output are intentional.
  .append({
    files: ['examples/**/*.ts'],
    rules: {
      'antfu/no-top-level-await': 'off',
      'no-console': 'off',
    },
  })
