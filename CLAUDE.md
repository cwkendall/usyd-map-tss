# USyd TSS & CRF Facilities Map

Interactive, themeable MapLibre map of University of Sydney **Technical Support Services
(TSS)** and **Core Research Facilities (CRF)**. 100% static SPA; all content is data-driven
from an Excel workbook; deploys to GitHub Pages via Actions.

- **Live:** https://cwkendall.github.io/usyd-map-tss/
- **Repo:** https://github.com/cwkendall/usyd-map-tss  (owner `cwkendall`, public, branch `main`)

## Status (what works)
Map renders TSS + CRF facility pins from the workbook; layer/capability toggles; base-map
detail (Low/Med/High); USyd-corporate theme with live colour editing + presets; **fan-out**
and **spiderfy** overlap modes for co-located pins; hover + click popups with links; search;
right-hand **Facility Index** panel; cream buildings with **ochre highlight on facility
buildings using real OSM footprints** + building-code labels; high-res PNG export; shareable
URL hash. Deployed and green on CI.

## Toolchain (IMPORTANT)
- Node 22 (pinned in `.node-version` + `engines`), npm, uv, gh — installed via Homebrew but
  **NOT on the default PATH**. Prefix every shell command with
  `eval "$(/opt/homebrew/bin/brew shellenv)"` (the user has not added it to `~/.zprofile`).
- The preview MCP launches the dev server via `.claude/launch.json` (it wraps the command in
  `zsh -lc` with the brew eval, because the runner also lacks node on PATH).
- Python is only used for two helper scripts and MUST be sandboxed with uv
  (`uv run --with openpyxl python …`). Never `pip install` (see global `~/.claude/AGENTS.md`).
- Network-bound commands (npm install, geocode/footprints, git push) run inside the normal
  sandbox — no `dangerouslyDisableSandbox` needed.

## Commands
npm scripts (and matching slash commands in `.claude/commands/`):
- `npm run dev` — `predev` builds data, then Vite dev server (port 5173).
- `npm run build` — build data + `vite build` → `dist/` (Pages base path `/usyd-map-tss/`).
- `npm run build:data` — Excel → `public/data/*` (`/build-data`).
- `npm run geocode` — fill MISSING `Buildings` coords via OSM Nominatim, idempotent (`/geocode`).
- `npm run footprints` — fetch OSM building outlines → `facility-footprints.geojson` (`/footprints`).
- `/deploy` — build, commit, push (CI redeploys). `npm run typecheck` — `tsc --noEmit`.

## Update the map (common task)
1. Edit `TSS-CRF-MapData.xlsx` — facilities in **Map Data**, coordinates in **Buildings**.
2. New building/site? `npm run geocode` to seed missing coords, then verify the amber rows.
3. Buildings added/moved? `npm run footprints` to refresh outlines (committed; CI does NOT
   regenerate it because it needs network).
4. `npm run build:data`, preview with `npm run dev`, then commit + push (`/deploy`).

## Data model
- **`TSS-CRF-MapData.xlsx`** — source of truth (build is READ-ONLY on it, preserving styles).
  - `Map Data` — one row per facility *location*: Map Label (`1`,`3b`…), Legend No, Loc Sub-ID,
    Facility, Division (TSS/CRF), Capability Cluster + Cluster Colour, Shade, Fill Hex,
    Location/Building, Building Code, On Campus, Address/Notes, Link/Website.
  - `Buildings` — coordinates keyed by **Building Code** (e.g. `D17`, `A10ma`, `J03`) or, for
    code-less off-campus sites, by the exact **Location/Building** name. Amber-filled rows are
    seeded/estimated coordinates flagged "verify". Edit lat/lon here to move pins.
  - `README`, `Facilities`, `Capability Legend` — supporting/derived sheets (not read by build).
- **Join key** (used by `build-data.mjs` and `build-footprints.mjs`): `Building Code` if present,
  else `Location/Building` name. Must match the `Buildings` sheet `Key` column.
- **Generated** in `public/data/` (git-ignored EXCEPT footprints, which is committed):
  `facilities.tss.geojson`, `facilities.crf.geojson`, `buildings.json`, `legend.json`,
  `build-report.json` (counts + warnings — read this after data changes), and
  `facility-footprints.geojson` (from OSM, committed, consumed by app + CI).

## File layout
```
TSS-CRF-MapData.xlsx        source of truth (Buildings sheet added by add-buildings-sheet.py)
index.html                  #map, #ui (left panel), #index (right panel)
vite.config.ts              base path /usyd-map-tss/ on build; / on dev
.node-version / package.json Node 22; scripts; allowScripts(esbuild)
scripts/
  build-data.mjs            Excel -> GeoJSON/JSON (exceljs, read-only). RUN IN BUILD/CI.
  build-footprints.mjs      OSM Overpass -> facility-footprints.geojson (centroid + code label). MANUAL.
  geocode-buildings.py      uv+openpyxl; fill missing Buildings coords via Nominatim. MANUAL.
  add-buildings-sheet.py    uv+openpyxl; one-time bootstrap of the Buildings sheet. (historical)
  seed-geocode.mjs          one-time initial geocode helper. (historical)
src/
  config.ts                basemap source toggle, view (center/zoom/maxBounds), data paths
  theme.ts                 Palette type, THEMES presets (default USyd), load/save/apply (localStorage)
  styles.css               all UI + marker + popup + panel CSS (CSS vars from theme)
  main.ts                  map init, controls/nav, highlight+label layers, wiring, start()
  map/style.ts             buildStyle(palette, detail) -> MapLibre style (OpenMapTiles schema)
  map/markers.ts           Facilities class: load, group-by-building, layout(), spiderfy/fan, popups
  map/export.ts            high-res PNG (offscreen map + redrawn markers/legend/title)
  ui/controls.ts           left panel: search, toggles, detail, overlap mode, highlight, theme, export
  ui/index-panel.ts        right panel: full facility index, click-to-locate
.github/workflows/deploy.yml  Pages deploy (Node from .node-version; build; upload; deploy)
.claude/launch.json        preview server config   .claude/commands/*.md  slash commands
```

## Conventions & key design decisions
- **Capability clusters** (categorical, NOT themed): Pink=Biomedical & Cellular Analysis,
  Blue=Chemical & Materials Characterization, Green=Digital & Computational,
  Orange=Fabrication & Engineering. **CRF = darker shade, TSS = lighter shade.** Colours come
  from the workbook `Fill Hex`; unclustered facilities (Mass Spec TSS) render neutral grey.
- **Theme** drives basemap + UI chrome only (monochrome charcoal/grey/white + ochre primary +
  cream secondary). Buildings render cream; **facility buildings are highlighted ochre**.
- **Marker placement** (`markers.ts` `layout()` is the single source of truth, shared with
  export): co-located pins are placed at **fixed geographic positions** (small metre offsets
  around the building centroid), NOT pixel offsets — pixel offsets slide across the map on
  zoom. Buildings are anchored to their **footprint centroid** (area-weighted, via
  `setBuildingAnchors`) so pins/labels sit dead-centre on the building.
  - **Fan-out** (current default): all co-located pins fanned around the centre, always shown.
  - **Spiderfy**: collapse to a count "hub" at the centroid; click to fan out. (Default switched
    to fan-out while spider UX is refined.)
- **Building-code labels**: a `facility-labels` symbol layer at FIXED points (no zoom-dependent
  text-offset) — centred on multi-facility buildings (pins fan around), ~14 m below the pin on
  single-facility ones. Dark ochre `#5A2A12`.
- **Highlight layers are added imperatively** in `main.ts` (`ensureFacilityLayers`) after each
  style load, NOT inside `buildStyle` — this avoids MapLibre `setStyle`-diff "source not found"
  errors on theme/detail changes. Sources: `facility-footprints` (polygons), `facility-points`
  (circle fallback for sites with no footprint), `facility-labels` (codes). Repopulated by
  `updateFacilityHighlight()` on filter/highlight/mode changes and `styledata`.
- **HTML markers** (`maplibregl.Marker`) survive `map.setStyle()`, so theme/detail changes don't
  recreate them. Never put `transition: transform` on a marker element (causes pan/zoom lag).

## Known data caveats (verify in the Buildings sheet — amber rows)
- **J05** → OSM "Workshop" building; **J07** → OSM "Mechanical Engineering" (AMME). Both were
  wrong before (J05 duplicated J03's coordinate) — corrected, flagged verify.
- **Sydney Institute of Agriculture** (distributed, no code) → relocated to **R. D. Watt
  Building** so it no longer overlaps A31's footprint. Best-effort placeholder.
- **Madsen (F09)** matched a small OSM footprint (tiny highlight). **Narrabri** has no nearby
  OSM building → circle-highlight fallback. **Geoscience (TSS)** has no location → omitted.
- Duplicate-building check: no two *coded* buildings now share a location. Re-check after edits
  (pairs within ~30 m with different codes indicate an error — each code is a unique building).

## Verification
`npm run typecheck`; `npm run dev` + preview MCP (check console errors, screenshot, toggle
layers/detail/theme, expand a hub, zoom to confirm markers/labels stay on their building).
`build-report.json` should show the expected feature counts (~37 located) and only the
Geoscience warning.
