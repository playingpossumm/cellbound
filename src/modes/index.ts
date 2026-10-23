// The extra modes, Run and Learn. The app shell lists them in the menu after Daily.
import { lazy } from 'react';
import { isLessonDone, openLesson } from './learn/store';
import type { LearnApi, ModeEntry } from './types';

// Both screens load on first use, so the first paint carries only what the Daily needs.
// The service worker precaches their chunks, so they open offline too.
const RunScreen = lazy(() => import('./run/screen'));
const LearnScreen = lazy(() => import('./learn/screen'));

export const extraModes: ModeEntry[] = [
  {
    id: 'run',
    name: 'Run',
    blurb: 'Five boards, three hearts and a card between each, with a new daily run every day.',
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

// For the app shell: subscribe to lesson requests, and re-render a rule chip once its lesson is done.
export { onLessonRequest, useLessonDone } from './learn/store';
