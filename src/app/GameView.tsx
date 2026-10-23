// The playing surface: theme band, rule chips, board, number pad and tools.
// STUB with a bare grid; the app agent replaces the body and keeps the props.
import type { ReactNode } from 'react';
import type { GameState } from '../game/types';
import { actions } from '../game/store';

export interface GameViewProps {
  game: GameState;
  /** Shown in the theme band, for example "Daily". */
  title: string;
  /** For example "Friday 23 October". */
  subtitle: string;
  onExit?: () => void;
  /** Mode-specific panel (hearts, run progress), rendered between the band and the board. */
  extra?: ReactNode;
  hideRuleChips?: boolean;
  /** Rendered over the board when the game is solved or failed, instead of the default result card. */
  endPanel?: ReactNode;
}

export function GameView({ game, title, subtitle, extra }: GameViewProps) {
  const n = game.puzzle.size;
  return (
    <div className="cb-gameview-stub">
      <h1>
        {title} · {subtitle}
      </h1>
      {extra}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, 40px)` }}>
        {game.puzzle.givens.map((g, i) => (
          <button key={i} type="button" onClick={() => actions.select(i)} style={{ height: 40 }}>
            {g || game.values[i] || ''}
          </button>
        ))}
      </div>
      <div>
        {Array.from({ length: n }, (_, k) => (
          <button key={k} type="button" onClick={() => actions.input(k + 1)}>
            {k + 1}
          </button>
        ))}
      </div>
      <p>Status: {game.status}</p>
    </div>
  );
}
