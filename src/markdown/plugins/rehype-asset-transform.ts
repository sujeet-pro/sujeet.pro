/**
 * Rehype plugin: transform relative asset references to /assets/ URLs.
 *
 * Converts references like `./diagrams/name.light.svg` or `./assets/image.png`
 * into site-relative URLs like `/assets/name.light.svg` or `/assets/image.png`.
 *
 * Special handling:
 *   - `.inline.svg` files: read from disk and embed as inline SVG (supports currentColor)
 *   - `.invert.` files: add `invert-on-dark` class for CSS dark-mode inversion
 *
 * Handles <img src="...">, <source srcset="...">, and <a href="..."> for asset files.
 */

import { existsSync, readFileSync, } from 'fs'
import type { Element, Root, } from 'hast'
import { basename, join, } from 'path'
import { SKIP, visit, } from 'unist-util-visit'

const ASSET_EXTS = /\.(svg|png|jpg|jpeg|gif|webp|avif|ico)$/i

interface AssetTransformOptions {
  contentDir?: string
}

export function rehypeAssetTransform(options: AssetTransformOptions = {},) {
  return (tree: Root,) => {
    visit(tree, 'element', (node: Element, index, parent,) => {
      // Transform img src
      if (node.tagName === 'img') {
        const src = node.properties?.src
        if (typeof src !== 'string' || !src.startsWith('./',) || !ASSET_EXTS.test(src,)) return

        // Inline SVG: embed content directly in HTML
        if (src.endsWith('.inline.svg',) && options.contentDir) {
          const filePath = join(options.contentDir, src.replace('./', '',),)
          if (existsSync(filePath,)) {
            let svgContent = readFileSync(filePath, 'utf-8',)
            // Strip XML declaration and DOCTYPE
            svgContent = svgContent.replace(/<\?xml[^?]*\?>\s*/g, '',)
            svgContent = svgContent.replace(/<!DOCTYPE[^>]*>\s*/g, '',)
            // Add accessibility and styling attributes to root <svg>
            const alt = node.properties?.alt || ''
            svgContent = svgContent.replace(
              '<svg',
              `<svg role="img" aria-label="${
                String(alt,).replace(/"/g, '&quot;',)
              }" class="inline-svg"`,
            )
            if (parent && index !== undefined) {
              ;(parent.children as any[])[index] = { type: 'raw', value: svgContent, }
              return SKIP
            }
          }
        }

        node.properties = node.properties || {}
        node.properties.src = `/assets/${basename(src,)}`

        // Add invert class for .invert. images
        if (basename(src,).includes('.invert.',)) {
          const existing = node.properties.className
          node.properties.className = existing
            ? [...(Array.isArray(existing,) ? existing : [existing,]), 'invert-on-dark',]
            : ['invert-on-dark',]
        }
      }

      // Transform source srcset (for <picture> elements)
      if (node.tagName === 'source') {
        const srcset = node.properties?.srcset
        if (typeof srcset === 'string' && srcset.startsWith('./',) && ASSET_EXTS.test(srcset,)) {
          node.properties = node.properties || {}
          node.properties.srcset = `/assets/${basename(srcset,)}`
        }
      }

      // Transform a href pointing to asset files
      if (node.tagName === 'a') {
        const href = node.properties?.href
        if (typeof href === 'string' && href.startsWith('./',) && ASSET_EXTS.test(href,)) {
          node.properties = node.properties || {}
          node.properties.href = `/assets/${basename(href,)}`
        }
      }
    },)
  }
}
