// Extracts verse text from an esv.org passage page.
// The page lists whole chapters; the passage you asked for is named in two hidden inputs
// (js-passage = chapter, js-focus-passage = the exact verses), and each verse is a span
// with data-ref="BBCCCVVV" whose words sit in <u> elements.

const decode = (s: string) => s
  .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

export interface Passage { text: string; canonical: string; verses: number }

export function parseEsvPage(html: string, verseNumbers: boolean): Passage {
  const passageM = html.match(/js-passage"[^>]*value="([^"]*)"/);
  const focusM = html.match(/js-focus-passage"[^>]*value="([^"]*)"/);
  if (!passageM || !focusM) throw new Error('not_found');
  const passage = decode(passageM[1]);
  const focus = decode(focusM[1]);
  const book = passage.replace(/\s*\d+$/, '');

  let inRange: (c: number, v: number) => boolean;
  let multiChapter = false;
  const vr = focus.match(/(\d+):(\d+)(?:\s*[–-]\s*(?:(\d+):)?(\d+))?\s*$/);
  const cr = focus.match(/(\d+)(?:\s*[–-]\s*(\d+))?\s*$/);
  if (vr) {
    const c1 = +vr[1], v1 = +vr[2];
    const c2 = vr[4] ? (vr[3] ? +vr[3] : c1) : c1;
    const v2 = vr[4] ? +vr[4] : v1;
    multiChapter = c2 !== c1;
    inRange = (c, v) => (c > c1 || (c === c1 && v >= v1)) && (c < c2 || (c === c2 && v <= v2));
  } else if (cr) {
    const c1 = +cr[1], c2 = cr[2] ? +cr[2] : c1;
    multiChapter = c2 !== c1;
    inRange = (c) => c >= c1 && c <= c2;
  } else throw new Error('not_found');

  // Poetry repeats a verse's span once per line, so gather by verse and join.
  const byVerse = new Map<string, { c: number; v: number; parts: string[] }>();
  // Chapter sections contain nested <section class="line-group"> blocks in poetry, so each chapter
  // runs from its own opening tag to the start of the next chapter (or the end of the article).
  const articleEnd = html.indexOf('</article>');
  const starts = [...html.matchAll(/<section[^>]*data-reference="([^"]*)"[^>]*>/g)];
  for (let k = 0; k < starts.length; k++) {
    const name = decode(starts[k][1]);
    if (name.replace(/\s*\d+$/, '') !== book) continue;
    const from = starts[k].index! + starts[k][0].length;
    const to = k + 1 < starts.length ? starts[k + 1].index! : (articleEnd > from ? articleEnd : html.length);
    const body = html.slice(from, to);
    const marks = [...body.matchAll(/<span class="verse" data-ref="(\d{8})"[^>]*>/g)];
    marks.forEach((mk, i) => {
      const ref = mk[1];
      const c = +ref.slice(2, 5), v = +ref.slice(5, 8);
      if (!inRange(c, v)) return;
      let chunk = body.slice(mk.index! + mk[0].length, i + 1 < marks.length ? marks[i + 1].index : body.length);
      chunk = chunk.replace(/<sup\b[\s\S]*?<\/sup>/g, '').replace(/<h[2-6]\b[\s\S]*?<\/h[2-6]>/g, '');
      const words = [...chunk.matchAll(/<u\b[^>]*>([\s\S]*?)<\/u>/g)].map((u) => u[1].replace(/<[^>]+>/g, '')).join('');
      const text = decode(words).replace(/\s+/g, ' ').trim();
      if (!text) return;
      const key = `${c}:${v}`;
      const e = byVerse.get(key) ?? { c, v, parts: [] };
      e.parts.push(text);
      byVerse.set(key, e);
    });
  }
  const verses = [...byVerse.values()].sort((a, b) => a.c - b.c || a.v - b.v);
  if (!verses.length) throw new Error('not_found');
  if (verseNumbers && multiChapter) throw new Error('multi_chapter');
  const text = verses.map((e) => (verseNumbers ? `[${e.v}] ` : '') + e.parts.join(' ')).join(' ');
  return { text, canonical: focus, verses: verses.length };
}
