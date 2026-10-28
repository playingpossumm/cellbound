// The reward pick: one card of three after a cleared board, of four (one rare) after a boss, or of
// two commons for a skipped board's tag. A card is picked, then taken, so a stray tap costs nothing.
// The cards deal in from below, sway a little while the player decides and lean toward the
// pointer; the one taken lifts and flies up into the run while the others drop away.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { EASE_IN_OUT, EASE_OUT, moves } from '../../../app/motion';
import { anteOf, slotOf } from '../boards';
import { BOSS_NAMES, bossText } from '../bosses';
import type { RewardId, RunState } from '../model';
import { rewardById } from '../rewards';
import { resultOf } from '../state';
import { BossTag, CardBody, cardClass, Coins, Page, RunHearts, RunScore, sendToLoadout, Track, whereLabel } from './parts';

export interface RewardProps {
  run: RunState;
  onTake: (id: RewardId) => void;
  onPass: () => void;
  onHome: () => void;
}

/** Where the k-th of n cards deals from and rests: side is its place from the middle. */
function dealStyle(k: number, n: number): CSSProperties {
  const side = k - (n - 1) / 2;
  return {
    '--k': k,
    // On a wide screen the cards rest fanned a little; a phone stacks them straight.
    '--fan-r': `${(side * 2).toFixed(1)}deg`,
    '--fan-y': `${(Math.abs(side) * 4).toFixed(1)}px`,
    '--tilt': `${(side * 12 + (side === 0 ? -4 : 0)).toFixed(1)}deg`,
  } as CSSProperties;
}

const fine = () => typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

/**
 * A card that leans toward the pointer: up to 11 degrees with a lift and a sheen under a mouse,
 * and toward a finger while it is held. It eases after the pointer (16 percent a frame) and settles
 * flat when the pointer goes.
 */
function LeanCard({ off, className, children, ...props }: { off: boolean; className: string; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const ref = useRef<HTMLButtonElement>(null);
  const st = useRef({ cur: { rx: 0, ry: 0, lift: 0 }, to: { rx: 0, ry: 0, lift: 0 }, raf: 0 });
  useEffect(() => {
    const s = st.current;
    return () => cancelAnimationFrame(s.raf);
  }, []);
  const run = () => {
    const s = st.current;
    if (s.raf) return;
    const tick = () => {
      const el = ref.current;
      const { cur: c, to: t } = s;
      c.rx += (t.rx - c.rx) * 0.16;
      c.ry += (t.ry - c.ry) * 0.16;
      c.lift += (t.lift - c.lift) * 0.16;
      const still = Math.abs(t.rx - c.rx) + Math.abs(t.ry - c.ry) + Math.abs(t.lift - c.lift) < 0.01;
      if (el) {
        el.style.transform =
          still && !t.lift
            ? ''
            : `perspective(700px) translateY(${(-10 * c.lift).toFixed(2)}px) rotateX(${c.rx.toFixed(2)}deg) rotateY(${c.ry.toFixed(2)}deg) scale(${(1 + 0.04 * c.lift).toFixed(4)})`;
        el.classList.toggle('is-leaning', !still || !!t.lift);
      }
      if (still) {
        s.raf = 0;
        return;
      }
      s.raf = requestAnimationFrame(tick);
    };
    s.raf = requestAnimationFrame(tick);
  };
  const aim = (e: React.PointerEvent<HTMLButtonElement>, lift: number) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * 2 - 1;
    const py = ((e.clientY - r.top) / r.height) * 2 - 1;
    st.current.to = { rx: -py * 9, ry: px * 11, lift };
    el.style.setProperty('--sx', `${((px + 1) * 50).toFixed(1)}%`);
    el.style.setProperty('--sy', `${((py + 1) * 50).toFixed(1)}%`);
    el.classList.add('is-hot');
    run();
  };
  const settle = () => {
    st.current.to = { rx: 0, ry: 0, lift: 0 };
    ref.current?.classList.remove('is-hot');
    run();
  };
  useEffect(() => {
    if (off) settle();
    // A card that is being taken settles at once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [off]);
  return (
    <button
      type="button"
      ref={ref}
      className={className}
      onPointerMove={(e) => {
        if (off || !moves()) return;
        if (e.pointerType === 'mouse' && fine()) aim(e, 1);
        else if (e.buttons) aim(e, 0.6);
      }}
      onPointerDown={(e) => {
        if (!off && moves() && e.pointerType !== 'mouse') aim(e, 0.6);
      }}
      onPointerUp={(e) => {
        if (e.pointerType !== 'mouse') settle();
      }}
      onPointerLeave={settle}
      onPointerCancel={settle}
      {...props}
    >
      <span className="cb-run-card-sheen" aria-hidden="true" />
      {children}
    </button>
  );
}

export function Reward({ run, onTake, onPass, onHome }: RewardProps) {
  const [sel, setSel] = useState<RewardId | null>(null);
  const [leaving, setLeaving] = useState<RewardId | null>(null);
  const list = useRef<HTMLUListElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const offer = run.offer;
  const cards = offer?.cards ?? [];

  // The card taken lifts and flies up to the run's row of hearts and coins in 640 ms, the others
  // drop away, and then the card is the run's.
  useLayoutEffect(() => {
    if (!leaving) return;
    const items = Array.from(list.current?.children ?? []) as HTMLElement[];
    const k = cards.indexOf(leaving);
    const li = items[k];
    const to = head.current?.getBoundingClientRect();
    if (!li || !to) {
      onTake(leaving);
      return;
    }
    items.forEach((other, j) => {
      if (j === k) return;
      const base = getComputedStyle(other).transform;
      const from = base === 'none' ? '' : base;
      other.animate(
        [
          { transform: from || 'none', opacity: 1 },
          { transform: `${from} translateY(40px) rotate(${j < k ? -8 : 8}deg)`, opacity: 0 },
        ],
        { duration: 280, delay: 40 * Math.abs(j - k), easing: EASE_OUT, fill: 'forwards' },
      );
    });
    const a = li.getBoundingClientRect();
    const dx = to.left + to.width / 2 - (a.left + a.width / 2);
    const dy = to.top + to.height / 2 - (a.top + a.height / 2);
    const base = getComputedStyle(li).transform;
    const id = leaving;
    li.animate(
      [
        { transform: base === 'none' ? 'none' : base },
        { transform: 'translateY(-18px) scale(1.06)', offset: 0.3 },
        { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(0.2) rotate(-6deg)`, opacity: 0.2 },
      ],
      { duration: 640, easing: EASE_IN_OUT, fill: 'forwards' },
    ).finished.then(
      () => {
        if (!alive.current) return;
        sendToLoadout(`perk:${id}`);
        onTake(id);
      },
      () => undefined,
    );
    // The flight starts once, when a card is taken.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving]);

  if (!offer) return null;
  const chosen = sel && cards.includes(sel) ? sel : null;
  const def = chosen ? rewardById(chosen) : undefined;
  // Scout shows the ante's boss rule while there is still a board to pick for before it.
  const bossSlot = slotOf(anteOf(run.slot), 'boss');
  const scout = !!run.perks.scout && offer.kind !== 'boss' && !resultOf(run, bossSlot) ? run.bosses[anteOf(run.slot) - 1] : null;
  const take = () => {
    if (!chosen || leaving) return;
    if (moves()) setLeaving(chosen);
    else onTake(chosen);
  };
  return (
    <Page title="Choose a card" onBack={onHome}>
      <div className="cb-run-head" ref={head}>
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
      {cards.length ? (
        <>
          <ul ref={list} className={`cb-run-offers is-${cards.length} is-dealt${leaving ? ' is-leaving' : ''}`}>
            {cards.map((id, k) => (
              <li key={id} style={dealStyle(k, cards.length)}>
                <span className="cb-run-sway" style={{ animationDelay: `${(-k * 1.6).toFixed(1)}s` }}>
                  <LeanCard
                    off={!!leaving}
                    className={cardClass(id) + (chosen === id ? ' is-selected' : '')}
                    aria-pressed={chosen === id}
                    onClick={() => !leaving && setSel(id)}
                  >
                    <CardBody id={id} selected={chosen === id} />
                  </LeanCard>
                </span>
              </li>
            ))}
          </ul>
          <div className="cb-run-actions is-dock">
            <button type="button" className="cb-run-btn is-primary is-wide" disabled={!chosen || !!leaving} onClick={take}>
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
