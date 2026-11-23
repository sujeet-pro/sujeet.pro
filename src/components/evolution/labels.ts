// Shared, build-time display helpers for the evolution components (Stage 3.9).
import type { CostModel, EvolutionStage, Topology, TopologyNode } from '../../lib/articles/schema';

export const MODE_LABEL: Record<EvolutionStage['mode'], string> = { baseline: 'baseline', extend: 'extend', replace: 'replace ↻' };

export const TRIGGER_LABEL: Record<NonNullable<EvolutionStage['trigger']>['kind'], string> = {
  launch: 'Launch',
  scale: 'Scale',
  business: 'Business',
  incident: 'Incident',
  'feature-request': 'Feature request',
  cost: 'Cost',
  org: 'Org',
};

export const nodeLabel = (n: TopologyNode | undefined, id: string): string => n?.label ?? id;

/** Monthly AWS list total for a cost tier, or undefined when the stage has none. */
export function tierTotal(costModels: CostModel | undefined, tierId: string | undefined): number | undefined {
  const tier = tierId ? costModels?.tiers.find((t) => t.id === tierId) : undefined;
  return tier ? tier.components.reduce((a, c) => a + c.monthlyListUsd, 0) : undefined;
}

export const usd = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;

/** Ladder one-liner: "+ added · − removed" (client/DNS omitted as always-present plumbing). */
export function headlineDecision(stage: EvolutionStage, topology: Topology): string {
  const byId = new Map(topology.nodes.map((n) => [n.id, n]));
  const name = (id: string) => nodeLabel(byId.get(id), id);
  const adds = stage.decision.add.filter((id) => !['client', 'dns'].includes(byId.get(id)?.kind ?? ''));
  const parts: string[] = [];
  if (adds.length) parts.push(`+ ${adds.map(name).join(', ')}`);
  if (stage.decision.remove.length) parts.push(`− ${stage.decision.remove.map(name).join(', ')}`);
  if (!parts.length && stage.decision.change.length) parts.push(`~ ${stage.decision.change.map(name).join(', ')}`);
  return parts.join(' · ');
}
