import { useId } from 'react';
import type { Cloud } from './labStore';
import './interactive.css';

export interface LevelOption {
  level: number;
  title: string;
  mode: 'baseline' | 'extend' | 'replace';
  /** e.g. "$$$" — derived from the stage's cost tier. */
  costBand?: string;
}

export interface ScaleVariantSwitcherProps {
  levels: LevelOption[];
  level: number;
  onLevelChange: (level: number) => void;
  cloud: Cloud;
  onCloudChange: (cloud: Cloud) => void;
  /** Accessible name of the radiogroup. */
  label?: string;
}

const MODE_LABEL: Record<LevelOption['mode'], string> = { baseline: 'baseline', extend: 'extend', replace: 'replace ↻' };

/**
 * Level picker over evolution.json (supersedes the v1 tier1/2/3 list): one native radio per stage
 * (`L<n> · <title>`, mode badge, cost band) plus the Generic ↔ AWS label toggle.
 * Native radios give arrow-key roving for free and the global dispatcher ignores inputs (P14).
 */
export default function ScaleVariantSwitcher({ levels, level, onLevelChange, cloud, onCloudChange, label = 'Evolution level' }: ScaleVariantSwitcherProps) {
  const name = `sp-level-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const cloudName = `${name}-cloud`;
  return (
    <div className="sp-lab-picker">
      <div role="radiogroup" aria-label={label} className="sp-level-grid">
        {levels.map((o) => (
          <label key={o.level} className="sp-level-card" data-mode={o.mode}>
            <input
              type="radio"
              name={name}
              value={o.level}
              checked={o.level === level}
              onChange={() => onLevelChange(o.level)}
              className="sp-level-input"
            />
            <span className="sp-level-head">
              <span className="sp-level-num">L{o.level}</span>
              <span className="sp-level-mode" data-mode={o.mode}>{MODE_LABEL[o.mode]}</span>
              {o.costBand ? <span className="sp-level-cost" aria-label={`cost band ${o.costBand.length} of 4`}>{o.costBand}</span> : null}
            </span>
            <span className="sp-level-title">{o.title}</span>
          </label>
        ))}
      </div>
      <div role="radiogroup" aria-label="Component labels" className="sp-seg">
        {(['generic', 'aws'] as const).map((c) => (
          <label key={c} className="sp-seg-opt">
            <input type="radio" name={cloudName} value={c} checked={cloud === c} onChange={() => onCloudChange(c)} />
            <span>{c === 'aws' ? 'AWS' : 'Generic'}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
