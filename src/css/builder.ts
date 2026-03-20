import { bundle, } from 'lightningcss'
import { resolve, } from 'path'

export interface CssConfig {
  entries: string[]
  minify?: boolean
}

export function buildCss(entryPath: string, config?: { minify?: boolean },): string {
  const { code, } = bundle({
    filename: resolve(entryPath,),
    minify: config?.minify ?? true,
    targets: {
      chrome: 100 << 16,
      firefox: 100 << 16,
      safari: 16 << 16,
    },
  },)
  return new TextDecoder().decode(code,)
}
