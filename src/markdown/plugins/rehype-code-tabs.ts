/**
 * Rehype plugin: wrap titled code blocks in editor-style tabbed panels.
 *
 * Any <figure class="code-figure"> with a <span class="code-title"> gets
 * wrapped in a tabbed container. Consecutive titled blocks share one container.
 *
 * HTML structure (CSS-only, no JS):
 *
 * <div class="code-tabs">
 *   <input type="radio" id="ct-{uid}-0" name="ct-{uid}" class="sr-only" checked>
 *   <input type="radio" id="ct-{uid}-1" name="ct-{uid}" class="sr-only">
 *   <nav class="code-tabs-bar">
 *     <label for="ct-{uid}-0" class="code-tab">file1.js</label>
 *     <label for="ct-{uid}-1" class="code-tab">file2.ts</label>
 *   </nav>
 *   <div class="code-tab-panel"><!-- code figure 1, header removed --></div>
 *   <div class="code-tab-panel"><!-- code figure 2, header removed --></div>
 * </div>
 */

import type { Element, ElementContent, Root, } from 'hast'

let tabGroupCounter = 0

function el(
  tag: string,
  props: Record<string, any>,
  children: ElementContent[] = [],
): Element {
  return { type: 'element', tagName: tag, properties: props, children, }
}

function hasClass(node: Element, cls: string,): boolean {
  const cn = node.properties?.className
  if (Array.isArray(cn,)) return cn.includes(cls,)
  if (typeof cn === 'string') return cn.split(' ',).includes(cls,)
  return false
}

function isCodeFigure(node: ElementContent,): node is Element {
  if (
    node.type === 'element'
    && node.tagName === 'figure'
    && hasClass(node, 'code-figure',)
  ) {
    return true
  }
  // Shiki wraps each code block in a Root node — look inside it
  if ((node as any).type === 'root' && (node as any).children?.length > 0) {
    const inner = (node as any).children.find(
      (c: any,) => c.type === 'element' && c.tagName === 'figure' && hasClass(c, 'code-figure',),
    )
    return !!inner
  }
  return false
}

/** Unwrap a code figure from a possible Root wrapper. */
function unwrapFigure(node: ElementContent,): Element {
  if (node.type === 'element' && node.tagName === 'figure') return node
  // Unwrap from Root node
  if ((node as any).type === 'root') {
    const inner = (node as any).children.find(
      (c: any,) => c.type === 'element' && c.tagName === 'figure' && hasClass(c, 'code-figure',),
    )
    if (inner) return inner
  }
  return node as Element
}

/** Extract the title text from a code-figure's code-header > code-title. */
function extractTitle(figure: Element,): string | null {
  // Find <div class="code-header"> → <span class="code-title">
  for (const child of figure.children) {
    if (child.type !== 'element' || child.tagName !== 'div') continue
    if (!hasClass(child, 'code-header',)) continue
    for (const hChild of child.children) {
      if (
        hChild.type === 'element'
        && hChild.tagName === 'span'
        && hasClass(hChild, 'code-title',)
      ) {
        // Get text content
        const text = hChild.children
          .filter((c,): c is { type: 'text'; value: string } => c.type === 'text')
          .map((c,) => c.value)
          .join('',)
        return text || null
      }
    }
  }
  return null
}

/** Remove the code-header div from a figure (tabs bar replaces it). */
function removeHeader(figure: Element,): Element {
  return {
    ...figure,
    children: figure.children.filter((child,) => {
      if (child.type !== 'element') return true
      return !hasClass(child, 'code-header',)
    },),
  }
}

/** Extract the language badge and copy button from a code-figure's code-header. */
function extractHeaderInfo(figure: Element,): { lang: Element | null; copyBtn: Element | null } {
  for (const child of figure.children) {
    if (child.type !== 'element' || child.tagName !== 'div') continue
    if (!hasClass(child, 'code-header',)) continue
    let lang: Element | null = null
    let copyBtn: Element | null = null
    for (const hChild of child.children) {
      if (hChild.type !== 'element') continue
      if (hasClass(hChild, 'code-lang',)) lang = hChild
      if (hasClass(hChild, 'code-copy-btn',)) copyBtn = hChild
    }
    return { lang, copyBtn, }
  }
  return { lang: null, copyBtn: null, }
}

function isWhitespaceText(node: ElementContent,): boolean {
  return node.type === 'text' && node.value.trim() === ''
}

/** Find consecutive titled code figures starting at index, skipping whitespace. */
function findGroup(
  children: ElementContent[],
  startIdx: number,
): { figures: Element[]; titles: string[]; consumedIndices: number[]; endIdx: number } | null {
  const figures: Element[] = []
  const titles: string[] = []
  const consumedIndices: number[] = []
  let i = startIdx

  while (i < children.length) {
    const node = children[i]
    // Skip whitespace text nodes between code figures
    if (isWhitespaceText(node,)) {
      consumedIndices.push(i,)
      i++
      continue
    }
    if (!isCodeFigure(node,)) break
    const fig = unwrapFigure(node,)
    const title = extractTitle(fig,)
    if (!title) break
    figures.push(fig,)
    titles.push(title,)
    consumedIndices.push(i,)
    i++
  }

  // Any titled block gets tab treatment (single tab = editor-style header)
  if (figures.length < 1) return null
  return { figures, titles, consumedIndices, endIdx: i, }
}

/** Build the tabbed container from a group of figures. */
function buildTabGroup(
  figures: Element[],
  titles: string[],
): Element {
  const uid = tabGroupCounter++
  const groupName = `ct-${uid}`

  // Radio inputs (first one checked by default)
  const radios: ElementContent[] = titles.map((_, i,) =>
    el('input', {
      type: 'radio',
      id: `${groupName}-${i}`,
      name: groupName,
      className: ['sr-only',],
      ...(i === 0 ? { checked: true, } : {}),
    },)
  )

  // Tab labels (in scrollable nav)
  const labels: ElementContent[] = titles.map((title, i,) =>
    el('label', { for: `${groupName}-${i}`, className: ['code-tab',], }, [
      { type: 'text', value: title, },
    ],)
  )
  const tabList = el('nav', { className: ['code-tabs-list',], }, labels,)

  // Extract lang + copy from each figure's header for the actions area
  const metas: ElementContent[] = figures.map((fig, i,) => {
    const info = extractHeaderInfo(fig,)
    const metaChildren: ElementContent[] = []
    if (info.lang) metaChildren.push(info.lang,)
    if (info.copyBtn) metaChildren.push(info.copyBtn,)
    const metaProps: Record<string, any> = {
      className: ['code-tab-meta',],
      'data-idx': String(i,),
    }
    // Propagate data-lang for CSS color inheritance
    const dataLang = fig.properties?.['data-lang']
    if (dataLang) metaProps['data-lang'] = dataLang
    return el('span', metaProps, metaChildren,)
  },)
  const actions = el('div', { className: ['code-tabs-actions',], }, metas,)

  // Tab bar (header wrapping scrollable list + fixed actions)
  const tabBar = el('header', { className: ['code-tabs-bar',], }, [tabList, actions,],)

  // Panels (figures with headers removed)
  const panels: ElementContent[] = figures.map((fig,) =>
    el('div', { className: ['code-tab-panel',], }, [removeHeader(fig,),],)
  )

  return el('div', { className: ['code-tabs',], }, [
    ...radios,
    tabBar,
    ...panels,
  ],)
}

/** Walk an element's children and group consecutive titled code figures. */
function processChildren(parent: Element | Root,): void {
  const oldChildren = parent.children
  const newChildren: ElementContent[] = []
  let i = 0

  while (i < oldChildren.length) {
    const node = oldChildren[i]

    // Try to start a tab group
    if (isCodeFigure(node,)) {
      const fig = unwrapFigure(node,)
      if (extractTitle(fig,)) {
        const group = findGroup(oldChildren, i,)
        if (group) {
          newChildren.push(buildTabGroup(group.figures, group.titles,),)
          i = group.endIdx
          continue
        }
      }
    }

    // Recurse into elements
    if (node.type === 'element') {
      processChildren(node,)
    }
    // Also recurse into root-type nodes (shiki wraps code blocks in Root)
    if ((node as any).type === 'root' && (node as any).children) {
      processChildren(node as any,)
    }

    newChildren.push(node,)
    i++
  }

  parent.children = newChildren
}

export default function rehypeCodeTabs() {
  return (tree: Root,) => {
    tabGroupCounter = 0
    processChildren(tree,)
  }
}
