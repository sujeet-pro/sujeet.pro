export interface ServerConfig {
  port: number
  outDir: string
  contentDir: string
  layoutsDir: string
  stylesDir: string
  publicDir: string
}

export type ClientMessage = { type: 'page'; path: string }

export type ServerMessage = { type: 'reload' } | { type: 'css-update' }
