/**
 * `?` keyboard shortcuts cheat-sheet with the WCAG 2.1.4 single-key off-switch.
 * Radix Dialog owns focus trap, Esc and focus restore (P15).
 */
import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { readPrefs, setSingleKeyShortcuts } from '../lib/prefs.ts';
import { kbdHint, type ShortcutAction } from '../lib/keyboard/dispatcher.ts';

const SECTIONS: Array<{ title: string; rows: Array<[ShortcutAction, string]> }> = [
  {
    title: 'Navigate',
    rows: [
      ['palette', 'Open search & commands'],
      ['search', 'Search'],
      ['commands', 'Commands only'],
      ['nextSection', 'Next section'],
      ['prevSection', 'Previous section'],
      ['goHome', 'Go home'],
      ['goExplore', 'Go to Explore'],
      ['help', 'This cheat-sheet'],
    ],
  },
  { title: 'Display', rows: [['cycleTheme', 'Cycle theme (Auto → Light → Dark)']] },
  {
    title: 'Article',
    rows: [
      ['toggleAudio', 'Play / pause companion audio'],
      ['seekBack', 'Audio back 15 s'],
      ['seekForward', 'Audio forward 15 s'],
      ['copyAiPrompt', 'Copy AI prompt'],
    ],
  },
];

type SpWindow = Window & { __spShortcutsReady?: boolean; __spShortcutsPending?: boolean };

export default function ShortcutsModal() {
  const [open, setOpen] = useState(false);
  const [singleKeys, setSingleKeys] = useState(true);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onOpen = () => {
      const ae = document.activeElement;
      opener.current = ae instanceof HTMLElement && ae !== document.body && !ae.closest('[role="dialog"]') ? ae : null;
      setSingleKeys(readPrefs().singleKeyShortcuts);
      setOpen(true);
    };
    const onPrefs = () => setSingleKeys(readPrefs().singleKeyShortcuts);
    const onSwap = () => setOpen(false);
    document.addEventListener('sp:open-shortcuts', onOpen);
    document.addEventListener('sp:prefs-changed', onPrefs);
    document.addEventListener('astro:before-swap', onSwap);
    const w = window as SpWindow;
    w.__spShortcutsReady = true;
    if (w.__spShortcutsPending) {
      w.__spShortcutsPending = false;
      onOpen();
    }
    return () => {
      document.removeEventListener('sp:open-shortcuts', onOpen);
      document.removeEventListener('sp:prefs-changed', onPrefs);
      document.removeEventListener('astro:before-swap', onSwap);
      w.__spShortcutsReady = false;
    };
  }, []);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Overlay className="sp-dialog-overlay" />
      <Dialog.Content
        className="sp-dialog-content sp-shortcuts"
        aria-describedby="sp-shortcuts-desc"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          const el = opener.current;
          opener.current = null;
          if (el && document.contains(el)) el.focus();
        }}
      >
        <div className="sp-modal-header">
          <Dialog.Title asChild>
            <h2>Keyboard shortcuts</h2>
          </Dialog.Title>
          <Dialog.Close className="sp-icon-btn" aria-label="Close">
            <kbd className="sp-kbd">esc</kbd>
          </Dialog.Close>
        </div>
        <div className="sp-modal-body">
          <Dialog.Description id="sp-shortcuts-desc" className="sp-sr-only">
            Global keyboard shortcuts. Single-character shortcuts can be turned off.
          </Dialog.Description>
          <label className="sp-wcag-toggle">
            <span>
              <strong>Single-key shortcuts</strong>
              <span className="sp-cmd-item-sub">WCAG 2.1.4 — turn off if they clash with speech input or assistive tech. ⌘K always works.</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={singleKeys}
              onChange={(e) => {
                setSingleKeys(e.currentTarget.checked);
                setSingleKeyShortcuts(e.currentTarget.checked);
              }}
            />
          </label>
          {SECTIONS.map((s) => (
            <section key={s.title} className="sp-shortcut-section">
              <h3>{s.title}</h3>
              {s.rows.map(([action, label]) => (
                <div key={action} className="sp-shortcut-row">
                  <span>{label}</span>
                  <span className="sp-shortcut-keys">
                    {kbdHint(action)
                      .split(' ')
                      .map((k) => (
                        <kbd key={k} className="sp-kbd">
                          {k}
                        </kbd>
                      ))}
                  </span>
                </div>
              ))}
            </section>
          ))}
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
