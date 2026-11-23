// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import expressiveCode from 'astro-expressive-code';
import articleAssets from './src/lib/integrations/article-assets.ts';
import visualsRoute from './src/lib/integrations/visuals-route.ts';
import { readdirSync, readFileSync, existsSync } from 'node:fs';

// Unlisted tier (§3): drafts (phase !== 'published') must never reach the sitemap.
// Read manifests with fs here; the registry is Vite-only (import.meta.glob).
const ARTICLES_DIR = new URL('./src/articles/', import.meta.url);
const draftSlugs = new Set(
	readdirSync(ARTICLES_DIR, { withFileTypes: true })
		.filter((d) => d.isDirectory() && existsSync(new URL(`${d.name}/article.json`, ARTICLES_DIR)))
		.filter((d) => JSON.parse(readFileSync(new URL(`${d.name}/article.json`, ARTICLES_DIR), 'utf8')).phase !== 'published')
		.map((d) => d.name),
);
/** @param {string} page */
const isListed = (page) => {
	const [first] = new URL(page).pathname.split('/').filter(Boolean);
	const { pathname } = new URL(page);
	return (
		!page.includes('/prototype/') &&
		!pathname.startsWith('/print-export/') &&
		!/^\/404\/?$/.test(pathname) &&
		!(first && draftSlugs.has(first))
	);
};

// https://astro.build/config
export default defineConfig({
	// Render pipelines (visuals, PDF) screenshot dev-only routes; the dev toolbar must not appear in the output.
	devToolbar: { enabled: process.env.SP_VISUALS_RENDER !== '1' && process.env.SP_PDF_RENDER !== '1' },
	site: 'https://sujeet.pro',
	trailingSlash: 'always',
	build: { format: 'directory' },
	prerenderConflictBehavior: 'error',
	integrations: [
		// Expressive Code must come before MDX.
		expressiveCode({
			themes: ['github-dark', 'github-light'],
			themeCssSelector: (theme) => `[data-sp-scheme="${theme.type}"]`,
			useDarkModeMediaQuery: false,
		}),
		mdx(),
		react(),
		articleAssets(),
		visualsRoute(),
		sitemap({ filter: isListed }),
	],
	vite: { plugins: [tailwindcss()] },
});
