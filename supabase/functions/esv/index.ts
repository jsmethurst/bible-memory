// Looks up ESV text for the signed-in user by reading the passage page on esv.org.
import { parseEsvPage } from './parse.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  let query = '';
  let verseNumbers = false;
  try {
    const body = await req.json();
    query = String(body.query ?? '').trim().replace(/\s+/g, ' ');
    verseNumbers = !!body.verseNumbers;
  } catch { return json({ error: 'Bad request' }, 400); }
  if (!query || query.length > 80 || /[\/?#\\]/.test(query)) return json({ error: 'Enter a reference like John 3:16.' }, 400);

  const url = `https://www.esv.org/${encodeURIComponent(query).replace(/%20/g, '+').replace(/%3A/gi, ':').replace(/%2C/gi, ',')}/`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { 'User-Agent': 'bible-memory-personal/1.0', Accept: 'text/html' } });
  } catch { return json({ error: 'Could not reach esv.org.' }, 502); }
  if (!res.ok) return json({ error: `esv.org returned ${res.status}.` }, 502);

  try {
    const p = parseEsvPage(await res.text(), verseNumbers);
    return json({ text: p.text, canonical: p.canonical });
  } catch (e) {
    const m = (e as Error).message;
    if (m === 'multi_chapter') return json({ error: 'Fetch one chapter at a time for pasted passages.' }, 400);
    return json({ error: `No passage found for "${query}".` }, 404);
  }
});
