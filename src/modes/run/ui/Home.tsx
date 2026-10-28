// The Run home: the shape of a run, the run in progress, the two ways to start one (a free run on
// Easy, Normal or Hard), the best scores, and the way to the Collection and the last run.
import { useState } from 'react';
import { ANTES } from '../boards';
import type { RunDifficulty, RunState } from '../model';
import { formatScore, LEVEL_NAMES } from '../state';
import { bestDaily, type RunStats } from '../stats';
import { DIFFICULTY } from '../tuning';
import { LockIcon } from './icons';
import { Hearts, Page, RunHearts, RunScore, Track, whereLabel } from './parts';

const LEVELS: readonly RunDifficulty[] = ['easy', 'normal', 'hard'];

export interface HomeProps {
  today: string;
  stats: RunStats;
  /** Runs the first Run counted. */
  legacy: number;
  current: RunState | null;
  last: RunState | null;
  /** The difficulty the next free run starts on, and the ones open yet. */
  pick: RunDifficulty;
  open: Record<RunDifficulty, boolean>;
  onPick: (level: RunDifficulty) => void;
  onBack: () => void;
  onDaily: () => void;
  onFree: () => void;
  onResume: () => void;
  onGiveUp: () => void;
  onLast: () => void;
  onCollection: () => void;
}

export function Home(p: HomeProps) {
  const [ask, setAsk] = useState<'daily' | 'free' | 'end' | null>(null);
  // Tapping a level before it is open says how to open it.
  const [locked, setLocked] = useState<RunDifficulty | null>(null);
  const hearts = DIFFICULTY.hearts[p.pick];
  const todays = p.stats.dailyBest[p.today];
  const best = bestDaily(p.stats);
  const dailyRunning = !!p.current && p.current.daily === p.today;
  // The first attempt of a day sets the daily best, so ending one early counts.
  const counts = !!p.current && p.current.daily !== null && !p.current.replay;
  const start = (kind: 'daily' | 'free') => {
    if (p.current) setAsk(kind);
    else (kind === 'daily' ? p.onDaily : p.onFree)();
  };
  const warning =
    (ask === 'end' ? 'End this run? ' : 'Starting a new run ends the one in progress. ') +
    (counts ? 'Its score so far becomes your daily best for that day.' : 'Its score so far is kept.');
  // The question sits next to the button that raised it.
  const question = (
    <section className="cb-run-box is-warn" role="alert">
      <p>{warning}</p>
      <div className="cb-run-actions">
        <button
          type="button"
          className="cb-run-btn is-primary"
          autoFocus
          onClick={() => {
            const k = ask;
            setAsk(null);
            if (k === 'end') p.onGiveUp();
            else if (k === 'daily') p.onDaily();
            else if (k === 'free') p.onFree();
          }}
        >
          {ask === 'end' ? 'End run' : 'Start anyway'}
        </button>
        <button type="button" className="cb-run-btn" onClick={() => setAsk(null)}>
          Keep playing
        </button>
      </div>
    </section>
  );
  const runs = p.stats.started + p.legacy;
  return (
    <Page title="Run" onBack={p.onBack}>
      {/* What a run is, drawn: three antes of three boards, the boss larger, and three hearts. A run
          in progress draws its own, below, so the empty one gives way. */}
      {!p.current && (
        <div className="cb-run-shape">
          <Track label={`${ANTES} antes of three boards, and ${hearts} hearts.`} />
          <Hearts now={hearts} slots={hearts} />
        </div>
      )}

      {p.current && (
        <section className="cb-run-box" aria-labelledby="cb-run-resume-h">
          <div className="cb-run-box-head">
            <h2 id="cb-run-resume-h" className="cb-run-h2">
              Run in progress
            </h2>
            <RunScore value={p.current.score} />
          </div>
          <div className="cb-run-row">
            <Track run={p.current} label={whereLabel(p.current)} />
            <RunHearts run={p.current} />
          </div>
          <div className="cb-run-actions">
            <button type="button" className="cb-run-btn is-primary" onClick={p.onResume}>
              Resume run
            </button>
            <button type="button" className="cb-run-btn" onClick={() => setAsk('end')}>
              End run
            </button>
          </div>
        </section>
      )}

      {ask === 'end' && question}

      {/* The run in progress is resumed from its own box, so a daily run in progress has no second button here. */}
      <div className={'cb-run-start' + (dailyRunning ? ' is-one' : '')}>
        {!dailyRunning && (
          <button type="button" className={'cb-run-btn is-big' + (todays || p.current ? '' : ' is-primary')} onClick={() => start('daily')}>
            {todays ? 'Replay daily' : 'Start daily run'}
          </button>
        )}
        <div className="cb-run-free">
          <button type="button" className={'cb-run-btn is-big' + (todays && !p.current ? ' is-primary' : '')} onClick={() => start('free')}>
            Start Run
          </button>
          <div className="cb-run-tabs cb-run-levels" role="group" aria-label="Difficulty">
            {LEVELS.map((level) => {
              const shut = !p.open[level];
              return (
                <button
                  key={level}
                  type="button"
                  className={`cb-run-tab${p.pick === level ? ' is-on' : ''}${shut ? ' is-locked' : ''}`}
                  aria-pressed={p.pick === level}
                  aria-disabled={shut || undefined}
                  onClick={() => {
                    setLocked(shut ? level : null);
                    if (!shut) p.onPick(level);
                  }}
                >
                  {shut && <LockIcon className="cb-run-levels-lock" />}
                  {LEVEL_NAMES[level]}
                </button>
              );
            })}
          </div>
          {locked && (
            <p className="cb-run-levels-note" role="status">
              {locked === 'normal' ? 'Win a run on Easy to open Normal.' : 'Win a run on Normal to open Hard.'}
            </p>
          )}
        </div>
      </div>

      {(ask === 'daily' || ask === 'free') && question}

      <section aria-labelledby="cb-run-best-h">
        <h2 id="cb-run-best-h" className="cb-run-h2">
          Best scores
        </h2>
        <dl className="cb-run-stats">
          <div>
            <dt>Today</dt>
            <dd>{todays ? formatScore(todays.score) : 'Not played'}</dd>
          </div>
          <div>
            <dt>Best daily</dt>
            <dd>{best ? formatScore(best.score) : 'None yet'}</dd>
          </div>
          <div>
            {/* A free run was Normal before there was a choice; with other levels played, it says so. */}
            <dt>{p.stats.bestEasy || p.stats.bestHard ? 'Best on Normal' : 'Best free run'}</dt>
            <dd>{p.stats.bestFree ? formatScore(p.stats.bestFree.score) : 'None yet'}</dd>
          </div>
          {p.stats.bestEasy && (
            <div>
              <dt>Best on Easy</dt>
              <dd>{formatScore(p.stats.bestEasy.score)}</dd>
            </div>
          )}
          {p.stats.bestHard && (
            <div>
              <dt>Best on Hard</dt>
              <dd>{formatScore(p.stats.bestHard.score)}</dd>
            </div>
          )}
          <div>
            <dt>Runs</dt>
            <dd>
              {runs}
              {p.stats.won > 0 && <span className="cb-run-dim"> · {p.stats.won} won</span>}
            </dd>
          </div>
        </dl>
      </section>

      <div className="cb-run-actions">
        <button type="button" className="cb-run-btn" onClick={p.onCollection}>
          Collection
        </button>
        {p.last && (
          <button type="button" className="cb-run-btn" onClick={p.onLast}>
            Last run <span className="cb-run-dim">{formatScore(p.last.score)}</span>
          </button>
        )}
      </div>
    </Page>
  );
}
