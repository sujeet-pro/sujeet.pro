const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
],)

const ATTR_MAP: Record<string, string> = {
  className: 'class',
  htmlFor: 'for',
}

function escapeAttr(s: string,): string {
  return s.replace(/&/g, '&amp;',).replace(/"/g, '&quot;',)
}

function escapeHtml(s: string,): string {
  return s.replace(/&/g, '&amp;',).replace(/</g, '&lt;',).replace(/>/g, '&gt;',)
}

export class HtmlString {
  value: string
  constructor(value: string,) {
    this.value = value
  }
  toString(): string {
    return this.value
  }
}

function renderChild(child: unknown,): string {
  if (child == null || child === false || child === true) return ''
  if (child instanceof HtmlString) return child.value
  if (Array.isArray(child,)) return child.map(renderChild,).join('',)
  if (typeof child === 'number') return String(child,)
  if (typeof child === 'string') return escapeHtml(child,)
  return escapeHtml(String(child,),)
}

export function h(
  tag: string | ((props: any,) => HtmlString),
  props: Record<string, unknown> | null,
  ...children: unknown[]
): HtmlString {
  const allProps: Record<string, unknown> = props ? { ...props, } : {}
  if (children.length === 1) allProps.children = children[0]
  else if (children.length > 1) allProps.children = children

  if (typeof tag === 'function') {
    const result = tag(allProps,)
    if (result instanceof HtmlString) return result
    return new HtmlString(renderChild(result,),)
  }

  const { children: _, innerHTML, ...attrs } = allProps

  const parts: string[] = []
  for (const [key, val,] of Object.entries(attrs,)) {
    if (val == null || val === false) continue
    const name = ATTR_MAP[key] || key
    if (val === true) {
      parts.push(name,)
      continue
    }
    parts.push(`${name}="${escapeAttr(String(val,),)}"`,)
  }

  const attrStr = parts.length ? ' ' + parts.join(' ',) : ''
  const open = `<${tag}${attrStr}>`

  if (VOID_ELEMENTS.has(tag,)) return new HtmlString(open,)

  if (innerHTML != null) {
    const raw = innerHTML instanceof HtmlString ? innerHTML.value : String(innerHTML,)
    return new HtmlString(`${open}${raw}</${tag}>`,)
  }

  const childHtml = renderChild(allProps.children,)
  return new HtmlString(`${open}${childHtml}</${tag}>`,)
}

export function Fragment(props: { children?: unknown },): HtmlString {
  return new HtmlString(renderChild(props.children,),)
}

declare global {
  namespace JSX {
    type Element = HtmlString
    interface IntrinsicElements {
      [tag: string]: any
    }
  }
}
