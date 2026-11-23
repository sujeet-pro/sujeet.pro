import { useId, useState } from 'react';
import { CostModelSchema, EvolutionSchema } from '../../lib/articles/schema';
import type { CostModel, Evolution } from '../../lib/articles/schema';
import { useArticleData } from '../../hooks/useArticleData';
import { setLabLevel, useLabState } from './labStore';
import './interactive.css';

export interface CostModelCalculatorProps {
  slug: string;
  /** Optional build-time data (skips the fetch). */
  costModels?: CostModel;
  evolution?: Evolution;
  /** Pin a tier. When omitted, the tier follows the shared lab level (stage `costTierId`). */
  tierId?: string;
  /** Level used until the reader picks one in the lab. */
  defaultLevel?: number;
}

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const isAssumption = (s: string) => /^ASSUMPTION:/i.test(s.trim());
const fmtRequests = (m: number) => (m >= 1000 ? `${(m / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}B` : `${m}M`);

/**
 * Renders CostModelSchema rows for one tier: AWS list total, enterprise range from
 * `enterpriseDiscountRangePct`, a point estimate from a discount slider, `pricingAsOf` and source links,
 * and an "illustrative assumption" badge on every line whose `assumption` starts with "ASSUMPTION:".
 */
export default function CostModelCalculator({ slug, costModels, evolution, tierId, defaultLevel = 0 }: CostModelCalculatorProps) {
  const cost = useArticleData(slug, 'data/cost-models.json', CostModelSchema, costModels);
  // The evolution file maps levels → tiers; not needed when the tier is pinned.
  const evo = useArticleData(slug, 'data/evolution.json', EvolutionSchema, tierId ? ({ subject: '', stages: [] } as unknown as Evolution) : evolution);
  const lab = useLabState();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const model = cost.data;
  const [lo, hi] = model?.enterpriseDiscountRangePct ?? [25, 40];
  const [discount, setDiscount] = useState<number | null>(null);
  const pct = discount ?? Math.round((lo + hi) / 2);

  if (cost.error || evo.error) {
    return <div className="sp-cost sp-topo-error" role="alert">Cost model failed to load: {(cost.error ?? evo.error)?.message}</div>;
  }
  if (!model || (!tierId && !evo.data)) {
    return <div className="sp-cost sp-cost--loading" aria-busy="true">Loading cost model…</div>;
  }

  const stages = evo.data?.stages ?? [];
  const level = Math.max(0, Math.min(stages.length - 1, lab.level ?? defaultLevel));
  const stage = tierId ? undefined : stages[level];
  const tier = model.tiers.find((t) => t.id === (tierId ?? stage?.costTierId));
  if (!tier) {
    return <div className="sp-cost sp-topo-error" role="alert">No cost tier for {tierId ?? `L${level}`}.</div>;
  }

  const list = tier.components.reduce((a, c) => a + c.monthlyListUsd, 0);
  const entLow = list * (1 - Math.max(lo, hi) / 100);
  const entHigh = list * (1 - Math.min(lo, hi) / 100);
  const point = list * (1 - pct / 100);
  const anyAssumed = tier.components.some((c) => isAssumption(c.assumption));

  return (
    <div className="sp-cost" data-tier={tier.id}>
      <div className="sp-cost-head">
        <div>
          <p className="sp-inspector-eyebrow">AWS economics · {model.region}</p>
          <h3 className="sp-cost-title">{tier.label}</h3>
          <p className="sp-cost-sub">{fmtRequests(tier.monthlyRequestsM)} redirects / month</p>
        </div>
        {!tierId && stages.length > 1 ? (
          <label className="sp-cost-level">
            <span>Level</span>
            <select value={level} onChange={(e) => setLabLevel(Number(e.target.value))}>
              {stages.map((s) => (
                <option key={s.level} value={s.level}>
                  L{s.level} · {s.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {anyAssumed ? (
        <p className="sp-cost-warn" role="note">
          <span className="sp-badge-assume">modelled volume</span> Unit prices are AWS list prices (us-east-1, sources below); request and storage volumes per level are modelling assumptions, explained on each marked line.
        </p>
      ) : null}

      <div className="sp-table-scroll" tabIndex={0} role="region" aria-label={`Cost components for ${tier.label}`}>
        <table className="sp-cost-table">
          <thead>
            <tr>
              <th scope="col">Component</th>
              <th scope="col">AWS service</th>
              <th scope="col" className="sp-num">List $/mo</th>
              <th scope="col">Basis</th>
            </tr>
          </thead>
          <tbody>
            {tier.components.map((c) => (
              <tr key={c.name}>
                <th scope="row">{c.name}</th>
                <td className="sp-mono">{c.awsService}</td>
                <td className="sp-num sp-mono">{usd(c.monthlyListUsd)}</td>
                <td className="sp-cost-basis">
                  {isAssumption(c.assumption) ? <span className="sp-badge-assume" title={c.assumption}>assumption</span> : null}
                  <span>{c.assumption.replace(/^ASSUMPTION:\s*/i, '')}</span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={2}>AWS list total</th>
              <td className="sp-num sp-mono"><strong>{usd(list)}</strong></td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="sp-cost-summary">
        <div className="sp-cost-stat">
          <span className="sp-cost-stat-label">Enterprise range ({Math.min(lo, hi)}–{Math.max(lo, hi)}% off list)</span>
          <span className="sp-cost-stat-value sp-mono">{usd(entLow)}–{usd(entHigh)}/mo</span>
        </div>
        <div className="sp-cost-stat">
          <label htmlFor={`${uid}-disc`} className="sp-cost-stat-label">
            Point estimate at <strong>{pct}%</strong> off list <span className="sp-badge-assume">assumed discount range</span>
          </label>
          <input
            id={`${uid}-disc`}
            type="range"
            min={Math.min(lo, hi)}
            max={Math.max(lo, hi)}
            step={1}
            value={pct}
            aria-valuetext={`${pct} percent off list, ${usd(point)} per month`}
            onChange={(e) => setDiscount(Number(e.target.value))}
            className="sp-range"
          />
          <span className="sp-cost-stat-value sp-mono">{usd(point)}/mo</span>
        </div>
      </div>

      <p className="sp-cost-sources">
        Pricing as of <time dateTime={model.pricingAsOf}>{model.pricingAsOf}</time> · Sources:{' '}
        {model.sources.map((s, i) => (
          <span key={s.url}>
            {i > 0 ? ', ' : ''}
            <a href={s.url} rel="noopener noreferrer" target="_blank">{s.label}</a>
          </span>
        ))}
      </p>
    </div>
  );
}
