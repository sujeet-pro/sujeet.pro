import { spConfig } from '../../sp.config.ts';

export type SchemePref = 'auto' | 'light' | 'dark';
export type ContrastPref = 'default' | 'high';
export type TextSizePref = 'default' | 'large';

export interface Prefs {
  scheme: SchemePref;
  contrast: ContrastPref;
  textSize: TextSizePref;
  singleKeyShortcuts: boolean;
  [key: string]: unknown;
}

const KEY = spConfig.storageKey;

export function readPrefs(): Prefs {
  const base: Prefs = {
    scheme: spConfig.theme.defaultScheme,
    contrast: spConfig.theme.defaultContrast,
    textSize: spConfig.theme.defaultTextSize,
    singleKeyShortcuts: spConfig.theme.singleKeyShortcutsEnabled,
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p === 'object') return { ...p, ...pick(p, base) };
    }
  } catch {
    /* storage unavailable */
  }
  return base;
}

function pick(p: Record<string, unknown>, base: Prefs): Partial<Prefs> {
  const out: Partial<Prefs> = {};
  out.scheme = p.scheme === 'auto' || p.scheme === 'light' || p.scheme === 'dark' ? p.scheme : base.scheme;
  out.contrast = p.contrast === 'default' || p.contrast === 'high' ? p.contrast : base.contrast;
  out.textSize = p.textSize === 'default' || p.textSize === 'large' ? p.textSize : base.textSize;
  out.singleKeyShortcuts = typeof p.singleKeyShortcuts === 'boolean' ? p.singleKeyShortcuts : base.singleKeyShortcuts;
  return out;
}

/** Merge a patch into stored prefs (never clobbers unrelated keys), apply to <html>, notify listeners. */
function update(patch: Partial<Prefs>): Prefs {
  const next = { ...readPrefs(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  const w = window as unknown as { __spApplyPrefs?: () => void };
  w.__spApplyPrefs?.();
  document.dispatchEvent(new CustomEvent('sp:prefs-changed', { detail: next }));
  return next;
}

export const setScheme = (scheme: SchemePref) => update({ scheme });
export const setContrast = (contrast: ContrastPref) => update({ contrast });
export const setTextSize = (textSize: TextSizePref) => update({ textSize });
export const setSingleKeyShortcuts = (singleKeyShortcuts: boolean) => update({ singleKeyShortcuts });

const ORDER: SchemePref[] = ['auto', 'light', 'dark'];
export function cycleScheme(): Prefs {
  const cur = readPrefs().scheme;
  return setScheme(ORDER[(ORDER.indexOf(cur) + 1) % ORDER.length]);
}
