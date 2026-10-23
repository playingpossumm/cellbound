// App shell: opens straight into today's Daily, a menu one tap away, the
// theme on <html>, challenge links, and the extra modes from src/modes.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dailyDate } from '../engine';
import type { ClueKind } from '../engine/types';
import { closeGame, onGameEnd } from '../game/store';
import { parseLocalDate } from '../game/logic';
import { useStats } from '../game/stats';
import { useSettings } from '../game/settings';
import { extraModes, learn } from '../modes';
import { getTheme } from '../themes';
import { CloseIcon } from './icons';
import { AboutScreen, DailyScreen, FogScreen, FreeScreen, SettingsScreen, StatsScreen } from './screens';
import { OPEN_EVENT, ShellContext, type ScreenId, type Shell } from './shell';
import { useApplyTheme, useNight } from './theme';

export const APP_NAME = 'Cellbound';

interface Route {
  screen: ScreenId;
  /** Daily date for ?daily= links. */
  date?: string;
  /** Free play challenge code for ?free= links. */
  code?: string;
}

function initialRoute(): Route {
  if (typeof location === 'undefined') return { screen: 'daily' };
  const q = new URLSearchParams(location.search);
  const daily = q.get('daily');
  // A link to a future day opens today instead, so nobody sees a Daily early.
  if (daily && parseLocalDate(daily) && daily <= dailyDate()) return { screen: 'daily', date: daily };
  const free = q.get('free');
  if (free) return { screen: 'free', code: free };
  return { screen: 'daily' };
}

function clearQuery() {
  try {
    if (location.search) history.replaceState(null, '', location.pathname);
  } catch {
    /* ignore */
  }
}

export default function App() {
  useApplyTheme();
  const night = useNight();
  const themeId = useSettings((s) => s.theme);
  const theme = getTheme(themeId);
  const [route, setRoute] = useState<Route>(initialRoute);
  // Today's date, refreshed when the app comes back into view (never mid-game).
  const [today, setToday] = useState(dailyDate);
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === 'visible') setToday(dailyDate());
    };
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, []);
  const menuRef = useRef<HTMLDialogElement>(null);

  useEffect(() => onGameEnd((g) => useStats.getState().record(g)), []);

  const go = useCallback((screen: ScreenId) => {
    menuRef.current?.close();
    clearQuery();
    if (screen.startsWith('mode:')) closeGame();
    setRoute({ screen });
    window.scrollTo?.(0, 0);
  }, []);

  const shell = useMemo<Shell>(
    () => ({
      openMenu: () => {
        const d = menuRef.current;
        if (d && !d.open) d.showModal();
      },
      go,
      openLesson: (kind: ClueKind | 'basics') => {
        learn.openLesson(kind);
        if (extraModes.some((m) => m.id === 'learn')) go('mode:learn');
      },
    }),
    [go],
  );

  useEffect(() => {
    const onOpen = (e: Event) => {
      const screen = (e as CustomEvent<{ screen?: ScreenId }>).detail?.screen;
      if (typeof screen === 'string') go(screen);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [go]);

  const Backdrop = theme.Backdrop;
  const extra = route.screen.startsWith('mode:') ? extraModes.find((m) => `mode:${m.id}` === route.screen) : undefined;

  let body;
  switch (route.screen) {
    case 'daily':
      body = <DailyScreen key={route.date ?? today} date={route.date ?? today} />;
      break;
    case 'fog':
      body = <FogScreen />;
      break;
    case 'free':
      body = <FreeScreen code={route.code} />;
      break;
    case 'stats':
      body = <StatsScreen />;
      break;
    case 'settings':
      body = <SettingsScreen />;
      break;
    case 'about':
      body = <AboutScreen />;
      break;
    default:
      body = extra ? <extra.Screen onExit={() => go('daily')} /> : <DailyScreen key={today} date={today} />;
  }

  const items: { screen: ScreenId; name: string; blurb: string }[] = [
    { screen: 'daily', name: 'Daily', blurb: 'One shared puzzle a day.' },
    ...extraModes.map((m) => ({ screen: `mode:${m.id}` as ScreenId, name: m.name, blurb: m.blurb })),
    { screen: 'fog', name: 'Fog', blurb: 'Correct digits clear the fog around them.' },
    { screen: 'free', name: 'Free play', blurb: 'Pick the size, rules and difficulty.' },
  ];
  const more: { screen: ScreenId; name: string }[] = [
    { screen: 'stats', name: 'Stats' },
    { screen: 'settings', name: 'Settings' },
    { screen: 'about', name: 'About' },
  ];

  return (
    <ShellContext.Provider value={shell}>
      <div className="cb-backdrop" aria-hidden="true">
        {Backdrop && <Backdrop night={night} />}
      </div>
      <div className="cb-app">{body}</div>
      <dialog
        ref={menuRef}
        className="cb-menu"
        aria-label="Menu"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
      >
        <div className="cb-menu-inner">
          <div className="cb-menu-head">
            <span className="cb-menu-name">{APP_NAME}</span>
            <button type="button" className="cb-ib" aria-label="Close menu" onClick={() => menuRef.current?.close()}>
              <CloseIcon />
            </button>
          </div>
          <nav aria-label="Modes">
            <ul className="cb-menu-list">
              {items.map((it) => (
                <li key={it.screen}>
                  <button
                    type="button"
                    className={`cb-menu-item${route.screen === it.screen ? ' on' : ''}`}
                    aria-current={route.screen === it.screen ? 'page' : undefined}
                    onClick={() => go(it.screen)}
                  >
                    <span className="cb-menu-item-name">{it.name}</span>
                    <span className="cb-menu-item-blurb">{it.blurb}</span>
                  </button>
                </li>
              ))}
            </ul>
            <ul className="cb-menu-list small">
              {more.map((it) => (
                <li key={it.screen}>
                  <button
                    type="button"
                    className={`cb-menu-item${route.screen === it.screen ? ' on' : ''}`}
                    aria-current={route.screen === it.screen ? 'page' : undefined}
                    onClick={() => go(it.screen)}
                  >
                    <span className="cb-menu-item-name">{it.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </dialog>
    </ShellContext.Provider>
  );
}
