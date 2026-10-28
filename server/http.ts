// The leaderboard over HTTP: POST /api/join, POST /api/sync and GET /api/board?date=, each answering
// JSON, with { error } and a status when a request is turned down. The functions in api/ (bundled
// from server/entries) and the dev server both call handle.
import { boards, join, Refusal, sync } from './leaderboard';
import type { Store } from './store';

/** Bigger bodies are turned down: a device's stats are a few tens of kilobytes. */
const MAX_BODY = 400_000;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

const bearer = (req: Request) => req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || null;

async function bodyOf(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.length > MAX_BODY) throw new Refusal(413, 'That is more than the leaderboard keeps.');
  try {
    return JSON.parse(text);
  } catch {
    throw new Refusal(400, 'That request could not be read.');
  }
}

export async function handle(req: Request, store: Store | null): Promise<Response> {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '');
  try {
    if (!store) throw new Refusal(503, 'The leaderboard is not set up yet.');
    if (route === 'join' && req.method === 'POST') return json(await join(store, await bodyOf(req)));
    if (route === 'sync' && req.method === 'POST') return json(await sync(store, bearer(req), await bodyOf(req)));
    if (route === 'board' && req.method === 'GET') return json(await boards(store, url.searchParams.get('date') ?? '', bearer(req)));
    throw new Refusal(404, 'Not found.');
  } catch (e) {
    if (e instanceof Refusal) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'The leaderboard could not answer. Try again in a moment.' }, 500);
  }
}
