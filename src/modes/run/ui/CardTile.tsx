import type { BoardView, Card, CardKind, Rarity } from '../cards';
import { cardText } from '../cards';
import { CheckIcon, KindIcon } from './icons';

const KIND_LABEL: Record<CardKind, string> = { boon: 'Boon', curse: 'Curse', bargain: 'Bargain' };
const RARITY_LABEL: Record<Rarity, string> = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare' };
const RARITY_PIPS: Record<Rarity, number> = { common: 1, uncommon: 2, rare: 3 };

/** The score bonus a curse or bargain brings, for example "+30%"; nothing for a boon. */
export function cardBonus(card: Card): string | null {
  return card.mult > 0 ? `+${Math.round(card.mult * 100)}%` : null;
}

/**
 * The inside of a card: used by the choice buttons and the Collection tiles. The kind and the
 * bonus head it, then the name and what it does. Rarity is three pips; a picked card shows a tick.
 * `board` is the board the card leads to, so a card can name its numbers for that board.
 */
export function CardBody({ card, selected = false, board }: { card: Card; selected?: boolean; board?: BoardView }) {
  const bonus = cardBonus(card);
  return (
    <>
      <span className="cb-run-card-top">
        <span className="cb-run-kind">
          <KindIcon kind={card.kind} className="cb-run-kind-icon" />
          {KIND_LABEL[card.kind]}
        </span>
        {bonus && (
          <span className="cb-run-bonus">
            {bonus}
            <span className="cb-run-visually-hidden"> score on that board</span>
          </span>
        )}
      </span>
      <span className="cb-run-card-name">
        {card.name}
        {selected && <CheckIcon className="cb-run-picked-icon" />}
      </span>
      <span className="cb-run-card-text">{cardText(card, board)}</span>
      <span className="cb-run-pips" role="img" aria-label={RARITY_LABEL[card.rarity]} title={RARITY_LABEL[card.rarity]}>
        {Array.from({ length: 3 }, (_, i) => (
          <span key={i} className={'cb-run-pip' + (i < RARITY_PIPS[card.rarity] ? ' is-on' : '')} />
        ))}
      </span>
    </>
  );
}
