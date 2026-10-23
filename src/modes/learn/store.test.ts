import { beforeEach, describe, expect, it } from 'vitest';
import { LEARN_KEY, REQUEST_TTL_MS, isLessonDone, loadDone, markLessonDone, onLessonRequest, openLesson, peekLessonRequest, resetLearnStore, saveDone, takeLessonRequest, type StorageLike } from './store';

function memory(): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}

describe('lesson progress', () => {
  beforeEach(() => resetLearnStore());

  it('starts with nothing done and remembers a finished lesson', () => {
    expect(isLessonDone('thermo')).toBe(false);
    markLessonDone('thermo', 5);
    expect(isLessonDone('thermo')).toBe(true);
    expect(isLessonDone('arrow')).toBe(false);
  });

  it('keeps the first finish time when a lesson is finished again', () => {
    markLessonDone('cage', 10);
    markLessonDone('cage', 99);
    expect(loadDone({ getItem: () => JSON.stringify({ v: 1, done: { cage: 10 } }), setItem: () => undefined })).toEqual({ cage: 10 });
  });

  it('saves under the versioned key and loads it back', () => {
    const m = memory();
    expect(LEARN_KEY).toBe('cellbound:learn:v1');
    expect(saveDone({ basics: 1, xv: 2 }, m)).toBe(true);
    expect(loadDone(m)).toEqual({ basics: 1, xv: 2 });
  });

  it('survives damaged data, other versions and missing storage', () => {
    const m = memory();
    m.data[LEARN_KEY] = 'nope';
    expect(loadDone(m)).toEqual({});
    m.data[LEARN_KEY] = JSON.stringify({ v: 2, done: { basics: 1 } });
    expect(loadDone(m)).toEqual({});
    m.data[LEARN_KEY] = JSON.stringify({ v: 1, done: { basics: 'yes', arrow: 3 } });
    expect(loadDone(m)).toEqual({ arrow: 3 });
    expect(loadDone(null)).toEqual({});
    expect(saveDone({}, null)).toBe(false);
    expect(
      saveDone({}, {
        getItem: () => null,
        setItem: () => {
          throw new Error('full');
        },
      }),
    ).toBe(false);
  });
});

describe('opening a lesson from elsewhere', () => {
  beforeEach(() => resetLearnStore());

  it('tells the shell, and hands the request to the Learn screen once', () => {
    const heard: string[] = [];
    const off = onLessonRequest((id) => heard.push(id));
    openLesson('whisper', 1000);
    expect(heard).toEqual(['whisper']);
    expect(takeLessonRequest(1500)).toBe('whisper');
    expect(takeLessonRequest(1500)).toBeNull();
    off();
    openLesson('kropki', 2000);
    expect(heard).toEqual(['whisper']);
  });

  it('tells the shell again for a repeat request', () => {
    const heard: string[] = [];
    const off = onLessonRequest((id) => heard.push(id));
    openLesson('xv', 1);
    takeLessonRequest(2);
    openLesson('xv', 3);
    expect(heard).toEqual(['xv', 'xv']);
    off();
  });

  it('can be read without being taken, so a double render does not lose it', () => {
    openLesson('renban', 1000);
    expect(peekLessonRequest(1100)).toBe('renban');
    expect(peekLessonRequest(1200)).toBe('renban');
    expect(takeLessonRequest(1300)).toBe('renban');
    expect(peekLessonRequest(1400)).toBeNull();
    openLesson('renban', 2000);
    expect(peekLessonRequest(2000 + REQUEST_TTL_MS + 1)).toBeNull();
  });

  it('drops a request nobody picked up in time', () => {
    openLesson('diagonal', 1000);
    expect(takeLessonRequest(1000 + REQUEST_TTL_MS + 1)).toBeNull();
  });

  it('is what the LearnApi exposes to the shell', async () => {
    const { learn } = await import('../index');
    expect(learn.isLessonDone('arrow')).toBe(false);
    markLessonDone('arrow');
    expect(learn.isLessonDone('arrow')).toBe(true);
    learn.openLesson('antiKnight');
    expect(takeLessonRequest()).toBe('antiKnight');
  });
});
