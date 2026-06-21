# USyd TSS & CRF Facilities Map

Interactive, themeable MapLibre map of University of Sydney **Technical Support Services
(TSS)** and **Core Research Facilities (CRF)**. 100% static; data comes from an Excel
workbook; deploys to GitHub Pages.

Live: https://cwkendall.github.io/usyd-map-tss/ · Repo: https://github.com/cwkendall/usyd-map-tss

## Toolchain notes
- Node/uv/etc. are installed via Homebrew but **not on the default PATH**. Prefix shell
  commands with `eval "$(/opt/homebrew/bin/brew shellenv)"` (or add it to `~/.zprofile`).
- Python (only `scripts/add-buildings-sheet.py`) must run sandboxed:
  `uv run --with openpyxl python scripts/add-buildings-sheet.py`. Never `pip install`.

## Update the map (the common task)
1. Edit `TSS-CRF-MapData.xlsx` — facilities in **Map Data**, coordinates in **Buildings**.
2. If you added facilities at a new building/site, run `npm run geocode` (or `/geocode`) to
   geocode the missing coordinates into the **Buildings** sheet, then verify the amber rows.
3. If buildings were added/moved, run `npm run footprints` (or `/footprints`) to refresh the
   OSM building outlines used for the ochre highlight (`facility-footprints.geojson`).
4. `npm run build:data` (or `/build-data`) regenerates `public/data/*`.
5. `npm run dev` to preview, then commit + push → GitHub Actions redeploys (`/deploy`).

`npm run geocode` only ever fills MISSING coordinates (idempotent; never overwrites verified
rows), so it's safe to re-run.

## Data model
- **Workbook** `TSS-CRF-MapData.xlsx` is the source of truth (read-only at build time).
  - `Map Data` — one row per facility *location*. Map Label (`1`, `3b`…), Division (TSS/CRF),
    Capability Cluster + colour, Fill Hex, Location/Building, Building Code, link, notes.
  - `Buildings` — coordinates keyed by **Building Code** (e.g. `D17`, `A10ma`) or, for
    code-less off-campus sites, by the exact **Location/Building** name. Edit lat/lon here to
    move pins. Amber rows are seeded estimates flagged for verification.
- **Build** `scripts/build-data.mjs` (read-only on the xlsx, so cell styles are preserved)
  joins Map Data → Buildings and emits `public/data/`:
  `facilities.tss.geojson`, `facilities.crf.geojson`, `buildings.json`, `legend.json`,
  `build-report.json` (counts + warnings — check this when data changes).
- Generated data is git-ignored and rebuilt in CI and by `predev`.

## App structure (`src/`)
- `config.ts` — basemap source toggle (`openfreemap` | `pmtiles`), view, data paths.
- `theme.ts` — palette presets (default **USyd Corporate**) + live colour editing + persistence.
  Capability marker colours are NOT themed (kept categorical).
- `map/style.ts` — builds the MapLibre style from a palette + detail level (OpenMapTiles schema).
- `map/markers.ts` — capability markers, spiderfy for co-located pins, hover/click popups.
  `layout()` is the single source of truth for marker placement (shared with export).
- `map/export.ts` — high-res PNG: off-screen map at elevated pixel ratio + redrawn markers/legend.
- `ui/controls.ts` — panel: search, division/capability toggles, detail, theme editor, export.

## Conventions
- Capability clusters: Pink=Biomedical & Cellular Analysis, Blue=Chemical & Materials,
  Green=Digital & Computational, Orange=Fabrication & Engineering. CRF=darker shade, TSS=lighter.
- Known data gaps (surfaced in `build-report.json`): **Geoscience (TSS)** has no location →
  omitted until coordinates added; **Mass Spec (TSS)** has no cluster → neutral grey marker.
- Basemap default is OpenFreeMap (hosted). To self-host, set `basemapSource: "pmtiles"` and
  provide `public/basemap/sydney.pmtiles`.
