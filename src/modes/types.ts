// Mode registry contract. Additive changes only.
import type { ComponentType } from 'react';
import type { ClueKind } from '../engine/types';
import type { ModeId } from '../game/types';

export interface ModeEntry {
  id: ModeId;
  name: string;
  /** One line describing the mode. The menu shows the name, and gives this line to screen readers. */
  blurb: string;
  /** Full-screen mode UI. onExit returns to the previous screen. */
  Screen: ComponentType<{ onExit: () => void }>;
}

/** What the Learn mode exposes to the rest of the app. */
export interface LearnApi {
  /** True once the player finished the lesson for this rule. */
  isLessonDone(kind: ClueKind | 'basics'): boolean;
  /** Opens the lesson for a rule (used by the "new rule" prompt on rule chips). */
  openLesson(kind: ClueKind | 'basics'): void;
}
