export interface DiagramFile {
  path: string // absolute path to source file
  name: string // filename without extension
  dir: string // directory containing the file
  ext: string // .mermaid or .excalidraw
}

export interface RenderOptions {
  force?: boolean
}

export interface DiagramRenderer {
  name: string
  extensions: string[]
  renderBatch(files: DiagramFile[], options: RenderOptions,): Promise<void>
  renderSingle(file: DiagramFile,): Promise<void>
  dispose?(): Promise<void>
}
