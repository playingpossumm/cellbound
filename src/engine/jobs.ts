// The heavy engine jobs the worker runs, shared by the worker and by the
// client's inline fallback so both give the same answer.
import { generate } from './index';
import { classify, classifyHardest, profile } from './ladder';
import type { Digit, GenerateOptions, Puzzle } from './types';

export type Job =
  | { kind: 'generate'; opts: GenerateOptions }
  | { kind: 'classify'; p: Puzzle; values: Digit[]; cell: number; digit: Digit }
  | { kind: 'hardest'; p: Puzzle; values: Digit[]; cell: number; digit: Digit }
  | { kind: 'profile'; p: Puzzle };

export function runJob(job: Job): unknown {
  switch (job.kind) {
    case 'generate':
      return generate(job.opts);
    case 'classify':
      return classify(job.p, job.values, job.cell, job.digit);
    case 'hardest':
      return classifyHardest(job.p, job.values, job.cell, job.digit);
    case 'profile':
      return profile(job.p);
  }
}
