// Screens: Daily, Fog, Free play, Stats, Settings and About.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { dailyPuzzle, fogFor } from '../engine';
import { generateAsync } from '../engine/client';
import type { ClueKind, Difficulty, Size } from '../engine/types';
import { actions, getGame, getSavedGame, lastGameKey, startGame, useGame } from '../game/store';
import { formatDateLong, formatTime } from '../game/logic';
import { useSettings, type MistakeSetting, type MotionSetting, type NightSetting } from '../game/settings';
import { bestStreak, currentStreak, useStats } from '../game/stats';
import type { ModeId } from '../game/types';
import { themes } from '../themes';
import { APP_NAME } from './brand';
import { GameView } from './GameView';
import { TopBar } from './TopBar';
import { ALL_KINDS, RULE_NAMES } from './rules';
import { appUrl, decodeFree, encodeFree, type FreeOptions } from './share';
import { useShell } from './shell';

function randomSeed(): string {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return `${a[0].toString(36)}${a[1].toString(36)}`.slice(0, 10);
}

/**
 * Frame for screens that are not a board: top bar with the menu and a title. With `back` it also
 * has a back arrow, as the Run and Learn pages do: it returns to the screen the player came from.
 */
export function Page({ title, children, back }: { title: string; children: ReactNode; back?: boolean }) {
  const shell = useShell();
  const onBack = back ? () => (history.state?.cbRoute && history.length > 1 ? history.back() : shell.go('daily')) : undefined;
  return (
    <div className="cb-page">
      <TopBar title={title} onBack={onBack} />
      <main className="cb-page-body">
        <h1 className="cb-page-title">{title}</h1>
        {children}
      </main>
    </div>
  );
}

export function Loading({ title, text }: { title: string; text: string }) {
  return (
    <Page title={title}>
      <p className="cb-muted" role="status">
        {text}
      </p>
    </Page>
  );
}

export function DailyScreen({ date }: { date: string }) {
  const game = useGame();
  const shell = useShell();
  const [error, setError] = useState<string | null>(null);
  const key = `daily:${date}`;
  useEffect(() => {
    let live = true;
    setError(null);
    dailyPuzzle(date)
      .then((puzzle) => {
        if (live) startGame({ key, mode: 'daily', puzzle });
      })
      .catch(() => live && setError('The Daily for this date could not be loaded.'));
    return () => {
      live = false;
    };
  }, [date, key]);
  if (error) return <Loading title="Daily" text={error} />;
  if (!game || game.key !== key) return <Loading title="Daily" text="Opening the Daily." />;
  return (
    <GameView
      game={game}
      title="Daily"
      subtitle={formatDateLong(date)}
      shareUrl={`${appUrl()}?daily=${date}`}
      next={{ label: 'Free play', run: () => shell.go('free') }}
    />
  );
}

const FOG_RULES: ClueKind[] = ['thermo', 'arrow', 'cage', 'renban', 'kropki', 'xv'];

export function FogScreen() {
  const game = useGame();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only the newest request may start a board, so a request that was asked for twice
  // (React's development double run of the effect below) never swaps the board under the player.
  const latest = useRef(0);

  const newBoard = useCallback(async (s: Size) => {
    const mine = ++latest.current;
    setBusy(true);
    setError(null);
    try {
      const puzzle = await generateAsync({ size: s, seed: randomSeed(), rules: FOG_RULES, difficulty: s === 9 ? 3 : 2, fog: true });
      if (mine !== latest.current) return;
      startGame({ key: `fog:${puzzle.seed}:${s}`, mode: 'fog', puzzle, fog: puzzle.fog ?? fogFor(puzzle), resume: false });
    } catch {
      if (mine === latest.current) setError('The board could not be made. Try again.');
    } finally {
      if (mine === latest.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    const last = lastGameKey('fog');
    const saved = last ? getSavedGame(last) : null;
    if (saved && saved.status !== 'solved' && saved.status !== 'failed') {
      startGame({ key: saved.key, mode: 'fog', puzzle: saved.puzzle, fog: saved.fog });
    } else void newBoard(6);
  }, [newBoard]);

  if (!game || game.mode !== 'fog') return <Loading title="Fog" text={error ?? 'Making a fog board.'} />;
  const controls = (
    <div className="cb-mode-bar" aria-busy={busy}>
      {([6, 9] as Size[]).map((s) => (
        <button
          key={s}
          type="button"
          className="cb-btn"
          onClick={() => void newBoard(s)}
          disabled={busy}
        >
          New {s}x{s}
        </button>
      ))}
      {busy && (
        <span className="cb-muted" role="status">
          Making a board
        </span>
      )}
    </div>
  );
  return (
    <GameView
      game={game}
      title="Fog"
      subtitle={`${game.puzzle.size} by ${game.puzzle.size}`}
      extra={controls}
      next={{ label: 'New board', run: () => newBoard(game.puzzle.size) }}
    />
  );
}

const DEFAULT_FREE: Omit<FreeOptions, 'seed'> = { size: 6, rules: ['thermo', 'arrow', 'cage', 'kropki'], difficulty: 2 };

function readFreeSetup(): Omit<FreeOptions, 'seed'> {
  try {
    const raw = localStorage.getItem('cellbound:v1:free');
    if (raw) {
      const v = decodeFree(raw);
      if (v) return { size: v.size, rules: v.rules, difficulty: v.difficulty };
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_FREE;
}

function saveFreeSetup(o: FreeOptions) {
  try {
    localStorage.setItem('cellbound:v1:free', encodeFree(o));
  } catch {
    /* ignore */
  }
}

export function FreeScreen({ code }: { code?: string | null }) {
  const game = useGame();
  const [setup, setSetup] = useState(readFreeSetup);
  const [phase, setPhase] = useState<'setup' | 'busy' | 'play'>('busy');
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async (o: FreeOptions, resume = true) => {
    setPhase('busy');
    setError(null);
    try {
      const puzzle = await generateAsync({ size: o.size, seed: o.seed, rules: o.rules, difficulty: o.difficulty });
      saveFreeSetup(o);
      startGame({ key: `free:${encodeFree(o)}`, mode: 'free', puzzle, resume });
      setPhase('play');
    } catch {
      setError('The board could not be made. Try other rules.');
      setPhase('setup');
    }
  }, []);

  useEffect(() => {
    const fromLink = code ? decodeFree(code) : null;
    if (fromLink) {
      setSetup({ size: fromLink.size, rules: fromLink.rules, difficulty: fromLink.difficulty });
      void start(fromLink);
      return;
    }
    const last = lastGameKey('free');
    const saved = last ? getSavedGame(last) : null;
    if (saved && saved.status !== 'solved' && saved.status !== 'failed') {
      startGame({ key: saved.key, mode: 'free', puzzle: saved.puzzle });
      setPhase('play');
    } else setPhase('setup');
  }, [code, start]);

  if (phase === 'busy') return <Loading title="Free play" text="Making a board." />;
  if (phase === 'setup' || !game || game.mode !== 'free') {
    const toggle = (k: ClueKind) =>
      setSetup((s) => ({ ...s, rules: s.rules.includes(k) ? s.rules.filter((x) => x !== k) : [...s.rules, k] }));
    return (
      <Page title="Free play" back>
        <form
          className="cb-form"
          onSubmit={(e) => {
            e.preventDefault();
            void start({ ...setup, seed: randomSeed() }, false);
          }}
        >
          <fieldset>
            <legend>Size</legend>
            <div className="cb-seg">
              {([6, 9] as Size[]).map((s) => (
                <label key={s} className={setup.size === s ? 'on' : ''}>
                  <input type="radio" name="size" checked={setup.size === s} onChange={() => setSetup({ ...setup, size: s })} />
                  {s}x{s}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Rules</legend>
            <div className="cb-checks">
              {ALL_KINDS.map((k) => (
                <label key={k} className={setup.rules.includes(k) ? 'on' : ''}>
                  <input type="checkbox" checked={setup.rules.includes(k)} onChange={() => toggle(k)} />
                  {RULE_NAMES[k]}
                </label>
              ))}
            </div>
            <p className="cb-muted">With no rules picked the board uses classic rules only.</p>
          </fieldset>
          <fieldset>
            <legend>Difficulty</legend>
            <div className="cb-seg">
              {([1, 2, 3, 4, 5] as Difficulty[]).map((d) => (
                <label key={d} className={setup.difficulty === d ? 'on' : ''}>
                  <input type="radio" name="difficulty" checked={setup.difficulty === d} onChange={() => setSetup({ ...setup, difficulty: d })} />
                  {d}
                </label>
              ))}
            </div>
            <p className="cb-muted">1 is gentle, 5 is fiendish.</p>
          </fieldset>
          {error && <p className="cb-error">{error}</p>}
          <button type="submit" className="cb-btn primary">
            Start
          </button>
        </form>
      </Page>
    );
  }
  const current = game.key.startsWith('free:') ? decodeFree(game.key.slice(5)) : null;
  const opts = current ?? { ...setup, seed: game.puzzle.seed };
  // Some rule mixes cannot reach every level; the generator then gives the closest board.
  const offLevel = opts.difficulty !== game.puzzle.difficulty;
  const controls = (
    <div className="cb-mode-bar">
      <button type="button" className="cb-btn" onClick={() => setPhase('setup')}>
        Change rules
      </button>
      <button type="button" className="cb-btn" onClick={() => start({ ...opts, seed: randomSeed() }, false)}>
        New board
      </button>
      {offLevel && (
        <p className="cb-muted cb-mode-note">
          These rules could not make a level {opts.difficulty} board, so this one is level {game.puzzle.difficulty}.
        </p>
      )}
    </div>
  );
  return (
    <GameView
      game={game}
      title="Free play"
      subtitle={`${game.puzzle.size} by ${game.puzzle.size}, level ${game.puzzle.difficulty}`}
      extra={controls}
      shareUrl={`${appUrl()}?free=${encodeFree(opts)}`}
      next={{ label: 'Next board', run: () => start({ ...opts, seed: randomSeed() }, false) }}
    />
  );
}

const MODE_NAMES: Record<ModeId, string> = { daily: 'Daily', run: 'Run', fog: 'Fog', free: 'Free play', learn: 'Learn' };

export function StatsScreen() {
  const stats = useStats();
  const streak = currentStreak(stats.daily);
  const best = bestStreak(stats.daily);
  const timeRows = Object.entries(stats.times).sort(([a], [b]) => a.localeCompare(b));
  const history = Object.entries(stats.daily).sort(([a], [b]) => b.localeCompare(a)).slice(0, 30);
  return (
    <Page title="Stats" back>
      <section className="cb-card">
        <h2>Daily streak</h2>
        <dl className="cb-figures">
          <div>
            <dt>Current</dt>
            <dd>{streak}</dd>
          </div>
          <div>
            <dt>Best</dt>
            <dd>{best}</dd>
          </div>
        </dl>
      </section>
      <section className="cb-card">
        <h2>Solves</h2>
        <dl className="cb-figures">
          {(Object.keys(MODE_NAMES) as ModeId[]).map((m) => (
            <div key={m}>
              <dt>{MODE_NAMES[m]}</dt>
              <dd>{stats.solves[m] ?? 0}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="cb-card">
        <h2>Times</h2>
        {timeRows.length ? (
          <table className="cb-table">
            <thead>
              <tr>
                <th scope="col">Board</th>
                <th scope="col">Level</th>
                <th scope="col">Solves</th>
                <th scope="col">Best</th>
                <th scope="col">Average</th>
              </tr>
            </thead>
            <tbody>
              {timeRows.map(([k, t]) => {
                const [size, level] = k.split(':');
                return (
                  <tr key={k}>
                    <td>{size}</td>
                    <td>{level}</td>
                    <td>{t.count}</td>
                    <td>{formatTime(t.bestMs)}</td>
                    <td>{formatTime(t.totalMs / Math.max(1, t.count))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="cb-muted">Solve a board to see your times.</p>
        )}
      </section>
      <section className="cb-card">
        <h2>Daily history</h2>
        {history.length ? (
          <ul className="cb-history">
            {history.map(([date, e]) => (
              <li key={date}>
                <span>{formatDateLong(date)}</span>
                <span>{e.status === 'solved' ? formatTime(e.ms) : 'Not solved'}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="cb-muted">No Dailies yet.</p>
        )}
      </section>
    </Page>
  );
}

function Choice<T extends string>({ legend, name, value, options, onChange }: { legend: string; name: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      <div className="cb-seg">
        {options.map(([v, label]) => (
          <label key={v} className={value === v ? 'on' : ''}>
            <input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="cb-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function SettingsScreen() {
  const s = useSettings();
  return (
    <Page title="Settings" back>
      <form className="cb-form" onSubmit={(e) => e.preventDefault()}>
        <fieldset>
          <legend>Theme</legend>
          <div className="cb-themes">
            {themes.map((t) => (
              <label key={t.id} className={`cb-theme-opt${s.theme === t.id ? ' on' : ''}`}>
                <input type="radio" name="theme" checked={s.theme === t.id} onChange={() => s.update({ theme: t.id })} />
                <span className="cb-theme-name">{t.name}</span>
                <span className="cb-theme-blurb">{t.blurb}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Choice<NightSetting>
          legend="Light or dark"
          name="night"
          value={s.night}
          options={[
            ['auto', 'Auto'],
            ['light', 'Light'],
            ['dark', 'Dark'],
          ]}
          onChange={(v) => s.update({ night: v })}
        />
        <Choice<MistakeSetting>
          legend="Mistake checking"
          name="mistakes"
          value={s.mistakes}
          options={[
            ['off', 'Off'],
            ['conflicts', 'Conflicts'],
            ['strict', 'Strict'],
          ]}
          onChange={(v) => s.update({ mistakes: v })}
        />
        <p className="cb-muted">Conflicts shows rule breaks among placed digits. Strict marks digits that differ from the solution. Fog and Run always check against the solution.</p>
        <fieldset>
          <legend>Play</legend>
          <Toggle
            label="Auto-notes: fill candidates and clear notes as you place digits"
            checked={s.autoNotes}
            onChange={(v) => {
              s.update({ autoNotes: v });
              if (v && getGame()?.status === 'playing') actions.fillNotes();
            }}
          />
          <Toggle label="Highlight the selected cell's row, column and box, and equal digits" checked={s.highlights} onChange={(v) => s.update({ highlights: v })} />
          <Toggle label="Hide the timer" checked={s.hideTimer} onChange={(v) => s.update({ hideTimer: v })} />
        </fieldset>
        <Choice<MotionSetting>
          legend="Reduced motion"
          name="motion"
          value={s.reducedMotion}
          options={[
            ['auto', 'Follow device'],
            ['on', 'On'],
          ]}
          onChange={(v) => s.update({ reducedMotion: v })}
        />
      </form>
    </Page>
  );
}

export function AboutScreen() {
  return (
    <Page title="About" back>
      <section className="cb-card cb-prose">
        <p>
          {APP_NAME} is variant sudoku for short daily sessions. It has a shared Daily, roguelite runs, fog boards, free play and a short
          lesson for each rule.
        </p>
        <p>Everything runs on your device. Puzzles are made in the browser and progress stays in local storage. There are no ads and no accounts.</p>
        <p>Released under the MIT licence.</p>
      </section>
    </Page>
  );
}
