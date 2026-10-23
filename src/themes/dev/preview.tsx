// Dev only: every theme, light and dark, on a mock board built from the exact
// class vocabulary of the spec (section 5) and wrapped the way the app wraps it.
// Open /src/themes/dev/preview.html.
// Query: theme=atlas  mode=light|dark  lit=thermo  fog=0|1  scene=gallery|study
import { StrictMode, useEffect } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { LYRA } from '../../engine/fixtures';
import type { Clue, ClueKind, Puzzle } from '../../engine/types';
import { themes } from '../index';
import type { BoardGeometry, ThemeDef } from '../types';
import { cssVars } from '../shared/util';
import './app-base.css';
import './preview.css';

const q = new URLSearchParams(location.search);
const only = q.get('theme');
const onlyMode = q.get('mode');
const litParam = q.get('lit') as ClueKind | null;
const scene = q.get('scene') ?? 'gallery';

/** Same geometry as the app: 60 board units per cell at every size. */
function makeGeo(p: Puzzle): BoardGeometry {
  const cell = 60;
  const n = p.size;
  const perRow = n / p.boxW;
  return {
    size: n,
    boxW: p.boxW,
    boxH: p.boxH,
    cell,
    px: n * cell,
    center: (i) => [((i % n) + 0.5) * cell, (Math.floor(i / n) + 0.5) * cell],
    regionOf: (i) =>
      p.regions ? p.regions[i] : Math.floor(Math.floor(i / n) / p.boxH) * perRow + Math.floor((i % n) / p.boxW),
  };
}

function gridPaths(geo: BoardGeometry, p: Puzzle): { thin: string; thick: string } {
  const n = geo.size;
  const u = geo.cell;
  let thin = '';
  let thick = '';
  for (let k = 1; k < n; k++) {
    const v = `M${k * u} 0V${geo.px}`;
    const h = `M0 ${k * u}H${geo.px}`;
    if (k % p.boxW === 0) thick += v;
    else thin += v;
    if (k % p.boxH === 0) thick += h;
    else thin += h;
  }
  return { thin, thick };
}

function DefaultGrid({ geo, p }: { geo: BoardGeometry; p: Puzzle }): ReactNode {
  const { thin, thick } = gridPaths(geo, p);
  return (
    <>
      <path className="cb-thin" d={thin} />
      <path className="cb-thick" d={thick} />
      <rect className="cb-frame" x={0} y={0} width={geo.px} height={geo.px} />
    </>
  );
}

const EXTRA6: Clue[] = [
  { kind: 'whisper', cells: [17, 23, 29, 28], minDiff: 3 },
  { kind: 'xv', a: 0, b: 6, sum: 10 },
  { kind: 'xv', a: 21, b: 22, sum: 5 },
];

const puzzle6: Puzzle = { ...LYRA, clues: [...LYRA.clues, ...EXTRA6] };

function makePuzzle9(): Puzzle {
  const solution: number[] = [];
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) solution.push(((r * 3 + Math.floor(r / 3) + c) % 9) + 1);
  const givens = solution.map((d, i) => ((i * 7) % 11 < 3 ? d : 0));
  return {
    id: 'pv9',
    seed: 'pv9',
    size: 9,
    boxW: 3,
    boxH: 3,
    givens,
    solution,
    difficulty: 3,
    score: 0,
    name: 'Cassiopeia',
    clues: [
      { kind: 'thermo', cells: [73, 64, 55, 46, 47, 38] },
      { kind: 'arrow', circle: 4, path: [14, 24, 25] },
      { kind: 'cage', cells: [10, 11, 19, 20], sum: 17 },
      { kind: 'cage', cells: [60, 61, 62, 70], sum: 21 },
      { kind: 'cage', cells: [16, 17, 26], sum: null },
      { kind: 'renban', cells: [57, 58, 59, 50] },
      { kind: 'whisper', cells: [30, 31, 32, 41, 40], minDiff: 5 },
      { kind: 'kropki', a: 66, b: 67, color: 'white' },
      { kind: 'kropki', a: 75, b: 76, color: 'black' },
      { kind: 'kropki', a: 0, b: 9, color: 'white' },
      { kind: 'xv', a: 7, b: 8, sum: 10 },
      { kind: 'xv', a: 28, b: 37, sum: 5 },
      { kind: 'diagonal' },
    ],
  };
}

function makePuzzle4(): Puzzle {
  const solution = [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1];
  return {
    id: 'pv4',
    seed: 'pv4',
    size: 4,
    boxW: 2,
    boxH: 2,
    givens: solution.map((d, i) => (i % 3 === 0 ? d : 0)),
    solution,
    difficulty: 1,
    score: 0,
    name: 'Lyra',
    clues: [
      { kind: 'thermo', cells: [12, 8, 9, 5] },
      { kind: 'antiKnight' },
      { kind: 'cage', cells: [2, 3], sum: 7 },
      { kind: 'whisper', cells: [13, 14], minDiff: 2 },
    ],
  };
}

interface Scene {
  values: number[];
  kinds: ('given' | 'mine' | 'hint' | 'wrong' | null)[];
  notes: number[];
  sel: number;
  conflict: Set<number>;
  focus: Set<number>;
  flash: Map<number, number>;
  doneBoxes: number[];
  fog: Set<number>;
  placed: number;
}

/** The exact starting state of the studies: seven givens, seven entries, four note cells. */
function studyScene(p: Puzzle): Scene {
  const values = p.solution.map(() => 0);
  const kinds: Scene['kinds'] = p.solution.map(() => null);
  const notes = p.solution.map(() => 0);
  p.solution.forEach((d, i) => {
    if (p.givens[i]) {
      values[i] = d;
      kinds[i] = 'given';
    }
  });
  [0, 1, 2, 7, 18, 26, 31].forEach((i) => {
    values[i] = p.solution[i];
    kinds[i] = 'mine';
  });
  notes[4] = 96;
  notes[12] = 10;
  notes[14] = 40;
  notes[19] = 12;
  const fog = new Set<number>();
  for (let r = 3; r < 6; r++) for (let c = 3; c < 6; c++) fog.add(r * 6 + c);
  return { values, kinds, notes, sel: 6, conflict: new Set(), focus: new Set(), flash: new Map(), doneBoxes: [], fog, placed: -1 };
}

/** The study state after a wrong digit, a hint and a finished box, once the effects have settled. */
function studyScene2(p: Puzzle): Scene {
  const sc = studyScene(p);
  sc.values[20] = 1;
  sc.kinds[20] = 'wrong';
  sc.values[21] = p.solution[21];
  sc.kinds[21] = 'hint';
  sc.values[6] = p.solution[6];
  sc.kinds[6] = 'mine';
  sc.sel = 9;
  sc.doneBoxes = [0];
  for (const i of [0, 1, 2, 6, 7, 8]) sc.flash.set(i, Math.max(Math.abs(Math.floor(i / 6) - 1), Math.abs((i % 6) - 0)));
  return sc;
}

function galleryScene(p: Puzzle): Scene {
  const n = p.size;
  const values = p.solution.map(() => 0);
  const kinds: Scene['kinds'] = p.solution.map(() => null);
  const notes = p.solution.map(() => 0);
  const r2 = Math.floor(n / 2) - 1;
  const sel = (n === 9 ? 4 : r2) * n + (n === 9 ? 3 : 2);
  p.solution.forEach((d, i) => {
    if (p.givens[i]) {
      values[i] = d;
      kinds[i] = 'given';
    }
  });
  let k = 0;
  p.solution.forEach((d, i) => {
    if (values[i] === 0 && i !== sel) {
      if (k % 4 === 0) {
        values[i] = d;
        kinds[i] = 'mine';
      } else if (k % 7 === 3) {
        notes[i] = n === 4 ? 0b11010 : n === 6 ? 0b1101010 : 0b101010110 << 1;
      }
      k++;
    }
  });
  const mineList = kinds.map((x, i) => (x === 'mine' ? i : -1)).filter((i) => i >= 0);
  if (mineList[1] !== undefined) kinds[mineList[1]] = 'hint';
  const wrongCell = mineList[2];
  if (wrongCell !== undefined) {
    values[wrongCell] = (p.solution[wrongCell] % n) + 1;
    kinds[wrongCell] = 'wrong';
  }
  values[sel] = p.solution[sel];
  kinds[sel] = 'mine';
  const conflict = new Set<number>();
  const cc = sel % n === n - 1 ? sel - 1 : sel + 1;
  if (!p.givens[cc]) {
    values[cc] = values[sel];
    kinds[cc] = 'mine';
    notes[cc] = 0;
    conflict.add(sel);
    conflict.add(cc);
  }
  const focus = new Set<number>([sel + n, sel + n + 1].filter((i) => i < n * n && !values[i]));
  const flash = new Map<number, number>();
  for (let c = 0; c < n; c++) flash.set((n - 1) * n + c, c);
  const fog = new Set<number>();
  const f0 = n === 4 ? 2 : n === 6 ? 3 : 6;
  for (let r = f0; r < n; r++) for (let c = f0; c < n; c++) if (r < n - 1 || c < f0) fog.add(r * n + c);
  return {
    values, kinds, notes, sel, conflict, focus, flash,
    doneBoxes: [0, n === 9 ? 4 : n === 6 ? 3 : 1],
    fog,
    placed: sel + 2 < n * n ? sel + 2 : sel,
  };
}

function Notes({ n, mask }: { n: number; mask: number }): ReactNode {
  return (
    <span className="cb-notes" aria-hidden="true">
      {Array.from({ length: n }, (_, k) => (
        <span key={k} className={(mask >> (k + 1)) & 1 ? 'cb-note on' : 'cb-note'}>
          {k + 1}
        </span>
      ))}
    </span>
  );
}

function MockBoard({ theme, p, width, lit, fogOn, tag, sc }: { theme: ThemeDef; p: Puzzle; width: number; lit: ClueKind | null; fogOn: boolean; tag: string; sc: Scene }): ReactNode {
  const geo = makeGeo(p);
  const n = p.size;
  const selDigit = sc.values[sc.sel];
  const selR = Math.floor(sc.sel / n);
  const selC = sc.sel % n;
  const selB = geo.regionOf(sc.sel);
  const hidden = p.solution.map((_, i) => fogOn && sc.fog.has(i));
  const Grid = theme.GridLayer;
  const Clues = theme.ClueLayer;
  const DigitView = theme.Digit;
  const Over = theme.BoxDoneLayer;
  const doneSet = new Set(sc.doneBoxes.filter((b) => b < n));
  const flashCls = 'flash-a';
  return (
    <div className="pv-board-wrap" data-board={tag}>
      {tag ? <div className="pv-cap">{tag}</div> : null}
      <div className="cb-board-wrap" style={{ width, height: width, position: 'relative' }}>
        <div className="cb-board" data-size={n} style={cssVars({ '--cb-n': n, '--cb-note-cols': n === 4 ? 2 : 3 })}>
          <div className="cb-cells">
            {p.solution.map((_, i) => {
              const r = Math.floor(i / n);
              const c = i % n;
              const b = geo.regionOf(i);
              let cls = 'cb-cell';
              if (i === sc.sel) cls += ' is-sel';
              else if (r === selR || c === selC || b === selB) cls += ' is-peer';
              if (selDigit && sc.values[i] === selDigit && i !== sc.sel) cls += ' is-same';
              if (sc.conflict.has(i)) cls += ' is-conflict';
              if (p.givens[i]) cls += ' is-given';
              if (sc.focus.has(i)) cls += ' is-focus';
              if (doneSet.has(b)) cls += ` box-done bd-${b}`;
              const fd = sc.flash.get(i);
              if (fd !== undefined) cls += ` ${flashCls}`;
              return (
                <button
                  key={i}
                  type="button"
                  className={cls}
                  aria-label={`Row ${r + 1}, column ${c + 1}`}
                  style={fd !== undefined ? cssVars({ '--d': fd }) : undefined}
                />
              );
            })}
          </div>
          <svg className="cb-grid" viewBox={`0 0 ${geo.px} ${geo.px}`} aria-hidden="true" focusable="false">
            {Grid ? <Grid geo={geo} /> : <DefaultGrid geo={geo} p={p} />}
          </svg>
          <svg className="cb-clues" viewBox={`0 0 ${geo.px} ${geo.px}`} aria-hidden="true" focusable="false">
            {Clues ? <Clues puzzle={p} geo={geo} lit={lit} hidden={hidden} /> : null}
          </svg>
          <div className="cb-digits" aria-hidden="true">
            {p.solution.map((_, i) => {
              const b = geo.regionOf(i);
              let cls = 'cb-slot';
              const fd = sc.flash.get(i);
              if (fd !== undefined) cls += ` ${flashCls}`;
              if (doneSet.has(b)) cls += ` box-done bd-${b}`;
              if (i === sc.sel) cls += ' is-sel';
              const kind = sc.kinds[i];
              const v = sc.values[i];
              let inner: ReactNode = null;
              if (v && kind) {
                inner = DigitView ? (
                  <DigitView digit={v} kind={kind} placedAt={0} />
                ) : (
                  <span className={`cb-digit is-${kind} h${v}` + (i === sc.placed ? ' place-a' : '')}>{v}</span>
                );
              } else if (sc.notes[i]) {
                inner = <Notes n={n} mask={sc.notes[i]} />;
              }
              return (
                <div key={i} className={cls} style={fd !== undefined ? cssVars({ '--d': fd }) : undefined}>
                  {inner}
                </div>
              );
            })}
          </div>
          <div className="cb-fogs" aria-hidden="true">
            {p.solution.map((_, i) => (
              <div
                key={i}
                className={fogOn && sc.fog.has(i) ? 'cb-fog is-on' : 'cb-fog'}
                style={cssVars({ '--d': (Math.floor(i / n) + (i % n)) % 3 })}
                data-glyphs={'K7#4ZQ+9MXR2L=8T'}
              />
            ))}
          </div>
          <div className="cb-over" aria-hidden="true">
            {Over ? <Over geo={geo} done={sc.doneBoxes.filter((b) => b < n)} /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function Panel({ theme, night }: { theme: ThemeDef; night: boolean }): ReactNode {
  const Band = theme.Band;
  const Backdrop = theme.Backdrop;
  const lit = litParam;
  const fogOn = q.get('fog') !== '0';
  const attrs = { 'data-theme': theme.id, 'data-night': night ? 'true' : 'false', 'data-panel': `${theme.id}-${night ? 'dark' : 'light'}` };
  if (scene === 'study' || scene === 'study2') {
    const p = LYRA;
    const values = p.solution.map((d, i) => (p.givens[i] || [0, 1, 2, 7, 18, 26, 31].includes(i) ? d : 0));
    return (
      <section className="pv-panel pv-study" {...attrs}>
        <div className="cb-backdrop" aria-hidden="true">{Backdrop ? <Backdrop night={night} /> : null}</div>
        <div className="pv-content">
          <div className="cb-band-wrap" style={{ width: 360 }}>
            <Band title="Daily" subtitle="Friday 23 October" time="4:12" puzzle={p} values={values} night={night} />
          </div>
          <MockBoard theme={theme} p={p} width={360} lit={lit ?? 'thermo'} fogOn={q.get('fog') === '1'} tag="" sc={scene === 'study2' ? studyScene2(p) : studyScene(p)} />
        </div>
      </section>
    );
  }
  const p6 = puzzle6;
  const p9 = makePuzzle9();
  const p4 = makePuzzle4();
  const values6 = p6.solution.map((d, i) => p6.givens[i] || (i % 3 === 0 ? d : 0));
  return (
    <section className="pv-panel" {...attrs}>
      <div className="cb-backdrop" aria-hidden="true">{Backdrop ? <Backdrop night={night} /> : null}</div>
      <div className="pv-content">
        <p className="pv-tag">{`${theme.id} ${night ? 'dark' : 'light'}`}</p>
        <div className="cb-band-wrap">
          <Band title="Daily" subtitle="Friday 23 October" time="4:12" puzzle={p6} values={values6} night={night} />
        </div>
        <div className="pv-sample">
          <span>Rule text sample</span>
          <b>accent</b>
          <i>dim text</i>
        </div>
        <MockBoard theme={theme} p={p6} width={380} lit={lit ?? 'thermo'} fogOn={fogOn} tag="6x6 at 380 px" sc={galleryScene(p6)} />
        <MockBoard theme={theme} p={p9} width={380} lit={lit ?? 'whisper'} fogOn={fogOn} tag="9x9 at 380 px (about 42 px cells)" sc={galleryScene(p9)} />
        <MockBoard theme={theme} p={p4} width={220} lit={lit ?? 'antiKnight'} fogOn={false} tag="4x4 at 220 px, anti-knight lit" sc={galleryScene(p4)} />
      </div>
    </section>
  );
}

function App(): ReactNode {
  const list = themes.filter((t) => !only || t.id === only);
  useEffect(() => {
    void Promise.all(list.map((t) => t.loadFonts())).then(() => {
      document.documentElement.dataset.fonts = 'ready';
    });
  }, [list]);
  return (
    <div className="pv-grid" style={only && onlyMode ? { gridTemplateColumns: 'auto' } : undefined}>
      {list.flatMap((t) =>
        [false, true]
          .filter((night) => !onlyMode || (onlyMode === 'dark') === night)
          .map((night) => <Panel key={`${t.id}${night}`} theme={t} night={night} />),
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
