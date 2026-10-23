// Precomputes the daily puzzles into src/data/daily/YYYY-MM.json.
// Usage: npm run gen:daily [-- FROM TO], months as YYYY-MM (default 2026-10 to 2027-12).
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateDaily, packDay, type MonthFile } from '../src/engine/daily';

const [from = '2026-10', to = '2027-12'] = process.argv.slice(2);
const outDir = fileURLToPath(new URL('../src/data/daily/', import.meta.url));
mkdirSync(outDir, { recursive: true });

function months(a: string, b: string): string[] {
  const out: string[] = [];
  let [y, m] = a.split('-').map(Number);
  const [y2, m2] = b.split('-').map(Number);
  while (y < y2 || (y === y2 && m <= m2)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

for (const ym of months(from, to)) {
  const [y, m] = ym.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const file: MonthFile = {};
  const t0 = performance.now();
  for (let d = 1; d <= days; d++) {
    const date = `${ym}-${String(d).padStart(2, '0')}`;
    file[date] = packDay(generateDaily(date));
  }
  const json = JSON.stringify(file);
  writeFileSync(`${outDir}${ym}.json`, json + '\n');
  console.log(`${ym}: ${days} days, ${json.length} bytes, ${Math.round(performance.now() - t0)} ms`);
}
