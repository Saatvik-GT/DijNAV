// geocode.js - Nominatim search helpers
// searchPlaces(query, { limit, viewbox, bounded }) returns array of { display, center, bounds }

export async function searchPlaces(query, opts = {}) {
  const { limit = 5, viewbox = null, bounded = false, signal } = opts;
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '0',
    polygon_geojson: '0',
    limit: String(limit),
  });
  if (viewbox) {
    // viewbox expects left,top,right,bottom in lon,lat
    const sw = viewbox.getSouthWest();
    const ne = viewbox.getNorthEast();
    const left = sw.lng, right = ne.lng, top = ne.lat, bottom = sw.lat;
    params.set('viewbox', `${left},${top},${right},${bottom}`);
    if (bounded) params.set('bounded', '1');
  }
  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
  const resp = await fetch(url, { headers: { 'Accept': 'application/json' }, signal });
  if (!resp.ok) throw new Error(`Nominatim error: ${resp.status}`);
  const data = await resp.json();
  return (data || []).map((d) => ({
    display: d.display_name,
    center: [parseFloat(d.lat), parseFloat(d.lon)],
    bounds: toBoundsFromNominatim(d.boundingbox),
  }));
}

export function toBoundsFromNominatim(bbox) {
  // bbox: [south, north, west, east] as strings
  if (!bbox || bbox.length !== 4) return null;
  const s = parseFloat(bbox[0]);
  const n = parseFloat(bbox[1]);
  const w = parseFloat(bbox[2]);
  const e = parseFloat(bbox[3]);
  return L.latLngBounds([[s, w], [n, e]]);
}
