import type { Card, CardKind, Rarity } from '../cards';
import { CheckIcon, KindIcon } from './icons';

const KIND_LABEL: Record<CardKind, string> = { boon: 'Boon', curse: 'Curse', bargain: 'Bargain' };
const RARITY_LABEL: Record<Rarity, string> = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare' };
const RARITY_PIPS: Record<Rarity, number> = { common: 1, uncommon: 2, rare: 3 };

export function cardFooter(card: Card): string {
  return card.mult > 0 ? `Score +${Math.round(card.mult * 100)}% on that board.` : 'No change to your score.';
}

/** The inside of a card: used by the choice buttons and the Collection tiles. */
export function CardBody({ card, selected = false }: { card: Card; selected?: boolean }) {
  return (
    <>
      <span className="cb-run-card-top">
        <span className="cb-run-kind">
          <KindIcon kind={card.kind} className="cb-run-kind-icon" />
          {KIND_LABEL[card.kind]}
        </span>
        <span className="cb-run-rarity">
          <span className="cb-run-pips" aria-hidden="true">
            {Array.from({ length: 3 }, (_, i) => (
              <span key={i} className={'cb-run-pip' + (i < RARITY_PIPS[card.rarity] ? ' is-on' : '')} />
            ))}
          </span>
          {RARITY_LABEL[card.rarity]}
        </span>
      </span>
      <span className="cb-run-card-name">
        {card.name}
        {selected && (
          <span className="cb-run-picked">
            <CheckIcon className="cb-run-picked-icon" />
            Selected
          </span>
        )}
      </span>
      <span className="cb-run-card-text">{card.text}</span>
      <span className="cb-run-card-foot">{cardFooter(card)}</span>
    </>
  );
}
