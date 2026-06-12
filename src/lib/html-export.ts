import type { BoardMode, CalendarDocument } from "../types.ts";

/**
 * Self-contained, read-only HTML export of a calendar. The result is a single
 * file (data embedded as JSON + inlined CSS + a vanilla-JS renderer) that works
 * offline and is meant to be shared. It mirrors the live app's month board and
 * weekly time grid, but with no editing — only month/week toggle and week
 * navigation. Generated entirely client-side; no server round-trip.
 */

export interface HtmlExportLabels {
  monthView: string;
  weekView: string;
  today: string;
  prevWeek: string;
  nextWeek: string;
  legends: string;
  activities: string;
  readOnly: string;
  /** 7 narrow weekday labels, Sunday-first (the app's convention). */
  weekdays: string[];
}

export interface HtmlExportOptions {
  locale: string;
  labels: HtmlExportLabels;
  /** Which view the file opens on; the viewer can still toggle. */
  initialView: BoardMode;
}

export function buildStandaloneHtml(
  document: CalendarDocument,
  options: HtmlExportOptions,
): string {
  const payload = {
    document,
    locale: options.locale,
    labels: options.labels,
    initialView: options.initialView,
  };
  // Embed safely inside <script>: neutralize "</script>" and JS line separators.
  const json = JSON.stringify(payload)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

  const title = escapeHtml(document.title || "Markal");

  return `<!doctype html>
<html lang="${escapeHtml(options.locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Markal">
<title>${title}</title>
<style>${EXPORT_CSS}</style>
</head>
<body>
<div id="app"></div>
<script id="markal-data" type="application/json">${json}</script>
<script>${EXPORT_RUNTIME}</script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const EXPORT_CSS = `
:root {
  --page: #f7f7f4;
  --surface: #fff;
  --surface-muted: #f0f0ec;
  --ink: #20272d;
  --muted: #737b82;
  --border: #d7d8d2;
  --border-strong: #9da29c;
  --hour-height: 3rem;
  --gutter-width: 3.5rem;
}
* { box-sizing: border-box; }
html { font-size: 93.75%; }
body {
  margin: 0;
  background: var(--page);
  color: var(--ink);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-weight: 500;
  line-height: 1.45;
}
#app { width: min(92.5rem, calc(100vw - 2rem)); margin: 0 auto; padding: 1.25rem 0 2.5rem; }
button { font: inherit; color: inherit; cursor: pointer; }

.topbar {
  display: flex; align-items: center; justify-content: space-between;
  gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem;
}
.topbar-main { display: flex; align-items: center; gap: 0.75rem; min-width: 0; }
.topbar h1 { margin: 0; font-size: clamp(1.25rem, 2vw, 1.8rem); line-height: 1.1; }
.ro-badge {
  font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.03em;
  color: var(--muted); border: 1px solid var(--border); border-radius: 999px; padding: 0.2rem 0.55rem;
}
.view-toggle { display: inline-flex; border: 1px solid var(--border-strong); border-radius: 999px; overflow: hidden; }
.view-toggle button {
  appearance: none; border: 0; background: var(--surface); padding: 0.4rem 0.9rem;
  font-weight: 750; font-size: 0.85rem; transition: background 140ms ease, color 140ms ease;
}
.view-toggle button + button { border-left: 1px solid var(--border); }
.view-toggle button.active { background: var(--ink); color: var(--surface); }

/* ---- month board ---- */
.board { border: 1px solid var(--border-strong); border-radius: 5px; background: var(--surface); padding: clamp(0.75rem, 2vw, 1.25rem); }
.months { display: grid; gap: 1.125rem; }
.months.mode-months { grid-template-columns: repeat(auto-fit, minmax(15.625rem, 1fr)); }
.months.mode-years { grid-template-columns: repeat(auto-fit, minmax(11.25rem, 1fr)); gap: 0.875rem; }
.month { min-width: 0; }
.month-title { font-size: 1rem; font-weight: 750; margin-bottom: 0.5rem; text-align: center; }
.mode-years .month-title { font-size: 0.9rem; margin-bottom: 0.375rem; }
.weekdays, .day-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 0.25rem; }
.weekdays { border-bottom: 1px solid var(--border); color: var(--muted); font-size: 0.74rem; font-weight: 750; margin-bottom: 0.3125rem; padding-bottom: 0.25rem; text-align: center; }
.day {
  position: relative; display: grid; place-items: center; min-height: 2.25rem;
  border: 1px solid var(--border); border-radius: 3px; background: #fff;
  overflow: hidden; isolation: isolate; text-align: center;
}
.day.out-month, .day.out-range { background: var(--surface-muted); color: var(--muted); opacity: 0.45; }
.mode-years .day { min-height: 1.6875rem; font-size: 0.76rem; }
.day-number { position: relative; z-index: 2; display: grid; place-items: center; width: 100%; height: 100%; grid-area: 1 / 1; font-weight: 700; }
.layers { position: absolute; inset: 0; z-index: 1; display: grid; pointer-events: none; }
.layers.count-1 { display: block; }
.layers.count-2 { grid-template-columns: repeat(2, 1fr); }
.layers.count-3, .layers.count-4 { grid-template-columns: repeat(2, 1fr); grid-template-rows: repeat(2, 1fr); }
.layer { min-width: 0; min-height: 0; }
.count-1 .layer { position: absolute; inset: 0; }
.day .block-dot { position: absolute; bottom: 3px; left: 50%; transform: translateX(-50%); width: 4px; height: 4px; border-radius: 50%; background: var(--ink); z-index: 2; pointer-events: none; }
.week-range { display: grid; grid-template-columns: repeat(auto-fit, minmax(5.125rem, 1fr)); gap: 0.5rem; }
.week-day { grid-template-rows: auto 1fr; min-height: 5.25rem; padding: 0.4375rem 0.375rem; }
.week-day .weekday { position: relative; z-index: 2; display: block; grid-area: 1 / 1; color: var(--muted); font-size: 0.72rem; font-weight: 750; margin-bottom: 0.5rem; place-self: start center; text-transform: uppercase; }
.week-day .day-number { grid-area: 2 / 1; }
.week-day .block-dot { bottom: 5px; }

/* ---- weekly time grid ---- */
.grid-shell { border: 1px solid var(--border-strong); border-radius: 5px; background: var(--surface); padding: 0.875rem; display: flex; flex-direction: column; }
.grid-nav { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; }
.grid-nav .nav-btn { display: inline-grid; place-items: center; width: 2rem; height: 2rem; padding: 0; border: 1px solid var(--border); border-radius: 4px; background: var(--surface); }
.grid-nav .today-button { border: 1px solid var(--border); border-radius: 4px; background: var(--surface); padding: 0.375rem 0.75rem; font-weight: 750; }
.grid-nav .nav-btn:hover, .grid-nav .today-button:hover { border-color: var(--ink); }
.grid-nav .week-label { margin-left: auto; font-size: 0.95rem; font-weight: 750; }
.grid-scroll { overflow-y: auto; max-height: 70vh; }
.grid-header, .grid-body { display: grid; grid-template-columns: var(--gutter-width) repeat(7, 1fr); }
.grid-header { position: sticky; top: 0; z-index: 3; background: var(--surface); border-bottom: 1px solid var(--border); }
.gutter-spacer { border-right: 1px solid var(--border); }
.day-header { display: flex; flex-direction: column; align-items: center; gap: 0.125rem; padding: 0.375rem 0.25rem; }
.day-header .weekday { color: var(--muted); font-size: 0.7rem; font-weight: 800; text-transform: uppercase; }
.day-header .day-number { font-size: 1rem; font-weight: 750; }
.day-header.today .day-number { display: grid; place-items: center; min-width: 1.625rem; height: 1.625rem; border-radius: 50%; background: var(--ink); color: var(--surface); }
.hour-gutter, .day-column { height: calc(24 * var(--hour-height)); }
.hour-gutter { display: grid; grid-template-rows: repeat(24, 1fr); border-right: 1px solid var(--border); }
.hour-gutter .hour-label { font-size: 0.7rem; color: var(--muted); text-align: right; padding-right: 0.5rem; transform: translateY(-0.5em); }
.day-column { position: relative; border-left: 1px solid var(--border); background-image: linear-gradient(to bottom, var(--border) 1px, transparent 1px); background-size: 100% calc(100% / 24); }
.day-column.out-of-range { opacity: 0.45; background-color: var(--surface-muted); }
.block-segment { position: absolute; border-radius: 4px; padding: 0.2rem 0.4rem; font-size: 0.75rem; line-height: 1.2; overflow: hidden; box-shadow: 0 1px 2px rgb(20 24 28 / 18%); }
.block-segment .block-label { display: block; font-weight: 750; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.block-segment .block-time { display: block; font-size: 0.68rem; opacity: 0.9; white-space: nowrap; }
.block-segment.compact { padding-block: 0.05rem; line-height: 1.1; }
.block-segment.compact .block-time { display: none; }

/* ---- legends / activities lists ---- */
.lists { display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap: 1rem; margin-top: 1.25rem; }
.list-block h3 { margin: 0 0 0.5rem; font-size: 0.95rem; }
.chip-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.25rem 0; font-size: 0.85rem; font-weight: 600; }
.chip-swatch { width: 1.1rem; height: 1.1rem; border-radius: 3px; border: 1px solid var(--border-strong); flex: 0 0 auto; }

@media (max-width: 980px) {
  html { font-size: 87.5%; }
  :root { --hour-height: 2.25rem; --gutter-width: 2.5rem; }
}
`;

// Runtime: a self-contained IIFE. Authored with only single/double-quoted
// strings (no backticks, no "${") so it can live inside this template literal.
const EXPORT_RUNTIME = `
(function () {
  var payload = JSON.parse(document.getElementById('markal-data').textContent);
  var doc = payload.document, locale = payload.locale, L = payload.labels;
  var MPD = 1440;
  var CHEVRON_L = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';
  var CHEVRON_R = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function parseKey(k) { var p = k.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function toKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(k, n) { var d = parseKey(k); d.setDate(d.getDate() + n); return toKey(d); }
  function cmp(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
  function startOfWeek(k) { return addDays(k, -parseKey(k).getDay()); }
  function daysBetween(a, b) { return Math.round((parseKey(b).getTime() - parseKey(a).getTime()) / 86400000); }
  function enumerate(s, e) { var out = []; for (var d = s; cmp(d, e) <= 0; d = addDays(d, 1)) out.push(d); return out; }
  function fmtMin(min) { return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(2000, 0, 1, Math.floor(min / 60), min % 60)); }

  function legendById(id) { for (var i = 0; i < doc.legends.length; i++) if (doc.legends[i].id === id) return doc.legends[i]; return null; }
  function activityById(id) { for (var i = 0; i < doc.activities.length; i++) if (doc.activities[i].id === id) return doc.activities[i]; return null; }
  function legendsForDate(date, inMonth) {
    if (!inMonth && !doc.settings.showOutMonthMarks) return [];
    var ids = doc.marks[date] || [], max = doc.settings.maxMarksPerDay, out = [];
    for (var i = 0; i < ids.length && out.length < max; i++) { var lg = legendById(ids[i]); if (lg) out.push(lg); }
    return out;
  }
  function blocksForDate(date) {
    return Object.keys(doc.blocks).map(function (k) { return doc.blocks[k]; })
      .filter(function (b) { return cmp(b.startDate, date) <= 0 && cmp(date, b.endDate) <= 0; })
      .sort(function (a, b) { return a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes; });
  }
  function layout(blocks) {
    var sorted = blocks.slice(), laneEnds = [];
    var placed = sorted.map(function (b) {
      var lane = -1;
      for (var i = 0; i < laneEnds.length; i++) { if (laneEnds[i] <= b.startMinutes) { lane = i; break; } }
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
      laneEnds[lane] = b.endMinutes;
      return { block: b, lane: lane, laneCount: 0 };
    });
    return placed.map(function (p) { p.laneCount = laneEnds.length; return p; });
  }
  var dwb = {};
  Object.keys(doc.blocks).forEach(function (k) { var b = doc.blocks[k]; enumerate(b.startDate, b.endDate).forEach(function (d) { dwb[d] = 1; }); });

  function hexToRgb(hex) { var v = String(hex).replace('#', '').trim(); if (v.length === 3) v = v.split('').map(function (c) { return c + c; }).join(''); var n = parseInt(v, 16); if (!isFinite(n)) return [0, 0, 0]; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function lum(hex) { var c = hexToRgb(hex).map(function (ch) { var s = ch / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  function textColor(fills) { if (!fills.length) return '#1f2933'; var av = fills.map(lum).reduce(function (a, b) { return a + b; }, 0) / fills.length; return av > 0.5 ? '#1f2933' : '#ffffff'; }

  function autoMode() { var n = daysBetween(doc.dateRange.start, doc.dateRange.end) + 1; return n <= 14 ? 'week' : (n <= 124 ? 'months' : 'years'); }
  function monthsInRange() {
    var s = parseKey(doc.dateRange.start), e = parseKey(doc.dateRange.end);
    var out = [], y = s.getFullYear(), m = s.getMonth(), ey = e.getFullYear(), em = e.getMonth();
    while (y < ey || (y === ey && m <= em)) { out.push({ year: y, monthIndex: m }); m++; if (m > 11) { m = 0; y++; } }
    return out;
  }
  function buildMonthGrid(year, monthIndex) {
    var first = new Date(year, monthIndex, 1), firstVisible = new Date(year, monthIndex, 1 - first.getDay()), cells = [];
    for (var off = 0; off < 42; off++) {
      var d = new Date(firstVisible); d.setDate(firstVisible.getDate() + off);
      var key = toKey(d);
      cells.push({ date: key, day: d.getDate(), inMonth: d.getMonth() === monthIndex, inRange: cmp(key, doc.dateRange.start) >= 0 && cmp(key, doc.dateRange.end) <= 0 });
    }
    return cells;
  }
  function monthLabel(y, m) { var name = new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(y, m, 1)); return name.charAt(0).toUpperCase() + name.slice(1) + ' ' + y; }

  function dayCell(date, day, inMonth, inRange, weekday) {
    var legs = legendsForDate(date, inMonth);
    var cls = ['day']; if (weekday !== null) cls.push('week-day');
    if (!inMonth) cls.push('out-month'); if (!inRange) cls.push('out-range');
    if (legs.length) cls.push('marked');
    var hasBlocks = inMonth && dwb[date]; if (hasBlocks) cls.push('has-blocks');
    var style = legs.length ? ('color:' + textColor(legs.map(function (l) { return l.fillColor; }))) : '';
    var layers = legs.length ? ('<span class="layers count-' + legs.length + '">' + legs.map(function (l) { return '<span class="layer" style="background:' + esc(l.fillColor) + '"></span>'; }).join('') + '</span>') : '';
    var wd = weekday !== null ? ('<span class="weekday">' + esc(weekday) + '</span>') : '';
    var dot = hasBlocks ? '<span class="block-dot"></span>' : '';
    return '<div class="' + cls.join(' ') + '" style="' + style + '">' + wd + layers + '<span class="day-number">' + (inMonth ? day : '') + '</span>' + dot + '</div>';
  }
  function renderMonth() {
    var mode = autoMode();
    if (mode === 'week') {
      var days = enumerate(doc.dateRange.start, doc.dateRange.end);
      return '<div class="board"><div class="week-range">' + days.map(function (d) { var pd = parseKey(d); return dayCell(d, pd.getDate(), true, true, L.weekdays[pd.getDay()]); }).join('') + '</div></div>';
    }
    var inner = monthsInRange().map(function (mo) {
      var wd = L.weekdays.map(function (w) { return '<span>' + esc(w) + '</span>'; }).join('');
      var grid = buildMonthGrid(mo.year, mo.monthIndex).map(function (c) { return dayCell(c.date, c.day, c.inMonth, c.inRange, null); }).join('');
      return '<article class="month"><div class="month-title">' + esc(monthLabel(mo.year, mo.monthIndex)) + '</div><div class="weekdays">' + wd + '</div><div class="day-grid">' + grid + '</div></article>';
    }).join('');
    return '<div class="board"><div class="months mode-' + mode + '">' + inner + '</div></div>';
  }

  function segment(block, date, lane, laneCount) {
    var act = activityById(block.activityId); if (!act) return '';
    var top = (block.startMinutes / MPD) * 100, height = ((block.endMinutes - block.startMinutes) / MPD) * 100;
    var w = 100 / laneCount, left = lane * w;
    var compact = (block.endMinutes - block.startMinutes) < 45;
    var time = compact ? '' : ('<span class="block-time">' + fmtMin(block.startMinutes) + ' &#8211; ' + fmtMin(block.endMinutes) + '</span>');
    return '<div class="block-segment' + (compact ? ' compact' : '') + '" style="top:' + top + '%;height:' + height + '%;left:calc(' + left + '% + 2px);width:calc(' + w + '% - 4px);background:' + esc(act.fillColor) + ';color:' + textColor([act.fillColor]) + '">' +
      '<span class="block-label">' + esc(act.label) + '</span>' + time + '</div>';
  }
  function renderWeek() {
    var dates = []; for (var i = 0; i < 7; i++) dates.push(addDays(state.weekStart, i));
    var today = toKey(new Date());
    var header = '<span class="gutter-spacer"></span>' + dates.map(function (d) { var pd = parseKey(d); return '<span class="day-header' + (d === today ? ' today' : '') + '"><span class="weekday">' + esc(L.weekdays[pd.getDay()]) + '</span><span class="day-number">' + pd.getDate() + '</span></span>'; }).join('');
    var gutter = ''; for (var h = 0; h < 24; h++) gutter += '<span class="hour-label">' + fmtMin(h * 60) + '</span>';
    var cols = dates.map(function (d) {
      var inRange = cmp(doc.dateRange.start, d) <= 0 && cmp(d, doc.dateRange.end) <= 0;
      var segs = layout(blocksForDate(d)).map(function (it) { return segment(it.block, d, it.lane, it.laneCount); }).join('');
      return '<div class="day-column' + (inRange ? '' : ' out-of-range') + '">' + segs + '</div>';
    }).join('');
    var startDate = parseKey(dates[0]), endDate = parseKey(dates[6]);
    var dm = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
    var dmy = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' });
    var label = startDate.getFullYear() === endDate.getFullYear()
      ? (dm.format(startDate) + ' &#8211; ' + dmy.format(endDate))
      : (dmy.format(startDate) + ' &#8211; ' + dmy.format(endDate));
    return '<div class="grid-shell"><header class="grid-nav">' +
      '<button class="nav-btn" data-nav="prev" aria-label="' + esc(L.prevWeek) + '">' + CHEVRON_L + '</button>' +
      '<button class="today-button" data-nav="today">' + esc(L.today) + '</button>' +
      '<button class="nav-btn" data-nav="next" aria-label="' + esc(L.nextWeek) + '">' + CHEVRON_R + '</button>' +
      '<span class="week-label">' + label + '</span></header>' +
      '<div class="grid-scroll"><div class="grid-header">' + header + '</div><div class="grid-body"><div class="hour-gutter">' + gutter + '</div>' + cols + '</div></div></div>';
  }

  function renderLists() {
    function rows(items) { return items.filter(function (it) { return it.label; }).map(function (it) { return '<div class="chip-row"><span class="chip-swatch" style="background:' + esc(it.fillColor) + '"></span><span>' + esc(it.label) + '</span></div>'; }).join(''); }
    var legs = rows(doc.legends), acts = rows(doc.activities), out = '';
    if (legs) out += '<section class="list-block"><h3>' + esc(L.legends) + '</h3>' + legs + '</section>';
    if (acts) out += '<section class="list-block"><h3>' + esc(L.activities) + '</h3>' + acts + '</section>';
    return out ? ('<div class="lists">' + out + '</div>') : '';
  }

  var today0 = toKey(new Date());
  var inRangeToday = cmp(today0, doc.dateRange.start) >= 0 && cmp(today0, doc.dateRange.end) <= 0;
  var state = { view: payload.initialView === 'schedule' ? 'week' : 'month', weekStart: startOfWeek(inRangeToday ? today0 : doc.dateRange.start) };

  function render() {
    var app = document.getElementById('app');
    var toggle = '<div class="view-toggle">' +
      '<button data-view="month" class="' + (state.view === 'month' ? 'active' : '') + '">' + esc(L.monthView) + '</button>' +
      '<button data-view="week" class="' + (state.view === 'week' ? 'active' : '') + '">' + esc(L.weekView) + '</button></div>';
    var body = state.view === 'month' ? renderMonth() : renderWeek();
    app.innerHTML = '<header class="topbar"><div class="topbar-main"><h1>' + esc(doc.title) + '</h1><span class="ro-badge">' + esc(L.readOnly) + '</span></div>' + toggle + '</header><main class="content">' + body + '</main>' + renderLists();
    app.querySelectorAll('[data-view]').forEach(function (b) { b.addEventListener('click', function () { state.view = b.getAttribute('data-view'); render(); }); });
    app.querySelectorAll('[data-nav]').forEach(function (b) {
      b.addEventListener('click', function () {
        var n = b.getAttribute('data-nav');
        if (n === 'prev') state.weekStart = addDays(state.weekStart, -7);
        else if (n === 'next') state.weekStart = addDays(state.weekStart, 7);
        else state.weekStart = startOfWeek(toKey(new Date()));
        render();
      });
    });
  }
  render();
})();
`;
