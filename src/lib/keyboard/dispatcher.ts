/**
 * Single global keyboard dispatcher (§4.1 shortcuts, pitfalls P14, P15, P23).
 *
 * One `keydown` listener on `document`. Islands subscribe with `on(action, handler)`;
 * they must never add their own global keydown listener.
 *
 * Order (mirrors prototype v2 lines ~5121–5245):
 *   isComposing → Esc → mod+K → open-dialog handling → meta/ctrl/alt ignore
 *   → editable-target ignore → WCAG 2.1.4 gate → `g` chord → single keys.
 *
 * Dialogs are Radix-based (cmdk's Command.Dialog, ShortcutsModal): they own their focus trap,
 * Esc-to-close and focus restore (P15), so while one is open the dispatcher only handles mod+K.
 */
import { spConfig } from '../../../sp.config.ts';
import { readPrefs } from '../prefs.ts';

export type ShortcutAction = keyof typeof spConfig.shortcuts;
/** Return `false` to signal "not handled" so the key keeps its default behaviour. */
export type ShortcutHandler = (ev: KeyboardEvent | null) => boolean | void;

const CHORD_TIMEOUT_MS = 900;

const handlers = new Map<ShortcutAction, ShortcutHandler[]>();

/** Subscribe to an action. The most recently registered handler wins. Returns an unsubscribe function. */
export function on(action: ShortcutAction, handler: ShortcutHandler): () => void {
  const list = handlers.get(action) ?? [];
  list.push(handler);
  handlers.set(action, list);
  return () => {
    const cur = handlers.get(action);
    if (!cur) return;
    const i = cur.lastIndexOf(handler);
    if (i !== -1) cur.splice(i, 1);
  };
}

export function has(action: ShortcutAction): boolean {
  return (handlers.get(action)?.length ?? 0) > 0;
}

/** Run an action programmatically (palette commands use this). Returns true when a handler took it. */
export function trigger(action: ShortcutAction, ev: KeyboardEvent | null = null): boolean {
  const list = handlers.get(action);
  if (!list || list.length === 0) return false;
  return list[list.length - 1](ev) !== false;
}

/** WCAG 2.1.4: single-character shortcuts can be switched off by the reader. */
export function isEnabled(): boolean {
  return readPrefs().singleKeyShortcuts;
}

// ---------------------------------------------------------------------------
// Binding table, derived from spConfig.shortcuts
// ---------------------------------------------------------------------------

interface Bindings {
  mod: Map<string, ShortcutAction>; // 'k' → palette (for 'mod+k')
  single: Map<string, ShortcutAction>; // ev.key → action (Shift allowed: '?' and '>' are shifted keys)
  chords: Map<string, Map<string, ShortcutAction>>; // 'g' → { h: goHome, e: goExplore }
}

function buildBindings(): Bindings {
  const b: Bindings = { mod: new Map(), single: new Map(), chords: new Map() };
  for (const [action, combo] of Object.entries(spConfig.shortcuts) as [ShortcutAction, string][]) {
    if (combo.startsWith('mod+')) {
      b.mod.set(combo.slice(4).toLowerCase(), action);
    } else if (combo.includes(' ')) {
      const [first, second] = combo.split(' ');
      const m = b.chords.get(first) ?? new Map<string, ShortcutAction>();
      m.set(second, action);
      b.chords.set(first, m);
    } else {
      b.single.set(combo, action);
    }
  }
  return b;
}

export const bindings = buildBindings();

/** Human-readable key hint for an action, e.g. `⌘K`, `g h`, `?`. */
export function kbdHint(action: ShortcutAction): string {
  const combo: string = spConfig.shortcuts[action];
  if (!combo.startsWith('mod+')) return combo;
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
  return (isMac ? '⌘' : 'Ctrl+') + combo.slice(4).toUpperCase();
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

const EDITABLE_SELECTOR =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="slider"], [role="textbox"], .react-flow';

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if ((target as HTMLElement).isContentEditable) return true;
  return target.closest(EDITABLE_SELECTOR) !== null;
}

const OPEN_DIALOG_SELECTOR = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], dialog[open]';

export function getOpenDialog(): Element | null {
  return document.querySelector(OPEN_DIALOG_SELECTOR);
}

// ---------------------------------------------------------------------------
// Listener
// ---------------------------------------------------------------------------

let pendingChord: string | null = null;
let chordTimer: ReturnType<typeof setTimeout> | null = null;

function clearChord(): void {
  pendingChord = null;
  if (chordTimer) clearTimeout(chordTimer);
  chordTimer = null;
}

function run(action: ShortcutAction, ev: KeyboardEvent): void {
  if (trigger(action, ev)) ev.preventDefault();
}

function onKeydown(ev: KeyboardEvent): void {
  if (ev.isComposing || ev.defaultPrevented) return;

  // 1. Esc: open dialogs handle it themselves (Radix). Otherwise broadcast for popovers/menus.
  if (ev.key === 'Escape') {
    clearChord();
    if (!getOpenDialog()) document.dispatchEvent(new CustomEvent('sp:escape'));
    return;
  }

  // 2. mod+K (and any other mod+ binding) works everywhere, including inside inputs and dialogs.
  if ((ev.metaKey || ev.ctrlKey) && !ev.altKey) {
    const action = bindings.mod.get(ev.key.toLowerCase());
    if (action) {
      clearChord();
      run(action, ev);
      return;
    }
  }

  // 3. A dialog is open: it owns Tab trapping and ↑/↓/↵; suppress every global shortcut.
  if (getOpenDialog()) return;

  // 4. Ignore other modifier combos (browser/OS shortcuts). Shift is allowed.
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;

  // 5. Never steal keys from editable targets or widgets (P14).
  if (isEditableTarget(ev.target)) return;

  // 6. WCAG 2.1.4 off-switch for single-character shortcuts.
  if (!isEnabled()) {
    clearChord();
    return;
  }

  // 7. Chord completion (`g h`, `g e`).
  if (pendingChord) {
    const second = bindings.chords.get(pendingChord)?.get(ev.key.toLowerCase());
    clearChord();
    if (second) {
      run(second, ev);
      return;
    }
  }
  if (bindings.chords.has(ev.key)) {
    pendingChord = ev.key;
    chordTimer = setTimeout(clearChord, CHORD_TIMEOUT_MS);
    ev.preventDefault();
    return;
  }

  // 8. Single keys.
  const action = bindings.single.get(ev.key);
  if (action) run(action, ev);
}

// ---------------------------------------------------------------------------
// Palette / shortcuts bridge (islands hydrate client:idle; buffer requests until they are ready)
// ---------------------------------------------------------------------------

type SpWindow = Window & {
  __spDispatcherInstalled?: boolean;
  __spPaletteReady?: boolean;
  __spPalettePending?: string | null;
  __spShortcutsReady?: boolean;
  __spShortcutsPending?: boolean;
};

export function isPaletteOpen(): boolean {
  return document.querySelector('[data-sp-palette][data-state="open"]') !== null;
}

export function openPalette(prefix = ''): void {
  const w = window as SpWindow;
  if (!w.__spPaletteReady) w.__spPalettePending = prefix;
  document.dispatchEvent(new CustomEvent('sp:open-palette', { detail: { prefix } }));
}

export function closePalette(): void {
  document.dispatchEvent(new CustomEvent('sp:close-palette'));
}

export function openShortcuts(): void {
  const w = window as SpWindow;
  if (!w.__spShortcutsReady) w.__spShortcutsPending = true;
  document.dispatchEvent(new CustomEvent('sp:open-shortcuts'));
}

/** Scroll to the next/previous section heading inside <main> (global j/k; P23 lets stepper override). */
export function jumpSection(dir: 1 | -1): boolean {
  const headings = Array.from(document.querySelectorAll<HTMLElement>('#main h2[id]'));
  if (headings.length === 0) return false;
  // Distance of each heading from its aligned position (0 = scrolled exactly to it), honouring the
  // root's scroll-padding-top and the heading's scroll-margin-top, which the browser adds together.
  const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  const offset = (h: HTMLElement) => h.getBoundingClientRect().top - pad - (parseFloat(getComputedStyle(h).scrollMarginTop) || 0);
  const target =
    dir > 0 ? headings.find((h) => offset(h) > 8) : [...headings].reverse().find((h) => offset(h) < -8);
  if (!target) return true; // at an edge: swallow the key, nothing to do
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  if (target.id) history.replaceState(history.state, '', '#' + target.id);
  return true;
}

/**
 * Install the listener and the default handlers once per document lifetime.
 * `navigate` is injected so this module stays free of `astro:` virtual imports.
 */
export function installDispatcher(navigate: (href: string) => void, cycleScheme: () => void): void {
  const w = window as SpWindow;
  if (w.__spDispatcherInstalled) return;
  w.__spDispatcherInstalled = true;

  on('palette', () => {
    if (isPaletteOpen()) closePalette();
    else openPalette('');
  });
  on('search', () => openPalette(''));
  on('commands', () => openPalette('> '));
  on('help', () => openShortcuts());
  on('cycleTheme', () => {
    cycleScheme();
  });
  on('nextSection', () => jumpSection(1));
  on('prevSection', () => jumpSection(-1));
  on('goHome', () => navigate('/'));
  on('goExplore', () => navigate('/explore/'));
  // toggleAudio / seekBack / seekForward / copyAiPrompt: no default — subscribed by S3/S4 islands.

  document.addEventListener('keydown', onKeydown);
}
