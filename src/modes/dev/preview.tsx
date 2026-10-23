// Development preview for Run and Learn. Served by Vite at /src/modes/dev/preview.html and
// linked from nowhere. Query: ?m=run|learn|boards and t=atlas-night|atlas-day|swiss-day|swiss-night.
// It mounts the real mode screens on whatever GameView the branch has, with stand-in theme
// variables. m=boards lists every lesson illustration on one page. t=real leaves the variables
// to real theme stylesheets that a screenshot script injects. window.__cb has helpers for scripts.
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/700.css';
import '@fontsource-variable/archivo/wght.css';
import '@fontsource-variable/newsreader/wght.css';
import '@fontsource-variable/sora/wght.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/shippori-mincho/400.css';
import '@fontsource/shippori-mincho/600.css';
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GameView, type GameViewProps } from '../../app/GameView';
import { actions, getGame } from '../../game/store';
import { LearnApp } from '../learn/LearnApp';
import { LESSONS } from '../learn/lessons';
import { MiniBoard } from '../learn/MiniBoard';
import '../learn/learn.css';
import { openLesson, markLessonDone, useLearnStore } from '../learn/store';
import { RunApp } from '../run/RunApp';
import { runActions, useRunStore, resetRunStore } from '../run/store';

type Vars = Record<string, string>;

const SERIF = '"Cormorant Garamond", Garamond, "Times New Roman", serif';
const GROTESK = '"Archivo Variable", "Helvetica Neue", Arial, sans-serif';

const THEMES: Record<string, Vars> = {
  'atlas-night': {
    '--cb-ground': '#0c1730', '--cb-board': '#0d1b36', '--cb-ink': '#efe7d2', '--cb-mine': '#efe7d2', '--cb-hint': '#a6b4d0',
    '--cb-note': '#a6b4d0', '--cb-wrong': '#ff9d8c', '--cb-peer': 'rgba(216,183,102,0.07)', '--cb-same': 'rgba(239,231,210,0.09)',
    '--cb-sel': 'rgba(216,183,102,0.18)', '--cb-sel-ring': '#d8b766', '--cb-focus': '#d8b766', '--cb-line-thin': 'rgba(239,231,210,0.13)',
    '--cb-line-box': 'rgba(216,183,102,0.58)', '--cb-frame': '#d8b766', '--cb-clue': 'rgba(216,183,102,0.42)', '--cb-clue-strong': '#d8b766',
    '--cb-clue-fill': 'rgba(216,183,102,0.16)', '--cb-text': '#efe7d2', '--cb-text-dim': '#a6b4d0', '--cb-accent': '#d8b766',
    '--cb-font-ui': SERIF, '--cb-font-digit': SERIF,
  },
  'atlas-day': {
    '--cb-ground': '#ece2cc', '--cb-board': '#f7f0e0', '--cb-ink': '#1b2a4e', '--cb-mine': '#1b2a4e', '--cb-hint': '#535e78',
    '--cb-note': '#535e78', '--cb-wrong': '#b3261e', '--cb-peer': 'rgba(27,42,78,0.045)', '--cb-same': 'rgba(27,42,78,0.07)',
    '--cb-sel': 'rgba(125,90,18,0.14)', '--cb-sel-ring': '#7d5a12', '--cb-focus': '#7d5a12', '--cb-line-thin': 'rgba(27,42,78,0.15)',
    '--cb-line-box': 'rgba(125,90,18,0.7)', '--cb-frame': '#7d5a12', '--cb-clue': 'rgba(125,90,18,0.42)', '--cb-clue-strong': '#7d5a12',
    '--cb-clue-fill': 'rgba(125,90,18,0.12)', '--cb-text': '#1b2a4e', '--cb-text-dim': '#535e78', '--cb-accent': '#7d5a12',
    '--cb-font-ui': SERIF, '--cb-font-digit': SERIF,
  },
  'swiss-day': {
    '--cb-ground': '#f1efea', '--cb-board': '#f1efea', '--cb-ink': '#111111', '--cb-mine': '#1b47b5', '--cb-hint': '#5c5c5c',
    '--cb-note': '#5c5c5c', '--cb-wrong': '#e0362c', '--cb-peer': '#e5e1d8', '--cb-same': '#d9d4c8', '--cb-sel': '#f3c024',
    '--cb-sel-ring': '#111111', '--cb-focus': '#1b47b5', '--cb-line-thin': 'rgba(17,17,17,0.2)', '--cb-line-box': '#111111',
    '--cb-frame': '#111111', '--cb-clue': '#d3cec3', '--cb-clue-strong': '#111111', '--cb-clue-fill': 'rgba(243,192,36,0.5)',
    '--cb-text': '#111111', '--cb-text-dim': '#5c5c5c', '--cb-accent': '#e0362c',
    '--cb-font-ui': GROTESK, '--cb-font-digit': GROTESK,
  },
  'swiss-night': {
    '--cb-ground': '#121212', '--cb-board': '#121212', '--cb-ink': '#f1efea', '--cb-mine': '#5b84ff', '--cb-hint': '#a8a8a8',
    '--cb-note': '#a8a8a8', '--cb-wrong': '#ff5a4e', '--cb-peer': '#1e1e1e', '--cb-same': '#2b2b2b', '--cb-sel': '#f3c024',
    '--cb-sel-ring': '#f1efea', '--cb-focus': '#5b84ff', '--cb-line-thin': 'rgba(241,239,234,0.2)', '--cb-line-box': '#f1efea',
    '--cb-frame': '#f1efea', '--cb-clue': '#363636', '--cb-clue-strong': '#f1efea', '--cb-clue-fill': 'rgba(243,192,36,0.3)',
    '--cb-text': '#f1efea', '--cb-text-dim': '#a8a8a8', '--cb-accent': '#ff5a4e',
    '--cb-font-ui': GROTESK, '--cb-font-digit': GROTESK,
  },
};

const params = new URLSearchParams(location.search);
// ?t=real leaves the variables to the real theme stylesheets, which a screenshot script injects.
const real = params.get('t') === 'real';
const themeName = params.get('t') && THEMES[params.get('t')!] ? params.get('t')! : 'atlas-night';
if (!real) {
  for (const [k, v] of Object.entries(THEMES[themeName])) document.documentElement.style.setProperty(k, v);
  document.documentElement.dataset.theme = themeName.split('-')[0];
  document.documentElement.dataset.night = String(themeName.endsWith('night'));
  document.body.style.cssText = 'margin:0;background:var(--cb-ground);color:var(--cb-text);font-family:var(--cb-font-ui)';
}

/** The stub GameView ignores endPanel, so the preview shows it below the board the way the app will over it. */
function PreviewGameView(props: GameViewProps) {
  const over = props.game.status === 'solved' || props.game.status === 'failed';
  return (
    <div className="pv-play" style={{ padding: 12 }}>
      <GameView {...props} />
      {over && props.endPanel ? <div style={{ marginTop: 16 }}>{props.endPanel}</div> : null}
    </div>
  );
}

/** Helpers for the screenshot script. */
function failBoard() {
  const g = getGame();
  if (!g) return;
  const cell = g.puzzle.givens.findIndex((d) => d === 0);
  const wrong = (g.puzzle.solution[cell] % g.puzzle.size) + 1;
  actions.select(cell);
  for (let i = 0; i < 4; i++) {
    actions.input(wrong);
    actions.input(wrong);
  }
}
function oneMistake() {
  const g = getGame();
  if (!g) return;
  const cell = g.puzzle.givens.findIndex((d) => d === 0);
  const wrong = (g.puzzle.solution[cell] % g.puzzle.size) + 1;
  actions.select(cell);
  actions.input(wrong);
}

declare global {
  interface Window {
    __cb: Record<string, unknown>;
  }
}
window.__cb = { actions, getGame, runActions, useRunStore, resetRunStore, failBoard, oneMistake, openLesson, markLessonDone, useLearnStore };

/** Every lesson illustration on one page, for checking them side by side. */
function Boards() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 16, padding: 16 }}>
      {LESSONS.flatMap((l) =>
        l.steps.map((st, k) => (
          <figure key={l.id + k} style={{ margin: 0 }}>
            <MiniBoard art={st.art} />
            <figcaption style={{ fontSize: 13, marginTop: 4 }}>
              {l.id} {k + 1}
            </figcaption>
          </figure>
        )),
      )}
    </div>
  );
}

function Preview() {
  const [mode] = useState(params.get('m') ?? 'run');
  if (mode === 'boards') return <Boards />;
  if (mode === 'learn') return <LearnApp onExit={() => undefined} GameViewComponent={PreviewGameView} />;
  return <RunApp onExit={() => undefined} GameViewComponent={PreviewGameView} key={mode} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);
