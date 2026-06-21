// One-time helper: geocode USyd building/location names via OSM Nominatim to
// seed accurate coordinates for the Buildings sheet. NOT part of the build.
// Respectful usage: sequential, 1.1s delay, descriptive User-Agent.
import ExcelJS from "exceljs";

const WB = new URL("../TSS-CRF-MapData.xlsx", import.meta.url).pathname;

// Curated geocoding query per location key. Keys that Nominatim resolves poorly
// get an explicit, well-known query string; unresolved ones fall back to manual.
const QUERY = {
  "D17": "Charles Perkins Centre, University of Sydney, Camperdown NSW",
  "J03": "PNR Building, University of Sydney, Darlington NSW",
  "F09": "Madsen Building, University of Sydney, Camperdown NSW",
  "A31": "Sydney Nanoscience Hub, University of Sydney, Camperdown NSW",
  "F11": "School of Chemistry, University of Sydney, Camperdown NSW",
  "G08": "Molecular Bioscience Building, University of Sydney, Camperdown NSW",
  "A28": "Physics Building, University of Sydney, Camperdown NSW",
  "J07": "School of Aerospace Mechanical and Mechatronic Engineering, University of Sydney",
  "J05": "Link Building, University of Sydney, Darlington NSW",
  "A10": "Macleay Building, University of Sydney, Camperdown NSW",
  "D18": "Susan Wakil Health Building, University of Sydney, Camperdown NSW",
  "Centenary Institute": "Centenary Institute, Missenden Road, Camperdown NSW",
  "Brain and Mind Centre": "Brain and Mind Centre, 94 Mallett Street, Camperdown NSW",
  "Kolling Institute": "Kolling Institute, St Leonards NSW",
  "Royal North Shore Hospital": "Royal North Shore Hospital, St Leonards NSW",
  "Biomedical Building, Australian Technology Park": "Biomedical Building, Australian Technology Park, Eveleigh NSW",
  "Moore College": "Moore Theological College, Newtown NSW",
  "Narrabri Campus": "I.A. Watson Grains Research Centre, Narrabri NSW",
  "Sydney Institute of Agriculture": "RMC Gunn Building, University of Sydney, Camperdown NSW",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function geocode(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=au&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "usyd-tss-crf-map/0.1 (seed script; renee.e.barber@gmail.com)" },
  });
  if (!res.ok) return null;
  const j = await res.json();
  if (!j.length) return null;
  return { lat: +j[0].lat, lon: +j[0].lon, display: j[0].display_name };
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(WB);
const ws = wb.getWorksheet("Map Data");
const header = ws.getRow(1).values;
const col = (name) => header.indexOf(name);
const cCode = col("Building Code");
const cLoc = col("Location / Building");

// Collect unique keys: prefer building code, else location name.
const keys = new Map(); // key -> sample location name
ws.eachRow((row, i) => {
  if (i === 1) return;
  const code = row.getCell(cCode).value;
  const loc = row.getCell(cLoc).value;
  const codeStr = code ? String(code).replace(/ma$/, "").trim() : "";
  const key = codeStr || (loc ? String(loc).trim() : "");
  if (key && !keys.has(key)) keys.set(key, loc ? String(loc).trim() : "");
});

console.log(`Unique location keys: ${keys.size}\n`);
const out = [];
for (const [key, name] of keys) {
  const q = QUERY[key] ?? `${name}, University of Sydney NSW`;
  let r = null;
  try { r = await geocode(q); } catch (e) { /* ignore */ }
  out.push({ key, name, query: q, lat: r?.lat ?? null, lon: r?.lon ?? null, display: r?.display ?? "" });
  console.log(
    `${key.padEnd(8)} ${(r ? `${r.lat.toFixed(6)}, ${r.lon.toFixed(6)}` : "NOT FOUND").padEnd(24)} ${r?.display ?? q}`,
  );
  await sleep(1100);
}

await import("node:fs").then((fs) =>
  fs.writeFileSync(new URL("./seed-geocode.out.json", import.meta.url), JSON.stringify(out, null, 2)),
);
console.log("\nWrote scripts/seed-geocode.out.json");
