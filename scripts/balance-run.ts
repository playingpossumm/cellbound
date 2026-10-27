// Prints what each lens, Spectrum and card adds to a run's score, played through the real scoring on
// real boards, so the buys can be set against each other. Every board is played once by a typical
// player (notes in every cell, so no unit is clean) and once by a clean one (no notes), and each
// build is scored on the same placements.
// Usage: npm run balance:run [-- SEEDS]   (default 6 seeds)
// "+%" is the gain over the same placements with nothing held, as a mean over the seeds, by ante;
// "per coin" is the typical gain over all three antes divided by the price. A lens that only works
// on a rare technique or a rare clue shows it here as a small number.
import { generate } from '../src/engine';
import { classifyPlacement, hardestPlacement } from '../src/engine/techniques';
import { optionsFor, SLOT_COUNT } from '../src/modes/run/boards';
import { levelsOf, recordAs, REFERENCE_BUILDS, scoreMoves, type Build, type Move, type Style } from '../src/modes/run/calibrate';
import { ITEMS } from '../src/modes/run/items';
import { LENSES } from '../src/modes/run/lenses';
import type { LensId, RewardId } from '../src/modes/run/model';
import { REWARDS } from '../src/modes/run/rewards';

const count = Number(process.argv[2] ?? 6);
const seeds = Array.from({ length: count }, (_, k) => `free:balance${k + 1}`);
const styles: Style[] = ['typical', 'clean'];
const mean = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;
const t0 = performance.now();

// Moves per [slot][style][seed], recorded once.
const boards: Record<Style, Move[][][]> = { typical: [], clean: [], expert: [] };
for (const s of styles) boards[s] = Array.from({ length: SLOT_COUNT }, () => []);
for (let slot = 0; slot < SLOT_COUNT; slot++) {
  for (const seed of seeds) {
    const p = generate(optionsFor(seed, slot));
    for (const style of styles) boards[style][slot].push(recordAs(p, style, seed, classifyPlacement, hardestPlacement).moves);
  }
}
const base: Record<Style, number[][]> = { typical: [], clean: [], expert: [] };
for (const style of styles) base[style] = boards[style].map((per) => per.map((m) => scoreMoves(m)));

/** Mean gain in percent of a build per ante, for a style: a lens that needs a clue kind averages in the boards without it. */
function gains(build: Build, style: Style): number[] {
  const perSlot = boards[style].map((per, slot) => mean(per.map((m, k) => (scoreMoves(m, build) / base[style][slot][k] - 1) * 100)));
  return [0, 1, 2].map((a) => mean(perSlot.slice(a * 3, a * 3 + 3)));
}

const f = (x: number) => (x >= 0 ? '+' : '') + x.toFixed(0) + '%';
const pad = (s: string | number, w: number) => String(s).padStart(w);
const row = (name: string, price: number | string, b: Build) => {
  const typ = gains(b, 'typical');
  const cln = gains(b, 'clean');
  const avg = mean(typ);
  const per = typeof price === 'number' && price > 0 ? (avg / price).toFixed(1) : '';
  console.log(`${name.padEnd(22)}${pad(price, 5)}  ${typ.map((x) => pad(f(x), 6)).join('')}  ${cln.map((x) => pad(f(x), 6)).join('')}${pad(per, 9)}`);
};

console.log(`Gain over the same placements with nothing held. ${count} seeds, means. typical = notes in every cell; clean = no notes.`);
console.log(`${''.padEnd(22)}${pad('price', 5)}  ${pad('typ A1', 6)}${pad('A2', 6)}${pad('A3', 6)}  ${pad('cln A1', 6)}${pad('A2', 6)}${pad('A3', 6)}${pad('per coin', 9)}`);

console.log('\nLenses, one at a time');
for (const l of LENSES) {
  if (l.id === 'mirror') continue;
  // Clutch pays on the last heart, so it is read with one heart.
  const hearts = l.id === ('clutch' as LensId) ? 1 : undefined;
  row(l.name, l.price, { lenses: [{ id: l.id }], hearts });
}

console.log('\nSpectra, one level and three levels');
for (const it of ITEMS.filter((i) => i.kind === 'spectra')) {
  const tier = it.tier!;
  row(`${it.name} 1`, it.price, { levels: levelsOf(tier, 1) });
  row(`${it.name} 3`, it.price * 3, { levels: levelsOf(tier, 3) });
}

console.log('\nCards that stay');
const cards: [RewardId, number][] = [
  ['prismShard', 1],
  ['prismShard', 3],
  ['hotStreak', 1],
  ['daredevil', 1],
  ['microscope', 1],
  ['cleanSweep', 1],
  ['cascade', 1],
  ['fishbowl', 1],
  ['expertPay', 1],
  ['glassHeart', 1],
];
for (const [id, n] of cards) {
  const def = REWARDS.find((r) => r.id === id)!;
  row(`${def.name}${n > 1 ? ' x' + n : ''}`, '', { perks: { [id]: n } });
}

console.log('\nBuilds to lean on: gain over nothing held, as a multiple, by ante');
for (const { name, build, only } of REFERENCE_BUILDS) {
  const x = (style: Style) => gains(build, style).map((g) => pad('x' + (1 + g / 100).toFixed(2), 6)).join('');
  console.log(`${name.slice(0, 62).padEnd(64)}${only === 'clean' ? pad('', 18) : x('typical')}  ${x('clean')}`);
}

console.log(`\nDone in ${Math.round(performance.now() - t0)} ms.`);
