// Consumables, bought in the shop and held in two slots: Spectra level a tier for the rest of
// the run, Inks are one-shot effects used on a board.
import type { TechniqueTier } from '../../engine/techniques';
import type { InkId, ItemId, SpectraId } from './model';
import { PRICES, SPECTRA_MARKS } from './tuning';

/** Each tier's name, as the codex and the Spectra use it. Tier 0 is a guess. */
export const TIER_NAMES: readonly string[] = ['Guesses', 'Singles', 'Hidden singles', 'Clues', 'Pointing', 'Pairs', 'X-Wings', 'Wings', 'Chains'];

export interface ItemDef {
  id: ItemId;
  name: string;
  text: string;
  price: number;
  kind: 'spectra' | 'ink';
  /** The tier a Spectra levels. */
  tier?: TechniqueTier;
}

const spectra = (tier: TechniqueTier): ItemDef => ({
  id: `spectra${tier}` as SpectraId,
  name: `${TIER_NAMES[tier]} Spectrum`,
  text: `+${SPECTRA_MARKS[tier]} marks on ${TIER_NAMES[tier].toLowerCase()} for the rest of the run.`,
  price: PRICES.spectra,
  kind: 'spectra',
  tier,
});

const ink = (id: InkId, name: string, text: string, price: number): ItemDef => ({ id, name, text, price, kind: 'ink' });

export const ITEMS: readonly ItemDef[] = [
  ...([1, 2, 3, 4, 5, 6, 7, 8] as TechniqueTier[]).map(spectra),
  ink('inkReveal', 'Reveal Ink', "Fills in the selected cell, or a cell of the board's choosing.", PRICES.ink.reveal),
  ink('inkClear', 'Clear Ink', 'Clears the fog around the selected cell.', PRICES.ink.clear),
  ink('inkHint', 'Hint Ink', '+1 hint on this board.', PRICES.ink.hint),
  ink('inkVoid', 'Void Ink', "Lifts this board's boss rule.", PRICES.ink.void),
];

const byId = new Map(ITEMS.map((i) => [i.id, i]));

export function itemById(id: string): ItemDef | undefined {
  return byId.get(id as ItemId);
}

export const isInk = (id: ItemId): id is InkId => id.startsWith('ink');
