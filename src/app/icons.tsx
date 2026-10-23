// Inline stroke icons. Decorative: buttons carry their own labels.
import type { ReactNode } from 'react';

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg className="cb-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export const MenuIcon = () => (
  <Icon>
    <path d="M4 7h16M4 12h16M4 17h10" />
  </Icon>
);
export const StatsIcon = () => (
  <Icon>
    <path d="M4 20v-7h5v7M9.5 20V7h5v13M15 20v-9h5v9M3 20h18" />
  </Icon>
);
export const PauseIcon = () => (
  <Icon>
    <path d="M9 6v12M15 6v12" />
  </Icon>
);
export const PlayIcon = () => (
  <Icon>
    <path d="M8 5.5v13l10-6.5z" />
  </Icon>
);
export const UndoIcon = () => (
  <Icon>
    <path d="M8.5 5.5 4 10l4.5 4.5M4 10h10a5.5 5.5 0 0 1 0 11h-3" />
  </Icon>
);
export const EraseIcon = () => (
  <Icon>
    <path d="M18 20H8l-4-4 9-9 7 7-6 6M9.5 11.5l5 5" />
  </Icon>
);
export const NotesIcon = () => (
  <Icon>
    <path d="M4 20l4-1 11-11-3-3L5 16l-1 4zM14 6l3 3" />
  </Icon>
);
export const HintIcon = () => (
  <Icon>
    <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c0.6 0.4 1 1.1 1 1.9V16h5v-0.2c0-0.8 0.4-1.5 1-1.9A6 6 0 0 0 12 3z" />
  </Icon>
);
export const CloseIcon = () => (
  <Icon>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);
export const BackIcon = () => (
  <Icon>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
);
export const ShareIcon = () => (
  <Icon>
    <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M5 13v6.5h14V13" />
  </Icon>
);
