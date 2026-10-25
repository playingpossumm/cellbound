// Run home, the Collection and the card choice.
import { useState, type ReactNode } from 'react';
import { TopBar } from '../../../app/TopBar';
import { formatDateLong } from '../../../game/logic';
import { RULE_NAMES } from '../../names';
import { useScreenEntry } from '../../screenEntry';
import { loadBoard } from '../board';
import { BOARD_COUNT, rulesFor } from '../boards';
import { START_HEARTS, CARDS, cardsByKind, type Card, type CardKind } from '../cards';
import { formatScore } from '../score';
import { cardsOf, choose as chooseCard, type RunState } from '../state';
import { MILESTONES, bestDaily, milestoneOf, unlockedSet, type RunStats } from '../stats';
import { CardBody } from './CardTile';
import { Hearts, Track } from './Hud';
import { LockIcon } from './icons';

/** A Run page: the app's top bar (menu and back), then the page. The page's title is its heading. */
export function Page({ title, onBack, children }: { title?: string; onBack?: () => void; children: ReactNode }) {
  const ref = useScreenEntry<HTMLElement>();
  return (
    <div className="cb-run">
      <TopBar title="Run" quietTitle={title === 'Run'} onBack={onBack} />
      <main className="cb-run-page" ref={ref} tabIndex={-1}>
        {title && <h1 className="cb-run-title">{title}</h1>}
        {children}
      </main>
    </div>
  );
}

/** "Friday 23 October", the date format of the rest of the app. */
export const formatDay = formatDateLong;

export interface HomeProps {
  today: string;
  stats: RunStats;
  current: RunState | null;
  last: RunState | null;
  onBack: () => void;
  onDaily: () => void;
  onFree: () => void;
  onResume: () => void;
  onGiveUp: () => void;
  onLast: () => void;
  onCollection: () => void;
}

/** A score figure with its short label. */
function Score({ value }: { value: number }) {
  return (
    <span className="cb-run-score">
      <span className="cb-run-label">Score</span> {formatScore(value)}
    </span>
  );
}

export function Home(p: HomeProps) {
  const [ask, setAsk] = useState<'daily' | 'free' | 'end' | null>(null);
  const todays = p.stats.dailyBest[p.today];
  const best = bestDaily(p.stats);
  const unlocked = unlockedSet(p.stats);
  const open = CARDS.filter((c) => !c.unlock || (c.unlock && unlocked.has(c.unlock))).length;
  const dailyRunning = !!p.current && p.current.daily === p.today;
  // The first attempt of a day sets the daily best, so ending one early counts.
  const counts = !!p.current && p.current.daily !== null && !p.current.replay;
  const start = (kind: 'daily' | 'free') => {
    if (kind === 'daily' && dailyRunning) p.onResume();
    else if (p.current) setAsk(kind);
    else (kind === 'daily' ? p.onDaily : p.onFree)();
  };
  const warning =
    (ask === 'end' ? 'End this run? ' : 'Starting a new run ends the one in progress. ') +
    (counts ? 'Its score so far becomes your daily best for that day.' : 'Its score so far is kept.');
  // The question sits next to the button that raised it.
  const question = (
    <section className="cb-run-box is-warn" role="alert">
      <p>{warning}</p>
      <div className="cb-run-actions">
        <button
          type="button"
          className="cb-run-btn is-primary"
          autoFocus
          onClick={() => {
            const k = ask;
            setAsk(null);
            if (k === 'end') p.onGiveUp();
            else if (k === 'daily') p.onDaily();
            else if (k === 'free') p.onFree();
          }}
        >
          {ask === 'end' ? 'End run' : 'Start anyway'}
        </button>
        <button type="button" className="cb-run-btn" onClick={() => setAsk(null)}>
          Keep playing
        </button>
      </div>
    </section>
  );
  return (
    <Page title="Run" onBack={p.onBack}>
      {/* What a run is, drawn: five boards and three hearts. */}
      <div className="cb-run-shape">
        <Track label={`${BOARD_COUNT} boards and ${START_HEARTS} hearts.`} />
        <Hearts now={START_HEARTS} slots={START_HEARTS} />
      </div>

      {p.current && (
        <section className="cb-run-box" aria-labelledby="cb-run-resume-h">
          <h2 id="cb-run-resume-h" className="cb-run-h2">
            Run in progress
          </h2>
          <div className="cb-run-hud-row">
            <Track results={p.current.results} at={p.current.index} label={`Board ${p.current.index + 1} of ${BOARD_COUNT}`} />
            <Hearts now={p.current.hearts} slots={Math.max(3, p.current.hearts)} shield={p.current.shield} />
            <Score value={p.current.score} />
          </div>
          <div className="cb-run-actions">
            <button type="button" className="cb-run-btn is-primary" onClick={p.onResume}>
              Resume run
            </button>
            <button type="button" className="cb-run-btn" onClick={() => setAsk('end')}>
              End run
            </button>
          </div>
        </section>
      )}

      {ask === 'end' && question}

      <div className="cb-run-start">
        <button type="button" className={'cb-run-btn is-big' + (todays && !dailyRunning ? '' : ' is-primary')} onClick={() => start('daily')}>
          {dailyRunning ? 'Resume daily run' : todays ? 'Play again' : 'Start daily run'}
        </button>
        <button type="button" className={'cb-run-btn is-big' + (todays && !dailyRunning ? ' is-primary' : '')} onClick={() => start('free')}>
          Start free run
        </button>
      </div>

      {(ask === 'daily' || ask === 'free') && question}

      <section aria-labelledby="cb-run-best-h">
        <h2 id="cb-run-best-h" className="cb-run-h2">
          Best scores
        </h2>
        <dl className="cb-run-stats">
          <div>
            <dt>Today</dt>
            <dd>{todays ? formatScore(todays.score) : 'Not played'}</dd>
          </div>
          <div>
            <dt>Best daily</dt>
            <dd>{best ? formatScore(best.score) : 'None yet'}</dd>
          </div>
          <div>
            <dt>Best free run</dt>
            <dd>{p.stats.bestFree ? formatScore(p.stats.bestFree.score) : 'None yet'}</dd>
          </div>
          <div>
            <dt>Runs finished</dt>
            <dd>{p.stats.finished}</dd>
          </div>
        </dl>
      </section>

      <div className="cb-run-actions is-split">
        <button type="button" className="cb-run-btn" onClick={p.onCollection}>
          Collection{' '}
          <span className="cb-run-dim">
            {open} of {CARDS.length}
          </span>
        </button>
        {p.last && (
          <button type="button" className="cb-run-btn" onClick={p.onLast}>
            Last run <span className="cb-run-dim">{formatScore(p.last.score)}</span>
          </button>
        )}
      </div>
    </Page>
  );
}

// ---- Collection ------------------------------------------------------------------------

const GROUPS: Array<{ kind: CardKind; title: string }> = [
  { kind: 'boon', title: 'Boons' },
  { kind: 'curse', title: 'Curses' },
  { kind: 'bargain', title: 'Bargains' },
];

export function Collection({ stats, onBack }: { stats: RunStats; onBack: () => void }) {
  const unlocked = unlockedSet(stats);
  const isOpen = (c: Card) => !c.unlock || unlocked.has(c.unlock);
  const total = CARDS.length;
  const open = CARDS.filter(isOpen).length;
  return (
    <Page title="Collection" onBack={onBack}>
      <p className="cb-run-count">
        <strong>{open}</strong> of {total} cards
      </p>
      <section aria-labelledby="cb-run-ms-h">
        <h2 id="cb-run-ms-h" className="cb-run-h2">
          Milestones
        </h2>
        <ul className="cb-run-milestones">
          {MILESTONES.map((m) => {
            const done = unlocked.has(m.id);
            const prog = Math.min(m.goal, m.progress(stats));
            const opens = CARDS.filter((c) => c.unlock === m.id).map((c) => c.name);
            return (
              <li key={m.id} className={done ? 'is-done' : ''}>
                <span className="cb-run-ms-how">{m.how}</span>
                <span className="cb-run-dim">
                  {done ? 'Done' : `${prog} of ${m.goal}`}, opens {opens.join(', ')}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
      {GROUPS.map((g) => (
        <section key={g.kind} aria-labelledby={`cb-run-g-${g.kind}`}>
          <h2 id={`cb-run-g-${g.kind}`} className="cb-run-h2">
            {g.title}
          </h2>
          <ul className="cb-run-grid">
            {cardsByKind(g.kind).map((c) => {
              const ok = isOpen(c);
              const m = c.unlock ? milestoneOf(c.unlock) : null;
              return (
                <li key={c.id} className={`cb-run-card is-tile is-${c.kind}` + (ok ? '' : ' is-locked')}>
                  <CardBody card={c} />
                  {!ok && m && (
                    <span className="cb-run-lock">
                      <LockIcon className="cb-run-lock-icon" />
                      <span>
                        {m.how} <span className="cb-run-dim">{Math.min(m.goal, m.progress(stats))} of {m.goal}</span>
                      </span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </Page>
  );
}

// ---- Card choice -----------------------------------------------------------------------

export function Choose({ run, onPick, onHome }: { run: RunState; onPick: (id: string) => void; onHome: () => void }) {
  const [sel, setSel] = useState<string | null>(null);
  const next = run.index + 1;
  const offers = cardsOf(run.offer);
  const chosen = offers.find((c) => c.id === sel);
  // Start building the board a card leads to as soon as it is highlighted, so Take is instant.
  const select = (id: string) => {
    setSel(id);
    const after = chooseCard(run, id);
    if (after !== run) loadBoard(after.setup.options).catch(() => undefined);
  };
  return (
    <Page title="Choose a card" onBack={onHome}>
      {/* The track rings the board the card is for. */}
      <div className="cb-run-hud-row cb-run-choose-status">
        <Track results={run.results} at={next} label={`The card is for board ${next + 1} of ${BOARD_COUNT}.`} />
        <Hearts now={run.hearts} slots={Math.max(3, run.hearts)} shield={run.shield} />
        <Score value={run.score} />
      </div>
      <ul className="cb-run-rules" aria-label="Rules on that board">
        {rulesFor(run.seed, next).map((k) => (
          <li key={k}>{RULE_NAMES[k]}</li>
        ))}
      </ul>
      <ul className="cb-run-offers">
        {offers.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className={`cb-run-card is-${c.kind}` + (sel === c.id ? ' is-selected' : '')}
              aria-pressed={sel === c.id}
              onClick={() => select(c.id)}
            >
              <CardBody card={c} selected={sel === c.id} board={chooseCard(run, c.id).setup} />
            </button>
          </li>
        ))}
      </ul>
      <div className="cb-run-actions">
        <button type="button" className="cb-run-btn is-primary" disabled={!chosen} onClick={() => chosen && onPick(chosen.id)}>
          {chosen ? `Take ${chosen.name}` : 'Pick a card'}
        </button>
      </div>
    </Page>
  );
}
