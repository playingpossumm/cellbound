// The pieces every Run screen shares, drawn rather than written: the page frame, hearts, coins,
// the track of nine boards, the score meter, lens and item tiles and reward cards.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { bump, EASE_IN_OUT, moves, scale, spring } from '../../../app/motion';
import { soundLand } from '../../../app/sound';
import { TopBar } from '../../../app/TopBar';
import { useReducedMotion } from '../../../app/theme';
import { useScreenEntry } from '../../screenEntry';
import { anteOf, ANTES, isBoss, KINDS, slotOf } from '../boards';
import { BOSS_NAMES, type BossRule } from '../bosses';
import { itemById, TIER_NAMES } from '../items';
import { lensById, maxHeartsOf, type LensDef } from '../lenses';
import type { BoardResult, ItemId, LensSlot, RewardId, RunState } from '../model';
import { isBargain, REWARDS, rewardById } from '../rewards';
import { sellValue } from '../shop';
import { formatScore, KIND_NAMES, resultOf } from '../state';
import { SLOTS } from '../tuning';
import { CategoryIcon, CheckIcon, CoinIcon, HeartIcon, InkIcon, ShieldIcon, SpectrumIcon } from './icons';

/**
 * A Run page: the app's top bar (menu and back), then the page. The page's title is its heading,
 * unless the page brings a heading of its own (a won run's prism).
 */
export function Page({ title, heading, onBack, children, wide }: { title?: string; heading?: ReactNode; onBack?: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useScreenEntry<HTMLElement>();
  return (
    <div className="cb-run">
      <TopBar title="Run" quietTitle={!!title || !!heading} onBack={onBack} />
      <main className={`cb-run-page${wide ? ' is-wide' : ''}`} ref={ref} tabIndex={-1}>
        {heading ?? (title && <h1 className="cb-run-title">{title}</h1>)}
        {children}
      </main>
    </div>
  );
}

/** A word as one span per letter, so the letters can move one by one; it reads as the word. */
export function Letters({ text }: { text: string }) {
  return (
    <>
      {Array.from(text, (ch, i) => (
        <span key={i} className="cb-run-ch">
          {ch}
        </span>
      ))}
    </>
  );
}

/**
 * Hearts out of their slots. A heart lost in view falls out of the row (360 ms) before it shows as
 * lost; the label says the new count at once.
 */
export function Hearts({ now, slots, shield = 0 }: { now: number; slots: number; shield?: number }) {
  const label = `${now} ${now === 1 ? 'heart' : 'hearts'}` + (shield ? `, ${shield} ${shield === 1 ? 'shield' : 'shields'}` : '');
  const [fall, setFall] = useState<{ from: number; to: number } | null>(null);
  const was = useRef(now);
  useLayoutEffect(() => {
    const before = was.current;
    was.current = now;
    if (now >= before || !moves()) {
      setFall(null);
      return;
    }
    setFall({ from: now, to: before });
    const t = setTimeout(() => setFall(null), 380);
    return () => clearTimeout(t);
  }, [now]);
  return (
    <span className="cb-run-hearts" role="img" aria-label={label}>
      {Array.from({ length: Math.max(slots, now) }, (_, i) => {
        const falling = !!fall && i >= fall.from && i < fall.to;
        return <HeartIcon key={i} className={'cb-run-heart' + (i < now || falling ? ' is-full' : '') + (falling ? ' is-falling' : '')} filled={i < now || falling} />;
      })}
      {shield > 0 && (
        <span className="cb-run-shield">
          <ShieldIcon className="cb-run-shield-icon" filled />
          {shield > 1 && <span>{shield}</span>}
        </span>
      )}
    </span>
  );
}

/** The run's hearts, out of the slots it can hold. */
export function RunHearts({ run }: { run: RunState }) {
  return <Hearts now={run.hearts} slots={maxHeartsOf(run)} shield={run.shield} />;
}

/** The run's score so far, at the end of a status row; nothing before there is one. */
export function RunScore({ value }: { value: number }) {
  if (!value) return null;
  return (
    <span className="cb-run-figure" aria-label={`Run score ${formatScore(value)}`}>
      {formatScore(value)}
    </span>
  );
}

export function Coins({ value, label = 'coins' }: { value: number; label?: string }) {
  return (
    <span className="cb-run-coins" role="img" aria-label={`${value} ${label}`}>
      <CoinIcon className="cb-run-coin" />
      <span aria-hidden="true">{value}</span>
    </span>
  );
}

type Mark = 'cleared' | 'missed' | 'skipped' | 'lost' | 'now' | 'later';

function markOf(r: BoardResult | undefined, slot: number, at: number): Mark {
  if (r) return r.status === 'cleared' ? 'cleared' : r.status === 'skipped' ? 'skipped' : r.status === 'missed' ? 'missed' : 'lost';
  return slot === at ? 'now' : 'later';
}

/**
 * The nine boards of a run, in three antes. A boss is drawn larger. Cleared boards are filled,
 * a skipped one is dashed, a missed one slashed, a broken one crossed, and the board in play
 * (or next) is ringed. The words go to screen readers.
 */
export function Track({ run, at = run?.slot ?? -1, label }: { run?: RunState; at?: number; label: string }) {
  return (
    <span className="cb-run-track">
      <span className="cb-run-antes" aria-hidden="true">
        {Array.from({ length: ANTES }, (_, a) => (
          <span key={a} className="cb-run-ante-pips">
            {KINDS.map((k) => {
              const slot = slotOf(a + 1, k);
              const mark = run ? markOf(resultOf(run, slot), slot, at) : 'later';
              return (
                <svg key={k} className={`cb-run-pip is-${mark}${isBoss(slot) ? ' is-boss' : ''}`} viewBox="0 0 20 20" focusable="false">
                  <rect className="cb-run-pip-fill" x="2" y="2" width="16" height="16" rx="4" />
                  {mark === 'missed' && <path className="cb-run-pip-mark" d="M5.5 14.5l9-9" />}
                  {mark === 'lost' && <path className="cb-run-pip-mark" d="M6 6l8 8M14 6l-8 8" />}
                </svg>
              );
            })}
          </span>
        ))}
      </span>
      <span className="cb-run-sr">{label}</span>
    </span>
  );
}

/** "Ante 2, Big board of 3": where a run stands, for screen readers. */
export function whereLabel(run: RunState): string {
  return `Ante ${anteOf(run.slot)} of ${ANTES}, ${KIND_NAMES[KINDS[run.slot % 3]]} board`;
}

/** Score against target: a glass track filled in spectrum, the target at its end. */
export function Meter({ score, target }: { score: number; target: number }) {
  const share = target > 0 ? Math.min(1, score / target) : 0;
  return (
    <span className={`cb-run-meter${score >= target && target > 0 ? ' is-met' : ''}`} aria-hidden="true">
      <span className="cb-run-meter-fill" style={{ transform: `scaleX(${share})` }} />
    </span>
  );
}

/**
 * Counts a number up to its new value: quick on a placement, longer for a board's tally, which
 * starts from `start` when it opens. Instant with reduced motion.
 */
export function useCountUp(value: number, ms = 240, start: number = value): number {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : start);
  const from = useRef(start);
  const shownRef = useRef(start);
  shownRef.current = shown;
  useEffect(() => {
    if (reduce || ms <= 0 || typeof requestAnimationFrame === 'undefined') {
      setShown(value);
      return;
    }
    from.current = shownRef.current;
    if (from.current === value) return;
    const start = performance.now();
    let frame = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      // Strong ease-out, as the Run's other motion.
      const e = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(from.current + (value - from.current) * e));
      if (k < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, ms, reduce]);
  return shown;
}

// ---- arrivals --------------------------------------------------------------------------

/**
 * What was just bought or taken, on its way into the loadout: where its tile was in the shop, or
 * nowhere for a card taken on the screen before. The tile that shows it in the loadout picks it up
 * when it first draws, and flies in from the shop's tile or springs in where it lands.
 */
const arriving = new Map<string, { from: DOMRect | null; at: number }>();

/** Sends a lens, an item or a card into the loadout (`lens:id`, `item:id`, `perk:id`). */
export function sendToLoadout(key: string, from?: Element | null): void {
  arriving.clear();
  if (moves()) arriving.set(key, { from: from?.getBoundingClientRect() ?? null, at: Date.now() });
}

function useArrival(key: string, ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const a = arriving.get(key);
    const el = ref.current;
    if (!a || !el || Date.now() - a.at > 2000) return;
    arriving.delete(key);
    if (!a.from) {
      spring(el, 0.82, 1, scale, 520, 18);
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
      soundLand();
      return;
    }
    const to = el.getBoundingClientRect();
    const dx = a.from.left + a.from.width / 2 - (to.left + to.width / 2);
    const dy = a.from.top + a.from.height / 2 - (to.top + to.height / 2);
    const s = to.width ? a.from.width / to.width : 1;
    el.animate(
      [
        { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${s.toFixed(3)})` },
        { transform: `translate(${dx.toFixed(1)}px, ${(dy - 18).toFixed(1)}px) scale(${(s * 1.06).toFixed(3)})`, offset: 0.3 },
        { transform: 'none' },
      ],
      { duration: 640, easing: EASE_IN_OUT },
    ).finished.then(
      () => {
        bump(el, 0.12);
        soundLand();
      },
      () => undefined,
    );
    // Once, on the tile's first draw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// ---- lenses and items ------------------------------------------------------------------

export function LensTile({
  slot,
  firing = false,
  delay = 0,
  kick = 1,
  selected = false,
  onClick,
  size = 'md',
}: {
  slot: LensSlot;
  firing?: boolean;
  delay?: number;
  /** How hard a firing lens kicks: 1 for its turn in a placement's whole show, less for a quick one. */
  kick?: number;
  selected?: boolean;
  onClick?: () => void;
  size?: 'md' | 'lg';
}) {
  const ref = useRef<HTMLElement>(null);
  useArrival(`lens:${slot.id}`, ref);
  const def = lensById(slot.id);
  if (!def) return null;
  const body = (
    <>
      <span className={`cb-run-lens-badge is-${def.tone}`}>{def.badge(slot)}</span>
      <span className="cb-run-lens-name">{def.name}</span>
    </>
  );
  const cls = `cb-run-lens is-${def.rarity} is-${size}${firing ? ' is-firing' : ''}${selected ? ' is-selected' : ''}`;
  const style = firing ? ({ animationDelay: `${delay}ms`, '--rn-jolt': kick } as React.CSSProperties) : undefined;
  return onClick ? (
    <button
      type="button"
      ref={ref as RefObject<HTMLButtonElement | null>}
      className={cls}
      style={style}
      aria-pressed={selected}
      aria-label={`${def.name}: ${def.text}`}
      title={def.name}
      onClick={onClick}
    >
      {body}
    </button>
  ) : (
    <span ref={ref as RefObject<HTMLSpanElement | null>} className={cls} style={style} role="img" aria-label={`${def.name}: ${def.text}`}>
      {body}
    </span>
  );
}

export function ItemTile({ id, selected = false, onClick, size = 'md' }: { id: ItemId; selected?: boolean; onClick?: () => void; size?: 'md' | 'lg' }) {
  const ref = useRef<HTMLElement>(null);
  useArrival(`item:${id}`, ref);
  const def = itemById(id);
  if (!def) return null;
  const tier = def.tier ?? 0;
  const body =
    def.kind === 'spectra' ? (
      <>
        <SpectrumIcon className="cb-run-item-icon" />
        <span className="cb-run-item-tier">{tier}</span>
      </>
    ) : (
      <InkIcon className="cb-run-item-icon" />
    );
  const cls = `cb-run-item is-${def.kind} is-${size}${def.kind === 'spectra' ? ` cb-run-t${tier}` : ''}${selected ? ' is-selected' : ''}`;
  return onClick ? (
    <button
      type="button"
      ref={ref as RefObject<HTMLButtonElement | null>}
      className={cls}
      aria-pressed={selected}
      aria-label={`${def.name}: ${def.text}`}
      title={def.name}
      onClick={onClick}
    >
      {body}
    </button>
  ) : (
    <span ref={ref as RefObject<HTMLSpanElement | null>} className={cls} role="img" aria-label={`${def.name}: ${def.text}`}>
      {body}
    </span>
  );
}

/**
 * A card that stays for the run, as a pill: its category's glyph and colour, its name and, when it
 * stacks, how many of it the run holds. A glyph alone would not tell three hint cards apart.
 */
export function PerkTile({ id, count, selected = false, onClick }: { id: RewardId; count: number; selected?: boolean; onClick?: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useArrival(`perk:${id}`, ref);
  const def = rewardById(id);
  if (!def) return null;
  const name = count > 1 ? `${def.name} ×${count}` : def.name;
  const body = (
    <>
      <CategoryIcon category={def.category} className="cb-run-perk-icon" />
      <span className="cb-run-perk-name">{def.name}</span>
      {count > 1 && <span className="cb-run-perk-n">×{count}</span>}
    </>
  );
  const cls = `cb-run-perk is-${def.category} is-${def.rarity}${selected ? ' is-selected' : ''}`;
  return onClick ? (
    <button type="button" ref={ref as RefObject<HTMLButtonElement | null>} className={cls} aria-pressed={selected} aria-label={`${name}: ${def.text}`} onClick={onClick}>
      {body}
    </button>
  ) : (
    <span ref={ref as RefObject<HTMLSpanElement | null>} className={cls} role="img" aria-label={`${name}: ${def.text}`}>
      {body}
    </span>
  );
}

/** Empty slots, drawn so the room for more shows. */
export function EmptySlots({ count, kind }: { count: number; kind: 'lens' | 'item' }) {
  return (
    <>
      {Array.from({ length: Math.max(0, count) }, (_, i) => (
        <span key={i} className={`cb-run-slot is-${kind}`} aria-hidden="true" />
      ))}
    </>
  );
}

/** Cards the run holds that stay, by how many of each. */
export const heldCards = (run: Pick<RunState, 'perks'>) => REWARDS.filter((r) => (run.perks[r.id] ?? 0) > 0);

/** True when there is anything of the run's to show: a lens, an item or a card that stays. */
export const hasLoadout = (run: Pick<RunState, 'lenses' | 'items' | 'perks'>) => run.lenses.length > 0 || run.items.length > 0 || heldCards(run).length > 0;

/** A picked tile in the loadout: a lens or an item by its slot, a card by its id. */
export interface LoadoutPick {
  lens?: number;
  item?: number;
  perk?: RewardId;
}

/** What a lens, an item or a card says, for the detail line under a row of tiles. */
export function describe(what: { lens?: LensSlot; item?: ItemId; perk?: { id: RewardId; count: number } }): { name: string; text: string } | null {
  if (what.lens) {
    const d = lensById(what.lens.id);
    return d ? { name: d.name, text: d.text } : null;
  }
  if (what.item) {
    const d = itemById(what.item);
    return d ? { name: d.name, text: d.text } : null;
  }
  if (what.perk) {
    const d = rewardById(what.perk.id);
    return d ? { name: what.perk.count > 1 ? `${d.name} ×${what.perk.count}` : d.name, text: d.text } : null;
  }
  return null;
}

/** A picked tile by what it is: the nth of the `of` tiles with its id, or a card by its id. */
type Held = { kind: 'lens' | 'item'; id: string; nth: number; of: number } | { kind: 'perk'; id: RewardId };

/** The tile at slot k of a row of ids, as a pick. */
function holdOf(kind: 'lens' | 'item', ids: readonly string[], k: number): Held {
  const id = ids[k]!;
  return { kind, id, nth: ids.slice(0, k).filter((x) => x === id).length, of: ids.filter((x) => x === id).length };
}

/** Where that tile sits now in the row, or -1 when it went away (or a twin of it did). */
function whereIs(ids: readonly string[], id: string, nth: number, of: number): number {
  const at = ids.flatMap((x, i) => (x === id ? [i] : []));
  return at.length === of ? (at[nth] ?? -1) : -1;
}

/**
 * The run's lenses, items and cards that stay, with the empty slots. A tap picks a tile and its
 * words show below the rows, with the actions the screen offers for it.
 */
export function Loadout({
  run,
  actions,
  slots = true,
}: {
  run: RunState;
  /** The buttons for a picked tile. */
  actions?: (pick: LoadoutPick) => ReactNode;
  slots?: boolean;
}) {
  // A picked tile is remembered by what it is, not by where it sits, so a lens that moves stays
  // picked, and one that is sold, or an item that is used, drops the pick instead of handing it to
  // whatever slides into its place.
  const [held, setHeld] = useState<Held | null>(null);
  const lensIds = run.lenses.map((l) => l.id);
  const heldAt = held && held.kind !== 'perk' ? whereIs(held.kind === 'lens' ? lensIds : run.items, held.id, held.nth, held.of) : -1;
  const pick: LoadoutPick | null =
    held?.kind === 'lens' && heldAt >= 0
      ? { lens: heldAt }
      : held?.kind === 'item' && heldAt >= 0
        ? { item: heldAt }
        : held?.kind === 'perk' && (run.perks[held.id] ?? 0) > 0
          ? { perk: held.id }
          : null;
  const lens = pick?.lens !== undefined ? run.lenses[pick.lens] : undefined;
  const item = pick?.item !== undefined ? run.items[pick.item] : undefined;
  const perks = heldCards(run);
  const perk = pick?.perk ? { id: pick.perk, count: run.perks[pick.perk]! } : undefined;
  const words = describe({ lens, item, perk });
  useEffect(() => {
    if (held && !pick) setHeld(null);
  }, [held, pick]);
  // The words and buttons for a picked tile open under the rows, which on a phone can be below the
  // screen: bring them in, no further than needed.
  const detail = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const picked = held ? (held.kind === 'perk' ? `perk:${held.id}` : `${held.kind}:${held.id}:${held.nth}`) : '';
  useEffect(() => {
    if (picked) detail.current?.scrollIntoView?.({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [picked, reduce]);
  return (
    <div className="cb-run-loadout">
      {(slots || run.lenses.length > 0 || run.items.length > 0) && (
        <div className="cb-run-tiles" role="group" aria-label="Lenses and items">
          {run.lenses.map((l, k) => (
            <LensTile key={`${l.id}${k}`} slot={l} selected={pick?.lens === k} onClick={() => setHeld(pick?.lens === k ? null : holdOf('lens', lensIds, k))} />
          ))}
          {slots && <EmptySlots count={SLOTS.lenses - run.lenses.length} kind="lens" />}
          <span className="cb-run-tiles-gap" aria-hidden="true" />
          {run.items.map((id, k) => (
            <ItemTile key={`${id}${k}`} id={id} selected={pick?.item === k} onClick={() => setHeld(pick?.item === k ? null : holdOf('item', run.items, k))} />
          ))}
          {slots && <EmptySlots count={SLOTS.consumables - run.items.length} kind="item" />}
        </div>
      )}
      {perks.length > 0 && (
        <div className="cb-run-tiles is-perks" role="group" aria-label="Cards">
          {perks.map((r) => (
            <PerkTile key={r.id} id={r.id} count={run.perks[r.id]!} selected={pick?.perk === r.id} onClick={() => setHeld(pick?.perk === r.id ? null : { kind: 'perk', id: r.id })} />
          ))}
        </div>
      )}
      {words && pick && (
        <div className="cb-run-detail" role="status" ref={detail}>
          <p>
            <strong>{words.name}</strong> {words.text}
          </p>
          {actions && <div className="cb-run-detail-actions">{actions(pick)}</div>}
        </div>
      )}
    </div>
  );
}

/** The buttons for a picked tile between boards: a lens moves (and sells, in the shop), a Spectra is used. */
export function LoadoutActions({
  run,
  pick,
  onMove,
  onUse,
  onSell,
}: {
  run: RunState;
  pick: { lens?: number; item?: number };
  onMove: (from: number, to: number) => void;
  onUse: (k: number) => void;
  onSell?: (slot: number) => void;
}) {
  if (pick.lens !== undefined) {
    const k = pick.lens;
    const value = sellValue(run, k);
    return (
      <>
        {onSell && (
          <button type="button" className="cb-run-btn is-small" onClick={() => onSell(k)} aria-label={`Sell for ${value} coins`}>
            Sell
            <span className="cb-run-coins is-inline">
              <CoinIcon className="cb-run-coin" />
              {value}
            </span>
          </button>
        )}
        <button type="button" className="cb-run-btn is-small" disabled={k === 0} onClick={() => onMove(k, k - 1)}>
          Move left
        </button>
        <button type="button" className="cb-run-btn is-small" disabled={k === run.lenses.length - 1} onClick={() => onMove(k, k + 1)}>
          Move right
        </button>
      </>
    );
  }
  const id = pick.item !== undefined ? run.items[pick.item] : undefined;
  if (id && itemById(id)?.kind === 'spectra') {
    return (
      <button type="button" className="cb-run-btn is-small is-primary" onClick={() => onUse(pick.item!)}>
        Use
      </button>
    );
  }
  return null;
}

// ---- cards -----------------------------------------------------------------------------

/** The inside of a reward card: its category glyph and colour, its name, what it does, and a bargain's cost. */
export function CardBody({ id, selected = false }: { id: RewardId; selected?: boolean }) {
  const def = rewardById(id);
  if (!def) return null;
  return (
    <>
      <span className="cb-run-card-top">
        <CategoryIcon category={def.category} className="cb-run-card-icon" />
        {selected && <CheckIcon className="cb-run-card-check" />}
      </span>
      <span className="cb-run-card-name">{def.name}</span>
      <span className="cb-run-card-text">{def.text}</span>
      {isBargain(def) && <span className="cb-run-card-cost">{def.cost}</span>}
    </>
  );
}

export function cardClass(id: RewardId): string {
  const def = rewardById(id);
  return def ? `cb-run-card is-${def.category} is-${def.rarity}${isBargain(def) ? ' is-bargain' : ''}` : 'cb-run-card';
}

/** A lens offered or listed: the tile, its name, what it does. */
export function LensCard({ def, n, children }: { def: LensDef; n?: number; children?: ReactNode }) {
  return (
    <div className={`cb-run-lenscard is-${def.rarity}`}>
      <LensTile slot={{ id: def.id, n }} size="lg" />
      <div className="cb-run-lenscard-words">
        <span className="cb-run-card-name">{def.name}</span>
        <span className="cb-run-card-text">{def.text}</span>
      </div>
      {children}
    </div>
  );
}

/** A boss rule, as a chip. */
export function BossTag({ rule, shown }: { rule: BossRule; shown: boolean }) {
  return <span className={`cb-run-boss${shown ? '' : ' is-hidden'}`}>{shown ? BOSS_NAMES[rule] : '?'}</span>;
}

/** A tier's dot, in its spectrum colour. */
export function TierDot({ tier }: { tier: number }) {
  return <span className={`cb-run-tierdot cb-run-t${tier}`} aria-hidden="true" title={TIER_NAMES[tier]} />;
}

export { formatScore };
