/**
 * Fixed-aspect frame for step-by-step visuals (Stage 3.7 file list). The box size never depends on its
 * content, so swapping the active step (or hydrating late) causes zero layout shift (P25/P27).
 */
import type { CSSProperties, ReactNode } from 'react';

interface Props {
  /** CSS aspect-ratio, e.g. `'16 / 9'` or a topology viewBox ratio like `'960 / 540'`. */
  aspect?: string;
  /** Accessible name for the group (e.g. "Step 2 of 5: cache miss"). */
  label?: string;
  /** Current step, exposed as `data-step` for styling/tests. */
  step?: number;
  className?: string;
  children?: ReactNode;
}

const frame: CSSProperties = {
  position: 'relative',
  width: '100%',
  overflow: 'hidden',
  contain: 'layout paint',
};

export default function StepFrame({ aspect = '16 / 9', label, step, className, children }: Props) {
  return (
    <div
      role={label ? 'group' : undefined}
      aria-label={label}
      data-step={step}
      className={['sp-step-frame', className].filter(Boolean).join(' ')}
      style={{ ...frame, aspectRatio: aspect }}
    >
      {children}
    </div>
  );
}
