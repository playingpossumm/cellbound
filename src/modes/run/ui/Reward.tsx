// The reward pick: one card of three after a cleared board, of four (one rare) after a boss, or of
// two commons for a skipped board's tag. A card is picked, then taken, so a stray tap costs nothing.
import { useState } from 'react';
import { anteOf, slotOf } from '../boards';
import { BOSS_NAMES, bossText } from '../bosses';
import type { RewardId, RunState } from '../model';
import { rewardById } from '../rewards';
import { formatScore, resultOf } from '../state';
import { BossTag, CardBody, cardClass, Coins, Page, RunHearts, RunScore, Track, whereLabel } from './parts';

export interface RewardProps {
  run: RunState;
  onTake: (id: RewardId) => void;
  onPass: () => void;
  onHome: () => void;
}

export function Reward({ run, onTake, onPass, onHome }: RewardProps) {
  const [sel, setSel] = useState<RewardId | null>(null);
  const offer = run.offer;
  if (!offer) return null;
  const chosen = sel && offer.cards.includes(sel) ? sel : null;
  const def = chosen ? rewardById(chosen) : undefined;
  // Scout shows the ante's boss rule while there is still a board to pick for before it.
  const bossSlot = slotOf(anteOf(run.slot), 'boss');
  const scout = !!run.perks.scout && offer.kind !== 'boss' && !resultOf(run, bossSlot) ? run.bosses[anteOf(run.slot) - 1] : null;
  return (
    <Page title="Choose a card" onBack={onHome}>
      <div className="cb-run-head">
        <Track run={run} at={run.slot + 1} label={whereLabel(run)} />
        <div className="cb-run-row">
          <RunHearts run={run} />
          <Coins value={run.coins} />
          <RunScore value={run.score} />
        </div>
      </div>
      {scout && (
        <p className="cb-run-scout">
          <BossTag rule={scout} shown />
          <span>{bossText(scout)}</span>
          <span className="cb-run-sr">Boss rule: {BOSS_NAMES[scout]}</span>
        </p>
      )}
      {offer.cards.length ? (
        <>
          <ul className={`cb-run-offers is-${offer.cards.length}`}>
            {offer.cards.map((id) => (
              <li key={id}>
                <button type="button" className={cardClass(id) + (chosen === id ? ' is-selected' : '')} aria-pressed={chosen === id} onClick={() => setSel(id)}>
                  <CardBody id={id} selected={chosen === id} />
                </button>
              </li>
            ))}
          </ul>
          <div className="cb-run-actions">
            <button type="button" className="cb-run-btn is-primary is-wide" disabled={!chosen} onClick={() => chosen && onTake(chosen)}>
              {def ? `Take ${def.name}` : 'Pick a card'}
            </button>
          </div>
        </>
      ) : (
        <div className="cb-run-actions">
          <button type="button" className="cb-run-btn is-primary is-wide" onClick={onPass}>
            Continue
          </button>
        </div>
      )}
    </Page>
  );
}
