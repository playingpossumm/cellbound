// POST /api/sync: a Vercel function, bundled into api/sync.js by `npm run build:api`.
import { handle } from '../http';
import { storeFromEnv } from '../store';

export const POST = (req: Request) => handle(req, storeFromEnv(process.env));
