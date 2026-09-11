/**
 * A single generic primitive used by every flow in resolver.ts: given a
 * fixed budget along one axis and a list of items each with an ideal size,
 * a hard minimum, and a priority, decide who gets their ideal size, who
 * shrinks, and who gets dropped.
 *
 * This is the one piece of real layout math in the engine. Flows differ
 * only in how they turn ad elements into AxisItems (which physical
 * dimension is the main axis, what "ideal" means for that role) and how
 * they arrange the resulting sizes into x/y/width/height — see resolver.ts.
 * allocateAxis itself knows nothing about ads, text, or images.
 *
 * Algorithm:
 *   1. Drop least-important items (highest `priority` number, and only
 *      those marked `canDrop`) one at a time until the survivors' combined
 *      MINIMUM size actually fits the budget.
 *   2. If the survivors' combined IDEAL size also fits, everyone gets their
 *      ideal size — done, nothing shrank.
 *   3. Otherwise, shrink every survivor proportionally to its own slack
 *      (ideal - min): items with more slack give up more, nobody goes
 *      below their own floor. This mirrors flexbox's flex-shrink
 *      distribution without depending on it.
 */

export interface AxisItem {
  id: string;
  /** Lower number = more important. Drives both drop order and shrink order. */
  priority: number;
  /** Size (px) this item would take with no constraints. */
  ideal: number;
  /** Hard floor (px). The item is never rendered smaller than this — it is dropped instead. */
  min: number;
  /** False for elements the ad cannot function without (e.g. the CTA); those only shrink/clamp, they never drop. */
  canDrop: boolean;
}

export interface AxisDrop {
  id: string;
  reason: string;
}

export interface AxisAllocation {
  /** Final size (px) per surviving item id. */
  sizes: Map<string, number>;
  dropped: AxisDrop[];
  warnings: string[];
}

export function allocateAxis(items: readonly AxisItem[], available: number): AxisAllocation {
  const budget = Math.max(0, available);
  const warnings: string[] = [];
  const dropped: AxisDrop[] = [];

  // Normalize: an item's ideal size can never be *less* than its own floor
  // (a role's fractional "ideal" formula can dip below its absolute min at
  // small surface scales) — without this, phase 3's slack math sees a
  // negative slack and produces a size larger than ideal.
  const survivors: AxisItem[] = items.map((item) => ({ ...item, ideal: Math.max(item.ideal, item.min) }));

  const minSum = (list: readonly AxisItem[]) => list.reduce((sum, i) => sum + i.min, 0);

  // Phase 1 — drop from the least important end until minimums fit.
  while (minSum(survivors) > budget) {
    const dropIndex = findLeastImportantDroppable(survivors);
    if (dropIndex === -1) {
      warnings.push(
        `No more droppable elements, but required elements still need ${Math.round(minSum(survivors))}px ` +
          `and only ${Math.round(budget)}px is available. Required elements will be scaled below their intended floor.`
      );
      break;
    }
    const victim = survivors[dropIndex]!;
    dropped.push({
      id: victim.id,
      reason:
        `insufficient space — required elements need ${Math.round(minSum(survivors))}px minimum but only ` +
        `${Math.round(budget)}px is available, so the lowest-priority droppable element (priority ${victim.priority}) was removed.`,
    });
    survivors.splice(dropIndex, 1);
  }

  // Phase 2/3 — size the survivors.
  const sizes = new Map<string, number>();
  const totalIdeal = survivors.reduce((sum, i) => sum + i.ideal, 0);

  if (survivors.length === 0) {
    return { sizes, dropped, warnings };
  }

  if (totalIdeal <= budget) {
    for (const item of survivors) sizes.set(item.id, item.ideal);
  } else {
    const totalMin = minSum(survivors);
    const totalSlack = totalIdeal - totalMin;
    const overBy = totalIdeal - budget;
    const shrinkRatio = totalSlack > 0 ? Math.min(1, overBy / totalSlack) : 1;

    for (const item of survivors) {
      const slack = item.ideal - item.min;
      const size = totalSlack > 0 ? item.ideal - slack * shrinkRatio : item.min;
      sizes.set(item.id, Math.max(item.min, size));
    }

    // Last resort: every survivor is non-droppable and even their combined
    // minimums exceed the budget (Phase 1 had nothing left to drop). Scale
    // everyone down together rather than overflow the surface.
    const totalMinAfter = minSum(survivors);
    if (totalMinAfter > budget && totalMinAfter > 0) {
      const clampRatio = budget / totalMinAfter;
      for (const item of survivors) sizes.set(item.id, item.min * clampRatio);
    }
  }

  return { sizes, dropped, warnings };
}

function findLeastImportantDroppable(items: readonly AxisItem[]): number {
  let worst = -1;
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (!item.canDrop) continue;
    // >= so that, among ties, the item declared later drops first.
    if (worst === -1 || item.priority >= items[worst]!.priority) {
      worst = i;
    }
  }
  return worst;
}
