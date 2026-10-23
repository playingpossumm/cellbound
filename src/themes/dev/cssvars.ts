// Test helpers: read a theme stylesheet and resolve its custom properties.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const themeDir = fileURLToPath(new URL('..', import.meta.url));

export function themeCss(id: string): string {
  return readFileSync(join(themeDir, id, 'theme.css'), 'utf8');
}

/** Custom properties declared on the theme root, for one mode. */
export function rootVars(source: string, id: string, night: boolean): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /\[data-theme="(\w+)"\](?:\[data-night="(true|false)"\])?\s*\{([^}]*)\}/g;
  for (const m of source.matchAll(re)) {
    if (m[1] !== id) continue;
    if (m[2] !== undefined && (m[2] === 'true') !== night) continue;
    for (const d of m[3].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  }
  return out;
}

/** Digit hue variables a theme sets per board size, for one mode (prism). */
export function sizeVars(source: string, id: string, night: boolean, size: number): Record<string, string> {
  const out: Record<string, string> = {};
  const re = new RegExp(
    `\\[data-theme="${id}"\\]\\[data-night="(true|false)"\\] :is\\([^)]*\\)\\[data-size="(\\d)"\\]\\s*\\{([^}]*)\\}`,
    'g',
  );
  for (const m of source.matchAll(re)) {
    if ((m[1] === 'true') !== night || Number(m[2]) !== size) continue;
    for (const d of m[3].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  }
  return out;
}

export function resolve(name: string, env: Record<string, string>, depth = 0): string | undefined {
  const v = env[name];
  if (v === undefined || depth > 8) return undefined;
  const m = /^var\((--[\w-]+)\)$/.exec(v);
  return m ? resolve(m[1], env, depth + 1) : v;
}

export type Rgba = [number, number, number, number];

const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c: number): number => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp = (v: number): number => Math.min(1, Math.max(0, v));

function oklch(L: number, C: number, h: number): Rgba {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => gam(clamp(v)));
  return [rgb[0], rgb[1], rgb[2], 1];
}

export function parseColor(v: string | undefined): Rgba | null {
  if (!v) return null;
  const t = v.trim();
  if (t.startsWith('#')) {
    let h = t.slice(1);
    if (h.length === 3) h = [...h].map((c) => c + c).join('');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).concat(1) as Rgba;
  }
  let m = /^rgba?\(([^)]*)\)$/.exec(t);
  if (m) {
    const p = m[1].split(',').map((x) => parseFloat(x));
    return [p[0] / 255, p[1] / 255, p[2] / 255, p.length > 3 ? p[3] : 1];
  }
  m = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(t);
  if (m) return oklch(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
  return null;
}

/** Lay a translucent colour over an opaque one. */
export function over(fg: Rgba, bg: Rgba): Rgba {
  const a = fg[3];
  return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
}

const lum = (c: Rgba): number => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);

export function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
