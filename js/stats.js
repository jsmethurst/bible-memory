// Insights: activity, progress, accuracy, forecast, Bible coverage and trouble words.
import { store } from './store.js';
import { BOOKS, esc, tokenize } from './text.js';
import { activityByDay, streaks, dayKey, startOfDay, DAY, wordHeat } from './srs.js';
import { barChart, lineChart, calendar, segBar } from './charts.js';
import { topbar } from './ui.js';
import { fmtDur } from './practice.js';

let range = 30;

export function renderStats(el) {
  const byDay = activityByDay();
  const st = streaks(byDay);
  const verses = store.verses;
  const atts = store.attempts;
  const mastered = verses.filter((v) => v.stage >= 3);
  const learning = verses.filter((v) => v.stage > 0 && v.stage < 3);
  const fresh = verses.filter((v) => v.stage === 0);
  const wordsMemorized = mastered.reduce((s, v) => s + tokenize(v.text).length, 0);
  const totalMs = [...byDay.values()].reduce((s, d) => s + d.ms, 0);
  const since = Date.now() - range * DAY;
  const recent = atts.filter((a) => new Date(a.created_at) >= since);
  const rw = recent.reduce((s, a) => s + a.words, 0), rm = recent.reduce((s, a) => s + a.mistakes, 0);
  const acc = rw ? Math.round(((rw - rm) / rw) * 100) : null;
  const perfect = recent.length ? Math.round((recent.filter((a) => a.mistakes === 0).length / recent.length) * 100) : null;

  el.innerHTML = `
  ${topbar({ title: 'Insights' })}
  <main class="page stats">
    <div class="tiles">
      <div class="tile"><b>${mastered.length}</b><span>mastered</span></div>
      <div class="tile"><b>${st.current}</b><span>day streak</span></div>
      <div class="tile"><b>${st.longest}</b><span>best streak</span></div>
      <div class="tile"><b>${wordsMemorized}</b><span>words known</span></div>
    </div>

    <section class="card">
      <div class="card-h"><span>Activity</span><span class="muted">${byDay.size} active day${byDay.size === 1 ? '' : 's'} · ${fmtDur(totalMs)}</span></div>
      ${activityCalendar(byDay)}
      <div class="cal-legend"><span>Less</span>${[0, 1, 2, 3, 4].map((l) => `<i class="heat h${l}"></i>`).join('')}<span>More</span></div>
    </section>

    <div class="seg" role="tablist">${[7, 30, 90, 365].map((r) => `<button class="${r === range ? 'on' : ''}" data-range="${r}">${r === 365 ? '1y' : r + 'd'}</button>`).join('')}</div>

    <div class="tiles three">
      <div class="tile"><b>${acc == null ? '—' : acc + '%'}</b><span>accuracy</span></div>
      <div class="tile"><b>${perfect == null ? '—' : perfect + '%'}</b><span>perfect runs</span></div>
      <div class="tile"><b>${recent.length}</b><span>attempts</span></div>
    </div>

    <section class="card">
      <div class="card-h"><span>Daily practice</span>
        <span class="legend"><i class="c1"></i>Review <i class="c2"></i>Learning</span></div>
      ${dailyBars(byDay)}
    </section>

    <section class="card">
      <div class="card-h"><span>Verses mastered</span><span class="muted">${mastered.length} total</span></div>
      ${masteredLine()}
    </section>

    <section class="card">
      <div class="card-h"><span>Accuracy</span><span class="muted">by ${range > 90 ? 'month' : range > 30 ? 'week' : 'day'}</span></div>
      ${accuracyLine()}
    </section>

    <section class="card">
      <div class="card-h"><span>Progress</span><span class="muted">${verses.length} verses</span></div>
      ${segBar([{ value: mastered.length, cls: 'c1', name: 'Mastered' }, { value: learning.length, cls: 'c2', name: 'Learning' }, { value: fresh.length, cls: 'c3', name: 'New' }])}
      <div class="legend spread"><span><i class="c1"></i>Mastered ${mastered.length}</span><span><i class="c2"></i>Learning ${learning.length}</span><span><i class="c3"></i>New ${fresh.length}</span></div>
    </section>

    <section class="card">
      <div class="card-h"><span>Upcoming reviews</span><span class="muted">next 14 days</span></div>
      ${forecast()}
    </section>

    <section class="card">
      <div class="card-h"><span>When you practice</span><span class="muted">attempts by hour</span></div>
      ${hours()}
    </section>

    <section class="card">
      <div class="card-h"><span>Bible heatmap</span><span class="muted">verses mastered per book</span></div>
      ${bibleGrid()}
    </section>

    <section class="card">
      <div class="card-h"><span>Trouble words</span><span class="muted">most often missed</span></div>
      ${troubleWords()}
    </section>
  </main>`;

  el.querySelectorAll('[data-range]').forEach((b) => b.onclick = () => { range = +b.dataset.range; renderStats(el); });
}

function activityCalendar(byDay) {
  const weeks = 26;
  const ws = store.settings.weekStart;
  const today = startOfDay();
  const end = new Date(today); // pad to end of week
  end.setDate(end.getDate() + ((6 - ((today.getDay() - ws + 7) % 7))));
  const start = new Date(end); start.setDate(start.getDate() - weeks * 7 + 1);
  const days = [];
  let max = 1;
  for (const d of byDay.values()) max = Math.max(max, d.count);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const e = byDay.get(dayKey(d));
    const date = new Date(d);
    days.push({
      date, value: e?.count || 0, future: date > today,
      tip: `${date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}: ${e ? `${e.count} attempt${e.count === 1 ? '' : 's'}, ${e.verses.size} verse${e.verses.size === 1 ? '' : 's'}` : 'no practice'}`,
    });
  }
  return calendar(days, { weeks, max: Math.max(4, max) });
}

function bucketDays() {
  const out = [];
  const today = startOfDay();
  for (let i = range - 1; i >= 0; i--) out.push(new Date(today.getTime() - i * DAY));
  return out;
}

function dailyBars(byDay) {
  const days = bucketDays();
  const groupSize = range > 90 ? 7 : 1;
  const data = [];
  for (let i = 0; i < days.length; i += groupSize) {
    const grp = days.slice(i, i + groupSize);
    let r = 0, l = 0;
    for (const d of grp) { const e = byDay.get(dayKey(d)); if (e) { r += e.review; l += e.learn; } }
    const d0 = grp[0];
    const label = d0.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    data.push({ label, short: groupSize > 1 ? (d0.getDate() <= 7 ? d0.toLocaleDateString(undefined, { month: 'short' }) : '') : (range <= 7 ? d0.toLocaleDateString(undefined, { weekday: 'narrow' }) : String(d0.getDate())),
      values: [r, l], tip: `${groupSize > 1 ? 'Week of ' : ''}${label}: ${r} review, ${l} learning` });
  }
  const every = range <= 7 ? 1 : range <= 30 ? 5 : groupSize > 1 ? 1 : 15;
  return barChart(data, { series: [{ cls: 'c1' }, { cls: 'c2' }], labelEvery: every });
}

function masteredLine() {
  const days = bucketDays();
  const dates = store.verses.filter((v) => v.mastered_at && v.stage >= 3).map((v) => new Date(v.mastered_at).getTime()).sort((a, b) => a - b);
  let j = 0;
  const pts = days.map((d) => {
    const endD = d.getTime() + DAY;
    while (j < dates.length && dates[j] < endD) j++;
    return { y: j, tip: `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${j} mastered` };
  });
  return lineChart(pts, { labels: axisLabels(days) });
}

function axisLabels(days) {
  const n = days.length;
  const f = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return [{ i: 0, text: f(days[0]), anchor: 'start' }, { i: Math.floor((n - 1) / 2), text: f(days[Math.floor((n - 1) / 2)]) }, { i: n - 1, text: 'Today', anchor: 'end' }];
}

function accuracyLine() {
  const days = bucketDays();
  const g = range > 90 ? 30 : range > 30 ? 7 : 1;
  const pts = [];
  const labelsDays = [];
  for (let i = 0; i < days.length; i += g) {
    const s = days[i].getTime(), e = (days[i + g] || new Date(startOfDay().getTime() + DAY)).getTime();
    const as = store.attempts.filter((a) => { const t = new Date(a.created_at).getTime(); return t >= s && t < e; });
    const w = as.reduce((x, a) => x + a.words, 0), m = as.reduce((x, a) => x + a.mistakes, 0);
    if (!w) continue;
    const acc = ((w - m) / w) * 100;
    pts.push({ y: acc, tip: `${days[i].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${acc.toFixed(1)}% over ${as.length} attempts` });
    labelsDays.push(days[i]);
  }
  if (pts.length < 2) return '<div class="empty small">Practice on a couple of days to see a trend.</div>';
  return lineChart(pts, { yMax: 100, area: false, yFmt: (v) => Math.round(v) + '%', labels: axisLabels(labelsDays).map((l, k) => k === 2 ? { ...l, text: labelsDays[labelsDays.length - 1].toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) } : l) });
}

function forecast() {
  const today = startOfDay();
  const data = [];
  let overdue = 0;
  const counts = new Array(14).fill(0);
  for (const v of store.verses) {
    if (v.stage < 3 || !v.due_at) continue;
    const d = Math.floor((startOfDay(new Date(v.due_at)) - today) / DAY);
    if (d < 0) overdue++;
    else if (d < 14) counts[d]++;
  }
  counts[0] += overdue;
  for (let i = 0; i < 14; i++) {
    const d = new Date(today.getTime() + i * DAY);
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    data.push({ label, short: i === 0 ? 'T' : d.toLocaleDateString(undefined, { weekday: 'narrow' }), values: [counts[i]],
      tip: `${label}: ${counts[i]} due${i === 0 && overdue ? ` (${overdue} overdue)` : ''}` });
  }
  return barChart(data, { height: 120 });
}

function hours() {
  const counts = new Array(24).fill(0);
  for (const a of store.attempts) counts[new Date(a.created_at).getHours()]++;
  const fmt = (h) => (h % 12 || 12) + (h < 12 ? 'a' : 'p');
  return barChart(counts.map((c, h) => ({ label: fmt(h), short: h % 6 === 0 ? fmt(h) : '', values: [c], tip: `${fmt(h)}–${fmt((h + 1) % 24)}: ${c} attempts` })), { height: 110 });
}

function bibleGrid() {
  const m = new Map(), t = new Map();
  for (const v of store.verses) {
    if (!v.book) continue;
    t.set(v.book, (t.get(v.book) || 0) + 1);
    if (v.stage >= 3) m.set(v.book, (m.get(v.book) || 0) + 1);
  }
  const max = Math.max(1, ...m.values());
  const cell = (b, i) => {
    const n = m.get(b[0]) || 0, tot = t.get(b[0]) || 0;
    const lvl = n ? Math.min(4, Math.ceil((n / max) * 4)) : 0;
    return `<div class="bk heat h${lvl}${tot && !n ? ' some' : ''}${i === 39 ? ' nt' : ''}" data-tip="${esc(b[0])}: ${n} mastered${tot > n ? `, ${tot - n} learning` : ''}">${esc(b[1])}</div>`;
  };
  return `<div class="bgrid-label">Old Testament</div><div class="bgrid">${BOOKS.slice(0, 39).map(cell).join('')}</div>
    <div class="bgrid-label">New Testament</div><div class="bgrid">${BOOKS.slice(39).map((b, i) => cell(b, i + 39)).join('')}</div>`;
}

function troubleWords() {
  const rows = [];
  for (const v of store.verses) {
    const h = wordHeat(v);
    if (h.total < 2) continue;
    const words = tokenize(v.text);
    h.counts.forEach((c, i) => { if (c > 0) rows.push({ v, word: words[i].text, rate: h.rates[i], c, total: h.total }); });
  }
  rows.sort((a, b) => b.rate - a.rate || b.c - a.c);
  if (!rows.length) return '<div class="empty small">Words you miss will show up here once you have a few attempts.</div>';
  return `<div class="list trouble">${rows.slice(0, 10).map((r) => `<a class="trow" href="#/v/${r.v.id}">
    <span class="tw">${esc(r.word.replace(/[^\p{L}\p{N}'’-]/gu, ''))}</span>
    <span class="tref">${esc(r.v.reference)}</span>
    <span class="tbar"><i style="width:${Math.round(r.rate * 100)}%"></i></span>
    <span class="tpct">${Math.round(r.rate * 100)}%</span></a>`).join('')}</div>`;
}
