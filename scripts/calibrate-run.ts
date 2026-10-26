// Prints what the Run's targets ask for against what play earns, board by board, so the numbers in
// src/modes/run/tuning.ts can be set once the engine's real technique detector is in.
// Usage: npm run calibrate:run [-- SEEDS]   (default 6 seeds; each board is played three ways)
import { generate } from '../src/engine';
import { tierProfile } from '../src/engine/techniques';
import { anteOf, kindOf, optionsFor, SLOT_COUNT } from '../src/modes/run/boards';
import { playAs, type Style } from '../src/modes/run/calibrate';
import { chipsOfTiers, targetFor } from '../src/modes/run/targets';
import { TARGET } from '../src/modes/run/tuning';

const count = Number(process.argv[2] ?? 6);
const seeds = Array.from({ length: count }, (_, k) => `free:calibrate${k + 1}`);
const styles: Style[] = ['typical', 'clean', 'expert'];
const median = (xs: number[]) => xs.slice().sort((a, b) => a - b)[xs.length >> 1];
const pad = (s: string | number, w: number) => String(s).padStart(w);
const t0 = performance.now();

console.log(`Targets: typical chips x scale ${TARGET.scale} x kind ${JSON.stringify(TARGET.kind)} x ${TARGET.anteGrowth} per ante. ${count} seeds, medians.`);
console.log(['slot', 'board', 'empty', 'chips', 'target', 'typical', 'clean', 'expert', 'typ/tgt', 'cln/tgt', 'exp/tgt', 'expert tiers 1-8'].map((h, i) => pad(h, i === 11 ? 18 : i === 1 ? 7 : 8)).join(' '));
for (let slot = 0; slot < SLOT_COUNT; slot++) {
  const rows = seeds.map((seed) => {
    const p = generate(optionsFor(seed, slot));
    const profile = tierProfile(p);
    const played = Object.fromEntries(styles.map((s) => [s, playAs(p, s, seed)])) as Record<Style, ReturnType<typeof playAs>>;
    return {
      empty: p.givens.filter((d) => !d).length,
      chips: chipsOfTiers(profile.typical),
      target: targetFor(slot, profile),
      ...Object.fromEntries(styles.map((s) => [s, played[s].score])),
      tiers: played.expert.tiers,
    } as { empty: number; chips: number; target: number; typical: number; clean: number; expert: number; tiers: number[] };
  });
  const m = (k: 'empty' | 'chips' | 'target' | 'typical' | 'clean' | 'expert') => median(rows.map((r) => r[k]));
  const ratio = (k: 'typical' | 'clean' | 'expert') => median(rows.map((r) => r[k] / r.target)).toFixed(2);
  const tiers = Array.from({ length: 8 }, (_, t) => median(rows.map((r) => r.tiers[t + 1]))).join(',');
  console.log(
    [slot, `A${anteOf(slot)} ${kindOf(slot)}`, m('empty'), m('chips'), m('target'), m('typical'), m('clean'), m('expert'), ratio('typical'), ratio('clean'), ratio('expert'), tiers]
      .map((v, i) => pad(v, i === 11 ? 18 : i === 1 ? 7 : 8))
      .join(' '),
  );
}
console.log(`Done in ${Math.round(performance.now() - t0)} ms. A ratio under 1 misses the target without lenses or cards.`);
