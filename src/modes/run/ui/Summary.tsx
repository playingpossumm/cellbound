// The run summary: how it ended, the score, the best placement, the techniques by tier, the
// nine boards, anything the run unlocked, and sharing. Two columns on a wide screen.
import { useState } from 'react';
import { APP_NAME } from '../../../app/brand';
import { TECHNIQUES, type TechniqueId } from '../../../engine/techniques';
import { shareResult, type ShareOutcome } from '../../share';
import { ANTES, KINDS, slotOf } from '../boards';
import { TIER_NAMES } from '../items';
import type { RunState, UnlockId } from '../model';
import { formatScore, KIND_NAMES, resultOf, shareText } from '../state';
import { unlockedNames } from '../stats';
import { Page, RunHearts, TierDot, Track } from './parts';

function title(run: RunState): string {
  if (run.outcome === 'won') return 'Run won';
  if (run.outcome === 'lost') return 'Run over';
  return 'Run ended';
}

/** Placements per tier over the whole run. */
function tiersOf(run: RunState): number[] {
  const out = new Array(9).fill(0);
  for (const r of run.results) for (const [id, t] of Object.entries(r.tech)) out[TECHNIQUES[id as TechniqueId].tier] += t!.n;
  return out;
}

function Tiers({ run }: { run: RunState }) {
  const tiers = tiersOf(run);
  const most = Math.max(1, ...tiers.slice(1));
  if (!tiers.slice(1).some((n) => n > 0)) return null;
  return (
    <table className="cb-run-tiers">
      <caption className="cb-run-sr">Placements by tier</caption>
      <tbody>
        {tiers.map((n, t) =>
          t === 0 || n === 0 ? null : (
            <tr key={t} className={`cb-run-t${t}`}>
              <th scope="row">
                <TierDot tier={t} />
                {TIER_NAMES[t]}
              </th>
              <td className="cb-run-tiers-bar" aria-hidden="true">
                <span style={{ transform: `scaleX(${n / most})` }} />
              </td>
              <td className="is-num">{n}</td>
            </tr>
          ),
        )}
        {tiers[0] > 0 && (
          <tr className="cb-run-t0">
            <th scope="row">
              <TierDot tier={0} />
              {TIER_NAMES[0]}
            </th>
            <td />
            <td className="is-num">{tiers[0]}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function Boards({ run }: { run: RunState }) {
  return (
    <table className="cb-run-table">
      <caption className="cb-run-sr">Boards</caption>
      <tbody>
        {Array.from({ length: ANTES }, (_, a) =>
          KINDS.map((k) => {
            const r = resultOf(run, slotOf(a + 1, k));
            if (!r) return null;
            return (
              <tr key={`${a}${k}`}>
                <th scope="row">
                  <span className="cb-run-dim">{a + 1}</span> {KIND_NAMES[k]}
                </th>
                <td className="is-num">
                  {r.status === 'skipped' ? (
                    <span className="cb-run-dim">Skipped</span>
                  ) : (
                    <>
                      <span className={r.status === 'cleared' ? '' : 'cb-run-bad'}>{formatScore(r.score)}</span>
                      <span className="cb-run-dim"> / {formatScore(r.target)}</span>
                    </>
                  )}
                </td>
              </tr>
            );
          }),
        )}
      </tbody>
    </table>
  );
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
  const text = shareText(run);
  const best = run.results.reduce<RunState['results'][number]['best']>((b, r) => (r.best && (!b || r.best.points > b.points) ? r.best : b), null);
  const opened = unlockedNames(fresh);
  // How the run ended, in words, for screen readers; the track and the hearts show it.
  const how = text.split('\n')[1] ?? '';
  return (
    <Page title={title(run)} onBack={onHome} wide>
      <div className="cb-run-sum">
        <div className="cb-run-sum-col">
          <div className="cb-run-head">
            <Track run={run} at={-1} label={how} />
            <RunHearts run={run} />
          </div>
          <p className="cb-run-bigscore" aria-label={`Score ${formatScore(run.score)}`}>
            {formatScore(run.score)}
          </p>
          {run.replay && dailyBest !== null && (
            <p className="cb-run-note">
              Daily best <strong>{formatScore(dailyBest)}</strong>
            </p>
          )}
          {best && (
            <p className="cb-run-best">
              <TierDot tier={TECHNIQUES[best.technique].tier} />
              <span>{TECHNIQUES[best.technique].name}</span>
              <strong>{formatScore(best.points)}</strong>
              <span className="cb-run-sr">was the best placement</span>
            </p>
          )}
          <Tiers run={run} />
        </div>

        <div className="cb-run-sum-col">
          <Boards run={run} />
          {opened.length > 0 && (
            <section className="cb-run-unlocked" aria-labelledby="cb-run-new-h">
              <h2 id="cb-run-new-h" className="cb-run-h2">
                Unlocked
              </h2>
              <ul>
                {opened.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </section>
          )}
          <div className="cb-run-actions">
            <button type="button" className="cb-run-btn is-primary" onClick={async () => setSent(await shareResult(text, `${APP_NAME} Run`))}>
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
            {sent === 'copied' ? 'Copied to the clipboard.' : sent === 'shared' ? 'Shared.' : sent === 'failed' ? 'Sharing is not available here. Copy the text below.' : ''}
          </p>
          {/* Shown only when sharing failed, so the result can still be copied by hand. */}
          {sent === 'failed' && (
            <pre className="cb-run-share" tabIndex={0} aria-label="Result text">
              {text}
            </pre>
          )}
        </div>
      </div>
    </Page>
  );
}
