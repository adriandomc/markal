import "@lit-labs/ssr/lib/install-global-dom-shim.js";
import { html } from "lit";
import { render } from "@lit-labs/ssr";
import { collectResult } from "@lit-labs/ssr/lib/render-result.js";
import "../components/calendar-board.ts";
import type { CalendarDocument, LegendItem } from "../types.ts";

export async function renderExportHtml(document: CalendarDocument): Promise<string> {
  const boardHtml = await collectResult(
    render(html`<calendar-board print .document=${document}></calendar-board>`),
  );

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(document.title)}</title>
    <style>${sheetCss}</style>
  </head>
  <body>
    <main class="sheet">
      <section class="calendar">${boardHtml}</section>
      <aside class="legends">${document.legends.map(renderLegend).join("")}</aside>
    </main>
  </body>
</html>`;
}

function renderLegend(legend: LegendItem): string {
  return `<div class="legend">
    <span class="legend-swatch" style="background:${escapeAttribute(legend.fillColor)}"></span>
    <span>${escapeHtml(legend.label)}</span>
  </div>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: string): string {
  return value.replaceAll('"', "&quot;");
}

const sheetCss = `
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap");

@page {
  size: A4 landscape;
  margin: 0;
}

:root {
  --ink: #20272d;
  --muted: #737b82;
  --surface: #fff;
  --surface-muted: #f0f0ec;
  --border: #d7d8d2;
  --border-strong: #b8bcb6;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  background: #f7f7f4;
  color: var(--ink);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-weight: 500;
  line-height: 1.45;
  letter-spacing: 0;
}

.sheet {
  width: 297mm;
  min-height: 210mm;
  margin: 0 auto;
  padding: 14mm;
  background: #fff;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 72mm;
  gap: 12mm;
}

.legends {
  display: grid;
  align-content: start;
  gap: 4mm;
  padding-top: 20mm;
}

.legend {
  display: grid;
  grid-template-columns: 18mm minmax(0, 1fr);
  gap: 4mm;
  align-items: center;
  font-size: 8.5pt;
  font-weight: 750;
  line-height: 1.3;
}

.legend-swatch {
  width: 18mm;
  height: 9mm;
  border: 1px solid var(--border);
  border-radius: 2px;
  display: inline-block;
}
`;
