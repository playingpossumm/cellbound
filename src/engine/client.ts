// Async front door for heavy engine work. STUB: runs on the main thread.
// The engine agent moves this onto a Web Worker and keeps the signatures.
import { generate } from './index';
import type { GeneratedPuzzle, GenerateOptions } from './types';

export async function generateAsync(opts: GenerateOptions): Promise<GeneratedPuzzle> {
  return generate(opts);
}
