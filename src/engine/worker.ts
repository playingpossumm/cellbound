// Module worker that runs generation off the main thread.
import { generate } from './index';
import type { GenerateOptions } from './types';

export interface WorkerRequest {
  id: number;
  opts: GenerateOptions;
}

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (msg: unknown) => void;
};

ctx.onmessage = (e) => {
  const { id, opts } = e.data;
  try {
    ctx.postMessage({ id, ok: true, puzzle: generate(opts) });
  } catch (err) {
    ctx.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
