// The board result (shown over the solved board), and the run summary and failure screen.
import { useState } from 'react';
import { DIFFICULTY_NAMES } from '../../names';
import { shareResult, type ShareOutcome } from '../../share';
import { BOARD_COUNT } from '../boards';
import { cardById, type UnlockId } from '../cards';
import { HEART_BONUS, formatMs, formatScore } from '../score';
import { boardsCleared, cardsOf, shareText, type BoardResult, type RunState } from '../state';
import { cardsUnlockedBy } from '../stats';

function curseNames(r: BoardResult): string {
  return r.cardIds
    .map((id) => cardById(id))
    .filter((c) => c && c.kind !== 'boon')
    .map((c) => c!.name)
    .join(', ');
}

/** Compact breakdown of the board just played. Shown through GameView's endPanel. */
export function ResultPanel({ run, onNext }: { run: RunState; onNext: () => void }) {
  const r = run.results[run.results.length - 1];
  if (!r) return null;
  const last = run.index >= BOARD_COUNT - 1;
  if (r.status === 'failed') {
    return (
      <section className="cb-run-panel" aria-labelledby="cb-run-panel-h">
        <h2 id="cb-run-panel-h" className="cb-run-panel-title">
          Run over
        </h2>
        <p className="cb-run-panel-lead">
          {r.reason === 'time' ? 'The clock ran out' : 'You are out of hearts'} on board {r.index + 1} of {BOARD_COUNT}.
        </p>
        <dl className="cb-run-rows">
          <div>
            <dt>Boards cleared</dt>
            <dd>
              {boardsCleared(run)} of {BOARD_COUNT}
            </dd>
          </div>
          <div className="is-total">
            <dt>Score</dt>
            <dd>{formatScore(run.score)}</dd>
          </div>
        </dl>
        <button type="button" className="cb-run-btn is-primary" onClick={onNext} autoFocus>
          See summary
        </button>
      </section>
    );
  }
  const s = r.score;
  const names = curseNames(r);
  return (
    <section className="cb-run-panel" aria-labelledby="cb-run-panel-h">
      <h2 id="cb-run-panel-h" className="cb-run-panel-title">
        Board {r.index + 1} cleared
      </h2>
      <dl className="cb-run-rows">
        <div>
          <dt>Base, {DIFFICULTY_NAMES[r.difficulty].toLowerCase()}</dt>
          <dd>{formatScore(s.base)}</dd>
        </div>
        <div>
          <dt>
            Time bonus{' '}
            <span className="cb-run-dim">
              ({formatMs(r.elapsedMs)}
              {r.parMs ? `, par ${formatMs(r.parMs)}` : ''})
            </span>
          </dt>
          <dd>+{formatScore(s.timeBonus)}</dd>
        </div>
        {s.hintPenalty > 0 && (
          <div>
            <dt>
              Hints <span className="cb-run-dim">({r.hintsUsed})</span>
            </dt>
            <dd>-{formatScore(s.hintPenalty)}</dd>
          </div>
        )}
        {s.mult > 1 && (
          <div>
            <dt>
              Curses <span className="cb-run-dim">({names})</span>
            </dt>
            <dd>x{s.mult.toFixed(2)}</dd>
          </div>
        )}
        <div className="is-total">
          <dt>Board score</dt>
          <dd>{formatScore(s.total)}</dd>
        </div>
        {last && (
          <div>
            <dt>
              Hearts left <span className="cb-run-dim">({run.hearts} x {HEART_BONUS})</span>
            </dt>
            <dd>+{formatScore(run.endBonus)}</dd>
          </div>
        )}
        <div className="is-total">
          <dt>Run total</dt>
          <dd>{formatScore(run.score)}</dd>
        </div>
      </dl>
      <button type="button" className="cb-run-btn is-primary" onClick={onNext} autoFocus>
        {last ? 'See summary' : 'Choose a card'}
      </button>
    </section>
  );
}

function headline(run: RunState): { title: string; lead: string } {
  const last = run.results[run.results.length - 1];
  if (run.outcome === 'finished') return { title: 'Run complete', lead: `You cleared all ${BOARD_COUNT} boards with ${run.hearts} ${run.hearts === 1 ? 'heart' : 'hearts'} left.` };
  if (run.outcome === 'failed' && last)
    return {
      title: 'Run over',
      lead: `${last.reason === 'time' ? 'The clock ran out' : 'You ran out of hearts'} on board ${last.index + 1} of ${BOARD_COUNT}.`,
    };
  return { title: 'Run ended', lead: `You stopped on board ${run.index + 1} of ${BOARD_COUNT}.` };
}

export interface SummaryProps {
  run: RunState;
  /** The score that counts as the daily best for this date, when this run is a replay. */
  dailyBest: number | null;
  fresh: UnlockId[];
  onFree: () => void;
  onHome: () => void;
}

export function Summary({ run, dailyBest, fresh, onFree, onHome }: SummaryProps) {
  const [sent, setSent] = useState<ShareOutcome | null>(null);
  const { title, lead } = headline(run);
  const text = shareText(run);
  const isReplay = !!run.replay && dailyBest !== null;
  const opened = cardsUnlockedBy(fresh);
  return (
    <>
      <h1 className="cb-run-title">{title}</h1>
      <p className="cb-run-lead">{lead}</p>
      <p className="cb-run-bigscore" aria-label={`Score ${run.score}`}>
        <span className="cb-run-label">Score</span>
        <span className="cb-run-bignum">{formatScore(run.score)}</span>
      </p>
      {run.daily && (
        <p className="cb-run-note">
          {isReplay
            ? `Daily run ${run.daily}. Your first attempt set the daily best at ${formatScore(dailyBest!)}, so this replay does not change it.`
            : `Daily run ${run.daily}. This first attempt sets your daily best.`}
        </p>
      )}

      <table className="cb-run-table">
        <caption className="cb-run-label">Boards</caption>
        <thead>
          <tr>
            <th scope="col">Board</th>
            <th scope="col">Time</th>
            <th scope="col">Hearts lost</th>
            <th scope="col" className="is-num">
              Score
            </th>
          </tr>
        </thead>
        <tbody>
          {run.results.map((r) => {
            const names = cardsOf(r.cardIds).map((c) => c.name).join(', ');
            return (
              <tr key={r.index}>
                <th scope="row">
                  {r.index + 1}
                  {names && <span className="cb-run-dim cb-run-cards"> {names}</span>}
                </th>
                <td>{formatMs(r.elapsedMs)}</td>
                <td>{r.heartsLost}</td>
                <td className="is-num">{r.status === 'solved' ? formatScore(r.score.total) : 'Failed'}</td>
              </tr>
            );
          })}
        </tbody>
        {run.outcome === 'finished' && (
          <tfoot>
            <tr>
              <th scope="row" colSpan={3}>
                Hearts left bonus ({run.hearts} x {HEART_BONUS})
              </th>
              <td className="is-num">+{formatScore(run.endBonus)}</td>
            </tr>
          </tfoot>
        )}
      </table>

      {opened.length > 0 && (
        <div className="cb-run-unlocked">
          <h2 className="cb-run-h2">New cards</h2>
          <ul>
            {opened.map((c) => (
              <li key={c.id}>
                <strong>{c.name}</strong> is now in your collection.
              </li>
            ))}
          </ul>
          <p className="cb-run-note">Unlocked cards appear in free runs. Daily runs use the starter cards so everyone sees the same offers.</p>
        </div>
      )}

      <h2 className="cb-run-h2">Share</h2>
      <pre className="cb-run-share" tabIndex={0} aria-label="Result text">
        {text}
      </pre>
      <div className="cb-run-actions">
        <button
          type="button"
          className="cb-run-btn is-primary"
          onClick={async () => setSent(await shareResult(text, 'Cellbound Run'))}
        >
          Share result
        </button>
        <button type="button" className="cb-run-btn" onClick={onFree}>
          New free run
        </button>
        <button type="button" className="cb-run-btn" onClick={onHome}>
          Run home
        </button>
      </div>
      <p className="cb-run-status" role="status" aria-live="polite">
        {sent === 'copied' ? 'Copied to the clipboard.' : sent === 'shared' ? 'Shared.' : sent === 'failed' ? 'Could not share. Select the text above to copy it.' : ''}
      </p>
    </>
  );
}
