// Tokenizing verses into typeable words, and parsing references.

export const BOOKS = [
  ['Genesis', 'Gen', 50], ['Exodus', 'Ex', 40], ['Leviticus', 'Lev', 27], ['Numbers', 'Num', 36], ['Deuteronomy', 'Deut', 34],
  ['Joshua', 'Josh', 24], ['Judges', 'Judg', 21], ['Ruth', 'Ruth', 4], ['1 Samuel', '1Sam', 31], ['2 Samuel', '2Sam', 24],
  ['1 Kings', '1Kgs', 22], ['2 Kings', '2Kgs', 25], ['1 Chronicles', '1Chr', 29], ['2 Chronicles', '2Chr', 36], ['Ezra', 'Ezra', 10],
  ['Nehemiah', 'Neh', 13], ['Esther', 'Esth', 10], ['Job', 'Job', 42], ['Psalms', 'Ps', 150], ['Proverbs', 'Prov', 31],
  ['Ecclesiastes', 'Eccl', 12], ['Song of Solomon', 'Song', 8], ['Isaiah', 'Isa', 66], ['Jeremiah', 'Jer', 52], ['Lamentations', 'Lam', 5],
  ['Ezekiel', 'Ezek', 48], ['Daniel', 'Dan', 12], ['Hosea', 'Hos', 14], ['Joel', 'Joel', 3], ['Amos', 'Amos', 9],
  ['Obadiah', 'Obad', 1], ['Jonah', 'Jonah', 4], ['Micah', 'Mic', 7], ['Nahum', 'Nah', 3], ['Habakkuk', 'Hab', 3],
  ['Zephaniah', 'Zeph', 3], ['Haggai', 'Hag', 2], ['Zechariah', 'Zech', 14], ['Malachi', 'Mal', 4],
  ['Matthew', 'Matt', 28], ['Mark', 'Mark', 16], ['Luke', 'Luke', 24], ['John', 'John', 21], ['Acts', 'Acts', 28],
  ['Romans', 'Rom', 16], ['1 Corinthians', '1Cor', 16], ['2 Corinthians', '2Cor', 13], ['Galatians', 'Gal', 6], ['Ephesians', 'Eph', 6],
  ['Philippians', 'Phil', 4], ['Colossians', 'Col', 4], ['1 Thessalonians', '1Thess', 5], ['2 Thessalonians', '2Thess', 3], ['1 Timothy', '1Tim', 6],
  ['2 Timothy', '2Tim', 4], ['Titus', 'Titus', 3], ['Philemon', 'Phlm', 1], ['Hebrews', 'Heb', 13], ['James', 'Jas', 5],
  ['1 Peter', '1Pet', 5], ['2 Peter', '2Pet', 3], ['1 John', '1John', 5], ['2 John', '2John', 1], ['3 John', '3John', 1],
  ['Jude', 'Jude', 1], ['Revelation', 'Rev', 22],
];

const ALIASES = {
  psalm: 'Psalms', ps: 'Psalms', psa: 'Psalms', song: 'Song of Solomon', songs: 'Song of Solomon', 'song of songs': 'Song of Solomon',
  revelations: 'Revelation', rev: 'Revelation', jn: 'John', mt: 'Matthew', mk: 'Mark', lk: 'Luke', phil: 'Philippians',
  php: 'Philippians', jas: 'James', heb: 'Hebrews', prov: 'Proverbs', pr: 'Proverbs', eccles: 'Ecclesiastes', qoh: 'Ecclesiastes',
};

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

export function canonicalBook(name) {
  const n = norm(name).replace(/^(i{1,3}) /, (m, r) => r.length + ' ').replace(/^(\d)\s*/, '$1 ');
  if (ALIASES[n]) return ALIASES[n];
  for (const [full, abbr] of BOOKS) {
    if (norm(full) === n || norm(abbr).replace(/^(\d)/, '$1 ') === n || norm(abbr) === n.replace(/ /g, '')) return full;
  }
  // prefix match (e.g. "Matt", "Deut", "1 Cor")
  const hits = BOOKS.filter(([full]) => norm(full).startsWith(n));
  if (n.length >= 2 && hits.length >= 1) return hits[0][0];
  return null;
}

export function bookIndex(book) {
  return BOOKS.findIndex(([full]) => full === book);
}

// "John 3:16", "1 Cor 13:4-7", "Psalm 23"  ->  {book, chapter, verse, verseEnd}
export function parseReference(ref) {
  const m = String(ref).trim().match(/^((?:[1-3]|i{1,3})?\s*[A-Za-z][A-Za-z. ]*?)\.?\s*(\d+)(?:\s*[:.]\s*(\d+)(?:\s*[-–—]\s*(\d+))?)?\s*$/i);
  if (!m) return null;
  const book = canonicalBook(m[1]);
  if (!book) return null;
  return { book, chapter: +m[2], verse: m[3] ? +m[3] : null, verseEnd: m[4] ? +m[4] : null };
}

export function formatReference(book, chapter, verse) {
  return verse ? `${book} ${chapter}:${verse}` : `${book} ${chapter}`;
}

// Strip diacritics and give the first letter/digit that should be typed for a word.
function keyOf(word) {
  const plain = word.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const m = plain.match(/[A-Za-z0-9]/);
  return m ? m[0].toLowerCase() : null;
}

// Returns [{text, sep, key}] where text+sep concatenated reproduce the verse.
// Punctuation-only fragments attach to the neighbouring word; em-dashes split words.
export function tokenize(text) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  const raw = [];
  const re = /[^\s—]+—*|—+/g;
  let m;
  while ((m = re.exec(clean))) {
    const end = m.index + m[0].length;
    const sep = clean[end] === ' ' ? ' ' : '';
    raw.push({ text: m[0], sep });
  }
  const words = [];
  for (const t of raw) {
    const key = keyOf(t.text);
    if (!key) {
      if (words.length) { const w = words[words.length - 1]; w.text += w.sep + t.text; w.sep = t.sep; }
      else raw._lead = (raw._lead || '') + t.text + t.sep;
      continue;
    }
    if (raw._lead) { t.text = raw._lead + t.text; raw._lead = ''; }
    words.push({ text: t.text, sep: t.sep, key });
  }
  return words;
}

export function wordCount(text) { return tokenize(text).length; }

// Split a pasted passage like "28 And we know... 29 For those..." into verses.
// Returns [{verse, text}] or null if no numbering is found.
export function splitNumberedPassage(text, startVerse) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  const out = [];
  let expected = startVerse;
  let pos = 0;
  const first = t.match(/^\[?(\d{1,3})\]?\s+/);
  if (!first) return null;
  if (expected == null) expected = +first[1];
  if (+first[1] !== expected) return null;
  pos = first[0].length;
  let curVerse = expected;
  let curStart = pos;
  while (true) {
    const next = curVerse + 1;
    const re = new RegExp(`(?:^|\\s)\\[?${next}\\]?\\s+`, 'g');
    re.lastIndex = curStart;
    const mm = re.exec(t);
    if (!mm) break;
    out.push({ verse: curVerse, text: t.slice(curStart, mm.index).trim() });
    curVerse = next;
    curStart = mm.index + mm[0].length;
  }
  out.push({ verse: curVerse, text: t.slice(curStart).trim() });
  return out.filter((v) => v.text);
}

// Parse lines like "John 3:16 For God so loved..." -> [{reference, text}]
export function parseReferenceLines(text) {
  const lines = String(text).split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const out = [];
  for (const line of lines) {
    const m = line.match(/^((?:[1-3]\s*)?[A-Za-z][A-Za-z. ]*?\s*\d+\s*:\s*\d+)\s*[-–—:]?\s+(.+)$/);
    if (m && parseReference(m[1])) out.push({ reference: m[1].replace(/\s+/g, ' '), text: m[2] });
    else if (out.length) out[out.length - 1].text += ' ' + line;
    else return null;
  }
  return out;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
