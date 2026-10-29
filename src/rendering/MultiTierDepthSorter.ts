export interface ScreenBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface DepthSortItem<T> {
  id: string;
  tier: number;
  footSy: number;
  bounds: ScreenBounds;
  payload: T;
  /** Optional declared ordering constraints: this item must render before these IDs. */
  before?: string[];
  /** Optional declared ordering constraints: these IDs must render before this item. */
  after?: string[];
  /** Small stable tie-breaker for intentionally grouped render content. */
  priority?: number;
}

export interface DepthSortResult<T> {
  items: DepthSortItem<T>[];
  hadCycle: boolean;
  cyclicIds: string[];
}

/**
 * Deterministic topological depth ordering for a screen-space overlap set.
 *
 * Same-tier overlapping objects are ordered by footline (smaller footSy first).
 * Cross-tier overlap receives a stable tier edge; complex bridge/tunnel rules can
 * be declared with `before` constraints in a later manifest revision. If an invalid
 * constraint forms a cycle, the sorter falls back to deterministic tier/footline order.
 */
export class MultiTierDepthSorter {
  sort<T>(source: DepthSortItem<T>[]): DepthSortResult<T> {
    const items = [...source];
    const seenIds = new Set<string>();
    for (const item of items) {
      if (!item.id) throw new Error('Depth-Sort-Element benötigt eine nichtleere ID.');
      if (seenIds.has(item.id)) throw new Error(`Doppelte Depth-Sort-ID: ${item.id}`);
      seenIds.add(item.id);
      if (![item.tier, item.footSy, item.bounds.left, item.bounds.top, item.bounds.right, item.bounds.bottom].every(Number.isFinite)) {
        throw new Error(`${item.id}: Depth-Sort-Metriken müssen endlich sein.`);
      }
      if (item.bounds.right < item.bounds.left || item.bounds.bottom < item.bounds.top) throw new Error(`${item.id}: ungültige Depth-Sort-Bounds.`);
    }
    const byId = new Map(items.map((item) => [item.id, item]));
    const edges = new Map<string, Set<string>>(items.map((item) => [item.id, new Set<string>()]));
    const indegree = new Map<string, number>(items.map((item) => [item.id, 0]));

    const addEdge = (from: string, to: string): void => {
      if (from === to || !byId.has(from) || !byId.has(to)) return;
      const outgoing = edges.get(from)!;
      if (outgoing.has(to)) return;
      outgoing.add(to);
      indegree.set(to, (indegree.get(to) ?? 0) + 1);
    };

    // Apply author-declared constraints first. These are authoritative and suppress
    // the heuristic pairwise edge for that pair, avoiding artificial cycles.
    for (const item of items) {
      for (const targetId of item.before ?? []) addEdge(item.id, targetId);
      for (const sourceId of item.after ?? []) addEdge(sourceId, item.id);
    }

    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      for (let j = i + 1; j < items.length; j++) {
        const b = items[j];
        if (!this.overlaps(a.bounds, b.bounds)) continue;
        const explicitlyOrdered = (edges.get(a.id)?.has(b.id) ?? false) || (edges.get(b.id)?.has(a.id) ?? false);
        if (explicitlyOrdered) continue;
        if (a.tier !== b.tier) {
          addEdge(a.tier < b.tier ? a.id : b.id, a.tier < b.tier ? b.id : a.id);
        } else if (Math.abs(a.footSy - b.footSy) > 0.001) {
          addEdge(a.footSy < b.footSy ? a.id : b.id, a.footSy < b.footSy ? b.id : a.id);
        }
      }
    }

    const compare = (a: DepthSortItem<T>, b: DepthSortItem<T>) => a.tier - b.tier || (a.priority ?? 0) - (b.priority ?? 0) || a.footSy - b.footSy || a.id.localeCompare(b.id);
    const ready = items.filter((item) => indegree.get(item.id) === 0).sort(compare);
    const ordered: DepthSortItem<T>[] = [];
    while (ready.length > 0) {
      const current = ready.shift()!;
      ordered.push(current);
      for (const targetId of edges.get(current.id) ?? []) {
        const nextDegree = (indegree.get(targetId) ?? 0) - 1;
        indegree.set(targetId, nextDegree);
        if (nextDegree === 0) {
          ready.push(byId.get(targetId)!);
          ready.sort(compare);
        }
      }
    }

    if (ordered.length === items.length) return { items: ordered, hadCycle: false, cyclicIds: [] };
    const orderedIds = new Set(ordered.map((item) => item.id));
    const unresolved = new Set(items.filter((item) => !orderedIds.has(item.id)).map((item) => item.id));
    // Tarjan SCC identifies actual cycle members; nodes merely blocked downstream
    // are intentionally excluded from cyclicIds.
    let nextIndex = 0;
    const indexById = new Map<string, number>();
    const lowLinkById = new Map<string, number>();
    const stack: string[] = [];
    const onStack = new Set<string>();
    const cycleMembers = new Set<string>();
    const strongConnect = (id: string): void => {
      indexById.set(id, nextIndex);
      lowLinkById.set(id, nextIndex);
      nextIndex++;
      stack.push(id);
      onStack.add(id);
      for (const target of edges.get(id) ?? []) {
        if (!unresolved.has(target)) continue;
        if (!indexById.has(target)) {
          strongConnect(target);
          lowLinkById.set(id, Math.min(lowLinkById.get(id)!, lowLinkById.get(target)!));
        } else if (onStack.has(target)) {
          lowLinkById.set(id, Math.min(lowLinkById.get(id)!, indexById.get(target)!));
        }
      }
      if (lowLinkById.get(id) === indexById.get(id)) {
        const component: string[] = [];
        let current: string;
        do {
          current = stack.pop()!;
          onStack.delete(current);
          component.push(current);
        } while (current !== id);
        if (component.length > 1) component.forEach((member) => cycleMembers.add(member));
      }
    };
    for (const id of unresolved) if (!indexById.has(id)) strongConnect(id);
    const cyclicIds = [...(cycleMembers.size > 0 ? cycleMembers : unresolved)].sort();
    return { items: items.sort(compare), hadCycle: true, cyclicIds };
  }

  private overlaps(a: ScreenBounds, b: ScreenBounds): boolean {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }
}
