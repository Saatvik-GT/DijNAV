function dijkstra(adjacency, start, goal, opts = {}) {
  const { avoidUnpaved = false, unpavedFactor = 3 } = opts;
  const dist = {};      // Distance from start to each node
  const prev = {};      // To reconstruct the path
  const visited = new Set();
  const nodes = Object.keys(adjacency);

  // Step 1: Initialize
  for (const n of nodes) dist[n] = Infinity;
  dist[start] = 0;
  const queue = new Set(nodes); // acts as a priority queue

  // Step 2: Main loop
  while (queue.size) {
    // Find node with smallest tentative distance
    let u = null, best = Infinity;
    for (const n of queue) {
      if (dist[n] < best) { best = dist[n]; u = n; }
    }

    if (u === null) break;
    queue.delete(u);
    visited.add(u);

    if (u === goal) break; // stop when reaching destination

    // Step 3: Relax edges
    for (const { to: v, weight: w, unpaved } of adjacency[u]) {
      if (visited.has(v)) continue;
      const factor = (avoidUnpaved && unpaved) ? unpavedFactor : 1;
      const alt = dist[u] + w * factor;
      if (alt < dist[v]) {
        dist[v] = alt;
        prev[v] = u;
      }
    }
  }

  // Step 4: Reconstruct shortest path
  const path = [];
  let u = goal;
  if (prev[u] !== undefined || u === start) {
    while (u !== undefined) {
      path.unshift(u);
      u = prev[u];
    }
  }

  return {
    distance: dist[goal],
    path,
    visitedCount: visited.size,
  };
}
