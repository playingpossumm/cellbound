// Extra modes owned by the modes agent (Run and Learn). STUB: empty until
// that agent lands. The app shell lists these after Daily, Fog and Free play.
import type { LearnApi, ModeEntry } from './types';

export const extraModes: ModeEntry[] = [];

export const learn: LearnApi = {
  isLessonDone: () => true,
  openLesson: () => undefined,
};
