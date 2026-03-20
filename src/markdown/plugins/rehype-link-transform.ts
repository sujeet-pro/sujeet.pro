/**
 * Rehype plugin: transform relative markdown links to website URLs.
 *
 * Converts inter-article links like `../crp-cssom-construction/README.md`
 * into site-relative URLs like `/articles/crp-cssom-construction/`.
 *
 * Preserves hash fragments (e.g., `../slug/README.md#section` →
 * `/articles/slug/#section`).
 */

import type { Element, Root, } from 'hast'
import { visit, } from 'unist-util-visit'

export interface LinkTransformOptions {
  /** The URL prefix for the current content type, e.g. '/articles' */
  urlPrefix?: string
}

/**
 * Match relative markdown links like:
 *   ../slug/README.md
 *   ../slug/index.md
 *   ../slug/README.md#section
 *
 * Capture groups:
 *   1: the slug (directory name)
 *   2: optional hash fragment including the '#'
 */
const RELATIVE_MD_LINK = /^\.\.\/([^/]+)\/(?:README|index)\.md(#.*)?$/

export function rehypeLinkTransform(options: LinkTransformOptions = {},) {
  const { urlPrefix = '', } = options

  return (tree: Root,) => {
    visit(tree, 'element', (node: Element,) => {
      if (node.tagName !== 'a') return

      const href = node.properties?.href
      if (typeof href !== 'string') return

      // Skip external URLs
      if (href.startsWith('http://',) || href.startsWith('https://',)) return

      // Skip non-markdown relative links
      if (!href.includes('.md',)) return

      // Skip self-links like ./README.md
      if (href.startsWith('./',)) return

      const match = href.match(RELATIVE_MD_LINK,)
      if (!match) return

      const slug = match[1]
      const hash = match[2] || ''

      // Build the transformed URL: /articles/slug/ + optional #fragment
      node.properties = node.properties || {}
      node.properties.href = `${urlPrefix}/${slug}/${hash}`
    },)
  }
}
