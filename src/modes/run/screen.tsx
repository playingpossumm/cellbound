// The Run screen as the shell mounts it. Loaded on first use.
import { useLayoutEffect, useState } from 'react';
import { RunApp } from './RunApp';
import { runActions } from './store';

export default function RunScreen({ onExit }: { onExit: () => void }) {
  // The shell opens a mode from the menu, so start on the Run home; an unfinished run is
  // one tap away. The store changes in an effect, not during render, and the screen waits
  // for it, so a run from an earlier visit never flashes.
  const [home, setHome] = useState(false);
  useLayoutEffect(() => {
    runActions.home();
    setHome(true);
  }, []);
  return home ? <RunApp onExit={onExit} /> : null;
}
