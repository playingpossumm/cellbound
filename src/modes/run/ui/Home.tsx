// The Run home: the shape of a run, the run in progress, the two ways to start one, the best
// scores, and the way to the Collection and the last run.
import { useState } from 'react';
import { ANTES } from '../boards';
import type { RunState } from '../model';
import { formatScore } from '../state';
import { bestDaily, type RunStats } from '../stats';
import { HEARTS } from '../tuning';
import { Hearts, Page, RunHearts, RunScore, Track, whereLabel } from './parts';

export interface HomeProps {
  today: string;
  stats: RunStats;
  /** Runs the first Run counted. */
  legacy: number;
  current: RunState | null;
  last: RunState | null;
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
  const todays = p.stats.dailyBest[p.today];
  const best = bestDaily(p.stats);
  const dailyRunning = !!p.current && p.current.daily === p.today;
  // The first attempt of a day sets the daily best, so ending one early counts.
  const counts = !!p.current && p.current.daily !== null && !p.current.replay;
  const start = (kind: 'daily' | 'free') => {
    if (kind === 'daily' && dailyRunning) p.onResume();
    else if (p.current) setAsk(kind);
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
      {/* What a run is, drawn: three antes of three boards, the boss larger, and three hearts. */}
      <div className="cb-run-shape">
        <Track label={`${ANTES} antes of three boards, and ${HEARTS.start} hearts.`} />
        <Hearts now={HEARTS.start} slots={HEARTS.start} />
      </div>

      {p.current && (
        <section className="cb-run-box" aria-labelledby="cb-run-resume-h">
          <h2 id="cb-run-resume-h" className="cb-run-h2">
            Run in progress
          </h2>
          <div className="cb-run-row">
            <Track run={p.current} label={whereLabel(p.current)} />
            <RunHearts run={p.current} />
            <RunScore value={p.current.score} />
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

      <div className="cb-run-start">
        <button type="button" className={'cb-run-btn is-big' + (todays && !dailyRunning ? '' : ' is-primary')} onClick={() => start('daily')}>
          {dailyRunning ? 'Resume daily run' : todays ? 'Play the daily again' : 'Start daily run'}
        </button>
        <button type="button" className={'cb-run-btn is-big' + (todays && !dailyRunning ? ' is-primary' : '')} onClick={() => start('free')}>
          Start free run
        </button>
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
            <dt>Best free run</dt>
            <dd>{p.stats.bestFree ? formatScore(p.stats.bestFree.score) : 'None yet'}</dd>
          </div>
          <div>
            <dt>Runs</dt>
            <dd>
              {runs}
              {p.stats.won > 0 && <span className="cb-run-dim"> {p.stats.won} won</span>}
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
