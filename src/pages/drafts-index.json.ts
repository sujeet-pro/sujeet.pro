import type { APIRoute } from 'astro';
import { getDraftArticles, getPrototypes } from '../lib/articles/registry';
import { DraftsIndexSchema } from '../lib/articles/schema';

// Unlisted tier (§3): this file is the ONLY place draft and prototype URLs exist in dist/.
// It is fetched client-side by <DraftDiscovery /> only when `/?drafts=true`.
export const GET: APIRoute = () => {
  const body = DraftsIndexSchema.parse({
    drafts: getDraftArticles().map((a) => ({
      slug: a.slug,
      title: a.manifest.title,
      archetype: a.manifest.archetype,
      phase: a.manifest.phase,
      url: `/${a.slug}/`,
    })),
    prototypes: getPrototypes().map((p) => ({ slug: p.slug, version: p.version, latest: p.latest, url: p.url })),
  });
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
