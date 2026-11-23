import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { EvolutionSchema, TopologySchema, CostModelSchema } from '../../lib/articles/schema';
import type { CostModel, Evolution, Topology, TopologyEdge, TopologyNode } from '../../lib/articles/schema';
import { activeSet, costBand, levelDiff, type StageDiff } from '../../lib/articles/evolution';
import { useArticleData } from '../../hooks/useArticleData';
import ScaleVariantSwitcher, { type LevelOption } from './ScaleVariantSwitcher';
import { setLabCloud, setLabLevel, useLabState, type Cloud } from './labStore';
import './interactive.css';

export type TopologyMode = 'stage' | 'diff' | 'lab';
export type NodeState = 'healthy' | 'degraded' | 'failed';

export interface SystemTopologyProps {
  /** Article slug; data is fetched from `/<slug>/data/*.json` unless passed in. */
  slug: string;
  mode?: TopologyMode;
  /** Level to draw (`stage`/`diff`); initial level for `lab` until the reader picks one. */
  level?: number;
  /** `diff` only: compare against this level (default `level - 1`). */
  fromLevel?: number;
  /** Optional build-time data (skips the fetch; zero CLS). */
  evolution?: Evolution;
  topology?: Topology;
  /** `lab` only: used for the cost band on each level card. */
  costModels?: CostModel;
  /** Initial label set for `stage`/`diff` (the lab uses the shared lab store). */
  cloud?: Cloud;
  /**
   * `figure`: compact layout for a fixed-aspect `ExplainerFigure` frame (Stage 3.10). No node is pre-selected,
   * the inspector is an overlay that opens on a node click and closes with its button or Esc, and the toolbar
   * floats over the diagram, so the frame never changes size (CLS 0).
   */
  variant?: 'default' | 'figure';
  /**
   * Static rendering (Stage 4.1 `render-visuals.mjs`): draw `diff` as a non-interactive image — diff
   * highlighting stays, but no toolbar, inspector, status dots or focusable nodes.
   */
  static?: boolean;
}

const W = 128;
const H = 72;
const STATE_TEXT: Record<NodeState, string> = { healthy: 'OK', degraded: 'SLOW ×10', failed: 'DOWN' };
const STATE_WORD: Record<NodeState, string> = { healthy: 'healthy', degraded: '10× latency', failed: 'outage' };
const STATE_COLOR: Record<NodeState, string> = {
  healthy: 'var(--sp-status-healthy)',
  degraded: 'var(--sp-status-degraded)',
  failed: 'var(--sp-status-failed)',
};

interface Box { x: number; y: number; w: number; h: number }
interface Pt { x: number; y: number }

/** Attach points on facing sides (same rule as the v2 prototype). */
function anchors(a: Box, b: Box): [Pt, Pt] {
  if (b.x > a.x + a.w) return [{ x: a.x + a.w, y: a.y + a.h / 2 }, { x: b.x, y: b.y + b.h / 2 }];
  if (b.x + b.w < a.x) return [{ x: a.x, y: a.y + a.h / 2 }, { x: b.x + b.w, y: b.y + b.h / 2 }];
  if (b.y > a.y) return [{ x: a.x + a.w / 2, y: a.y + a.h }, { x: b.x + b.w / 2, y: b.y }];
  return [{ x: a.x + a.w / 2, y: a.y }, { x: b.x + b.w / 2, y: b.y + b.h }];
}

const qAt = (p0: Pt, c: Pt, p2: Pt, t: number): Pt => ({
  x: (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * c.x + t * t * p2.x,
  y: (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * c.y + t * t * p2.y,
});

const hitsAny = (p: Pt, boxes: Box[]) => boxes.some((b) => p.x > b.x - 4 && p.x < b.x + b.w + 4 && p.y > b.y - 4 && p.y < b.y + b.h + 4);

/** Quadratic edge that bends around any node box in the way (fixed positions → deterministic). */
function route(a: Box, b: Box, obstacles: Box[]) {
  const [p0, p2] = anchors(a, b);
  const len = Math.hypot(p2.x - p0.x, p2.y - p0.y) || 1;
  const nx = -(p2.y - p0.y) / len;
  const ny = (p2.x - p0.x) / len;
  const mid = { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 };
  let c = { x: mid.x, y: mid.y - 8 };
  for (const off of [-8, 70, -70, 120, -120, 170, -170]) {
    const cand = { x: mid.x + nx * off, y: mid.y + ny * off };
    let clear = true;
    for (let i = 1; i < 20 && clear; i++) if (hitsAny(qAt(p0, cand, p2, i / 20), obstacles)) clear = false;
    if (clear) {
      c = cand;
      break;
    }
  }
  const m = qAt(p0, c, p2, 0.5);
  return { d: `M ${p0.x} ${p0.y} Q ${c.x} ${c.y} ${p2.x} ${p2.y}`, lx: m.x, ly: m.y - 8, len };
}

function wrapLabel(text: string, max = 12): string[] {
  const lines: string[] = [''];
  for (const w of text.split(' ')) {
    const cur = lines[lines.length - 1];
    if (!cur) lines[lines.length - 1] = w;
    else if (`${cur} ${w}`.length <= max) lines[lines.length - 1] = `${cur} ${w}`;
    else lines.push(w);
  }
  return lines.length > 2 ? [lines[0], lines.slice(1).join(' ')] : lines;
}

const nameOf = (n: TopologyNode, cloud: Cloud) => (cloud === 'aws' ? n.awsLabel ?? n.label : n.label);

/** Upstream nodes whose request path runs through `id` (reverse BFS over request/write edges). */
function upstreamOf(id: string, edges: TopologyEdge[]): string[] {
  const rev = new Map<string, string[]>();
  for (const e of edges) {
    if (e.kind === 'async' || e.kind === 'fallback') continue;
    rev.set(e.to, [...(rev.get(e.to) ?? []), e.from]);
  }
  const seen = new Set<string>();
  const queue = [id];
  while (queue.length) {
    for (const p of rev.get(queue.shift()!) ?? []) {
      if (!seen.has(p) && p !== id) {
        seen.add(p);
        queue.push(p);
      }
    }
  }
  return [...seen];
}

export default function SystemTopology(props: SystemTopologyProps) {
  const { slug, mode = 'stage', costModels, variant = 'default' } = props;
  const isFigure = variant === 'figure';
  const rootRef = useRef<HTMLDivElement>(null);
  const evo = useArticleData(slug, 'data/evolution.json', EvolutionSchema, props.evolution);
  const topo = useArticleData(slug, 'data/topology.json', TopologySchema, props.topology);
  // The cost file is optional and only used by the lab's cost bands.
  const cost = useArticleData(slug, 'data/cost-models.json', CostModelSchema, mode === 'lab' ? costModels ?? undefined : ({} as CostModel));
  const lab = useLabState();
  const uid = `sp-topo-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const evolution = evo.data;
  const topology = topo.data;
  const maxLevel = evolution ? evolution.stages.length - 1 : 0;
  const clamp = (n: number) => Math.max(0, Math.min(maxLevel, n));
  const level = clamp(mode === 'lab' ? lab.level ?? props.level ?? 0 : props.level ?? 0);
  const [localCloud, setLocalCloud] = useState<Cloud>(props.cloud ?? 'aws');
  const cloud = mode === 'lab' ? lab.cloud : localCloud;
  const [showDiff, setShowDiff] = useState(false);
  const diffOn = mode === 'diff' || (mode === 'lab' && showDiff && level > 0);
  const fromLevel = clamp(mode === 'diff' ? props.fromLevel ?? level - 1 : level - 1);
  const interactive = mode !== 'stage' && !props.static;

  const [faults, setFaults] = useState<Record<string, NodeState>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');

  const view = useMemo(() => {
    if (!evolution || !topology) return null;
    const byId = new Map(topology.nodes.map((n) => [n.id, n]));
    const active = new Set(activeSet(evolution, level));
    const nodes = topology.nodes.filter((n) => active.has(n.id));
    const diff: StageDiff = diffOn && fromLevel < level ? levelDiff(evolution, fromLevel, level) : { added: [], changed: [], removed: [] };
    const ghosts = diff.removed.map((id) => byId.get(id)).filter((n): n is TopologyNode => !!n);
    const before = new Set(diffOn ? activeSet(evolution, fromLevel) : []);
    const edges = topology.edges.filter((e) => active.has(e.from) && active.has(e.to));
    const ghostEdges = diffOn
      ? topology.edges.filter((e) => e.kind !== 'fallback' && before.has(e.from) && before.has(e.to) && !(active.has(e.from) && active.has(e.to)))
      : [];
    const addedEdges = new Set(
      diffOn ? edges.filter((e) => !(before.has(e.from) && before.has(e.to))).map((e) => `${e.from}>${e.to}`) : [],
    );
    return { byId, active, nodes, diff, ghosts, edges, ghostEdges, addedEdges };
  }, [evolution, topology, level, fromLevel, diffOn]);

  // Keep the selection on an active node (lab/diff).
  const selectedId =
    view && interactive
      ? selected && view.active.has(selected)
        ? selected
        : isFigure
          ? null
          : (view.nodes[Math.min(2, view.nodes.length - 1)]?.id ?? null)
      : null;
  const closeInspector = () => {
    const id = selectedId;
    setSelected(null);
    if (id) rootRef.current?.querySelector<SVGGElement>(`[data-node-id="${id}"]`)?.focus();
  };

  useEffect(() => setAnnounce(''), [level]);

  if (evo.error || topo.error) {
    return (
      <div className="sp-topo sp-topo-error" role="alert">
        Topology data failed to load: {(evo.error ?? topo.error)?.message}
      </div>
    );
  }

  const vb = topology?.viewBox ?? [0, 0, 960, 540];
  const aspect = `${vb[2]} / ${vb[3]}`;
  const stage = evolution?.stages[level];
  const stateOf = (id: string): NodeState => (interactive ? faults[id] ?? 'healthy' : 'healthy');

  const setFault = (id: string, s: NodeState) => {
    setFaults((f) => {
      const next = { ...f };
      if (s === 'healthy') delete next[id];
      else next[id] = s;
      return next;
    });
    const n = view?.byId.get(id);
    if (n) setAnnounce(`${nameOf(n, cloud)} set to ${STATE_WORD[s]}.`);
  };
  const resetFaults = () => {
    setFaults({});
    setAnnounce('All nodes reset to healthy.');
  };

  // Fallback edges show only while a failed node sits between their endpoints.
  const failed = new Set(Object.entries(faults).filter(([, s]) => s === 'failed').map(([id]) => id));
  const normalEdges = view ? view.edges.filter((e) => e.kind !== 'fallback') : [];
  const has = (from: string, to: string) => normalEdges.some((e) => e.from === from && e.to === to);
  const shownFallbacks = view
    ? view.edges.filter((e) => e.kind === 'fallback' && !failed.has(e.to) && [...failed].some((x) => has(e.from, x) && has(x, e.to)))
    : [];

  const boxOf = (n: TopologyNode): Box => ({ x: n.x, y: n.y, w: W, h: H });
  // A removed node whose slot is reused by an added node (e.g. svc → rules at L5) is drawn as a
  // struck-through caption under that node instead of a full ghost box, so the two never overlap.
  const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const captionGhost = new Set(
    view ? view.ghosts.filter((g) => view.nodes.some((n) => overlaps(boxOf(n), boxOf(g)))).map((g) => g.id) : [],
  );
  const allBoxes = view
    ? [...view.nodes, ...view.ghosts.filter((g) => !captionGhost.has(g.id))].map((n) => ({ id: n.id, box: boxOf(n) }))
    : [];
  const obstaclesFor = (a: string, b: string) => allBoxes.filter((o) => o.id !== a && o.id !== b).map((o) => o.box);

  const levels: LevelOption[] = (evolution?.stages ?? []).map((s) => {
    const tier = cost.data?.tiers?.find((t) => t.id === s.costTierId);
    const total = tier ? tier.components.reduce((a, c) => a + c.monthlyListUsd, 0) : undefined;
    return { level: s.level, title: s.title, mode: s.mode, costBand: total !== undefined ? costBand(total) : undefined };
  });

  const selNode = selectedId && view ? view.byId.get(selectedId) : undefined;
  const selState = selNode ? stateOf(selNode.id) : 'healthy';
  const callers = selNode && view ? upstreamOf(selNode.id, view.edges).map((id) => view.byId.get(id)!).filter(Boolean) : [];
  const selFallbackEdge = selNode ? shownFallbacks.find((e) => has(e.from, selNode.id) && has(selNode.id, e.to)) : undefined;
  const faultCount = Object.keys(faults).filter((id) => view?.active.has(id)).length;

  const onNodeKey = (id: string) => (ev: KeyboardEvent<SVGGElement>) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      setSelected(id);
    }
  };

  const summary = stage
    ? `L${stage.level} · ${stage.title}${diffOn && view ? ` — vs L${fromLevel}: ${view.diff.added.length} added, ${view.diff.changed.length} changed, ${view.diff.removed.length} removed` : ''}`
    : 'Loading topology…';

  return (
    <div ref={rootRef} className={`sp-topo sp-topo--${mode}${isFigure ? ' sp-topo--figure' : ''}`} data-mode={mode} data-level={level}>
      {mode === 'lab' ? (
        <ScaleVariantSwitcher
          levels={levels}
          level={level}
          onLevelChange={(l) => setLabLevel(l)}
          cloud={cloud}
          onCloudChange={setLabCloud}
        />
      ) : null}

      {interactive ? (
        <div className="sp-topo-toolbar">
          <p className="sp-topo-summary">
            <strong>{summary}</strong>
            {mode === 'lab' && stage?.trigger ? <span> — {stage.trigger.headline}</span> : null}
          </p>
          <div className="sp-topo-tools">
            {mode === 'lab' ? (
              <label className="sp-check">
                <input type="checkbox" checked={showDiff && level > 0} disabled={level === 0} onChange={(e) => setShowDiff(e.target.checked)} />
                <span>Show changes vs L{Math.max(0, level - 1)}</span>
              </label>
            ) : (
              <div role="radiogroup" aria-label="Component labels" className="sp-seg">
                {(['generic', 'aws'] as const).map((c) => (
                  <label key={c} className="sp-seg-opt">
                    <input type="radio" name={`${uid}-cloud`} value={c} checked={cloud === c} onChange={() => setLocalCloud(c)} />
                    <span>{c === 'aws' ? 'AWS' : 'Generic'}</span>
                  </label>
                ))}
              </div>
            )}
            <button type="button" className="sp-btn" onClick={resetFaults} disabled={faultCount === 0}>
              Reset{faultCount ? ` (${faultCount})` : ''}
            </button>
          </div>
        </div>
      ) : null}

      <div className={interactive ? 'sp-topo-grid' : undefined}>
        <div className="sp-topo-frame" style={{ aspectRatio: aspect }}>
          <div className="sp-topo-scroll">
            <svg
              viewBox={vb.join(' ')}
              className="sp-topo-svg"
              style={{ aspectRatio: aspect }}
              role={interactive ? 'group' : 'img'}
              aria-label={`${evolution?.subject ?? 'System'} topology, ${summary}`}
            >
              <defs>
                {([
                  ['arrow', 'var(--sp-ink-muted)'],
                  ['add', 'var(--sp-status-healthy)'],
                  ['fail', 'var(--sp-status-failed)'],
                  ['slow', 'var(--sp-status-degraded)'],
                  ['fb', 'var(--sp-status-fallback)'],
                ] as const).map(([k, fill]) => (
                  <marker key={k} id={`${uid}-${k}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M 0 1 L 10 5 L 0 9 z" fill={fill} />
                  </marker>
                ))}
              </defs>

              {view?.ghostEdges.filter((e) => !captionGhost.has(e.from) && !captionGhost.has(e.to)).map((e) => {
                const a = view.byId.get(e.from)!;
                const b = view.byId.get(e.to)!;
                const r = route(boxOf(a), boxOf(b), obstaclesFor(a.id, b.id));
                return (
                  <g key={`g-${e.from}>${e.to}`} data-diff="removed" data-edge={`${e.from}>${e.to}`} opacity="0.5">
                    <path d={r.d} fill="none" stroke="var(--sp-status-failed)" strokeWidth={1.6} strokeDasharray="3 5" />
                  </g>
                );
              })}

              {view && [...normalEdges, ...shownFallbacks].map((e) => {
                const a = view.byId.get(e.from)!;
                const b = view.byId.get(e.to)!;
                const r = route(boxOf(a), boxOf(b), obstaclesFor(a.id, b.id));
                const dst = stateOf(e.to);
                const isFb = e.kind === 'fallback';
                const isAdded = view.addedEdges.has(`${e.from}>${e.to}`);
                const [stroke, marker] = isFb
                  ? ['var(--sp-status-fallback)', 'fb']
                  : dst === 'failed'
                    ? ['var(--sp-status-failed)', 'fail']
                    : dst === 'degraded'
                      ? ['var(--sp-status-degraded)', 'slow']
                      : isAdded
                        ? ['var(--sp-status-healthy)', 'add']
                        : ['var(--sp-ink-muted)', 'arrow'];
                const dash = isFb ? '7 4' : dst === 'failed' ? '2 5' : e.kind === 'async' ? '5 5' : undefined;
                const labelInk = isFb ? 'var(--sp-status-fallback)' : isAdded ? 'var(--sp-diff-add-ink)' : 'var(--sp-ink-muted)';
                return (
                  <g key={`${e.from}>${e.to}`} data-edge={`${e.from}>${e.to}`} data-kind={e.kind} data-diff={isAdded ? 'added' : undefined}>
                    <path d={r.d} fill="none" stroke={stroke} strokeWidth={isFb || isAdded ? 2.4 : 1.7} strokeDasharray={dash} markerEnd={`url(#${uid}-${marker})`} />
                    {e.label && r.len >= 96 ? (
                      <text x={r.lx} y={r.ly} textAnchor="middle" fontSize="14" className="sp-topo-edge-label" fill={labelInk}>
                        {e.label}
                      </text>
                    ) : null}
                  </g>
                );
              })}

              {view?.ghosts.map((n) => {
                const lines = wrapLabel(nameOf(n, cloud), 13);
                if (captionGhost.has(n.id)) {
                  return (
                    <g key={`ghost-${n.id}`} data-diff="removed" data-node-ghost={n.id} role="img" aria-label={`${nameOf(n, cloud)}, removed at L${level}`}>
                      <rect x={n.x} y={n.y + H + 6} width={W} height={22} rx={11} fill="var(--sp-status-failed-soft)" stroke="var(--sp-status-failed)" strokeWidth={1.2} strokeDasharray="5 4" />
                      <text x={n.x + W / 2} y={n.y + H + 21} textAnchor="middle" fontSize="12" className="sp-topo-tag" fill="var(--sp-diff-rm-ink)" textDecoration="line-through">
                        − {nameOf(n, cloud)}
                      </text>
                    </g>
                  );
                }
                return (
                  <g key={`ghost-${n.id}`} data-diff="removed" data-node-ghost={n.id} role="img" aria-label={`${nameOf(n, cloud)}, removed at L${level}`}>
                    <rect x={n.x} y={n.y} width={W} height={H} rx={10} fill="var(--sp-surface-subtle)" fillOpacity={0.6} stroke="var(--sp-status-failed)" strokeWidth={1.8} strokeDasharray="5 4" />
                    <rect x={n.x + 6} y={n.y - 13} width={84} height={20} rx={10} fill="var(--sp-status-failed-soft)" stroke="var(--sp-status-failed)" strokeWidth={1} />
                    <text x={n.x + 48} y={n.y + 1} textAnchor="middle" fontSize="12" className="sp-topo-tag" fill="var(--sp-diff-rm-ink)">− removed</text>
                    {lines.map((ln, i) => (
                      <text key={i} x={n.x + W / 2} y={n.y + 38 + i * 18 - (lines.length - 1) * 8} textAnchor="middle" fontSize="15" fill="var(--sp-ink-muted)" textDecoration="line-through" opacity={0.8}>
                        {ln}
                      </text>
                    ))}
                  </g>
                );
              })}

              {view?.nodes.map((n) => {
                const s = stateOf(n.id);
                const isSel = selectedId === n.id;
                const isAdded = view.diff.added.includes(n.id);
                const isChanged = view.diff.changed.includes(n.id);
                const name = nameOf(n, cloud);
                const lines = wrapLabel(name);
                const stroke = isSel ? 'var(--sp-accent)' : isAdded ? 'var(--sp-status-healthy)' : isChanged ? 'var(--sp-accent-border)' : interactive ? STATE_COLOR[s] : 'var(--sp-border-strong)';
                const diffWord = isAdded ? `, added at L${level}` : isChanged ? `, changed at L${level}` : '';
                const top = lines.length > 1 ? 40 : 48;
                return (
                  <g
                    key={n.id}
                    data-node-id={n.id}
                    data-state={s}
                    data-diff={isAdded ? 'added' : isChanged ? 'changed' : undefined}
                    className={interactive ? 'sp-topo-node' : 'sp-topo-node-static'}
                    {...(interactive
                      ? {
                          role: 'button',
                          tabIndex: 0,
                          'aria-pressed': isSel,
                          'aria-label': `Inspect ${name} (${STATE_WORD[s]}${diffWord})`,
                          onClick: () => setSelected(n.id),
                          onKeyDown: onNodeKey(n.id),
                        }
                      : {})}
                  >
                    <title>{n.awsLabel ? `${n.label} · ${n.awsLabel}` : n.label}</title>
                    <rect className="sp-topo-box" x={n.x} y={n.y} width={W} height={H} rx={10} fill={s === 'failed' ? 'var(--sp-status-failed-soft)' : 'var(--sp-surface)'} stroke={stroke} strokeWidth={isSel ? 3 : isAdded ? 2.6 : 1.8} />
                    {interactive ? (
                      <>
                        <circle cx={n.x + 12} cy={n.y + 14} r={5} fill={STATE_COLOR[s]} />
                        <text x={n.x + 22} y={n.y + 18} fontSize="12" fontWeight={700} className="sp-topo-mono" fill={STATE_COLOR[s]}>
                          {STATE_TEXT[s]}
                        </text>
                      </>
                    ) : null}
                    {lines.map((ln, i) => (
                      <text key={i} x={n.x + W / 2} y={n.y + top + i * 18 - (interactive ? 0 : 6)} textAnchor="middle" fontSize="15" fontWeight={700} fill="var(--sp-ink)">
                        {ln}
                      </text>
                    ))}
                    {isAdded || isChanged ? (
                      <>
                        <rect x={n.x + W - 76} y={n.y - 13} width={70} height={20} rx={10} fill={isAdded ? 'var(--sp-status-healthy-soft)' : 'var(--sp-accent-soft)'} stroke={isAdded ? 'var(--sp-status-healthy)' : 'var(--sp-accent-border)'} strokeWidth={1} />
                        <text x={n.x + W - 41} y={n.y + 1} textAnchor="middle" fontSize="12" className="sp-topo-tag" fill={isAdded ? 'var(--sp-diff-add-ink)' : 'var(--sp-accent)'}>
                          {isAdded ? '+ added' : '~ changed'}
                        </text>
                      </>
                    ) : null}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {interactive && (!isFigure || selNode) ? (
          <aside
            className={`sp-inspector${isFigure ? ' sp-inspector--overlay' : ''}`}
            aria-label="Failure inspector"
            onKeyDown={
              isFigure
                ? (ev) => {
                    if (ev.key === 'Escape') {
                      ev.preventDefault();
                      ev.stopPropagation();
                      closeInspector();
                    }
                  }
                : undefined
            }
          >
            {isFigure ? (
              <button type="button" className="sp-inspector-close" aria-label="Close inspector" onClick={closeInspector}>
                ✕
              </button>
            ) : null}
            {selNode ? (
              <>
                <p className="sp-inspector-eyebrow">Inspector · {selNode.kind}</p>
                <h3 className="sp-inspector-title">{nameOf(selNode, cloud)}</h3>
                <p className="sp-inspector-sub">{cloud === 'aws' ? selNode.label : selNode.awsLabel ?? selNode.label}</p>
                <div role="group" aria-label={`Inject state for ${nameOf(selNode, cloud)}`} className="sp-fault-group">
                  {(['healthy', 'degraded', 'failed'] as const).map((s) => (
                    <button key={s} type="button" className="sp-fault-btn" data-fault={s} aria-pressed={selState === s} onClick={() => setFault(selNode.id, s)}>
                      {s === 'healthy' ? 'Healthy' : s === 'degraded' ? '10× latency' : 'Outage'}
                    </button>
                  ))}
                </div>
                <h4 className="sp-inspector-h">{selState === 'healthy' ? 'Blast radius if it fails' : 'Blast radius'}</h4>
                <ul className="sp-inspector-list">
                  {(selNode.failure?.blastRadius ?? ['No failure notes for this component.']).map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                  <li>
                    Upstream on the request path:{' '}
                    {callers.length ? callers.map((c) => nameOf(c, cloud)).join(', ') : 'none'}.
                  </li>
                </ul>
                {selNode.failure?.fallback ? (
                  <p className="sp-inspector-fallback" data-active={selFallbackEdge ? 'true' : 'false'}>
                    <span className="sp-dot" aria-hidden="true" /> Fallback: {selNode.failure.fallback}
                    {selFallbackEdge ? ' (path drawn in violet)' : ''}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="sp-inspector-empty">Select a component to inject a failure.</p>
            )}
            <ul className="sp-legend" aria-label="Legend">
              <li><span className="sp-dot" style={{ background: 'var(--sp-status-healthy)' }} />Healthy</li>
              <li><span className="sp-dot" style={{ background: 'var(--sp-status-degraded)' }} />Degraded / slow</li>
              <li><span className="sp-dot" style={{ background: 'var(--sp-status-failed)' }} />Failed</li>
              <li><span className="sp-dot" style={{ background: 'var(--sp-status-fallback)' }} />Fallback path</li>
            </ul>
          </aside>
        ) : null}
      </div>
      <p className="sp-topo-sr" aria-live="polite">{announce}</p>
    </div>
  );
}
