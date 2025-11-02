// osm.js - Build a graph from OpenStreetMap roads using Overpass API
// This is a minimal, client-side utility intended for small bounding boxes.
// Contract:
//   fetchRoadGraph(bounds: L.LatLngBounds): Promise<{ nodes, edges, adjacency }>
//     nodes: Array<{ id: string, lat: number, lng: number }>
//     edges: Array<{ from: string, to: string, weight: number }>
//     adjacency: Record<string, Array<{ to: string, weight: number }>>

// Haversine distance in meters
function haversine(a, b) {
  const R = 6371000;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Limit bbox area (deg^2) to avoid huge queries
function bboxAreaDeg2(b) {
  const sw = b.getSouthWest();
  const ne = b.getNorthEast();
  return Math.max(0, (ne.lat - sw.lat)) * Math.max(0, (ne.lng - sw.lng));
}

export async function fetchRoadGraph(bounds, options = {}) {
  const {
    highwayFilter = [
      'motorway','trunk','primary','secondary','tertiary',
      'unclassified','residential','service','living_street'
    ],
    maxAreaDeg2 = 0.0025, // ~small neighborhood; adjust as needed
    endpoint = 'https://overpass-api.de/api/interpreter',
    signal,
  } = options;

  // Guard against too-large bbox
  if (bboxAreaDeg2(bounds) > maxAreaDeg2) {
    throw new Error('Selected map area is too large for a client-side Overpass query. Please zoom in.');
  }

  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const bbox = `${sw.lat},${sw.lng},${ne.lat},${ne.lng}`;
  const highwayClause = highwayFilter.map((t) => `way["highway"="${t}"](${bbox});`).join('\n');

  const query = `[
    out:json][timeout:25];
    (
      ${highwayClause}
    );
    (._;>;);
    out body;
  `;

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: new URLSearchParams({ data: query }),
    signal,
  });
  if (!resp.ok) throw new Error(`Overpass API error: ${resp.status}`);
  const data = await resp.json();

  // Parse nodes and ways
  const nodeMap = new Map(); // id -> {lat, lng}
  const ways = [];
  for (const el of data.elements || []) {
    if (el.type === 'node') {
      nodeMap.set(el.id, { lat: el.lat, lng: el.lon });
    } else if (el.type === 'way' && el.nodes && el.nodes.length >= 2) {
      // Optionally respect one-way; for simplicity, we'll add bidirectional edges.
      ways.push(el);
    }
  }

  function isUnpaved(tags = {}) {
    const surface = (tags.surface || '').toLowerCase();
    const tracktype = (tags.tracktype || '').toLowerCase();
    const highway = (tags.highway || '').toLowerCase();
    const unpavedSurfaces = new Set(['unpaved','gravel','dirt','ground','earth','grass','mud','sand','pebblestone','fine_gravel']);
    if (unpavedSurfaces.has(surface)) return true;
    if (tracktype && ['grade2','grade3','grade4','grade5'].includes(tracktype)) return true;
    if (highway === 'track') return true;
    return false;
  }

  // Build nodes list and id mapping (prefix with 'n' to avoid collisions)
  const nodes = [];
  const idToIndex = new Map();
  for (const [osmId, coord] of nodeMap.entries()) {
    const id = `n${osmId}`;
    idToIndex.set(osmId, id);
    nodes.push({ id, lat: coord.lat, lng: coord.lng });
  }

  // Build edges from way sequences
  const edges = [];
  for (const way of ways) {
    const wayNodes = way.nodes;
    const unpaved = isUnpaved(way.tags || {});
    const surface = (way.tags && way.tags.surface) ? String(way.tags.surface).toLowerCase() : (unpaved ? 'unpaved' : 'paved');
    for (let i = 0; i < wayNodes.length - 1; i++) {
      const aId = wayNodes[i];
      const bId = wayNodes[i + 1];
      const a = nodeMap.get(aId);
      const b = nodeMap.get(bId);
      if (!a || !b) continue;
      const weight = haversine(a, b);
      const from = idToIndex.get(aId);
      const to = idToIndex.get(bId);
      if (!from || !to) continue;
      edges.push({ from, to, weight, unpaved, surface });
      edges.push({ from: to, to: from, weight, unpaved, surface }); // bidirectional
    }
  }

  // Build adjacency
  const adjacency = Object.create(null);
  for (const n of nodes) adjacency[n.id] = [];
  for (const e of edges) adjacency[e.from].push({ to: e.to, weight: e.weight, unpaved: e.unpaved, surface: e.surface });

  return { nodes, edges, adjacency };
}
