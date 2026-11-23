/**
 * Stage 6.5 — flagship article E2E. Every expectation is derived from the article's own data files
 * (evolution.json, topology.json, cost-models.json); nothing is hard-coded, so a data edit cannot leave the
 * test asserting stale numbers.
 */
import type { Locator, Page } from '@playwright/test';
import { test, expect, waitForHydration } from '../../../../tests/e2e/helpers/qa-audit';
import evolutionJson from '../data/evolution.json' with { type: 'json' };
import topologyJson from '../data/topology.json' with { type: 'json' };
import costModelsJson from '../data/cost-models.json' with { type: 'json' };

interface Stage {
  level: number;
  title: string;
  costTierId: string;
  decision: { add: string[]; change: string[]; remove: string[] };
}
interface TopoNode {
  id: string;
  label: string;
  awsLabel?: string;
  failure?: { blastRadius?: string[]; fallback?: string };
}
interface Tier {
  id: string;
  label: string;
  monthlyRequestsM: number;
  components: { name: string; awsService: string; monthlyListUsd: number; assumption: string }[];
}

const SLUG = 'design-url-redirection-service';
const ART = `/${SLUG}/`;
const LAB = `/${SLUG}/interactive-lab/`;
const stages = (evolutionJson as { stages: Stage[] }).stages;
const nodes = (topologyJson as { nodes: TopoNode[] }).nodes;
const cost = costModelsJson as { region: string; pricingAsOf: string; enterpriseDiscountRangePct: number[]; tiers: Tier[]; sources: { url: string }[] };
const nodeById = new Map(nodes.map((n) => [n.id, n]));

/** Same reduction the article defines (§4.2.2): active(Ln) = active(Ln-1) ∪ add(Ln) − remove(Ln). */
function active(level: number): Set<string> {
  const s = new Set<string>();
  for (const st of stages) {
    if (st.level > level) break;
    st.decision.add.forEach((id) => s.add(id));
    st.decision.remove.forEach((id) => s.delete(id));
  }
  return s;
}
function expectedDiff(level: number) {
  if (level === 0) return { added: [] as string[], changed: [] as string[], removed: [] as string[] };
  const before = active(level - 1);
  const after = active(level);
  const st = stages.find((s) => s.level === level)!;
  return {
    added: [...after].filter((id) => !before.has(id)).sort(),
    changed: st.decision.change.filter((id) => before.has(id) && after.has(id)).sort(),
    removed: [...before].filter((id) => !after.has(id)).sort(),
  };
}
const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const sorted = (a: (string | null)[]) => a.map(String).sort();

async function attrs(scope: Locator, sel: string, attr: string) {
  return scope.locator(sel).evaluateAll((els, a) => els.map((e) => e.getAttribute(a)), attr);
}

test.describe('flagship article: evolution body', () => {
  test('ladder rows link #stage-l0 … #stage-lN in order and each lands on its stage', async ({ page }) => {
    await page.goto(ART);
    const rows = page.locator('#evolution-ladder a.sp-ladder-row');
    await expect(rows).toHaveCount(stages.length);
    expect(await rows.evaluateAll((as) => as.map((a) => a.getAttribute('href')))).toEqual(stages.map((s) => `#stage-l${s.level}`));
    for (const s of [...stages].reverse()) {
      await page.locator(`#evolution-ladder a[href="#stage-l${s.level}"]`).click();
      await expect(page).toHaveURL(new RegExp(`#stage-l${s.level}$`));
      await expect(page.locator(`#stage-l${s.level}`)).toBeInViewport();
      await expect(page.locator(`#stage-l${s.level}-title`)).toHaveText(`L${s.level} · ${s.title}`);
      await page.evaluate(() => window.scrollTo(0, 0));
    }
  });

  for (const s of stages) {
    test(`L${s.level}: Image ⇄ Interactive shows the topology for the level with diff markers matching evolution.json`, async ({ page }) => {
      await page.goto(ART);
      const fig = page.locator(`#stage-l${s.level} figure.sp-figure`).first();
      await fig.scrollIntoViewIfNeeded();
      await waitForHydration(page, `#stage-l${s.level} .sp-fig-frame`);
      await expect(fig.locator('.sp-fig-static')).toBeVisible();
      await fig.getByRole('button', { name: 'Interactive', exact: true }).click();
      const live = fig.locator('.sp-fig-live');
      await expect(live.locator('[data-node-id]').first()).toBeVisible();
      await expect(fig.locator('.sp-fig-static')).toBeHidden();

      const want = expectedDiff(s.level);
      expect(sorted(await attrs(live, '[data-node-id]', 'data-node-id'))).toEqual([...active(s.level)].sort());
      expect(sorted(await attrs(live, '[data-node-id][data-diff="added"]', 'data-node-id'))).toEqual(want.added);
      expect(sorted(await attrs(live, '[data-node-id][data-diff="changed"]', 'data-node-id'))).toEqual(want.changed);
      expect(sorted(await attrs(live, '[data-node-ghost]', 'data-node-ghost'))).toEqual(want.removed);
      for (const id of want.removed) {
        await expect(live.locator(`[data-node-ghost="${id}"]`)).toHaveAttribute('aria-label', new RegExp(`removed at L${s.level}`));
      }

      await fig.getByRole('button', { name: 'Image', exact: true }).click();
      await expect(fig.locator('.sp-fig-static')).toBeVisible();
      await expect(fig.locator('.sp-fig-live')).toHaveCount(0);
    });
  }

  test('failure injection on a stage figure changes the node state; Esc closes the inspector', async ({ page }) => {
    const lv = 3;
    const target = [...active(lv)].find((id) => nodeById.get(id)?.failure?.blastRadius?.length)!;
    await page.goto(ART);
    const fig = page.locator(`#stage-l${lv} figure.sp-figure`).first();
    await fig.scrollIntoViewIfNeeded();
    await waitForHydration(page, `#stage-l${lv} .sp-fig-frame`);
    await fig.getByRole('button', { name: 'Interactive', exact: true }).click();
    const node = fig.locator(`.sp-fig-live [data-node-id="${target}"]`);
    await node.click();
    const insp = fig.locator('.sp-inspector');
    await expect(insp).toBeVisible();
    await insp.getByRole('button', { name: 'Outage' }).click();
    await expect(node).toHaveAttribute('data-state', 'failed');
    await expect(insp).toContainText(nodeById.get(target)!.failure!.blastRadius![0]);
    await page.keyboard.press('Escape');
    await expect(fig.locator('.sp-inspector--overlay')).toHaveCount(0);
  });
});

test.describe('flagship article: interactive lab', () => {
  async function openLab(page: Page) {
    await page.goto(LAB);
    const topo = page.locator('.sp-topo--lab');
    await topo.scrollIntoViewIfNeeded();
    await waitForHydration(page, '.sp-topo--lab');
    return topo;
  }
  const picker = (page: Page) => page.getByRole('radiogroup', { name: 'Evolution level' });

  test('level picker drives the topology and the cost tier for every level', async ({ page }) => {
    const topo = await openLab(page);
    const radios = picker(page).getByRole('radio');
    await expect(radios).toHaveCount(stages.length);
    for (const s of stages) {
      await picker(page).locator('.sp-level-card', { hasText: `L${s.level}` }).first().click();
      await expect(radios.nth(s.level)).toBeChecked();
      await expect(topo).toHaveAttribute('data-level', String(s.level));
      expect(sorted(await attrs(topo, '[data-node-id]', 'data-node-id'))).toEqual([...active(s.level)].sort());
      await page.locator('.sp-cost').scrollIntoViewIfNeeded();
      await waitForHydration(page, '.sp-cost');
      await expect(page.locator('.sp-cost')).toHaveAttribute('data-tier', s.costTierId);
      await topo.scrollIntoViewIfNeeded();
    }
    // Arrow keys rove the native radio group (and the dispatcher ignores inputs).
    await radios.nth(1).focus();
    await radios.nth(1).check();
    await page.keyboard.press('ArrowRight');
    await expect(topo).toHaveAttribute('data-level', '2');
  });

  test('"Show changes" overlays the diff against the previous level', async ({ page }) => {
    const topo = await openLab(page);
    for (const s of stages.filter((x) => x.level > 0)) {
      await picker(page).locator('.sp-level-card', { hasText: `L${s.level}` }).first().click();
      const box = topo.locator('.sp-check input');
      await box.check();
      const want = expectedDiff(s.level);
      expect(sorted(await attrs(topo, '[data-node-id][data-diff="added"]', 'data-node-id')), `L${s.level} added`).toEqual(want.added);
      expect(sorted(await attrs(topo, '[data-node-ghost]', 'data-node-ghost')), `L${s.level} removed`).toEqual(want.removed);
      await box.uncheck();
      await expect(topo.locator('[data-node-ghost]')).toHaveCount(0);
    }
  });

  test('Generic ⇄ AWS toggle relabels every component from topology.json', async ({ page }) => {
    const topo = await openLab(page);
    const lv = stages.at(-1)!.level;
    await picker(page).locator('.sp-level-card', { hasText: `L${lv}` }).first().click();
    const labels = page.getByRole('radiogroup', { name: 'Component labels' });
    for (const [opt, pick] of [['Generic', (n: TopoNode) => n.label], ['AWS', (n: TopoNode) => n.awsLabel ?? n.label]] as const) {
      await labels.getByRole('radio', { name: opt, exact: true }).check();
      await expect(labels.getByRole('radio', { name: opt, exact: true })).toBeChecked();
      for (const id of active(lv)) {
        await expect(topo.locator(`[data-node-id="${id}"]`)).toHaveAttribute('aria-label', new RegExp(`^Inspect ${pick(nodeById.get(id)!).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(`));
      }
    }
  });

  test('failure injection: outage and 10× latency change node state, inspector and fallback; Reset restores Healthy', async ({ page }) => {
    const topo = await openLab(page);
    const lv = 3;
    await picker(page).locator('.sp-level-card', { hasText: `L${lv}` }).first().click();
    const ids = [...active(lv)];
    const withFallback = ids.find((id) => nodeById.get(id)?.failure?.fallback)!;
    const other = ids.find((id) => id !== withFallback && nodeById.get(id)?.failure?.blastRadius?.length)!;
    const insp = topo.locator('.sp-inspector');

    await topo.locator(`[data-node-id="${withFallback}"]`).click();
    await insp.locator('.sp-fault-btn[data-fault="failed"]').click();
    await expect(topo.locator(`[data-node-id="${withFallback}"]`)).toHaveAttribute('data-state', 'failed');
    await expect(insp.locator('.sp-inspector-fallback')).toContainText(nodeById.get(withFallback)!.failure!.fallback!);
    await expect(insp.locator('.sp-fault-btn[data-fault="failed"]')).toHaveAttribute('aria-pressed', 'true');

    await topo.locator(`[data-node-id="${other}"]`).click();
    await insp.locator('.sp-fault-btn[data-fault="degraded"]').click();
    await expect(topo.locator(`[data-node-id="${other}"]`)).toHaveAttribute('data-state', 'degraded');
    await expect(insp).toContainText(nodeById.get(other)!.failure!.blastRadius![0]);

    const reset = topo.getByRole('button', { name: /^Reset/ });
    await expect(reset).toHaveText('Reset (2)');
    await reset.click();
    await expect(topo.locator('[data-state="failed"], [data-state="degraded"]')).toHaveCount(0);
    await expect(reset).toBeDisabled();
  });

  test('cost calculator: rows, list total, enterprise range and point estimate per level come from cost-models.json', async ({ page }) => {
    await openLab(page);
    const calc = page.locator('.sp-cost');
    await calc.scrollIntoViewIfNeeded();
    await waitForHydration(page, '.sp-cost');
    const [lo, hi] = [Math.min(...cost.enterpriseDiscountRangePct), Math.max(...cost.enterpriseDiscountRangePct)];
    const mid = Math.round((lo + hi) / 2);
    for (const s of stages) {
      await calc.locator('.sp-cost-level select').selectOption(String(s.level));
      const tier = cost.tiers.find((t) => t.id === s.costTierId)!;
      await expect(calc).toHaveAttribute('data-tier', tier.id);
      await expect(calc.locator('.sp-cost-title')).toHaveText(tier.label);
      const rows = calc.locator('.sp-cost-table tbody tr');
      await expect(rows).toHaveCount(tier.components.length);
      for (let i = 0; i < tier.components.length; i++) {
        const c = tier.components[i];
        await expect(rows.nth(i).locator('th')).toHaveText(c.name);
        await expect(rows.nth(i).locator('td.sp-num')).toHaveText(usd(c.monthlyListUsd));
        await expect(rows.nth(i).locator('.sp-badge-assume')).toHaveCount(/^ASSUMPTION:/i.test(c.assumption) ? 1 : 0);
      }
      const list = tier.components.reduce((a, c) => a + c.monthlyListUsd, 0);
      await expect(calc.locator('.sp-cost-table tfoot td.sp-num')).toHaveText(usd(list));
      await expect(calc.locator('.sp-cost-stat').nth(0)).toContainText(`${usd(list * (1 - hi / 100))}–${usd(list * (1 - lo / 100))}/mo`);
      await expect(calc.locator('.sp-cost-stat').nth(1)).toContainText(`${usd(list * (1 - mid / 100))}/mo`);
    }
    // Discount slider moves the point estimate; the topology follows the cost-level select.
    const slider = calc.locator('input[type="range"]');
    await slider.fill(String(hi));
    const top = cost.tiers.find((t) => t.id === stages.at(-1)!.costTierId)!;
    const topList = top.components.reduce((a, c) => a + c.monthlyListUsd, 0);
    await expect(calc.locator('.sp-cost-stat').nth(1)).toContainText(`${usd(topList * (1 - hi / 100))}/mo`);
    await expect(page.locator('.sp-topo--lab')).toHaveAttribute('data-level', String(stages.at(-1)!.level));
    await expect(calc.locator('.sp-cost-sources a')).toHaveCount(cost.sources.length);
    await expect(calc.locator('.sp-cost-sources time')).toHaveAttribute('datetime', cost.pricingAsOf);
  });
});
