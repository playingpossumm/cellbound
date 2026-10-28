// The playing surface: top bar, theme band, rule chips, board, number pad and tools,
// with the pause overlay and the result card. Nothing here explains itself in words: a
// rule's text shows only while its chip is on, and hints and notices take the band's place.
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { conflicts as engineConflicts } from '../engine';
import type { ClueKind } from '../engine/types';
import { Board } from '../board/Board';
import type { GameState } from '../game/types';
import { actions, checksSolution, getGame, heartsLeft, startClock, useFx } from '../game/store';
import { formatTime, fullGrid } from '../game/logic';
import { useSettings } from '../game/settings';
import { currentStreak } from '../game/stats';
import { useAllStats } from '../sync/account';
import { useLessonDone } from '../modes';
import { getTheme } from '../themes';
import { NewBadges } from './badges';
import { APP_NAME } from './brand';
import { CheckIcon, EraseIcon, HintIcon, NotesIcon, PauseIcon, PlayIcon, ShareIcon, StatsIcon, UndoIcon } from './icons';
import { PRESS } from './motion';
import { soundKey } from './sound';
import { kindsIn, RULE_NAMES, ruleText } from './rules';
import { appUrl, shareResult } from './share';
import { useShell } from './shell';
import { TopBar } from './TopBar';

export interface GameViewProps {
  game: GameState;
  /** Shown in the theme band, for example "Daily". */
  title: string;
  /**
   * What the board is, for the shared result, for example "Friday 23 October". The band does
   * not show it: see bandSubtitle.
   */
  subtitle: string;
  /**
   * A line under the band's title. Leave it out unless the player needs it to tell this board
   * from another one, as with a Daily from an earlier day.
   */
  bandSubtitle?: string;
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
  /** Drawn in the band's place, for a mode whose status is the header (the Run's score). */
  band?: ReactNode;
  /** Chips placed before the rule chips, for example a Run boss rule. */
  chipsLead?: ReactNode;
  /**
   * Sets the rule chips on the line of the mode's panel, after it, when they fit, and below it when
   * they do not: a Run's lenses leave room for them, and a short phone needs the row.
   */
  chipsBeside?: boolean;
  /** Laid over the board without taking input, for example the Run's placement popups. */
  boardOverlay?: ReactNode;
  /** Hides the clock on a board with no time limit, for a mode whose score ignores time (a Run). */
  quietClock?: boolean;
  /** A mode's own line for the message panel, with an optional action, shown like a rule's text. */
  note?: GameNote | null;
  /** Called when the message panel moves on from the note (another chip, Escape). */
  onNoteDismiss?: () => void;
}

export interface GameNote {
  text: string;
  action?: { label: string; run: () => void; disabled?: boolean };
}

/** A key or a tool under the pointer ticks (sound.ts) and squashes (motion.ts); a typed key does neither. */
const KEY = {
  ...PRESS,
  onPointerDown(e: { button: number; currentTarget: Element }) {
    if (e.button === 0 && !(e.currentTarget as HTMLButtonElement).disabled) soundKey();
    PRESS.onPointerDown(e);
  },
};

/** The two-column layout: a wide window, or a phone held sideways. Keep in step with base.css. */
const WIDE = '(min-width: 900px), (min-width: 700px) and (max-height: 520px)';
/** Where base.css draws the band small, at 60 percent: a short phone screen, or a phone held sideways. */
const SMALL_BAND = '(max-width: 699px) and (max-height: 799px), (min-width: 700px) and (max-height: 520px)';

/** True while a media query matches. */
function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const m = window.matchMedia?.(query);
    if (!m) return;
    const update = () => setOn(m.matches);
    update();
    m.addEventListener('change', update);
    return () => m.removeEventListener('change', update);
  }, [query]);
  return on;
}
const NO_NOTES = 'Notes are off for this board.';
/** Smallest cell, in CSS pixels, that the stacked layout shrinks the board to when that avoids scrolling. */
const MIN_CELL: Record<number, number> = { 4: 56, 6: 50, 9: 33 };
/**
 * On a short phone (Safari's bars showing, or an iPhone mini) a 9x9 may give up a little more, so a
 * Run's full screen, with its lenses, chips and pad, fits without a scroll. Keep in step with the
 * short-phone rules in base.css and run.css.
 */
const SHORT = '(max-width: 699px) and (max-height: 799px)';
const MIN_CELL_SHORT: Record<number, number> = { ...MIN_CELL, 9: 30 };
/** Largest board edge in the two-column layout, and stacked (an upright tablet). */
const MAX_SIDE = 720;
const MAX_STACKED_SIDE = 640;
/** Width of the side column in the two-column layout, and the gap before it. Keep in step with base.css. */
const SIDE_COLUMN = 360;
const SIDE_GAP = 40;

/**
 * The smallest height the window takes, with a phone browser's toolbars showing. The board is
 * sized to it, so it keeps its size while the toolbars slide away and back as the page scrolls.
 * Falls back to the window height where the unit is unknown.
 */
function smallViewportHeight(): number {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100svh;visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  const h = probe.offsetHeight;
  probe.remove();
  return h || window.innerHeight;
}

/** The stacked parts other than the board, whose heights decide how much room the board has. */
const STACKED_PARTS = ['.cb-band-wrap', '.cb-extra', '.cb-chips', '.cb-stage', '.cb-pad', '.cb-tools'];

/**
 * Board edge in CSS pixels: as large as fits. In two columns the board takes the whole height
 * under the top bar, and the band sits in the side column. Stacked, it takes the column width
 * (a phone) or the height left over by the other parts (a tablet), whichever is less. When the
 * page would still be too tall, it gives up a few pixels, as long as the cells stay playable;
 * a window too short for that scrolls.
 */
function useBoardSide(playRef: React.RefObject<HTMLDivElement | null>, topRef: React.RefObject<HTMLElement | null>, size: number) {
  const [side, setSide] = useState(378);
  useLayoutEffect(() => {
    const wide = window.matchMedia?.(WIDE);
    const measure = () => {
      const play = playRef.current;
      if (!play) return;
      const cs = getComputedStyle(play);
      const px = (v: string) => parseFloat(v) || 0;
      const inner = play.clientWidth - px(cs.paddingLeft) - px(cs.paddingRight);
      const top = topRef.current?.offsetHeight ?? 0;
      const app = play.closest<HTMLElement>('.cb-app');
      const as = app ? getComputedStyle(app) : null;
      const chrome = top + px(cs.paddingTop) + px(cs.paddingBottom) + (as ? px(as.paddingTop) + px(as.paddingBottom) : 0);
      let next: number;
      if (wide?.matches) {
        const availH = smallViewportHeight() - chrome;
        const availW = inner - SIDE_COLUMN - SIDE_GAP;
        next = Math.max(260, Math.min(availH, availW, MAX_SIDE));
      } else {
        // Everything but the board itself: the other parts at their own height, and every margin.
        let rest = chrome;
        for (const sel of STACKED_PARTS) {
          const el = play.querySelector<HTMLElement>(`:scope > ${sel}`);
          if (!el) continue;
          rest += px(getComputedStyle(el).marginTop) + (sel === '.cb-stage' ? 0 : el.offsetHeight);
        }
        const room = Math.floor(smallViewportHeight() - rest);
        const cap = Math.max(240, Math.min(inner, MAX_STACKED_SIDE));
        const minCell = (window.matchMedia?.(SHORT).matches ? MIN_CELL_SHORT : MIN_CELL)[size] ?? 52;
        const floor = Math.min(cap, size * minCell);
        next = Math.max(floor, Math.min(cap, room));
      }
      next = Math.floor(next);
      setSide((s) => (s === next ? s : next));
    };
    measure();
    window.addEventListener('resize', measure);
    wide?.addEventListener('change', measure);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro && playRef.current) ro.observe(playRef.current);
    return () => {
      window.removeEventListener('resize', measure);
      wide?.removeEventListener('change', measure);
      ro?.disconnect();
    };
  }, [playRef, topRef, size]);
  return side;
}

/** What the band gives way to: a notice, a hint step, a mode's note, or the rule of the chip that is on. */
type Message =
  | { kind: 'notice' | 'hint'; text: string }
  | { kind: 'rule'; text: string; rule: ClueKind }
  | { kind: 'note'; text: string; action?: GameNote['action'] };

export function GameView({
  game,
  title,
  subtitle,
  bandSubtitle = '',
  onExit,
  extra,
  hideRuleChips,
  endPanel,
  next,
  shareUrl,
  band,
  chipsLead,
  chipsBeside,
  boardOverlay,
  quietClock,
  note,
  onNoteDismiss,
}: GameViewProps) {
  const settings = useSettings();
  const theme = getTheme(settings.theme);
  const shell = useShell();
  const fx = useFx();
  const [lit, setLit] = useState<ClueKind | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const topRef = useRef<HTMLElement>(null);
  const playRef = useRef<HTMLDivElement>(null);
  const newRuleId = useId();
  const p = game.puzzle;
  const n = p.size;
  const side = useBoardSide(playRef, topRef, n);
  // A small band would set its line too small to read, so the line moves out under it.
  const smallBand = useMedia(SMALL_BAND);

  useEffect(() => startClock(), []);
  useEffect(() => {
    setLit(null);
    setNotice(null);
  }, [game.key]);
  // A mode's note takes the panel from a rule's text, as another chip would.
  const noteText = note?.text ?? null;
  useEffect(() => {
    if (noteText) setLit(null);
  }, [noteText]);

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
  const time = (settings.hideTimer || quietClock) && limit === undefined ? '' : formatTime(limit !== undefined ? Math.max(0, limit - game.elapsedMs) : game.elapsedMs);
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
    // Long enough for the whole-board wave (45 ms a step, 560 ms a cell) to reach the far corner of a 9x9.
    const t = setTimeout(() => setShowEnd(true), reduce ? 0 : 1100);
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
    const before = getGame();
    const step = actions.hint();
    const spent = !!before?.mods && before.mods.hints !== undefined && before.hintsUsed >= before.mods.hints;
    setNotice(step ? null : spent ? 'No hints left on this board.' : 'No hint is available here.');
  }, []);

  // Keyboard play, listed in Settings by KeyList (keys.tsx). After the first key that does
  // something, the tools show their keys (data-keys on the root) for the rest of the visit.
  useEffect(() => {
    /** Acts on a key, and says whether it did anything. */
    const act = (e: KeyboardEvent): boolean => {
      if (e.defaultPrevented) return false;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('input, select, textarea, [contenteditable="true"]')) return false;
      if (document.querySelector('dialog[open]')) return false;
      const g = getGame();
      if (!g) return false;
      const key = e.key;
      const lower = key.length === 1 ? key.toLowerCase() : key;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && lower === 'z') {
        e.preventDefault();
        if (e.shiftKey) actions.redo();
        else actions.undo();
        return true;
      }
      if (mod && lower === 'y') {
        e.preventDefault();
        actions.redo();
        return true;
      }
      if (mod || e.altKey) return false;
      const size = g.puzzle.size;
      if (/^[1-9]$/.test(key)) {
        e.preventDefault();
        enter(Number(key));
        return true;
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
        return true;
      }
      const move = (dr: number, dc: number) => {
        e.preventDefault();
        setNotice(null);
        const focused = (document.activeElement as HTMLElement | null)?.dataset?.cell;
        const cur = g.selected ?? (focused !== undefined ? Number(focused) : null);
        if (cur === null) {
          actions.select(Math.floor((size * size) / 2));
          return true;
        }
        const r = (Math.floor(cur / size) + dr + size) % size;
        const c = ((cur % size) + dc + size) % size;
        actions.select(r * size + c);
        return true;
      };
      switch (lower) {
        case 'e':
        case '0':
        case 'Backspace':
        case 'Delete':
          e.preventDefault();
          actions.erase();
          return true;
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
          return true;
        case 'z':
          actions.undo();
          return true;
        case 'y':
          actions.redo();
          return true;
        case 'h':
          doHint();
          return true;
        case 'p':
          if (g.status === 'paused') actions.resume();
          else actions.pause();
          return true;
        case 'Escape':
          actions.select(null);
          actions.dismissHint();
          setLit(null);
          setNotice(null);
          onNoteDismiss?.();
          return true;
      }
      return false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (act(e)) document.documentElement.dataset.keys = 'on';
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [doHint, enter, onNoteDismiss]);

  const Band = theme.Band;
  const padCols = n === 9 ? 'nine' : n === 4 ? 'four' : 'six';
  const hearts = heartsLeft(game);
  const message: Message | null = notice
    ? { kind: 'notice', text: notice }
    : fx.hint
      ? { kind: 'hint', text: fx.hint.text }
      : note
        ? { kind: 'note', text: note.text, action: note.action }
        : lit
          ? { kind: 'rule', text: ruleText(lit, p), rule: lit }
          : null;
  const toolsOff = ended || paused;
  // A board with a set number of hints shows how many are left on the hint key.
  const hintsLeft = game.mods?.hints === undefined ? null : Math.max(0, game.mods.hints - game.hintsUsed);
  const chips =
    !hideRuleChips && (kinds.length > 0 || chipsLead) ? (
      <div className="cb-chips" role="group" aria-label="Rules">
        {chipsLead}
        {kinds.map((k) => (
          <RuleChip
            key={k}
            kind={k}
            on={lit === k}
            newRuleId={newRuleId}
            onToggle={() => {
              setNotice(null);
              actions.dismissHint();
              if (lit !== k) onNoteDismiss?.();
              setLit(lit === k ? null : k);
            }}
          />
        ))}
        <span id={newRuleId} hidden>
          New rule
        </span>
      </div>
    ) : null;

  return (
    <div className="cb-game" data-mode={game.mode} data-size={n} style={{ ['--cb-side' as string]: `${side}px` }}>
      <TopBar
        ref={topRef}
        title={title}
        quietTitle={band ? false : theme.bandShowsTitle}
        onBack={onExit}
        backLabel="Leave this board"
        right={
          <>
            <button
              type="button"
              className="cb-ib"
              aria-label={paused ? 'Resume' : 'Pause'}
              aria-keyshortcuts="P"
              title={paused ? 'Resume (P)' : 'Pause (P)'}
              onClick={() => (paused ? actions.resume() : actions.pause())}
              disabled={ended}
            >
              {paused ? <PlayIcon /> : <PauseIcon />}
            </button>
            <button type="button" className="cb-ib" aria-label="Stats" title="Stats" onClick={() => shell.go('stats')}>
              <StatsIcon />
            </button>
          </>
        }
      >
        {time && (
          <span
            className={`cb-timer${limit !== undefined ? ' is-limit' : ''}`}
            aria-label={`${limit !== undefined ? 'Time left' : 'Time'} ${time}`}
            role="timer"
          >
            {time}
          </span>
        )}
      </TopBar>

      {/* Grid areas place each part: stacked on a phone, and in two columns (the board, then the
          band over the controls) on a wide screen. The board comes before the controls in the
          page, so Tab and screen readers reach it first. */}
      <div className="cb-play" ref={playRef}>
        <div className="cb-band-wrap">
          {band ?? (
            <>
              <Band title={title} subtitle={smallBand ? '' : bandSubtitle} puzzle={p} />
              {smallBand && bandSubtitle && <p className="cb-band-line">{bandSubtitle}</p>}
            </>
          )}
        </div>

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
            {boardOverlay && <div className="cb-board-overlay">{boardOverlay}</div>}
            {paused && (
              <div className="cb-pause">
                <button type="button" className="cb-btn primary cb-resume" onClick={actions.resume} autoFocus>
                  <PlayIcon />
                  Resume
                </button>
              </div>
            )}
            {ended &&
              showEnd &&
              (endPanel ? (
                <div className="cb-result cb-end-panel">{endPanel}</div>
              ) : (
                <ResultCard game={game} title={title} subtitle={subtitle} next={next} shareUrl={shareUrl} />
              ))}
          </div>
        </div>

        {(extra || hearts !== null) && (
          <div className={`cb-extra${chipsBeside && extra && chips ? ' has-chips' : ''}`}>
            {extra ?? (
              <p className="cb-hearts" aria-label={`${hearts} hearts left`}>
                Hearts: {hearts}
              </p>
            )}
            {chipsBeside && extra && chips}
          </div>
        )}

        {!(chipsBeside && extra) && chips}

        {/* Spoken lines. The panel below shows the same text, for the eyes only. */}
        <p className="cb-sr" aria-live="polite">
          {said}
        </p>
        <p className="cb-sr" aria-live="polite">
          {message?.text ?? ''}
        </p>
        {message && (
          <div className={`cb-msg is-${message.kind}`}>
            <p className="cb-msg-text" aria-hidden="true">
              {message.text}
            </p>
            {message.kind === 'rule' && (
              <button type="button" className="cb-msg-btn" aria-label={`Open the ${RULE_NAMES[message.rule]} lesson`} onClick={() => shell.openLesson(message.rule)}>
                Lesson
              </button>
            )}
            {message.kind === 'note' && message.action && (
              <button type="button" className="cb-msg-btn" onClick={message.action.run} disabled={message.action.disabled || toolsOff}>
                {message.action.label}
              </button>
            )}
          </div>
        )}

        <div className="cb-pad" data-cols={padCols} data-notes={game.notesMode} role="group" aria-label={game.notesMode ? 'Number pad, notes' : 'Number pad'}>
          {Array.from({ length: n }, (_, k) => {
            const d = k + 1;
            // A digit that is on the board n times is finished: its key says so by looking spent.
            const done = counts[d] >= n;
            return (
              <button
                key={d}
                type="button"
                className={`cb-key${done ? ' spent' : ''}`}
                aria-label={`${game.notesMode ? 'Note' : 'Enter'} ${d}${done ? ', all placed' : ''}`}
                onClick={() => enter(d)}
                disabled={toolsOff}
                {...KEY}
              >
                <span className="cb-key-d">{d}</span>
                {done && (
                  <span className="cb-key-done" aria-hidden="true">
                    <CheckIcon />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Each tool's data-key shows in its corner once the keyboard has been used (base.css). The
            keys and tools tick and squash under the pointer (KEY); a key typed on the keyboard
            does neither. */}
        <div className="cb-tools" role="group" aria-label="Tools">
          <button
            type="button"
            className="cb-tool"
            aria-label="Undo"
            aria-keyshortcuts="Z Control+Z Meta+Z"
            data-key="Z"
            title="Undo (Z)"
            onClick={actions.undo}
            disabled={toolsOff || !game.undo.length}
            {...KEY}
          >
            <UndoIcon />
          </button>
          <button
            type="button"
            className="cb-tool"
            aria-label="Erase"
            aria-keyshortcuts="E Backspace Delete 0"
            data-key="E"
            title="Erase (E)"
            onClick={actions.erase}
            disabled={toolsOff}
            {...KEY}
          >
            <EraseIcon />
          </button>
          <button
            type="button"
            className={`cb-tool is-toggle${game.notesMode ? ' on' : ''}`}
            aria-label="Notes"
            aria-pressed={game.notesMode}
            aria-keyshortcuts="N"
            data-key="N"
            title={game.mods?.noNotes ? NO_NOTES : 'Notes (N)'}
            onClick={actions.toggleNotes}
            disabled={toolsOff || !!game.mods?.noNotes}
            {...KEY}
          >
            <NotesIcon />
          </button>
          <button
            type="button"
            className="cb-tool"
            aria-label={hintsLeft === null ? 'Hint' : `Hint, ${hintsLeft} left`}
            aria-keyshortcuts="H"
            data-key="H"
            title="Hint (H)"
            onClick={doHint}
            disabled={toolsOff}
            {...KEY}
          >
            <HintIcon />
            {hintsLeft !== null && (
              <span className={`cb-tool-count${hintsLeft ? '' : ' is-zero'}`} aria-hidden="true">
                {hintsLeft}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A rule chip: lights its clues and shows the rule. A dot marks a rule whose lesson is not done yet. */
function RuleChip({ kind, on, newRuleId, onToggle }: { kind: ClueKind; on: boolean; newRuleId: string; onToggle: () => void }) {
  const fresh = !useLessonDone(kind);
  return (
    <button
      type="button"
      className={`cb-chip${on ? ' on' : ''}${fresh ? ' is-new' : ''}`}
      aria-pressed={on}
      aria-describedby={fresh ? newRuleId : undefined}
      onClick={onToggle}
    >
      {RULE_NAMES[kind]}
    </button>
  );
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function ResultCard({ game, title, subtitle, next, shareUrl }: { game: GameState; title: string; subtitle: string; next?: GameViewProps['next']; shareUrl?: string }) {
  const shell = useShell();
  // The streak counts the player's Dailies on every device they have signed in on.
  const daily = useAllStats().daily;
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
    setShared(r === 'copied' ? 'Copied to the clipboard.' : r === 'shared' ? 'Shared.' : r === 'cancelled' ? null : 'Sharing is not available here.');
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
        <NewBadges />
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
            <StatsIcon />
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
