// Module worker that runs engine jobs (generation, placement classification,
// tier profiles) off the main thread.
import { runJob, type Job } from './jobs';

export interface WorkerRequest {
  id: number;
  job: Job;
}

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (msg: unknown) => void;
};

ctx.onmessage = (e) => {
  const { id, job } = e.data;
  try {
    ctx.postMessage({ id, ok: true, value: runJob(job) });
  } catch (err) {
    ctx.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
