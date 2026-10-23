// The bar at the top of every screen: the menu, an optional back arrow, the screen
// title, and room for a timer and actions. GameView, the app pages and the Run and
// Learn pages all use it, so the menu is always one tap away.
import type { ReactNode, Ref } from 'react';
import { BackIcon, MenuIcon } from './icons';
import { useShell } from './shell';

export interface TopBarProps {
  title: string;
  /** Shows a back arrow that runs this. */
  onBack?: () => void;
  /** Accessible name of the back arrow. */
  backLabel?: string;
  /** Next to the title, for example the timer. */
  children?: ReactNode;
  /** Buttons on the right. */
  right?: ReactNode;
  ref?: Ref<HTMLElement>;
}

export function TopBar({ title, onBack, backLabel = 'Back', children, right, ref }: TopBarProps) {
  const shell = useShell();
  return (
    <header className="cb-top" ref={ref}>
      <div className="cb-top-left">
        <button type="button" className="cb-ib" aria-label="Menu" onClick={shell.openMenu}>
          <MenuIcon />
        </button>
        {onBack && (
          <button type="button" className="cb-ib" aria-label={backLabel} onClick={onBack}>
            <BackIcon />
          </button>
        )}
      </div>
      <div className="cb-top-mid">
        <span className="cb-top-title">{title}</span>
        {children}
      </div>
      <div className="cb-top-right">{right}</div>
    </header>
  );
}
