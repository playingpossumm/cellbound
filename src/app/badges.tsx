// Badges on screen: the cut glass gem each one is drawn as, the Stats screen's grid with a card for
// the one picked, and the strip of badges a game has just earned. What they count is
// src/game/badges.ts. Which levels this device has already shown is kept here, so each new level
// is announced once: on the result card or the Run's summary, or with a mark on the Stats screen.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { BADGE_LEVELS, badgeStates, NUMERALS, progressOf, showOf, type BadgeId, type BadgeState } from '../game/badges';
import { useLearnStore } from '../modes/learn/store';
import type { RunStats } from '../modes/run/stats';
import { allRunStats, allStats, useAccount, useAllStats } from '../sync/account';
import { EASE_OUT, moves } from './motion';

/** Each badge's mark, 24 px strokes; the menu's own icons where it has one. */
const ICONS: Record<BadgeId, string[]> = {
  streak: ['M12 3c.7 3.3 5.2 5.4 5.2 10.2a5.2 5.2 0 0 1-10.4 0c0-2.4 1.2-4 2.6-5.1 0 1.9.8 3.1 2 3.5C10.9 9.3 11 6.1 12 3z'],
  regular: ['M5 6.5h14v13H5zM5 10.5h14M9 4.5v3.5M15 4.5v3.5M9.5 14.5h2v2h-2z'],
  quick: ['M12 6.2a7.3 7.3 0 1 0 0 14.6 7.3 7.3 0 0 0 0-14.6zM12 10v3.6l2.4 1.5M10 3.5h4M12 3.5v2.7'],
  clean: ['M12 3.5l1.9 5.6 5.6 1.9-5.6 1.9-1.9 5.6-1.9-5.6-5.6-1.9 5.6-1.9z', 'M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z'],
  hidden: ['M10.5 4.5a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM15 15l4.5 4.5'],
  clues: ['M8 13a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM10.2 13.8l7.3-7.3'],
  pointing: ['M5 12h12.5M13.5 7l5 5-5 5'],
  pairs: ['M9 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM15 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z'],
  xwing: [
    'M7 7l10 10M17 7L7 17',
    'M6 4.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zM18 4.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zM6 16.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zM18 16.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z',
  ],
  wings: ['M12 19V10.5M12 10.5L6 5.5M12 10.5l6-5'],
  chains: ['M10 14l-2.2 2.2a3 3 0 0 1-4.2-4.2l3-3a3 3 0 0 1 4.2 0M14 10l2.2-2.2a3 3 0 0 1 4.2 4.2l-3 3a3 3 0 0 1-4.2 0M9.5 14.5l5-5'],
  score: ['M12 3.8l2.5 5.2 5.6.8-4.1 3.9 1 5.6-5-2.7-5 2.7 1-5.6-4.1-3.9 5.6-.8z'],
  hit: ['M13 3L5.5 13.5H11l-1 7.5 7.5-10.5H12z'],
  boss: ['M4.5 18h15M5 18L4 8.5l4.5 3.5L12 6l3.5 6L20 8.5 19 18'],
  rules: ['M12 3.4l7 2.6v5.5c0 4.3-2.9 7.6-7 9.1-4.1-1.5-7-4.8-7-9.1V6z', 'M12.5 7.5l-2 4 3 2-1.5 3.5'],
  victor: ['M8 4.5h8v5a4 4 0 0 1-8 0zM8 6.5H5v1.5a3 3 0 0 0 3 3M16 6.5h3v1.5a3 3 0 0 1-3 3M12 13.5V17M8.5 20h7M9.5 17h5v3h-5z'],
  sweep: ['M5 5h14v14H5zM8.5 12.3l2.6 2.6 4.9-5.4'],
  fiendish: ['M12 8.5a5.8 5.8 0 1 0 0 11.6 5.8 5.8 0 0 0 0-11.6zM7.6 10.6L6 4.5l3.8 3.3M16.4 10.6L18 4.5l-3.8 3.3M10 14h.01M14 14h.01M10.2 17.2h3.6'],
  fog: ['M7.5 15.5h9.5a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.4-1.6A3.4 3.4 0 0 0 7.5 15.5zM6 19h12'],
  variety: ['M5 5h14v14H5zM9.5 5v14M14.5 5v14M5 9.5h14M5 14.5h14'],
  scholar: ['M4 6.5c2.7-1.4 5.3-1.4 8 0v12.5c-2.7-1.4-5.3-1.4-8 0zM20 6.5c-2.7-1.4-5.3-1.4-8 0v12.5c2.7-1.4 5.3-1.4 8 0z'],
};

// ---- the gem ------------------------------------------------------------------------------------

/** The six rim facets, clockwise from the top, light in these digit hues: red round to violet. */
const HUES = [1, 3, 4, 6, 7, 9];
const corner = (r: number, k: number) => {
  const a = ((-90 + 60 * k) * Math.PI) / 180;
  return [Number((50 + r * Math.cos(a)).toFixed(2)), Number((50 + r * Math.sin(a)).toFixed(2))];
};
const OUTER = [0, 1, 2, 3, 4, 5].map((k) => corner(46, k));
const INNER = [0, 1, 2, 3, 4, 5].map((k) => corner(36.5, k));
const pts = (...ps: number[][]) => ps.map((p) => p.join(',')).join(' ');
const GLINT = 'M84 10L85.68 15.32L91 17L85.68 18.68L84 24L82.32 18.68L77 17L82.32 15.32Z';

/** The new level arrives: a small spring, its facets lit in turn, then a glint. */
function reveal(svg: SVGSVGElement | null) {
  if (!svg || !moves()) return;
  svg.animate([{ transform: 'scale(0.86)', opacity: 0 }, { transform: 'scale(1.04)', opacity: 1, offset: 0.55 }, { transform: 'scale(1)', opacity: 1 }], {
    duration: 560,
    easing: EASE_OUT,
  });
  const facets = [...svg.querySelectorAll('.is-new')];
  facets.forEach((f, i) =>
    f.animate([{ opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 320, delay: 180 + i * 50, easing: EASE_OUT, fill: 'backwards' }),
  );
  svg.querySelector('.cb-gem-glint')?.animate(
    [
      { opacity: 0, transform: 'scale(0.3) rotate(-45deg)' },
      { opacity: 1, transform: 'scale(1.25) rotate(0deg)', offset: 0.5 },
      { opacity: 1, transform: 'scale(1) rotate(0deg)' },
    ],
    { duration: 520, delay: 180 + facets.length * 50, easing: 'ease-out', fill: 'backwards' },
  );
}

/**
 * A badge as a cut glass gem: each level lights a third of its rim in the spectrum, and level III
 * adds a glint. With `fresh` the newest level draws in once.
 */
export function Gem({ id, level, fresh }: { id: BadgeId; level: number; fresh?: boolean }) {
  const ref = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    if (fresh) reveal(ref.current);
  }, [fresh]);
  return (
    <svg ref={ref} className={`cb-gem${level === 0 ? ' is-locked' : ''}${level === 3 ? ' is-full' : ''}`} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      {OUTER.map((o, k) => {
        const lit = k < level * 2;
        const isNew = fresh && lit && k >= (level - 1) * 2;
        return (
          <polygon
            key={k}
            className={`cb-gem-rim${lit ? ' is-lit' : ''}${isNew ? ' is-new' : ''}`}
            points={pts(o, OUTER[(k + 1) % 6], INNER[(k + 1) % 6], INNER[k])}
            style={lit ? { fill: `var(--h${HUES[k]})` } : undefined}
          />
        );
      })}
      <polygon className="cb-gem-body" points={pts(...INNER)} />
      <g className="cb-gem-facets">
        {INNER.map((p, k) => (
          <line key={k} x1="50" y1="50" x2={p[0]} y2={p[1]} />
        ))}
      </g>
      <polygon className="cb-gem-shine" points={pts(INNER[5], INNER[0], [50, 50])} />
      <g className="cb-gem-ink" transform="translate(30 30) scale(1.6667)">
        {ICONS[id].map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      {level === 3 && <path className="cb-gem-glint" d={GLINT} />}
    </svg>
  );
}

// ---- what is new ---------------------------------------------------------------------------------

const SEEN_KEY = 'cellbound:v1:badges';
type Levels = Partial<Record<BadgeId, number>>;

function loadSeen(): Levels | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const v = raw ? (JSON.parse(raw) as { v?: unknown; seen?: unknown }) : null;
    if (!v || v.v !== 1 || !v.seen || typeof v.seen !== 'object') return null;
    const out: Levels = {};
    for (const [k, n] of Object.entries(v.seen)) if (typeof n === 'number') out[k as BadgeId] = n;
    return out;
  } catch {
    return null;
  }
}

/** The levels this device has shown; null until badges are first read here. */
const useSeen = create<{ seen: Levels | null }>(() => ({ seen: loadSeen() }));

/** Test helper: forget, or set, what this device has shown. */
export function resetSeenForTesting(seen: Levels | null = null): void {
  useSeen.setState({ seen });
}

/** Marks these badges' levels as shown. */
export function markSeen(states: readonly BadgeState[]): void {
  const seen = { ...(useSeen.getState().seen ?? {}) };
  for (const b of states) seen[b.def.id] = Math.max(seen[b.def.id] ?? 0, b.level);
  useSeen.setState({ seen });
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify({ v: 1, seen }));
  } catch {
    /* a private window keeps them for this visit */
  }
}

const lessonsDone = (done: Record<string, unknown>) => Object.keys(done).length;

/**
 * The first time the app opens with badges, what was earned before counts as shown, so a player
 * is not handed a pile of them at once; from then on every new level is announced.
 */
export function primeBadges(): void {
  if (useSeen.getState().seen !== null) return;
  markSeen(badgeStates({ stats: allStats(), run: allRunStats(), lessons: lessonsDone(useLearnStore.getState().done) }));
}

/** The badges as they stand: every device's games and runs, and the lessons finished here. */
export function useBadges(run?: RunStats): BadgeState[] {
  const stats = useAllStats();
  const others = useAccount((s) => s.others);
  const done = useLearnStore((s) => s.done);
  return useMemo(
    () => badgeStates({ stats, run: run ?? allRunStats(undefined, others), lessons: lessonsDone(done) }),
    // The Run's own stats come from its save, which changes as the game stats do.
    [stats, run, others, done],
  );
}

/** The badges with a level this device has not shown yet. */
export function useNewBadges(states: readonly BadgeState[]): BadgeState[] {
  const seen = useSeen((s) => s.seen);
  return useMemo(() => (seen ? states.filter((b) => b.level > (seen[b.def.id] ?? 0)) : []), [seen, states]);
}

/**
 * The new badges a screen announces: the first ones it finds stay on it for the visit, and count
 * as shown at once, so the menu's mark and the next screen leave them be.
 */
function useAnnounced(states: readonly BadgeState[]): BadgeState[] {
  const fresh = useNewBadges(states);
  const [announced, setAnnounced] = useState<BadgeState[]>([]);
  useEffect(() => {
    if (!fresh.length) return;
    setAnnounced((was) => [...was.filter((b) => !fresh.some((f) => f.def.id === b.def.id)), ...fresh]);
    markSeen(fresh);
  }, [fresh]);
  return announced;
}

// ---- the Stats screen ----------------------------------------------------------------------------

function BadgeCard({ state }: { state: BadgeState }) {
  const { def, level } = state;
  const next = progressOf(state);
  return (
    <div className="cb-badge-card" aria-live="polite">
      <Gem id={def.id} level={level} />
      <div>
        <h3>
          {def.name}
          {level ? ` ${NUMERALS[level]}` : ''}
        </h3>
        <p>{def.counts}</p>
        <ol className="cb-badge-steps" aria-label="Levels">
          {def.steps.map((s, i) => (
            <li key={i} className={i < level ? 'is-got' : ''}>
              {showOf(def, s)}
            </li>
          ))}
        </ol>
        <div className="cb-badge-meter" aria-hidden="true">
          <span style={{ transform: `scaleX(${next.share})` }} />
        </div>
        <p className="cb-badge-next">{next.text}</p>
      </div>
    </div>
  );
}

/** The Stats screen's badges: every one as a gem, a mark on any not shown yet, and the picked one's card. */
export function BadgesCard() {
  const states = useBadges();
  const fresh = useNewBadges(states);
  const announced = useAnnounced(states);
  // A new badge opens first.
  const [picked, setPicked] = useState<BadgeId>(() => fresh[0]?.def.id ?? states[0].def.id);
  const earned = states.reduce((n, b) => n + b.level, 0);
  const card = states.find((b) => b.def.id === picked) ?? states[0];
  return (
    <section className="cb-card cb-badges" aria-labelledby="cb-badges-h">
      <div className="cb-badges-head">
        <h2 id="cb-badges-h">Badges</h2>
        <span>
          {earned} of {BADGE_LEVELS}
        </span>
      </div>
      <div className="cb-gems" role="group" aria-label="Badges">
        {states.map((b) => {
          const isNew = announced.some((a) => a.def.id === b.def.id);
          return (
            <button
              key={b.def.id}
              type="button"
              className={`cb-gem-btn${isNew ? ' is-new' : ''}`}
              aria-pressed={picked === b.def.id}
              aria-label={`${b.def.name}, ${b.level ? `level ${NUMERALS[b.level]}` : 'not earned yet'}${isNew ? ', new' : ''}`}
              onClick={() => setPicked(b.def.id)}
            >
              <Gem id={b.def.id} level={b.level} />
            </button>
          );
        })}
      </div>
      <BadgeCard state={card} />
    </section>
  );
}

// ---- just earned ---------------------------------------------------------------------------------

/**
 * The badges a game or a run has just earned, each drawing in its new level, once. A run passes its
 * own stats, fresher than its save.
 */
export function NewBadges({ run }: { run?: RunStats }) {
  const list = useAnnounced(useBadges(run));
  if (!list.length) return null;
  return (
    <section className="cb-newbadges" aria-label={list.length === 1 ? 'New badge' : 'New badges'}>
      <h3>{list.length === 1 ? 'New badge' : 'New badges'}</h3>
      <ul>
        {list.map((b) => (
          <li key={b.def.id}>
            <Gem id={b.def.id} level={b.level} fresh />
            <span>
              {b.def.name} {NUMERALS[b.level]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
