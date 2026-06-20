import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'Factur-X',
  description:
    'Generate, extract, parse and validate Factur-X / ZUGFeRD and Order-X e-invoices in TypeScript.',
  lang: 'en-US',

  // Deployed as a GitHub Pages project site at
  // https://stafyniaksacha.github.io/facturx/ — assets resolve under this sub-path.
  base: '/facturx/',

  lastUpdated: true,
  cleanUrls: true,

  head: [
    ['meta', { name: 'theme-color', content: '#3c8772' }],
  ],

  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Guide', link: '/guide/what-is-facturx', activeMatch: '/guide/' },
      { text: 'CLI', link: '/cli/', activeMatch: '/cli/' },
      { text: 'API', link: '/api/', activeMatch: '/api/' },
      {
        text: 'v0.4.0',
        items: [
          { text: 'Changelog', link: 'https://github.com/stafyniaksacha/facturx/blob/main/CHANGELOG.md' },
          { text: 'npm', link: 'https://www.npmjs.com/package/@stafyniaksacha/facturx' },
        ],
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'What are Factur-X & ZUGFeRD?', link: '/guide/what-is-facturx' },
            { text: 'Getting started', link: '/guide/getting-started' },
            { text: 'Profiles & flavors', link: '/guide/profiles-and-flavors' },
            { text: 'Validation', link: '/guide/validation' },
          ],
        },
      ],
      '/cli/': [
        {
          text: 'CLI reference',
          items: [
            { text: 'Overview', link: '/cli/' },
            { text: 'generate', link: '/cli/generate' },
            { text: 'extract', link: '/cli/extract' },
            { text: 'check', link: '/cli/check' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'SDK reference',
          items: [
            { text: 'Overview', link: '/api/' },
            { text: 'generate()', link: '/api/generate' },
            { text: 'extract()', link: '/api/extract' },
            { text: 'check()', link: '/api/check' },
            { text: 'validateSchematron()', link: '/api/validate-schematron' },
            { text: 'Parsing & serializing', link: '/api/parsing' },
            { text: 'Models', link: '/api/models' },
          ],
        },
        {
          text: 'Model reference',
          collapsed: false,
          items: [
            { text: 'Cross Industry Invoice', link: '/api/models/cross-industry-invoice' },
            { text: 'Reusable types', link: '/api/models/reusable-types' },
            { text: 'Qualified types', link: '/api/models/qualified-types' },
            { text: 'Unqualified types', link: '/api/models/unqualified-types' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/stafyniaksacha/facturx' },
    ],

    search: {
      provider: 'local',
    },

    editLink: {
      pattern: 'https://github.com/stafyniaksacha/facturx/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Based on the work of akretion/factur-x by Alexis de Lattre.',
    },
  },
})
