// POST /api/join: a Vercel function, bundled into api/join.js by `npm run build:api`.
import { handle } from '../http';
import { storeFromEnv } from '../store';

export const POST = (req: Request) => handle(req, storeFromEnv(process.env));
