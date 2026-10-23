// Extra modes owned by the modes agent (Run and Learn). The app shell lists these
// after Daily, Fog and Free play.
import { isLessonDone, openLesson } from './learn/store';
import { LearnScreen, RunScreen } from './screens';
import type { LearnApi, ModeEntry } from './types';

export const extraModes: ModeEntry[] = [
  {
    id: 'run',
    name: 'Run',
    blurb: 'Five boards, three hearts, a card between each. A new seeded run every day.',
    Screen: RunScreen,
  },
  {
    id: 'learn',
    name: 'Learn',
    blurb: 'Short lessons, one rule at a time, each with a small practice puzzle.',
    Screen: LearnScreen,
  },
];

export const learn: LearnApi = { isLessonDone, openLesson };

// Additive exports for the app shell, see the report: subscribe to lesson requests then show the Learn
// screen, and re-render a rule chip when its lesson is finished.
export { onLessonRequest, useLessonDone } from './learn/store';
