import { readFileSync, writeFileSync, } from 'fs'
import { createMermaidRenderer, } from 'mermaid-isomorphic'
import { basename, join, } from 'path'
import type { DiagramFile, DiagramRenderer, RenderOptions, } from './types'

/* ── Dark theme variables for mermaid (matches site dark mode palette) ── */
const mermaidDarkTheme = {
  background: '#111111',
  primaryColor: '#2d2d2d',
  primaryTextColor: '#e5e5e5',
  primaryBorderColor: '#555555',
  secondaryColor: '#333333',
  secondaryTextColor: '#cccccc',
  secondaryBorderColor: '#555555',
  tertiaryColor: '#252525',
  tertiaryTextColor: '#cccccc',
  tertiaryBorderColor: '#555555',
  lineColor: '#cccccc',
  textColor: '#e5e5e5',
  mainBkg: '#2d2d2d',
  nodeBkg: '#2d2d2d',
  nodeBorder: '#555555',
  clusterBkg: '#1e1e1e',
  clusterBorder: '#555555',
  titleColor: '#e5e5e5',
  edgeLabelBackground: '#1e1e1e',
  actorBorder: '#555555',
  actorBkg: '#2d2d2d',
  actorTextColor: '#e5e5e5',
  actorLineColor: '#888888',
  signalColor: '#cccccc',
  signalTextColor: '#e5e5e5',
  labelBoxBkgColor: '#2d2d2d',
  labelBoxBorderColor: '#555555',
  labelTextColor: '#e5e5e5',
  loopTextColor: '#e5e5e5',
  noteBorderColor: '#555555',
  noteBkgColor: '#333333',
  noteTextColor: '#e5e5e5',
  activationBorderColor: '#555555',
  activationBkgColor: '#333333',
  defaultLinkColor: '#cccccc',
  arrowheadColor: '#cccccc',
}

/* ── Color utilities for dark-mode post-processing ── */

function hexToRgb(hex: string,): [number, number, number,] {
  hex = hex.replace('#', '',)
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
  return [
    parseInt(hex.slice(0, 2,), 16,),
    parseInt(hex.slice(2, 4,), 16,),
    parseInt(hex.slice(4, 6,), 16,),
  ]
}

function rgbToHsl(r: number, g: number, b: number,): [number, number, number,] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b,)
  const min = Math.min(r, g, b,)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }
  return [h, s, l,]
}

function hslToHex(h: number, s: number, l: number,): string {
  let r: number, g: number, b: number
  if (s === 0) {
    r = g = b = l
  } else {
    const hue2rgb = (p: number, q: number, t: number,) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3,)
    g = hue2rgb(p, q, h,)
    b = hue2rgb(p, q, h - 1 / 3,)
  }
  const toHex = (v: number,) => Math.round(v * 255,).toString(16,).padStart(2, '0',)
  return `#${toHex(r,)}${toHex(g,)}${toHex(b,)}`
}

function relativeLuminance(r: number, g: number, b: number,): number {
  const srgb = [r / 255, g / 255, b / 255,]
  const linear = srgb.map((c,) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!
}

/**
 * Post-process a dark SVG to fix light fill colors that produce poor contrast.
 * Finds inline fill:#hex values with high luminance and darkens them,
 * preserving the hue so colored nodes retain their visual identity.
 */
function postProcessDarkSvg(svg: string,): string {
  return svg.replace(
    /style="([^"]*)"/g,
    (match, styleContent: string,) => {
      const newStyle = styleContent.replace(
        /fill\s*:\s*(#[0-9a-fA-F]{3,6})/g,
        (fillMatch, hex: string,) => {
          const [r, g, b,] = hexToRgb(hex,)
          const lum = relativeLuminance(r, g, b,)
          if (lum > 0.4) {
            const [h, s,] = rgbToHsl(r, g, b,)
            return `fill:${hslToHex(h, Math.min(s, 0.6,), 0.25,)}`
          }
          return fillMatch
        },
      )
      return `style="${newStyle}"`
    },
  )
}

export class MermaidRenderer implements DiagramRenderer {
  name = 'mermaid'
  extensions = ['.mermaid',]

  async renderBatch(files: DiagramFile[],): Promise<void> {
    if (files.length === 0) return

    const start = performance.now()
    console.log(`Rendering ${files.length} mermaid diagrams...`,)

    const renderer = createMermaidRenderer()
    const diagrams = files.map((f,) => readFileSync(f.path, 'utf-8',).trim())

    const [lightResults, darkResults,] = await Promise.all([
      renderer(diagrams, { mermaidConfig: { theme: 'default', }, },),
      renderer(diagrams, {
        mermaidConfig: { theme: 'base', themeVariables: mermaidDarkTheme, },
      },),
    ],)

    let rendered = 0
    let failed = 0

    for (let i = 0; i < files.length; i++) {
      const light = lightResults[i]
      const dark = darkResults[i]

      if (light?.status !== 'fulfilled' || dark?.status !== 'fulfilled') {
        const reason = light?.status === 'rejected'
          ? (light as any).reason
          : (dark as any)?.reason
        console.warn(`  FAIL: ${basename(files[i]!.path,)} — ${reason}`,)
        failed++
        continue
      }

      writeFileSync(join(files[i]!.dir, `${files[i]!.name}.light.svg`,), light.value.svg,)
      writeFileSync(
        join(files[i]!.dir, `${files[i]!.name}.dark.svg`,),
        postProcessDarkSvg(dark.value.svg,),
      )
      rendered++
    }

    const elapsed = (performance.now() - start).toFixed(0,)
    console.log(
      `  ${rendered} mermaid rendered in ${elapsed}ms`
        + (failed > 0 ? ` (${failed} failed)` : ''),
    )
  }

  async renderSingle(file: DiagramFile,): Promise<void> {
    const renderer = createMermaidRenderer()
    const diagram = readFileSync(file.path, 'utf-8',).trim()

    const [lightResults, darkResults,] = await Promise.all([
      renderer([diagram,], { mermaidConfig: { theme: 'default', }, },),
      renderer([diagram,], {
        mermaidConfig: { theme: 'base', themeVariables: mermaidDarkTheme, },
      },),
    ],)

    const light = lightResults[0]
    const dark = darkResults[0]

    if (light?.status !== 'fulfilled' || dark?.status !== 'fulfilled') {
      const reason = light?.status === 'rejected'
        ? (light as any).reason
        : (dark as any)?.reason
      console.warn(`  FAIL: ${basename(file.path,)} — ${reason}`,)
      return
    }

    writeFileSync(join(file.dir, `${file.name}.light.svg`,), light.value.svg,)
    writeFileSync(join(file.dir, `${file.name}.dark.svg`,), postProcessDarkSvg(dark.value.svg,),)
    console.log(`  Rendered: ${file.name}`,)
  }
}
