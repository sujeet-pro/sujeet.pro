/**
 * "Copy AI Prompt" action (plan 4.5). Builds a prompt that cites the article's `llms-full.txt` and copies it with
 * `navigator.clipboard.writeText`; when the clipboard is unavailable or denied, a Radix dialog shows the prompt in a
 * pre-selected readonly <textarea>. Subscribes to the dispatcher's `copyAiPrompt` action (key `l`, palette command)
 * from inside the island: no second keydown listener (P14/P23). Dialog focus rules follow P15.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { spConfig } from '../../sp.config.ts';
import { on } from '../lib/keyboard/dispatcher.ts';

interface Props {
  slug: string;
  title: string;
}

export function buildPrompt(slug: string, title: string): string {
  const url = new URL(`/${slug}/llms-full.txt`, spConfig.siteUrl).href;
  return [
    `Use this page as the source of truth: ${url}`,
    '',
    `It is the full plain-text edition of "${title}" by ${spConfig.author.name}. Read it first, then answer my questions about it and cite the section or level you rely on. If something is not covered there, say so instead of guessing.`,
  ].join('\n');
}

export default function CopyAiPrompt({ slug, title }: Props) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement | null>(null);
  const area = useRef<HTMLTextAreaElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prompt = buildPrompt(slug, title);

  const run = useCallback(async () => {
    const ae = document.activeElement;
    opener.current = ae instanceof HTMLElement && ae !== document.body && !ae.closest('[role="dialog"]') ? ae : btn.current;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2500);
    } catch {
      setOpen(true);
    }
  }, [prompt]);

  useEffect(() => {
    const off = on('copyAiPrompt', () => {
      void run();
    });
    const onSwap = () => setOpen(false);
    document.addEventListener('astro:before-swap', onSwap);
    return () => {
      off();
      document.removeEventListener('astro:before-swap', onSwap);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [run]);

  return (
    <>
      <button type="button" ref={btn} className="sp-action-btn" onClick={() => void run()} data-sp-copy-ai-prompt>
        {copied ? 'Copied ✓' : 'Copy AI Prompt'}
      </button>
      <span className="sp-sr-only" role="status" aria-live="polite">
        {copied ? 'AI prompt copied to clipboard' : ''}
      </span>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="sp-dialog-overlay" />
          <Dialog.Content
            className="sp-dialog-content sp-ai-dialog"
            aria-describedby="sp-ai-desc"
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              area.current?.focus();
              area.current?.select();
            }}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              const el = opener.current;
              opener.current = null;
              if (el && document.contains(el)) el.focus();
            }}
          >
            <div className="sp-modal-header">
              <Dialog.Title asChild>
                <h2>Copy AI prompt</h2>
              </Dialog.Title>
              <Dialog.Close className="sp-icon-btn" aria-label="Close">
                <kbd className="sp-kbd">esc</kbd>
              </Dialog.Close>
            </div>
            <div className="sp-modal-body">
              <Dialog.Description id="sp-ai-desc" className="sp-cmd-item-sub">
                The clipboard is not available here. Select the text below and copy it manually.
              </Dialog.Description>
              <textarea ref={area} className="sp-ai-textarea" readOnly rows={7} value={prompt} aria-label="AI prompt" onFocus={(e) => e.currentTarget.select()} />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
