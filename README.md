# USyd TSS & CRF Facilities Map

An interactive, themeable [MapLibre](https://maplibre.org/) map of the University of Sydney's
**Technical Support Services (TSS)** and **Core Research Facilities (CRF)**.

**Live site:** https://cwkendall.github.io/usyd-map-tss/

## Features
- Two division layers (TSS / CRF) and four colour-coded capability clusters, each toggleable.
- Facility pins coloured by capability (CRF darker, TSS lighter). Co-located pins switch
  between **spiderfy** (click to fan out) and **fan out** (always shown).
- Buildings are drawn in cream; buildings that contain a facility get a toggleable **ochre
  highlight** using their real OpenStreetMap footprint (circle fallback for sites without one).
- Hover and click **popups** with facility detail, building name/code, and website links.
- Pan/zoom, geolocate, fullscreen, scale, shareable URL view state.
- **Reskinnable**: monochrome + ochre + cream by default; switch presets or live-edit colours.
- Adjustable **base-map detail** (Low / Medium / High).
- **High-resolution PNG export** with title, legend and attribution.

## Data-driven
Everything is generated from `TSS-CRF-MapData.xlsx`:
- **Map Data** — one row per facility location.
- **Buildings** — coordinates keyed by building code (e.g. `J03`) or off-campus location name.

To update: edit the workbook → `npm run build:data` → commit & push. GitHub Actions rebuilds
and redeploys automatically.

## Develop
```bash
npm install
npm run dev      # builds data, starts dev server
npm run build    # production build into dist/
```
Requires Node 20+. The basemap defaults to hosted [OpenFreeMap](https://openfreemap.org/)
(no API key); see `src/config.ts` to self-host Protomaps PMTiles instead.

## Attribution
Basemap © OpenFreeMap · OpenMapTiles · OpenStreetMap contributors.
