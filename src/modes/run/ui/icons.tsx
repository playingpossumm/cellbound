// Inline stroke icons for the modes. Decorative: the text next to them carries the meaning.
import type { ReactNode } from 'react';
import type { CardKind } from '../cards';

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

export function KindIcon({ kind, className }: { kind: CardKind; className?: string }) {
  if (kind === 'boon')
    return (
      <Svg className={className}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 8v8M8 12h8" />
      </Svg>
    );
  if (kind === 'curse')
    return (
      <Svg className={className}>
        <path d="M12 4l9 15.5H3z" />
        <path d="M12 10v4.5M12 17.3v.1" />
      </Svg>
    );
  return (
    <Svg className={className}>
      <path d="M5 9h13l-3-3M19 15H6l3 3" />
    </Svg>
  );
}

export function BackIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M15 5l-7 7 7 7" />
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
