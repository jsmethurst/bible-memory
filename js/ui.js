// Shared UI bits.
import { esc } from './text.js';

export const I = {
  plus: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none"><path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  more: '<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/></svg>',
  chev: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  home: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M4 6.5C4 5.1 5.1 4 6.5 4H11v16H6.5A2.5 2.5 0 0 1 4 17.5zM20 6.5C20 5.1 18.9 4 17.5 4H13v16h4.5a2.5 2.5 0 0 0 2.5-2.5z"/></svg>',
  review: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4"/></svg>',
  stats: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M5 20V12M10 20V6M15 20v-9M20 20V4"/></svg>',
  gear: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  flame: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2c1 3.5 5 5.5 5 11a5 5 0 0 1-10 0c0-2.6 1.3-4.2 2.5-5.4.2 1.9 1 3 2 3.4C11 8 11.2 5 12 2z"/></svg>',
};

export function topbar({ title, back = null, right = '' , sub = ''}) {
  return `<header class="topbar">
    <div class="tb-l">${back ? `<a class="icon-btn" href="${back}" aria-label="Back">${I.back}</a>` : ''}</div>
    <div class="tb-c"><div class="tb-title">${esc(title)}</div>${sub ? `<div class="tb-sub">${esc(sub)}</div>` : ''}</div>
    <div class="tb-r">${right}</div>
  </header>`;
}

export function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('on'), 2200);
}

// Bottom sheet with a list of actions. items: [{label, danger, run}]
export function sheet(title, items) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet">
    ${title ? `<div class="sheet-title">${esc(title)}</div>` : ''}
    ${items.map((it, i) => `<button class="sheet-item${it.danger ? ' danger' : ''}" data-i="${i}">${esc(it.label)}</button>`).join('')}
    <button class="sheet-item cancel" data-i="-1">Cancel</button>
  </div>`;
  document.getElementById('app').appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('on'));
  const close = () => { wrap.classList.remove('on'); setTimeout(() => wrap.remove(), 200); };
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap) return close();
    const b = e.target.closest('[data-i]');
    if (!b) return;
    close();
    const it = items[+b.dataset.i];
    if (it) it.run();
  });
}

// Simple modal form returning a promise of the values (or null).
export function dialog({ title, fields, ok = 'Save' }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.innerHTML = `<form class="sheet dialog">
      <div class="sheet-title">${esc(title)}</div>
      ${fields.map((f) => f.type === 'select'
        ? `<label class="field"><span>${esc(f.label)}</span><select name="${f.name}">${f.options.map((o) => `<option value="${esc(o.value)}"${o.value === f.value ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>`
        : `<label class="field"><span>${esc(f.label)}</span><input name="${f.name}" value="${esc(f.value || '')}" placeholder="${esc(f.placeholder || '')}" autocomplete="off"></label>`).join('')}
      <div class="row gap"><button type="button" class="btn ghost grow" data-x>Cancel</button><button class="btn primary grow">${esc(ok)}</button></div>
    </form>`;
    document.getElementById('app').appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('on'));
    const form = wrap.querySelector('form');
    const close = (val) => { wrap.classList.remove('on'); setTimeout(() => wrap.remove(), 200); resolve(val); };
    setTimeout(() => form.querySelector('input,select')?.focus(), 50);
    form.onsubmit = (e) => { e.preventDefault(); close(Object.fromEntries(new FormData(form))); };
    wrap.querySelector('[data-x]').onclick = () => close(null);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(null); });
  });
}

export function relTime(date) {
  if (!date) return '';
  const d = new Date(date);
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  if (days > 1 && days < 31) return `in ${days} days`;
  if (days < -1 && days > -31) return `${-days} days ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}
