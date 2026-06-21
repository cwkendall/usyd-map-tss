import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import { config } from "./config";
import type { DetailLevel } from "./config";
import { buildStyle } from "./map/style";
import { Facilities, type Filter } from "./map/markers";
import { exportPng } from "./map/export";
import { buildControls, type LegendCluster } from "./ui/controls";
import { loadTheme, saveTheme, clearSavedTheme, defaultTheme, applyThemeVars, type Theme } from "./theme";
import "./styles.css";

// --- pmtiles protocol (only used when basemapSource === "pmtiles") ----------
if (config.basemapSource === "pmtiles") {
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
}

// --- state -------------------------------------------------------------------
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

async function start() {
  const [legendRaw] = await Promise.all([
    fetch(config.data.legend).then((r) => r.json()) as Promise<{ clusters: LegendCluster[] }>,
    facilities.load(),
  ]);
  for (const c of facilities.clusters()) filter.clusters.add(c);

  const renderWhenReady = () => facilities.render();
  if (map.isStyleLoaded()) renderWhenReady();
  else map.once("load", renderWhenReady);

  buildControls({
    mount: document.getElementById("ui")!,
    legend: legendRaw.clusters,
    facilities,
    currentTheme: theme,
    filter,
    detail,
    on: {
      filter: (f) => facilities.setFilter(f),
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
}

start();
