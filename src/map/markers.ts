// Facility markers. Every marker has a FIXED geographic coordinate:
//  - a lone facility sits at its building's centre (footprint representative point);
//  - co-located facilities have fixed "fan" coordinates (a ring of metre offsets
//    around that centre) — the same positions used in fan-out mode.
// In spider mode a building shows one count "hub" at the centre; clicking it
// reveals the facilities AT THEIR FIXED fan coordinates, animated outward from the
// centre (the only dynamic bit is that one CSS slide). Nothing is repositioned on
// zoom/pan — markers are plain fixed-coordinate map pins.
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
  lon: number; // building centre (footprint representative point after setBuildingAnchors)
  lat: number;
  facilities: Facility[];
}

export type LayoutItem =
  | { kind: "badge"; g: Group; f: Facility; lon: number; lat: number }
  | { kind: "hub"; g: Group; vis: Facility[] };

export interface Filter {
  divisions: Set<string>;
  clusters: Set<string>;
}

// "spider": one hub per building, click to fan out. "offset": always fanned out.
export type OverlapMode = "spider" | "offset";

// Offset a lon/lat by metres east (dx) / north (dy).
function offsetMetres(lon: number, lat: number, dx: number, dy: number): [number, number] {
  return [lon + dx / (111320 * Math.cos((lat * Math.PI) / 180)), lat + dy / 111320];
}

const esc = (s: string) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export class Facilities {
  private map: maplibregl.Map;
  private groups: Group[] = [];
  all: Facility[] = [];
  private filter: Filter = { divisions: new Set(["TSS", "CRF"]), clusters: new Set() };
  private markers: maplibregl.Marker[] = [];
  private mode: OverlapMode = "spider";
  private expanded = new Set<string>();
  private justExpanded = new Set<string>(); // groups to animate on the next render
  private hoverPopup: maplibregl.Popup;
  private detailPopup: maplibregl.Popup;

  constructor(map: maplibregl.Map) {
    this.map = map;
    this.hoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 16, className: "pop-hover" });
    this.detailPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 16, maxWidth: "300px", className: "pop-detail" });
    map.on("click", (e) => {
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

  // Re-anchor buildings onto a representative point of their footprint (guaranteed
  // inside the polygon) so the centre, hub and label sit ON the building.
  setBuildingAnchors(anchors: Map<string, [number, number]>) {
    for (const g of this.groups) {
      const a = anchors.get(g.key);
      if (a && Number.isFinite(a[0]) && Number.isFinite(a[1])) {
        g.lon = a[0];
        g.lat = a[1];
      }
    }
  }

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

  // Fixed fan coordinate for facility i of n, on a ring around the building centre.
  private fanPos(g: Group, n: number, i: number): [number, number] {
    if (n === 1) return [g.lon, g.lat];
    const r = 12 + Math.min(n, 8) * 2.5; // metres
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return offsetMetres(g.lon, g.lat, Math.cos(a) * r, -Math.sin(a) * r);
  }

  // Single source of truth for what is drawn where (shared with the image export).
  layout(): LayoutItem[] {
    const items: LayoutItem[] = [];
    for (const g of this.groups) {
      const vis = g.facilities.filter((f) => this.visible(f));
      if (vis.length === 0) continue;
      const fanned = vis.length === 1 || this.mode === "offset" || this.expanded.has(g.key);
      if (fanned) {
        vis.forEach((f, i) => {
          const [lon, lat] = this.fanPos(g, vis.length, i);
          items.push({ kind: "badge", g, f, lon, lat });
        });
      } else {
        items.push({ kind: "hub", g, vis });
      }
    }
    return items;
  }

  render() {
    this.clear();
    for (const it of this.layout()) {
      if (it.kind === "badge") this.addBadge(it.g, it.f, it.lon, it.lat, this.justExpanded.has(it.g.key));
      else this.addHub(it.g, it.vis);
    }
    this.justExpanded.clear();
  }

  private addBadge(g: Group, f: Facility, lon: number, lat: number, animate: boolean) {
    const root = document.createElement("div");
    root.className = "marker";
    const el = document.createElement("div");
    el.className = "marker-badge";
    el.textContent = f.label;
    el.style.background = f.fillHex;
    el.style.color = f.fontHex;
    el.title = `${f.label} — ${f.facility}`;
    root.appendChild(el);
    el.addEventListener("mouseenter", () => this.showHover(f, lon, lat));
    el.addEventListener("mouseleave", () => this.hoverPopup.remove());
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this.hoverPopup.remove();
      this.showDetail(f, lon, lat);
    });
    // Fan-out animation: slide the badge from the building centre to its fixed
    // coordinate. Animates the INNER element only, so map pan/zoom never lags.
    if (animate) {
      const from = this.map.project([g.lon, g.lat]);
      const to = this.map.project([lon, lat]);
      el.style.transform = `translate(${from.x - to.x}px, ${from.y - to.y}px)`;
      requestAnimationFrame(() => {
        el.style.transition = "transform 0.25s ease-out";
        el.style.transform = "translate(0, 0)";
      });
    }
    this.markers.push(new maplibregl.Marker({ element: root }).setLngLat([lon, lat]).addTo(this.map));
  }

  private addHub(g: Group, vis: Facility[]) {
    const root = document.createElement("div");
    root.className = "marker";
    const el = document.createElement("div");
    el.className = "marker-hub";
    const colours = [...new Set(vis.map((f) => f.fillHex))];
    el.style.background =
      colours.length === 1
        ? colours[0]
        : `conic-gradient(${colours.map((c, i) => `${c} ${(i / colours.length) * 100}% ${((i + 1) / colours.length) * 100}%`).join(",")})`;
    el.innerHTML = `<span>${vis.length}</span>`;
    el.title = `${vis.length} facilities here — click to reveal`;
    root.appendChild(el);
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this.expanded.add(g.key);
      this.justExpanded.add(g.key);
      this.render();
    });
    this.markers.push(new maplibregl.Marker({ element: root }).setLngLat([g.lon, g.lat]).addTo(this.map));
  }

  private showHover(f: Facility, lon: number, lat: number) {
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
          <div class="pd-head">
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

  // Used by search/index: fly to the building, expand it, open the facility popup.
  focus(f: Facility) {
    const g = this.groups.find((x) => x.key === f.buildingKey);
    if (!g) return;
    this.map.flyTo({ center: [g.lon, g.lat], zoom: Math.max(this.map.getZoom(), 17), duration: 800 });
    this.map.once("moveend", () => {
      if (g.facilities.filter((x) => this.visible(x)).length > 1) {
        this.expanded.add(g.key);
        this.justExpanded.add(g.key);
        this.render();
      }
      const [lon, lat] = this.fanPos(
        g,
        g.facilities.filter((x) => this.visible(x)).length,
        g.facilities.filter((x) => this.visible(x)).indexOf(f),
      );
      this.showDetail(f, lon, lat);
    });
  }
}
