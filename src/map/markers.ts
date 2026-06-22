// Facility markers with capability colours, click-to-spiderfy for co-located
// pins, and hover/click popups. Markers are HTML (maplibregl.Marker) so they
// survive map.setStyle() during theme/detail changes.
import maplibregl from "maplibre-gl";
import { config } from "../config";

export interface Facility {
  label: string;
  legendNo: string;
  subId: string;
  facility: string;
  division: "TSS" | "CRF";
  cluster: string;
  clusterColour: string;
  shade: string;
  fillHex: string;
  fontHex: string;
  building: string;
  buildingCode: string;
  buildingKey: string;
  onCampus: string;
  notes: string;
  linkUrl: string | null;
  linkNote: string;
  lon: number;
  lat: number;
}

export interface Group {
  key: string;
  lon: number;
  lat: number;
  facilities: Facility[];
}

export type LayoutItem =
  // Badge carries its own geographic position (lon/lat) so it stays anchored to
  // the map on zoom. Co-located pins are spread by a small metre offset, not a
  // pixel offset (pixel offsets slide across the map as you zoom).
  | { kind: "badge"; f: Facility; lon: number; lat: number }
  | { kind: "hub"; g: Group; vis: Facility[]; expanded: boolean };

// Offset a lon/lat by a number of metres east (dx) and north (dy).
function offsetMetres(lon: number, lat: number, dx: number, dy: number): [number, number] {
  const dLat = dy / 111320;
  const dLon = dx / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lon + dLon, lat + dLat];
}

export interface Filter {
  divisions: Set<string>; // "TSS","CRF"
  clusters: Set<string>; // cluster names
}

// How co-located pins behave: "spider" = collapse to a hub, click to fan out;
// "offset" = always fanned out around the building (no hub).
export type OverlapMode = "spider" | "offset";

const esc = (s: string) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export class Facilities {
  private map: maplibregl.Map;
  private groups: Group[] = [];
  all: Facility[] = [];
  private filter: Filter = { divisions: new Set(["TSS", "CRF"]), clusters: new Set() };
  private markers: maplibregl.Marker[] = [];
  private expanded = new Set<string>();
  private mode: OverlapMode = "spider";
  private hoverPopup: maplibregl.Popup;
  private detailPopup: maplibregl.Popup;

  constructor(map: maplibregl.Map) {
    this.map = map;
    this.hoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 16, className: "pop-hover" });
    this.detailPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 16, maxWidth: "300px", className: "pop-detail" });
    map.on("click", (e) => {
      // Click on empty map collapses any expanded hubs.
      if ((e.originalEvent.target as HTMLElement)?.closest(".marker")) return;
      if (this.expanded.size) {
        this.expanded.clear();
        this.render();
      }
    });
  }

  async load() {
    const [tss, crf] = await Promise.all([
      fetch(config.data.tss).then((r) => r.json()),
      fetch(config.data.crf).then((r) => r.json()),
    ]);
    const toFac = (f: any): Facility => ({ ...f.properties, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] });
    this.all = [...tss.features, ...crf.features].map(toFac);
    const byKey = new Map<string, Group>();
    for (const f of this.all) {
      const g = byKey.get(f.buildingKey) ?? { key: f.buildingKey, lon: f.lon, lat: f.lat, facilities: [] };
      g.facilities.push(f);
      byKey.set(f.buildingKey, g);
    }
    this.groups = [...byKey.values()];
    // default: all clusters on
    this.filter.clusters = new Set(this.all.map((f) => f.cluster));
  }

  clusters(): string[] {
    return [...new Set(this.all.map((f) => f.cluster))];
  }

  setFilter(filter: Filter) {
    this.filter = filter;
    this.expanded.clear();
    this.render();
  }

  setMode(mode: OverlapMode) {
    this.mode = mode;
    this.expanded.clear();
    this.render();
  }

  // Re-anchor buildings onto their real footprint centroid (when available) so
  // pins and hubs sit dead-centre on the highlighted building rather than at the
  // geocoded point (which can be near an edge or entrance).
  setBuildingAnchors(anchors: Map<string, [number, number]>) {
    for (const g of this.groups) {
      const a = anchors.get(g.key);
      if (a && Number.isFinite(a[0]) && Number.isFinite(a[1])) {
        g.lon = a[0];
        g.lat = a[1];
      }
    }
  }

  // Unique buildings that have at least one visible facility — used to highlight
  // their footprints and place building-code labels. lon/lat is the building
  // anchor (footprint centroid when available); count = visible facilities here.
  visibleGroups(): { key: string; lon: number; lat: number; count: number; code: string }[] {
    return this.groups
      .filter((g) => g.facilities.some((f) => this.visible(f)))
      .map((g) => {
        const vis = g.facilities.filter((f) => this.visible(f));
        return { key: g.key, lon: g.lon, lat: g.lat, count: vis.length, code: vis[0].buildingCode };
      });
  }

  private visible(f: Facility) {
    return this.filter.divisions.has(f.division) && this.filter.clusters.has(f.cluster);
  }

  private clear() {
    this.markers.forEach((m) => m.remove());
    this.markers = [];
  }

  // Fan children out on a circle around the building, using metre offsets so they
  // stay locked to the map (and separate further as you zoom in).
  private fan(items: LayoutItem[], g: Group, vis: Facility[]) {
    const r = 14 + Math.min(vis.length, 8) * 2.5; // metres
    vis.forEach((f, i) => {
      const a = (i / vis.length) * Math.PI * 2 - Math.PI / 2;
      const [lon, lat] = offsetMetres(g.lon, g.lat, Math.cos(a) * r, -Math.sin(a) * r);
      items.push({ kind: "badge", f, lon, lat });
    });
  }

  // Single source of truth for what is drawn where — used by both render()
  // (HTML markers) and the image export (canvas redraw).
  layout(): LayoutItem[] {
    const items: LayoutItem[] = [];
    for (const g of this.groups) {
      const vis = g.facilities.filter((f) => this.visible(f));
      if (vis.length === 0) continue;
      if (vis.length === 1) {
        items.push({ kind: "badge", f: vis[0], lon: g.lon, lat: g.lat });
      } else if (this.mode === "offset") {
        this.fan(items, g, vis); // always fanned out, no hub
      } else if (this.expanded.has(g.key)) {
        this.fan(items, g, vis);
        items.push({ kind: "hub", g, vis, expanded: true });
      } else {
        items.push({ kind: "hub", g, vis, expanded: false });
      }
    }
    return items;
  }

  render() {
    this.clear();
    for (const it of this.layout()) {
      if (it.kind === "badge") this.addBadge(it.f, it.lon, it.lat);
      else this.addHub(it.g, it.vis, it.expanded);
    }
  }

  private addBadge(f: Facility, lon: number, lat: number) {
    const el = document.createElement("div");
    el.className = "marker marker-badge";
    el.textContent = f.label;
    el.style.background = f.fillHex;
    el.style.color = f.fontHex;
    el.title = `${f.label} — ${f.facility}`;
    el.addEventListener("mouseenter", () => this.showHover(f, lon, lat));
    el.addEventListener("mouseleave", () => this.hoverPopup.remove());
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this.hoverPopup.remove();
      this.showDetail(f, lon, lat);
    });
    const m = new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(this.map);
    this.markers.push(m);
  }

  private addHub(g: Group, vis: Facility[], isExpanded: boolean) {
    const el = document.createElement("div");
    el.className = "marker marker-hub" + (isExpanded ? " is-open" : "");
    // segmented ring of the cluster colours present
    const colours = [...new Set(vis.map((f) => f.fillHex))];
    el.style.background = colours.length === 1 ? colours[0] : `conic-gradient(${colours.map((c, i) => `${c} ${(i / colours.length) * 100}% ${((i + 1) / colours.length) * 100}%`).join(",")})`;
    el.innerHTML = `<span>${isExpanded ? "×" : vis.length}</span>`;
    el.title = isExpanded ? "Collapse" : `${vis.length} facilities here — click to expand`;
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (isExpanded) this.expanded.delete(g.key);
      else this.expanded.add(g.key);
      this.render();
    });
    const m = new maplibregl.Marker({ element: el, offset: [0, 0] }).setLngLat([g.lon, g.lat]).addTo(this.map);
    this.markers.push(m);
  }

  private showHover(f: Facility, lon = f.lon, lat = f.lat) {
    this.hoverPopup
      .setLngLat([lon, lat])
      .setHTML(`<div class="ph"><b>${esc(f.label)}</b> · ${esc(f.facility)}</div>`)
      .addTo(this.map);
  }

  private showDetail(f: Facility, lon = f.lon, lat = f.lat) {
    const link = f.linkUrl
      ? `<a href="${esc(f.linkUrl)}" target="_blank" rel="noopener">Visit website ↗</a>`
      : f.linkNote
        ? `<span class="muted">${esc(f.linkNote)}</span>`
        : "";
    const code = f.buildingCode ? ` <span class="code">${esc(f.buildingCode)}</span>` : "";
    const notes = f.notes ? `<div class="pd-notes">${esc(f.notes)}</div>` : "";
    this.detailPopup
      .setLngLat([lon, lat])
      .setHTML(
        `<div class="pd">
          <div class="pd-head"><span class="pd-dot" style="background:${esc(f.fillHex)}"></span>
            <span class="pd-label" style="background:${esc(f.fillHex)};color:${esc(f.fontHex)}">${esc(f.label)}</span>
            <span class="pd-div">${esc(f.division)}</span></div>
          <h3>${esc(f.facility)}</h3>
          <div class="pd-cluster">${esc(f.cluster)}</div>
          <div class="pd-loc">${esc(f.building)}${code}</div>
          ${notes}
          <div class="pd-link">${link}</div>
        </div>`,
      )
      .addTo(this.map);
  }

  // Used by search: fly to a facility, expand its group, open its detail popup.
  focus(f: Facility) {
    const g = this.groups.find((x) => x.key === f.buildingKey);
    if (g && g.facilities.filter((x) => this.visible(x)).length > 1) this.expanded.add(g.key);
    this.render();
    this.map.flyTo({ center: [f.lon, f.lat], zoom: Math.max(this.map.getZoom(), 16.5), duration: 800 });
    this.map.once("moveend", () => this.showDetail(f));
  }
}
