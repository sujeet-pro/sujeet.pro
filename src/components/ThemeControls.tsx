import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cycleScheme, readPrefs, type SchemePref } from '../lib/prefs';

export { setScheme, cycleScheme, setContrast, setTextSize, setSingleKeyShortcuts } from '../lib/prefs';

const LABEL: Record<SchemePref, string> = { auto: 'Auto', light: 'Light', dark: 'Dark' };
const NEXT: Record<SchemePref, SchemePref> = { auto: 'light', light: 'dark', dark: 'auto' };

/** Fixed 34x34 button: SSR and first client render are identical (neutral icon) to avoid hydration mismatch and CLS. */
export default function ThemeControls() {
  const [pref, setPref] = useState<SchemePref | null>(null);

  useEffect(() => {
    const sync = () => setPref(readPrefs().scheme);
    sync();
    document.addEventListener('sp:prefs-changed', sync);
    document.addEventListener('astro:page-load', sync);
    return () => {
      document.removeEventListener('sp:prefs-changed', sync);
      document.removeEventListener('astro:page-load', sync);
    };
  }, []);

  const Icon = pref === 'light' ? Sun : pref === 'dark' ? Moon : Monitor;
  const label = pref
    ? `Theme: ${LABEL[pref]}. Switch to ${LABEL[NEXT[pref]]}`
    : 'Cycle theme (Auto, Light, Dark)';

  return (
    <button
      type="button"
      className="sp-icon-btn"
      title="Cycle theme (t)"
      aria-label={label}
      onClick={() => setPref(cycleScheme().scheme)}
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}
