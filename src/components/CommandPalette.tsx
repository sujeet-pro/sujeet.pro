/**
 * Unified ⌘K palette: structural search over the graph index + lazy Pagefind full-text + commands.
 *
 * Pitfalls honoured:
 *  - P5  Pagefind is loaded with a runtime-only dynamic import; absent in `astro dev`.
 *  - P6  `shouldFilter={false}`; we filter structural rows ourselves; fixed group order
 *        Series → Articles & Tabs → Sections → Full-Text Matches → Commands (`>` mode: Commands only);
 *        Pagefind hits deduped by pathname + fragment; stale responses discarded; debounced 480/160 ms.
 *  - P12 Graph index: hashed URL from <meta name="sp-graph-url"> + in-memory cache + browser HTTP cache.
 *  - P15 Radix Dialog owns the focus trap, Esc and focus restore.
 *  - P17 Commands match on a separate `match` string.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import type { GraphIndex } from '../lib/graph/types';
import { getGraphIndex } from '../lib/cache/idb-cache';
import { cycleScheme, readPrefs, setContrast, setScheme, setSingleKeyShortcuts, setTextSize } from '../lib/prefs.ts';
import { has, kbdHint, openShortcuts, trigger } from '../lib/keyboard/dispatcher.ts';

type GroupName = 'Series' | 'Articles & Tabs' | 'Sections' | 'Full-Text Matches' | 'Commands';
const GROUP_ORDER: GroupName[] = ['Series', 'Articles & Tabs', 'Sections', 'Full-Text Matches', 'Commands'];

interface Row {
  key: string;
  group: GroupName;
  title: string;
  sub?: string;
  kbd?: string;
  hay: string;
  run: () => void;
}

interface CommandDef {
  key: string;
  title: string | (() => string);
  match: string;
  kbd?: string;
  when?: () => boolean;
  run: () => void;
}

type FullText =
  | { status: 'idle' }
  | { status: 'pending'; q: string }
  | { status: 'done'; q: string; rows: Row[] }
  | { status: 'unavailable' };

type SpWindow = Window & { __spPaletteReady?: boolean; __spPalettePending?: string | null };

// ---------------------------------------------------------------------------
// Data loading (module-level caches survive ClientRouter swaps because the island persists)
// ---------------------------------------------------------------------------

/** Structural index via the shared cache helper (memory + HTTP ETag; opt-in IDB). `null` on failure → retried on next open. */
function loadGraphIndex(): Promise<GraphIndex | null> {
  return getGraphIndex().catch(() => null);
}

interface PagefindResultData {
  url: string;
  excerpt: string;
  meta?: { title?: string };
  sub_results?: Array<{ url: string; title: string; excerpt: string }>;
}
interface PagefindApi {
  search: (q: string) => Promise<{ results: Array<{ data: () => Promise<PagefindResultData> }> } | null>;
}

let pagefindPromise: Promise<PagefindApi | null> | null = null;
let pagefindWarm = false;

function loadPagefind(): Promise<PagefindApi | null> {
  if (!pagefindPromise) {
    const url = '/pagefind/pagefind.js';
    pagefindPromise = import(/* @vite-ignore */ url).then(
      (m) => m as PagefindApi,
      () => null,
    );
  }
  return pagefindPromise;
}

const textFromHtml = (html: string): string =>
  new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim() ?? '';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const go = async (href: string) => {
  const { navigate } = await import('astro:transitions/client');
  navigate(href);
};

const pdfUrl = () => document.querySelector<HTMLMetaElement>('meta[name="sp-pdf-url"]')?.content ?? '';

function matches(hay: string, q: string): boolean {
  if (!q) return true;
  return q.split(/\s+/).every((term) => hay.includes(term));
}

function parseQuery(raw: string): { commandsOnly: boolean; q: string } {
  const t = raw.trimStart();
  const commandsOnly = t.startsWith('>');
  return { commandsOnly, q: (commandsOnly ? t.slice(1) : t).trim().toLowerCase() };
}

function structuralRows(index: GraphIndex): Row[] {
  const rows: Row[] = [];
  for (const s of index.series) {
    rows.push({
      key: `series:${s.slug}`,
      group: 'Series',
      title: s.title,
      sub: `${s.articles.length} article${s.articles.length === 1 ? '' : 's'} · ${s.description}`,
      hay: `${s.title} ${s.description} series`.toLowerCase(),
      run: () => go(`/series/${s.slug}/?ctx=series:${s.slug}`),
    });
  }
  for (const a of index.articles) {
    const keywords = [...a.tags, ...a.concepts].join(' ');
    for (const p of a.pages) {
      const isIndex = !p.slug;
      rows.push({
        key: `page:${p.url}`,
        group: 'Articles & Tabs',
        title: isIndex ? a.title : p.title,
        sub: isIndex ? a.subtitle : `Tab · ${a.title}`,
        hay: `${a.title} ${a.subtitle} ${p.title} ${keywords} ${a.archetype}`.toLowerCase(),
        run: () => go(p.url),
      });
      for (const sec of p.sections) {
        rows.push({
          key: `section:${p.url}#${sec.id}`,
          group: 'Sections',
          title: sec.title,
          sub: isIndex ? a.title : `${a.title} › ${p.title}`,
          hay: `${sec.title} ${a.title} ${p.title}`.toLowerCase(),
          run: () => go(`${p.url}#${sec.id}`),
        });
      }
    }
  }
  return rows;
}

function buildCommands(): CommandDef[] {
  const prefs = () => readPrefs();
  const draftsOn = () => new URLSearchParams(location.search).get('drafts') === 'true';
  return [
    { key: 'cmd:theme-cycle', title: '◐ Cycle theme (Auto → Light → Dark)', match: 'cycle theme rotate', kbd: kbdHint('cycleTheme'), run: () => cycleScheme() },
    { key: 'cmd:theme-auto', title: '◐ Theme → Auto (follow OS)', match: 'theme auto system os', run: () => setScheme('auto') },
    { key: 'cmd:theme-light', title: '◐ Theme → Light', match: 'theme light', run: () => setScheme('light') },
    { key: 'cmd:theme-dark', title: '◐ Theme → Dark', match: 'theme dark', run: () => setScheme('dark') },
    { key: 'cmd:contrast', title: '◑ Toggle high contrast', match: 'high contrast accessibility', run: () => setContrast(prefs().contrast === 'high' ? 'default' : 'high') },
    { key: 'cmd:text', title: 'Aa Toggle large reading text', match: 'large text size font reading', run: () => setTextSize(prefs().textSize === 'large' ? 'default' : 'large') },
    {
      key: 'cmd:single-keys',
      title: () => `⌨ Turn single-key shortcuts ${prefs().singleKeyShortcuts ? 'off' : 'on'} (WCAG 2.1.4)`,
      match: 'single key shortcuts wcag accessibility disable enable',
      run: () => setSingleKeyShortcuts(!prefs().singleKeyShortcuts),
    },
    { key: 'cmd:audio', title: '🎧 Play / pause companion podcast', match: 'audio podcast play pause listen', kbd: kbdHint('toggleAudio'), when: () => has('toggleAudio'), run: () => trigger('toggleAudio') },
    { key: 'cmd:audio-jump', title: '↗ Jump to section being discussed', match: 'audio jump section discussed chapter', when: () => document.querySelector('[data-sp-audio-player]') !== null, run: () => document.dispatchEvent(new CustomEvent('sp:audio-jump')) },
    { key: 'cmd:pdf', title: '↓ Download PDF edition', match: 'pdf download export', when: () => pdfUrl() !== '', run: () => window.open(pdfUrl(), '_blank', 'noopener') },
    { key: 'cmd:print', title: '⎙ Preview print notice', match: 'print notice preview', when: () => document.documentElement.hasAttribute('data-sp-has-pdf'), run: () => window.print() },
    { key: 'cmd:ai', title: '✦ Copy AI prompt (llms-full.txt)', match: 'ai prompt copy llm', kbd: kbdHint('copyAiPrompt'), when: () => has('copyAiPrompt'), run: () => trigger('copyAiPrompt') },
    { key: 'cmd:explore', title: '🗺 Open knowledge graph explorer', match: 'explore knowledge graph map', kbd: kbdHint('goExplore'), run: () => go('/explore/') },
    { key: 'cmd:home', title: '⌂ Go home', match: 'go home articles index', kbd: kbdHint('goHome'), run: () => go('/') },
    { key: 'cmd:drafts', title: () => `◌ ${draftsOn() ? 'Hide' : 'Show'} unlisted drafts (?drafts=true)`, match: 'toggle unlisted drafts', run: () => go(draftsOn() ? '/' : '/?drafts=true') },
    { key: 'cmd:help', title: '? Keyboard shortcuts', match: 'keyboard shortcuts help keys', kbd: kbdHint('help'), run: () => openShortcuts() },
  ];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [value, setValue] = useState('');
  const [index, setIndex] = useState<GraphIndex | null>(null);
  const [fullText, setFullText] = useState<FullText>({ status: 'idle' });
  const latestQ = useRef('');
  const resetSelection = useRef(true);
  const opener = useRef<HTMLElement | null>(null);
  const commands = useMemo(buildCommands, []);

  const openWith = useCallback((prefix: string) => {
    const ae = document.activeElement;
    if (ae instanceof HTMLElement && ae !== document.body && !ae.closest('[role="dialog"]')) opener.current = ae;
    setSearch(prefix);
    resetSelection.current = true;
    setOpen(true);
  }, []);

  // Event bridge with the dispatcher (+ drain a request made before hydration).
  useEffect(() => {
    const onOpen = (e: Event) => openWith((e as CustomEvent<{ prefix?: string }>).detail?.prefix ?? '');
    const onClose = () => setOpen(false);
    document.addEventListener('sp:open-palette', onOpen);
    document.addEventListener('sp:close-palette', onClose);
    document.addEventListener('astro:before-swap', onClose);
    const w = window as SpWindow;
    w.__spPaletteReady = true;
    if (typeof w.__spPalettePending === 'string') {
      openWith(w.__spPalettePending);
      w.__spPalettePending = null;
    }
    // Warm the structural index when the browser is idle, so the first open is instant.
    const warm = () => loadGraphIndex().then(setIndex);
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (ric) ric(warm);
    else setTimeout(warm, 200);
    return () => {
      document.removeEventListener('sp:open-palette', onOpen);
      document.removeEventListener('sp:close-palette', onClose);
      document.removeEventListener('astro:before-swap', onClose);
      w.__spPaletteReady = false;
    };
  }, [openWith]);

  useEffect(() => {
    if (open && !index) loadGraphIndex().then(setIndex);
  }, [open, index]);

  const { commandsOnly, q } = parseQuery(search);
  latestQ.current = q;
  const fullTextRef = useRef(fullText);
  fullTextRef.current = fullText;

  // Lazy, debounced, stale-guarded Pagefind search.
  useEffect(() => {
    if (!open || commandsOnly || q.length < 2) return;
    // Read through a ref: depending on `fullText` would re-run this effect on setFullText('pending')
    // and its cleanup would cancel the debounce timer.
    const cur = fullTextRef.current;
    if (cur.status === 'unavailable') return;
    if (cur.status === 'done' && cur.q === q) return;
    setFullText({ status: 'pending', q });
    const timer = setTimeout(async () => {
      const pf = await loadPagefind();
      if (!pf) {
        setFullText({ status: 'unavailable' });
        return;
      }
      pagefindWarm = true;
      const res = await pf.search(q);
      if (latestQ.current !== q) return; // stale
      const data = await Promise.all((res?.results ?? []).slice(0, 6).map((r) => r.data()));
      if (latestQ.current !== q) return; // stale
      const seen = new Set<string>();
      const rows: Row[] = [];
      for (const d of data) {
        const pageTitle = d.meta?.title ?? d.url;
        const subs = (d.sub_results ?? []).filter((s) => s.url.includes('#')).slice(0, 2);
        const hits = subs.length ? subs.map((s) => ({ url: s.url, title: `${s.title} — ${pageTitle}`, excerpt: s.excerpt })) : [{ url: d.url, title: pageTitle, excerpt: d.excerpt }];
        for (const h of hits) {
          const u = new URL(h.url, location.origin);
          const canonical = `${u.pathname}#${u.hash.slice(1)}`;
          if (seen.has(canonical)) continue;
          seen.add(canonical);
          rows.push({
            key: `ft:${canonical}`.toLowerCase(),
            group: 'Full-Text Matches',
            title: `¶ ${h.title}`,
            sub: textFromHtml(h.excerpt),
            hay: '',
            run: () => go(u.pathname + u.hash),
          });
        }
      }
      setFullText({ status: 'done', q, rows });
    }, pagefindWarm ? 160 : 480);
    return () => clearTimeout(timer);
  }, [open, commandsOnly, q]);

  const rows = useMemo(() => {
    const out: Row[] = [];
    if (!open) return out; // also keeps SSR free of DOM access (`when()` predicates read the document)
    if (!commandsOnly && index) {
      for (const r of structuralRows(index)) if (matches(r.hay, q)) out.push(r);
    }
    if (!commandsOnly && fullText.status === 'done' && fullText.q === q) out.push(...fullText.rows);
    for (const c of commands) {
      if (c.when && !c.when()) continue;
      if (!matches(c.match.toLowerCase(), q)) continue;
      out.push({ key: c.key, group: 'Commands', title: typeof c.title === 'function' ? c.title() : c.title, kbd: c.kbd, hay: c.match, run: c.run });
    }
    return out;
    // `open` is a dependency so `when()` predicates and dynamic titles re-evaluate on every open.
  }, [commandsOnly, q, index, fullText, commands, open]);

  // Keep the highlighted row stable while late results stream in; reset it when the query changes.
  useEffect(() => {
    resetSelection.current = true;
  }, [search]);
  useEffect(() => {
    if (resetSelection.current || !rows.some((r) => r.key === value)) {
      setValue(rows[0]?.key ?? '');
      resetSelection.current = false;
    }
  }, [rows, value]);

  const ftVisible = !commandsOnly && q.length >= 2;
  const ftPending = ftVisible && (fullText.status === 'pending' || (fullText.status === 'done' && fullText.q !== q) || fullText.status === 'idle');

  const runRow = (row: Row) => {
    setOpen(false);
    // Let Radix restore focus to the opener before the action (navigation, another dialog) runs.
    requestAnimationFrame(() => row.run());
  };

  const grouped = GROUP_ORDER.map((g) => ({ g, items: rows.filter((r) => r.group === g) }));

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Overlay className="sp-dialog-overlay" />
      <Dialog.Content
        className="sp-dialog-content sp-cmdk"
        data-sp-palette
        aria-describedby="sp-cmdk-desc"
        onCloseAutoFocus={(e) => {
          // P15: restore focus to the opener (or leave it on <body> when opened by keyboard from the page).
          e.preventDefault();
          const el = opener.current;
          opener.current = null;
          if (el && document.contains(el)) el.focus();
        }}
      >
        <Dialog.Title className="sp-sr-only">Search and commands</Dialog.Title>
        <Dialog.Description id="sp-cmdk-desc" className="sp-sr-only">
          Search series, articles, sections and full text, or type &gt; for commands. Use arrow keys to move and Enter to open.
        </Dialog.Description>
        <Command label="Search and commands" shouldFilter={false} loop vimBindings={false} value={value} onValueChange={setValue}>
          <div className="sp-cmd-input-row">
            <Command.Input
              className="sp-cmd-input"
              value={search}
              onValueChange={setSearch}
              placeholder="Search series, articles, sections, full-text, or type > for commands…"
              autoFocus
            />
            <span className="sp-cmd-mode" aria-hidden="true">
              {commandsOnly ? 'COMMANDS' : q ? 'SEARCH' : 'ALL'}
            </span>
          </div>
          <Command.List className="sp-cmd-list">
            {rows.length === 0 && !ftVisible && (
              <Command.Empty className="sp-cmd-empty">No published matches (drafts and prototypes are excluded from search).</Command.Empty>
            )}
            {grouped.map(({ g, items }) => {
              const isFt = g === 'Full-Text Matches';
              if (isFt ? !ftVisible : items.length === 0) return null;
              const count = isFt && ftPending ? '…' : String(items.length);
              return (
                <Command.Group
                  key={g}
                  heading={
                    <span className="sp-cmd-group-title">
                      <span>{g}</span>
                      <span>{count}</span>
                    </span>
                  }
                >
                  {isFt && fullText.status === 'unavailable' && (
                    <div className="sp-cmd-pending sp-cmd-note">Full-text search is available after build (`npm run build`).</div>
                  )}
                  {isFt && fullText.status !== 'unavailable' && ftPending && <div className="sp-cmd-pending">Searching article body text…</div>}
                  {isFt && !ftPending && fullText.status === 'done' && items.length === 0 && (
                    <div className="sp-cmd-pending sp-cmd-note">No body-text matches.</div>
                  )}
                  {items.map((r) => (
                    <Command.Item key={r.key} value={r.key} onSelect={() => runRow(r)} className="sp-cmd-item">
                      <span className="sp-cmd-item-main">
                        <span className="sp-cmd-item-title">{r.title}</span>
                        {r.sub && <span className="sp-cmd-item-sub">{r.sub}</span>}
                      </span>
                      {r.kbd && <kbd className="sp-kbd">{r.kbd}</kbd>}
                    </Command.Item>
                  ))}
                </Command.Group>
              );
            })}
          </Command.List>
          <div className="sp-cmd-footer" aria-hidden="true">
            <span>
              <kbd className="sp-kbd">↑</kbd> <kbd className="sp-kbd">↓</kbd> move · <kbd className="sp-kbd">↵</kbd> open · <kbd className="sp-kbd">esc</kbd> close
            </span>
            <span>
              <kbd className="sp-kbd">&gt;</kbd> commands
            </span>
          </div>
        </Command>
      </Dialog.Content>
    </Dialog.Root>
  );
}
