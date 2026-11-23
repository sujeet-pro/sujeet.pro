import type { APIRoute, GetStaticPaths } from 'astro';
import { buildGraphIndex } from '../lib/graph/build-graph';

// Single static path: /graph-index.<hash>.json (content-hashed, so it can be cached immutably).
export const getStaticPaths = (() => [{ params: { hash: buildGraphIndex().hash } }]) satisfies GetStaticPaths;

export const GET: APIRoute = () =>
  new Response(buildGraphIndex().body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
