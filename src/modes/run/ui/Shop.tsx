// The shop after a board: two lenses and two consumables for sale, a reroll, and the run's own
// lenses to sell or reorder (they fire in slot order). The stock deals in as the shop opens and on
// every reroll, and a lens or an ink bought flies from its card into the loadout.
import { itemById } from '../items';
import { lensById } from '../lenses';
import type { RunState } from '../model';
import { canBuyItem, canBuyLens, priceOfItem, rerollCost } from '../shop';
import { CoinIcon, RerollIcon } from './icons';
import { Coins, ItemTile, LensCard, Loadout, LoadoutActions, Page, RunHearts, RunScore, sendToLoadout, Track, whereLabel } from './parts';

export interface ShopProps {
  run: RunState;
  onBuyLens: (k: number) => void;
  onBuyItem: (k: number) => void;
  onSell: (slot: number) => void;
  onMove: (from: number, to: number) => void;
  onReroll: () => void;
  onUse: (k: number) => void;
  onLeave: () => void;
  onHome: () => void;
}

/** The tile on the card a price button sits on, for the flight into the loadout. */
const tileOf = (button: Element) => button.closest('li')?.querySelector('.cb-run-lens, .cb-run-item') ?? null;

function Price({ value, can, label, onClick }: { value: number; can: boolean; label: string; onClick: (button: HTMLButtonElement) => void }) {
  return (
    <button type="button" className="cb-run-btn is-price" disabled={!can} aria-label={`${label} for ${value} coins`} onClick={(e) => onClick(e.currentTarget)}>
      <CoinIcon className="cb-run-coin" />
      {value}
    </button>
  );
}

export function Shop({ run, onBuyLens, onBuyItem, onSell, onMove, onReroll, onUse, onLeave, onHome }: ShopProps) {
  const shop = run.shop;
  if (!shop) return null;
  const cost = rerollCost(shop.rerolls);
  return (
    <Page title="Shop" onBack={onHome}>
      <div className="cb-run-head">
        <Track run={run} at={run.slot + 1} label={whereLabel(run)} />
        <div className="cb-run-row">
          <RunHearts run={run} />
          <span className="cb-run-bigcoins">
            <Coins value={run.coins} />
          </span>
          <RunScore value={run.score} />
        </div>
      </div>

      <section aria-label="For sale">
        <ul className="cb-run-stock is-dealt">
          {shop.lenses.map((id, k) => {
            const def = id ? lensById(id) : undefined;
            return (
              <li key={`l${k}:${shop.rerolls}`} className={def ? '' : 'is-sold'} style={{ ['--k' as string]: k }}>
                {def ? (
                  <LensCard def={def}>
                    <Price
                      value={def.price}
                      can={canBuyLens(run, k)}
                      label={`Buy ${def.name}`}
                      onClick={(b) => {
                        sendToLoadout(`lens:${def.id}`, tileOf(b));
                        onBuyLens(k);
                      }}
                    />
                  </LensCard>
                ) : (
                  <span className="cb-run-sold" aria-label="Sold" />
                )}
              </li>
            );
          })}
          {shop.items.map((id, k) => {
            const def = id ? itemById(id) : undefined;
            return (
              <li key={`i${k}:${shop.rerolls}`} className={def ? '' : 'is-sold'} style={{ ['--k' as string]: shop.lenses.length + k }}>
                {def ? (
                  <div className="cb-run-lenscard is-item">
                    <ItemTile id={def.id} size="lg" />
                    <div className="cb-run-lenscard-words">
                      <span className="cb-run-card-name">{def.name}</span>
                      <span className="cb-run-card-text">{def.text}</span>
                    </div>
                    <Price
                      value={priceOfItem(def.id)}
                      can={canBuyItem(run, k)}
                      label={`Buy ${def.name}`}
                      onClick={(b) => {
                        sendToLoadout(`item:${def.id}`, tileOf(b));
                        onBuyItem(k);
                      }}
                    />
                  </div>
                ) : (
                  <span className="cb-run-sold" aria-label="Sold" />
                )}
              </li>
            );
          })}
        </ul>
        <div className="cb-run-actions">
          <button type="button" className="cb-run-btn" disabled={run.coins < cost} onClick={onReroll} aria-label={`Reroll for ${cost} coins`}>
            <RerollIcon className="cb-run-btn-icon" />
            Reroll
            <span className="cb-run-coins is-inline">
              <CoinIcon className="cb-run-coin" />
              {cost}
            </span>
          </button>
        </div>
      </section>

      <Loadout run={run} actions={(pick) => <LoadoutActions run={run} pick={pick} onMove={onMove} onUse={onUse} onSell={onSell} />} />

      <div className="cb-run-actions is-dock">
        <button type="button" className="cb-run-btn is-primary is-wide" onClick={onLeave}>
          Next board
        </button>
      </div>
    </Page>
  );
}
