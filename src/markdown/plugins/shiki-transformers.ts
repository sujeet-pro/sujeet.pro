/**
 * Custom Shiki transformers for code blocks.
 *
 * Features (all zero-runtime-JS except copy button):
 * - Language label with colored badge icon
 * - Title/filename header with frame chrome
 * - Line numbers (gutter) — on by default, opt-out via hideLineNumbers
 * - Collapsible sections via <details> (CSS-only)
 * - Line highlighting (mark/ins/del)
 * - Copy button (JS-enhanced, hidden without JS via .no-js)
 *
 * Meta string syntax:
 *   ```js title="app.js" hideLineNumbers collapse={1-5,12-14} mark={3} ins={4} del={5}
 */

import type { ShikiTransformer, } from '@shikijs/rehype'
import type { Element, ElementContent, } from 'hast'

// ── Language maps ──

/** Normalize language aliases to canonical identifiers. */
const LANG_CANONICAL: Record<string, string> = {
  ts: 'typescript',
  js: 'javascript',
  py: 'python',
  yml: 'yaml',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  plaintext: 'text',
  plain: 'text',
  txt: 'text',
  md: 'markdown',
  'c++': 'cpp',
  ps: 'powershell',
  rb: 'ruby',
  kt: 'kotlin',
  gql: 'graphql',
  docker: 'dockerfile',
  jsonc: 'json',
}

/** Display names for languages. */
const LANG_DISPLAY: Record<string, string> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  tsx: 'TSX',
  jsx: 'JSX',
  python: 'Python',
  json: 'JSON',
  json5: 'JSON5',
  yaml: 'YAML',
  sql: 'SQL',
  bash: 'Bash',
  go: 'Go',
  xml: 'XML',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  text: 'Text',
  promql: 'PromQL',
  logql: 'LogQL',
  http: 'HTTP',
  m3u8: 'M3U8',
  markdown: 'Markdown',
  rust: 'Rust',
  java: 'Java',
  c: 'C',
  cpp: 'C++',
  ruby: 'Ruby',
  php: 'PHP',
  swift: 'Swift',
  kotlin: 'Kotlin',
  graphql: 'GraphQL',
  dockerfile: 'Dockerfile',
  nginx: 'Nginx',
  toml: 'TOML',
  ini: 'INI',
  diff: 'Diff',
  powershell: 'PowerShell',
  r: 'R',
  dns: 'DNS',
  redis: 'Redis',
  lua: 'Lua',
  cql: 'CQL',
  protobuf: 'Protobuf',
  astro: 'Astro',
  properties: 'Properties',
  groovy: 'Groovy',
  asciidoc: 'AsciiDoc',
}

/** Badge labels for language icons. Uses recognizable short forms. */
const LANG_ABBR: Record<string, string> = {
  // Web core — use SVG icons (set via CSS), empty string triggers icon-only mode
  html: '',
  css: '',
  // Official letter-box logos (match brand identity)
  typescript: 'TS',
  javascript: 'JS',
  tsx: 'TSX',
  jsx: 'JSX',
  // Short recognizable codes
  python: 'PY',
  go: 'GO',
  rust: 'RS',
  ruby: 'RB',
  java: 'JV',
  php: 'PHP',
  swift: 'SW',
  kotlin: 'KT',
  c: 'C',
  cpp: 'C++',
  r: 'R',
  lua: 'LUA',
  // Data / config
  json: '{ }',
  json5: '{ }',
  yaml: 'YML',
  toml: 'TML',
  ini: 'INI',
  xml: 'XML',
  properties: 'CFG',
  // Shell / infra
  bash: '$_',
  powershell: 'PS',
  nginx: 'NGX',
  dockerfile: 'DKR',
  dns: 'DNS',
  redis: 'RDS',
  // Query / protocol
  sql: 'SQL',
  cql: 'CQL',
  graphql: 'GQL',
  http: 'HTTP',
  protobuf: 'PB',
  promql: 'PQL',
  logql: 'LQL',
  // Markup / text
  markdown: 'MD',
  text: 'TXT',
  diff: 'DIFF',
  m3u8: 'M3U8',
  scss: 'SCSS',
  astro: 'AST',
  groovy: 'GRV',
  asciidoc: 'ADOC',
}

// ── Meta string parser ──

type ParsedMeta = {
  title?: string
  hideLineNumbers?: boolean
  collapse?: number[][] // array of [start, end] pairs
  mark?: Set<number>
  ins?: Set<number>
  del?: Set<number>
}

const metaSymbol = Symbol('parsed-meta',)

function parseRanges(raw: string,): number[][] {
  // Parse "{1-5,12-14}" or "{3}" → [[1,5],[12,14]] or [[3,3]]
  const inner = raw.replace(/[{}]/g, '',)
  return inner.split(',',).map((part,) => {
    const trimmed = part.trim()
    if (trimmed.includes('-',)) {
      const [a, b,] = trimmed.split('-',).map(Number,)
      return [a, b,]
    }
    const n = Number(trimmed,)
    return [n, n,]
  },)
}

function expandRanges(ranges: number[][],): Set<number> {
  const set = new Set<number>()
  for (const [start, end,] of ranges) {
    for (let i = start; i <= end; i++) set.add(i,)
  }
  return set
}

function parseMeta(raw: string,): ParsedMeta {
  const result: ParsedMeta = {}

  // title="filename" or title='filename'
  const titleMatch = raw.match(/title=(?:"([^"]*)"|'([^']*)')/,)
  if (titleMatch) result.title = titleMatch[1] ?? titleMatch[2]

  // hideLineNumbers (boolean flag — opt-out from default line numbers)
  // Note: showLineNumbers is ignored (line numbers are now always on by default)
  if (/\bhideLineNumbers\b/.test(raw,)) result.hideLineNumbers = true

  // collapse={1-5,12-14}
  const collapseMatch = raw.match(/collapse=\{([^}]+)\}/,)
  if (collapseMatch) result.collapse = parseRanges(collapseMatch[1],)

  // mark={1,3-5}
  const markMatch = raw.match(/mark=\{([^}]+)\}/,)
  if (markMatch) result.mark = expandRanges(parseRanges(markMatch[1],),)

  // ins={3-4}
  const insMatch = raw.match(/ins=\{([^}]+)\}/,)
  if (insMatch) result.ins = expandRanges(parseRanges(insMatch[1],),)

  // del={2}
  const delMatch = raw.match(/del=\{([^}]+)\}/,)
  if (delMatch) result.del = expandRanges(parseRanges(delMatch[1],),)

  // Bare {1,3-5} as shorthand for mark
  if (!markMatch) {
    const bareMatch = raw.match(/(?<!\w=)\{([\d,\s-]+)\}/,)
    if (bareMatch) result.mark = expandRanges(parseRanges(bareMatch[1],),)
  }

  return result
}

function getMeta(ctx: any,): ParsedMeta {
  const meta = ctx.meta as Record<symbol, any>
  if (!meta[metaSymbol]) {
    meta[metaSymbol] = parseMeta(ctx.options?.meta?.__raw ?? '',)
  }
  return meta[metaSymbol]
}

// ── Helper: create HAST element ──

function el(
  tag: string,
  props: Record<string, any>,
  children: ElementContent[] = [],
): Element {
  return {
    type: 'element',
    tagName: tag,
    properties: props,
    children,
  }
}

function text(value: string,): ElementContent {
  return { type: 'text', value, }
}

// ── Helper: resolve language metadata ──

function resolveLang(
  rawLang: string,
): { canonical: string; display: string; abbr: string } | null {
  if (!rawLang) return null
  const canonical = LANG_CANONICAL[rawLang] || rawLang
  const display = LANG_DISPLAY[canonical]
    || canonical.charAt(0,).toUpperCase() + canonical.slice(1,)
  const abbr = LANG_ABBR[canonical]
    ?? canonical.slice(0, 2,).toUpperCase()
  return { canonical, display, abbr, }
}

// ── Transformer: Line highlighting (mark/ins/del) ──

export function transformerLineHighlight(): ShikiTransformer {
  return {
    name: 'line-highlight',
    line(node, line,) {
      const meta = getMeta(this,)
      const classes: string[] = []
      if (meta.mark?.has(line,)) classes.push('highlighted',)
      if (meta.ins?.has(line,)) classes.push('diff', 'add',)
      if (meta.del?.has(line,)) classes.push('diff', 'remove',)
      if (classes.length > 0) {
        this.addClassToHast(node, classes,)
      }
    },
  }
}

// ── Options for code block transformers ──

export type CodeBlockOptions = {
  /** Show line numbers by default (opt-out via hideLineNumbers in meta). Default: true */
  defaultShowLineNumbers?: boolean
}

// ── Transformer: Frame wrapper (lang, title, line numbers, copy, collapse) ──

export function transformerCodeFrame(options: CodeBlockOptions = {},): ShikiTransformer {
  return {
    name: 'code-frame',
    pre(node,) {
      const meta = getMeta(this,)
      const lang = this.options.lang || ''
      const isTerminal = ['bash', 'sh', 'zsh', 'shell', 'console', 'ps', 'powershell',].includes(
        lang,
      )

      // Add frame class to <pre>
      this.addClassToHast(node, 'code-frame',)
      if (isTerminal) this.addClassToHast(node, 'is-terminal',)
      if (meta.title) this.addClassToHast(node, 'has-title',)
      // Line numbers: default controlled by options, per-block override via meta
      const showLineNumbers = meta.hideLineNumbers
        ? false
        : (options.defaultShowLineNumbers ?? true)
      if (showLineNumbers) this.addClassToHast(node, 'has-line-numbers',)
    },

    root(root,) {
      const meta = getMeta(this,)
      const source = this.source
      const lang = this.options.lang || ''
      const langInfo = resolveLang(lang,)

      // ── Build header ──
      const headerChildren: ElementContent[] = []

      // Language label (always shown if language is specified)
      if (langInfo) {
        headerChildren.push(
          el('span', {
            className: ['code-lang',],
            'data-abbr': langInfo.abbr,
          }, [text(langInfo.display,),],),
        )
      }

      // Title/filename (if provided)
      if (meta.title) {
        headerChildren.push(
          el('span', { className: ['code-title',], }, [text(meta.title,),],),
        )
      }

      // Copy button (hidden without JS via .no-js class)
      headerChildren.push(
        el('button', {
          className: ['code-copy-btn',],
          'aria-label': 'Copy code',
          'data-code': source,
        }, [text('Copy',),],),
      )

      const header = el('div', { className: ['code-header',], }, headerChildren,)

      // ── Build line number gutter + collapsible sections ──
      const showNumbers = meta.hideLineNumbers ? false : (options.defaultShowLineNumbers ?? true)
      const hasCollapse = meta.collapse && meta.collapse.length > 0

      if (showNumbers || hasCollapse) {
        const codeEl = this.code
        const newChildren: ElementContent[] = []
        const collapseRanges = meta.collapse || []

        // Count actual lines (element children only, not text nodes)
        const totalLines = codeEl.children.filter((c,) => c.type === 'element').length

        // Build a set of lines that are inside collapse ranges, clamped to actual line count
        const collapseStarts = new Map<number, number>() // start → end
        for (const [start, end,] of collapseRanges) {
          if (start > totalLines) continue // skip ranges beyond actual lines
          collapseStarts.set(start, Math.min(end, totalLines,),)
        }

        // Use separate counters: idx for array position, lineNum for logical lines.
        // Text nodes (\n) between line spans must not inflate the line counter.
        let idx = 0
        let lineNum = 0
        while (idx < codeEl.children.length) {
          const child = codeEl.children[idx]
          if (child.type !== 'element') {
            // Skip text nodes (\n) — .line uses display:block, text nodes create gaps
            idx++
            continue
          }

          lineNum++

          // Check if this line starts a collapsible range
          if (collapseStarts.has(lineNum,)) {
            const rangeEnd = collapseStarts.get(lineNum,)!
            const numLines = rangeEnd - lineNum + 1

            // Collect numLines element children, preserving text nodes between them
            const collapsedContent: ElementContent[] = []
            let collected = 0
            let scanIdx = idx
            let currentLine = lineNum
            while (collected < numLines && scanIdx < codeEl.children.length) {
              const item = codeEl.children[scanIdx]
              scanIdx++
              if (item.type !== 'element') {
                // Skip text nodes — display:block on .line makes them unnecessary
                continue
              }
              if (showNumbers) {
                item.properties = item.properties || {}
                item.properties['data-line'] = String(currentLine,)
                this.addClassToHast(item, 'numbered',)
              }
              collapsedContent.push(item,)
              collected++
              currentLine++
            }

            // Wrap in <details> — use actual collected count (handles clamped ranges)
            const actualEnd = lineNum + collected - 1
            const summary = el('summary', { className: ['collapse-summary',], }, [
              el('span', { className: ['collapse-gutter',], }, [
                text(`${lineNum}–${actualEnd}`,),
              ],),
              el('span', { className: ['collapse-label',], }, [
                text(`${collected} collapsed line${collected === 1 ? '' : 's'}`,),
              ],),
            ],)

            const detailsContent = el(
              'div',
              { className: ['collapse-content',], },
              collapsedContent,
            )

            newChildren.push(
              el('details', { className: ['code-collapse',], }, [summary, detailsContent,],),
            )

            idx = scanIdx
            lineNum = lineNum + collected - 1
          } else {
            // Regular line
            if (showNumbers) {
              child.properties = child.properties || {}
              child.properties['data-line'] = String(lineNum,)
              this.addClassToHast(child, 'numbered',)
            }
            newChildren.push(child,)
            idx++
          }
        }

        codeEl.children = newChildren
      } else {
        // Even without line numbers/collapse, strip text nodes for display:block lines
        const codeEl = this.code
        codeEl.children = codeEl.children.filter((c,) => c.type === 'element',)
      }

      // ── Wrap everything in a figure ──
      const pre = root.children.find(
        (c,): c is Element => c.type === 'element' && c.tagName === 'pre',
      )
      if (!pre) return

      const figureProps: Record<string, any> = { className: ['code-figure',], }
      if (langInfo) figureProps['data-lang'] = langInfo.canonical

      const figure = el('figure', figureProps, [
        header,
        pre,
      ],)

      root.children = [figure,]
    },
  }
}

/**
 * All custom transformers bundled together.
 */
export function codeBlockTransformers(options: CodeBlockOptions = {},): ShikiTransformer[] {
  return [
    transformerLineHighlight(),
    transformerCodeFrame(options,),
  ]
}
