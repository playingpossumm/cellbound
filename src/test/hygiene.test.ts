// Repository hygiene: the copy rules and the privacy rules, checked on every text file
// that ships in the repository.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EM_DASH, EN_DASH } from './copy';

const root = fileURLToPath(new URL('../../', import.meta.url));
const DIRS = ['src', 'e2e', 'scripts', 'public', 'docs'];
const TOP = ['README.md', 'LICENSE', 'index.html', 'package.json', 'tsconfig.json', 'vite.config.ts', 'playwright.config.ts', '.gitignore', '.gitattributes'];
const TEXT = /\.(ts|tsx|css|html|json|md|svg|txt)$/;

function files(): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    let names: string[];
    try {
      names = readdirSync(d);
    } catch {
      return;
    }
    for (const f of names) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (TEXT.test(f)) out.push(p);
    }
  };
  for (const d of DIRS) walk(join(root, d));
  for (const f of TOP) {
    try {
      if (statSync(join(root, f)).isFile()) out.push(join(root, f));
    } catch {
      /* not there */
    }
  }
  return out;
}

/** Selectors that style :hover outside a (hover: hover) media query, which would stick on touch screens. */
export function hoverOutsideMedia(css: string): string[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const stack: string[] = [];
  const bad: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '{') {
      const prelude = text.slice(start, i).trim();
      if (/:hover/.test(prelude) && !stack.some((s) => /^@media[^{]*\(hover:\s*hover\)/.test(s))) bad.push(prelude);
      stack.push(prelude);
      start = i + 1;
    } else if (c === '}') {
      stack.pop();
      start = i + 1;
    } else if (c === ';') {
      start = i + 1;
    }
  }
  return bad;
}

describe('repository hygiene', () => {
  const list = files();

  it('styles :hover only where a pointer can hover', () => {
    for (const f of list.filter((p) => p.endsWith('.css'))) {
      expect(hoverOutsideMedia(readFileSync(f, 'utf8')), relative(root, f)).toEqual([]);
    }
  });

  it('finds an unguarded :hover rule', () => {
    expect(hoverOutsideMedia('.a:hover { color: red; }')).toEqual(['.a:hover']);
    expect(hoverOutsideMedia('@media (hover: hover) { .a:hover { color: red; } }')).toEqual([]);
    expect(hoverOutsideMedia('@media (min-width: 900px) { .a:hover { color: red; } }')).toEqual(['.a:hover']);
  });

  it('finds the source files', () => {
    expect(list.length).toBeGreaterThan(100);
  });

  it('has no em or en dashes', () => {
    for (const f of list) {
      const text = readFileSync(f, 'utf8');
      expect(text.includes(EM_DASH) || text.includes(EN_DASH), relative(root, f)).toBe(false);
    }
  });

  it('has no email addresses other than noreply ones', () => {
    for (const f of list) {
      const text = readFileSync(f, 'utf8');
      const mails = (text.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) ?? []).filter((m) => !/noreply/i.test(m));
      expect(mails, relative(root, f)).toEqual([]);
    }
  });

  it('has no absolute home paths', () => {
    for (const f of list) {
      const text = readFileSync(f, 'utf8');
      expect(text, relative(root, f)).not.toMatch(/[A-Za-z]:[\\/]Users|\/c\/Users|\/Users\/|\/home\/\w/i);
    }
  });
});
