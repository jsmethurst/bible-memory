// User settings: defaults, persistence and applying appearance.

export const DEFAULTS = {
  // appearance
  theme: 'auto',            // auto | vellum | ink | olive | slate | oled | rose
  font: 'plex',             // plex | jetbrains | courier | system
  fontSize: 19,
  lineHeight: 1.7,
  hiddenStyle: 'underline', // underline | blank | dots
  showReference: true,
  showCursor: true,
  showProgressBar: true,

  // practice
  mistakesShort: 1,
  mistakesLong: 2,
  longVerseWords: 30,
  wrongLetter: 'reveal',    // reveal | stay
  step2Pattern: 'alternate',// alternate | random
  step2Percent: 50,
  step1Strict: false,       // require accuracy on step 1
  autoAdvance: true,        // go straight to the next step on pass
  autoAdvanceDelay: 900,
  showHeatmapAfter: true,
  vibrate: true,
  sound: false,

  // review
  reviewLimit: 50,
  reviewOrder: 'due',       // due | random | canonical | collection
  firstInterval: 1,
  secondInterval: 3,
  intervalModifier: 1.0,
  maxInterval: 180,
  startEase: 2.5,
  failAction: 'relapse',    // relapse (review again tomorrow) | relearn (back to step 3)
  requeueFailed: true,
  fuzz: true,

  weekStart: 0,             // 0 Sunday, 1 Monday
};

export const THEMES = {
  vellum: 'Vellum', ink: 'Night Ink', olive: 'Olive Grove', slate: 'Slate', rose: 'Dusk Rose', oled: 'Midnight',
};

export const FONTS = {
  plex: ['IBM Plex Mono', "'IBM Plex Mono', ui-monospace, Menlo, monospace"],
  jetbrains: ['JetBrains Mono', "'JetBrains Mono', ui-monospace, Menlo, monospace"],
  courier: ['Courier Prime', "'Courier Prime', 'Courier New', monospace"],
  system: ['System mono', "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"],
};

const LS_KEY = 'bm.settings';

export function loadLocalSettings() {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(LS_KEY)) || {}) }; }
  catch { return { ...DEFAULTS }; }
}

export function saveLocalSettings(s) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {}
}

export function applyAppearance(s) {
  const root = document.documentElement;
  let theme = s.theme;
  if (theme === 'auto') theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'ink' : 'vellum';
  root.dataset.theme = theme;
  root.style.setProperty('--font-mono', (FONTS[s.font] || FONTS.plex)[1]);
  root.style.setProperty('--verse-size', s.fontSize + 'px');
  root.style.setProperty('--verse-lh', String(s.lineHeight));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(root).getPropertyValue('--bg').trim() || '#f4efe6';
}

matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
  const s = loadLocalSettings();
  if (s.theme === 'auto') applyAppearance(s);
});
