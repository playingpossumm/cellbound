// App shell. STUB; the app agent replaces it.
import { useEffect } from 'react';
import { LYRA } from '../engine/fixtures';
import { startGame, useGame } from '../game/store';
import { GameView } from './GameView';

export const APP_NAME = 'Cellbound';

export default function App() {
  const game = useGame();
  useEffect(() => {
    startGame({ key: 'stub', mode: 'daily', puzzle: LYRA });
  }, []);
  if (!game) return null;
  return <GameView game={game} title="Daily" subtitle="Stub" />;
}
