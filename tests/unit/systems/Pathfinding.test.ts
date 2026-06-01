import {
  computePath,
  computeRoute,
  nearestWaypoint,
  distance3,
  WaypointGraph,
} from '@systems/Pathfinding';
import { WAYPOINT_GRAPH } from '@assets/WorldAssetCatalog';

// A tiny diamond graph:  A — B — D   and   A — C — D   (B path shorter)
const diamond: WaypointGraph = {
  nodes: [
    { id: 'A', position: [0, 0, 0] },
    { id: 'B', position: [1, 0, 0] },
    { id: 'C', position: [0, 0, 5] },
    { id: 'D', position: [2, 0, 0] },
  ],
  edges: {
    A: ['B', 'C'],
    B: ['A', 'D'],
    C: ['A', 'D'],
    D: ['B', 'C'],
  },
};

describe('distance3', () => {
  it('is the Euclidean distance in 3D', () => {
    expect(distance3([0, 0, 0], [3, 0, 4])).toBe(5);
    expect(distance3([1, 2, 3], [1, 2, 3])).toBe(0);
  });
});

describe('computePath (A*)', () => {
  it('returns [start] when start === goal', () => {
    expect(computePath(diamond, 'A', 'A')).toEqual(['A']);
  });

  it('finds the shortest path (prefers the cheaper branch)', () => {
    expect(computePath(diamond, 'A', 'D')).toEqual(['A', 'B', 'D']);
  });

  it('returns null for unknown endpoints', () => {
    expect(computePath(diamond, 'A', 'Z')).toBeNull();
    expect(computePath(diamond, 'Z', 'D')).toBeNull();
  });

  it('returns null when the goal is unreachable', () => {
    const split: WaypointGraph = {
      nodes: [
        { id: 'A', position: [0, 0, 0] },
        { id: 'B', position: [1, 0, 0] },
        { id: 'X', position: [9, 0, 0] },
      ],
      edges: { A: ['B'], B: ['A'], X: [] },
    };
    expect(computePath(split, 'A', 'X')).toBeNull();
  });

  it('skips edges that point at unknown nodes (defensive)', () => {
    const broken: WaypointGraph = {
      nodes: [
        { id: 'A', position: [0, 0, 0] },
        { id: 'B', position: [1, 0, 0] },
      ],
      edges: { A: ['ghost', 'B'], B: ['A'] },
    };
    expect(computePath(broken, 'A', 'B')).toEqual(['A', 'B']);
  });

  it('is deterministic across repeated runs', () => {
    const p1 = computePath(diamond, 'A', 'D');
    const p2 = computePath(diamond, 'A', 'D');
    expect(p1).toEqual(p2);
  });
});

describe('nearestWaypoint', () => {
  it('returns the closest node id', () => {
    expect(nearestWaypoint(diamond, [0.9, 0, 0])).toBe('B');
    expect(nearestWaypoint(diamond, [0, 0, 4.9])).toBe('C');
  });

  it('returns null for an empty graph', () => {
    expect(nearestWaypoint({ nodes: [], edges: {} }, [0, 0, 0])).toBeNull();
  });
});

describe('computeRoute', () => {
  it('snaps endpoints to the graph and returns a polyline including them', () => {
    const route = computeRoute(diamond, [-0.1, 0, 0], [2.1, 0, 0]);
    expect(route).not.toBeNull();
    expect(route![0]).toEqual([-0.1, 0, 0]); // original from
    expect(route![route!.length - 1]).toEqual([2.1, 0, 0]); // original to
    // middle should be the A->B->D node positions
    expect(route!.slice(1, -1)).toEqual([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
    ]);
  });

  it('returns a straight hop when both ends snap to the same node', () => {
    expect(computeRoute(diamond, [0.1, 0, 0], [-0.1, 0, 0])).toEqual([
      [0.1, 0, 0],
      [-0.1, 0, 0],
    ]);
  });

  it('returns null when no node path exists', () => {
    const split: WaypointGraph = {
      nodes: [
        { id: 'A', position: [0, 0, 0] },
        { id: 'X', position: [9, 0, 0] },
      ],
      edges: { A: [], X: [] },
    };
    expect(computeRoute(split, [0, 0, 0], [9, 0, 0])).toBeNull();
  });
});

describe('WAYPOINT_GRAPH (downtown street)', () => {
  it('has 27 nodes (3 lanes × 9 X samples)', () => {
    expect(WAYPOINT_GRAPH.nodes).toHaveLength(27);
  });

  it('every edge is symmetric (undirected)', () => {
    for (const [a, nbs] of Object.entries(WAYPOINT_GRAPH.edges)) {
      for (const b of nbs) {
        expect(WAYPOINT_GRAPH.edges[b]).toContain(a);
      }
    }
  });

  it('routes across the street and along it', () => {
    // north sidewalk near -24 to south sidewalk near +24
    const route = computeRoute(WAYPOINT_GRAPH, [-24, 0, 7], [24, 0, -7]);
    expect(route).not.toBeNull();
    expect(route!.length).toBeGreaterThan(3);
  });

  it('every node id resolves and is reachable from the first node', () => {
    const first = WAYPOINT_GRAPH.nodes[0].id;
    for (const n of WAYPOINT_GRAPH.nodes) {
      expect(computePath(WAYPOINT_GRAPH, first, n.id)).not.toBeNull();
    }
  });
});
