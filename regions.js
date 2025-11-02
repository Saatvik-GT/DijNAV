// regions.js - predefined country/state regions with bounds and default views
// bounds format: [[south, west], [north, east]]

export const REGIONS = [
  {
    id: 'ch-pk',
    name: 'Chandigarh + Panchkula',
    // Bounds covering both cities: [[south, west], [north, east]]
    bounds: [[30.6500, 76.7000], [30.7800, 76.9500]],
    view: { center: [30.7333, 76.8200], zoom: 13 },
  },
];

export function toLatLngBounds(bounds) {
  return L.latLngBounds([bounds[0][0], bounds[0][1]], [bounds[1][0], bounds[1][1]]);
}
