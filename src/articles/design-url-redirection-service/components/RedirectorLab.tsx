import SystemTopology from '../../../components/interactive/SystemTopology';
import CostModelCalculator from '../../../components/interactive/CostModelCalculator';
import type { CostModel, Evolution, Topology } from '../../../lib/articles/schema';

export interface RedirectorLabProps {
  /** Which part of the lab this island renders. Parts on one page share level + label state. */
  section?: 'all' | 'topology' | 'cost';
  /** Level shown until the reader picks one (v2 opens on L3, the Bloom guard). */
  defaultLevel?: number;
  evolution?: Evolution;
  topology?: Topology;
  costModels?: CostModel;
}

const SLUG = 'design-url-redirection-service';

/** Flagship lab: level picker + topology (lab mode) and the per-level AWS cost calculator. */
export default function RedirectorLab({ section = 'all', defaultLevel = 3, evolution, topology, costModels }: RedirectorLabProps) {
  return (
    <div className="sp-lab" data-section={section}>
      {section !== 'cost' ? (
        <SystemTopology slug={SLUG} mode="lab" level={defaultLevel} evolution={evolution} topology={topology} costModels={costModels} />
      ) : null}
      {section !== 'topology' ? (
        <CostModelCalculator slug={SLUG} defaultLevel={defaultLevel} evolution={evolution} costModels={costModels} />
      ) : null}
    </div>
  );
}
