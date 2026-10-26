// The board in play, on the shared play screen: the score band in the band's place (score against
// target, the last chips times mult, the flow, hearts and coins), the lenses and items under it,
// the boss rule as a chip, popups over the cells, and the board's tally when it ends.
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import type { GameNote, GameViewProps } from '../../../app/GameView';
import { useReducedMotion } from '../../../app/theme';
import { TECHNIQUES, type TechniqueId } from '../../../engine/techniques';
import { getGame, startGame, useGame } from '../../../game/store';
import { formatDateLong } from '../../../game/logic';
import type { GameState } from '../../../game/types';
import { isBoss, SLOT_SPECS } from '../boards';
import { gameKey, prepareBoard, type Prepared } from '../board';
import { BOSS_NAMES, bossText, clockMs } from '../bosses';
import { itemById, TIER_NAMES } from '../items';
import { flowCapOf, lensById, maxHeartsOf } from '../lenses';
import type { TallyFx } from '../live';
import type { BoardResult, RunState } from '../model';
import { flowOf } from '../scoring';
import { formatMult, formatScore, slotName } from '../state';
import { inkUsable, playedBoard, runActions, useRunStore } from '../store';
import { CoinIcon, TargetIcon } from './icons';
import { Coins, Hearts, ItemTile, LensTile, Meter, Page, TierDot, useCountUp } from './parts';

// ---- the score band --------------------------------------------------------------------

/** One placement's chips times mult, popping in as it lands. */
function TallyLine({ t }: { t: TallyFx | null }) {
  if (!t) return <span className="cb-run-tally is-empty" aria-hidden="true" />;
  return (
    <span key={t.id} className="cb-run-tally" aria-hidden="true">
      <span className="cb-run-chips">{formatScore(t.chips)}</span>
      <span className="cb-run-times">×</span>
      <span className="cb-run-mult">{formatMult(t.mult)}</span>
      <span className="cb-run-points">+{formatScore(t.points)}</span>
    </span>
  );
}

function FlowMeter({ flow, cap }: { flow: number; cap: number }) {
  const share = cap > 1 ? (flow - 1) / (cap - 1) : 0;
  return (
    <span className={`cb-run-flow${flow >= cap ? ' is-full' : ''}`} aria-label={`Flow ×${formatMult(flow)}`} role="img">
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
  const live = run.live;
  // Once the board is over, the band keeps its final score while the tally is on screen.
  const done = live ? null : run.results[run.results.length - 1];
  const now = live ? { score: live.score, target: live.target, hearts: live.hearts, shield: live.shield } : done ? { score: done.score, target: done.target, hearts: run.hearts, shield: run.shield } : null;
  const score = useCountUp(now?.score ?? 0, 240);
  if (!now) return null;
  const last = popups[popups.length - 1];
  return (
    <div className={`cb-run-band${now.score >= now.target ? ' is-met' : ''}`} role="group" aria-label="Score">
      <div className="cb-run-band-top">
        <span className="cb-run-band-score" aria-label={`Score ${formatScore(now.score)} of ${formatScore(now.target)}`}>
          {formatScore(score)}
        </span>
        <span className="cb-run-band-side">
          <Hearts now={now.hearts} slots={maxHeartsOf(run)} shield={now.shield} />
          <Coins value={run.coins} />
        </span>
      </div>
      <div className="cb-run-band-meter">
        <Meter score={now.score} target={now.target} />
        <span className="cb-run-band-target" aria-hidden="true">
          <TargetIcon className="cb-run-target-icon" />
          {formatScore(now.target)}
        </span>
      </div>
      <div className="cb-run-band-bottom">
        <TallyLine t={tally} />
        {live && <FlowMeter flow={flowOf(live.streak, run)} cap={flowCapOf(run.lenses)} />}
      </div>
      {/* The technique and points of each placement, spoken after the digit itself. */}
      <p className="cb-run-sr" aria-live="polite">
        {last ? `${last.name}, ${last.points} ${last.points === 1 ? 'point' : 'points'}` : ''}
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

type Pick = { kind: 'boss' } | { kind: 'lens'; k: number } | { kind: 'item'; k: number } | null;

function LensRow({ run, pick, onPick }: { run: RunState; pick: Pick; onPick: (p: Pick) => void }) {
  const tally = useRunStore((s) => s.fx.tally);
  const fired = useHeld(tally && tally.fired.length ? tally : null, 700);
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
            delay={order * 60}
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

// ---- popups over the cells -------------------------------------------------------------

const POPUP_MS = 1100;

function Popups({ n }: { n: number }) {
  const popups = useRunStore((s) => s.fx.popups);
  const reduce = useReducedMotion();
  const seen = useRef(new Map<number, number>());
  const [, tick] = useState(0);
  const now = Date.now();
  for (const p of popups) if (!seen.current.has(p.id)) seen.current.set(p.id, now);
  const live = popups.filter((p) => now - (seen.current.get(p.id) ?? now) < POPUP_MS);
  useEffect(() => {
    if (!live.length) return;
    const t = setTimeout(() => tick((x) => x + 1), POPUP_MS + 20);
    return () => clearTimeout(t);
  }, [live.length, popups]);
  return (
    <>
      {live.map((p) => {
        const r = Math.floor(p.cell / n);
        const c = p.cell % n;
        const below = r === 0;
        const style = {
          left: `${((c + 0.5) / n) * 100}%`,
          top: `${((below ? r + 1 : r) / n) * 100}%`,
          ['--rn-x' as string]: c === 0 ? '-18%' : c === n - 1 ? '-82%' : '-50%',
        };
        return (
          <span key={p.id} className={`cb-run-pop cb-run-t${p.tier}${below ? ' is-below' : ''}${reduce ? ' is-still' : ''}${p.points ? '' : ' is-zero'}`} style={style} aria-hidden="true">
            <span className="cb-run-pop-name">{p.name}</span>
            <span className="cb-run-pop-points">+{formatScore(p.points)}</span>
          </span>
        );
      })}
    </>
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
  if (r?.status === 'cleared') return 'Pick a card';
  return isBoss(run.slot) ? 'Shop' : 'Next board';
}

/** Techniques by points, best first. */
function rows(tech: BoardResult['tech']) {
  return (Object.entries(tech) as [TechniqueId, { n: number; points: number }][])
    .map(([id, t]) => ({ id, ...t, tier: TECHNIQUES[id].tier }))
    .sort((a, b) => b.points - a.points || b.tier - a.tier);
}

export function TallyPanel({ run, onNext }: { run: RunState; onNext: () => void }) {
  const r = run.phase === 'tally' || run.phase === 'done' ? run.results[run.results.length - 1] : undefined;
  // The board's score counts up from nothing as the tally opens: the end of a board's moment.
  const score = useCountUp(r?.score ?? 0, 900, 0);
  if (!r || r.status === 'skipped') return <span className="cb-run-wait is-big" role="status" aria-label="Adding up the board" />;
  const list = rows(r.tech);
  const shownRows = list.slice(0, 5);
  const more = list.slice(5).reduce((s, x) => s + x.points, 0);
  const c = r.coins;
  return (
    <section className={`cb-run-panel is-${r.status}`} aria-labelledby="cb-run-panel-h">
      <h2 id="cb-run-panel-h" className="cb-run-panel-title">
        {headline(r)}
      </h2>
      <p className="cb-run-panel-score" aria-label={`${formatScore(r.score)} of ${formatScore(r.target)}`}>
        <span className="cb-run-panel-num">{formatScore(score)}</span>
        <span className="cb-run-dim"> / {formatScore(r.target)}</span>
      </p>
      <Meter score={score} target={r.target} />
      {shownRows.length > 0 && (
        <table className="cb-run-techs">
          <caption className="cb-run-sr">Points by technique</caption>
          <tbody>
            {shownRows.map((t) => (
              <tr key={t.id}>
                <th scope="row">
                  <TierDot tier={t.tier} />
                  {TECHNIQUES[t.id].name}
                </th>
                <td className="cb-run-dim">{t.n}</td>
                <td className="is-num">{formatScore(t.points)}</td>
              </tr>
            ))}
            {more > 0 && (
              <tr>
                <th scope="row" className="cb-run-dim">
                  Others
                </th>
                <td />
                <td className="is-num">{formatScore(more)}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
      <div className="cb-run-panel-foot">
        {c && c.total > 0 ? (
          <span className="cb-run-panel-coins">
            <CoinIcon className="cb-run-coin" />
            <strong>+{c.total}</strong>
            <span className="cb-run-panel-why">
              {[c.board && `${c.board} board`, c.overflow && `${c.overflow} over target`, c.interest && `${c.interest} interest`, c.lenses && `${c.lenses} lenses`].filter(Boolean).join(', ')}
            </span>
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
  return (
    <GameViewComponent
      game={game}
      title={slotName(slot)}
      subtitle={run.daily ? formatDateLong(run.daily) : 'Free run'}
      band={<ScoreBand key={key} run={run} />}
      extra={<LensRow run={run} pick={pick} onPick={setPick} />}
      chipsLead={
        rule ? (
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
        ) : undefined
      }
      boardOverlay={<Popups n={game.puzzle.size} />}
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
