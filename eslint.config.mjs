import antfu from '@antfu/eslint-config'

export default antfu({
  type: 'lib',
  stylistic: true,
  ignores: [
    '**/fixtures',
    // ...globs
  ],
})
