// Inline icons for the Run. Decorative: the text or the accessible name next to them carries the meaning.
import type { ReactNode } from 'react';
import type { Category } from '../model';

interface IconProps {
  className?: string;
  filled?: boolean;
}

function Svg({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function HeartIcon({ className, filled }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false" strokeWidth="1.8" strokeLinejoin="round" stroke="currentColor" fill={filled ? 'currentColor' : 'none'}>
      <path d="M12 20.3s-7.6-4.5-7.6-10.2A4.3 4.3 0 0 1 12 7.5a4.3 4.3 0 0 1 7.6 2.6c0 5.7-7.6 10.2-7.6 10.2z" />
    </svg>
  );
}

export function ShieldIcon({ className, filled }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false" strokeWidth="1.8" strokeLinejoin="round" stroke="currentColor" fill={filled ? 'currentColor' : 'none'}>
      <path d="M12 3.4l7 2.6v5.5c0 4.3-2.9 7.6-7 9.1-4.1-1.5-7-4.8-7-9.1V6z" />
    </svg>
  );
}

/** A coin: a ring with a facet, drawn in the coin colour. */
export function CoinIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5l3 4.5-3 4.5-3-4.5z" />
    </Svg>
  );
}

/** A target: the score a board asks for. */
export function TargetIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" />
    </Svg>
  );
}

export function LockIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <rect x="5.5" y="10.5" width="13" height="9.5" rx="1.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </Svg>
  );
}

export function CheckIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Svg>
  );
}

export function SkipIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M5 6l7 6-7 6zM13 6l7 6-7 6z" />
    </Svg>
  );
}

export function RerollIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" />
    </Svg>
  );
}

export function ArrowIcon({ className, dir }: { className?: string; dir: 'left' | 'right' }) {
  return <Svg className={className}>{dir === 'left' ? <path d="M14.5 5.5 8 12l6.5 6.5" /> : <path d="M9.5 5.5 16 12l-6.5 6.5" />}</Svg>;
}

/** A drop of ink, for the one-shot consumables. */
export function InkIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M12 3.5c3 4 6 7.2 6 10.5a6 6 0 0 1-12 0c0-3.3 3-6.5 6-10.5z" />
    </Svg>
  );
}

/** A prism with its ray, for the Spectra. */
export function SpectrumIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M12 4.5l7 13H5z" />
      <path d="M2.5 13.5l7-2.5M14.5 11l7-3M14.5 12.5l7 1" />
    </Svg>
  );
}

/** One glyph per reward category. */
export function CategoryIcon({ category, className }: { category: Category; className?: string }) {
  if (category === 'hearts') return <HeartIcon className={className} filled />;
  if (category === 'hints')
    return (
      <Svg className={className}>
        <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c0.6 0.4 1 1.1 1 1.9V16h5v-0.2c0-0.8 0.4-1.5 1-1.9A6 6 0 0 0 12 3z" />
      </Svg>
    );
  if (category === 'mult')
    return (
      <Svg className={className}>
        <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
      </Svg>
    );
  return (
    <Svg className={className}>
      <path d="M4 18.5l5-5 3.5 3.5L20 9.5M15.5 9.5H20v4.5" />
    </Svg>
  );
}

/** Used by Learn. */
export function ChevronIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M9.5 5.5 16 12l-6.5 6.5" />
    </Svg>
  );
}
export function BackIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M14.5 5.5 8 12l6.5 6.5" />
    </Svg>
  );
}
