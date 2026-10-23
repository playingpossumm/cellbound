// Shell services that screens and GameView reach through context: open the
// menu, switch screens. Mode screens can also dispatch a window event:
// window.dispatchEvent(new CustomEvent('cellbound:open', { detail: { screen: 'daily' } })).
import { createContext, useContext } from 'react';
import type { ClueKind } from '../engine/types';

export type ScreenId = 'daily' | 'fog' | 'free' | 'stats' | 'settings' | 'about' | `mode:${string}`;

export interface Shell {
  openMenu(): void;
  go(screen: ScreenId): void;
  /** Opens the Learn lesson for a rule, when the Learn mode is installed. */
  openLesson(kind: ClueKind | 'basics'): void;
}

export const ShellContext = createContext<Shell>({
  openMenu: () => undefined,
  go: () => undefined,
  openLesson: () => undefined,
});

export function useShell(): Shell {
  return useContext(ShellContext);
}

export const OPEN_EVENT = 'cellbound:open';
