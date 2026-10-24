// The run's pieces drawn rather than written: the track of five boards (the last, larger one the
// 9x9 final), the hearts, and the strip shown with the board during a run.
import type { GameState } from '../../../game/types';
import { BOARD_COUNT, BOARD_SPECS } from '../boards';
import { cardText } from '../cards';
import { cardsOf, liveHearts, liveShield, type BoardResult, type RunState } from '../state';
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

type Mark = 'won' | 'lost' | 'now' | 'later';

/** One board on the track: a small grid in the board's own box shape. */
function Pip({ size, mark }: { size: number; mark: Mark }) {
  const box = size === 9 ? [3, 3] : [2, 3];
  const lines: string[] = [];
  for (let k = 1; k < box[0]; k++) lines.push(`M${(k * 20) / box[0]} 1V19`);
  for (let k = 1; k < box[1]; k++) lines.push(`M1 ${(k * 20) / box[1]}H19`);
  return (
    <svg className={`cb-run-pip-board is-${mark}${size === 9 ? ' is-nine' : ''}`} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <rect className="cb-run-pip-fill" x="1" y="1" width="18" height="18" rx="2.5" />
      <path className="cb-run-pip-lines" d={lines.join('')} />
      {mark === 'lost' && <path className="cb-run-pip-cross" d="M6 6l8 8M14 6l-8 8" />}
    </svg>
  );
}

/**
 * The five boards of a run, in order. Cleared boards are filled, a failed one is crossed, the
 * board in play (or the one a card is being chosen for) is ringed. The words go to screen readers.
 */
export function Track({ results = [], at = -1, label }: { results?: BoardResult[]; at?: number; label: string }) {
  return (
    <span className="cb-run-track">
      <span className="cb-run-boards">
        {BOARD_SPECS.slice(0, BOARD_COUNT).map((spec, k) => {
          const r = results.find((x) => x.index === k);
          const mark: Mark = r ? (r.status === 'solved' ? 'won' : 'lost') : k === at ? 'now' : 'later';
          return <Pip key={k} size={spec.size} mark={mark} />;
        })}
      </span>
      <span className="cb-run-visually-hidden">{label}</span>
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
        <Track results={run.results} at={run.index} label={`Board ${run.index + 1} of ${BOARD_COUNT}`} />
        <Hearts now={now} slots={slots} shield={shield} />
        <span className="cb-run-visually-hidden" role="status" aria-live="polite">
          {now} {now === 1 ? 'heart' : 'hearts'} left
        </span>
      </div>
      {cards.length > 0 && (
        <ul className="cb-run-tags" aria-label="Cards in play">
          {cards.map((c) => (
            <li key={c.id} className={`cb-run-tag is-${c.kind}`} title={cardText(c, setup.options.size)}>
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
