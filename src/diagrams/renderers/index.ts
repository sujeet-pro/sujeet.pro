export { ExcalidrawRenderer, } from './excalidraw'
export { MermaidRenderer, } from './mermaid'
export type { DiagramFile, DiagramRenderer, RenderOptions, } from './types'

import { ExcalidrawRenderer, } from './excalidraw'
import { MermaidRenderer, } from './mermaid'
import type { DiagramRenderer, } from './types'

export function createRenderers(): DiagramRenderer[] {
  return [
    new MermaidRenderer(),
    new ExcalidrawRenderer(),
  ]
}
