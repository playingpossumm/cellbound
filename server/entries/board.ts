// GET /api/board?date=: a Vercel function, bundled into api/board.js by `npm run build:api`.
import { handle } from '../http';
import { storeFromEnv } from '../store';

export const GET = (req: Request) => handle(req, storeFromEnv(process.env));
