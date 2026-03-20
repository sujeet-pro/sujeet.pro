/**
 * Frontmatter validator.
 *
 * Parses frontmatter from each content file and validates against Zod schemas,
 * reporting detailed per-field errors.
 */

import { readFileSync, } from 'fs'
import matter from 'gray-matter'
import { relative, } from 'path'
import { BaseFrontmatterSchema, ProjectFrontmatterSchema, } from '../../schemas/frontmatter'
import type { Issue, ValidationContext, Validator, } from './types'

type ContentType = 'article' | 'blog' | 'project' | 'listing' | 'page'

function detectContentType(relPath: string,): ContentType {
  const parts = relPath.split('/',)
  if (parts[0] === 'articles') {
    return parts.length >= 3 ? 'article' : 'listing'
  }
  if (parts[0] === 'blogs') {
    return parts.length >= 3 ? 'blog' : 'listing'
  }
  if (parts[0] === 'projects') {
    return parts.length >= 3 ? 'project' : 'listing'
  }
  return 'page'
}

function getSchemaForType(type: ContentType,) {
  if (type === 'project') return ProjectFrontmatterSchema
  return BaseFrontmatterSchema
}

export const frontmatterValidator: Validator = {
  name: 'frontmatter',

  async validate(ctx: ValidationContext,): Promise<Issue[]> {
    const issues: Issue[] = []

    for (const page of ctx.pageMetas) {
      const relPath = relative(ctx.contentDir, page.filePath,)
      const type = detectContentType(relPath,)

      // Only validate content items (articles, blogs, projects), not listings/pages
      if (type === 'listing' || type === 'page') continue

      const raw = readFileSync(page.filePath, 'utf-8',)
      const { data, } = matter(raw,)
      const schema = getSchemaForType(type,)
      const result = schema.safeParse(data,)

      if (!result.success) {
        for (const issue of result.error.issues) {
          const fieldPath = issue.path.join('.',)
          issues.push({
            file: relPath,
            severity: 'error',
            rule: `frontmatter/${fieldPath || 'schema'}`,
            message: `${fieldPath ? fieldPath + ': ' : ''}${issue.message}`,
          },)
        }
      }
    }

    return issues
  },
}
