/**
 * ExplainerFigure island (Stage 3.10): `[ Image | Interactive ]` toggle, multi-figure gallery and the
 * Expand dialog for one stage's figures.
 *
 * - The static figure(s) arrive as server-rendered children (`[data-sp-fig-slide]`), so the island ships
 *   no topology code. `SystemTopology` is fetched with a dynamic `import()` on the first Interactive
 *   intent only (P27) and mounts inside the same fixed-aspect frame (CLS 0).
 * - Gallery arrow keys are handled by an element-level listener while focus is inside the figure
 *   controls; no global keydown listener (single-owner dispatcher, P14/P23).
 * - Expand opens a Radix dialog with hidden-free Title + Description; focus returns to the Expand
 *   button on close (P15, mirrors CommandPalette).
 */
import { useCallback, useEffect, useRef, useState, type ComponentType, type KeyboardEvent, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
// Type-only: erased at build time, so the island chunk carries no topology code.
import type { SystemTopologyProps } from '../interactive/SystemTopology';

export interface FigureMeta {
  alt: string;
  interactive: 'none' | 'stage' | 'diff';
}

export interface FigureModeToggleProps {
  slug: string;
  level: number;
  /** `L<n> · <title>`, used in the dialog title. */
  stageLabel: string;
  figures: FigureMeta[];
  /** Frame aspect from `topology.viewBox` ([width, height]). */
  aspect: [number, number];
  /** spConfig.layout.figureExpand */
  expand?: boolean;
  /** Prefix for element ids, e.g. `fig-l3`. */
  idBase: string;
  children?: ReactNode;
}

type Topo = ComponentType<SystemTopologyProps>;
let topoModule: Promise<Topo> | null = null;
const loadTopo = (): Promise<Topo> => {
  topoModule ??= import('../interactive/SystemTopology').then((m) => m.default);
  topoModule.catch(() => (topoModule = null));
  return topoModule;
};

type Mode = 'image' | 'interactive';

export default function FigureModeToggle(props: FigureModeToggleProps) {
  const { slug, level, stageLabel, figures, aspect, expand = true, idBase, children } = props;
  const [idx, setIdx] = useState(0);
  const [mode, setMode] = useState<Mode>('image');
  const [Topo, setTopo] = useState<Topo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [expandedHtml, setExpandedHtml] = useState('');
  const staticRef = useRef<HTMLDivElement>(null);
  const expandBtn = useRef<HTMLButtonElement>(null);

  const fig = figures[idx] ?? figures[0];
  const canInteract = fig.interactive !== 'none';
  const anyInteractive = figures.some((f) => f.interactive !== 'none');
  const shownMode: Mode = canInteract ? mode : 'image';
  const n = idx + 1;
  const label = `Fig ${level}.${n}`;
  const fromLevel = fig.interactive === 'diff' ? Math.max(0, level - 1) : level;
  const ratio = `${aspect[0]} / ${aspect[1]}`;

  // Show only the active server-rendered slide (static children are not managed by React).
  useEffect(() => {
    staticRef.current?.querySelectorAll<HTMLElement>('[data-sp-fig-slide]').forEach((el) => {
      el.hidden = el.dataset.spFigSlide !== String(idx);
    });
  }, [idx]);

  const ensureTopo = useCallback(() => {
    if (Topo) return;
    setLoadError(null);
    loadTopo()
      .then((C) => setTopo(() => C))
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, [Topo]);

  const choose = (m: Mode) => {
    setMode(m);
    if (m === 'interactive') ensureTopo();
  };

  const go = (d: 1 | -1) => setIdx((i) => Math.max(0, Math.min(figures.length - 1, i + d)));

  const onKeyDown = (ev: KeyboardEvent<HTMLDivElement>) => {
    if (figures.length < 2 || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    ev.preventDefault();
    go(ev.key === 'ArrowRight' ? 1 : -1);
  };

  const openExpand = () => {
    const slide = staticRef.current?.querySelector<HTMLElement>(`[data-sp-fig-slide="${idx}"]`);
    setExpandedHtml(slide?.innerHTML ?? '');
    if (shownMode === 'interactive') ensureTopo();
    setOpen(true);
  };

  const onOpenChange = (next: boolean) => {
    if (!next) {
      // P15: never leave focus inside a dialog that is about to be hidden.
      const ae = document.activeElement;
      if (ae instanceof HTMLElement && ae.closest('.sp-fig-dialog')) ae.blur();
    }
    setOpen(next);
  };

  const topoEl = (variant: 'figure' | 'default') =>
    Topo ? (
      <Topo key={`${idx}-${variant}`} slug={slug} mode="diff" level={level} fromLevel={fromLevel} variant={variant} />
    ) : (
      <p className="sp-fig-loading" role="status">
        {loadError ? `Interactive view failed to load: ${loadError}` : 'Loading interactive view…'}
      </p>
    );

  return (
    <figure className="sp-figure" id={`${idBase}-${n}`} data-view={shownMode} data-level={level}>
      <div className="sp-fig-bar" onKeyDown={onKeyDown}>
        {anyInteractive ? (
          <div className="sp-fig-toggle" role="group" aria-label={`${label} view`}>
            <button type="button" aria-pressed={shownMode === 'image'} onClick={() => choose('image')}>
              Image
            </button>
            <button
              type="button"
              aria-pressed={shownMode === 'interactive'}
              disabled={!canInteract}
              title={canInteract ? (fig.interactive === 'diff' && level > 0 ? `Changes vs L${level - 1}; select a component to inject a failure` : 'Select a component to inject a failure') : 'Static figure'}
              onClick={() => choose('interactive')}
            >
              Interactive
            </button>
          </div>
        ) : null}
        {figures.length > 1 ? (
          <div className="sp-fig-gallery" role="group" aria-label="Figures (arrow keys switch)">
            <button type="button" aria-label="Previous figure" disabled={idx === 0} onClick={() => go(-1)}>
              ‹
            </button>
            <span className="sp-fig-count" aria-live="polite">
              {label} · {n}/{figures.length}
            </span>
            <button type="button" aria-label="Next figure" disabled={idx === figures.length - 1} onClick={() => go(1)}>
              ›
            </button>
          </div>
        ) : null}
        {expand ? (
          <button ref={expandBtn} type="button" className="sp-fig-expand" aria-haspopup="dialog" onClick={openExpand}>
            <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14">
              <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            Expand<span className="sp-sr-only"> {label}</span>
          </button>
        ) : null}
      </div>

      <div className="sp-fig-frame" style={{ aspectRatio: ratio }}>
        <div className="sp-fig-static" ref={staticRef} hidden={shownMode === 'interactive'}>
          {children}
        </div>
        {shownMode === 'interactive' ? <div className="sp-fig-live">{topoEl('figure')}</div> : null}
      </div>

      <figcaption className="sp-fig-caption">
        <span className="sp-fig-num">{label}</span> · {fig.alt}
      </figcaption>

      {expand ? (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
          <Dialog.Portal>
            <Dialog.Overlay className="sp-dialog-overlay" />
            <Dialog.Content
              className="sp-fig-dialog"
              aria-describedby={`${idBase}-${n}-desc`}
              onCloseAutoFocus={(e) => {
                e.preventDefault();
                expandBtn.current?.focus();
              }}
            >
              <div className="sp-fig-dialog-head">
                <Dialog.Title className="sp-fig-dialog-title">
                  {label} · {stageLabel}
                  {shownMode === 'interactive' ? ' · Interactive' : ''}
                </Dialog.Title>
                <Dialog.Close className="sp-btn sp-fig-dialog-close">
                  Close <kbd className="sp-fig-kbd">Esc</kbd>
                </Dialog.Close>
              </div>
              <Dialog.Description id={`${idBase}-${n}-desc`} className="sp-sr-only">
                {fig.alt}
              </Dialog.Description>
              <div className="sp-fig-dialog-body" data-view={shownMode}>
                {shownMode === 'interactive' ? (
                  topoEl('default')
                ) : (
                  <div className="sp-fig-dialog-frame" style={{ aspectRatio: ratio }} dangerouslySetInnerHTML={{ __html: expandedHtml }} />
                )}
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      ) : null}
    </figure>
  );
}
