/**
 * Fixed-aspect `<figure>` for charts (Stage 3.7 file list). The plot area reserves its box before the chart
 * renders, so client-side drawing never shifts layout; the optional caption sits below in normal flow.
 */
import type { CSSProperties, ReactNode } from 'react';

interface Props {
  /** CSS aspect-ratio of the plot area. */
  aspect?: string;
  /** Visible caption (also the figure's accessible description). */
  caption?: ReactNode;
  /** Accessible name when the chart itself is an image-like SVG/canvas without its own label. */
  label?: string;
  className?: string;
  children?: ReactNode;
}

const figure: CSSProperties = { margin: 0, width: '100%' };
const plot: CSSProperties = { position: 'relative', width: '100%', overflow: 'hidden' };
const cap: CSSProperties = { marginTop: 8, fontSize: '0.82rem', color: 'var(--sp-ink-muted)' };

export default function ChartFrame({ aspect = '16 / 9', caption, label, className, children }: Props) {
  return (
    <figure className={['sp-chart-frame', className].filter(Boolean).join(' ')} style={figure} aria-label={label}>
      <div className="sp-chart-frame-plot" style={{ ...plot, aspectRatio: aspect }}>
        {children}
      </div>
      {caption && <figcaption style={cap}>{caption}</figcaption>}
    </figure>
  );
}
