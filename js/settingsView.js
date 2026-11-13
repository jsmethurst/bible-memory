// Settings screen.
import { store, updateSettings, signOut, exportData, importData, pendingCount, flush } from './store.js';
import { DEFAULTS, THEMES, FONTS, applyAppearance } from './settings.js';
import { tokenize, esc } from './text.js';
import { topbar, toast } from './ui.js';

const SAMPLE = 'Trust in the LORD with all your heart, and do not lean on your own understanding.';

function sel(key, label, options, help = '') {
  const v = store.settings[key];
  return `<label class="srow"><div><span>${label}</span>${help ? `<small>${help}</small>` : ''}</div>
    <select data-k="${key}">${options.map(([val, l]) => `<option value="${val}"${String(val) === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
}
function tog(key, label, help = '') {
  return `<label class="srow"><div><span>${label}</span>${help ? `<small>${help}</small>` : ''}</div>
    <input type="checkbox" class="switch" data-k="${key}" ${store.settings[key] ? 'checked' : ''}></label>`;
}
function num(key, label, min, max, step = 1, unit = '', help = '') {
  return `<label class="srow"><div><span>${label}</span>${help ? `<small>${help}</small>` : ''}</div>
    <div class="stepper"><button type="button" data-dec="${key}">−</button><output data-o="${key}">${store.settings[key]}${unit}</output><button type="button" data-inc="${key}">+</button></div>
    <input type="hidden" data-k="${key}" data-min="${min}" data-max="${max}" data-step="${step}" data-unit="${unit}" value="${store.settings[key]}"></label>`;
}

export function renderSettings(el) {
  const s = store.settings;
  const sampleWords = tokenize(SAMPLE);
  el.innerHTML = `
  ${topbar({ title: 'Settings' })}
  <main class="page settings">
    <div class="preview-box">
      <div class="pref">Proverbs 3:5</div>
      <div class="verse hs-${s.hiddenStyle}" id="sample">${sampleWords.map((w, i) => `<span class="w ${i < 4 ? 'ok' : i === 4 ? 'miss' : i === 5 ? 'cur' : 'hid'}">${esc(w.text)}</span>${w.sep ? ' ' : ''}`).join('')}</div>
    </div>

    <div class="sgroup"><div class="sg-h">Appearance</div>
      ${sel('theme', 'Theme', [['auto', 'Automatic (Vellum / Night Ink)'], ...Object.entries(THEMES)])}
      ${sel('font', 'Font', Object.entries(FONTS).map(([k, v]) => [k, v[0]]))}
      ${num('fontSize', 'Verse text size', 14, 26, 1, 'px')}
      ${sel('lineHeight', 'Line spacing', [[1.45, 'Tight'], [1.6, 'Snug'], [1.7, 'Normal'], [1.85, 'Relaxed'], [2.05, 'Airy']])}
      ${sel('hiddenStyle', 'Hidden words', [['underline', 'Underlined blanks'], ['dots', 'Dotted blanks'], ['blank', 'Fully blank']], 'Hidden words keep their exact width, so the text never moves.')}
      ${tog('showReference', 'Show reference while typing')}
      ${tog('showCursor', 'Highlight current word')}
      ${tog('showProgressBar', 'Session progress bar')}
      ${sel('weekStart', 'Week starts', [[0, 'Sunday'], [1, 'Monday']], 'Used by the activity calendar.')}
    </div>

    <div class="sgroup"><div class="sg-h">Accuracy</div>
      ${num('mistakesShort', 'Misses allowed', 0, 5, 1, '', 'Per verse, and still counted as correct.')}
      ${num('mistakesLong', 'Misses allowed, long verses', 0, 8)}
      ${num('longVerseWords', 'Long verse starts at', 10, 80, 5, ' words')}
      ${tog('step1Strict', 'Grade step 1 too', 'Off: step 1 always passes since every word is visible.')}
      ${sel('wrongLetter', 'On a wrong letter', [['reveal', 'Reveal word and move on'], ['stay', 'Stay until I type it right']])}
    </div>

    <div class="sgroup"><div class="sg-h">Learning steps</div>
      ${sel('step2Pattern', 'Step 2 hides', [['alternate', 'Every other word'], ['random', 'Random words']])}
      ${num('step2Percent', 'Random hide amount', 20, 90, 10, '%', 'Only for random hiding.')}
      ${tog('autoAdvance', 'Go to next step automatically')}
      ${num('autoAdvanceDelay', 'Auto-advance delay', 300, 3000, 100, 'ms')}
      ${tog('showHeatmapAfter', 'Show heatmap after a failed attempt')}
      ${tog('vibrate', 'Vibrate on miss', 'Android only; iOS browsers ignore it.')}
      ${tog('sound', 'Sound on miss')}
    </div>

    <div class="sgroup"><div class="sg-h">Review schedule</div>
      ${num('reviewLimit', 'Max reviews per session', 5, 500, 5)}
      ${sel('reviewOrder', 'Review order', [['due', 'Most overdue first'], ['random', 'Shuffled'], ['canonical', 'Bible order'], ['collection', 'Collection order']])}
      ${num('firstInterval', 'First interval', 1, 7, 1, 'd')}
      ${num('secondInterval', 'Second interval', 1, 14, 1, 'd')}
      ${sel('intervalModifier', 'Interval growth', [[0.6, 'Gentle (×0.6)'], [0.8, 'Slower (×0.8)'], [1, 'Normal'], [1.25, 'Faster (×1.25)'], [1.5, 'Aggressive (×1.5)']])}
      ${num('maxInterval', 'Longest interval', 14, 730, 7, 'd')}
      ${sel('failAction', 'When a review fails', [['relapse', 'Review again tomorrow'], ['relearn', 'Send back to step 3']])}
      ${tog('requeueFailed', 'Retry failed verses at end of session')}
      ${tog('fuzz', 'Spread reviews slightly', 'Adds ±5% so verses don’t bunch up on one day.')}
    </div>

    <div class="sgroup"><div class="sg-h">Data</div>
      <div class="srow"><div><span>Sync</span><small>${pendingCount() ? `${pendingCount()} change(s) waiting` : 'Everything saved'}</small></div><button class="btn ghost sm" data-act="sync">Sync now</button></div>
      <div class="srow"><div><span>Export</span><small>Download all verses and history as JSON</small></div><button class="btn ghost sm" data-act="export">Export</button></div>
      <div class="srow"><div><span>Import</span><small>Add from an export file</small></div><label class="btn ghost sm">Import<input type="file" accept="application/json" data-act="import" hidden></label></div>
      <div class="srow"><div><span>App version</span><small>Clears the saved copy and loads the newest</small></div><button class="btn ghost sm" data-act="refresh">Reload latest</button></div>
      <div class="srow"><div><span>Restore defaults</span><small>Settings only; verses untouched</small></div><button class="btn ghost sm" data-act="defaults">Reset</button></div>
      <div class="srow"><div><span>Signed in as</span><small>${esc((store.user?.email || '').split('@')[0])}</small></div><button class="btn ghost sm danger" data-act="signout">Sign out</button></div>
    </div>
  </main>`;

  const set = (k, raw) => {
    const d = DEFAULTS[k];
    const val = typeof d === 'number' ? Number(raw) : typeof d === 'boolean' ? !!raw : raw;
    updateSettings({ [k]: val });
    applyAppearance(store.settings);
    if (k === 'hiddenStyle') el.querySelector('#sample').className = `verse hs-${val}`;
  };
  el.querySelectorAll('select[data-k]').forEach((x) => x.onchange = () => set(x.dataset.k, x.value));
  el.querySelectorAll('input.switch[data-k]').forEach((x) => x.onchange = () => set(x.dataset.k, x.checked));
  const bump = (k, dir) => {
    const inp = el.querySelector(`input[type=hidden][data-k="${k}"]`);
    const step = +inp.dataset.step, min = +inp.dataset.min, max = +inp.dataset.max;
    const v = Math.max(min, Math.min(max, Math.round((+inp.value + dir * step) * 100) / 100));
    inp.value = v;
    el.querySelector(`output[data-o="${k}"]`).textContent = v + inp.dataset.unit;
    set(k, v);
  };
  el.querySelectorAll('[data-inc]').forEach((b) => b.onclick = () => bump(b.dataset.inc, 1));
  el.querySelectorAll('[data-dec]').forEach((b) => b.onclick = () => bump(b.dataset.dec, -1));

  el.querySelector('[data-act="sync"]').onclick = async () => { await flush(); toast(pendingCount() ? 'Still offline; will retry' : 'Synced'); renderSettings(el); };
  el.querySelector('[data-act="export"]').onclick = () => {
    const blob = new Blob([JSON.stringify(exportData(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bible-memory-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  el.querySelector('[data-act="import"]').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!confirm(`Import ${data.verses?.length || 0} verses and ${data.attempts?.length || 0} attempts? They are added alongside what you have.`)) return;
      importData(data);
      toast('Imported');
    } catch (err) { toast('Could not read that file'); }
  };
  el.querySelector('[data-act="refresh"]').onclick = async () => {
    try {
      const regs = await navigator.serviceWorker?.getRegistrations();
      await Promise.all((regs || []).map((r) => r.unregister()));
      await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
    } catch {}
    location.reload();
  };
  el.querySelector('[data-act="defaults"]').onclick = () => {
    if (!confirm('Restore all settings to defaults?')) return;
    updateSettings({ ...DEFAULTS });
    applyAppearance(store.settings);
    renderSettings(el);
  };
  el.querySelector('[data-act="signout"]').onclick = async () => {
    if (!confirm('Sign out on this device?')) return;
    await signOut();
    location.hash = '#/';
    location.reload();
  };
}
