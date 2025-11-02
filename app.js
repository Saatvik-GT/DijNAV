import { buildGridGraph } from './graph.js';
import { fetchRoadGraph } from './osm.js';
import { searchPlaces } from './geocode.js';

// Dijkstra's Algorithm (simple implementation with a linear priority queue)
function dijkstra(adjacency, start, goal, opts = {}) {
  const { avoidUnpaved = false, unpavedFactor = 3 } = opts;
  const dist = Object.create(null);
  const prev = Object.create(null);
  const visited = new Set();
  const nodes = Object.keys(adjacency);

  // Initialize distances
  for (const n of nodes) dist[n] = Infinity;
  dist[start] = 0;

  // A very simple priority queue using an array (fine for small graphs)
  const queue = new Set(nodes);

  while (queue.size) {
    // Pick node u with smallest dist
    let u = null;
    let best = Infinity;
    for (const n of queue) {
      if (dist[n] < best) {
        best = dist[n];
        u = n;
      }
    }

    if (u === null) break; // Unreachable nodes remain
    queue.delete(u);
    visited.add(u);

    if (u === goal) break; // Found shortest path to goal

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

  // Reconstruct path
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

// Utility: Haversine distance between two lat/lng points (meters)
function haversine(a, b) {
  const R = 6371000;
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

// Find nearest node id to a latlng
function nearestNodeId(latlng, nodes) {
  let bestId = null;
  let best = Infinity;
  for (const n of nodes) {
    const d = haversine(latlng, { lat: n.lat, lng: n.lng });
    if (d < best) { best = d; bestId = n.id; }
  }
  return bestId;
}

// Leaflet Map Setup - open world (no max bounds)
const map = L.map('map', { zoomControl: true });
map.setView([20, 0], 2); // world view
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map);

// Graph state (can be grid or OSM-backed)
let currentGraph = { nodes: [], edges: [], adjacency: {} };
const graphLayer = L.layerGroup().addTo(map);

function setGraph(graph) {
  currentGraph = graph;
  renderGraph();
}

function renderGraph() {
  graphLayer.clearLayers();
  const { nodes, edges } = currentGraph;
  for (const e of edges) {
    const a = nodes.find(n => n.id === e.from);
    const b = nodes.find(n => n.id === e.to);
    if (!a || !b) continue;
    const color = e.unpaved ? '#b45309' /* amber-700 */ : '#16a34a' /* green-600 */;
    L.polyline([[a.lat, a.lng], [b.lat, b.lng]], { color, weight: 2, opacity: 0.7 }).addTo(graphLayer);
  }
  // small node dots
  for (const n of nodes) {
    L.circleMarker([n.lat, n.lng], { radius: 2.5, color: '#cbd5e1', weight: 1, opacity: 0.6, fillOpacity: 0.25 }).addTo(graphLayer);
  }
}

// Initialize with a small grid graph centered at the current map center
setGraph(buildGridGraph({ lat: map.getCenter().lat, lng: map.getCenter().lng }, 7, 7, 0.0018));

document.getElementById('showGraph').addEventListener('change', (e) => {
  if (e.target.checked) {
    graphLayer.addTo(map);
  } else {
    map.removeLayer(graphLayer);
  }
});

// Toggle to use real roads via Overpass API
const useRoadsEl = document.getElementById('useRoads');
const avoidUnpavedEl = document.getElementById('avoidUnpaved');
let abortCtrl = null;

useRoadsEl.addEventListener('change', async (e) => {
  if (e.target.checked) {
    updateStatus('Loading roads for current view…');
    try {
      if (abortCtrl) abortCtrl.abort();
      abortCtrl = new AbortController();
      const graph = await fetchRoadGraph(map.getBounds(), { signal: abortCtrl.signal });
      setGraph(graph);
      updateStatus('Road graph loaded. Click to select start, then end.');
      // Fit to graph if reasonable
      const latlngs = graph.nodes.map(n => [n.lat, n.lng]);
      if (latlngs.length) map.fitBounds(L.latLngBounds(latlngs), { padding: [30, 30] });
    } catch (err) {
      console.error(err);
      updateStatus('Failed to load road graph. Zoom in and try again.');
      e.target.checked = false;
    }
  } else {
    setGraph(buildGridGraph(map.getCenter(), 7, 7, 0.0018));
    updateStatus('Using synthetic grid. Click to select start, then end.');
  }
});

// Re-render graph colors when toggling avoidance (visual stays the same but good to hint behavior)
avoidUnpavedEl.addEventListener('change', () => {
  renderGraph();
  // If a route is already drawn, recompute it quickly with the new penalty
  if (startId && endId) {
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    const { distance, path } = dijkstra(currentGraph.adjacency, startId, endId, {
      avoidUnpaved: avoidUnpavedEl.checked,
      unpavedFactor: 3,
    });
    if (path && path.length) {
      const latlngs = path.map(id => {
        const n = currentGraph.nodes.find(x => x.id === id);
        return [n.lat, n.lng];
      });
      drawRoutePolyline(latlngs);
      setDistance(distance);
      updateStatus(`Path with ${path.length - 1} edges. Distance shown below.`);
    }
  }
});

// (Region selector removed) – map is open-world

// --- Place search (Nominatim) ---
const searchInput = document.getElementById('placeSearch');
const searchResults = document.getElementById('searchResults');
let searchAbort = null;
let searchTimer = null;

function clearResults() {
  searchResults.innerHTML = '';
  searchResults.hidden = true;
}

function showResults(items) {
  searchResults.innerHTML = '';
  if (!items.length) {
    const div = document.createElement('div');
    div.className = 'muted';
    div.textContent = 'No results';
    searchResults.appendChild(div);
  } else {
    for (const it of items) {
      const div = document.createElement('div');
      div.className = 'item';
      div.textContent = it.display;
      div.addEventListener('click', () => selectSearchResult(it));
      searchResults.appendChild(div);
    }
  }
  searchResults.hidden = false;
}

async function runSearch(q) {
  if (searchAbort) searchAbort.abort();
  searchAbort = new AbortController();
  try {
    const items = await searchPlaces(q, { limit: 6, viewbox: map.getBounds(), bounded: false, signal: searchAbort.signal });
    showResults(items);
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error(err);
      showResults([]);
    }
  }
}

function selectSearchResult(item) {
  clearResults();
  // Compute bounds to clamp map (with small padding)
  const bounds = item.bounds || L.latLngBounds([item.center, item.center]).pad(0.02);
  // Fit to result but do NOT clamp to bounds (open world)
  map.fitBounds(bounds, { padding: [30, 30] });
  // Reset route and switch graph according to toggle
  resetRoute();
  if (useRoadsEl.checked) {
    useRoadsEl.dispatchEvent(new Event('change'));
  } else {
    setGraph(buildGridGraph(map.getCenter(), 7, 7, 0.0018));
  }
}

searchInput.addEventListener('input', (e) => {
  const q = e.target.value.trim();
  if (q.length < 2) { clearResults(); return; }
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => runSearch(q), 250);
});

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { clearResults(); }
  if (e.key === 'Enter') {
    const q = searchInput.value.trim();
    if (q.length >= 2) runSearch(q);
  }
});

document.addEventListener('click', (e) => {
  if (!searchResults.contains(e.target) && e.target !== searchInput) {
    clearResults();
  }
});

// UI State
let startId = null;
let endId = null;
let startMarker = null;
let endMarker = null;
let routeLine = null;
const statusEl = document.getElementById('status');
const distanceEl = document.getElementById('distance');

function updateStatus(text) { statusEl.textContent = text; }
function setDistance(m) {
  if (Number.isFinite(m)) distanceEl.textContent = `${m.toFixed(1)} m`;
  else distanceEl.textContent = '–';
}

function resetRoute() {
  startId = endId = null;
  if (startMarker) { map.removeLayer(startMarker); startMarker = null; }
  if (endMarker) { map.removeLayer(endMarker); endMarker = null; }
  if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
  setDistance(null);
  updateStatus('Click on the map to pick start, then end.');
}

function routeStrokeStyle() {
  // Grey when using real roads, green on synthetic grid
  // Blue when using real roads, green on synthetic grid
  return useRoadsEl.checked ? { color: '#3b82f6', weight: 5, opacity: 0.95 } : { color: '#22c55e', weight: 5, opacity: 0.9 };
}

function drawRoutePolyline(latlngs) {
  if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
  routeLine = L.polyline(latlngs, routeStrokeStyle()).addTo(map);
  map.fitBounds(routeLine.getBounds(), { padding: [30, 30] });
}

document.getElementById('resetBtn').addEventListener('click', resetRoute);

// Handle map clicks
map.on('click', (e) => {
  const clicked = { lat: e.latlng.lat, lng: e.latlng.lng };
  const nid = nearestNodeId(clicked, currentGraph.nodes);
  const node = currentGraph.nodes.find(n => n.id === nid);

  // If a route is already completed, start a new one with this click as the new Start
  if (startId && endId) {
    resetRoute();
  }

  if (!startId) {
    startId = nid;
    if (startMarker) map.removeLayer(startMarker);
    startMarker = L.marker([node.lat, node.lng], { title: 'Start' }).addTo(map);
    startMarker.bindPopup('<span class="badge">Start</span>').openPopup();
    updateStatus('Now click to choose the destination.');
    return;
  }

  if (!endId) {
    endId = nid;
    if (endMarker) map.removeLayer(endMarker);
    endMarker = L.marker([node.lat, node.lng], { title: 'End' }).addTo(map);
    endMarker.bindPopup('<span class="badge">End</span>').openPopup();
  }

  if (startId && endId) {
    const { distance, path } = dijkstra(currentGraph.adjacency, startId, endId, {
      avoidUnpaved: avoidUnpavedEl.checked,
      unpavedFactor: 3,
    });
    if (!path || path.length === 0 || !Number.isFinite(distance)) {
      updateStatus('No route found between selected points.');
      setDistance(null);
      if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
      return;
    }

    // Draw polyline
    const latlngs = path.map(id => {
      const n = currentGraph.nodes.find(x => x.id === id);
      return [n.lat, n.lng];
    });
    drawRoutePolyline(latlngs);
    setDistance(distance);
    updateStatus(`Path with ${path.length - 1} edges. Click anywhere to start a new route, or use Reset.`);
  }
});

// Initial view to encompass the grid
const allLatLngs = currentGraph.nodes.map(n => [n.lat, n.lng]);
if (allLatLngs.length) {
  map.fitBounds(L.latLngBounds(allLatLngs), { padding: [30, 30] });
}

// Expose small API for console debugging
window.__dijkstraDemo = {
  dijkstra,
  get nodes() { return currentGraph.nodes; },
  get adjacency() { return currentGraph.adjacency; }
};
