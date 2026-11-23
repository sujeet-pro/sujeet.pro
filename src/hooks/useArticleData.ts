import { useEffect, useState } from 'react';
import { mediaUrl } from '../lib/media.ts';

/** Minimal schema contract (satisfied by any Zod 4 schema). */
export interface ParseSchema<T> {
  safeParse(input: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } };
}

export interface ArticleDataState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
}

// One request per URL per page, shared by every island that asks for it.
const cache = new Map<string, Promise<unknown>>();

function fetchJson(url: string): Promise<unknown> {
  let p = cache.get(url);
  if (!p) {
    p = fetch(url, { cache: 'default' }).then((r) => {
      if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
      return r.json();
    });
    p.catch(() => cache.delete(url)); // allow a retry after a failure
    cache.set(url, p);
  }
  return p;
}

/**
 * Fetch `mediaUrl(slug, relPath)`, validate it with `schema`, and return `{ data, error, loading }`.
 * Pass `initial` (build-time data, already validated by the registry) to skip the request:
 * the island then server-renders its final layout, which keeps CLS at 0.
 */
export function useArticleData<T>(slug: string, relPath: string, schema: ParseSchema<T>, initial?: T): ArticleDataState<T> {
  const [state, setState] = useState<ArticleDataState<T>>(() =>
    initial !== undefined ? { data: initial, error: undefined, loading: false } : { data: undefined, error: undefined, loading: true },
  );

  useEffect(() => {
    if (initial !== undefined) return;
    let alive = true;
    const url = mediaUrl(slug, relPath);
    fetchJson(url)
      .then((json) => {
        const parsed = schema.safeParse(json);
        if (!alive) return;
        if (parsed.success) setState({ data: parsed.data, error: undefined, loading: false });
        else {
          const detail = parsed.error.issues.map((i) => `${i.path.map(String).join('.') || '(root)'}: ${i.message}`).join('; ');
          setState({ data: undefined, error: new Error(`${url} failed validation: ${detail}`), loading: false });
        }
      })
      .catch((e: unknown) => {
        if (alive) setState({ data: undefined, error: e instanceof Error ? e : new Error(String(e)), loading: false });
      });
    return () => {
      alive = false;
    };
    // `schema` is a module-level constant at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, relPath, initial]);

  return state;
}
