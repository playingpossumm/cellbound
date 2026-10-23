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

describe('repository hygiene', () => {
  const list = files();

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
