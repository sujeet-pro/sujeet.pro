import rehypeShiki from '@shikijs/rehype'
import matter from 'gray-matter'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import rehypeMathjax from 'rehype-mathjax/svg'
import rehypeSlug from 'rehype-slug'
import rehypeStringify from 'rehype-stringify'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified, } from 'unified'
import type { MarkdownConfig, } from '../../schemas/config'
import type { Heading, } from '../schemas/heading'
import { rehypeAssetTransform, } from './plugins/rehype-asset-transform'
import rehypeCodeTabs from './plugins/rehype-code-tabs'
import { rehypeLinkTransform, } from './plugins/rehype-link-transform'
import { codeBlockTransformers, } from './plugins/shiki-transformers'

export type MarkdownResult = {
  html: string
  headings: Heading[]
  frontmatter: Record<string, any>
}

export type { MarkdownConfig, }

function getTextContent(node: any,): string {
  if (node.type === 'text') return node.value || ''
  if (node.children) return node.children.map(getTextContent,).join('',)
  return ''
}

function extractHeadings(tree: any, headings: Heading[],): void {
  if (tree.type === 'element' && /^h[1-6]$/.test(tree.tagName,)) {
    headings.push({
      depth: parseInt(tree.tagName[1],),
      text: getTextContent(tree,),
      slug: tree.properties?.id || '',
    },)
  }
  if (tree.children) {
    for (const child of tree.children) {
      extractHeadings(child, headings,)
    }
  }
}

export async function processMarkdown(
  raw: string,
  config: MarkdownConfig = {},
  options?: { urlPrefix?: string; contentDir?: string },
): Promise<MarkdownResult> {
  const { data: frontmatter, content, } = matter(raw,)
  const headings: Heading[] = []

  const processor = unified()
    .use(remarkParse,)
    .use(remarkGfm,)
    .use(remarkMath,)
    .use(remarkFrontmatter, ['yaml',],)

  if (config.remarkPlugins) {
    for (const plugin of config.remarkPlugins) {
      if (Array.isArray(plugin,)) processor.use(plugin[0], plugin[1],)
      else processor.use(plugin,)
    }
  }

  processor
    .use(remarkRehype, { allowDangerousHtml: true, },)
    .use(rehypeMathjax,)
    .use(rehypeSlug,)
    .use(rehypeAutolinkHeadings, { behavior: 'wrap', },)

  const themes = config.shiki?.themes || { light: 'github-light', dark: 'github-dark', }
  const langAlias = config.shiki?.langAlias
  const defaultShowLineNumbers = config.shiki?.defaultShowLineNumbers ?? true
  processor.use(rehypeShiki, {
    themes,
    defaultColor: false,
    ...(langAlias ? { langAlias, } : {}),
    transformers: codeBlockTransformers({ defaultShowLineNumbers, },),
    parseMetaString: (meta,) => {
      // Pass raw meta to transformers — shiki doesn't parse it by default
      return { __raw: meta, }
    },
  },)

  // Group consecutive titled code blocks into CSS-only tabs
  processor.use(rehypeCodeTabs,)

  // Transform relative markdown links to website URLs
  if (options?.urlPrefix) {
    processor.use(rehypeLinkTransform, { urlPrefix: options.urlPrefix, },)
  }

  // Transform relative asset references (./diagrams/x.svg → /assets/x.svg)
  // Also handles inline SVGs (.inline.svg) and invert-on-dark (.invert.) classes
  processor.use(rehypeAssetTransform, { contentDir: options?.contentDir, },)

  processor.use(() => (tree: any,) => {
    extractHeadings(tree, headings,)
  })

  if (config.rehypePlugins) {
    for (const plugin of config.rehypePlugins) {
      if (Array.isArray(plugin,)) processor.use(plugin[0], plugin[1],)
      else processor.use(plugin,)
    }
  }

  processor.use(rehypeStringify, { allowDangerousHtml: true, },)

  const result = await processor.process(content,)
  return { html: String(result,), headings, frontmatter, }
}
