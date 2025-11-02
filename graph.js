// graph.js - builds a small grid-graph of lat/lng nodes
// Contract:
// - buildGridGraph(center, rows, cols, delta): returns { nodes, edges, adjacency }
//   nodes: Array<{ id: string, lat: number, lng: number }>
//   edges: Array<{ from: string, to: string, weight: number }>
//   adjacency: Record<string, Array<{ to: string, weight: number }>>

export function buildGridGraph(center, rows = 5, cols = 5, delta = 0.002) {
  // Create nodes in a grid around center
  const nodes = [];
  let id = 0;
  const startLat = center.lat - (rows - 1) * delta / 2;
  const startLng = center.lng - (cols - 1) * delta / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      nodes.push({ id: String(id++), lat: startLat + r * delta, lng: startLng + c * delta });
    }
  }

  // Helper to index into nodes
  function idx(r, c) { return r * cols + c; }

  // Haversine distance in meters
  function haversine(a, b) {
    const R = 6371000; // Earth radius meters
    const toRad = deg => deg * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLng = Math.sin(dLng / 2);
    const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  // Connect 4-neighbors with weights
  const edges = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = idx(r, c);
      const a = nodes[i];
      const neighbors = [];
      if (r > 0) neighbors.push(idx(r - 1, c));
      if (r < rows - 1) neighbors.push(idx(r + 1, c));
      if (c > 0) neighbors.push(idx(r, c - 1));
      if (c < cols - 1) neighbors.push(idx(r, c + 1));
      for (const j of neighbors) {
        const b = nodes[j];
        const w = haversine(a, b);
        edges.push({ from: a.id, to: b.id, weight: w, surface: 'paved', unpaved: false });
      }
    }
  }

  // Build adjacency list
  const adjacency = Object.create(null);
  for (const n of nodes) adjacency[n.id] = [];
  for (const e of edges) adjacency[e.from].push({ to: e.to, weight: e.weight, unpaved: e.unpaved, surface: e.surface });

  return { nodes, edges, adjacency };
}
