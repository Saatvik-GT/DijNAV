# Mini Maps with Dijkstra

An in-browser demo that shows how to compute and display shortest paths using Dijkstra's algorithm on a small synthetic graph rendered over a Leaflet map.

- Tiles: OpenStreetMap (via Leaflet)
- Graph: Generated grid around the current map center
- Algorithm: Dijkstra's (array-based priority queue for simplicity)

## How it works

- We build a grid graph of nodes with lat/lng locations and 4-neighbor connections.
- Edge weights are geographic distances (Haversine, meters).
- Click once to choose the start; click again to choose the destination (nearest graph node is used for each click).
- Dijkstra computes the shortest path and we render it as a polyline.

## Run locally

Any static HTTP server will work. Example using Python:

```powershell
# From the workspace root or the maps-dijkstra folder
cd "c:\Users\rajiv\OneDrive\Documents\VisualStudio\maps-dijkstra";
python -m http.server 5510
```

Then open http://localhost:5510/ in your browser.

## Regions (country/state)

- Use the Region dropdown to constrain the map to a specific country or state. Panning is restricted to the region's bounds.
- You can add or edit regions in `regions.js` (bounds and default view).

## Using real roads (beta)

- Check the "Use roads" toggle in the header. This queries the OpenStreetMap Overpass API for roads inside the current map view and builds a routing graph from those ways.
- If you see an error, try zooming in further (to reduce query size) and toggling again.
- Notes:
	- For simplicity, all roads are treated as bidirectional.
	- We include common road types and skip footways/cycleways by default (configurable in `osm.js`).
	- This runs completely in the browser and relies on Overpass CORS support; if the endpoint rate-limits, just retry after a bit.

	## Unpaved-aware routing (new)

	- Toggle "Avoid unpaved" to penalize unpaved (gravel/dirt/etc.) segments using OSM tags.
	- Roads are color-coded when the graph is visible:
		- Green = paved
		- Brown = unpaved
	- Notes:
		- Classification uses common OSM tags like `surface=*`, `tracktype=*`, and `highway=track`.
		- Avoidance applies a cost multiplier to unpaved edges (default x3). Adjust in `app.js` if needed.

## Open world

- The map now starts in a global view with no panning restrictions.
- Use the search box to jump to a place, then toggle "Use roads" to fetch streets for that view and route along them.

	## Place search

	- Use the search box in the header to find places (powered by OSM Nominatim).
	- Selecting a result will pan/zoom the map to that place and re-clamp panning to the place’s bounding box.
	- You can then toggle "Use roads" and route on real streets in that area.

## Next steps / Ideas

- Replace the synthetic grid with real road data (e.g., small GeoJSON of roads) and build the graph from line segments.
- Add a proper priority queue (binary heap) for larger graphs.
- Add geocoding (search by address) and snap to nearest road.
- Support A* with heuristics for faster routing.
- Cache node lookups in a spatial index (kd-tree/quadtree) for better snapping performance.
