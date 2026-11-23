/**
 * Persistent audio bar (Stage 3.7). Mounted by ArticleLayout as
 * `<AudioPlayer client:idle transition:persist="sp-audio-player" … />` only when `features.audio` is true and
 * `audio/chapters.json` + `audio/episode.mp3` exist. Exactly one `<audio preload="none">` lives here.
 *
 * Lifetime across ClientRouter navigation:
 * - same article (Article ⇄ Lab tab): the island persists with identical props → no re-render, playback continues;
 * - different article with audio: Astro copies the new props in → the `slug` effect stops and resets;
 * - different article without audio: no persist target → Astro unmounts the island → cleanup pauses;
 * - non-article page (home, explore, series…): BaseLayout renders a `[data-sp-audio-host]` placeholder; if playback
 *   has started, `astro:before-swap` tags it as the persist target so the bar keeps playing there.
 *
 * Keyboard: subscribes to dispatcher actions only (P14/P23) — never its own keydown listener.
 * A11y: one polite announcement per chapter change; the scrub is an `<input type="range">` (dispatcher ignores it).
 */
import { useEffect, useRef, useState } from 'react';
import { on } from '../lib/keyboard/dispatcher.ts';

export interface AudioChapterProp {
  id: string;
  title: string;
  startSec: number;
  endSec: number;
  /** Resolved page URL (`/<slug>/` or `/<slug>/<page>/`) of the chapter's target section. */
  targetUrl?: string;
  targetSectionId?: string;
  /** Short label for "Jump to …" (e.g. `L2`, `Ladder`, a heading). */
  jumpLabel?: string;
}

interface Props {
  slug: string;
  srcUrl: string;
  chaptersUrl: string;
  title: string;
  author: string;
  durationSec: number;
  chapters: AudioChapterProp[];
}

type Drawer = null | 'chapters' | 'transcript';
type SpWindow = Window & { __spAudioReady?: boolean; __spAudioPending?: boolean };

const SPEEDS = [1, 1.25, 1.5, 1.75, 2];
const SKIP_SEC = 15;
const PERSIST_ID = 'sp-audio-player';

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function chapterIndexAt(chapters: AudioChapterProp[], sec: number): number {
  let idx = 0;
  for (let i = 0; i < chapters.length; i++) if (sec + 0.001 >= chapters[i].startSec) idx = i;
  return idx;
}

const samePath = (a: string, b: string) => a.replace(/\/+$/, '') === b.replace(/\/+$/, '');
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function AudioPlayer({ slug, srcUrl, chaptersUrl, title, author, durationSec, chapters }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [rate, setRate] = useState(1);
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [autoFollow, setAutoFollow] = useState(false); // §9.1: default OFF
  const [transcripts, setTranscripts] = useState<Record<string, string[]> | 'loading' | 'error' | null>(null);
  const [announce, setAnnounce] = useState('');

  const idx = chapterIndexAt(chapters, pos);
  const chapter = chapters[idx];
  const duration = durationSec;

  const lastIdx = useRef(idx);
  const seekIdx = useRef(-1); // chapter a manual seek landed in: that change never triggers Auto-Follow
  const programmaticUntil = useRef(0); // scrolls before this timestamp are ours, not the reader's
  const drawerToggleRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const slugRef = useRef(slug);

  // ---------------------------------------------------------------- actions
  const markProgrammatic = (ms = 1500) => {
    programmaticUntil.current = performance.now() + ms;
  };

  const seekTo = (sec: number) => {
    const a = audioRef.current;
    const t = Math.max(0, Math.min(duration, sec));
    seekIdx.current = chapterIndexAt(chapters, t);
    if (a) {
      try {
        a.currentTime = t;
      } catch {
        /* not seekable yet (preload="none" before first play): the position state still moves */
      }
    }
    setPos(t);
  };

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      // A seek made before the first load is stored as the default playback start position.
      a.play().catch(() => setPlaying(false));
    } else {
      a.pause();
    }
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    markProgrammatic(3000);
    el.scrollIntoView({ behavior: prefersReducedMotion() ? 'instant' : 'smooth', block: 'start' });
    history.replaceState(history.state, '', `#${id}`);
  };

  const jumpTo = async (ch: AudioChapterProp | undefined) => {
    if (!ch?.targetSectionId) return;
    const id = ch.targetSectionId;
    const url = ch.targetUrl ?? location.pathname;
    if (samePath(location.pathname, url)) {
      scrollToSection(id);
      return;
    }
    markProgrammatic(5000); // the router's scroll-to-top during the swap is ours too
    document.addEventListener('astro:page-load', () => requestAnimationFrame(() => scrollToSection(id)), { once: true });
    const { navigate } = await import('astro:transitions/client');
    await navigate(url);
  };

  const openDrawer = (mode: Exclude<Drawer, null>) => {
    setDrawer((cur) => (cur === mode ? null : mode));
    if (mode === 'transcript' && transcripts === null) {
      setTranscripts('loading');
      const forSlug = slug;
      fetch(chaptersUrl)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((j: { chapters?: Array<{ id: string; transcript?: string[] }> }) => {
          if (forSlug !== slugRef.current) return;
          const map: Record<string, string[]> = {};
          for (const c of j.chapters ?? []) map[c.id] = c.transcript ?? [];
          setTranscripts(map);
        })
        .catch(() => {
          if (forSlug === slugRef.current) setTranscripts('error');
        });
    }
  };

  const closeDrawer = () => {
    const hadFocus = !!drawerRef.current?.contains(document.activeElement);
    setDrawer(null);
    if (hadFocus) drawerToggleRef.current?.focus();
  };

  const reveal = () => {
    setCollapsed(false);
  };

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(rate) + 1) % SPEEDS.length];
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  // Latest-closure bridge for long-lived listeners.
  const api = useRef({ toggle, seekTo, jumpTo, closeDrawer, reveal, pos, chapter, idx, drawer });
  api.current = { toggle, seekTo, jumpTo, closeDrawer, reveal, pos, chapter, idx, drawer };

  // ---------------------------------------------------------------- media element events
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => setPos(a.currentTime);
    const onEnded = () => setPlaying(false);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('seeked', onTime);
    a.addEventListener('ended', onEnded);
    // Persisted across a navigation: resync from the element.
    setPlaying(!a.paused);
    if (a.currentTime > 0) setPos(a.currentTime);
    return () => {
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('seeked', onTime);
      a.removeEventListener('ended', onEnded);
    };
  }, []);

  // ---------------------------------------------------------------- stop/reset on a different article
  useEffect(() => {
    if (slugRef.current === slug) return;
    slugRef.current = slug;
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.playbackRate = 1;
    }
    setPlaying(false);
    setPos(0);
    setRate(1);
    setDrawer(null);
    setTranscripts(null);
    setAutoFollow(false);
    setAnnounce('');
    lastIdx.current = 0;
    seekIdx.current = -1;
  }, [slug]);

  // ---------------------------------------------------------------- chapter change: announce + Auto-Follow
  useEffect(() => {
    if (idx === lastIdx.current) return;
    lastIdx.current = idx;
    const fromSeek = seekIdx.current === idx;
    seekIdx.current = -1;
    setAnnounce(`Now playing: ${chapters[idx]?.title ?? ''}`);
    if (autoFollow && playing && !fromSeek) void jumpTo(chapters[idx]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  // ---------------------------------------------------------------- Auto-Follow pauses on manual scroll
  useEffect(() => {
    if (!autoFollow) return;
    const off = () => setAutoFollow(false);
    const onScroll = () => {
      if (performance.now() > programmaticUntil.current) off();
    };
    const onScrollEnd = () => {
      programmaticUntil.current = 0;
    };
    window.addEventListener('wheel', off, { passive: true });
    window.addEventListener('touchmove', off, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true }); // keyboard, scrollbar, j/k
    window.addEventListener('scrollend', onScrollEnd);
    return () => {
      window.removeEventListener('wheel', off);
      window.removeEventListener('touchmove', off);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('scrollend', onScrollEnd);
    };
  }, [autoFollow]);

  // ---------------------------------------------------------------- dispatcher, palette, Listen buttons, router
  useEffect(() => {
    const offs = [
      on('toggleAudio', () => api.current.toggle()),
      on('seekBack', () => api.current.seekTo(api.current.pos - SKIP_SEC)),
      on('seekForward', () => api.current.seekTo(api.current.pos + SKIP_SEC)),
    ];
    const onJump = () => void api.current.jumpTo(api.current.chapter);
    const onEscape = () => {
      if (api.current.drawer) api.current.closeDrawer();
    };
    const onClick = (ev: MouseEvent) => {
      const t = ev.target as Element | null;
      if (!t?.closest('[data-sp-audio-listen]')) return;
      api.current.reveal();
      api.current.toggle();
    };
    const onBeforeSwap = (ev: Event) => {
      const nd = (ev as Event & { newDocument?: Document }).newDocument;
      if (!nd || nd.querySelector(`[data-astro-transition-persist="${PERSIST_ID}"]`)) return;
      const a = audioRef.current;
      const host = nd.querySelector('[data-sp-audio-host]');
      const started = !!a && (!a.paused || a.currentTime > 0);
      if (host && started) host.setAttribute('data-astro-transition-persist', PERSIST_ID);
      else a?.pause(); // a different article without audio, or nothing started: the island is dropped
    };
    document.addEventListener('sp:audio-jump', onJump);
    document.addEventListener('sp:escape', onEscape);
    document.addEventListener('click', onClick);
    document.addEventListener('astro:before-swap', onBeforeSwap);

    const w = window as SpWindow;
    w.__spAudioReady = true;
    if (w.__spAudioPending) {
      w.__spAudioPending = false;
      api.current.reveal();
      api.current.toggle();
    }
    return () => {
      offs.forEach((off) => off());
      document.removeEventListener('sp:audio-jump', onJump);
      document.removeEventListener('sp:escape', onEscape);
      document.removeEventListener('click', onClick);
      document.removeEventListener('astro:before-swap', onBeforeSwap);
      w.__spAudioReady = false;
      audioRef.current?.pause();
    };
  }, []);

  // Keep the article header's Listen button(s) in sync, including on pages swapped in later.
  useEffect(() => {
    const sync = () => {
      for (const b of document.querySelectorAll<HTMLElement>('[data-sp-audio-listen]')) {
        if (b.dataset.spAudioListen !== slugRef.current) continue;
        const label = playing ? `❚❚ Pause · ${formatTime(duration)}` : `▶ Listen · ${formatTime(duration)}`;
        if (b.textContent !== label) b.textContent = label;
      }
    };
    sync();
    document.addEventListener('astro:page-load', sync);
    return () => document.removeEventListener('astro:page-load', sync);
  }, [playing, duration, slug]);

  // ---------------------------------------------------------------- Media Session
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const set = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        /* action unsupported by this browser */
      }
    };
    set('play', () => audioRef.current?.play().catch(() => {}));
    set('pause', () => audioRef.current?.pause());
    set('seekbackward', (d) => api.current.seekTo(api.current.pos - (d.seekOffset ?? SKIP_SEC)));
    set('seekforward', (d) => api.current.seekTo(api.current.pos + (d.seekOffset ?? SKIP_SEC)));
    set('seekto', (d) => {
      if (typeof d.seekTime === 'number') api.current.seekTo(d.seekTime);
    });
    set('previoustrack', () => api.current.seekTo(chapters[Math.max(0, api.current.idx - 1)].startSec));
    set('nexttrack', () => {
      const next = chapters[api.current.idx + 1];
      if (next) api.current.seekTo(next.startSec);
    });
    return () => {
      for (const a of ['play', 'pause', 'seekbackward', 'seekforward', 'seekto', 'previoustrack', 'nexttrack'] as const) set(a, null);
      ms.metadata = null;
      ms.playbackState = 'none';
    };
  }, [chapters]);

  useEffect(() => {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: chapter?.title ?? title, artist: author, album: title });
  }, [chapter?.title, title, author]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    try {
      navigator.mediaSession.setPositionState?.({ duration, playbackRate: rate, position: Math.min(pos, duration) });
    } catch {
      /* invalid state while metadata loads */
    }
    // Position is refreshed on play/pause/seek/rate; the OS extrapolates in between.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, rate, duration, Math.floor(pos / 5)]);

  // ---------------------------------------------------------------- render
  const playLabel = playing ? 'Pause audio' : 'Play audio';
  const playGlyph = playing ? '❚❚' : '▶';
  const jumpText = chapter?.jumpLabel ? `↗ Jump to ${chapter.jumpLabel}` : '↗ Jump to section';

  return (
    <aside
      id="sp-audio-bar"
      className="sp-audio-bar sp-app-shell"
      aria-label="Audio player"
      data-sp-audio-player={slug}
      data-collapsed={collapsed ? 'true' : 'false'}
      data-pagefind-ignore=""
    >
      <audio ref={audioRef} preload="none" src={srcUrl} />

      <div id="sp-audio-drawer" ref={drawerRef} className="sp-audio-drawer" role="region" aria-label="Audio chapters and transcript" hidden={!drawer || collapsed}>
        <div className="sp-audio-drawer-inner sp-container">
          <div className="sp-audio-drawer-head">
            <strong>
              {drawer === 'transcript' ? 'Transcript' : `Chapters · ${chapters.length} · ${formatTime(duration)}`}
            </strong>
            <button type="button" className="sp-audio-mini-btn" onClick={closeDrawer}>
              Close
            </button>
          </div>
          {drawer === 'chapters' && (
            <ol className="sp-chapter-list" aria-label="Chapters">
              {chapters.map((ch, i) => (
                <li key={ch.id} className="sp-chapter-row">
                  <button
                    type="button"
                    className="sp-chapter-seek"
                    data-sp-chapter={ch.id}
                    aria-current={i === idx ? 'true' : undefined}
                    onClick={() => seekTo(ch.startSec)}
                  >
                    <span>{ch.title}</span>
                    <span className="sp-mono">{formatTime(ch.startSec)}</span>
                  </button>
                  {ch.targetSectionId && (
                    <button
                      type="button"
                      className="sp-audio-mini-btn"
                      aria-label={`Jump to ${ch.jumpLabel ?? 'section'}`}
                      onClick={() => void jumpTo(ch)}
                    >
                      ↗ {ch.jumpLabel ?? '§'}
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
          {drawer === 'transcript' && (
            <div>
              {transcripts === 'loading' || transcripts === null ? (
                <p className="sp-audio-time">Loading transcript…</p>
              ) : transcripts === 'error' ? (
                <p className="sp-audio-time">Transcript unavailable.</p>
              ) : (
                chapters.map((ch, i) => (
                  <div key={ch.id} className="sp-transcript-ch" data-current={i === idx ? 'true' : 'false'}>
                    <div className="sp-transcript-ch-head">
                      <span>{ch.title}</span>
                      <button type="button" className="sp-audio-mini-btn sp-mono" aria-label={`Play from ${formatTime(ch.startSec)}`} onClick={() => seekTo(ch.startSec)}>
                        {formatTime(ch.startSec)}
                      </button>
                    </div>
                    {(transcripts[ch.id] ?? []).map((p, j) => (
                      <p key={j}>{p}</p>
                    ))}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <div className="sp-audio-inner sp-container">
        <div className="sp-audio-top">
          <div className="sp-audio-ch">
            <span aria-hidden="true">🎧</span>
            <span className="sp-audio-ch-title" title={chapter?.title}>
              {chapter?.title ?? title}
            </span>
          </div>
          <div className="sp-audio-meta-btns">
            <button
              type="button"
              className="sp-audio-mini-btn sp-audio-jump"
              title="Jump to the section discussed in this chapter"
              disabled={!chapter?.targetSectionId}
              onClick={() => void jumpTo(chapter)}
            >
              {jumpText}
            </button>
            <button
              type="button"
              className="sp-audio-mini-btn"
              aria-expanded={drawer === 'chapters'}
              aria-controls="sp-audio-drawer"
              onClick={(e) => {
                drawerToggleRef.current = e.currentTarget;
                openDrawer('chapters');
              }}
            >
              Chapters
            </button>
            <button
              type="button"
              className="sp-audio-mini-btn"
              aria-expanded={drawer === 'transcript'}
              aria-controls="sp-audio-drawer"
              onClick={(e) => {
                drawerToggleRef.current = e.currentTarget;
                openDrawer('transcript');
              }}
            >
              Transcript
            </button>
            <button
              type="button"
              className="sp-audio-mini-btn"
              aria-pressed={autoFollow}
              title="Scroll to each chapter's section as it plays (pauses when you scroll)"
              onClick={() => setAutoFollow((v) => !v)}
            >
              Auto-Follow: {autoFollow ? 'On' : 'Off'}
            </button>
            <button
              type="button"
              className="sp-audio-mini-btn sp-audio-keep"
              aria-label={playLabel}
              hidden={!collapsed}
              onClick={toggle}
            >
              {playGlyph}
            </button>
            <button
              type="button"
              className="sp-audio-mini-btn sp-audio-keep"
              aria-expanded={!collapsed}
              aria-label={collapsed ? 'Expand audio player' : 'Collapse audio player'}
              onClick={() => {
                setCollapsed((c) => !c);
                setDrawer(null);
              }}
            >
              {collapsed ? '⌃' : '⌄'}
            </button>
          </div>
          <span className="sp-sr-only" aria-live="polite">
            {announce}
          </span>
        </div>

        <div className="sp-audio-controls">
          <button type="button" className="sp-audio-mini-btn" title="Back 15 s ([)" aria-label="Seek back 15 seconds" onClick={() => seekTo(pos - SKIP_SEC)}>
            ◀15
          </button>
          <button type="button" className="sp-audio-play" title="Play / Pause (p)" aria-label={playLabel} data-sp-audio-play="" onClick={toggle}>
            {playGlyph}
          </button>
          <button type="button" className="sp-audio-mini-btn" title="Forward 15 s (])" aria-label="Seek forward 15 seconds" onClick={() => seekTo(pos + SKIP_SEC)}>
            15▶
          </button>
          <span className="sp-audio-time">{formatTime(pos)}</span>
          <input
            className="sp-audio-scrub"
            type="range"
            min={0}
            max={Math.max(1, Math.round(duration))}
            step={1}
            value={Math.floor(pos)}
            aria-label="Playback position"
            aria-valuetext={`${formatTime(pos)} of ${formatTime(duration)}`}
            onChange={(e) => seekTo(Number(e.currentTarget.value))}
          />
          <span className="sp-audio-time sp-audio-total">{formatTime(duration)}</span>
          <button type="button" className="sp-audio-mini-btn sp-audio-speed" title="Playback speed" aria-label={`Playback speed ${rate}×`} onClick={cycleSpeed}>
            {rate}×
          </button>
        </div>
      </div>
    </aside>
  );
}
