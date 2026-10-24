// Inline stroke icons. Decorative: every button that shows one carries its own accessible name.
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
export const DailyIcon = () => (
  <Icon>
    <path d="M5 6.5h14v13H5zM5 10.5h14M9 4.5v3.5M15 4.5v3.5M9.5 14.5h2v2h-2z" />
  </Icon>
);
export const RunIcon = () => (
  <Icon>
    <path d="M4.5 19.5c2-4 5.5-4.5 7.5-2s5.5 1 6-4M18 13.5V4l3 1.8-3 1.8" />
  </Icon>
);
export const LearnIcon = () => (
  <Icon>
    <path d="M4 6.5c2.7-1.4 5.3-1.4 8 0v12.5c-2.7-1.4-5.3-1.4-8 0zM20 6.5c-2.7-1.4-5.3-1.4-8 0v12.5c2.7-1.4 5.3-1.4 8 0z" />
  </Icon>
);
export const FogIcon = () => (
  <Icon>
    <path d="M7.5 15.5h9.5a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.4-1.6A3.4 3.4 0 0 0 7.5 15.5zM6 19h12" />
  </Icon>
);
export const FreeIcon = () => (
  <Icon>
    <path d="M5 5h14v14H5zM9.5 5v14M14.5 5v14M5 9.5h14M5 14.5h14" />
  </Icon>
);
export const SettingsIcon = () => (
  <Icon>
    <path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
  </Icon>
);
export const AboutIcon = () => (
  <Icon>
    <path d="M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 11v5.5M12 7.6v.1" />
  </Icon>
);
export const CheckIcon = () => (
  <Icon>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);
export const NewBoardIcon = () => (
  <Icon>
    <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" />
  </Icon>
);
export const RulesIcon = () => (
  <Icon>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9M15 4.5v5M9 14.5v5" />
  </Icon>
);
