import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature } from "geojson";
import { Protocol } from "pmtiles";
import { config } from "./config";
import type { DetailLevel } from "./config";
import { buildStyle } from "./map/style";
import { Facilities, type Filter, type OverlapMode } from "./map/markers";
import { exportPng } from "./map/export";
import { buildControls, type LegendCluster } from "./ui/controls";
import { buildIndexPanel } from "./ui/index-panel";
import { loadTheme, saveTheme, clearSavedTheme, defaultTheme, applyThemeVars, type Theme } from "./theme";
import "./styles.css";

// --- pmtiles protocol (only used when basemapSource === "pmtiles") ----------
if (config.basemapSource === "pmtiles") {
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
}

// --- state -------------------------------------------------------------------
const OPTS_KEY = "usyd-map-opts-v1";
const opts = { overlap: "spider" as OverlapMode, highlight: true, ...readOpts() };
function readOpts(): Partial<{ overlap: OverlapMode; highlight: boolean }> {
  try {
    return JSON.parse(localStorage.getItem(OPTS_KEY) ?? "{}");
  } catch {
    return {};
  }
}
function saveOpts() {
  localStorage.setItem(OPTS_KEY, JSON.stringify({ overlap: opts.overlap, highlight: opts.highlight }));
}

let theme: Theme = loadTheme();
let detail: DetailLevel = "medium";
const filter: Filter = { divisions: new Set(["TSS", "CRF"]), clusters: new Set() };

applyThemeVars(theme);

// --- map ---------------------------------------------------------------------
const map = new maplibregl.Map({
  container: "map",
  style: buildStyle(theme.palette, detail),
  center: config.center,
  zoom: config.zoom,
  minZoom: config.minZoom,
  maxZoom: config.maxZoom,
  maxBounds: config.maxBounds,
  hash: "view", // shareable center/zoom in the URL
  attributionControl: false,
  canvasContextAttributes: { preserveDrawingBuffer: true }, // needed for image export
});

map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
const geolocate = new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true });
map.addControl(geolocate, "top-right");
map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
map.addControl(new maplibregl.FullscreenControl(), "top-right");
map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: config.attribution }), "bottom-right");

function rebuildStyle() {
  map.setStyle(buildStyle(theme.palette, detail)); // HTML markers survive this
}

// --- data + UI ---------------------------------------------------------------
const facilities = new Facilities(map);

// Real OSM footprints of facility buildings, keyed by building key.
let footprints: { type: "FeatureCollection"; features: Feature[] } = { type: "FeatureCollection", features: [] };
let footprintKeys = new Set<string>();

// Highlight buildings that contain a facility. Buildings with a real footprint
// get their actual outline (ochre); the few without one (regional/placeholder)
// fall back to a circle. Both update with the active division/capability filter.
function updateFacilityHighlight() {
  const fpSrc = map.getSource("facility-footprints") as maplibregl.GeoJSONSource | undefined;
  const ptSrc = map.getSource("facility-points") as maplibregl.GeoJSONSource | undefined;
  if (!fpSrc || !ptSrc) return;
  if (!opts.highlight) {
    fpSrc.setData({ type: "FeatureCollection", features: [] });
    ptSrc.setData({ type: "FeatureCollection", features: [] });
    return;
  }
  const visible = facilities.visibleGroups();
  const visibleKeys = new Set(visible.map((g) => g.key));
  fpSrc.setData({
    type: "FeatureCollection",
    features: footprints.features.filter((f) => visibleKeys.has((f.properties as { key: string }).key)),
  });
  ptSrc.setData({
    type: "FeatureCollection",
    features: visible
      .filter((g) => !footprintKeys.has(g.key))
      .map((g) => ({ type: "Feature", geometry: { type: "Point", coordinates: [g.lon, g.lat] }, properties: {} })),
  });
}

// Add the ochre highlight sources/layers imperatively so they survive basemap
// restyles (theme/detail) without setStyle-diff "source not found" churn.
function ensureFacilityLayers() {
  const pal = theme.palette;
  const empty = { type: "FeatureCollection" as const, features: [] };
  if (!map.getSource("facility-footprints")) map.addSource("facility-footprints", { type: "geojson", data: empty });
  if (!map.getSource("facility-points")) map.addSource("facility-points", { type: "geojson", data: empty });
  const before = map.getStyle().layers.find((l) => l.type === "symbol")?.id; // keep under labels
  if (!map.getLayer("facility-footprint-fill"))
    map.addLayer({ id: "facility-footprint-fill", type: "fill", source: "facility-footprints", paint: { "fill-color": pal.primary, "fill-opacity": 0.45 } }, before);
  if (!map.getLayer("facility-footprint-line"))
    map.addLayer({ id: "facility-footprint-line", type: "line", source: "facility-footprints", paint: { "line-color": pal.primary, "line-width": 1.6, "line-opacity": 0.95 } }, before);
  if (!map.getLayer("facility-highlight"))
    map.addLayer(
      {
        id: "facility-highlight",
        type: "circle",
        source: "facility-points",
        paint: {
          "circle-color": pal.primary,
          "circle-opacity": 0.3,
          "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 12, 3, 15, 13, 17, 34, 19, 90],
          "circle-stroke-color": pal.primary,
          "circle-stroke-width": 1.5,
          "circle-stroke-opacity": 0.85,
        },
      },
      before,
    );
}

// Re-add layers + repopulate on initial load and after every restyle.
function onStyleReady() {
  if (!map.isStyleLoaded()) return;
  ensureFacilityLayers();
  updateFacilityHighlight();
}
map.on("load", onStyleReady);
map.on("styledata", onStyleReady);

// Debug handles (dev only) for inspection/automation.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__map = map;
  (window as unknown as Record<string, unknown>).__facilities = facilities;
}

async function start() {
  const [legendRaw] = await Promise.all([
    fetch(config.data.legend).then((r) => r.json()) as Promise<{ clusters: LegendCluster[] }>,
    facilities.load(),
    fetch(config.data.footprints)
      .then((r) => (r.ok ? r.json() : { type: "FeatureCollection", features: [] }))
      .then((fc) => {
        footprints = fc;
        footprintKeys = new Set(fc.features.map((f: Feature) => (f.properties as { key: string }).key));
      })
      .catch(() => {}),
  ]);
  for (const c of facilities.clusters()) filter.clusters.add(c);

  facilities.setMode(opts.overlap);
  const renderWhenReady = () => {
    facilities.render();
    updateFacilityHighlight();
  };
  if (map.isStyleLoaded()) renderWhenReady();
  else map.once("load", renderWhenReady);

  buildControls({
    mount: document.getElementById("ui")!,
    legend: legendRaw.clusters,
    facilities,
    currentTheme: theme,
    filter,
    detail,
    overlap: opts.overlap,
    highlight: opts.highlight,
    on: {
      filter: (f) => {
        facilities.setFilter(f);
        updateFacilityHighlight();
      },
      overlap: (m) => {
        opts.overlap = m;
        saveOpts();
        facilities.setMode(m);
      },
      highlight: (h) => {
        opts.highlight = h;
        saveOpts();
        updateFacilityHighlight();
      },
      detail: (d) => {
        detail = d;
        rebuildStyle();
      },
      theme: (t) => {
        theme = t;
        applyThemeVars(theme);
        saveTheme(theme);
        rebuildStyle();
      },
      resetTheme: () => {
        clearSavedTheme();
        theme = defaultTheme();
        applyThemeVars(theme);
        rebuildStyle();
      },
      export: (o) =>
        exportPng(map, facilities, {
          ...o,
          legendData: legendRaw.clusters,
          divisions: filter.divisions,
        }).catch((e) => alert("Export failed: " + e.message)),
      search: (f) => facilities.focus(f),
      locate: () => geolocate.trigger(),
    },
  });

  buildIndexPanel({
    mount: document.getElementById("index")!,
    facilities,
    legend: legendRaw.clusters,
    onSelect: (f) => facilities.focus(f),
  });
}

start();
