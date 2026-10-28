// The ante screen: the ante's three boards, each with its target before it starts, the boss rule
// from the start of the ante, and the board in turn ready to play or to skip for a tag.
import { useState } from 'react';
import { anteOf, KINDS, slotOf, specFor } from '../boards';
import { BOSS_NAMES, bossText, clockMs } from '../bosses';
import type { Prepared } from '../board';
import type { BoardResult, RunState } from '../model';
import { canSkip, difficultyOf, formatScore, KIND_NAMES, resultOf, ruleOf } from '../state';
import { COINS } from '../tuning';
import { CheckIcon, SkipIcon, TargetIcon } from './icons';
import { BossTag, Coins, hasLoadout, LevelPill, Loadout, LoadoutActions, Page, RunHearts, RunScore, Track, whereLabel } from './parts';

export interface SelectProps {
  run: RunState;
  ready: Record<number, Prepared | 'failed'>;
  onPlay: () => void;
  onSkip: () => void;
  onRetry: () => void;
  onHome: () => void;
  onMove: (from: number, to: number) => void;
  onUse: (k: number) => void;
}

function ResultLine({ r }: { r: BoardResult }) {
  if (r.status === 'skipped') return <span className="cb-run-result is-skipped">Skipped</span>;
  const ok = r.status === 'cleared';
  return (
    <span className={`cb-run-result${ok ? ' is-ok' : ' is-bad'}`}>
      {ok && <CheckIcon className="cb-run-result-icon" />}
      <span>{formatScore(r.score)}</span>
      <span className="cb-run-dim"> / {formatScore(r.target)}</span>
    </span>
  );
}

export function Select({ run, ready, onPlay, onSkip, onRetry, onHome, onMove, onUse }: SelectProps) {
  const ante = anteOf(run.slot);
  const [ruleOn, setRuleOn] = useState(false);
  return (
    <Page
      heading={
        <h1 className="cb-run-title">
          Ante {ante}
          <LevelPill run={run} />
        </h1>
      }
      onBack={onHome}
    >
      <div className="cb-run-head">
        <Track run={run} label={whereLabel(run)} />
        <div className="cb-run-row">
          <RunHearts run={run} />
          <Coins value={run.coins} />
          <RunScore value={run.score} />
        </div>
      </div>

      {hasLoadout(run) && (
        <Loadout run={run} slots={run.lenses.length > 0 || run.items.length > 0} actions={(pick) => <LoadoutActions run={run} pick={pick} onMove={onMove} onUse={onUse} />} />
      )}

      <ol className="cb-run-boards" aria-label={`Ante ${ante}`}>
        {KINDS.map((kind) => {
          const slot = slotOf(ante, kind);
          const r = resultOf(run, slot);
          const now = slot === run.slot;
          const prep = ready[slot];
          const target = run.targets[slot] ?? (prep && prep !== 'failed' ? prep.target : null);
          const rule = ruleOf(run, slot);
          const coinTimes = now ? (run.next.coinTimes ?? 1) : 1;
          const minutes = Math.round(clockMs(specFor(slot, difficultyOf(run)).minutes) / 60_000);
          const mods = now ? [run.next.fog && 'Fog', run.next.clock && 'Clock', run.pending && 'Double or nothing'].filter(Boolean) : [];
          return (
            <li key={kind} className={`cb-run-board is-${kind}${now ? ' is-now' : ''}${r ? ' is-done' : ''}`} aria-current={now ? 'step' : undefined}>
              <span className="cb-run-board-kind">{KIND_NAMES[kind]}</span>
              {r ? (
                <ResultLine r={r} />
              ) : (
                <>
                  <span className="cb-run-board-target" aria-label={target === null ? 'Target not ready' : `Target ${formatScore(target)}`}>
                    <TargetIcon className="cb-run-target-icon" />
                    {target === null ? <span className="cb-run-wait" aria-hidden="true" /> : <span>{formatScore(target)}</span>}
                  </span>
                  <Coins value={COINS.board[kind] * coinTimes} label="coins for clearing it" />
                </>
              )}
              {rule &&
                !r &&
                (now ? (
                  <span className="cb-run-board-rule" role="img" aria-label={`Boss rule: ${BOSS_NAMES[rule]}`}>
                    <BossTag rule={rule} />
                  </span>
                ) : (
                  <button type="button" className="cb-run-board-rule" aria-pressed={ruleOn} aria-label={`Boss rule: ${BOSS_NAMES[rule]}`} onClick={() => setRuleOn((v) => !v)}>
                    <BossTag rule={rule} />
                  </button>
                ))}
              {(mods.length > 0 || (rule && (now || ruleOn))) && (
                <p className="cb-run-board-text">
                  {rule && (now || ruleOn) ? bossText(rule, rule === 'clock' ? minutes : undefined) : null}
                  {mods.length > 0 && (
                    <span className="cb-run-mods">
                      {mods.map((m) => (
                        <span key={String(m)} className="cb-run-mod">
                          {m}
                        </span>
                      ))}
                    </span>
                  )}
                </p>
              )}
              {now && !r && (
                <div className="cb-run-board-actions">
                  {prep === 'failed' ? (
                    <button type="button" className="cb-run-btn is-primary" onClick={onRetry}>
                      Try again
                    </button>
                  ) : (
                    <button type="button" className="cb-run-btn is-primary is-play" disabled={!prep} onClick={onPlay} autoFocus>
                      Play
                    </button>
                  )}
                  {canSkip(run) && (
                    <button type="button" className="cb-run-btn is-skip" onClick={onSkip}>
                      <SkipIcon className="cb-run-btn-icon" />
                      Skip for a card
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {ready[run.slot] === 'failed' && (
        <p className="cb-run-error" role="alert">
          The board could not be built.
        </p>
      )}
    </Page>
  );
}
