// Async front door for heavy engine work. Generation runs on a module Web
// Worker with request ids; without Worker (node, tests) it runs inline.
import { generate } from './index';
import type { GeneratedPuzzle, GenerateOptions } from './types';

interface WorkerReply {
  id: number;
  ok: boolean;
  puzzle?: GeneratedPuzzle;
  error?: string;
}

type Pending = { resolve: (p: GeneratedPuzzle) => void; reject: (e: Error) => void; opts: GenerateOptions };

let worker: Worker | null = null;
let broken = false;
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker | null {
  if (broken || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  } catch {
    broken = true;
    return null;
  }
  worker.onmessage = (e: MessageEvent<WorkerReply>) => {
    const job = pending.get(e.data.id);
    if (!job) return;
    pending.delete(e.data.id);
    if (e.data.ok && e.data.puzzle) job.resolve(e.data.puzzle);
    else job.reject(new Error(e.data.error ?? 'generation failed'));
  };
  worker.onerror = () => {
    // The worker could not start or crashed: finish the queued jobs inline.
    broken = true;
    worker?.terminate();
    worker = null;
    const jobs = [...pending.values()];
    pending.clear();
    for (const job of jobs) {
      try {
        job.resolve(generate(job.opts));
      } catch (err) {
        job.reject(err instanceof Error ? err : new Error(String(err)));
      }
    }
  };
  return worker;
}

export async function generateAsync(opts: GenerateOptions): Promise<GeneratedPuzzle> {
  const w = getWorker();
  if (!w) return generate(opts);
  const id = nextId++;
  return new Promise<GeneratedPuzzle>((resolve, reject) => {
    pending.set(id, { resolve, reject, opts });
    w.postMessage({ id, opts });
  });
}
