export type Severity = 'error' | 'warn' | 'info'

export interface Issue {
  file: string
  line?: number
  severity: Severity
  rule: string // e.g. 'frontmatter/missing-title', 'links/broken-internal'
  message: string
}

export interface ValidationContext {
  contentDir: string
  config: any // SiteConfig
  pageMetas: Array<{
    slug: string
    filePath: string
    frontmatter: Record<string, any>
  }>
  pageTypeMetas: Map<string, any>
}

export interface Validator {
  name: string
  validate(ctx: ValidationContext,): Promise<Issue[]>
}

export interface ValidationResult {
  validators: Array<{ name: string; issues: Issue[] }>
  errors: number
  warnings: number
  info: number
  totalFiles: number
  duration: number
}
