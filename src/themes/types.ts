// Theme contract. Additive changes only.
import type { ComponentType } from 'react';
import type { CellIndex, Clue, ClueKind, Digit, Puzzle } from '../engine/types';

export type ThemeId = 'atlas' | 'paper' | 'washi' | 'swiss' | 'prism' | 'letters';

/** Board geometry in board pixels; the board SVG uses viewBox 0 0 px px. */
export interface BoardGeometry {
  size: number;
  boxW: number;
  boxH: number;
  /** Cell edge in board pixels. */
  cell: number;
  /** Board edge in board pixels (size * cell). */
  px: number;
  /** Centre of a cell. */
  center(i: CellIndex): [number, number];
  /** Region id of a cell (box id when there are no irregular regions). */
  regionOf(i: CellIndex): number;
}

export interface BandProps {
  /** Mode title, for example "Daily". */
  title: string;
  /** For example "Friday 23 October". */
  subtitle: string;
  /** Formatted timer, empty string when hidden. */
  time: string;
  puzzle: Puzzle;
  /** Full grid: givens plus player entries. */
  values: Digit[];
  night: boolean;
}

export interface ClueLayerProps {
  puzzle: Puzzle;
  geo: BoardGeometry;
  /** Clue kind lit by the rule chips, or null. */
  lit: ClueKind | null;
  /** Cells currently hidden by fog; clues fully inside fog should not be drawn. */
  hidden?: boolean[];
}

export interface DigitProps {
  digit: Digit;
  kind: 'given' | 'mine' | 'hint' | 'wrong';
  /** Changes every time this cell receives a new digit; use it to restart placement effects. */
  placedAt: number;
}

export interface ThemeDef {
  id: ThemeId;
  name: string;
  /** One line shown in the theme picker. */
  blurb: string;
  /** Mode used when the setting is Auto and the device has no preference. */
  defaultNight: boolean;
  /** True when the band draws the timer itself, so the app can hide its own copy. */
  bandShowsTime?: boolean;
  /** Loads the theme's fonts (dynamic import of @fontsource CSS). */
  loadFonts: () => Promise<unknown>;
  /** Signature header band above the board. */
  Band: ComponentType<BandProps>;
  /** Full-page decoration behind everything (stars, grain, fibres). */
  Backdrop?: ComponentType<{ night: boolean }>;
  /** Replaces the default grid lines. */
  GridLayer?: ComponentType<{ geo: BoardGeometry }>;
  /** Replaces the default clue drawing. */
  ClueLayer?: ComponentType<ClueLayerProps>;
  /** Drawn above the digits for finished boxes (for example seals). */
  BoxDoneLayer?: ComponentType<{ geo: BoardGeometry; done: number[] }>;
  /** Replaces the plain digit span (for example a decoding effect). */
  Digit?: ComponentType<DigitProps>;
}

export type { Clue };
