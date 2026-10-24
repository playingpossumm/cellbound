// The Latin cube of the grid, drawn in letters. Columns run along x, rows along z
// and digits along y, so every placed digit is a letter standing in its own layer.
// The twelve edges spell COLUMN, ROWS and DIGITS. The figure turns slowly, the
// pointer turns it, and a band of brighter letters climbs the digit layers.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { useReducedMotion } from '../shared/motion';

interface Item {
  key: string;
  ch: string;
  x: number;
  y: number;
  z: number;
  /** Digit layer for the travelling band, -1 for edge letters of the other axes. */
  layer: number;
  big: boolean;
}

/** Edge words, padded with dots to the board size. */
const WORDS: Record<number, [string, string, string]> = {
  4: ['COLS', 'ROWS', 'NUMS'],
  6: ['COLUMN', 'ROWS', 'DIGITS'],
  9: ['COLUMN', 'ROWS', 'DIGITS'],
};

function fit(word: string, n: number): string {
  if (word.length >= n) return word.slice(0, n);
  const left = Math.floor((n - word.length) / 2);
  return '·'.repeat(left) + word + '·'.repeat(n - word.length - left);
}

export function buildItems(values: number[], n: number): Item[] {
  const items: Item[] = [];
  const mid = (n - 1) / 2;
  // Every board size is drawn on the same cube, so the figure keeps its size.
  const k = 6 / n;
  values.forEach((d, i) => {
    if (!d) return;
    items.push({
      key: `d${i}`,
      ch: String(d),
      x: ((i % n) - mid) * k,
      y: (d - (n + 1) / 2) * k,
      z: (Math.floor(i / n) - mid) * k,
      layer: d - 1,
      big: true,
    });
  });
  const E = 3;
  const pos = Array.from({ length: n }, (_, q) => (q - mid) * k);
  const [wx, wz, wy] = (WORDS[n] ?? WORDS[6]).map((w) => fit(w, n));
  const dots = '·'.repeat(n);
  let e = 0;
  const edge = (axis: 'x' | 'y' | 'z', a: number, b: number, word: string): void => {
    for (let q = 0; q < n; q++) {
      const v = pos[q];
      const ch = word.charAt(q);
      const key = `e${e}-${q}`;
      if (axis === 'x') items.push({ key, ch, x: v, y: a, z: b, layer: -1, big: false });
      else if (axis === 'z') items.push({ key, ch, x: a, y: b, z: v, layer: -1, big: false });
      else items.push({ key, ch, x: a, y: v, z: b, layer: q, big: false });
    }
    e++;
  };
  edge('x', -E, -E, wx);
  edge('x', -E, E, dots);
  edge('x', E, -E, dots);
  edge('x', E, E, dots);
  edge('z', -E, -E, wz);
  edge('z', E, -E, dots);
  edge('z', -E, E, dots);
  edge('z', E, E, dots);
  edge('y', -E, -E, wy);
  edge('y', E, -E, dots);
  edge('y', -E, E, dots);
  edge('y', E, E, dots);
  return items;
}

const D = 10;
const PH = -0.42;
/**
 * Scale of the figure, and of its letters, by board size. A 9x9 puts 81 digits in the cube, so the
 * figure is drawn a little larger and its letters a little smaller, and the layers stay apart.
 */
const SCALE: Record<number, number> = { 4: 13.5, 6: 13.5, 9: 14.6 };
const glyphScale = (n: number) => Math.max(0.72, Math.pow(6 / n, n >= 9 ? 0.8 : 0.5));

/** Where one letter sits and how it looks at time t (seconds) and pointer offset px. */
export function project(it: Item, n: number, t: number, px: number): { tx: number; ty: number; fs: number; o: number; z: number; hot: boolean } {
  const th = 0.6 + t * 0.12 + px * 1.4;
  const ct = Math.cos(th);
  const st = Math.sin(th);
  const cp = Math.cos(PH);
  const sp = Math.sin(PH);
  const band = ((t * 0.5) % (n + 2)) - 1;
  const x1 = it.x * ct + it.z * st;
  const z1 = -it.x * st + it.z * ct;
  const y2 = it.y * cp - z1 * sp;
  const z2 = it.y * sp + z1 * cp;
  const p = D / (D + z2);
  const hotness = it.layer < 0 ? 0 : Math.exp(-Math.pow(it.layer - band, 2) / 0.45);
  const near = Math.max(0, Math.min(1, (4.8 - z2) / 9.6));
  const size = (it.big ? 13 : 8.5) * glyphScale(n) * p * (1 + 0.35 * hotness);
  const S = SCALE[n] ?? 13.5;
  return {
    tx: x1 * S * p,
    ty: -y2 * S * p,
    fs: size,
    o: Math.min(1, (it.big ? 0.3 : 0.16) + 0.5 * near + 0.45 * hotness),
    z: Math.round((D - z2) * 10),
    hot: hotness > 0.55,
  };
}

const start = typeof performance !== 'undefined' ? performance.now() : 0;

export function Cube({ values, size }: { values: number[]; size: number }): ReactNode {
  const items = useMemo(() => buildItems(values, size), [values, size]);
  const nodes = useRef<(HTMLSpanElement | null)[]>([]);
  const pointer = useRef({ px: 0, target: 0 });
  const still = useReducedMotion();

  const draw = (t: number): void => {
    const list = nodes.current;
    for (let i = 0; i < items.length; i++) {
      const el = list[i];
      if (!el) continue;
      const v = project(items[i], size, t, pointer.current.px);
      el.style.transform = `translate(${v.tx.toFixed(1)}px, ${v.ty.toFixed(1)}px) translate(-50%, -50%)`;
      el.style.fontSize = `${v.fs.toFixed(1)}px`;
      el.style.opacity = v.o.toFixed(2);
      el.style.zIndex = String(v.z);
      el.classList.toggle('hot', v.hot);
    }
  };
  // The loop below starts once; it always calls the draw of the latest render.
  const latest = useRef(draw);
  latest.current = draw;

  // Place every letter before the first paint, and again when the grid changes.
  useLayoutEffect(() => {
    draw(still ? 0 : (performance.now() - start) / 1000);
  });

  useEffect(() => {
    if (still) return;
    let raf = 0;
    let last = 0;
    const frame = (now: number): void => {
      if (now - last > 48) {
        last = now;
        const p = pointer.current;
        p.px += (p.target - p.px) * 0.18;
        latest.current((now - start) / 1000);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [still]);

  const onMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (still) return;
    const box = e.currentTarget.getBoundingClientRect();
    if (box.width) pointer.current.target = (e.clientX - box.left) / box.width - 0.5;
  };

  return (
    <div
      className="lt-fig"
      aria-hidden="true"
      onPointerMove={onMove}
      onPointerLeave={() => {
        pointer.current.target = 0;
      }}
    >
      {items.map((it, i) => (
        <span
          key={it.key}
          ref={(el) => {
            nodes.current[i] = el;
          }}
          className={it.big ? 'lt-gl lt-dg' : 'lt-gl'}
        >
          {it.ch}
        </span>
      ))}
    </div>
  );
}
