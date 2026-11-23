import type { APIRoute } from 'astro';
import { buildLlmsTxt } from '../lib/llms/synthesize';

export const GET: APIRoute = () =>
  new Response(buildLlmsTxt(), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
