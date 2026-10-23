// The strip shown above the board during a run: hearts, board number, score, cards in play.
import type { GameState } from '../../../game/types';
import { BOARD_COUNT } from '../boards';
import { formatScore } from '../score';
import { cardsOf, liveHearts, liveShield, type RunState } from '../state';
import { HeartIcon, KindIcon, ShieldIcon } from './icons';

export function Hearts({ now, slots, shield = 0 }: { now: number; slots: number; shield?: number }) {
  const label = `${now} ${now === 1 ? 'heart' : 'hearts'}` + (shield ? `, ${shield} ${shield === 1 ? 'shield' : 'shields'}` : '');
  return (
    <span className="cb-run-hearts" role="img" aria-label={label}>
      {Array.from({ length: slots }, (_, i) => (
        <HeartIcon key={i} className={'cb-run-heart' + (i < now ? ' is-full' : '')} filled={i < now} />
      ))}
      {shield > 0 && (
        <span className="cb-run-shield">
          <ShieldIcon className="cb-run-shield-icon" filled />
          <span>{shield}</span>
        </span>
      )}
    </span>
  );
}

export function Hud({ run, game }: { run: RunState; game: GameState | null }) {
  const setup = run.setup;
  const mistakes = game?.mistakes ?? 0;
  const now = liveHearts(setup, mistakes);
  const shield = liveShield(setup, mistakes);
  const slots = Math.max(3, setup.mods.hearts ?? 3, now);
  const cards = cardsOf(setup.cardIds);
  return (
    <div className="cb-run-hud" role="group" aria-label="Run status">
      <div className="cb-run-hud-row">
        <Hearts now={now} slots={slots} shield={shield} />
        <span className="cb-run-board">
          Board {run.index + 1} of {BOARD_COUNT}
        </span>
        <span className="cb-run-visually-hidden" role="status" aria-live="polite">
          {now} {now === 1 ? 'heart' : 'hearts'} left
        </span>
        <span className="cb-run-score">
          <span className="cb-run-label">Score</span> {formatScore(run.score)}
        </span>
      </div>
      {cards.length > 0 && (
        <ul className="cb-run-tags" aria-label="Cards in play">
          {cards.map((c) => (
            <li key={c.id} className={`cb-run-tag is-${c.kind}`} title={c.text}>
              <KindIcon kind={c.kind} className="cb-run-tag-icon" />
              <span>{c.name}</span>
              {c.mult > 0 && (
                <>
                  {' '}
                  <span className="cb-run-tag-mult">+{Math.round(c.mult * 100)}%</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
