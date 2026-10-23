// Sharing a result: Web Share API when present, clipboard otherwise.
import type { Difficulty, Size } from '../engine/types';
import type { ClueKind } from '../engine/types';

export async function shareResult(text: string, url: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({ text, url });
      return 'shared';
    }
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return 'failed';
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export interface FreeOptions {
  size: Size;
  rules: ClueKind[];
  difficulty: Difficulty;
  seed: string;
}

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

const KINDS: ClueKind[] = ['thermo', 'arrow', 'cage', 'renban', 'whisper', 'kropki', 'xv', 'diagonal', 'antiKnight'];

export function encodeFree(o: FreeOptions): string {
  return toBase64Url(JSON.stringify({ s: o.size, r: o.rules, d: o.difficulty, k: o.seed }));
}

export function decodeFree(code: string): FreeOptions | null {
  try {
    const v = JSON.parse(fromBase64Url(code)) as { s: unknown; r: unknown; d: unknown; k: unknown };
    const size = v.s === 6 || v.s === 9 ? v.s : null;
    const difficulty = typeof v.d === 'number' && v.d >= 1 && v.d <= 5 ? (Math.round(v.d) as Difficulty) : null;
    const rules = Array.isArray(v.r) ? (v.r.filter((k) => KINDS.includes(k as ClueKind)) as ClueKind[]) : null;
    const seed = typeof v.k === 'string' && v.k.length > 0 && v.k.length < 80 ? v.k : null;
    if (!size || !difficulty || !rules || !seed) return null;
    return { size, rules, difficulty, seed };
  } catch {
    return null;
  }
}

/** Base URL of the app, without query or hash. */
export function appUrl(): string {
  if (typeof location === 'undefined') return '';
  return `${location.origin}${location.pathname}`;
}
