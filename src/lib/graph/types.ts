/**
 * Compiled structural index contract (§4.3). Type-only module so browser code
 * (`idb-cache.ts`, `CommandPalette.tsx`) can import it without pulling in the Vite-only registry.
 */
export interface GraphIndex {
  schemaVersion: 1;
  graphHash: string; // first 10 hex of sha256 over the canonical JSON body (without graphHash)
  series: Array<{ slug: string; title: string; description: string; pillarSlug?: string; articles: string[] }>;
  articles: Array<{
    slug: string;
    title: string;
    subtitle: string;
    archetype: string;
    primarySeries?: string;
    seriesSlugs: string[];
    tags: string[];
    concepts: string[];
    pages: Array<{
      slug?: string;
      title: string;
      url: string;
      sections: Array<{ id: string; title: string; level: 2 | 3 }>;
    }>;
  }>;
  edges: Array<{
    from: { article: string; page?: string };
    to: { article: string; page?: string; section?: string };
    kind: string;
    reason?: string;
  }>; // backlinks derived O(E) at build/client; never duplicated
}
