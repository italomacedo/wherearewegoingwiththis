/**
 * Pathfinding — a pure, dependency-free A* over an authored waypoint graph.
 *
 * NPCs in the living-world track (Fase 5) navigate by following a polyline of
 * waypoints rather than a navmesh: the street is small and mostly linear, so a
 * hand-authored graph (see WAYPOINT_GRAPH in WorldAssetCatalog) is enough and
 * stays fully unit-testable with no Babylon/Havok dependency. The browser-only
 * NPC mover consumes the returned world-space polyline and walks it using the
 * Fase 1 locomotion (walk speed + matched speedRatio), Havok-aware.
 *
 * Everything here is pure: same inputs → same path. Ties break deterministically
 * (by insertion order then node id) so tests are stable.
 */

export type WaypointId = string;

export interface Waypoint {
  id: WaypointId;
  /** World position [x, y, z]. */
  position: [number, number, number];
}

/** Undirected adjacency: `edges[a]` lists the neighbours of node `a`. */
export interface WaypointGraph {
  nodes: readonly Waypoint[];
  edges: Readonly<Record<WaypointId, readonly WaypointId[]>>;
}

/** Straight-line distance between two world points (ignores Y is NOT assumed — full 3D). */
export function distance3(a: readonly number[], b: readonly number[]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Index a graph's nodes by id for O(1) lookup. */
function indexNodes(graph: WaypointGraph): Map<WaypointId, Waypoint> {
  const m = new Map<WaypointId, Waypoint>();
  for (const n of graph.nodes) m.set(n.id, n);
  return m;
}

/**
 * A* over the waypoint graph. Returns the list of waypoint ids from `start` to
 * `goal` (inclusive), or `null` if unreachable / unknown endpoints. Edge cost is
 * Euclidean distance; the heuristic is straight-line distance to the goal
 * (admissible → optimal path). Deterministic tie-breaking.
 */
export function computePath(graph: WaypointGraph, start: WaypointId, goal: WaypointId): WaypointId[] | null {
  const nodes = indexNodes(graph);
  if (!nodes.has(start) || !nodes.has(goal)) return null;
  if (start === goal) return [start];

  const goalPos = nodes.get(goal)!.position;
  // Stable insertion order for tie-breaks.
  const order = new Map<WaypointId, number>();
  graph.nodes.forEach((n, i) => order.set(n.id, i));

  const gScore = new Map<WaypointId, number>([[start, 0]]);
  const fScore = new Map<WaypointId, number>([[start, distance3(nodes.get(start)!.position, goalPos)]]);
  const cameFrom = new Map<WaypointId, WaypointId>();
  const open = new Set<WaypointId>([start]);

  while (open.size > 0) {
    // Pick the open node with the lowest fScore (linear scan — graphs are tiny).
    let current: WaypointId | null = null;
    let bestF = Infinity;
    for (const id of open) {
      const f = fScore.get(id) ?? Infinity;
      if (f < bestF || (f === bestF && current !== null && (order.get(id)! < order.get(current)!))) {
        bestF = f;
        current = id;
      }
    }
    if (current === null) break;

    if (current === goal) return reconstruct(cameFrom, current);

    open.delete(current);
    const currentPos = nodes.get(current)!.position;
    const neighbours = graph.edges[current] ?? [];
    for (const nb of neighbours) {
      const nbNode = nodes.get(nb);
      if (!nbNode) continue; // edge to an unknown node — skip defensively
      const tentative = (gScore.get(current) ?? Infinity) + distance3(currentPos, nbNode.position);
      if (tentative < (gScore.get(nb) ?? Infinity)) {
        cameFrom.set(nb, current);
        gScore.set(nb, tentative);
        fScore.set(nb, tentative + distance3(nbNode.position, goalPos));
        open.add(nb);
      }
    }
  }
  return null;
}

function reconstruct(cameFrom: Map<WaypointId, WaypointId>, current: WaypointId): WaypointId[] {
  const path = [current];
  let cur = current;
  while (cameFrom.has(cur)) {
    cur = cameFrom.get(cur)!;
    path.unshift(cur);
  }
  return path;
}

/** The id of the graph node nearest to a world point (null for an empty graph). */
export function nearestWaypoint(graph: WaypointGraph, point: readonly number[]): WaypointId | null {
  let best: WaypointId | null = null;
  let bestD = Infinity;
  for (const n of graph.nodes) {
    const d = distance3(n.position, point);
    if (d < bestD) {
      bestD = d;
      best = n.id;
    }
  }
  return best;
}

/**
 * Full world-space route between two arbitrary points: snap each to its nearest
 * waypoint, A* between them, then return the polyline of positions —
 * `[from, ...waypoints, to]`. Returns `[from, to]` when both snap to the same
 * node (a straight hop) and `null` when no node-path exists. The endpoints are
 * always included so the mover walks off/onto the graph cleanly.
 */
export function computeRoute(
  graph: WaypointGraph,
  from: [number, number, number],
  to: [number, number, number],
): Array<[number, number, number]> | null {
  const startId = nearestWaypoint(graph, from);
  const goalId = nearestWaypoint(graph, to);
  if (startId === null || goalId === null) return null;
  const nodes = indexNodes(graph);
  if (startId === goalId) return [from, to];
  const ids = computePath(graph, startId, goalId);
  if (!ids) return null;
  const mid = ids.map((id) => nodes.get(id)!.position);
  return [from, ...mid, to];
}
