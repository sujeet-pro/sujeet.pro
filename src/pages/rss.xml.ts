import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { spConfig } from '../../sp.config.ts';
import { getPublishedArticles } from '../lib/articles/registry';

// Published articles only (§3). Deterministic: item dates are article dates, newest first, slug as tiebreak.
export const GET: APIRoute = (context) =>
  rss({
    title: spConfig.author.handle,
    description: `Interactive, evolution-first engineering deep-dives by ${spConfig.author.name}.`,
    site: context.site ?? spConfig.siteUrl,
    trailingSlash: true,
    customData: '<language>en</language>',
    items: [...getPublishedArticles()]
      .sort(
        (a, b) =>
          (b.manifest.publishedAt ?? '').localeCompare(a.manifest.publishedAt ?? '') || a.slug.localeCompare(b.slug),
      )
      .map((a) => ({
        title: a.manifest.title,
        description: a.manifest.summary,
        link: `/${a.slug}/`,
        pubDate: new Date(`${a.manifest.publishedAt}T00:00:00Z`),
        categories: a.manifest.tags,
      })),
  });
