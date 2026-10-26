// Async front door for heavy engine work. Jobs run on module Web Workers
// with request ids: one worker makes boards (and their tier profiles), a
// second classifies placements, so a placement never waits behind a board
// being made. Without Worker (node, tests) a job runs inline, and the
// detector behind it loads only then: this file is in the first paint, and
// the worker path never needs the detector on the main thread.
import type { Job } from './jobs';
import type { Classified, Profile } from './ladder';
import type { Digit, GeneratedPuzzle, GenerateOptions, Puzzle } from './types';

interface WorkerReply {
  id: number;
  ok: boolean;
  value?: unknown;
  error?: string;
}

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; job: Job };

let nextId = 1;

const failure = (err: unknown): Error => (err instanceof Error ? err : new Error(String(err)));

/** Runs a job on this thread. The jobs module, with the detector in it, is fetched on first use. */
async function runInline(job: Job): Promise<unknown> {
  const { runJob } = await import('./jobs');
  return runJob(job);
}

class Lane {
  private worker: Worker | null = null;
  private broken = false;
  private readonly pending = new Map<number, Pending>();

  private get(): Worker | null {
    if (this.broken || typeof Worker === 'undefined') return null;
    if (this.worker) return this.worker;
    let w: Worker;
    try {
      w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    } catch {
      this.broken = true;
      return null;
    }
    w.onmessage = (e: MessageEvent<WorkerReply>) => {
      const job = this.pending.get(e.data.id);
      if (!job) return;
      this.pending.delete(e.data.id);
      if (e.data.ok) job.resolve(e.data.value);
      else job.reject(new Error(e.data.error ?? 'engine job failed'));
    };
    w.onerror = () => {
      // The worker could not start or crashed: finish the queued jobs inline.
      this.broken = true;
      w.terminate();
      this.worker = null;
      const jobs = [...this.pending.values()];
      this.pending.clear();
      for (const job of jobs) runInline(job.job).then(job.resolve, (err) => job.reject(failure(err)));
    };
    this.worker = w;
    return w;
  }

  run<T>(job: Job): Promise<T> {
    const w = this.get();
    if (!w) return runInline(job).then((v) => v as T, (err) => Promise.reject(failure(err)));
    const id = nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, job });
      w.postMessage({ id, job });
    });
  }
}

const boards = new Lane();
const placements = new Lane();

export async function generateAsync(opts: GenerateOptions): Promise<GeneratedPuzzle> {
  return boards.run<GeneratedPuzzle>({ kind: 'generate', opts });
}

/** classify() from ladder.ts, on the placement worker. */
export function classifyJob(p: Puzzle, values: Digit[], cell: number, digit: Digit): Promise<Classified> {
  return placements.run<Classified>({ kind: 'classify', p, values, cell, digit });
}

/** profile() from ladder.ts, on the board worker, as part of making a board. */
export function profileJob(p: Puzzle): Promise<Profile> {
  return boards.run<Profile>({ kind: 'profile', p });
}
