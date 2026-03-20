/**
 * Frontmatter extraction and validation.
 *
 * Uses gray-matter to parse YAML frontmatter from markdown,
 * and optionally validates against a Zod schema.
 */

import matter from 'gray-matter'
import type { ZodSchema, } from 'zod'

export type FrontmatterResult = {
  frontmatter: Record<string, any>
  content: string
}

/** Extract frontmatter from raw markdown using gray-matter. */
export function extractFrontmatter(raw: string,): FrontmatterResult {
  const { data, content, } = matter(raw,)
  return { frontmatter: data, content, }
}

/** Validate frontmatter against a Zod schema. Returns parsed data or throws. */
export function validateFrontmatter<T,>(
  frontmatter: Record<string, any>,
  schema: ZodSchema<T>,
): { success: true; data: T } | { success: false; errors: string[] } {
  const result = schema.safeParse(frontmatter,)
  if (result.success) {
    return { success: true, data: result.data, }
  }
  const errors = result.error.issues.map(
    (issue,) => `${issue.path.join('.',)}: ${issue.message}`,
  )
  return { success: false, errors, }
}
