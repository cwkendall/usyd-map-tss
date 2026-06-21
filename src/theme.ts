// Theme = a colour palette that drives BOTH the basemap style and the UI chrome.
// The default is the USyd corporate look: monochrome charcoal/grey/white with an
// ochre primary and a cream secondary. Capability marker colours are NOT part of
// the theme — they stay categorical (Pink/Blue/Green/Orange) so the four clusters
// remain distinguishable on any theme.

export interface Palette {
  // Brand
  primary: string; // ochre — active states, accents, controls
  secondary: string; // cream — secondary surfaces
  // Basemap
  bg: string; // map background / land
  land: string; // landuse/landcover wash
  green: string; // parks
  water: string;
  building: string;
  buildingOutline: string;
  roadMajor: string;
  roadMinor: string;
  roadCasing: string;
  boundary: string;
  mapText: string;
  mapTextHalo: string;
  // UI chrome
  panel: string;
  panelText: string;
  panelMuted: string;
  panelBorder: string;
  shadow: string;
}

export interface Theme {
  id: string;
  name: string;
  palette: Palette;
}

export const THEMES: Theme[] = [
  {
    id: "usyd",
    name: "USyd Corporate",
    palette: {
      primary: "#E64626", // USyd masthead ochre-red (editable)
      secondary: "#F4EFE6", // cream
      bg: "#F6F4F0",
      land: "#EFEcE5",
      green: "#E2E6DD",
      water: "#CBD5DB",
      building: "#E4E0D8",
      buildingOutline: "#D6D1C7",
      roadMajor: "#FFFFFF",
      roadMinor: "#F1EEE8",
      roadCasing: "#DBD6CC",
      boundary: "#C9C3B6",
      mapText: "#5B544A",
      mapTextHalo: "#F6F4F0",
      panel: "#FFFFFF",
      panelText: "#26241F",
      panelMuted: "#7A7367",
      panelBorder: "#E4DFD4",
      shadow: "rgba(40,36,28,0.16)",
    },
  },
  {
    id: "slate",
    name: "Slate (dark)",
    palette: {
      primary: "#E9853B",
      secondary: "#2A2E33",
      bg: "#1C1F23",
      land: "#22262B",
      green: "#283029",
      water: "#161A1F",
      building: "#2A2F35",
      buildingOutline: "#343A41",
      roadMajor: "#3A4148",
      roadMinor: "#2E343A",
      roadCasing: "#23282D",
      boundary: "#3A4148",
      mapText: "#AEB4BB",
      mapTextHalo: "#15181C",
      panel: "#23272C",
      panelText: "#E7EAED",
      panelMuted: "#9AA1A8",
      panelBorder: "#343A41",
      shadow: "rgba(0,0,0,0.45)",
    },
  },
  {
    id: "mono",
    name: "Minimal Grey",
    palette: {
      primary: "#444444",
      secondary: "#F2F2F2",
      bg: "#FAFAFA",
      land: "#F2F2F2",
      green: "#ECECEC",
      water: "#DCDCDC",
      building: "#ECECEC",
      buildingOutline: "#DEDEDE",
      roadMajor: "#FFFFFF",
      roadMinor: "#F4F4F4",
      roadCasing: "#E0E0E0",
      boundary: "#CFCFCF",
      mapText: "#666666",
      mapTextHalo: "#FAFAFA",
      panel: "#FFFFFF",
      panelText: "#222222",
      panelMuted: "#777777",
      panelBorder: "#E6E6E6",
      shadow: "rgba(0,0,0,0.15)",
    },
  },
];

const STORAGE_KEY = "usyd-map-theme-v1";

export function defaultTheme(): Theme {
  return structuredClone(THEMES[0]);
}

export function loadTheme(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultTheme();
    const saved = JSON.parse(raw) as Partial<Theme>;
    const base = THEMES.find((t) => t.id === saved.id) ?? THEMES[0];
    // Merge so user palette overrides survive, but new keys fall back to base.
    return {
      id: base.id,
      name: saved.name ?? base.name,
      palette: { ...base.palette, ...(saved.palette ?? {}) },
    };
  } catch {
    return defaultTheme();
  }
}

export function saveTheme(theme: Theme) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
}

export function clearSavedTheme() {
  localStorage.removeItem(STORAGE_KEY);
}

// Push palette into CSS custom properties so the UI chrome restyles instantly.
export function applyThemeVars(theme: Theme) {
  const p = theme.palette;
  const root = document.documentElement.style;
  root.setProperty("--c-primary", p.primary);
  root.setProperty("--c-secondary", p.secondary);
  root.setProperty("--c-panel", p.panel);
  root.setProperty("--c-panel-text", p.panelText);
  root.setProperty("--c-panel-muted", p.panelMuted);
  root.setProperty("--c-panel-border", p.panelBorder);
  root.setProperty("--c-shadow", p.shadow);
  root.setProperty("--c-map-bg", p.bg);
}
