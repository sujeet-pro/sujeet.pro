import { useState } from 'react';

export interface ExploreNode {
  id: string;
  kind: 'series' | 'article' | 'block';
  label: string;
  /** Archetype slug (articles and blocks). */
  archetype?: string;
  tag: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Series slugs this node belongs to (articles/blocks) or `[own slug]` (series). */
  series: string[];
  desc: string;
  href: string;
}
export interface ExploreEdge {
  from: string;
  to: string;
  kind: string;
}
interface Props {
  nodes: ExploreNode[];
  edges: ExploreEdge[];
  width: number;
  height: number;
  archetypes: Array<{ id: string; label: string }>;
  seriesOptions: Array<{ id: string; label: string }>;
}

/** Edge direction (relations[] semantics): the source points to what it depends on. Styles per plan §9.1. */
const EDGE_STYLE: Record<string, { stroke: string; dash?: string; label: string }> = {
  member: { stroke: 'var(--sp-status-healthy)', label: 'member of' },
  prerequisite: { stroke: 'var(--sp-accent)', label: 'prerequisite' },
  'uses-building-block': { stroke: 'var(--sp-status-fallback)', dash: '5 3', label: 'uses building block' },
  related: { stroke: 'var(--sp-ink-muted)', dash: '1 4', label: 'related' },
};
// builds-on / deep-dive-of are dependency edges too; §9.1 defines no separate style, so they share `prerequisite`.
const styleOf = (kind: string) =>
  EDGE_STYLE[kind] ?? (kind === 'builds-on' || kind === 'deep-dive-of' ? { ...EDGE_STYLE.prerequisite, label: kind.replace(/-/g, ' ') } : EDGE_STYLE.related);

function edgePath(a: ExploreNode, b: ExploreNode): string {
  let x1: number, y1: number, x2: number, y2: number;
  if (b.x > a.x + a.w) {
    x1 = a.x + a.w; y1 = a.y + a.h / 2; x2 = b.x; y2 = b.y + b.h / 2;
  } else if (a.x > b.x + b.w) {
    x1 = a.x; y1 = a.y + a.h / 2; x2 = b.x + b.w; y2 = b.y + b.h / 2;
  } else if (b.y > a.y) {
    x1 = a.x + a.w / 2; y1 = a.y + a.h; x2 = b.x + b.w / 2; y2 = b.y;
  } else {
    x1 = a.x + a.w / 2; y1 = a.y; x2 = b.x + b.w / 2; y2 = b.y + b.h;
  }
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

const KIND_LABEL = { series: 'Series', article: 'Article', block: 'Building block' } as const;
const COLUMN_TITLE: Array<{ kind: ExploreNode['kind']; text: string }> = [
  { kind: 'series', text: 'SERIES' },
  { kind: 'article', text: 'ARTICLES' },
  { kind: 'block', text: 'BUILDING BLOCKS' },
];

export default function ExploreGraph({ nodes, edges, width, height, archetypes, seriesOptions }: Props) {
  const [series, setSeries] = useState('all');
  const [archetype, setArchetype] = useState('all');
  const [selected, setSelected] = useState<string | null>(
    (nodes.find((n) => n.kind === 'article') ?? nodes[0])?.id ?? null,
  );

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const content = nodes.filter((n) => n.kind !== 'series');
  const contentVisible = (n: ExploreNode) =>
    (series === 'all' || n.series.includes(series)) && (archetype === 'all' || n.archetype === archetype);
  const visible = new Set<string>();
  for (const n of content) if (contentVisible(n)) visible.add(n.id);
  for (const n of nodes) {
    if (n.kind !== 'series') continue;
    const matchesSeries = series === 'all' || n.series.includes(series);
    const hasMember = content.some((c) => visible.has(c.id) && c.series.includes(n.series[0]));
    if (matchesSeries && hasMember) visible.add(n.id);
  }
  const sel = selected ? byId.get(selected) : undefined;
  const out = sel ? edges.filter((e) => e.from === sel.id) : [];
  const inc = sel ? edges.filter((e) => e.to === sel.id) : [];
  const edgeText = (e: ExploreEdge, other: string, outgoing: boolean) => {
    const o = byId.get(other)?.label ?? other;
    const k = e.kind === 'member' ? (outgoing ? 'includes' : 'member of') : styleOf(e.kind).label;
    return `${k} · ${o}`;
  };
  const activate = (id: string) => setSelected(id);

  return (
    <div className="sp-xp-card">
      <div className="sp-xp-toolbar">
        <div className="sp-xp-group">
          <span className="sp-xp-label" id="sp-xp-series-label">Series</span>
          <div className="sp-filter-group" role="group" aria-labelledby="sp-xp-series-label">
            {[{ id: 'all', label: 'All' }, ...seriesOptions].map((o) => (
              <button key={o.id} type="button" className="sp-filter-pill" aria-pressed={series === o.id} data-xp-series={o.id} onClick={() => setSeries(o.id)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="sp-xp-group">
          <span className="sp-xp-label" id="sp-xp-arch-label">Archetype</span>
          <div className="sp-filter-group" role="group" aria-labelledby="sp-xp-arch-label">
            {[{ id: 'all', label: 'All' }, ...archetypes].map((o) => (
              <button key={o.id} type="button" className="sp-filter-pill" aria-pressed={archetype === o.id} data-xp-archetype={o.id} onClick={() => setArchetype(o.id)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="sp-xp-grid">
        <div className="sp-xp-stage">
          <div className="sp-xp-svgwrap">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              role="group"
              aria-label="Knowledge graph of published series, articles and building blocks. Use Tab to move between nodes and Enter to preview."
            >
              <defs>
                <marker id="sp-xp-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--sp-ink-muted)" />
                </marker>
              </defs>
              {COLUMN_TITLE.map((c) => {
                const col = nodes.filter((n) => n.kind === c.kind);
                const x = col[0]?.x ?? (c.kind === 'series' ? 20 : c.kind === 'article' ? 280 : 570);
                return (
                  <g key={c.kind} aria-hidden="true">
                    <text x={x} y={20} fontSize="10" fontFamily="var(--sp-font-mono)" fontWeight="600" letterSpacing="0.6" fill="var(--sp-ink-muted)">{c.text}</text>
                    {col.length === 0 && (
                      <text x={x} y={52} fontSize="11.5" fill="var(--sp-ink-muted)">None published yet</text>
                    )}
                  </g>
                );
              })}
              {edges.map((e, i) => {
                const a = byId.get(e.from);
                const b = byId.get(e.to);
                if (!a || !b) return null;
                const st = styleOf(e.kind);
                const hl = selected === e.from || selected === e.to;
                return (
                  <path
                    key={i}
                    className="sp-xp-edge"
                    data-kind={e.kind}
                    data-hidden={!(visible.has(a.id) && visible.has(b.id))}
                    d={edgePath(a, b)}
                    fill="none"
                    stroke={st.stroke}
                    strokeWidth={hl ? 2.4 : 1.5}
                    strokeDasharray={st.dash ?? 'none'}
                    strokeLinecap="round"
                    markerEnd="url(#sp-xp-arrow)"
                    opacity={hl ? 1 : 0.75}
                  >
                    <title>{`${a.label} → ${st.label} → ${b.label}`}</title>
                  </path>
                );
              })}
              {nodes.map((n) => {
                const isSel = selected === n.id;
                const stroke = n.kind === 'series' ? 'var(--sp-status-healthy)' : n.kind === 'block' ? 'var(--sp-status-fallback)' : 'var(--sp-accent)';
                const fill = n.kind === 'series' ? 'var(--sp-status-healthy-soft)' : n.kind === 'block' ? 'var(--sp-surface-subtle)' : 'var(--sp-surface)';
                const label = n.label.length > 30 ? `${n.label.slice(0, 29)}…` : n.label;
                return (
                  <g
                    key={n.id}
                    className="sp-xp-node"
                    tabIndex={0}
                    role="button"
                    aria-pressed={isSel}
                    aria-label={`${n.tag.toLowerCase()}: ${n.label}`}
                    data-xp-node={n.id}
                    data-hidden={!visible.has(n.id)}
                    onClick={() => activate(n.id)}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault();
                        activate(n.id);
                      }
                    }}
                  >
                    <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={n.kind === 'series' ? n.h / 2 : 9} fill={fill} stroke={isSel ? 'var(--sp-ink)' : stroke} strokeWidth={isSel ? 2.6 : 1.6} />
                    <text x={n.x + n.w / 2} y={n.y + 19} textAnchor="middle" fontSize="9" fontFamily="var(--sp-font-mono)" fontWeight="700" fill={stroke}>{n.tag}</text>
                    <text x={n.x + n.w / 2} y={n.y + 37} textAnchor="middle" fontSize="12.5" fontWeight="650" fill="var(--sp-ink)">{label}</text>
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="sp-xp-legend" aria-label="Edge type legend">
            {(['member', 'prerequisite', 'uses-building-block', 'related'] as const).map((k) => {
              const st = EDGE_STYLE[k];
              return (
                <span key={k}>
                  <svg width="28" height="8" aria-hidden="true">
                    <line x1="0" y1="4" x2="28" y2="4" stroke={st.stroke} strokeWidth="2" strokeDasharray={st.dash ?? 'none'} strokeLinecap="round" />
                  </svg>
                  {st.label}
                </span>
              );
            })}
          </div>
        </div>
        <aside className="sp-xp-side" aria-label="Node preview">
          <div className="sp-xp-label">Preview</div>
          <div className="sp-xp-preview" aria-live="polite" data-xp-preview>
            {sel ? (
              <>
                <div className="sp-card-meta">{KIND_LABEL[sel.kind]}{sel.archetype ? ` · ${sel.tag.toLowerCase()}` : ''}</div>
                <h3>{sel.label}</h3>
                <p>{sel.desc}</p>
                {out.length > 0 && (
                  <>
                    <div className="sp-xp-label">Outgoing</div>
                    <ul>{out.map((e, i) => <li key={i}>{edgeText(e, e.to, true)}</li>)}</ul>
                  </>
                )}
                {inc.length > 0 && (
                  <>
                    <div className="sp-xp-label">Referenced by</div>
                    <ul>{inc.map((e, i) => <li key={i}>{edgeText(e, e.from, false)}</li>)}</ul>
                  </>
                )}
                <a className="sp-xp-open" href={sel.href}>{sel.kind === 'series' ? 'Open series' : 'Open article'} →</a>
              </>
            ) : (
              <p>Select a node.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
