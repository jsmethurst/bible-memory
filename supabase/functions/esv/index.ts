// Fetches ESV text from api.esv.org on behalf of the signed-in user.
// The API key lives only in the ESV_API_KEY secret; it never reaches the browser.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const key = Deno.env.get('ESV_API_KEY');
  if (!key) return json({ error: 'The ESV_API_KEY secret has not been set yet.' }, 500);

  let query = '';
  let verseNumbers = false;
  try {
    const body = await req.json();
    query = String(body.query ?? '').trim();
    verseNumbers = !!body.verseNumbers;
  } catch { return json({ error: 'Bad request' }, 400); }
  if (!query || query.length > 200) return json({ error: 'Enter a reference first.' }, 400);

  const params = new URLSearchParams({
    q: query,
    'include-passage-references': 'false',
    'include-verse-numbers': String(verseNumbers),
    'include-first-verse-numbers': String(verseNumbers),
    'include-footnotes': 'false',
    'include-footnote-body': 'false',
    'include-headings': 'false',
    'include-short-copyright': 'false',
    'include-copyright': 'false',
    'include-passage-horizontal-lines': 'false',
    'include-heading-horizontal-lines': 'false',
    'indent-paragraphs': '0',
    'indent-poetry': 'false',
    'indent-declares': '0',
    'indent-psalm-doxology': '0',
    'line-length': '0',
  });

  const res = await fetch(`https://api.esv.org/v3/passage/text/?${params}`, {
    headers: { Authorization: `Token ${key}` },
  });
  if (!res.ok) {
    const msg = res.status === 401 || res.status === 403 ? 'The ESV API key was rejected.'
      : res.status === 429 ? 'ESV API rate limit reached. Try again shortly.' : `ESV API error (${res.status}).`;
    return json({ error: msg }, 502);
  }
  const data = await res.json();
  const text = (data.passages?.[0] ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return json({ error: `No passage found for "${query}".` }, 404);
  return json({ text, canonical: data.canonical ?? query });
});
