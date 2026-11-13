// Library screens: home, collections, verse detail, add/edit.
import { store, saveVerse, deleteVerse, saveCollection, deleteCollection, resetVerseProgress, patchVerse, pendingCount, topCollections, childrenOf, collectionScope, orderedCollections } from './store.js';
import { esc, parseReference, formatReference, splitNumberedPassage, parseReferenceLines, tokenize, wordCount } from './text.js';
import { dueVerses, stageLabel, canonicalCmp, streaks, todayCount, wordHeat, isDue } from './srs.js';
import { startSession, focusKeys } from './practice.js';
import { ring } from './charts.js';
import { I, topbar, toast, sheet, dialog, relTime } from './ui.js';

// Which parent collections are collapsed on the home list (per-device convenience).
const COLLAPSE_KEY = 'bm.collapsed';
const collapsedSet = () => { try { return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY)) || []); } catch { return new Set(); } };
const saveCollapsed = (s) => { try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...s])); } catch {} };

const COLORS = ['#b08442', '#6f8f5a', '#5a7f9a', '#a3646a', '#7d6aa0', '#8a8a7a'];

function collectionVerses(cid) {
  if (cid === 'all') return store.verses.slice().sort(canonicalCmp);
  if (cid === 'none') return store.verses.filter((v) => !v.collection_id).sort((a, b) => a.position - b.position);
  const ids = collectionScope(cid); // includes sub-collections
  const order = (id) => ids.indexOf(id);
  return store.verses.filter((v) => ids.includes(v.collection_id))
    .sort((a, b) => order(a.collection_id) - order(b.collection_id) || a.position - b.position);
}

function collectionName(cid) {
  if (cid === 'all') return 'All verses';
  if (cid === 'none') return 'Uncategorized';
  return store.collections.find((c) => c.id === cid)?.name || 'Collection';
}

function learnQueue(list) {
  const inProg = list.filter((v) => v.stage > 0 && v.stage < 3);
  const fresh = list.filter((v) => v.stage === 0);
  return [...inProg, ...fresh].map((v) => v.id);
}

export function go(session, hash) {
  if (startSession(session)) { focusKeys(); location.hash = hash || '#/session'; }
  else toast('Nothing to practice here yet');
}

/* ---------- home ---------- */

export function renderHome(el) {
  const due = dueVerses();
  const st = streaks();
  const today = todayCount();
  const goal = store.settings.dailyGoal;
  const learning = store.verses.filter((v) => v.stage < 3);
  const mastered = store.verses.filter((v) => v.stage >= 3).length;
  const date = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const uncats = store.verses.filter((v) => !v.collection_id).length;
  const collapsed = collapsedSet();

  el.innerHTML = `
  ${topbar({ title: 'Bible Memory' })}
  <main class="page">
    <div class="eyebrow">${esc(date)}</div>
    <section class="card today">
      ${ring(goal ? today / goal : 0, { size: 72, stroke: 7, label: `${today}/${goal}` })}
      <div class="today-txt">
        <div class="today-h">${today >= goal ? 'Daily goal met' : `${goal - today} more to reach today's goal`}</div>
        <div class="today-s"><span class="flame ${st.practicedToday ? 'lit' : ''}">${I.flame}</span>${st.current} day streak · ${mastered} mastered</div>
      </div>
    </section>
    <div class="row gap">
      <button class="bigbtn ${due.length ? 'hot' : ''}" data-go="review">
        <b>${due.length}</b><span>to review</span>
      </button>
      <button class="bigbtn" data-go="learn">
        <b>${learning.length}</b><span>to learn</span>
      </button>
    </div>
    ${pendingCount() ? `<div class="note">${pendingCount()} change${pendingCount() === 1 ? '' : 's'} waiting to sync</div>` : ''}

    <div class="sec-h"><span>Collections</span><button class="link" data-act="newcol">New collection</button></div>
    <section class="list">
      ${colRow('all', 'All verses', store.verses, null)}
      ${topCollections().map((c) => {
        const kids = childrenOf(c.id);
        const row = colRow(c.id, c.name, collectionVerses(c.id), c.color);
        if (!kids.length) return row;
        return `<div class="group${collapsed.has(c.id) ? ' collapsed' : ''}" data-group="${c.id}">${row}<div class="kids">${kids.map((k) => colRow(k.id, k.name, collectionVerses(k.id), c.color, true)).join('')}</div></div>`;
      }).join('')}
      ${uncats ? colRow('none', 'Uncategorized', store.verses.filter((v) => !v.collection_id), null) : ''}
    </section>
    ${!store.collections.length && !store.verses.length ? `<div class="empty"><p>Create a collection to get started.</p></div>` : ''}
  </main>`;

  el.querySelector('[data-go="review"]').onclick = () => {
    if (!due.length) return toast('Nothing due. Well done.');
    go({ mode: 'review', ids: due.map((v) => v.id) });
  };
  el.querySelector('[data-go="learn"]').onclick = () => {
    const ordered = topCollections().flatMap((c) => collectionVerses(c.id)).concat(collectionVerses('none'));
    go({ mode: 'learn', ids: learnQueue(ordered) });
  };
  el.querySelector('[data-act="newcol"]').onclick = () => newCollection();
  el.querySelectorAll('[data-tog]').forEach((b) => b.onclick = () => {
    const g = el.querySelector(`[data-group="${b.dataset.tog}"]`);
    const set = collapsedSet();
    const nowCollapsed = g.classList.toggle('collapsed');
    nowCollapsed ? set.add(b.dataset.tog) : set.delete(b.dataset.tog);
    b.setAttribute('aria-expanded', String(!nowCollapsed));
    saveCollapsed(set);
  });
}

function colRow(id, name, verses, color, sub = false) {
  const m = verses.filter((v) => v.stage >= 3).length;
  const due = verses.filter((v) => isDue(v)).length;
  const pct = verses.length ? (m / verses.length) * 100 : 0;
  const kids = sub ? 0 : childrenOf(id).length;
  const inner = `<span class="swatch" style="${color ? `background:${color}` : ''}"></span>
    <div class="lrow-main">
      <div class="lrow-t">${esc(name)}</div>
      <div class="lrow-s">${m}/${verses.length} mastered${kids ? ` · ${kids} sub-collection${kids === 1 ? '' : 's'}` : ''}${due ? ` · <em>${due} due</em>` : ''}</div>
      <div class="minibar"><i style="width:${pct}%"></i></div>
    </div>`;
  if (kids) {
    const open = !collapsedSet().has(id);
    return `<div class="lrow haskids"><a class="lrow-a" href="#/c/${id}">${inner}</a>
      <button class="tog" data-tog="${id}" aria-label="Expand or collapse ${esc(name)}" aria-expanded="${open}">${I.chev}</button></div>`;
  }
  return `<a class="lrow${sub ? ' sub' : ''}" href="#/c/${id}">${inner}${I.chev}</a>`;
}

async function newCollection(parentId = null) {
  const r = await dialog({ title: parentId ? 'New sub-collection' : 'New collection', ok: 'Create', fields: [
    { name: 'name', label: 'Name', placeholder: 'e.g. Romans 8' },
    { name: 'parent', label: 'Inside', type: 'select', value: parentId || '',
      options: [{ value: '', label: 'Top level' }, ...topCollections().map((c) => ({ value: c.id, label: c.name }))] },
  ] });
  if (r?.name?.trim()) {
    const parent = r.parent || null;
    const color = parent ? store.collections.find((c) => c.id === parent)?.color : COLORS[topCollections().length % COLORS.length];
    const c = saveCollection({ name: r.name.trim(), color, parent_id: parent });
    location.hash = `#/c/${c.id}`;
  }
}

/* ---------- collection ---------- */

export function renderCollection(el, cid) {
  const verses = collectionVerses(cid);
  const real = cid !== 'all' && cid !== 'none';
  const self = real ? store.collections.find((c) => c.id === cid) : null;
  const kids = real ? childrenOf(cid) : [];
  const direct = real ? verses.filter((v) => v.collection_id === cid) : verses;
  const due = verses.filter((v) => isDue(v));
  const m = verses.filter((v) => v.stage >= 3).length;
  el.innerHTML = `
  ${topbar({ title: collectionName(cid), back: self?.parent_id ? `#/c/${self.parent_id}` : '#/', sub: `${verses.length} verses · ${m} mastered`,
    right: real ? `<button class="icon-btn" data-act="menu" aria-label="Collection options">${I.more}</button>` : '' })}
  <main class="page">
    <div class="row gap wrap">
      <button class="btn primary grow" data-act="learn">Learn</button>
      <button class="btn ghost grow" data-act="review" ${due.length ? '' : 'disabled'}>Review ${due.length || ''}</button>
      <button class="btn ghost grow" data-act="practice">Practice all</button>
    </div>
    ${real ? `<div class="row gap" style="margin-top:8px">
      <a class="btn ghost grow" href="#/add?c=${cid}">Add verse</a>
      <a class="btn ghost grow" href="#/bulk?c=${cid}">Paste passage</a>
    </div>` : ''}
    ${kids.length ? `<div class="sec-h"><span>Sub-collections</span>${self && !self.parent_id ? '<button class="link" data-act="newsub">New</button>' : ''}</div>
    <section class="list">${kids.map((k) => colRow(k.id, k.name, collectionVerses(k.id), k.color || self.color)).join('')}</section>` : ''}
    ${kids.length && direct.length ? '<div class="sec-h"><span>Verses</span></div>' : ''}
    ${direct.length || !kids.length ? `<section class="list verses">
      ${direct.map((v) => verseRow(v)).join('') || '<div class="empty"><p>No verses in this collection.</p></div>'}
    </section>` : ''}
  </main>`;

  el.querySelector('[data-act="learn"]').onclick = () => go({ mode: 'learn', ids: learnQueue(verses) });
  el.querySelector('[data-act="newsub"]')?.addEventListener('click', () => newCollection(cid));
  el.querySelector('[data-act="review"]').onclick = () => go({ mode: 'review', ids: due.map((v) => v.id) });
  el.querySelector('[data-act="practice"]').onclick = () => sheet('Practice every verse', [1, 2, 3].map((s) => ({
    label: ['Step 1 · all words shown', 'Step 2 · every other word', 'Step 3 · from memory'][s - 1],
    run: () => go({ mode: 'practice', ids: verses.map((v) => v.id), step: s }),
  })));
  el.querySelector('[data-act="menu"]')?.addEventListener('click', () => {
    const c = store.collections.find((x) => x.id === cid);
    sheet(c.name, [
      { label: 'Rename', run: async () => {
        const r = await dialog({ title: 'Rename collection', fields: [{ name: 'name', label: 'Name', value: c.name }] });
        if (r?.name?.trim()) saveCollection({ id: c.id, name: r.name.trim() });
      } },
      { label: 'Change color', run: async () => {
        const r = await dialog({ title: 'Color', fields: [{ name: 'color', label: 'Color', type: 'select', value: c.color,
          options: COLORS.map((x, i) => ({ value: x, label: ['Gold', 'Olive', 'Steel', 'Rose', 'Iris', 'Stone'][i] })) }] });
        if (r) saveCollection({ id: c.id, color: r.color });
      } },
      ...(!c.parent_id ? [{ label: 'New sub-collection', run: () => newCollection(c.id) }] : []),
      ...(!kids.length && (c.parent_id || topCollections().length > 1) ? [{ label: c.parent_id ? 'Move to another collection…' : 'Put inside another collection…', run: async () => {
        const r = await dialog({ title: 'Move collection', ok: 'Move', fields: [{ name: 'p', label: 'Inside', type: 'select', value: c.parent_id || '',
          options: [{ value: '', label: 'Top level' }, ...topCollections().filter((x) => x.id !== c.id).map((x) => ({ value: x.id, label: x.name }))] }] });
        if (r) { saveCollection({ id: c.id, parent_id: r.p || null, position: store.collections.filter((x) => (x.parent_id || null) === (r.p || null)).length }); location.hash = '#/'; }
      } }] : []),
      { label: 'Move up', run: () => moveCollection(c, -1) },
      { label: 'Move down', run: () => moveCollection(c, 1) },
      { label: 'Delete collection (keep verses)', danger: true, run: () => { if (confirm(`Delete "${c.name}"? ${kids.length ? 'Its sub-collections are removed too. ' : ''}Verses move to Uncategorized.`)) { deleteCollection(c.id); location.hash = '#/'; } } },
      { label: 'Delete collection and its verses', danger: true, run: () => { if (confirm(`Delete "${c.name}"${kids.length ? ', its sub-collections' : ''} and all ${verses.length} verses with their history?`)) { deleteCollection(c.id, { withVerses: true }); location.hash = '#/'; } } },
    ]);
  });
}

function moveCollection(c, dir) {
  const cols = store.collections.filter((x) => (x.parent_id || null) === (c.parent_id || null)).sort((a, b) => a.position - b.position);
  const i = cols.findIndex((x) => x.id === c.id);
  const j = i + dir;
  if (j < 0 || j >= cols.length) return;
  [cols[i], cols[j]] = [cols[j], cols[i]];
  cols.forEach((x, k) => { if (x.position !== k) saveCollection({ id: x.id, position: k }); });
}

function verseRow(v) {
  const due = isDue(v);
  const chip = v.stage >= 3 ? (due ? '<span class="chip due">Due</span>' : `<span class="chip ok">${esc(relTime(v.due_at))}</span>`)
    : `<span class="chip s${v.stage}">${stageLabel(v)}</span>`;
  return `<a class="lrow" href="#/v/${v.id}">
    <div class="lrow-main">
      <div class="lrow-t">${esc(v.reference)}</div>
      <div class="lrow-s clamp">${esc(v.text)}</div>
    </div>
    ${chip}
  </a>`;
}

/* ---------- verse detail ---------- */

export function renderVerse(el, id) {
  const v = store.verses.find((x) => x.id === id);
  if (!v) { el.innerHTML = topbar({ title: 'Not found', back: '#/' }); return; }
  const words = tokenize(v.text);
  const heat = wordHeat(v);
  const atts = store.attempts.filter((a) => a.verse_id === v.id);
  const acc = atts.length ? Math.round(100 * (1 - atts.reduce((s, a) => s + a.mistakes, 0) / Math.max(1, atts.reduce((s, a) => s + a.words, 0)))) : null;
  const backTo = `#/c/${v.collection_id || 'none'}`;
  const showHeat = heat.total > 0;

  el.innerHTML = `
  ${topbar({ title: v.reference, back: backTo, right: `<button class="icon-btn" data-act="menu" aria-label="Verse options">${I.more}</button>` })}
  <main class="page">
    <div class="parea detail"><div class="pref ${store.settings.showReference ? '' : 'invisible'}">${esc(v.reference)}</div>
    <div class="verse display ${showHeat ? 'heatmode' : ''}" id="vtext">${words.map((w, i) =>
      `<span class="w${showHeat ? ' heated' : ''}" style="--heat:${heat.rates[i]?.toFixed(3) || 0}" ${showHeat ? `data-tip="${esc(w.text)}: missed ${heat.counts[i]} of ${heat.total}"` : ''}>${esc(w.text)}</span>${w.sep ? ' ' : ''}`).join('')}</div></div>
    ${showHeat ? `<div class="heat-legend"><span>Heatmap · ${heat.total} attempt${heat.total === 1 ? '' : 's'}</span><i class="hl"></i><span>often missed</span>
      <button class="link" data-act="toggleheat">Hide</button></div>` : ''}

    <div class="tiles">
      <div class="tile"><b>${stageLabel(v)}</b><span>stage</span></div>
      <div class="tile"><b>${atts.length}</b><span>attempts</span></div>
      <div class="tile"><b>${acc == null ? '—' : acc + '%'}</b><span>accuracy</span></div>
      <div class="tile"><b>${v.stage >= 3 ? esc(relTime(v.due_at)) : '—'}</b><span>next review</span></div>
    </div>

    <div class="col gap">
      ${v.stage < 3 ? `<button class="btn primary wide" data-act="learn">${v.stage ? `Continue · Step ${v.stage + 1}` : 'Start learning'}</button>`
        : `<button class="btn primary wide" data-act="review">${isDue(v) ? 'Review now' : 'Review early'}</button>`}
      <div class="row gap">
        ${[1, 2, 3].map((s) => `<button class="btn ghost grow" data-step="${s}">Step ${s}</button>`).join('')}
      </div>
    </div>

    <div class="sec-h"><span>Details</span></div>
    <div class="kv">
      <div><span>Words</span><b>${words.length}</b></div>
      ${v.stage >= 3 ? `<div><span>Interval</span><b>${Math.round(v.interval_days)} days</b></div>
      <div><span>Ease</span><b>${(v.ease || 0).toFixed(2)}</b></div>
      <div><span>Successful reviews</span><b>${v.reps}</b></div>
      <div><span>Lapses</span><b>${v.lapses}</b></div>
      <div><span>Mastered</span><b>${v.mastered_at ? new Date(v.mastered_at).toLocaleDateString() : '—'}</b></div>` : ''}
      <div><span>Added</span><b>${new Date(v.created_at).toLocaleDateString()}</b></div>
    </div>

    ${atts.length ? `<div class="sec-h"><span>Recent attempts</span></div>
    <div class="list hist">${atts.slice(-12).reverse().map((a) => `<div class="hrow">
      <span>${esc(relTime(a.created_at))}</span><span>${a.kind === 'review' ? 'Review' : 'Step ' + a.kind.slice(-1)}</span>
      <span class="${a.passed ? 'okc' : 'badc'}">${a.mistakes ? a.mistakes + ' miss' + (a.mistakes > 1 ? 'es' : '') : 'perfect'}</span></div>`).join('')}</div>` : ''}
  </main>`;

  const q = (s) => el.querySelector(s);
  q('[data-act="learn"]')?.addEventListener('click', () => go({ mode: 'learn', ids: [v.id] }));
  q('[data-act="review"]')?.addEventListener('click', () => go(isDue(v) ? { mode: 'review', ids: [v.id] } : { mode: 'practice', ids: [v.id], step: 3 }));
  el.querySelectorAll('[data-step]').forEach((b) => b.onclick = () => go({ mode: 'practice', ids: [v.id], step: +b.dataset.step }));
  q('[data-act="toggleheat"]')?.addEventListener('click', (e) => {
    const t = q('#vtext'); t.classList.toggle('heatmode');
    e.target.textContent = t.classList.contains('heatmode') ? 'Hide' : 'Show';
  });
  q('[data-act="menu"]').onclick = () => sheet(v.reference, [
    { label: 'Edit verse', run: () => { location.hash = `#/edit/${v.id}`; } },
    { label: 'Move to collection', run: async () => {
      const r = await dialog({ title: 'Move to', fields: [{ name: 'c', label: 'Collection', type: 'select', value: v.collection_id || '',
        options: [{ value: '', label: 'Uncategorized' }, ...orderedCollections().map((c) => ({ value: c.id, label: (c.parent_id ? '– ' : '') + c.name }))] }], ok: 'Move' });
      if (r) { patchVerse(v.id, { collection_id: r.c || null }); toast('Moved'); }
    } },
    ...(v.stage >= 3 ? [{ label: 'Mark due today', run: () => { patchVerse(v.id, { due_at: new Date().toISOString() }); toast('Due today'); } }] : []),
    ...(v.stage < 3 ? [{ label: 'Mark as mastered', run: () => {
      import('./srs.js').then(({ masterPatch }) => { patchVerse(v.id, masterPatch()); toast('Marked mastered'); });
    } }] : []),
    { label: 'Reset progress', danger: true, run: () => { if (confirm('Reset this verse to New? History stays for stats.')) resetVerseProgress(v.id); } },
    { label: 'Delete verse', danger: true, run: () => { if (confirm(`Delete ${v.reference} and its history?`)) { deleteVerse(v.id); location.hash = backTo; } } },
  ]);
}

/* ---------- add / edit ---------- */

function collectionOptions(selected) {
  return `<option value="">Uncategorized</option>` + orderedCollections()
    .map((c) => `<option value="${c.id}"${c.id === selected ? ' selected' : ''}>${c.parent_id ? '&nbsp;&nbsp;– ' : ''}${esc(c.name)}</option>`).join('');
}

export function renderEdit(el, id, params) {
  const v = id ? store.verses.find((x) => x.id === id) : null;
  const cid = v ? v.collection_id : params.get('c');
  el.innerHTML = `
  ${topbar({ title: v ? 'Edit verse' : 'Add verse', back: v ? `#/v/${v.id}` : (cid ? `#/c/${cid}` : '#/') })}
  <main class="page">
    <form class="form" id="f">
      <label class="field"><span>Reference</span><input name="reference" value="${esc(v?.reference || '')}" placeholder="John 3:16" autocomplete="off" required></label>
      <div class="hint" id="refhint"></div>
      <label class="field"><span>Text</span><textarea name="text" rows="7" placeholder="Type or paste the verse" required>${esc(v?.text || '')}</textarea></label>
      <div class="hint" id="wc"></div>
      <label class="field"><span>Collection</span><select name="collection_id">${collectionOptions(cid)}</select></label>
      ${v && v.stage > 0 ? `<label class="check"><input type="checkbox" name="reset"> Reset progress (recommended if the wording changed a lot)</label>` : ''}
      <button class="btn primary wide">${v ? 'Save' : 'Add verse'}</button>
      ${v ? '' : `<button type="button" class="btn ghost wide" data-act="another">Add and start another</button>
      <a class="link center" href="#/bulk${cid ? `?c=${cid}` : ''}">Adding several verses? Paste a passage</a>`}
    </form>
  </main>`;
  const f = el.querySelector('#f');
  const upd = () => {
    const p = parseReference(f.reference.value);
    el.querySelector('#refhint').textContent = f.reference.value ? (p ? `${formatReference(p.book, p.chapter, p.verse)}${p.verseEnd ? '–' + p.verseEnd + '  (one verse per entry works best)' : ''}` : 'Not a reference I recognise; it will still be saved.') : '';
    const n = wordCount(f.text.value);
    el.querySelector('#wc').textContent = n ? `${n} words` : '';
  };
  f.addEventListener('input', upd); upd();
  const submit = (another) => {
    if (!f.reference.value.trim() || !f.text.value.trim()) return toast('Reference and text are required');
    const p = parseReference(f.reference.value);
    const reference = p && p.verse && !p.verseEnd ? formatReference(p.book, p.chapter, p.verse) : f.reference.value.trim().replace(/\s+/g, ' ');
    const data = { reference, text: f.text.value.trim().replace(/\s+/g, ' '), collection_id: f.collection_id.value || null };
    if (v) {
      const saved = saveVerse({ id: v.id, ...data });
      if (f.reset?.checked) resetVerseProgress(saved.id);
      location.hash = `#/v/${v.id}`;
    } else {
      const saved = saveVerse(data);
      toast(`Added ${saved.reference}`);
      if (another) {
        const next = p && p.verse ? formatReference(p.book, p.chapter, p.verse + 1) : '';
        f.reference.value = next; f.text.value = ''; upd(); f.text.focus();
      } else location.hash = data.collection_id ? `#/c/${data.collection_id}` : '#/c/none';
    }
  };
  f.onsubmit = (e) => { e.preventDefault(); submit(false); };
  el.querySelector('[data-act="another"]')?.addEventListener('click', () => submit(true));
}

export function renderBulk(el, params) {
  const cid = params.get('c');
  el.innerHTML = `
  ${topbar({ title: 'Paste a passage', back: cid ? `#/c/${cid}` : '#/' })}
  <main class="page">
    <form class="form" id="f">
      <label class="field"><span>Passage reference</span><input name="ref" placeholder="Romans 8:28-30" autocomplete="off"></label>
      <label class="field"><span>Text</span><textarea name="text" rows="10" placeholder="28 And we know that for those who love God… 29 For those whom he foreknew…"></textarea></label>
      <div class="hint">Paste text with verse numbers and a passage reference, or one verse per line starting with its reference (e.g. “John 3:16 For God so loved…”). Each verse is saved separately.</div>
      <label class="field"><span>Collection</span><select name="collection_id">${collectionOptions(cid)}<option value="__new">New collection named after passage</option></select></label>
      <div id="preview" class="list preview"></div>
      <button class="btn primary wide" id="save" disabled>Add verses</button>
    </form>
  </main>`;
  const f = el.querySelector('#f');
  let parsed = [];
  const upd = () => {
    parsed = [];
    const text = f.text.value.trim();
    const p = parseReference(f.ref.value);
    if (text) {
      if (p && p.verse) {
        const parts = splitNumberedPassage(text, p.verse);
        if (parts) parsed = parts.map((x) => ({ reference: formatReference(p.book, p.chapter, x.verse), text: x.text }));
        else if (!p.verseEnd) parsed = [{ reference: formatReference(p.book, p.chapter, p.verse), text }];
      } else if (p && !p.verse) {
        const parts = splitNumberedPassage(text, null);
        if (parts) parsed = parts.map((x) => ({ reference: formatReference(p.book, p.chapter, x.verse), text: x.text }));
      }
      if (!parsed.length) parsed = (parseReferenceLines(text) || []).map((x) => {
        const r = parseReference(x.reference);
        return { reference: r ? formatReference(r.book, r.chapter, r.verse) : x.reference, text: x.text };
      });
    }
    el.querySelector('#preview').innerHTML = parsed.length
      ? parsed.map((x) => `<div class="lrow"><div class="lrow-main"><div class="lrow-t">${esc(x.reference)}</div><div class="lrow-s clamp">${esc(x.text)}</div></div><span class="chip">${wordCount(x.text)}w</span></div>`).join('')
      : (text ? '<div class="hint warn">Could not split this yet. Add a passage reference like “Romans 8:28-30” with numbers in the text, or start each line with its reference.</div>' : '');
    const btn = el.querySelector('#save');
    btn.disabled = !parsed.length;
    btn.textContent = parsed.length ? `Add ${parsed.length} verse${parsed.length === 1 ? '' : 's'}` : 'Add verses';
  };
  f.addEventListener('input', upd);
  f.onsubmit = (e) => {
    e.preventDefault();
    if (!parsed.length) return;
    let col = f.collection_id.value || null;
    if (col === '__new') col = saveCollection({ name: f.ref.value.trim() || parsed[0].reference, color: COLORS[topCollections().length % COLORS.length] }).id;
    for (const x of parsed) saveVerse({ reference: x.reference, text: x.text.replace(/\s+/g, ' '), collection_id: col });
    toast(`Added ${parsed.length} verse${parsed.length === 1 ? '' : 's'}`);
    location.hash = `#/c/${col || 'none'}`;
  };
}

