// The run summary: how it ended, the score, the best placement, the techniques by tier, the
// nine boards, anything the run unlocked, and sharing. Two columns on a wide screen. A won run
// opens on the prism of the play screen's band, which bursts once when the run was won in view.
import { useEffect, useRef, useState } from 'react';
import { APP_NAME } from '../../../app/brand';
import { EASE_OUT, moves, shakeLoose } from '../../../app/motion';
import { soundWin } from '../../../app/sound';
import { TECHNIQUES, type TechniqueId } from '../../../engine/techniques';
import { shareResult, type ShareOutcome } from '../../share';
import { ANTES, KINDS, slotOf } from '../boards';
import { TIER_NAMES } from '../items';
import type { RunState, UnlockId } from '../model';
import { formatScore, KIND_NAMES, resultOf, shareText } from '../state';
import { unlockedNames } from '../stats';
import { runActions, runId, useRunStore } from '../store';
import { Letters, LevelPill, Page, RunHearts, TierDot, Track } from './parts';

function title(run: RunState): string {
  if (run.outcome === 'won') return 'Run won';
  if (run.outcome === 'lost') return 'Run over';
  return 'Run ended';
}

/** The band's prism for nine digits (Prism's .pr-band): the beam, the glass, a ray per digit. */
const EXIT = { x: 169, y: 66 };
const RAYS = Array.from({ length: 9 }, (_, i) => ({ i, y: 27 + i * 11.5 }));

/**
 * The prism's nine rays flare in turn, the digits burst out along their own colours and the title
 * shakes loose: the one loud moment of a run (the Motion Lab's Lively). The digits fly in a layer
 * over the page, so they never widen it.
 */
function burst(svg: SVGSVGElement, title: HTMLElement | null) {
  const rays = Array.from(svg.querySelectorAll<SVGPathElement>('.pr-ray'));
  rays.forEach((ray, k) => {
    const delay = k * 35;
    ray.style.transformBox = 'view-box';
    ray.style.transformOrigin = `${EXIT.x}px ${EXIT.y}px`;
    ray.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.32)', offset: 0.35 }, { transform: 'scale(1)' }], { duration: 900, delay, easing: EASE_OUT });
    ray.animate([{ strokeWidth: '1.7px' }, { strokeWidth: '3.9px', offset: 0.3 }, { strokeWidth: '1.7px' }], { duration: 900, delay, easing: 'ease-out' });
  });
  svg.querySelector('.pr-glass')?.animate([{ opacity: 0.75, strokeWidth: '1.1px' }, { opacity: 1, strokeWidth: '3px', offset: 0.2 }, { opacity: 0.75, strokeWidth: '1.1px' }], { duration: 760, easing: 'ease-out' });
  svg.querySelector('.pr-beam')?.animate([{ opacity: 1 }, { opacity: 0.3, offset: 0.15 }, { opacity: 1 }], { duration: 500, easing: 'ease-out' });
  const m = svg.getScreenCTM();
  if (m) {
    const at = new DOMPoint(EXIT.x, EXIT.y).matrixTransform(m);
    const layer = document.createElement('div');
    layer.className = 'cb-burst';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
    const flights = Array.from({ length: 27 }, (_, n) => {
      const k = n % 9;
      const bit = document.createElement('span');
      bit.className = 'cb-burst-bit';
      bit.textContent = String(k + 1);
      bit.style.color = rays[k] ? getComputedStyle(rays[k]).stroke : '';
      layer.appendChild(bit);
      bit.style.left = `${at.x - bit.offsetWidth / 2}px`;
      bit.style.top = `${at.y - bit.offsetHeight / 2}px`;
      const ang = Math.atan2(RAYS[k].y - EXIT.y, 338 - EXIT.x) + (Math.random() - 0.5) * 0.35;
      const dist = (70 + Math.random() * 150) * m.a;
      const spin = (Math.random() - 0.5) * 240;
      return bit.animate(
        [
          { transform: 'translate(0px, 0px) rotate(0deg) scale(0.6)', opacity: 0 },
          { opacity: 1, offset: 0.12 },
          { transform: `translate(${(Math.cos(ang) * dist).toFixed(1)}px, ${(Math.sin(ang) * dist + 30).toFixed(1)}px) rotate(${spin.toFixed(0)}deg) scale(1)`, opacity: 0 },
        ],
        { duration: 900 + Math.random() * 500, delay: k * 30 + Math.floor(n / 9) * 90, easing: EASE_OUT, fill: 'both' },
      ).finished;
    });
    void Promise.allSettled(flights).then(() => layer.remove());
  }
  shakeLoose(title, { lift: 16, tilt: 12, k: 300, c: 11, gap: 45, delay: 200 });
}

/** A won run's heading: the title over the band's prism, which bursts once if `play`. */
function WinBand({ text, play }: { text: string; play: boolean }) {
  const svg = useRef<SVGSVGElement>(null);
  const h1 = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!play) return;
    runActions.celebrated();
    const t = setTimeout(() => {
      soundWin();
      if (moves() && svg.current) burst(svg.current, h1.current);
    }, 250);
    return () => clearTimeout(t);
  }, [play]);
  return (
    <div className="pr-band cb-run-winband" data-size={9}>
      <svg ref={svg} className="pr-spec" viewBox="0 0 360 124" preserveAspectRatio="xMaxYMid meet" aria-hidden="true">
        <path className="pr-beam" d="M0 106 L131 66" />
        <path className="pr-inner" d="M131 66 L169 66" />
        <polygon className="pr-glass" points="150,24 110,102 190,102" />
        {RAYS.map(({ i, y }) => (
          <path key={i} className={`pr-ray pr-r${i + 1}`} d={`M${EXIT.x} ${EXIT.y} L338 ${y}`} />
        ))}
        {[0, 4, 8].map((p, k) => (
          <path key={k} className="pr-pulse" d={`M${EXIT.x} ${EXIT.y} L338 ${RAYS[p].y}`} style={{ animationDelay: `${k * 1.5}s` }} />
        ))}
        {RAYS.map(({ i, y }) => (
          <text key={i} className={`pr-lab pr-r${i + 1}`} x={346} y={(y + 3.3).toFixed(1)} fontSize={10.35}>
            {i + 1}
          </text>
        ))}
      </svg>
      <h1 ref={h1} className="pr-title cb-run-title" aria-label={text} style={{ ['--pr-len' as string]: text.length }}>
        <Letters text={text} />
      </h1>
    </div>
  );
}

/** Placements per tier over the whole run. */
function tiersOf(run: RunState): number[] {
  const out = new Array(9).fill(0);
  for (const r of run.results) for (const [id, t] of Object.entries(r.tech)) out[TECHNIQUES[id as TechniqueId].tier] += t!.n;
  return out;
}

function Tiers({ run }: { run: RunState }) {
  const tiers = tiersOf(run);
  const most = Math.max(1, ...tiers.slice(1));
  if (!tiers.slice(1).some((n) => n > 0)) return null;
  return (
    <table className="cb-run-tiers">
      <caption className="cb-run-sr">Placements by tier</caption>
      <tbody>
        {tiers.map((n, t) =>
          t === 0 || n === 0 ? null : (
            <tr key={t} className={`cb-run-t${t}`}>
              <th scope="row">
                <TierDot tier={t} />
                {TIER_NAMES[t]}
              </th>
              <td className="cb-run-tiers-bar" aria-hidden="true">
                <span style={{ transform: `scaleX(${n / most})` }} />
              </td>
              <td className="is-num">{n}</td>
            </tr>
          ),
        )}
        {tiers[0] > 0 && (
          <tr className="cb-run-t0">
            <th scope="row">
              <TierDot tier={0} />
              {TIER_NAMES[0]}
            </th>
            <td />
            <td className="is-num">{tiers[0]}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function Boards({ run }: { run: RunState }) {
  return (
    <table className="cb-run-table">
      <caption className="cb-run-sr">Boards</caption>
      <tbody>
        {Array.from({ length: ANTES }, (_, a) =>
          KINDS.map((k) => {
            const r = resultOf(run, slotOf(a + 1, k));
            if (!r) return null;
            return (
              <tr key={`${a}${k}`}>
                <th scope="row">
                  <span className="cb-run-dim">{a + 1}</span> {KIND_NAMES[k]}
                </th>
                <td className="is-num">
                  {r.status === 'skipped' ? (
                    <span className="cb-run-dim">Skipped</span>
                  ) : (
                    <>
                      <span className={r.status === 'cleared' ? '' : 'cb-run-bad'}>{formatScore(r.score)}</span>
                      <span className="cb-run-dim"> / {formatScore(r.target)}</span>
                    </>
                  )}
                </td>
              </tr>
            );
          }),
        )}
      </tbody>
    </table>
  );
}

export interface SummaryProps {
  run: RunState;
  /** The score that counts as the daily best for this date, when this run is a replay. */
  dailyBest: number | null;
  fresh: UnlockId[];
  onFree: () => void;
  onHome: () => void;
}

export function Summary({ run, dailyBest, fresh, onFree, onHome }: SummaryProps) {
  const [sent, setSent] = useState<ShareOutcome | null>(null);
  const won = useRunStore((s) => s.won);
  // Read once: the burst plays for the run just won in view, and the store forgets it at once.
  const [play] = useState(() => run.outcome === 'won' && won === runId(run));
  const text = shareText(run);
  const best = run.results.reduce<RunState['results'][number]['best']>((b, r) => (r.best && (!b || r.best.points > b.points) ? r.best : b), null);
  const opened = unlockedNames(fresh);
  // How the run ended, in words, for screen readers; the track and the hearts show it.
  const how = text.split('\n')[1] ?? '';
  return (
    <Page title={title(run)} heading={run.outcome === 'won' ? <WinBand text={title(run)} play={play} /> : undefined} onBack={onHome} wide>
      <div className="cb-run-sum">
        <div className="cb-run-sum-col">
          <div className="cb-run-head">
            <Track run={run} at={-1} label={how} />
            <RunHearts run={run} />
            <LevelPill run={run} />
          </div>
          <p className="cb-run-bigscore" aria-label={`Score ${formatScore(run.score)}`}>
            {formatScore(run.score)}
          </p>
          {run.replay && dailyBest !== null && (
            <p className="cb-run-note">
              Daily best <strong>{formatScore(dailyBest)}</strong>
            </p>
          )}
          {best && (
            <p className="cb-run-best">
              <TierDot tier={TECHNIQUES[best.technique].tier} />
              <span>{TECHNIQUES[best.technique].name}</span>
              <strong>{formatScore(best.points)}</strong>
              <span className="cb-run-sr">was the best placement</span>
            </p>
          )}
          <Tiers run={run} />
        </div>

        <div className="cb-run-sum-col">
          <Boards run={run} />
          {opened.length > 0 && (
            <section className="cb-run-unlocked" aria-labelledby="cb-run-new-h">
              <h2 id="cb-run-new-h" className="cb-run-h2">
                Unlocked
              </h2>
              <ul>
                {opened.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </section>
          )}
          <div className="cb-run-actions">
            <button type="button" className="cb-run-btn is-primary" onClick={async () => setSent(await shareResult(text, `${APP_NAME} Run`))}>
              Share result
            </button>
            <button type="button" className="cb-run-btn" onClick={onFree}>
              New Run
            </button>
            <button type="button" className="cb-run-btn" onClick={onHome}>
              Run home
            </button>
          </div>
          <p className="cb-run-status" role="status" aria-live="polite">
            {sent === 'copied' ? 'Copied to the clipboard.' : sent === 'shared' ? 'Shared.' : sent === 'failed' ? 'Sharing is not available here. Copy the text below.' : ''}
          </p>
          {/* Shown only when sharing failed, so the result can still be copied by hand. */}
          {sent === 'failed' && (
            <pre className="cb-run-share" tabIndex={0} aria-label="Result text">
              {text}
            </pre>
          )}
        </div>
      </div>
    </Page>
  );
}
