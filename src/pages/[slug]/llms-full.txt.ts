import type { APIRoute, GetStaticPaths } from 'astro';
import { getPublishedArticles } from '../../lib/articles/registry';
import { buildLlmsFull } from '../../lib/llms/synthesize';

// Published only (§3): drafts get no llms-full.txt.
export const getStaticPaths = (() => getPublishedArticles().map((a) => ({ params: { slug: a.slug } }))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ params }) => {
  const entry = getPublishedArticles().find((a) => a.slug === params.slug);
  if (!entry) return new Response('Not found', { status: 404 });
  return new Response(buildLlmsFull(entry), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
