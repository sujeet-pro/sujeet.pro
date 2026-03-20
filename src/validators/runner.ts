/**
 * Validation runner.
 *
 * Loads config, builds validation context, runs all (or selected) validators,
 * and prints formatted results grouped by file.
 */

import { existsSync, readdirSync, readFileSync, } from 'fs'
import matter from 'gray-matter'
import { join, relative, } from 'path'
import { loadAllPageTypeMetas, loadSiteConfig, } from '../config'
import { assetsValidator, } from './assets'
import { codeBlocksValidator, } from './code-blocks'
import { frontmatterValidator, } from './frontmatter'
import { headingsValidator, } from './headings'
import { linksValidator, } from './links'
import { orphansValidator, } from './orphans'
import type { Issue, ValidationContext, ValidationResult, Validator, } from './types'

// ── ANSI colors ──

const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const CYAN = '\x1b[36m'
const GRAY = '\x1b[90m'
const BOLD = '\x1b[1m'
const RESET = '\x1b[0m'

// ── All registered validators ──

const ALL_VALIDATORS: Validator[] = [
  frontmatterValidator,
  headingsValidator,
  linksValidator,
  assetsValidator,
  orphansValidator,
  codeBlocksValidator,
]

// ── Context builder ──

const ROOT = process.cwd()
const CONTENT_DIR = join(ROOT, 'content',)

/** Recursively collect all README.md / index.md files under a directory. */
function collectContentFiles(dir: string,): string[] {
  const results: string[] = []
  function walk(d: string,) {
    if (!existsSync(d,)) return
    for (const entry of readdirSync(d, { withFileTypes: true, },)) {
      const full = join(d, entry.name,)
      if (entry.isDirectory()) walk(full,)
      else if (entry.name === 'README.md' || entry.name === 'index.md') {
        results.push(full,)
      }
    }
  }
  walk(dir,)
  return results
}

function buildContext(): ValidationContext {
  const config = loadSiteConfig()
  const pageTypeMetas = loadAllPageTypeMetas(config.pageTypes,)

  const files = collectContentFiles(CONTENT_DIR,)
  const pageMetas = files.map((filePath,) => {
    const raw = readFileSync(filePath, 'utf-8',)
    const { data, } = matter(raw,)
    const relPath = relative(CONTENT_DIR, filePath,)
    // Derive slug from directory name or 'index' for root files
    const parts = relPath.split('/',)
    const slug = parts.length >= 2
      ? parts[parts.length - 2]!
      : relPath.replace(/\/README\.md$/, '',).replace(/\/index\.md$/, '',)
    return { slug, filePath, frontmatter: data, }
  },)

  return {
    contentDir: CONTENT_DIR,
    config,
    pageMetas,
    pageTypeMetas,
  }
}

// ── Formatting ──

function severityColor(severity: Issue['severity'],): string {
  switch (severity) {
    case 'error':
      return RED
    case 'warn':
      return YELLOW
    case 'info':
      return CYAN
  }
}

function severityLabel(severity: Issue['severity'],): string {
  switch (severity) {
    case 'error':
      return 'error'
    case 'warn':
      return ' warn'
    case 'info':
      return ' info'
  }
}

function printResults(result: ValidationResult,): void {
  // Group all issues by file
  const byFile = new Map<string, Issue[]>()
  for (const v of result.validators) {
    for (const issue of v.issues) {
      const existing = byFile.get(issue.file,)
      if (existing) {
        existing.push(issue,)
      } else {
        byFile.set(issue.file, [issue,],)
      }
    }
  }

  const totalIssues = result.errors + result.warnings + result.info

  if (totalIssues === 0) {
    console.log(
      `\n${BOLD}Validated ${result.totalFiles} files in ${result.duration}ms${RESET} — no issues found.\n`,
    )
    return
  }

  console.log(
    `\n${BOLD}Validated ${result.totalFiles} files in ${result.duration}ms${RESET}\n`,
  )

  // Sort files alphabetically
  const sortedFiles = [...byFile.keys(),].sort()

  for (const file of sortedFiles) {
    const issues = byFile.get(file,)!
    // Sort: errors first, then warns, then info
    issues.sort((a, b,) => {
      const order = { error: 0, warn: 1, info: 2, }
      return order[a.severity] - order[b.severity]
    },)

    console.log(`${BOLD}${file}${RESET}`,)
    for (const issue of issues) {
      const color = severityColor(issue.severity,)
      const label = severityLabel(issue.severity,)
      const lineStr = issue.line != null ? `${GRAY}:${issue.line}${RESET}` : ''
      console.log(
        `  ${color}${label}${RESET}${lineStr}  ${issue.message}  ${GRAY}${issue.rule}${RESET}`,
      )
    }
    console.log()
  }

  // Summary
  const parts: string[] = []
  if (result.errors > 0) {
    parts.push(`${RED}${result.errors} error${result.errors !== 1 ? 's' : ''}${RESET}`,)
  }
  if (result.warnings > 0) {
    parts.push(`${YELLOW}${result.warnings} warning${result.warnings !== 1 ? 's' : ''}${RESET}`,)
  }
  if (result.info > 0) parts.push(`${CYAN}${result.info} info${RESET}`,)
  console.log(
    `${BOLD}Summary:${RESET} ${parts.join(', ',)} across ${byFile.size} file${
      byFile.size !== 1 ? 's' : ''
    }\n`,
  )
}

// ── Public API ──

export interface RunOptions {
  /** Run only these validators (by name). Default: all. */
  validators?: string[]
}

export async function runValidation(
  options: RunOptions = {},
): Promise<ValidationResult> {
  const start = Date.now()

  const ctx = buildContext()

  // Select validators
  let validators = ALL_VALIDATORS
  if (options.validators && options.validators.length > 0) {
    const requested = new Set(options.validators,)
    validators = ALL_VALIDATORS.filter((v,) => requested.has(v.name,))
    const found = new Set(validators.map((v,) => v.name),)
    for (const name of requested) {
      if (!found.has(name,)) {
        console.warn(`Warning: unknown validator "${name}", skipping`,)
      }
    }
  }

  // Run each validator, catching individual failures
  const validatorResults: Array<{ name: string; issues: Issue[] }> = []
  for (const validator of validators) {
    try {
      const issues = await validator.validate(ctx,)
      validatorResults.push({ name: validator.name, issues, },)
    } catch (err) {
      console.error(
        `${RED}Validator "${validator.name}" failed:${RESET}`,
        err instanceof Error ? err.message : err,
      )
      validatorResults.push({ name: validator.name, issues: [], },)
    }
  }

  const errors = validatorResults.reduce(
    (sum, v,) => sum + v.issues.filter((i,) => i.severity === 'error').length,
    0,
  )
  const warnings = validatorResults.reduce(
    (sum, v,) => sum + v.issues.filter((i,) => i.severity === 'warn').length,
    0,
  )
  const info = validatorResults.reduce(
    (sum, v,) => sum + v.issues.filter((i,) => i.severity === 'info').length,
    0,
  )

  const result: ValidationResult = {
    validators: validatorResults,
    errors,
    warnings,
    info,
    totalFiles: ctx.pageMetas.length,
    duration: Date.now() - start,
  }

  printResults(result,)
  return result
}
