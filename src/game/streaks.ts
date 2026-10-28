// Daily streaks, from a player's Daily results. Pure and free of the stores, so the leaderboard's
// server reads streaks the way the app does.
import { localDate, shiftDate } from './logic';
import type { DailyEntry } from './stats';

/** A day counts toward a streak when its Daily was solved on that day. */
function streakDay(daily: Record<string, DailyEntry>, date: string): boolean {
  const e = daily[date];
  return !!e && e.status === 'solved' && e.solvedOn === date;
}

/** Consecutive solved Dailies ending today, or yesterday when today is not solved yet. */
export function currentStreak(daily: Record<string, DailyEntry>, today: string = localDate()): number {
  let day = streakDay(daily, today) ? today : shiftDate(today, -1);
  let n = 0;
  while (streakDay(daily, day)) {
    n++;
    day = shiftDate(day, -1);
  }
  return n;
}

export function bestStreak(daily: Record<string, DailyEntry>): number {
  const days = Object.keys(daily).filter((d) => streakDay(daily, d)).sort();
  let best = 0;
  let run = 0;
  let prev = '';
  for (const d of days) {
    run = prev && shiftDate(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}
