// Pure evolution helpers + cross-file rules E7–E10 (§4.2.1, §4.2.2, P24).
// Erasable TS only (P13): no enums/namespaces/parameter properties, type-only imports,
// so plain `node` (type stripping) can import this file from validate.mjs.
import type { CostModel, Evolution, Topology, TopologyEdge } from './schema.ts';

export type DiffOp = 'add' | 'change' | 'remove';

export interface StageDiff {
  added: string[];
  changed: string[];
  removed: string[];
}

export interface RefIssue {
  rule: 'E7' | 'E8' | 'E9' | 'E10' | 'T1' | 'T2' | 'T3';
  severity: 'error' | 'warning';
  /** e.g. `evolution.json:stages.3.decision.remove` */
  path: string;
  message: string;
}

export interface RefCheckInput {
  evolution: Evolution;
  topology: Topology;
  /** Omit when the article has no data/cost-models.json (then any costTierId is an E7 error). */
  costModels?: CostModel;
  /** `relPath` is relative to the article folder, e.g. `diagrams/stage-l0-light.webp`. */
  fileExists: (relPath: string) => boolean;
  /**
   * E9 severity. `true` → missing figure WebPs are errors. Callers pass
   * `fileExists('generated.lock.json')` until Stage 4 renders the WebPs
   * (owner deviation 2026-11-23: published fixtures still warn; Stage 6 makes it an error).
   */
  figuresRequired: boolean;
}

export interface RefCheckResult {
  errors: RefIssue[];
  warnings: RefIssue[];
}

const OPS: ReadonlyArray<readonly [DiffOp, 'add' | 'change' | 'remove']> = [
  ['add', 'add'],
  ['change', 'change'],
  ['remove', 'remove'],
];

/**
 * Active node ids at `level`, in order of introduction.
 * active(L0) = add(L0); active(Ln) = active(Ln-1) ∪ add(Ln) − remove(Ln).
 */
export function activeSet(evolution: Evolution, level: number): string[] {
  const active = new Set<string>();
  for (const s of evolution.stages) {
    if (s.level > level) break;
    for (const id of s.decision.add) active.add(id);
    for (const id of s.decision.remove) active.delete(id);
  }
  return [...active];
}

/** Edges whose endpoints are both active at `level`. */
export function activeEdges(evolution: Evolution, topology: Topology, level: number): TopologyEdge[] {
  const active = new Set(activeSet(evolution, level));
  return topology.edges.filter((e) => active.has(e.from) && active.has(e.to));
}

/** The stage's own decision as a diff (`diff(Ln)` in §4.2.2). */
export function stageDiff(evolution: Evolution, level: number): StageDiff {
  const s = evolution.stages.find((x) => x.level === level);
  if (!s) return { added: [], changed: [], removed: [] };
  return { added: [...s.decision.add], changed: [...s.decision.change], removed: [...s.decision.remove] };
}

/**
 * Diff between two arbitrary levels (`fromLevel` < `toLevel`). For adjacent levels this
 * equals `stageDiff(toLevel)` minus no-op entries. `changed` = nodes changed in
 * (fromLevel, toLevel] that are still active at `toLevel` and were already active at `fromLevel`.
 */
export function levelDiff(evolution: Evolution, fromLevel: number, toLevel: number): StageDiff {
  const before = new Set(activeSet(evolution, fromLevel));
  const after = new Set(activeSet(evolution, toLevel));
  const changed = new Set<string>();
  for (const s of evolution.stages) {
    if (s.level <= fromLevel || s.level > toLevel) continue;
    for (const id of s.decision.change) if (before.has(id) && after.has(id)) changed.add(id);
  }
  return {
    added: [...after].filter((id) => !before.has(id)),
    changed: [...changed],
    removed: [...before].filter((id) => !after.has(id)),
  };
}

/** Cross-file rules E7–E10 plus topology integrity (T1 unique ids, T2 edge endpoints, T3 unused node). */
export function checkEvolutionRefs(input: RefCheckInput): RefCheckResult {
  const { evolution, topology, costModels, fileExists, figuresRequired } = input;
  const errors: RefIssue[] = [];
  const warnings: RefIssue[] = [];
  const err = (rule: RefIssue['rule'], path: string, message: string) => errors.push({ rule, severity: 'error', path, message });
  const warn = (rule: RefIssue['rule'], path: string, message: string) => warnings.push({ rule, severity: 'warning', path, message });

  // T1/T2: topology integrity.
  const nodeIds = new Set<string>();
  topology.nodes.forEach((n, i) => {
    if (nodeIds.has(n.id)) err('T1', `topology.json:nodes.${i}.id`, `Duplicate node id "${n.id}"`);
    nodeIds.add(n.id);
  });
  topology.edges.forEach((e, i) => {
    if (!nodeIds.has(e.from)) err('T2', `topology.json:edges.${i}.from`, `Unknown node "${e.from}"`);
    if (!nodeIds.has(e.to)) err('T2', `topology.json:edges.${i}.to`, `Unknown node "${e.to}"`);
  });

  const tierIds = new Set((costModels?.tiers ?? []).map((t) => t.id));
  const everAdded = new Set<string>();
  let prev = new Set<string>();

  evolution.stages.forEach((s, i) => {
    const base = `evolution.json:stages.${i}`;

    // E7: costTierId resolves.
    if (s.costTierId !== undefined && !tierIds.has(s.costTierId)) {
      err('E7', `${base}.costTierId`, `Cost tier "${s.costTierId}" not found in data/cost-models.json tiers[].id`);
    }

    // E8: decision ids exist in topology.
    for (const [op, key] of OPS) {
      for (const id of s.decision[key]) {
        if (!nodeIds.has(id)) err('E8', `${base}.decision.${op}`, `Node "${id}" not found in data/topology.json nodes[].id`);
      }
    }

    // E9: figure WebPs exist (warning until generated.lock.json exists; see figuresRequired).
    s.figures.forEach((f, j) => {
      const missing = ['light', 'dark'].map((v) => `diagrams/${f.visual}-${v}.webp`).filter((p) => !fileExists(p));
      if (missing.length > 0) {
        const msg = `Missing figure file(s): ${missing.join(', ')}`;
        if (figuresRequired) err('E9', `${base}.figures.${j}.visual`, msg);
        else warn('E9', `${base}.figures.${j}.visual`, msg);
      }
    });

    // E10: no node before the stage that adds it; change/remove only active nodes.
    for (const id of s.decision.add) {
      if (prev.has(id)) err('E10', `${base}.decision.add`, `Node "${id}" is already active before L${s.level}`);
    }
    for (const id of s.decision.change) {
      if (!prev.has(id)) err('E10', `${base}.decision.change`, `Node "${id}" is not active at L${s.level - 1}; it cannot be changed at L${s.level}`);
    }
    for (const id of s.decision.remove) {
      if (!prev.has(id)) err('E10', `${base}.decision.remove`, `Node "${id}" is not active at L${s.level - 1}; it cannot be removed at L${s.level}`);
    }

    const next = new Set(prev);
    for (const id of s.decision.add) {
      next.add(id);
      everAdded.add(id);
    }
    for (const id of s.decision.remove) next.delete(id);
    prev = next;
  });

  // T3: every topology node is introduced by some stage.
  topology.nodes.forEach((n, i) => {
    if (!everAdded.has(n.id)) warn('T3', `topology.json:nodes.${i}.id`, `Node "${n.id}" is never added by any stage`);
  });

  return { errors, warnings };
}

/** Rough monthly cost band for the level picker: $ < 100 ≤ $$ < 2,000 ≤ $$$ < 10,000 ≤ $$$$. */
export function costBand(monthlyUsd: number): '$' | '$$' | '$$$' | '$$$$' {
  if (monthlyUsd < 100) return '$';
  if (monthlyUsd < 2000) return '$$';
  if (monthlyUsd < 10000) return '$$$';
  return '$$$$';
}

export function formatIssues(issues: RefIssue[]): string {
  return issues.map((i) => `  - [${i.rule}] ${i.path}: ${i.message}`).join('\n');
}
