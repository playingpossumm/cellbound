// Learn progress and the "open this lesson" request. A small zustand store, so the Learn
// screen and the app shell can both listen to it, and a versioned localStorage key.
import { create } from 'zustand';
import type { LessonId } from './lessons';

export const LEARN_KEY = 'cellbound:learn:v1';
/** A request older than this is stale: nobody was listening when it was made. */
export const REQUEST_TTL_MS = 10_000;

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
/** Lesson id to the time it was finished. */
export type DoneMap = Partial<Record<LessonId, number>>;

function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadDone(storage: StorageLike | null = browserStorage()): DoneMap {
  if (!storage) return {};
  try {
    const raw = storage.getItem(LEARN_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || (parsed as { v?: unknown }).v !== 1) return {};
    const done = (parsed as { done?: unknown }).done;
    if (typeof done !== 'object' || done === null) return {};
    const out: DoneMap = {};
    for (const [k, v] of Object.entries(done)) if (typeof v === 'number') out[k as LessonId] = v;
    return out;
  } catch {
    return {};
  }
}

export function saveDone(done: DoneMap, storage: StorageLike | null = browserStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(LEARN_KEY, JSON.stringify({ v: 1, done }));
    return true;
  } catch {
    return false;
  }
}

export interface LessonRequest {
  id: LessonId;
  at: number;
}

interface LearnStore {
  done: DoneMap;
  request: LessonRequest | null;
}

export const useLearnStore = create<LearnStore>(() => ({ done: loadDone(), request: null }));

export function isLessonDone(id: LessonId): boolean {
  return useLearnStore.getState().done[id] !== undefined;
}

export function markLessonDone(id: LessonId, now: number = Date.now()): void {
  const { done } = useLearnStore.getState();
  if (done[id] !== undefined) return;
  const next = { ...done, [id]: now };
  useLearnStore.setState({ done: next });
  saveDone(next);
}

/** Asks for a lesson to be opened. The shell then shows the Learn screen, which picks the request up. */
export function openLesson(id: LessonId, now: number = Date.now()): void {
  useLearnStore.setState({ request: { id, at: now } });
}

/** For the app shell: called each time a lesson is requested. Returns an unsubscribe function. */
export function onLessonRequest(listener: (id: LessonId) => void): () => void {
  return useLearnStore.subscribe((state, prev) => {
    if (state.request && state.request !== prev.request) listener(state.request.id);
  });
}

/** The pending request, if it is fresh, without clearing it. Safe to call during render. */
export function peekLessonRequest(now: number = Date.now()): LessonId | null {
  const { request } = useLearnStore.getState();
  return request && now - request.at <= REQUEST_TTL_MS ? request.id : null;
}

/** For shell components: true once the lesson is done, and re-renders when that changes. */
export function useLessonDone(id: LessonId): boolean {
  return useLearnStore((s) => s.done[id] !== undefined);
}

/** Takes the pending request, if it is fresh, and clears it. */
export function takeLessonRequest(now: number = Date.now()): LessonId | null {
  const { request } = useLearnStore.getState();
  if (!request) return null;
  useLearnStore.setState({ request: null });
  return now - request.at <= REQUEST_TTL_MS ? request.id : null;
}

/** Test helper. */
export function resetLearnStore(done: DoneMap = {}): void {
  useLearnStore.setState({ done, request: null });
}
