/**
 * Redirect page generator.
 *
 * Generates HTML redirect pages for both content redirects (old -> new paths)
 * and vanity URLs (short URLs -> external targets).
 */

import { existsSync, mkdirSync, writeFileSync, } from 'fs'
import { dirname, join, } from 'path'
import type { RedirectsConfig, } from '../../schemas'

/** Generate an HTML redirect page that points to the given URL. */
export function generateRedirectHtml(to: string,): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0; url=${to}">
<link rel="canonical" href="${to}">
<title>Redirecting...</title>
</head>
<body>
<p>Redirecting to <a href="${to}">${to}</a>...</p>
<script>window.location.replace("${to}")</script>
</body>
</html>`
}

/** Generate all redirect and vanity URL pages. */
export function generateRedirects(
  redirectsConfig: RedirectsConfig,
  outDir: string,
): void {
  // Content redirects
  for (const redirect of redirectsConfig.redirects) {
    const html = generateRedirectHtml(redirect.to,)
    const outPath = join(outDir, redirect.from.slice(1,), 'index.html',)
    mkdirSync(dirname(outPath,), { recursive: true, },)
    // Don't overwrite real pages
    if (!existsSync(outPath,)) {
      writeFileSync(outPath, html,)
    }
  }

  // Vanity URL redirects
  for (const vanity of redirectsConfig.vanity) {
    const html = generateRedirectHtml(vanity.target,)
    const outPath = join(outDir, vanity.id, 'index.html',)
    mkdirSync(dirname(outPath,), { recursive: true, },)
    if (!existsSync(outPath,)) {
      writeFileSync(outPath, html,)
    }
  }
}
