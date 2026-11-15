export function approximateRadiusPolygon(longitude: number, latitude: number, radiusMeters: number, segments = 64) {
  const earthRadius = 6_371_000;
  const angularRadius = radiusMeters / earthRadius;
  const lat = latitude * Math.PI / 180;
  const lon = longitude * Math.PI / 180;
  const ring: number[][] = [];
  for (let index = 0; index <= segments; index += 1) {
    const bearing = 2 * Math.PI * index / segments;
    const nextLat = Math.asin(Math.sin(lat) * Math.cos(angularRadius) + Math.cos(lat) * Math.sin(angularRadius) * Math.cos(bearing));
    const nextLon = lon + Math.atan2(Math.sin(bearing) * Math.sin(angularRadius) * Math.cos(lat), Math.cos(angularRadius) - Math.sin(lat) * Math.sin(nextLat));
    ring.push([nextLon * 180 / Math.PI, nextLat * 180 / Math.PI]);
  }
  return { type: "Polygon" as const, coordinates: [ring] };
}
