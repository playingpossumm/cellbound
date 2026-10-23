// The playing surface: top bar, theme band, rule chips, rule text, board,
// number pad and tools, with the pause overlay and the result card.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { conflicts as engineConflicts } from '../engine';
import type { ClueKind } from '../engine/types';
import { Board } from '../board/Board';
import type { GameState } from '../game/types';
import { actions, checksSolution, getGame, heartsLeft, startClock, useFx } from '../game/store';
import { formatTime, fullGrid } from '../game/logic';
import { useSettings } from '../game/settings';
import { currentStreak, useStats } from '../game/stats';
import { useLessonDone } from '../modes';
import { getTheme } from '../themes';
import { APP_NAME } from './brand';
import { EraseIcon, HintIcon, NotesIcon, PauseIcon, PlayIcon, ShareIcon, StatsIcon, UndoIcon } from './icons';
import { classicText, kindsIn, RULE_NAMES, ruleText } from './rules';
import { appUrl, shareResult } from './share';
import { useShell } from './shell';
import { useNight } from './theme';
import { TopBar } from './TopBar';

export interface GameViewProps {
  game: GameState;
  /** Shown in the theme band, for example "Daily". */
  title: string;
  /** For example "Friday 23 October". */
  subtitle: string;
  onExit?: () => void;
  /** Mode-specific panel (hearts, run progress), rendered between the band and the board. */
  extra?: ReactNode;
  hideRuleChips?: boolean;
  /** Rendered over the board when the game is solved or failed, instead of the default result card. */
  endPanel?: ReactNode;
  /** Main next action on the result card, for example a new board. */
  next?: { label: string; run: () => void };
  /** Link placed in the shared result. Defaults to the app address. */
  shareUrl?: string;
}

const LAPTOP = 900;
const NO_NOTES = 'Notes are off for this board.';

/**
 * Board edge in CSS pixels: as large as fits. Phones use the column width;
 * from 900 px the board also fits the window height under the top bar and band.
 */
function useBoardSide(
  playRef: React.RefObject<HTMLDivElement | null>,
  bandRef: React.RefObject<HTMLDivElement | null>,
  topRef: React.RefObject<HTMLElement | null>,
) {
  const [side, setSide] = useState(358);
  useLayoutEffect(() => {
    const wide = window.matchMedia?.(`(min-width: ${LAPTOP}px)`);
    const measure = () => {
      const play = playRef.current;
      if (!play) return;
      const cs = getComputedStyle(play);
      const inner = play.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      let next: number;
      if (wide?.matches) {
        const band = bandRef.current?.offsetHeight ?? 0;
        const top = topRef.current?.offsetHeight ?? 0;
        const availH = window.innerHeight - top - band - 36;
        const availW = inner - 380 - 48;
        next = Math.max(280, Math.min(availH, availW, 680));
      } else {
        next = Math.max(240, Math.min(inner, 560));
      }
      next = Math.floor(next);
      setSide((s) => (s === next ? s : next));
    };
    measure();
    window.addEventListener('resize', measure);
    wide?.addEventListener('change', measure);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro) {
      if (playRef.current) ro.observe(playRef.current);
      if (bandRef.current) ro.observe(bandRef.current);
    }
    return () => {
      window.removeEventListener('resize', measure);
      wide?.removeEventListener('change', measure);
      ro?.disconnect();
    };
  }, [playRef, bandRef, topRef]);
  return side;
}

export function GameView({ game, title, subtitle, onExit, extra, hideRuleChips, endPanel, next, shareUrl }: GameViewProps) {
  const settings = useSettings();
  const theme = getTheme(settings.theme);
  const night = useNight();
  const shell = useShell();
  const fx = useFx();
  const [lit, setLit] = useState<ClueKind | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const bandRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLElement>(null);
  const playRef = useRef<HTMLDivElement>(null);
  const side = useBoardSide(playRef, bandRef, topRef);
  const p = game.puzzle;
  const n = p.size;

  useEffect(() => startClock(), []);
  useEffect(() => {
    setLit(null);
    setNotice(null);
  }, [game.key]);

  const full = useMemo(() => fullGrid(p, game.values), [p, game.values]);
  const strict = checksSolution(game);
  const conflictCells = useMemo(() => {
    const out = new Array<boolean>(n * n).fill(false);
    if (settings.mistakes === 'off' && !strict) return out;
    let list: { cells: number[] }[] = [];
    try {
      list = engineConflicts(p, full);
    } catch {
      list = [];
    }
    for (const c of list) for (const i of c.cells) out[i] = true;
    return out;
  }, [p, full, n, settings.mistakes, strict]);
  const wrong = useMemo(
    () =>
      game.values.map((v, i) => {
        if (!v || p.givens[i]) return false;
        if (strict) return v !== p.solution[i];
        return settings.mistakes !== 'off' && conflictCells[i];
      }),
    [game.values, p, strict, settings.mistakes, conflictCells],
  );
  const counts = useMemo(() => {
    const c = new Array<number>(n + 1).fill(0);
    for (const d of full) if (d) c[d]++;
    return c;
  }, [full, n]);

  const kinds = useMemo(() => kindsIn(p), [p]);
  const focus = useMemo(() => fx.hint?.focus ?? [], [fx.hint]);
  const highlights = settings.highlights && !game.mods?.noHighlights;
  // Boards with a time limit count down; everything else counts up.
  const limit = game.mods?.timeLimitMs;
  const time = settings.hideTimer && limit === undefined ? '' : formatTime(limit !== undefined ? Math.max(0, limit - game.elapsedMs) : game.elapsedMs);
  const ended = game.status === 'solved' || game.status === 'failed';
  const paused = game.status === 'paused';

  // A short spoken line for screen readers after each placement.
  const [said, setSaid] = useState('');
  const lastFlash = useRef(fx.flashCount);
  useEffect(() => {
    const i = fx.placedCell;
    const unit = fx.flashCount !== lastFlash.current;
    lastFlash.current = fx.flashCount;
    if (i === null || fx.placeCount === 0) return;
    const g = getGame();
    if (!g) return;
    const d = g.values[i];
    if (!d) return;
    const where = `row ${Math.floor(i / g.puzzle.size) + 1}, column ${(i % g.puzzle.size) + 1}`;
    const bad = checksSolution(g) && d !== g.puzzle.solution[i];
    const tail = g.status === 'solved' ? ' Solved.' : unit ? ' A row, column or box is complete.' : '';
    setSaid(`${d} in ${where}.${bad ? ' It does not fit.' : ''}${tail}`);
  }, [fx.placeCount, fx.placedCell, fx.flashCount]);

  // The result card waits for the board flourish when the game ends in front of the player.
  const [showEnd, setShowEnd] = useState(ended);
  const endedHere = useRef(false);
  useEffect(() => {
    if (!ended) {
      setShowEnd(false);
      endedHere.current = true;
      return;
    }
    if (!endedHere.current) {
      setShowEnd(true);
      return;
    }
    const reduce = document.documentElement.dataset.reducedMotion === 'true';
    // Long enough for the whole-board wave to reach the far corner of a 9x9.
    const t = setTimeout(() => setShowEnd(true), reduce ? 0 : 1500);
    return () => clearTimeout(t);
  }, [ended, game.key]);

  const onSelect = useCallback((i: number) => {
    setNotice(null);
    actions.select(i);
  }, []);

  /** Digit input from the pad or keyboard, with a word when a cell cannot take it. */
  const enter = useCallback((d: number) => {
    const g = getGame();
    if (g && g.status === 'playing' && g.selected !== null && g.fog && !g.fog.cleared[g.selected]) {
      setNotice('This cell is still under fog. Clear the cells around it first.');
      return;
    }
    if (g && g.status === 'playing' && g.selected === null) {
      setNotice('Pick a cell first, then a number.');
      return;
    }
    setNotice(null);
    actions.input(d);
  }, []);

  const doHint = useCallback(() => {
    const step = actions.hint();
    setNotice(step ? null : 'No hint is available here.');
  }, []);

  // Keyboard play.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('input, select, textarea, [contenteditable="true"]')) return;
      if (document.querySelector('dialog[open]')) return;
      const g = getGame();
      if (!g) return;
      const key = e.key;
      const lower = key.length === 1 ? key.toLowerCase() : key;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && lower === 'z') {
        e.preventDefault();
        if (e.shiftKey) actions.redo();
        else actions.undo();
        return;
      }
      if (mod && lower === 'y') {
        e.preventDefault();
        actions.redo();
        return;
      }
      if (mod || e.altKey) return;
      const size = g.puzzle.size;
      if (/^[1-9]$/.test(key)) {
        e.preventDefault();
        enter(Number(key));
        return;
      }
      // Shift with a digit writes a note without leaving digit mode.
      const code = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
      if (e.shiftKey && code) {
        e.preventDefault();
        // With notes off (a Run curse) the note key must not place a digit instead.
        if (g.mods?.noNotes) setNotice(NO_NOTES);
        else if (g.notesMode) enter(Number(code[1]));
        else {
          actions.toggleNotes();
          enter(Number(code[1]));
          actions.toggleNotes();
        }
        return;
      }
      const move = (dr: number, dc: number) => {
        e.preventDefault();
        setNotice(null);
        const focused = (document.activeElement as HTMLElement | null)?.dataset?.cell;
        const cur = g.selected ?? (focused !== undefined ? Number(focused) : null);
        if (cur === null) {
          actions.select(Math.floor((size * size) / 2));
          return;
        }
        const r = (Math.floor(cur / size) + dr + size) % size;
        const c = ((cur % size) + dc + size) % size;
        actions.select(r * size + c);
      };
      switch (lower) {
        case '0':
        case 'Backspace':
        case 'Delete':
          e.preventDefault();
          actions.erase();
          return;
        case 'ArrowUp':
        case 'w':
          return move(-1, 0);
        case 'ArrowDown':
        case 's':
          return move(1, 0);
        case 'ArrowLeft':
        case 'a':
          return move(0, -1);
        case 'ArrowRight':
        case 'd':
          return move(0, 1);
        case 'n':
          if (g.mods?.noNotes) setNotice(NO_NOTES);
          else actions.toggleNotes();
          return;
        case 'z':
          actions.undo();
          return;
        case 'y':
          actions.redo();
          return;
        case 'h':
          doHint();
          return;
        case 'p':
          if (g.status === 'paused') actions.resume();
          else actions.pause();
          return;
        case 'Escape':
          actions.select(null);
          actions.dismissHint();
          setLit(null);
          return;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [doHint, enter]);

  const Band = theme.Band;
  const padCols = n === 9 ? 'nine' : n === 4 ? 'four' : 'six';
  const hearts = heartsLeft(game);
  const ruleLine = notice ?? fx.hint?.text ?? (lit ? ruleText(lit, p) : classicText(n));

  return (
    <div className="cb-game" data-mode={game.mode} style={{ ['--cb-side' as string]: `${side}px` }}>
      <TopBar
        ref={topRef}
        title={title}
        onBack={onExit}
        backLabel="Leave this board"
        right={
          <>
            <button
              type="button"
              className="cb-ib"
              aria-label={paused ? 'Resume' : 'Pause'}
              onClick={() => (paused ? actions.resume() : actions.pause())}
              disabled={ended}
            >
              {paused ? <PlayIcon /> : <PauseIcon />}
            </button>
            <button type="button" className="cb-ib" aria-label="Stats" onClick={() => shell.go('stats')}>
              <StatsIcon />
            </button>
          </>
        }
      >
        {time && (
          // Themes whose band draws the time keep this copy for screen readers only,
          // so the time shows once on screen.
          <span
            className={`cb-timer${limit !== undefined ? ' is-limit' : ''}${theme.bandShowsTime ? ' cb-sr' : ''}`}
            aria-label={`${limit !== undefined ? 'Time left' : 'Time'} ${time}`}
            role="timer"
          >
            {time}
          </span>
        )}
      </TopBar>

      <div className="cb-play" ref={playRef}>
        <div className="cb-band-wrap" ref={bandRef}>
          <Band title={title} subtitle={subtitle} time={time} puzzle={p} values={full} night={night} />
        </div>

        {/* The board comes before the side panel in the page, so Tab and screen readers
            reach it first; grid areas still place the panel above, beside or below it. */}
        <div className="cb-stage">
          <div className={`cb-board-wrap${paused ? ' is-paused' : ''}`} style={{ width: side, height: side }}>
            <Board
              puzzle={p}
              values={game.values}
              notes={game.notes}
              selected={ended ? null : game.selected}
              hinted={game.hinted}
              fogCleared={game.fog?.cleared}
              highlights={highlights}
              wrong={wrong}
              conflict={conflictCells}
              focus={focus}
              lit={lit}
              doneBoxes={game.doneBoxes}
              flash={fx.flash}
              flashCount={fx.flashCount}
              placedCell={fx.placedCell}
              placeCount={fx.placeCount}
              placedAt={fx.placedAt}
              theme={theme}
              solved={game.status === 'solved'}
              onSelect={onSelect}
            />
            {paused && (
              <div className="cb-pause">
                <p className="cb-pause-title">Paused</p>
                <button type="button" className="cb-btn primary" onClick={actions.resume} autoFocus>
                  Resume
                </button>
              </div>
            )}
            {ended && showEnd &&
              (endPanel ? (
                <div className="cb-result cb-end-panel">{endPanel}</div>
              ) : (
                <ResultCard game={game} title={title} subtitle={subtitle} next={next} shareUrl={shareUrl} />
              ))}
          </div>
        </div>

        <div className="cb-side">
          {(extra || hearts !== null) && (
            <div className="cb-extra">
              {extra ?? (
                <p className="cb-hearts" aria-label={`${hearts} hearts left`}>
                  Hearts: {hearts}
                </p>
              )}
            </div>
          )}

          {!hideRuleChips && kinds.length > 0 && (
            <div className="cb-chips" role="group" aria-label="Rules">
              {kinds.map((k) => {
                return (
                  <span key={k} className="cb-chip-wrap">
                    <button
                      type="button"
                      className={`cb-chip${lit === k ? ' on' : ''}`}
                      aria-pressed={lit === k}
                      onClick={() => {
                        setNotice(null);
                        actions.dismissHint();
                        setLit(lit === k ? null : k);
                      }}
                    >
                      {RULE_NAMES[k]}
                    </button>
                    <NewMark kind={k} onOpen={() => shell.openLesson(k)} />
                  </span>
                );
              })}
            </div>
          )}

          <p className="cb-sr" aria-live="polite">
            {said}
          </p>
          <p className={`cb-rtext${fx.hint ? ' is-hint' : ''}`} aria-live="polite">
            {ruleLine}
          </p>

          <div className="cb-pad" data-cols={padCols} data-notes={game.notesMode} role="group" aria-label={game.notesMode ? 'Number pad, notes' : 'Number pad'}>
            {Array.from({ length: n }, (_, k) => {
              const d = k + 1;
              const left = Math.max(0, n - counts[d]);
              return (
                <button
                  key={d}
                  type="button"
                  className={`cb-key${left ? '' : ' spent'}`}
                  aria-label={`${game.notesMode ? 'Note' : 'Enter'} ${d}, ${left} left`}
                  onClick={() => enter(d)}
                  disabled={ended || paused}
                >
                  <span className="cb-key-d">{d}</span>
                  <span className="cb-key-left">{left} left</span>
                </button>
              );
            })}
          </div>

          <div className="cb-tools" role="group" aria-label="Tools">
            <button type="button" className="cb-tool" onClick={actions.undo} disabled={ended || paused || !game.undo.length}>
              <UndoIcon />
              <span>Undo</span>
            </button>
            <button type="button" className="cb-tool" onClick={actions.erase} disabled={ended || paused}>
              <EraseIcon />
              <span>Erase</span>
            </button>
            <button
              type="button"
              className={`cb-tool${game.notesMode ? ' on' : ''}`}
              aria-pressed={game.notesMode}
              onClick={actions.toggleNotes}
              disabled={ended || paused || !!game.mods?.noNotes}
              title={game.mods?.noNotes ? NO_NOTES : undefined}
            >
              <NotesIcon />
              <span>Notes</span>
            </button>
            <button type="button" className="cb-tool" onClick={doHint} disabled={ended || paused}>
              <HintIcon />
              <span>Hint</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The New mark on a rule chip, until the player finishes that rule's lesson. */
function NewMark({ kind, onOpen }: { kind: ClueKind; onOpen: () => void }) {
  const done = useLessonDone(kind);
  if (done) return null;
  return (
    <button type="button" className="cb-chip-new" aria-label={`New rule: open the ${RULE_NAMES[kind]} lesson`} onClick={onOpen}>
      New
    </button>
  );
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function ResultCard({ game, title, subtitle, next, shareUrl }: { game: GameState; title: string; subtitle: string; next?: GameViewProps['next']; shareUrl?: string }) {
  const shell = useShell();
  const daily = useStats((s) => s.daily);
  const streak = game.mode === 'daily' ? currentStreak(daily) : null;
  const [shared, setShared] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Bring keyboard focus to the result so its actions are one key away.
    cardRef.current?.focus({ preventScroll: true });
  }, []);
  const solved = game.status === 'solved';
  const time = formatTime(game.elapsedMs);
  const limit = game.mods?.timeLimitMs;
  const reason = solved ? 'Solved' : limit !== undefined && game.elapsedMs >= limit ? 'Out of time' : 'Out of hearts';

  const share = async () => {
    const text = solved
      ? `${APP_NAME} ${title}, ${subtitle}: solved in ${time} with ${plural(game.mistakes, 'mistake', 'mistakes')} and ${plural(game.hintsUsed, 'hint', 'hints')}.${streak ? ` Streak ${streak}.` : ''}`
      : `${APP_NAME} ${title}, ${subtitle}: ${reason.toLowerCase()} after ${time}.`;
    const r = await shareResult(text, shareUrl ?? appUrl());
    setShared(r === 'copied' ? 'Copied to the clipboard.' : r === 'shared' ? 'Shared.' : 'Sharing is not available here.');
  };

  return (
    <div className="cb-result" role="dialog" aria-modal="false" aria-labelledby="cb-result-title">
      <div className="cb-result-card" ref={cardRef} tabIndex={-1}>
        <h2 id="cb-result-title" className="cb-result-title">
          {reason}
        </h2>
        <dl className="cb-result-stats">
          <div>
            <dt>Time</dt>
            <dd>{time}</dd>
          </div>
          <div>
            <dt>Mistakes</dt>
            <dd>{game.mistakes}</dd>
          </div>
          <div>
            <dt>Hints</dt>
            <dd>{game.hintsUsed}</dd>
          </div>
          {streak !== null && (
            <div>
              <dt>Streak</dt>
              <dd>{streak}</dd>
            </div>
          )}
        </dl>
        <div className="cb-result-actions">
          {next && (
            <button type="button" className="cb-btn primary" onClick={next.run}>
              {next.label}
            </button>
          )}
          <button type="button" className="cb-btn" onClick={share}>
            <ShareIcon />
            Share
          </button>
          <button type="button" className="cb-btn" onClick={() => shell.go('stats')}>
            Stats
          </button>
        </div>
        {shared && (
          <p className="cb-result-note" role="status">
            {shared}
          </p>
        )}
      </div>
    </div>
  );
}
