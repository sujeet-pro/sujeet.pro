// Stage layout CSS (Stage 3.9, §4.1 owner pick `hybrid`). Generated at build time from spConfig.layout,
// because a media-query breakpoint cannot come from a CSS custom property.
//   - `base` layout applies unconditionally (narrow viewports, print, and data-sp-export="pdf").
//   - `wide` layout applies only inside `@media screen and (min-width: <wideMinPx>px)` and never in the PDF route.
// One DOM per stage; no JS measurement, so switching layouts never shifts content after first paint.
import { spConfig } from '../../../sp.config.ts';

type Arrangement = 'stacked' | 'split';

/** Rules for one arrangement. Each sets every property the other one sets, so they override cleanly. */
function rules(kind: Arrangement): string {
  if (kind === 'split') {
    return [
      '.sp-stage-body{grid-template-columns:minmax(0,60ch) minmax(0,1fr);grid-template-areas:"main fig" "dec fig"}',
      '.sp-stage-figwrap{position:sticky;top:calc(var(--sp-topbar-h) + 20px)}',
      '.sp-stage-decision{display:block;border:0;background:transparent;padding:0}',
    ].join('');
  }
  return [
    '.sp-stage-body{grid-template-columns:minmax(0,1fr);grid-template-areas:"main" "fig" "dec"}',
    '.sp-stage-figwrap{position:static}',
    // Decision / cost strip as one card when there is room for two columns.
    '@media (min-width:901px){.sp-stage-decision{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);column-gap:20px;align-items:start;border:1px solid var(--sp-border);border-radius:var(--sp-radius-md);background:var(--sp-surface);padding:14px}.sp-stage-decision>.sp-decision{grid-row:span 3;margin:0}}',
  ].join('');
}

/** Wrap every selector of a flat rule list with a prefix (handles one level of nested @media). */
function scope(css: string, prefix: string): string {
  return css.replace(/(^|[{}])\s*(\.[^{@]+)\{/g, (_m, lead: string, sel: string) => `${lead}${sel.split(',').map((s) => `${prefix} ${s.trim()}`).join(',')}{`);
}

export interface StageLayout {
  variant: 'split' | 'scrolly' | 'stacked' | 'stepper' | 'hybrid';
  base: Arrangement;
  wide: Arrangement;
  wideMinPx: number;
}

export function stageLayout(): StageLayout {
  const l = spConfig.layout;
  // Only `stacked` and `split` ship (§4.1 rule d); non-hybrid picks map onto one arrangement.
  if (l.stageVariant === 'hybrid') return { variant: 'hybrid', base: l.hybrid.base, wide: l.hybrid.wide, wideMinPx: l.hybrid.wideMinPx };
  const one: Arrangement = l.stageVariant === 'split' ? 'split' : 'stacked';
  return { variant: l.stageVariant, base: one, wide: one, wideMinPx: l.hybrid.wideMinPx };
}

/** CSS emitted once per page by the first `EvolutionStage`. */
export function stageLayoutCss(): string {
  const { base, wide, wideMinPx } = stageLayout();
  // A `split` base still stacks below 901px (figure after bullets), in print as well.
  const baseCss = base === 'split' ? `${rules('stacked')}@media (min-width:901px){${scope(rules('split'), ':root')}}` : rules('stacked');
  if (wide === base) return baseCss;
  return `${baseCss}@media screen and (min-width:${wideMinPx}px){${scope(rules(wide), ':root:not([data-sp-export="pdf"])')}}`;
}
