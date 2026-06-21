// Second sidebar (right): a full index of every facility location, colour-coded
// and grouped by capability cluster in numerical/letter order. Clicking a row
// zooms to that location. Has its own collapse/reveal button.
import type { Facilities, Facility } from "../map/markers";
import type { LegendCluster } from "./controls";

const esc = (s: string) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

const el = (tag: string, cls?: string, html?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

export interface IndexParams {
  mount: HTMLElement;
  facilities: Facilities;
  legend: LegendCluster[];
  onSelect: (f: Facility) => void;
}

export function buildIndexPanel(p: IndexParams) {
  const panel = el("div", "panel panel-index");
  if (window.innerWidth < 900) panel.classList.add("collapsed"); // start collapsed on small screens

  const header = el("div", "panel-head");
  header.innerHTML = `<div class="brand"><div><div class="brand-title">Facility index</div><div class="brand-sub">Click to locate</div></div></div>`;
  const collapse = el("button", "icon-btn", "›") as HTMLButtonElement;
  collapse.title = "Collapse";
  collapse.onclick = () => {
    panel.classList.toggle("collapsed");
    collapse.textContent = panel.classList.contains("collapsed") ? "‹" : "›";
  };
  header.appendChild(collapse);
  panel.appendChild(header);

  const body = el("div", "panel-body");
  panel.appendChild(body);

  // Group facilities by cluster, ordered by the legend, with any "Unassigned" last.
  const order = p.legend.map((c) => c.cluster);
  const byCluster = new Map<string, Facility[]>();
  for (const f of p.facilities.all) {
    const k = f.cluster || "Unassigned";
    if (!byCluster.has(k)) byCluster.set(k, []);
    byCluster.get(k)!.push(f);
  }
  const keys = [
    ...order.filter((k) => byCluster.has(k)),
    ...[...byCluster.keys()].filter((k) => !order.includes(k)),
  ];

  for (const key of keys) {
    const list = byCluster.get(key)!.sort(
      (a, b) => (Number(a.legendNo) || 999) - (Number(b.legendNo) || 999) || a.subId.localeCompare(b.subId),
    );
    const lc = p.legend.find((c) => c.cluster === key);
    const colour = lc ? (lc.crfHex ?? lc.tssHex ?? "#9E9E9E") : "#9E9E9E";

    const sec = el("div", "idx-cluster");
    sec.appendChild(el("div", "idx-cluster-head", `<span class="idx-cluster-bar" style="background:${colour}"></span><span>${esc(key)}</span>`));
    for (const f of list) {
      const row = el("button", "idx-row") as HTMLButtonElement;
      row.innerHTML =
        `<span class="idx-badge" style="background:${esc(f.fillHex)};color:${esc(f.fontHex)}">${esc(f.label)}</span>` +
        `<span class="idx-name">${esc(f.facility)}</span>` +
        `<span class="idx-bldg">${esc(f.buildingCode || (f.onCampus === "No" ? "off-campus" : ""))}</span>`;
      row.title = `${f.facility} — ${f.building}`;
      row.onclick = () => p.onSelect(f);
      sec.appendChild(row);
    }
    body.appendChild(sec);
  }

  p.mount.appendChild(panel);
}
