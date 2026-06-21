// Builds a MapLibre style (OpenMapTiles schema) from a theme palette + detail level.
// Every colour comes from the palette, so re-theming = rebuild this style.
// Detail level gates which feature classes/labels appear, to "reduce base detail".
import type { StyleSpecification, LayerSpecification } from "maplibre-gl";
import { config, type DetailLevel } from "../config";
import type { Palette } from "../theme";

const SOURCE = "basemap";

// Higher tier = more detail required to show. low=1, medium=2, high=3.
const TIER: Record<DetailLevel, number> = { low: 1, medium: 2, high: 3 };
const showAt = (detail: DetailLevel, need: DetailLevel) => TIER[detail] >= TIER[need];

function sourceDef() {
  if (config.basemapSource === "pmtiles") {
    return { type: "vector", url: `pmtiles://${config.pmtiles.url}`, attribution: config.attribution } as const;
  }
  return { type: "vector", url: config.openfreemap.tilesUrl, attribution: config.attribution } as const;
}

export function buildStyle(palette: Palette, detail: DetailLevel): StyleSpecification {
  const p = palette;
  const glyphs = config.basemapSource === "pmtiles" ? config.pmtiles.glyphs : config.openfreemap.glyphs;
  const layers: LayerSpecification[] = [];

  layers.push({ id: "bg", type: "background", paint: { "background-color": p.bg } });

  // Land / landcover wash
  layers.push({
    id: "landcover",
    type: "fill",
    source: SOURCE,
    "source-layer": "landcover",
    paint: { "fill-color": p.land, "fill-opacity": 0.6 },
  });
  if (showAt(detail, "medium")) {
    layers.push({
      id: "landuse",
      type: "fill",
      source: SOURCE,
      "source-layer": "landuse",
      paint: { "fill-color": p.land, "fill-opacity": 0.5 },
    });
    layers.push({
      id: "park",
      type: "fill",
      source: SOURCE,
      "source-layer": "park",
      paint: { "fill-color": p.green, "fill-opacity": 0.7 },
    });
  }

  // Water (always)
  layers.push({
    id: "water",
    type: "fill",
    source: SOURCE,
    "source-layer": "water",
    paint: { "fill-color": p.water },
  });
  if (showAt(detail, "medium")) {
    layers.push({
      id: "waterway",
      type: "line",
      source: SOURCE,
      "source-layer": "waterway",
      paint: { "line-color": p.water, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 16, 2] },
    });
  }

  // Buildings (medium+) — all buildings get a cream fill, clearly distinct from
  // the near-white base.
  if (showAt(detail, "medium")) {
    layers.push({
      id: "building",
      type: "fill",
      source: SOURCE,
      "source-layer": "building",
      minzoom: 13.5,
      paint: {
        "fill-color": p.building,
        "fill-outline-color": p.buildingOutline,
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 13.5, 0, 15, 0.95],
      },
    });
  }

  // NOTE: the ochre facility highlight (footprint fill/line + circle fallback) is
  // NOT defined here. It's added imperatively in main.ts after each style load, so
  // those custom data layers survive basemap restyles without setStyle-diff churn.

  // Roads — casing then fill. Major classes always; minor at medium; paths at high.
  const majorClasses = ["motorway", "trunk", "primary", "secondary"];
  const minorClasses = ["tertiary", "minor", "street", "service"];
  const pathClasses = ["path", "track", "pedestrian"];
  const roadFilterClasses = [...majorClasses];
  if (showAt(detail, "medium")) roadFilterClasses.push(...minorClasses);
  if (showAt(detail, "high")) roadFilterClasses.push(...pathClasses);
  const roadFilter: any = ["match", ["get", "class"], roadFilterClasses, true, false];

  layers.push({
    id: "road-casing",
    type: "line",
    source: SOURCE,
    "source-layer": "transportation",
    filter: roadFilter,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": p.roadCasing,
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.6, 14, 2.5, 17, 9],
    },
  });
  layers.push({
    id: "road-fill",
    type: "line",
    source: SOURCE,
    "source-layer": "transportation",
    filter: roadFilter,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": [
        "match",
        ["get", "class"],
        majorClasses,
        p.roadMajor,
        p.roadMinor,
      ] as any,
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.4, 14, 1.6, 17, 6],
    },
  });

  // Admin boundaries (subtle)
  layers.push({
    id: "boundary",
    type: "line",
    source: SOURCE,
    "source-layer": "boundary",
    filter: ["<=", ["get", "admin_level"], 6],
    paint: { "line-color": p.boundary, "line-width": 0.8, "line-dasharray": [2, 2], "line-opacity": 0.6 },
  });

  // --- Labels --------------------------------------------------------------
  const textHalo = { "text-halo-color": p.mapTextHalo, "text-halo-width": 1.4, "text-color": p.mapText };
  const fonts = ["Noto Sans Regular"];

  if (showAt(detail, "high")) {
    layers.push({
      id: "road-name",
      type: "symbol",
      source: SOURCE,
      "source-layer": "transportation_name",
      minzoom: 14,
      layout: {
        "symbol-placement": "line",
        "text-field": ["get", "name"],
        "text-font": fonts,
        "text-size": 11,
      },
      paint: textHalo,
    });
  }

  if (showAt(detail, "medium")) {
    layers.push({
      id: "water-name",
      type: "symbol",
      source: SOURCE,
      "source-layer": "water_name",
      layout: { "text-field": ["get", "name"], "text-font": fonts, "text-size": 11, "text-transform": "uppercase", "text-letter-spacing": 0.1 },
      paint: { ...textHalo, "text-color": p.water === p.bg ? p.mapText : p.mapText },
    });
  }

  // Place labels: suburbs/neighbourhoods gated by detail; cities always.
  const placeFilterLow: any = ["match", ["get", "class"], ["city", "town"], true, false];
  const placeFilterMed: any = ["match", ["get", "class"], ["city", "town", "suburb", "neighbourhood", "village"], true, false];
  layers.push({
    id: "place",
    type: "symbol",
    source: SOURCE,
    "source-layer": "place",
    filter: showAt(detail, "medium") ? placeFilterMed : placeFilterLow,
    layout: {
      "text-field": ["get", "name"],
      "text-font": fonts,
      "text-size": ["interpolate", ["linear"], ["zoom"], 10, 11, 16, 15],
      "text-max-width": 7,
    },
    paint: { ...textHalo, "text-halo-width": 1.6 },
  });

  return {
    version: 8,
    name: `USyd ${detail}`,
    glyphs,
    sources: {
      [SOURCE]: sourceDef() as any,
    },
    layers,
  };
}
