// The Run screen: the home and the Collection, then the run's own screens by its phase: the ante,
// the board and its tally, the reward pick, the shop and the summary.
import { useState, type ComponentType } from 'react';
import { GameView, type GameViewProps } from '../../app/GameView';
import { dailyDate } from '../../engine';
import './run.css';
import { runActions, useRunStore } from './store';
import { BoardScreen } from './ui/Board';
import { Collection } from './ui/Collection';
import { Home } from './ui/Home';
import { Reward } from './ui/Reward';
import { Select } from './ui/Select';
import { Shop } from './ui/Shop';
import { Summary } from './ui/Summary';

export interface RunAppProps {
  onExit: () => void;
  /** Lets a preview swap in a different play surface. The app passes nothing. */
  GameViewComponent?: ComponentType<GameViewProps>;
}

export function RunApp({ onExit, GameViewComponent = GameView }: RunAppProps) {
  const run = useRunStore((s) => s.run);
  const data = useRunStore((s) => s.data);
  const fresh = useRunStore((s) => s.fresh);
  const ready = useRunStore((s) => s.ready);
  const legacy = useRunStore((s) => s.legacy);
  const [view, setView] = useState<'home' | 'collection'>('home');
  const today = dailyDate();

  if (!run) {
    if (view === 'collection') return <Collection stats={data.stats} onBack={() => setView('home')} />;
    return (
      <Home
        today={today}
        stats={data.stats}
        legacy={legacy}
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
  switch (run.phase) {
    case 'select':
      return (
        <Select
          run={run}
          ready={ready}
          onPlay={runActions.play}
          onSkip={runActions.skip}
          onRetry={runActions.retry}
          onHome={runActions.home}
          onMove={runActions.move}
          onUse={(k) => runActions.useItem(k)}
        />
      );
    case 'reward':
      return <Reward run={run} onTake={runActions.take} onPass={runActions.pass} onHome={runActions.home} />;
    case 'shop':
      return (
        <Shop
          run={run}
          onBuyLens={runActions.buyLens}
          onBuyItem={runActions.buyItem}
          onSell={runActions.sell}
          onMove={runActions.move}
          onReroll={runActions.reroll}
          onUse={(k) => runActions.useItem(k)}
          onLeave={runActions.leaveShop}
          onHome={runActions.home}
        />
      );
    case 'done':
      return (
        <Summary
          run={run}
          dailyBest={run.daily ? (data.stats.dailyBest[run.daily]?.score ?? null) : null}
          fresh={fresh}
          onFree={() => runActions.start('free')}
          onHome={runActions.home}
        />
      );
    default:
      return <BoardScreen run={run} GameViewComponent={GameViewComponent} />;
  }
}
