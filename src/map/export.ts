// High-resolution PNG export. Renders the basemap into an off-screen map at an
// elevated pixel ratio, then composites markers (redrawn from Facilities.layout),
// a title, legend and attribution onto the output canvas. HTML markers aren't
// captured by canvas readback, so we redraw them here.
import maplibregl from "maplibre-gl";
import type { Facilities } from "./markers";
import type { LegendCluster } from "../ui/controls";
import { config } from "../config";

export interface ExportOptions {
  scale: number; // 1 | 2 | 4
  title: string;
  legend: boolean;
  legendData: LegendCluster[];
  divisions: Set<string>;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function exportPng(map: maplibregl.Map, facilities: Facilities, opts: ExportOptions) {
  const s = opts.scale;
  const rect = map.getContainer().getBoundingClientRect();
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);

  const holder = document.createElement("div");
  holder.style.cssText = `position:absolute;left:-99999px;top:0;width:${w}px;height:${h}px;`;
  document.body.appendChild(holder);

  const clone = new maplibregl.Map({
    container: holder,
    style: map.getStyle(),
    center: map.getCenter(),
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
    interactive: false,
    attributionControl: false,
    canvasContextAttributes: { preserveDrawingBuffer: true },
    fadeDuration: 0,
  });
  clone.setPixelRatio(s);

  await new Promise<void>((res) => clone.once("idle", () => res()));

  const src = clone.getCanvas();
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(src, 0, 0, out.width, out.height);
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  // --- markers -------------------------------------------------------------
  for (const it of facilities.layout()) {
    if (it.kind === "badge") {
      const p = clone.project([it.lon, it.lat]);
      drawBadge(ctx, p.x * s, p.y * s, it.f.label, it.f.fillHex, it.f.fontHex, s);
    } else {
      const p = clone.project([it.g.lon, it.g.lat]);
      drawHub(ctx, p.x * s, p.y * s, it.expanded ? "×" : String(it.vis.length), it.vis.map((f) => f.fillHex), s);
    }
  }

  drawTitle(ctx, opts.title, s);
  if (opts.legend) drawLegend(ctx, opts.legendData, opts.divisions, out.height, s);
  drawAttribution(ctx, out.width, out.height, s);

  clone.remove();
  holder.remove();

  const blob = await new Promise<Blob | null>((res) => out.toBlob((b) => res(b), "image/png"));
  if (!blob) throw new Error("Export failed");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `usyd-facilities-map-${new Date().toISOString().slice(0, 10)}.png`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function drawBadge(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, fill: string, font: string, s: number) {
  ctx.font = `${700} ${12 * s}px Inter, system-ui, sans-serif`;
  const tw = ctx.measureText(label).width;
  const padX = 7 * s;
  const w = Math.max(22 * s, tw + padX * 2);
  const h = 22 * s;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.3)";
  ctx.shadowBlur = 3 * s;
  ctx.shadowOffsetY = 1 * s;
  ctx.fillStyle = fill;
  roundRect(ctx, x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 1.5 * s;
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  roundRect(ctx, x - w / 2, y - h / 2, w, h, h / 2);
  ctx.stroke();
  ctx.fillStyle = font;
  ctx.fillText(label, x, y + 0.5 * s);
}

function drawHub(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, colours: string[], s: number) {
  const rad = 14 * s;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.3)";
  ctx.shadowBlur = 3 * s;
  ctx.shadowOffsetY = 1 * s;
  // pie of cluster colours
  if (colours.length === 1) {
    ctx.fillStyle = colours[0];
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  } else {
    colours.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, rad, (i / colours.length) * Math.PI * 2 - Math.PI / 2, ((i + 1) / colours.length) * Math.PI * 2 - Math.PI / 2);
      ctx.closePath();
      ctx.fill();
    });
  }
  ctx.restore();
  ctx.lineWidth = 2 * s;
  ctx.strokeStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `${700} ${13 * s}px Inter, system-ui, sans-serif`;
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 3 * s;
  ctx.strokeText(text, x, y + 0.5 * s);
  ctx.fillText(text, x, y + 0.5 * s);
}

function drawTitle(ctx: CanvasRenderingContext2D, title: string, s: number) {
  if (!title) return;
  ctx.textAlign = "left";
  ctx.font = `${700} ${20 * s}px Inter, system-ui, sans-serif`;
  const tw = ctx.measureText(title).width;
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  roundRect(ctx, 14 * s, 14 * s, tw + 28 * s, 40 * s, 8 * s);
  ctx.fill();
  ctx.fillStyle = "#26241F";
  ctx.fillText(title, 28 * s, 35 * s);
}

function drawLegend(ctx: CanvasRenderingContext2D, clusters: LegendCluster[], divisions: Set<string>, hpx: number, s: number) {
  const pad = 12 * s;
  const lh = 22 * s;
  const rows = clusters.length;
  const boxW = 250 * s;
  const boxH = (rows + 1) * lh + pad * 2;
  const x = 14 * s;
  const y = hpx - boxH - 14 * s;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  roundRect(ctx, x, y, boxW, boxH, 8 * s);
  ctx.fill();
  ctx.textAlign = "left";
  ctx.fillStyle = "#26241F";
  ctx.font = `${700} ${13 * s}px Inter, system-ui, sans-serif`;
  ctx.fillText("Capabilities", x + pad, y + pad + lh / 2);
  ctx.font = `${500} ${12 * s}px Inter, system-ui, sans-serif`;
  clusters.forEach((c, i) => {
    const ry = y + pad + lh * (i + 1) + lh / 2;
    const showTss = divisions.has("TSS") && c.tssHex;
    const showCrf = divisions.has("CRF") && c.crfHex;
    let cx = x + pad;
    if (showCrf) {
      ctx.fillStyle = c.crfHex!;
      ctx.beginPath();
      ctx.arc(cx + 6 * s, ry, 6 * s, 0, Math.PI * 2);
      ctx.fill();
      cx += 16 * s;
    }
    if (showTss) {
      ctx.fillStyle = c.tssHex!;
      ctx.beginPath();
      ctx.arc(cx + 6 * s, ry, 6 * s, 0, Math.PI * 2);
      ctx.fill();
      cx += 16 * s;
    }
    ctx.fillStyle = "#26241F";
    ctx.fillText(c.cluster, cx + 4 * s, ry);
  });
}

function drawAttribution(ctx: CanvasRenderingContext2D, w: number, h: number, s: number) {
  const text = config.attribution.replace(/<[^>]+>/g, "");
  ctx.font = `${400} ${10 * s}px Inter, system-ui, sans-serif`;
  ctx.textAlign = "right";
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fillRect(w - tw - 12 * s, h - 18 * s, tw + 12 * s, 18 * s);
  ctx.fillStyle = "#5B544A";
  ctx.fillText(text, w - 6 * s, h - 9 * s);
}
