// Small hand-built SVG charts. Every mark carries data-tip for the shared tooltip.
import { esc } from './text.js';

const W = 350;

function niceMax(v) {
  if (v <= 2) return 2;
  if (v <= 4) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

// Rounded top only, anchored to the baseline.
function barPath(x, y, w, h, r = 3) {
  if (h <= 0) return '';
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

// data: [{label, values:[a,b?], tip}] ; series: [{name, cls}]
export function barChart(data, { height = 140, series = [{ cls: 'c1' }], labelEvery = 1, yLabel = '' } = {}) {
  const padL = 26, padB = 20, padT = 8;
  const plotW = W - padL, plotH = height - padB - padT;
  const totals = data.map((d) => d.values.reduce((s, x) => s + x, 0));
  const max = niceMax(Math.max(1, ...totals));
  const slot = plotW / Math.max(1, data.length);
  const bw = Math.max(2, Math.min(22, slot - 2));
  let out = `<svg viewBox="0 0 ${W} ${height}" class="chart" role="img">`;
  for (const f of [0, 0.5, 1]) {
    const y = padT + plotH - f * plotH;
    out += `<line x1="${padL}" x2="${W}" y1="${y}" y2="${y}" class="grid"/>`;
    out += `<text x="${padL - 6}" y="${y + 3}" class="axis" text-anchor="end">${Math.round(max * f)}</text>`;
  }
  data.forEach((d, i) => {
    const x = padL + i * slot + (slot - bw) / 2;
    let base = padT + plotH;
    d.values.forEach((v, si) => {
      if (!v) return;
      const h = (v / max) * plotH;
      const gap = si > 0 ? 2 : 0;
      const top = si === d.values.length - 1 || d.values.slice(si + 1).every((x) => !x);
      const y = base - h;
      out += top
        ? `<path d="${barPath(x, y + gap, bw, h - gap)}" class="${series[si]?.cls || 'c1'}"/>`
        : `<rect x="${x}" y="${y + gap}" width="${bw}" height="${Math.max(0, h - gap)}" class="${series[si]?.cls || 'c1'}"/>`;
      base = y;
    });
    out += `<rect x="${padL + i * slot}" y="${padT}" width="${slot}" height="${plotH}" class="hit" data-tip="${esc(d.tip || `${d.label}: ${totals[i]}`)}"/>`;
    if (i % labelEvery === 0 && d.label) out += `<text x="${x + bw / 2}" y="${height - 5}" class="axis" text-anchor="middle">${esc(d.short ?? d.label)}</text>`;
  });
  return out + '</svg>';
}

// points: [{x: Date|number, y, tip, label?}] evenly spaced
export function lineChart(points, { height = 140, area = true, yMax, yFmt = (v) => Math.round(v), labels = [] } = {}) {
  const padL = 30, padB = 20, padT = 10, padR = 6;
  const plotW = W - padL - padR, plotH = height - padB - padT;
  const max = yMax ?? niceMax(Math.max(1, ...points.map((p) => p.y)));
  const n = points.length;
  const X = (i) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const Y = (v) => padT + plotH - (v / max) * plotH;
  let out = `<svg viewBox="0 0 ${W} ${height}" class="chart" role="img">`;
  for (const f of [0, 0.5, 1]) {
    const y = padT + plotH - f * plotH;
    out += `<line x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}" class="grid"/>`;
    out += `<text x="${padL - 6}" y="${y + 3}" class="axis" text-anchor="end">${yFmt(max * f)}</text>`;
  }
  if (n) {
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
    if (area) out += `<path d="${d}L${X(n - 1)},${padT + plotH}L${X(0)},${padT + plotH}Z" class="area"/>`;
    out += `<path d="${d}" class="line"/>`;
    const last = points[n - 1];
    out += `<circle cx="${X(n - 1)}" cy="${Y(last.y)}" r="4" class="dot"/>`;
    const slot = plotW / Math.max(1, n - 1);
    points.forEach((p, i) => {
      out += `<rect x="${X(i) - slot / 2}" y="${padT}" width="${slot}" height="${plotH}" class="hit" data-tip="${esc(p.tip)}" data-cx="${X(i)}" data-cy="${Y(p.y)}"/>`;
    });
  }
  for (const l of labels) out += `<text x="${X(l.i)}" y="${height - 5}" class="axis" text-anchor="${l.anchor || 'middle'}">${esc(l.text)}</text>`;
  return out + '</svg>';
}

// days: array of {date, value, tip}, ending today, length = weeks*7 aligned to weekStart
export function calendar(days, { weeks = 26, max = 1 } = {}) {
  const cell = 11, gap = 2, padL = 16, padT = 14;
  const height = padT + 7 * (cell + gap);
  let out = `<svg viewBox="0 0 ${W} ${height}" class="chart cal" role="img">`;
  const step = (W - padL) / weeks;
  const size = Math.min(cell, step - gap);
  let lastMonth = -1;
  days.forEach((d, i) => {
    const col = Math.floor(i / 7), row = i % 7;
    if (!d) return;
    const x = padL + col * step, y = padT + row * (size + gap);
    const lvl = d.value <= 0 ? 0 : Math.min(4, Math.ceil((d.value / max) * 4));
    out += `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="2.5" class="heat h${lvl}${d.future ? ' fut' : ''}" data-tip="${esc(d.tip)}"/>`;
    const m = d.date.getMonth();
    if (row === 0 && m !== lastMonth) {
      if (lastMonth !== -1 || d.date.getDate() <= 7) out += `<text x="${x}" y="9" class="axis">${d.date.toLocaleString(undefined, { month: 'short' })}</text>`;
      lastMonth = m;
    }
  });
  return out + '</svg>';
}

export function ring(frac, { size = 64, stroke = 7, label = '' } = {}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, frac));
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="ring">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-bg" stroke-width="${stroke}" fill="none"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-fg" stroke-width="${stroke}" fill="none"
      stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" stroke-linecap="round" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" class="ring-label">${esc(label)}</text>
  </svg>`;
}

// Segmented horizontal bar: segs [{value, cls, name}]
export function segBar(segs) {
  const total = segs.reduce((s, x) => s + x.value, 0) || 1;
  return `<div class="segbar">${segs.filter((s) => s.value).map((s) =>
    `<i class="${s.cls}" style="flex:${s.value}" data-tip="${esc(`${s.name}: ${s.value}`)}"></i>`).join('')}</div>`;
}

/* ---------- shared tooltip ---------- */

let tipEl;
export function initTooltips(root = document) {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'tip';
    document.body.appendChild(tipEl);
  }
  const show = (e) => {
    const t = e.target.closest?.('[data-tip]');
    if (!t) { tipEl.classList.remove('on'); return; }
    tipEl.textContent = t.dataset.tip;
    tipEl.classList.add('on');
    const r = t.getBoundingClientRect();
    const tw = tipEl.offsetWidth;
    let x = r.left + r.width / 2 - tw / 2;
    x = Math.max(8, Math.min(window.innerWidth - tw - 8, x));
    tipEl.style.left = x + 'px';
    tipEl.style.top = Math.max(8, r.top - tipEl.offsetHeight - 8 + window.scrollY) + 'px';
    root.querySelectorAll('.hit.on, .heat.on, .bk.on').forEach((n) => n.classList.remove('on'));
    t.classList.add('on');
  };
  root.addEventListener('pointerover', show);
  root.addEventListener('pointerdown', show);
  root.addEventListener('pointerleave', () => tipEl.classList.remove('on'), true);
  window.addEventListener('scroll', () => tipEl.classList.remove('on'), { passive: true });
}
