// The Run screen: home, collection, board, card choice and summary, chosen by the run's phase.
import { useEffect, useLayoutEffect, useState, type ComponentType } from 'react';
import { GameView, type GameViewProps } from '../../app/GameView';
import { dailyDate } from '../../engine';
import { getGame, startGame, useGame } from '../../game/store';
import './run.css';
import { fogOf, gameKey, loadBoard } from './board';
import { BOARD_COUNT } from './boards';
import { runActions, useRunStore } from './store';
import { Hud, Track } from './ui/Hud';
import { Choose, Collection, Home, Page, formatDay } from './ui/Home';
import { ResultPanel, Summary } from './ui/Panels';
import type { RunState } from './state';

export interface RunAppProps {
  onExit: () => void;
  /** Lets a preview swap in a different play surface. The app passes nothing. */
  GameViewComponent?: ComponentType<GameViewProps>;
}

export function RunApp({ onExit, GameViewComponent = GameView }: RunAppProps) {
  const run = useRunStore((s) => s.run);
  const data = useRunStore((s) => s.data);
  const fresh = useRunStore((s) => s.fresh);
  const [view, setView] = useState<'home' | 'collection'>('home');
  const today = dailyDate();

  if (!run) {
    if (view === 'collection') return <Collection stats={data.stats} onBack={() => setView('home')} />;
    return (
      <Home
        today={today}
        stats={data.stats}
        current={data.current}
        last={data.last}
        onBack={onExit}
        onDaily={() => runActions.start('daily')}
        onFree={() => runActions.start('free')}
        onResume={runActions.resume}
        onGiveUp={() => runActions.giveUp()}
        onLast={runActions.viewLast}
        onCollection={() => setView('collection')}
      />
    );
  }
  if (run.phase === 'choose') return <Choose run={run} onPick={runActions.pick} onHome={runActions.home} />;
  if (run.phase === 'done') {
    return (
      <Page onBack={runActions.home}>
        <Summary
          run={run}
          dailyBest={run.daily ? (data.stats.dailyBest[run.daily]?.score ?? null) : null}
          fresh={fresh}
          onFree={() => runActions.start('free')}
          onHome={runActions.home}
        />
      </Page>
    );
  }
  return <BoardView run={run} GameViewComponent={GameViewComponent} />;
}

function BoardView({ run, GameViewComponent }: { run: RunState; GameViewComponent: ComponentType<GameViewProps> }) {
  const game = useGame();
  const key = gameKey(run.seed, run.index, run.createdAt);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const loaded = !!game && game.key === key;

  // Build the board and hand it to the game store. A game already in the store under this key is kept.
  useEffect(() => {
    if (run.phase !== 'board' || getGame()?.key === key) return;
    let dead = false;
    setFailed(false);
    loadBoard(run.setup.options)
      .then((puzzle) => {
        if (dead) return;
        startGame({ key, mode: 'run', puzzle, fog: fogOf(run.setup.options, puzzle), mods: run.setup.mods });
      })
      .catch(() => {
        if (!dead) setFailed(true);
      });
    return () => {
      dead = true;
    };
  }, [key, run.phase, run.setup, attempt]);

  // Tell the run when the board ends, whichever way.
  useLayoutEffect(() => {
    if (!game || game.key !== key || run.phase !== 'board') return;
    if (game.status === 'solved' || game.status === 'failed') {
      runActions.reportBoard({
        status: game.status,
        mistakes: game.mistakes,
        hintsUsed: game.hintsUsed,
        elapsedMs: game.elapsedMs,
      });
    }
  }, [game, key, run.phase]);

  if (run.phase === 'result' && !loaded) {
    // Reopened on a finished board: there is no board to show, only the result.
    return (
      <Page onBack={runActions.home}>
        <ResultPanel run={run} onNext={runActions.next} />
      </Page>
    );
  }
  if (!loaded) {
    return (
      <Page onBack={runActions.home}>
        {failed ? (
          <div className="cb-run-box is-warn" role="alert">
            <p>The board could not be built.</p>
            <div className="cb-run-actions">
              <button type="button" className="cb-run-btn is-primary" onClick={() => setAttempt((n) => n + 1)}>
                Try again
              </button>
              <button type="button" className="cb-run-btn" onClick={runActions.home}>
                Run home
              </button>
            </div>
          </div>
        ) : (
          <div className="cb-run-loading" role="status">
            <Track results={run.results} at={run.index} label={`Preparing board ${run.index + 1} of ${BOARD_COUNT}`} />
            <span className="cb-run-spinner" aria-hidden="true" />
          </div>
        )}
      </Page>
    );
  }
  return (
    <GameViewComponent
      game={game}
      title="Run"
      subtitle={run.daily ? formatDay(run.daily) : 'Free run'}
      extra={<Hud run={run} game={game} />}
      endPanel={run.phase === 'result' ? <ResultPanel run={run} onNext={runActions.next} /> : undefined}
      onExit={runActions.home}
    />
  );
}
