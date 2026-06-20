declare module 'saxon-js' {
  interface TransformOptions {
    stylesheetFileName?: string
    stylesheetText?: string
    stylesheetInternal?: unknown
    sourceFileName?: string
    sourceText?: string
    destination?: 'replaceBody' | 'appendToBody' | 'prependToBody' | 'raw' | 'document' | 'application' | 'file' | 'stdout' | 'serialized'
    stylesheetParams?: Record<string, unknown>
    [key: string]: unknown
  }

  interface TransformResult {
    principalResult?: string
    [key: string]: unknown
  }

  const SaxonJS: {
    transform: (options: TransformOptions, execution?: 'sync' | 'async') => TransformResult | Promise<TransformResult>
    getResource: (options: Record<string, unknown>) => unknown
  }

  export default SaxonJS
}
