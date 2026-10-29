import type { ConnectorZone, InteractionZone, NavMeshData, NavPolygon } from '../core/SceneManifest';

type Point = [number, number];
type Bounds = { left: number; top: number; right: number; bottom: number };
type WalkResult = { x: number; y: number; hit: boolean };
interface NavigationGrid {
  originX: number; originY: number; step: number; cols: number; rows: number; count: number;
  walkable: Uint8Array;
  point(index: number): Point;
  index(col: number, row: number): number;
}
interface GridLink { index: number; cost: number }

/** Runtime adapter for polygon navigation with agent clearance, swept movement and grid A*. */
export class PolygonNavMesh {
  readonly walkablePolygons: NavPolygon[];
  readonly obstacles: NavPolygon[];
  readonly connectors: ConnectorZone[];
  readonly interactions: InteractionZone[];
  readonly agentRadiusPx: number;
  private readonly walkableBounds: Bounds[];
  private readonly obstacleBounds: Bounds[];
  private grid?: NavigationGrid;

  constructor(spec: NavMeshData) {
    this.walkablePolygons = spec.walkable_polygons ?? [];
    this.obstacles = spec.collision_polygons ?? [];
    this.connectors = spec.connector_zones ?? [];
    this.interactions = spec.interaction_zones ?? [];
    this.agentRadiusPx = Number.isFinite(spec.agent_radius_px) ? Math.max(0, spec.agent_radius_px) : 0;
    this.walkableBounds = this.walkablePolygons.map((polygon) => PolygonNavMesh.bounds(polygon.points_px));
    this.obstacleBounds = this.obstacles.map((polygon) => PolygonNavMesh.bounds(polygon.points_px));
  }

  private static bounds(points: Point[]): Bounds {
    return {
      left: Math.min(...points.map((point) => point[0])),
      top: Math.min(...points.map((point) => point[1])),
      right: Math.max(...points.map((point) => point[0])),
      bottom: Math.max(...points.map((point) => point[1])),
    };
  }

  static pointInPolygon(px: number, py: number, points: Point[]): boolean {
    if (points.length < 3) return false;
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i];
      const [xj, yj] = points[j];
      const intersects = ((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-9) + xi);
      if (intersects) inside = !inside;
    }
    return inside;
  }

  static distancePointToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared <= 1e-9) return Math.hypot(px - ax, py - ay);
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
  }

  static distancePointToPolygon(px: number, py: number, points: Point[]): number {
    let shortest = Infinity;
    for (let i = 0; i < points.length; i++) {
      const [ax, ay] = points[i];
      const [bx, by] = points[(i + 1) % points.length];
      shortest = Math.min(shortest, this.distancePointToSegment(px, py, ax, ay, bx, by));
    }
    return shortest;
  }

  private isInsideWalkableUnion(px: number, py: number): boolean {
    return this.walkablePolygons.some((polygon, index) => {
      const bounds = this.walkableBounds[index];
      return polygon.allowed !== false && px >= bounds.left && px <= bounds.right && py >= bounds.top && py <= bounds.bottom
        && PolygonNavMesh.pointInPolygon(px, py, polygon.points_px);
    });
  }

  private isBlockedByObstacle(px: number, py: number, clearance: number): boolean {
    return this.obstacles.some((obstacle, index) => {
      const bounds = this.obstacleBounds[index];
      if (px < bounds.left - clearance || px > bounds.right + clearance || py < bounds.top - clearance || py > bounds.bottom + clearance) return false;
      const points = obstacle.points_px;
      if (PolygonNavMesh.pointInPolygon(px, py, points)) return true;
      return clearance > 0 && PolygonNavMesh.distancePointToPolygon(px, py, points) < clearance;
    });
  }

  /**
   * Tests the entire player footprint. Perimeter samples are tested against the union of
   * walkable polygons, so adjacent polygons do not create artificial blocked seams.
   */
  isWalkable(px: number, py: number, requestedClearance = this.agentRadiusPx): boolean {
    const clearance = Math.max(0, requestedClearance);
    if (!Number.isFinite(px) || !Number.isFinite(py) || !this.isInsideWalkableUnion(px, py)) return false;
    if (this.isBlockedByObstacle(px, py, clearance)) return false;
    if (clearance <= 0) return true;
    const sampleCount = 12;
    for (let i = 0; i < sampleCount; i++) {
      const angle = (i / sampleCount) * Math.PI * 2;
      const sx = px + Math.cos(angle) * clearance;
      const sy = py + Math.sin(angle) * clearance;
      if (!this.isInsideWalkableUnion(sx, sy) || this.isBlockedByObstacle(sx, sy, 0)) return false;
    }
    return true;
  }

  /** Collision-safe step; tests intermediate points to prevent crossing thin geometry. */
  resolveStep(x: number, y: number, nextX: number, nextY: number): WalkResult {
    const dx = nextX - x;
    const dy = nextY - y;
    if (Math.hypot(dx, dy) <= 1e-6) return { x, y, hit: false };
    if (this.hasLineOfSight(x, y, nextX, nextY)) return { x: nextX, y: nextY, hit: false };

    const candidates: Point[] = [[x + dx, y], [x, y + dy], [x + dx * 0.75, y + dy * 0.25], [x + dx * 0.25, y + dy * 0.75]];
    let best: { point: Point; progress: number } | null = null;
    for (const candidate of candidates) {
      if (!this.hasLineOfSight(x, y, candidate[0], candidate[1])) continue;
      const progress = (candidate[0] - x) * dx + (candidate[1] - y) * dy;
      if (!best || progress > best.progress) best = { point: candidate, progress };
    }
    if (best && best.progress > 0.01) return { x: best.point[0], y: best.point[1], hit: true };

    let lo = 0;
    let hi = 1;
    for (let iteration = 0; iteration < 10; iteration++) {
      const mid = (lo + hi) * 0.5;
      if (this.hasLineOfSight(x, y, x + dx * mid, y + dy * mid)) lo = mid;
      else hi = mid;
    }
    if (lo > 1e-4) return { x: x + dx * lo, y: y + dy * lo, hit: true };
    return { x, y, hit: true };
  }

  hasLineOfSight(x1: number, y1: number, x2: number, y2: number): boolean {
    if (!this.isWalkable(x1, y1) || !this.isWalkable(x2, y2)) return false;
    const distance = Math.hypot(x2 - x1, y2 - y1);
    const gap = Math.max(3, Math.min(6, this.agentRadiusPx * 0.4 || 4));
    const steps = Math.max(1, Math.ceil(distance / gap));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (!this.isWalkable(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return false;
    }
    return true;
  }

  findPath(sx: number, sy: number, gx: number, gy: number): Point[] {
    if (!this.isWalkable(sx, sy)) return [];
    const goal = this.findNearestWalkablePoint(gx, gy);
    if (!goal) return [];
    const [tx, ty] = goal;
    if (this.hasLineOfSight(sx, sy, tx, ty)) return [[tx, ty]];

    const grid = this.getGrid();
    const startLinks = this.findGridLinks(sx, sy, grid);
    const goalLinks = this.findGridLinks(tx, ty, grid);
    if (startLinks.length === 0 || goalLinks.length === 0) return [];

    const startIndex = grid.count;
    const goalIndex = grid.count + 1;
    const nodeCount = grid.count + 2;
    const gScore = new Float64Array(nodeCount).fill(Infinity);
    const parent = new Int32Array(nodeCount).fill(-1);
    const open = new MinHeap();
    const goalSet = new Map(goalLinks.map((link) => [link.index, link.cost]));
    gScore[startIndex] = 0;
    open.push(startIndex, Math.hypot(tx - sx, ty - sy));
    const closed = new Uint8Array(nodeCount);

    while (open.size > 0) {
      const current = open.pop()!;
      if (closed[current]) continue;
      closed[current] = 1;
      if (current === goalIndex) {
        const indices: number[] = [];
        let cursor = goalIndex;
        while (cursor !== -1 && cursor !== startIndex) {
          indices.unshift(cursor);
          cursor = parent[cursor];
        }
        const raw: Point[] = indices.map((index) => index === goalIndex ? [tx, ty] : grid.point(index));
        const smooth: Point[] = [];
        let anchor: Point = [sx, sy];
        let index = 0;
        while (index < raw.length) {
          let furthest = index;
          for (let candidate = raw.length - 1; candidate >= index; candidate--) {
            if (this.hasLineOfSight(anchor[0], anchor[1], raw[candidate][0], raw[candidate][1])) { furthest = candidate; break; }
          }
          smooth.push(raw[furthest]);
          anchor = raw[furthest];
          index = furthest + 1;
        }
        if (this.isPathSafe([sx, sy], smooth)) return smooth;
        return raw;
      }

      if (current === startIndex) {
        for (const link of startLinks) this.relax(link.index, link.cost, startIndex, gScore, parent, closed, open, tx, ty, grid);
        continue;
      }
      if (current >= grid.count) continue;
      const costToGoal = goalSet.get(current);
      if (costToGoal !== undefined) this.relax(goalIndex, costToGoal, current, gScore, parent, closed, open, tx, ty, grid);

      const col = current % grid.cols;
      const row = Math.floor(current / grid.cols);
      const from = grid.point(current);
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (ox === 0 && oy === 0) continue;
          const nc = col + ox;
          const nr = row + oy;
          if (nc < 0 || nr < 0 || nc >= grid.cols || nr >= grid.rows) continue;
          const nextIndex = grid.index(nc, nr);
          if (!grid.walkable[nextIndex] || closed[nextIndex]) continue;
          if (ox !== 0 && oy !== 0) {
            if (!grid.walkable[grid.index(col + ox, row)] || !grid.walkable[grid.index(col, row + oy)]) continue;
          }
          const to = grid.point(nextIndex);
          if (!this.hasLineOfSight(from[0], from[1], to[0], to[1])) continue;
          this.relax(nextIndex, Math.hypot(ox, oy) * grid.step, current, gScore, parent, closed, open, tx, ty, grid);
        }
      }
    }
    return [];
  }

  private relax(
    next: number, edgeCost: number, current: number, gScore: Float64Array, parent: Int32Array,
    closed: Uint8Array, open: MinHeap, gx: number, gy: number, grid: NavigationGrid,
  ): void {
    if (closed[next]) return;
    const tentative = gScore[current] + edgeCost;
    if (tentative >= gScore[next]) return;
    parent[next] = current;
    gScore[next] = tentative;
    const target = next === grid.count + 1 ? [gx, gy] as Point : next === grid.count ? [gx, gy] as Point : grid.point(next);
    open.push(next, tentative + Math.hypot(gx - target[0], gy - target[1]));
  }

  private getGrid(): NavigationGrid {
    if (this.grid) return this.grid;
    const allPoints = this.walkablePolygons.flatMap((polygon) => polygon.points_px);
    const minX = Math.min(...allPoints.map((point) => point[0])) - this.agentRadiusPx - 8;
    const minY = Math.min(...allPoints.map((point) => point[1])) - this.agentRadiusPx - 8;
    const maxX = Math.max(...allPoints.map((point) => point[0])) + this.agentRadiusPx + 8;
    const maxY = Math.max(...allPoints.map((point) => point[1])) + this.agentRadiusPx + 8;
    const step = Math.max(8, Math.min(16, this.agentRadiusPx || 12));
    const originX = Math.floor(minX / step) * step;
    const originY = Math.floor(minY / step) * step;
    const cols = Math.ceil((maxX - originX) / step) + 1;
    const rows = Math.ceil((maxY - originY) / step) + 1;
    const count = cols * rows;
    const walkable = new Uint8Array(count);
    const point = (index: number): Point => [originX + (index % cols) * step + step / 2, originY + Math.floor(index / cols) * step + step / 2];
    const index = (col: number, row: number): number => row * cols + col;
    this.grid = { originX, originY, step, cols, rows, count, walkable, point, index };
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const id = index(col, row);
        const [x, y] = point(id);
        if (this.isWalkable(x, y)) walkable[id] = 1;
      }
    }
    return this.grid;
  }

  private findGridLinks(x: number, y: number, grid: NavigationGrid): GridLink[] {
    const col0 = Math.round((x - (grid.originX + grid.step / 2)) / grid.step);
    const row0 = Math.round((y - (grid.originY + grid.step / 2)) / grid.step);
    const links: GridLink[] = [];
    const maxRadius = grid.step * 6;
    for (let row = Math.max(0, row0 - 6); row <= Math.min(grid.rows - 1, row0 + 6); row++) {
      for (let col = Math.max(0, col0 - 6); col <= Math.min(grid.cols - 1, col0 + 6); col++) {
        const index = grid.index(col, row);
        if (!grid.walkable[index]) continue;
        const point = grid.point(index);
        const distance = Math.hypot(point[0] - x, point[1] - y);
        if (distance > maxRadius || !this.hasLineOfSight(x, y, point[0], point[1])) continue;
        links.push({ index, cost: distance });
      }
    }
    return links.sort((a, b) => a.cost - b.cost).slice(0, 12);
  }

  /** Checks every segment with the same clearance and sweep rules used by live movement. */
  isPathSafe(start: Point, path: Point[]): boolean {
    let previous = start;
    for (const point of path) {
      if (!this.hasLineOfSight(previous[0], previous[1], point[0], point[1])) return false;
      previous = point;
    }
    return true;
  }

  private findNearestWalkablePoint(x: number, y: number): Point | null {
    if (this.isWalkable(x, y)) return [x, y];
    const startRadius = Math.max(6, this.agentRadiusPx + 2);
    for (let radius = startRadius; radius <= 240; radius += 8) {
      let best: { point: Point; distance: number } | null = null;
      for (let direction = 0; direction < 24; direction++) {
        const angle = direction * Math.PI / 12;
        const candidate: Point = [x + Math.cos(angle) * radius, y + Math.sin(angle) * radius];
        if (!this.isWalkable(candidate[0], candidate[1])) continue;
        const distance = Math.hypot(candidate[0] - x, candidate[1] - y);
        if (!best || distance < best.distance) best = { point: candidate, distance };
      }
      if (best) return best.point;
    }
    return null;
  }

  getNearestInteraction(x: number, y: number): { zone: InteractionZone; distance: number } | null {
    let best: { zone: InteractionZone; distance: number } | null = null;
    for (const zone of this.interactions) {
      const distance = Math.hypot(x - zone.position_px[0], y - zone.position_px[1]);
      if (distance <= zone.radius_px + 55 && (!best || distance < best.distance)) best = { zone, distance };
    }
    return best;
  }

  getNearestConnector(x: number, y: number): { zone: ConnectorZone; distance: number } | null {
    let best: { zone: ConnectorZone; distance: number } | null = null;
    for (const zone of this.connectors) {
      const cx = zone.trigger_polygon_px.reduce((sum, p) => sum + p[0], 0) / zone.trigger_polygon_px.length;
      const cy = zone.trigger_polygon_px.reduce((sum, p) => sum + p[1], 0) / zone.trigger_polygon_px.length;
      const distance = Math.hypot(x - cx, y - cy);
      if (distance <= 135 && (!best || distance < best.distance)) best = { zone, distance };
    }
    return best;
  }
}

/** Small binary min-heap for predictable A* performance on the fine navigation grid. */
class MinHeap {
  private readonly values: Array<{ id: number; score: number }> = [];
  get size(): number { return this.values.length; }
  push(id: number, score: number): void {
    const item = { id, score };
    this.values.push(item);
    let index = this.values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.values[parent].score <= item.score) break;
      this.values[index] = this.values[parent];
      index = parent;
    }
    this.values[index] = item;
  }
  pop(): number | undefined {
    if (this.values.length === 0) return undefined;
    const root = this.values[0];
    const last = this.values.pop()!;
    if (this.values.length > 0) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= this.values.length) break;
        let child = left;
        if (right < this.values.length && this.values[right].score < this.values[left].score) child = right;
        if (this.values[child].score >= last.score) break;
        this.values[index] = this.values[child];
        index = child;
      }
      this.values[index] = last;
    }
    return root.id;
  }
}
