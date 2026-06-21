// Build pipeline: TSS-CRF-MapData.xlsx -> GeoJSON + JSON for the map app.
// READ-ONLY on the workbook (never writes it, so cell styles are untouched).
// Joins each 'Map Data' row to the 'Buildings' sheet for coordinates.
//
//   Map Data row  --(Building Code, else Location/Building name)-->  Buildings row
//
// Outputs to public/data/:
//   facilities.tss.geojson, facilities.crf.geojson  (one feature per located row)
//   buildings.json   (key -> coords)
//   legend.json      (clusters + colours + divisions, derived from the data)
//   build-report.json (counts + warnings)
import ExcelJS from "exceljs";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const WB = `${ROOT}/TSS-CRF-MapData.xlsx`;
const OUT = `${ROOT}/public/data`;

const norm = (v) => {
  if (v == null) return "";
  if (typeof v === "object") return String(v.text ?? v.result ?? v.hyperlink ?? "").trim();
  return String(v).trim();
};
const hex = (h) => {
  const s = norm(h).replace(/^#/, "");
  return /^[0-9a-fA-F]{6}$/.test(s) ? `#${s.toUpperCase()}` : null;
};
// White text on dark fills, dark text on light fills (WCAG-ish luminance test).
const contrast = (h) => {
  if (!h) return "#212121";
  const n = h.replace(/^#/, "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.45 ? "#212121" : "#FFFFFF";
};
// A bare domain like "sydney.edu.au/x" is a link; prose with spaces/"?" is a note.
const asLink = (raw) => {
  const s = norm(raw);
  if (!s) return { url: null, note: "" };
  if (/^https?:\/\//i.test(s)) return { url: s, note: "" };
  if (!/\s/.test(s) && /\.[a-z]{2,}(\/|$)/i.test(s)) return { url: `https://${s}`, note: "" };
  return { url: null, note: s };
};

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(WB);

function rows(sheetName) {
  const ws = wb.getWorksheet(sheetName);
  if (!ws) throw new Error(`Missing sheet: ${sheetName}`);
  const header = ws.getRow(1).values.map((v) => norm(v));
  const idx = {};
  header.forEach((h, i) => h && (idx[h] = i));
  const out = [];
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const o = {};
    for (const [h, i2] of Object.entries(idx)) o[h] = row.getCell(i2).value;
    out.push(o);
  });
  return out;
}

// ---- Buildings lookup -------------------------------------------------------
const buildings = {};
for (const b of rows("Buildings")) {
  const key = norm(b["Key"]);
  const lat = b["Latitude"] == null ? null : Number(b["Latitude"]);
  const lon = b["Longitude"] == null ? null : Number(b["Longitude"]);
  if (!key) continue;
  buildings[key] = {
    name: norm(b["Building Name"]),
    code: norm(b["Building Code"]),
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
    campus: norm(b["Campus"]),
    notes: norm(b["Source / Notes"]),
  };
}

// ---- Facilities -> features -------------------------------------------------
const warnings = [];
const features = { TSS: [], CRF: [] };
const clusterMap = new Map(); // cluster -> {colour, TSS:hex, CRF:hex}

for (const r of rows("Map Data")) {
  const facility = norm(r["Facility"]);
  if (!facility) continue;
  const division = norm(r["Division"]).toUpperCase();
  const code = norm(r["Building Code"]);
  const locName = norm(r["Location / Building"]);
  const key = code || locName;
  const b = buildings[key];

  const cluster = norm(r["Capability Cluster"]);
  const fill = hex(r["Fill Hex"]);
  if (cluster) {
    const e = clusterMap.get(cluster) ?? { cluster, colour: norm(r["Cluster Colour"]) };
    if (division === "TSS" && fill) e.TSS = fill;
    if (division === "CRF" && fill) e.CRF = fill;
    clusterMap.set(cluster, e);
  }

  if (!b || b.lat == null || b.lon == null) {
    warnings.push(`No coordinates for "${facility}" (${r["Map Label"] ?? "?"}) — key "${key || "(blank)"}"`);
    continue;
  }
  const { url, note } = asLink(r["Link / Website"]);
  // Neutral grey for unclustered facilities (e.g. Mass Spec TSS, whose sheet
  // Fill Hex is white and would otherwise be invisible on the map).
  const fillHex = cluster && fill ? fill : "#9E9E9E";
  const feature = {
    type: "Feature",
    geometry: { type: "Point", coordinates: [b.lon, b.lat] },
    properties: {
      label: norm(r["Map Label"]),
      legendNo: norm(r["Legend No"]),
      subId: norm(r["Loc Sub-ID"]),
      facility,
      division,
      cluster: cluster || "Unassigned",
      clusterColour: norm(r["Cluster Colour"]),
      shade: norm(r["Shade"]),
      fillHex,
      fontHex: contrast(fillHex),
      building: locName || b.name,
      buildingCode: code,
      buildingKey: key,
      onCampus: norm(r["On Campus"]),
      notes: norm(r["Address / Notes"]),
      linkUrl: url,
      linkNote: note,
    },
  };
  if (division === "TSS" || division === "CRF") features[division].push(feature);
  else warnings.push(`Unknown division "${division}" for ${facility}`);
}

// ---- Legend (derived) -------------------------------------------------------
const legend = {
  clusters: [...clusterMap.values()].map((c) => ({
    cluster: c.cluster,
    colour: c.colour,
    tssHex: c.TSS ?? null,
    crfHex: c.CRF ?? null,
  })),
  divisions: [
    { code: "TSS", name: "Technical Support Services", shade: "Lighter" },
    { code: "CRF", name: "Core Research Facilities", shade: "Darker / saturated" },
  ],
};

// ---- Write ------------------------------------------------------------------
mkdirSync(OUT, { recursive: true });
const fc = (f) => ({ type: "FeatureCollection", features: f });
writeFileSync(`${OUT}/facilities.tss.geojson`, JSON.stringify(fc(features.TSS)));
writeFileSync(`${OUT}/facilities.crf.geojson`, JSON.stringify(fc(features.CRF)));
writeFileSync(`${OUT}/buildings.json`, JSON.stringify(buildings, null, 2));
writeFileSync(`${OUT}/legend.json`, JSON.stringify(legend, null, 2));
const report = {
  generatedAt: new Date().toISOString(),
  counts: { TSS: features.TSS.length, CRF: features.CRF.length, buildings: Object.keys(buildings).length },
  warnings,
};
writeFileSync(`${OUT}/build-report.json`, JSON.stringify(report, null, 2));

console.log(`✔ TSS features: ${features.TSS.length}`);
console.log(`✔ CRF features: ${features.CRF.length}`);
console.log(`✔ clusters: ${legend.clusters.length}  buildings: ${Object.keys(buildings).length}`);
if (warnings.length) {
  console.log(`\n⚠ ${warnings.length} warning(s):`);
  warnings.forEach((w) => console.log("  - " + w));
}
