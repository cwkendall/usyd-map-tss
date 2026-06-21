// Builds the control panel: layer/cluster toggles, detail level, theme editor,
// search, legend and the export dialog. Pure DOM; talks to the app via callbacks.
import type { Facilities, Facility, Filter } from "../map/markers";
import type { DetailLevel } from "../config";
import { THEMES, type Theme, type Palette } from "../theme";
import type { ExportOptions } from "../map/export";

export interface LegendCluster {
  cluster: string;
  colour: string;
  tssHex: string | null;
  crfHex: string | null;
}

export interface ControlParams {
  mount: HTMLElement;
  legend: LegendCluster[];
  facilities: Facilities;
  currentTheme: Theme;
  filter: Filter;
  detail: DetailLevel;
  on: {
    filter: (f: Filter) => void;
    detail: (d: DetailLevel) => void;
    theme: (t: Theme) => void;
    resetTheme: () => void;
    export: (o: Omit<ExportOptions, "legendData" | "divisions">) => void;
    search: (f: Facility) => void;
    locate: () => void;
  };
}

const el = (tag: string, cls?: string, html?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

export function buildControls(p: ControlParams) {
  const panel = el("div", "panel");

  // Header
  const header = el("div", "panel-head");
  header.innerHTML = `<div class="brand"><span class="brand-mark"></span><div><div class="brand-title">USyd Facilities</div><div class="brand-sub">TSS &amp; CRF</div></div></div>`;
  const collapse = el("button", "icon-btn", "‹") as HTMLButtonElement;
  collapse.title = "Collapse panel";
  collapse.onclick = () => panel.classList.toggle("collapsed");
  header.appendChild(collapse);
  panel.appendChild(header);

  const body = el("div", "panel-body");
  panel.appendChild(body);

  // --- Search --------------------------------------------------------------
  const search = el("div", "section search");
  const input = el("input", "search-input") as HTMLInputElement;
  input.placeholder = "Search facility, building, code…";
  const results = el("div", "search-results");
  search.append(input, results);
  body.appendChild(search);
  const renderResults = () => {
    const q = input.value.trim().toLowerCase();
    results.innerHTML = "";
    if (!q) return;
    const hits = p.facilities.all
      .filter((f) => `${f.label} ${f.facility} ${f.building} ${f.buildingCode} ${f.cluster}`.toLowerCase().includes(q))
      .slice(0, 8);
    for (const f of hits) {
      const r = el("button", "search-hit");
      r.innerHTML = `<span class="hit-badge" style="background:${f.fillHex};color:${f.fontHex}">${f.label}</span><span class="hit-name">${f.facility}</span><span class="hit-bldg">${f.buildingCode || f.building}</span>`;
      r.onclick = () => {
        p.on.search(f);
        results.innerHTML = "";
        input.value = "";
      };
      results.appendChild(r);
    }
  };
  input.addEventListener("input", renderResults);

  // --- Divisions -----------------------------------------------------------
  const divSec = el("div", "section");
  divSec.appendChild(el("div", "section-title", "Divisions"));
  const divRow = el("div", "toggle-row");
  const mkDiv = (code: "TSS" | "CRF", label: string) => {
    const b = el("button", "pill " + (p.filter.divisions.has(code) ? "on" : "")) as HTMLButtonElement;
    b.innerHTML = `<span class="pill-dot ${code}"></span>${label}`;
    b.onclick = () => {
      b.classList.toggle("on");
      if (p.filter.divisions.has(code)) p.filter.divisions.delete(code);
      else p.filter.divisions.add(code);
      p.on.filter(p.filter);
    };
    return b;
  };
  divRow.append(mkDiv("TSS", "TSS"), mkDiv("CRF", "CRF"));
  divSec.appendChild(divRow);
  body.appendChild(divSec);

  // --- Capabilities (legend + toggles) ------------------------------------
  const capSec = el("div", "section");
  const capHead = el("div", "section-title row", "Capabilities");
  const allBtn = el("button", "link-btn", "all") as HTMLButtonElement;
  capHead.appendChild(allBtn);
  capSec.appendChild(capHead);
  const capList = el("div", "cap-list");
  const capButtons: { name: string; btn: HTMLButtonElement }[] = [];
  for (const c of p.legend) {
    const b = el("button", "cap " + (p.filter.clusters.has(c.cluster) ? "on" : "")) as HTMLButtonElement;
    b.innerHTML = `<span class="cap-swatches"><span style="background:${c.crfHex ?? c.tssHex}"></span><span style="background:${c.tssHex ?? c.crfHex}"></span></span><span class="cap-name">${c.cluster}</span>`;
    b.onclick = () => {
      b.classList.toggle("on");
      if (p.filter.clusters.has(c.cluster)) p.filter.clusters.delete(c.cluster);
      else p.filter.clusters.add(c.cluster);
      p.on.filter(p.filter);
    };
    capButtons.push({ name: c.cluster, btn: b });
    capList.appendChild(b);
  }
  allBtn.onclick = () => {
    const allOn = capButtons.every(({ name }) => p.filter.clusters.has(name));
    capButtons.forEach(({ name, btn }) => {
      if (allOn) {
        p.filter.clusters.delete(name);
        btn.classList.remove("on");
      } else {
        p.filter.clusters.add(name);
        btn.classList.add("on");
      }
    });
    p.on.filter(p.filter);
  };
  capSec.appendChild(capList);
  capSec.appendChild(el("div", "cap-hint", "Dark dot = CRF · Light dot = TSS"));
  body.appendChild(capSec);

  // --- Detail level --------------------------------------------------------
  const detSec = el("div", "section");
  detSec.appendChild(el("div", "section-title", "Base map detail"));
  const seg = el("div", "segmented");
  (["low", "medium", "high"] as DetailLevel[]).forEach((d) => {
    const b = el("button", p.detail === d ? "on" : "", d[0].toUpperCase() + d.slice(1)) as HTMLButtonElement;
    b.onclick = () => {
      seg.querySelectorAll("button").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
      p.on.detail(d);
    };
    seg.appendChild(b);
  });
  detSec.appendChild(seg);
  body.appendChild(detSec);

  // --- Theme ---------------------------------------------------------------
  const thSec = el("div", "section");
  thSec.appendChild(el("div", "section-title", "Theme"));
  const sel = el("select", "select") as HTMLSelectElement;
  THEMES.forEach((t) => {
    const o = el("option") as HTMLOptionElement;
    o.value = t.id;
    o.textContent = t.name;
    if (t.id === p.currentTheme.id) o.selected = true;
    sel.appendChild(o);
  });
  sel.onchange = () => {
    const t = THEMES.find((x) => x.id === sel.value)!;
    p.on.theme(structuredClone(t));
    syncSwatches(structuredClone(t).palette);
  };
  thSec.appendChild(sel);

  const swatchRow = el("div", "swatch-row");
  const editable: [keyof Palette, string][] = [
    ["primary", "Ochre / primary"],
    ["secondary", "Cream / secondary"],
    ["bg", "Map background"],
    ["water", "Water"],
  ];
  const pickers: Partial<Record<keyof Palette, HTMLInputElement>> = {};
  for (const [k, lbl] of editable) {
    const wrap = el("label", "swatch");
    const c = el("input", "color") as HTMLInputElement;
    c.type = "color";
    c.value = toHex(p.currentTheme.palette[k]);
    c.oninput = () => {
      p.currentTheme.palette[k] = c.value;
      p.on.theme(p.currentTheme);
    };
    pickers[k] = c;
    wrap.append(c, el("span", "swatch-label", lbl));
    swatchRow.appendChild(wrap);
  }
  thSec.appendChild(swatchRow);
  const reset = el("button", "link-btn", "Reset to USyd default") as HTMLButtonElement;
  reset.onclick = () => {
    p.on.resetTheme();
    sel.value = "usyd";
    syncSwatches(THEMES[0].palette);
  };
  thSec.appendChild(reset);
  body.appendChild(thSec);
  function syncSwatches(pal: Palette) {
    for (const [k] of editable) if (pickers[k]) pickers[k]!.value = toHex(pal[k]);
  }

  // --- Export --------------------------------------------------------------
  const exSec = el("div", "section");
  const exBtn = el("button", "primary-btn", "⤓ Export image") as HTMLButtonElement;
  exSec.appendChild(exBtn);
  const exForm = el("div", "export-form hidden");
  const titleIn = el("input", "search-input") as HTMLInputElement;
  titleIn.value = "USyd TSS & CRF Facilities";
  const scaleSel = el("select", "select") as HTMLSelectElement;
  [["2", "2× (standard)"], ["1", "1× (screen)"], ["4", "4× (poster)"]].forEach(([v, t]) => {
    const o = el("option") as HTMLOptionElement;
    o.value = v;
    o.textContent = t;
    scaleSel.appendChild(o);
  });
  const legChk = el("label", "chk", `<input type="checkbox" checked> Include legend`);
  const doExport = el("button", "primary-btn", "Download PNG") as HTMLButtonElement;
  exForm.append(labelled("Title", titleIn), labelled("Resolution", scaleSel), legChk, doExport);
  exSec.appendChild(exForm);
  exBtn.onclick = () => exForm.classList.toggle("hidden");
  doExport.onclick = () => {
    doExport.textContent = "Rendering…";
    doExport.disabled = true;
    p.on.export({
      scale: Number(scaleSel.value),
      title: titleIn.value,
      legend: (legChk.querySelector("input") as HTMLInputElement).checked,
    });
    setTimeout(() => {
      doExport.textContent = "Download PNG";
      doExport.disabled = false;
    }, 1500);
  };
  body.appendChild(exSec);

  p.mount.appendChild(panel);
}

function labelled(text: string, control: HTMLElement) {
  const w = el("label", "field");
  w.appendChild(el("span", "field-label", text));
  w.appendChild(control);
  return w;
}

// Normalise rgb()/named to #rrggbb so <input type=color> accepts it.
function toHex(c: string): string {
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  const m = c.match(/\d+/g);
  if (m && m.length >= 3) return "#" + m.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, "0")).join("");
  return "#000000";
}
