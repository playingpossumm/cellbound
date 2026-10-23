// The two full-screen mode components, kept apart from index.ts so the registry stays plain TypeScript.
import { useState } from 'react';
import { LearnApp } from './learn/LearnApp';
import { RunApp } from './run/RunApp';
import { runActions } from './run/store';

export function RunScreen({ onExit }: { onExit: () => void }) {
  // The shell opens a mode from the menu, so start on the Run home. An unfinished run is one tap away.
  useState(() => runActions.home());
  return <RunApp onExit={onExit} />;
}

export function LearnScreen({ onExit }: { onExit: () => void }) {
  return <LearnApp onExit={onExit} />;
}
