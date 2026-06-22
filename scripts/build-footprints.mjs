// Fetch real building footprint polygons (from OpenStreetMap / Overpass) for each
// building in the 'Buildings' sheet, so facility buildings can be highlighted by
// their actual outline instead of a circle.
//
// Output: public/data/facility-footprints.geojson — one Polygon feature per matched
// building, tagged with its `key` (matching the Buildings/Map Data join key).
//
// This hits the network, so it is NOT part of the per-build/CI pipeline. Run it
// manually (`npm run footprints`) when buildings change; the result is committed and
// consumed by the app + CI build. Buildings with no nearby footprint (distributed /
// placeholder sites) are reported and fall back to a circle highlight in the app.
import ExcelJS from "exceljs";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const WB = `${ROOT}/TSS-CRF-MapData.xlsx`;
const OUT = `${ROOT}/public/data/facility-footprints.geojson`;
const SEARCH_RADIUS = 60; // metres around each point to look for a building
const OVERPASS = "https://overpass-api.de/api/interpreter";

const norm = (v) => (v == null ? "" : typeof v === "object" ? String(v.text ?? v.result ?? "") : String(v)).trim();

// Ray-casting point-in-polygon. ring = [[lon,lat],...].
function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function ringCentroid(ring) {
  let x = 0, y = 0;
  for (const [lon, lat] of ring) {
    x += lon;
    y += lat;
  }
  return [x / ring.length, y / ring.length];
}
function metres(aLon, aLat, bLon, bLat) {
  const R = 6371000, toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad;
  const dLon = (bLon - aLon) * toRad;
  const la = aLat * toRad, lb = bLat * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// Shoelace area (relative) to prefer the smallest enclosing building.
function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(a / 2);
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(WB);
const ws = wb.getWorksheet("Buildings");
const header = ws.getRow(1).values.map(norm);
const col = (n) => header.indexOf(n);
const cKey = col("Key"), cLat = col("Latitude"), cLon = col("Longitude"), cName = col("Building Name"), cCode = col("Building Code");

// Area-weighted polygon centroid (the true centre of mass of the footprint).
// Falls back to the vertex average for degenerate/near-zero-area rings.
function centroidOf(ring) {
  let A = 0, cx = 0, cy = 0;
  for (let i = 0, n = ring.length - 1; i < n; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const cross = x0 * y1 - x1 * y0;
    A += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  A *= 0.5;
  if (Math.abs(A) < 1e-12) {
    const pts = ring.slice(0, -1);
    return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  }
  return [cx / (6 * A), cy / (6 * A)];
}

const entries = [];
ws.eachRow((row, i) => {
  if (i === 1) return;
  const key = norm(row.getCell(cKey).value);
  const latV = row.getCell(cLat).value;
  const lonV = row.getCell(cLon).value;
  if (!key || latV == null || latV === "" || lonV == null || lonV === "") return; // skip blank/placeholder rows
  const lat = Number(latV), lon = Number(lonV);
  if (Number.isFinite(lat) && Number.isFinite(lon))
    entries.push({ key, name: norm(row.getCell(cName).value), code: norm(row.getCell(cCode).value), lat, lon });
});
console.log(`Looking up footprints for ${entries.length} buildings…`);

// One Overpass query: union of building ways near every point.
const query = `[out:json][timeout:90];(${entries
  .map((e) => `way["building"](around:${SEARCH_RADIUS},${e.lat},${e.lon});`)
  .join("")});out geom;`;

const res = await fetch(OVERPASS, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "usyd-tss-crf-map/0.1 (footprints)" },
  body: "data=" + encodeURIComponent(query),
});
if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
const data = await res.json();
const ways = (data.elements ?? [])
  .filter((el) => el.type === "way" && Array.isArray(el.geometry) && el.geometry.length >= 4)
  .map((el) => ({ ring: el.geometry.map((g) => [g.lon, g.lat]), name: el.tags?.name ?? "" }));
console.log(`Overpass returned ${ways.length} candidate building footprints.`);

const features = [];
const unmatched = [];
for (const e of entries) {
  const containing = ways.filter((w) => pointInRing(e.lon, e.lat, w.ring));
  let chosen = containing.sort((a, b) => ringArea(a.ring) - ringArea(b.ring))[0];
  if (!chosen) {
    // nearest building centroid within radius
    let best = null, bestD = Infinity;
    for (const w of ways) {
      const [cx, cy] = ringCentroid(w.ring);
      const d = metres(e.lon, e.lat, cx, cy);
      if (d < bestD) (bestD = d), (best = w);
    }
    if (best && bestD <= SEARCH_RADIUS) chosen = best;
  }
  if (!chosen) {
    unmatched.push(e.key);
    continue;
  }
  const ring = chosen.ring;
  if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) ring.push(ring[0]);
  // label = building code (e.g. "J03"); blank for code-less off-campus sites.
  features.push({
    type: "Feature",
    properties: { key: e.key, name: e.name, code: e.code, label: e.code, centroid: centroidOf(ring) },
    geometry: { type: "Polygon", coordinates: [ring] },
  });
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ type: "FeatureCollection", features }));
console.log(`✔ Wrote ${features.length} footprints -> public/data/facility-footprints.geojson`);
if (unmatched.length) console.log(`⚠ No footprint found (will use circle fallback): ${unmatched.join(", ")}`);
