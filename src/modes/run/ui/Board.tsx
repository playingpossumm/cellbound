// The board in play, on the shared play screen: the score band in the band's place (score against
// target, the last marks times mult, the flow, hearts and coins), the lenses and items under it,
// the boss rule as a chip, popups over the cells, and the board's tally when it ends.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import type { GameNote, GameViewProps } from '../../../app/GameView';
import { bump, EASE_OUT, fly, moves, scale, shake, shakeLoose, spring } from '../../../app/motion';
import { useReducedMotion } from '../../../app/theme';
import { TECHNIQUES, type TechniqueId } from '../../../engine/techniques';
import { getGame, startGame, useGame } from '../../../game/store';
import { formatDateLong } from '../../../game/logic';
import type { GameState } from '../../../game/types';
import { SLOT_SPECS } from '../boards';
import { gameKey, prepareBoard, type Prepared } from '../board';
import { BOSS_NAMES, bossText, clockMs } from '../bosses';
import { itemById, TIER_NAMES } from '../items';
import { lensById, maxHeartsOf } from '../lenses';
import type { TallyFx } from '../live';
import { planOf, SHOW_TIER, type Beat } from '../show';
import type { BoardResult, RunState } from '../model';
import { flowCap, flowOf } from '../scoring';
import { placePopup, popupSize, WEIGHT, type Box, type Ground } from '../popups';
import { formatMult, formatScore, slotName } from '../state';
import { inkUsable, landPoints, playedBoard, runActions, useRunStore } from '../store';
import { CheckIcon, CoinIcon, TargetIcon } from './icons';
import { Coins, Hearts, ItemTile, Letters, LensTile, Meter, Page, TierDot, useCountUp } from './parts';

// ---- the score band --------------------------------------------------------------------

const bandScore = () => document.querySelector('.cb-run-band-score');

// Points whose show or popup went before they flew land on the next tick, so that React's
// development double mount, which unmounts and mounts again at once, keeps them in the air.
const landing = new Map<number, ReturnType<typeof setTimeout>>();
function landSoon(id: number) {
  clearTimeout(landing.get(id));
  landing.set(
    id,
    setTimeout(() => {
      landing.delete(id);
      landPoints(id);
    }, 0),
  );
}
function stayAloft(id: number) {
  clearTimeout(landing.get(id));
  landing.delete(id);
}

/** One placement's marks times mult. */
function TallyLine({ t }: { t: TallyFx | null }) {
  if (!t) return <span className="cb-run-tally is-empty" aria-hidden="true" />;
  return <TallyShow key={t.id} t={t} />;
}

function TallyShow({ t }: { t: TallyFx }) {
  const [plan] = useState(() => planOf(t, moves()));
  const [beat, setBeat] = useState(-1);
  const line = useRef<HTMLSpanElement>(null);
  const marks = useRef<HTMLSpanElement>(null);
  const mult = useRef<HTMLSpanElement>(null);
  const points = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!plan.full) {
      // Marks and mult light together, a beat after the digit lands.
      const t0 = setTimeout(() => {
        bump(marks.current, 0.16);
        bump(mult.current, 0.16);
      }, 60);
      return () => clearTimeout(t0);
    }
    stayAloft(t.id);
    const timers = plan.beats.map((b, i) => setTimeout(() => setBeat(i), b.at));
    timers.push(
      setTimeout(() => {
        const to = bandScore();
        if (points.current && to) void fly(points.current, to, `+${formatScore(t.points)}`, 480).then(() => landPoints(t.id));
        else landPoints(t.id);
      }, plan.flyAt),
    );
    // A newer placement cuts the show short: these points land at once.
    return () => {
      timers.forEach(clearTimeout);
      landSoon(t.id);
    };
  }, [plan, t.id, t.points]);
  // Each beat bumps what it changed, and the last one shakes the sum.
  const was = useRef<Beat | null>(null);
  useEffect(() => {
    const b = plan.beats[beat];
    if (!b) return;
    const prev = was.current;
    if (!prev || prev.marks !== b.marks) bump(marks.current, 0.16);
    if (b.mult !== null && prev?.mult !== b.mult) bump(mult.current, 0.16);
    if (b.points) {
      bump(points.current, 0.2);
      shake(line.current, t.tier >= 6 ? 6 : 3.5);
    }
    was.current = b;
  }, [beat, plan, t.tier]);
  const b = plan.full ? (plan.beats[beat] ?? null) : null;
  const wait = (on: boolean) => (plan.full && !on ? ' is-wait' : '');
  return (
    <span className={`cb-run-tally${plan.full ? ' is-show' : ''}`} ref={line} aria-hidden="true">
      <span className={`cb-run-marks${wait(!!b)}`} ref={marks}>
        {formatScore(b ? b.marks : t.marks)}
      </span>
      <span className={`cb-run-times${wait(!!b && b.mult !== null)}`}>×</span>
      <span className={`cb-run-mult${wait(!!b && b.mult !== null)}`} ref={mult}>
        {formatMult(b?.mult ?? t.mult)}
      </span>
      <span className={`cb-run-points${wait(!!b?.points)}`} ref={points}>
        +{formatScore(t.points)}
      </span>
    </span>
  );
}

function FlowMeter({ flow, cap }: { flow: number; cap: number }) {
  const share = cap > 1 ? (flow - 1) / (cap - 1) : 0;
  return (
    <span className={`cb-run-flow${flow >= cap ? ' is-full' : ''}`} aria-label={`Flow ×${formatMult(flow)}`} role="img">
      <span className="cb-run-flow-label" aria-hidden="true">
        Flow
      </span>
      <span className="cb-run-flow-track" aria-hidden="true">
        <span className="cb-run-flow-fill" style={{ transform: `scaleX(${Math.max(0, Math.min(1, share))})` }} />
      </span>
      <span className="cb-run-flow-value" aria-hidden="true">
        ×{formatMult(flow)}
      </span>
    </span>
  );
}

function ScoreBand({ run }: { run: RunState }) {
  const tally = useRunStore((s) => s.fx.tally);
  const popups = useRunStore((s) => s.fx.popups);
  const air = useRunStore((s) => s.fx.air);
  const live = run.live;
  // Once the board is over, the band keeps its final score while the tally is on screen.
  const done = live ? null : run.results[run.results.length - 1];
  const now = live ? { score: live.score, target: live.target, hearts: live.hearts, shield: live.shield } : done ? { score: done.score, target: done.target, hearts: run.hearts, shield: run.shield } : null;
  // The score on show leaves out the points still flying to it, and bumps as each lands.
  const landed = (now?.score ?? 0) - Object.values(air).reduce((s, x) => s + x, 0);
  const score = useCountUp(landed, 240);
  const scoreEl = useRef<HTMLSpanElement>(null);
  const before = useRef(landed);
  useEffect(() => {
    if (landed > before.current) bump(scoreEl.current, 0.08);
    before.current = landed;
  }, [landed]);
  if (!now) return null;
  const last = popups[popups.length - 1];
  const met = landed >= now.target;
  return (
    <div className={`cb-run-band${met ? ' is-met' : ''}`} role="group" aria-label="Score">
      <div className="cb-run-band-top">
        <span className="cb-run-band-score" ref={scoreEl} aria-label={`Score ${formatScore(now.score)} of ${formatScore(now.target)}`}>
          {formatScore(score)}
        </span>
        <span className="cb-run-band-side">
          <Hearts now={now.hearts} slots={maxHeartsOf(run)} shield={now.shield} />
          <Coins value={run.coins} />
        </span>
      </div>
      <div className="cb-run-band-meter">
        <Meter score={landed} target={now.target} />
        <span className="cb-run-band-target" aria-hidden="true">
          {met ? <CheckIcon className="cb-run-target-icon" /> : <TargetIcon className="cb-run-target-icon" />}
          {formatScore(now.target)}
        </span>
      </div>
      <div className="cb-run-band-bottom">
        <TallyLine t={tally} />
        {live && <FlowMeter flow={flowOf(live.streak, run)} cap={flowCap(run)} />}
      </div>
      {/* The technique and points of each placement, spoken after the digit itself. */}
      <p className="cb-run-sr" aria-live="polite">
        {last ? (last.note ? `${last.name}, ${last.note}` : `${last.name}, ${last.points} ${last.points === 1 ? 'point' : 'points'}`) : ''}
      </p>
    </div>
  );
}

// ---- lenses and items on the board -----------------------------------------------------

/** Holds a value for ms after it changes, so a fired lens stays lit long enough to see, motion or not. */
function useHeld<T>(value: T | null, ms: number): T | null {
  const [held, setHeld] = useState<T | null>(value);
  useEffect(() => {
    if (value === null) return;
    setHeld(value);
    const t = setTimeout(() => setHeld(null), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return held;
}

type Pick = { kind: 'boss' } | { kind: 'bet' } | { kind: 'lens'; k: number } | { kind: 'item'; k: number } | null;

function LensRow({ run, pick, onPick }: { run: RunState; pick: Pick; onPick: (p: Pick) => void }) {
  const tally = useRunStore((s) => s.fx.tally);
  // A fired lens glows and kicks when its turn in the placement's sum comes (planOf), and stays lit
  // until the sum is done.
  const incoming = tally && tally.fired.length ? tally : null;
  const hold = useMemo(() => (incoming ? planOf(incoming, moves()).hold : 700), [incoming]);
  const fired = useHeld(incoming, hold);
  const plan = useMemo(() => (fired ? planOf(fired, moves()) : null), [fired]);
  if (!run.lenses.length && !run.items.length) return null;
  return (
    <div className="cb-run-tiles is-board" role="group" aria-label="Lenses and items">
      {run.lenses.map((l, k) => {
        const order = fired ? fired.fired.indexOf(k) : -1;
        return (
          <LensTile
            key={`${l.id}${k}${order >= 0 ? `@${fired!.id}` : ''}`}
            slot={l}
            firing={order >= 0}
            delay={plan ? plan.lensAt(order) : 0}
            kick={plan?.full ? 1 : 0.6}
            selected={pick?.kind === 'lens' && pick.k === k}
            onClick={() => onPick(pick?.kind === 'lens' && pick.k === k ? null : { kind: 'lens', k })}
          />
        );
      })}
      {run.items.length > 0 && <span className="cb-run-tiles-gap" aria-hidden="true" />}
      {run.items.map((id, k) => (
        <ItemTile key={`${id}${k}`} id={id} selected={pick?.kind === 'item' && pick.k === k} onClick={() => onPick(pick?.kind === 'item' && pick.k === k ? null : { kind: 'item', k })} />
      ))}
    </div>
  );
}

// ---- hidden givens and popups over the cells ------------------------------------------

/** Where Thief's hidden givens will come back: a faint question mark in each cell, gone once it is back. */
function Ghosts({ cells, n }: { cells: readonly number[]; n: number }) {
  return (
    <>
      {cells.map((c) => (
        <span key={c} className="cb-run-ghost" aria-hidden="true" style={{ left: `${(((c % n) + 0.5) / n) * 100}%`, top: `${((Math.floor(c / n) + 0.5) / n) * 100}%` }}>
          ?
        </span>
      ))}
    </>
  );
}

const POPUP_MS = 1100;

/** How much each cell would lose if a popup covered it: a digit in full, notes a little, an empty cell nothing. */
function groundOf(game: GameState | null, side: number): Ground {
  const n = game?.puzzle.size ?? 9;
  const weight = Array.from({ length: n * n }, (_, i) => {
    if (!game) return WEIGHT.empty;
    if (game.fog && !game.fog.cleared[i]) return WEIGHT.empty;
    if (game.puzzle.givens[i] || game.values[i]) return WEIGHT.digit;
    return game.notes[i] ? WEIGHT.notes : WEIGHT.empty;
  });
  return { n, side, weight };
}

/**
 * Each placement's technique and points, over the board. A popup takes its place once, when it
 * first shows (see popups.ts): beside its cell, clear of the other popups still showing and of as
 * many digits as the board allows, so a run of quick placements reads one by one.
 */
function Popups() {
  const popups = useRunStore((s) => s.fx.popups);
  const game = useGame();
  const reduce = useReducedMotion();
  const host = useRef<HTMLDivElement>(null);
  // Each popup keeps the place it was given when it first showed, and when that was.
  const [spots] = useState(() => new Map<number, { box: Box | null; at: number }>());
  const [, tick] = useState(0);
  const now = Date.now();
  const side = host.current?.clientWidth ?? 0;
  for (const p of popups) {
    if (spots.has(p.id)) continue;
    const showing = [...spots.values()].filter((v) => v.box && now - v.at < POPUP_MS).map((v) => v.box!);
    // Before the board has a size there is nothing to place against: the popup sits above its cell.
    spots.set(p.id, { box: side ? placePopup(groundOf(game, side), p.cell, popupSize(p), showing) : null, at: now });
  }
  const live = popups.filter((p) => now - (spots.get(p.id)?.at ?? now) < POPUP_MS);
  useEffect(() => {
    // Popups the store has let go of are forgotten; the rest are asked again once their time is up.
    const ids = new Set(popups.map((p) => p.id));
    for (const id of spots.keys()) if (!ids.has(id)) spots.delete(id);
    if (!popups.length) return;
    const t = setTimeout(() => tick((x) => x + 1), POPUP_MS + 20);
    return () => clearTimeout(t);
  }, [popups, spots]);
  // Most placements send their points up to the score from here: 220 ms after the popup shows they
  // fly for 380 ms, and the band counts them in as they land. A pair or harder flies from the band.
  const [sent, setSent] = useState<ReadonlySet<number>>(() => new Set());
  const flights = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const air = useRunStore.getState().fx.air;
    for (const p of popups) {
      if (flights.current.has(p.id) || !(p.id in air) || p.tier >= SHOW_TIER) continue;
      stayAloft(p.id);
      flights.current.set(
        p.id,
        setTimeout(() => {
          const from = host.current?.querySelector(`[data-pop="${p.id}"] .cb-run-pop-points`);
          const to = bandScore();
          if (!from || !to) {
            landPoints(p.id);
            return;
          }
          setSent((s) => new Set(s).add(p.id));
          void fly(from, to, `+${formatScore(p.points)}`, 380).then(() => landPoints(p.id));
        }, 220),
      );
    }
  }, [popups]);
  useEffect(() => {
    const map = flights.current;
    return () => {
      map.forEach((t, id) => {
        clearTimeout(t);
        landSoon(id);
      });
      map.clear();
    };
  }, []);
  const n = game?.puzzle.size ?? 9;
  return (
    <div className="cb-run-pops" ref={host} aria-hidden="true">
      {live.map((p) => {
        const box = spots.get(p.id)!.box;
        const style = box
          ? { left: box.x, top: box.y, minWidth: box.w }
          : { left: `${(((p.cell % n) + 0.5) / n) * 100}%`, top: `${(Math.floor(p.cell / n) / n) * 100}%` };
        return (
          <span
            key={p.id}
            data-pop={p.id}
            className={`cb-run-pop cb-run-t${p.tier}${box ? '' : ' is-unplaced'}${reduce ? ' is-still' : ''}${p.points ? '' : ' is-zero'}${p.note ? ' is-event' : ''}${sent.has(p.id) ? ' is-sent' : ''}`}
            style={style}
          >
            <span className="cb-run-pop-name">{p.name}</span>
            <span className="cb-run-pop-points">{p.note ?? `+${formatScore(p.points)}`}</span>
            {p.clean > 1 && <span className="cb-run-pop-clean">Clean ×{formatMult(p.clean)}</span>}
          </span>
        );
      })}
    </div>
  );
}

// ---- the tally -------------------------------------------------------------------------

function headline(r: BoardResult): string {
  if (r.status === 'cleared') return 'Cleared';
  if (r.status === 'broken') return 'Broken';
  if (r.status === 'out') return 'Out of hearts';
  return r.timedOut ? 'Out of time' : 'Missed';
}

function nextLabel(run: RunState): string {
  const r = run.results[run.results.length - 1];
  if (run.outcome) return 'See summary';
  return r?.status === 'cleared' ? 'Pick a card' : 'Shop';
}

/** Where a board's coins came from. One source needs no number: the total beside it says it. */
function coinWhy(c: NonNullable<BoardResult['coins']>): string {
  const parts: [string, number][] = [
    ['board', c.board],
    ['over target', c.overflow],
    ['interest', c.interest],
    ['lenses', c.lenses],
  ];
  const paid = parts.filter(([, n]) => n > 0);
  return paid.length === 1 ? paid[0][0] : paid.map(([why, n]) => `${n} ${why}`).join(', ');
}

/** Techniques by points, best first. */
function rows(tech: BoardResult['tech']) {
  return (Object.entries(tech) as [TechniqueId, { n: number; points: number }][])
    .map(([id, t]) => ({ id, ...t, tier: TECHNIQUES[id].tier }))
    .sort((a, b) => b.points - a.points || b.tier - a.tier);
}

/** A number that counts up from nothing once it is given. */
function Count({ value, ms }: { value: number; ms: number }) {
  return <>{formatScore(useCountUp(value, ms, 0))}</>;
}

/** How far the tally has got: rows shown, Cleared stamped, coins in. */
interface TallyStep {
  rows: number;
  stamped: boolean;
  coins: boolean;
}

const ROW_MS = 340;
const FIRST_ROW_MS = 300;

/**
 * The board's tally, played as a short show (the Motion Lab's Lively): the rows tick in 340 ms apart
 * and the score counts up with them; when it passes the target, Cleared stamps in with its letters
 * shaking loose, the panel jolts once and the spectrum flares behind the score, brighter the further
 * past the target it lands; then the coins. A tap on the panel skips to the end, and its button
 * works all along. Without motion it shows the end at once.
 */
export function TallyPanel({ run, onNext }: { run: RunState; onNext: () => void }) {
  const r = run.phase === 'tally' || run.phase === 'done' ? run.results[run.results.length - 1] : undefined;
  if (!r || r.status === 'skipped') return <span className="cb-run-wait is-big" role="status" aria-label="Adding up the board" />;
  return <PanelShow key={r.slot} run={run} r={r} onNext={onNext} />;
}

function PanelShow({ run, r, onNext }: { run: RunState; r: BoardResult; onNext: () => void }) {
  const list = rows(r.tech);
  const more = list.slice(5).reduce((s, x) => s + x.points, 0);
  const lines = [
    ...list.slice(0, 5).map((t) => ({ key: t.id as string, tier: t.tier as number | null, name: TECHNIQUES[t.id].name, n: t.n as number | null, points: t.points })),
    ...(more > 0 ? [{ key: 'others', tier: null, name: 'Others', n: null, points: more }] : []),
  ];
  const cleared = r.status === 'cleared';
  const end: TallyStep = { rows: lines.length, stamped: cleared, coins: true };
  const [motion] = useState(moves);
  const [step, setStep] = useState<TallyStep>(() => (motion ? { rows: 0, stamped: !cleared, coins: false } : end));
  // The score so far: the rows shown, then the board's own total (with any head start) once all are in.
  const at = step.rows < lines.length ? lines.slice(0, step.rows).reduce((s, l) => s + l.points, 0) : r.score;
  const score = useCountUp(at, motion ? 300 : 0, motion ? 0 : at);
  const panel = useRef<HTMLElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const flare = useRef<HTMLSpanElement>(null);
  const body = useRef<HTMLTableSectionElement>(null);
  const coin = useRef<HTMLSpanElement>(null);
  const num = useRef<HTMLSpanElement>(null);
  const ratio = r.target > 0 ? r.score / r.target : 1;
  // How bright the flare burns: from a quarter at the target to full at two and a half times it.
  const glow = Math.min(1, 0.25 + (ratio - 1) * 0.5);

  useEffect(() => {
    if (!motion) return;
    const timers = lines.map((_, k) => setTimeout(() => setStep((s) => ({ ...s, rows: Math.max(s.rows, k + 1) })), FIRST_ROW_MS + k * ROW_MS));
    timers.push(setTimeout(() => setStep((s) => ({ ...s, rows: lines.length, coins: true })), FIRST_ROW_MS + lines.length * ROW_MS + 520));
    return () => timers.forEach(clearTimeout);
    // The show plays once, for the board that just ended.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motion]);

  // Each row's dot pops in on a spring as the row ticks in, and the score bumps.
  useLayoutEffect(() => {
    if (!motion || !step.rows) return;
    spring(body.current?.rows[step.rows - 1]?.querySelector('.cb-run-tierdot'), 0.4, 1, scale, 600, 18);
    bump(num.current, 0.06);
  }, [motion, step.rows]);

  // Cleared stamps in a moment after the score passes the target.
  const crossed = motion && cleared && !step.stamped && at >= r.target;
  useEffect(() => {
    if (!crossed) return;
    const t = setTimeout(() => setStep((s) => ({ ...s, stamped: true })), 280);
    return () => clearTimeout(t);
  }, [crossed]);
  const stampedOnce = useRef(false);
  useLayoutEffect(() => {
    if (!motion || !cleared || !step.stamped || stampedOnce.current) return;
    stampedOnce.current = true;
    if (step.coins) {
      // Skipped to the end: the flare rests where it would have settled.
      if (flare.current) flare.current.style.opacity = String(glow * 0.6);
      return;
    }
    spring(title.current, 1.35, 1, scale, 420, 18);
    shakeLoose(title.current, { lift: 12, tilt: 10, k: 380, c: 14, gap: 40 });
    shake(panel.current, 3 * Math.min(2.5, ratio));
    if (flare.current) {
      flare.current.style.opacity = String(glow * 0.6);
      flare.current.animate([{ opacity: 0 }, { opacity: Math.min(1, glow * 1.2) }, { opacity: glow * 0.6 }], { duration: 900, easing: 'ease-out' });
    }
  }, [motion, cleared, step.stamped, step.coins, glow, ratio]);

  // The coin turns as the coins come in.
  useLayoutEffect(() => {
    if (motion && step.coins) coin.current?.animate([{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(360deg)' }], { duration: 520, easing: EASE_OUT });
  }, [motion, step.coins]);

  const c = r.coins;
  const skip = (e: React.PointerEvent) => {
    if (step.coins || (e.target as HTMLElement).closest('button')) return;
    setStep(end);
  };
  return (
    <section ref={panel} className={`cb-run-panel is-${r.status}`} aria-labelledby="cb-run-panel-h" onPointerDown={motion ? skip : undefined}>
      <h2 id="cb-run-panel-h" ref={title} className={`cb-run-panel-title${step.stamped ? '' : ' is-wait'}`} aria-label={headline(r)}>
        <Letters text={headline(r)} />
      </h2>
      <p className="cb-run-panel-score" aria-label={`${formatScore(r.score)} of ${formatScore(r.target)}`}>
        <span className="cb-run-panel-numwrap">
          {cleared && (
            <span ref={flare} className={`cb-run-flare${motion ? '' : ' is-still'}`} style={motion ? undefined : { opacity: glow * 0.6 }} aria-hidden="true">
              <span className="cb-run-flare-ring" />
            </span>
          )}
          <span className="cb-run-panel-num" ref={num}>
            {formatScore(score)}
          </span>
        </span>
        <span className="cb-run-dim"> / {formatScore(r.target)}</span>
      </p>
      <Meter score={score} target={r.target} />
      {lines.length > 0 && (
        <table className="cb-run-techs">
          <caption className="cb-run-sr">Points by technique</caption>
          <tbody ref={body}>
            {lines.map((t, k) => (
              <tr key={t.key} className={k < step.rows ? (motion ? 'is-in' : '') : 'is-wait'}>
                <th scope="row" className={t.tier === null ? 'cb-run-dim' : undefined}>
                  {t.tier !== null && <TierDot tier={t.tier} />}
                  {t.name}
                </th>
                <td className="cb-run-dim">{t.n}</td>
                <td className="is-num">
                  <Count value={k < step.rows ? t.points : 0} ms={motion ? 260 : 0} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className={`cb-run-panel-foot${step.coins ? (motion ? ' is-in' : '') : ' is-wait'}`}>
        {c && c.total > 0 ? (
          <span className="cb-run-panel-coins">
            <span ref={coin} className="cb-run-coin-turn">
              <CoinIcon className="cb-run-coin" />
            </span>
            <strong>+{c.total}</strong>
            <span className="cb-run-panel-why">{coinWhy(c)}</span>
          </span>
        ) : (
          <span />
        )}
        {r.heartsLost > 0 && <Hearts now={0} slots={r.heartsLost} />}
      </div>
      <button type="button" className="cb-run-btn is-primary" onClick={onNext} autoFocus>
        {nextLabel(run)}
      </button>
    </section>
  );
}

// ---- the screen ------------------------------------------------------------------------

export function BoardScreen({ run, GameViewComponent }: { run: RunState; GameViewComponent: ComponentType<GameViewProps> }) {
  const game = useGame();
  const slot = run.live?.slot ?? run.results[run.results.length - 1]?.slot ?? run.slot;
  const key = run.live?.key ?? gameKey(run.seed, slot, run.createdAt);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [pick, setPick] = useState<Pick>(null);
  const loaded = !!game && game.key === key;

  // Build the board (it is cached) and hand it to the game store; a saved game under this key resumes.
  useEffect(() => {
    if (run.phase !== 'board' || getGame()?.key === key) return;
    let dead = false;
    setFailed(false);
    prepareBoard(run, slot)
      .then((p: Prepared) => {
        if (dead) return;
        const cur = useRunStore.getState().run;
        if (!cur?.live || cur.live.key !== key) return;
        const { puzzle, fog } = playedBoard(cur, p);
        startGame({ key, mode: 'run', puzzle, fog, mods: cur.live.mods });
        const g = getGame();
        if (g) runActions.sync(g);
      })
      .catch(() => {
        if (!dead) setFailed(true);
      });
    return () => {
      dead = true;
    };
    // The board depends on the run's seed and slot only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, run.phase, attempt]);

  // A board resumed in the store but not yet seen by the run (the app closed mid-tap).
  useEffect(() => {
    if (loaded && run.phase === 'board') runActions.sync(getGame()!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  useEffect(() => setPick(null), [key]);

  const note = useMemo<GameNote | null>(() => noteFor(run, game, pick, () => setPick(null)), [run, game, pick]);

  if (run.phase === 'tally' && !loaded) {
    // Reopened on a finished board: there is no board to show, only its tally.
    return (
      <Page onBack={runActions.home}>
        <div className="cb-run-alone">
          <TallyPanel run={run} onNext={runActions.next} />
        </div>
      </Page>
    );
  }
  if (!loaded) {
    return (
      <Page onBack={runActions.home}>
        {failed ? (
          <div className="cb-run-box is-warn" role="alert">
            <p>The board could not be built.</p>
            <div className="cb-run-actions">
              <button type="button" className="cb-run-btn is-primary" onClick={() => setAttempt((n) => n + 1)}>
                Try again
              </button>
              <button type="button" className="cb-run-btn" onClick={runActions.home}>
                Run home
              </button>
            </div>
          </div>
        ) : (
          <div className="cb-run-loading" role="status">
            <span className="cb-run-sr">Preparing {slotName(slot)}</span>
            <span className="cb-run-wait is-big" aria-hidden="true" />
          </div>
        )}
      </Page>
    );
  }
  const rule = run.live?.rule ?? null;
  // Double or Nothing rides on this board: a mistake in it loses the score at stake.
  const bet = run.live && run.pending && run.pending.slot !== run.live.slot ? run.pending : null;
  return (
    <GameViewComponent
      game={game}
      title={slotName(slot)}
      subtitle={run.daily ? formatDateLong(run.daily) : 'Free run'}
      band={<ScoreBand key={key} run={run} />}
      extra={<LensRow run={run} pick={pick} onPick={setPick} />}
      chipsLead={
        rule || bet ? (
          <>
            {rule && (
              <button
                type="button"
                className={`cb-chip cb-run-bosschip${pick?.kind === 'boss' ? ' on' : ''}`}
                aria-pressed={pick?.kind === 'boss'}
                aria-describedby="cb-run-boss-d"
                onClick={() => setPick(pick?.kind === 'boss' ? null : { kind: 'boss' })}
              >
                {BOSS_NAMES[rule]}
                <span id="cb-run-boss-d" hidden>
                  Boss rule
                </span>
              </button>
            )}
            {bet && (
              <button type="button" className={`cb-chip cb-run-betchip${pick?.kind === 'bet' ? ' on' : ''}`} aria-pressed={pick?.kind === 'bet'} onClick={() => setPick(pick?.kind === 'bet' ? null : { kind: 'bet' })}>
                Double or nothing
              </button>
            )}
          </>
        ) : undefined
      }
      boardOverlay={
        <>
          <Ghosts cells={run.live?.stolen ?? []} n={game.puzzle.size} />
          <Popups />
        </>
      }
      quietClock
      note={note}
      onNoteDismiss={() => setPick(null)}
      endPanel={<TallyPanel run={run} onNext={runActions.next} />}
      onExit={runActions.home}
    />
  );
}

/** The words for a picked lens, item or boss rule, with Use for an item that can act now. */
function noteFor(run: RunState, game: GameState | null, pick: Pick, done: () => void): GameNote | null {
  if (!pick) return null;
  if (pick.kind === 'bet') {
    const at = run.pending;
    return at ? { text: `Double or Nothing. No mistakes on this board doubles the ${formatScore(at.score)} from the last one. A mistake loses it.` } : null;
  }
  if (pick.kind === 'boss') {
    const rule = run.live?.rule;
    if (!rule) return null;
    const minutes = Math.round(clockMs(SLOT_SPECS[run.slot].minutes) / 60_000);
    return { text: `${BOSS_NAMES[rule]}. ${bossText(rule, rule === 'clock' ? minutes : undefined)}` };
  }
  if (pick.kind === 'lens') {
    const l = run.lenses[pick.k];
    const def = l ? lensById(l.id) : undefined;
    return def ? { text: `${def.name}. ${def.text}` } : null;
  }
  const id = run.items[pick.k];
  const def = id ? itemById(id) : undefined;
  if (!def) return null;
  const usable = def.kind === 'spectra' ? true : !!game && game.status === 'playing' && inkUsable(run, game, pick.k);
  const tier = def.tier !== undefined ? ` ${TIER_NAMES[def.tier]} are at level ${run.levels[def.tier]}.` : '';
  return {
    text: `${def.name}. ${def.text}${tier}`,
    action: {
      label: 'Use',
      disabled: !usable,
      run: () => {
        if (runActions.useItem(pick.k)) done();
      },
    },
  };
}
