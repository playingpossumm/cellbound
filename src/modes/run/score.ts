// Run scoring. Pure functions, so the breakdown on screen is the same arithmetic the tests check.
import { baseFor } from './boards';

/** Points per heart left when a run is finished. */
export const HEART_BONUS = 150;
/** The time bonus is at most this share of the base score, reached with an instant solve. */
export const TIME_BONUS_SHARE = 0.5;
/** Each hint costs this share of the base score. */
export const HINT_COST_SHARE = 0.15;

export interface BoardScore {
  base: number;
  timeBonus: number;
  hintPenalty: number;
  /** Base plus time bonus minus hints, never below zero. */
  subtotal: number;
  /** Curse multiplier, 1 or more. */
  mult: number;
  total: number;
}

export interface ScoreInput {
  /**
   * The difficulty of the board's slot in the run, which sets the base score. Cards that make a
   * board easier or harder change the multiplier and the par time, never the base.
   */
  difficulty: number;
  /** Board size; a 9x9 has a larger base. Defaults to 6. */
  size?: number;
  /** Par time of the board as generated. */
  parMs: number;
  elapsedMs: number;
  hintsUsed: number;
  /** 1 plus the curse bonuses. */
  mult: number;
}

export function scoreBoard(input: ScoreInput): BoardScore {
  const base = baseFor(input.size ?? 6, input.difficulty);
  const par = Math.max(1, input.parMs);
  const left = Math.max(0, Math.min(1, (par - input.elapsedMs) / par));
  const timeBonus = Math.floor(base * TIME_BONUS_SHARE * left);
  const hintPenalty = Math.max(0, input.hintsUsed) * Math.round(base * HINT_COST_SHARE);
  const subtotal = Math.max(0, base + timeBonus - hintPenalty);
  const mult = Math.max(1, input.mult);
  return { base, timeBonus, hintPenalty, subtotal, mult, total: Math.round(subtotal * mult) };
}

export function endBonus(heartsLeft: number): number {
  return Math.max(0, Math.floor(heartsLeft)) * HEART_BONUS;
}

/** 1250 becomes "1,250" without depending on the device locale. */
export function formatScore(n: number): string {
  const s = String(Math.round(n));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatMs(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}
