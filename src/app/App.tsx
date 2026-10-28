// App shell: opens straight into today's Daily, a menu one tap away, the
// theme on <html>, challenge links, and the extra modes from src/modes.
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { dailyDate } from '../engine';
import type { ClueKind } from '../engine/types';
import { closeGame, onGameEnd } from '../game/store';
import { parseLocalDate } from '../game/logic';
import { useStats } from '../game/stats';
import { extraModes, learn } from '../modes';
import { useAccount } from '../sync/account';
import { APP_NAME } from './brand';
import { AboutIcon, CloseIcon, DailyIcon, FreeIcon, LearnIcon, PersonIcon, RunIcon, SettingsIcon, StatsIcon, TrophyIcon } from './icons';
import { LeaderboardScreen } from './leaderboard';
import { AboutScreen, DailyScreen, FreeScreen, Loading, SettingsScreen, StatsScreen } from './screens';
import { OPEN_EVENT, ShellContext, type ScreenId, type Shell } from './shell';
import { useApplyTheme } from './theme';
import { primeBadges, useBadges, useNewBadges } from './badges';

/** An icon for each screen in the menu, so the list reads at a glance. */
const MENU_ICONS: Partial<Record<ScreenId, ReactNode>> = {
  daily: <DailyIcon />,
  'mode:run': <RunIcon />,
  'mode:learn': <LearnIcon />,
  free: <FreeIcon />,
  stats: <StatsIcon />,
  leaderboard: <TrophyIcon />,
  settings: <SettingsIcon />,
  about: <AboutIcon />,
};

/** Names for the page title; the Daily uses the app's name alone. */
const SCREEN_NAMES: Partial<Record<ScreenId, string>> = { free: 'Free play', stats: 'Stats', leaderboard: 'Leaderboard', settings: 'Settings', about: 'About' };

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
    if (location.search) history.replaceState(history.state, '', location.pathname);
  } catch {
    /* ignore */
  }
}

/** Each screen the player opens is a history entry, so the Back button and the Back swipe step back through them. */
function remember(route: Route, how: 'push' | 'replace') {
  try {
    const state = { cbRoute: route };
    if (how === 'push') history.pushState(state, '', location.pathname);
    else history.replaceState(state, '', location.href);
  } catch {
    /* ignore */
  }
}

function routeOf(state: unknown): Route {
  const r = (state as { cbRoute?: Partial<Route> } | null)?.cbRoute;
  return r && typeof r.screen === 'string' ? { screen: r.screen, date: r.date, code: r.code } : { screen: 'daily' };
}

const sameRoute = (a: Route, b: Route) => a.screen === b.screen && a.date === b.date && a.code === b.code;

export default function App() {
  useApplyTheme();
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
  // The name this device plays under on the leaderboard, or null before logging in.
  const player = useAccount((s) => (s.token ? s.name : null));

  useEffect(() => onGameEnd((g) => useStats.getState().record(g)), []);
  // Badges earned before badges arrived count as seen; a badge earned since marks Stats in the menu.
  useEffect(primeBadges, []);
  const badgesNew = useNewBadges(useBadges()).length > 0;

  // Counts visits, so choosing a mode from the menu always opens it at its start,
  // even when that mode is already on screen.
  const [visit, setVisit] = useState(0);
  const current = useRef(route);
  current.current = route;
  const show = useCallback((next: Route) => {
    menuRef.current?.close();
    if (next.screen.startsWith('mode:')) closeGame();
    setRoute(next);
    setVisit((v) => v + 1);
    window.scrollTo?.(0, 0);
  }, []);
  const go = useCallback(
    (screen: ScreenId) => {
      const next: Route = { screen };
      if (sameRoute(current.current, next)) clearQuery();
      else remember(next, 'push');
      show(next);
    },
    [show],
  );

  // The first screen is the first history entry; Back and Forward then move between screens.
  useEffect(() => {
    remember(current.current, 'replace');
    const onPop = (e: PopStateEvent) => show(routeOf(e.state));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [show]);

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

  const extra = route.screen.startsWith('mode:') ? extraModes.find((m) => `mode:${m.id}` === route.screen) : undefined;

  let body;
  switch (route.screen) {
    case 'daily':
      body = <DailyScreen key={route.date ?? today} date={route.date ?? today} />;
      break;
    case 'free':
      body = <FreeScreen code={route.code} />;
      break;
    case 'stats':
      body = <StatsScreen />;
      break;
    case 'leaderboard':
      body = <LeaderboardScreen />;
      break;
    case 'settings':
      body = <SettingsScreen />;
      break;
    case 'about':
      body = <AboutScreen />;
      break;
    default:
      body = extra ? (
        // Run and Learn load on first use; the frame shows while their code arrives.
        <Suspense fallback={<Loading title={extra.name} text={`Opening ${extra.name}.`} />}>
          <extra.Screen key={visit} onExit={() => go('daily')} />
        </Suspense>
      ) : (
        <DailyScreen key={today} date={today} />
      );
  }

  const screenName = route.screen === 'daily' ? null : (extra?.name ?? SCREEN_NAMES[route.screen] ?? null);
  useEffect(() => {
    document.title = screenName ? `${screenName} · ${APP_NAME}` : APP_NAME;
  }, [screenName]);

  // The menu shows names and icons; each mode's one-line description goes to screen readers.
  const items: { screen: ScreenId; name: string; blurb: string }[] = [
    { screen: 'daily', name: 'Daily', blurb: 'One shared puzzle a day.' },
    ...extraModes.map((m) => ({ screen: `mode:${m.id}` as ScreenId, name: m.name, blurb: m.blurb })),
    { screen: 'free', name: 'Free play', blurb: 'Pick the size, rules and difficulty, with or without fog.' },
  ];
  const more: { screen: ScreenId; name: string }[] = [
    { screen: 'stats', name: 'Stats' },
    { screen: 'leaderboard', name: 'Leaderboard' },
    { screen: 'settings', name: 'Settings' },
    { screen: 'about', name: 'About' },
  ];

  return (
    <ShellContext.Provider value={shell}>
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
          <div className="cb-menu-account">
            {player ? (
              <button type="button" className="cb-menu-item cb-menu-you" aria-label={`Logged in as ${player}`} onClick={() => go('leaderboard')}>
                <PersonIcon />
                <span className="cb-menu-item-name">{player}</span>
              </button>
            ) : (
              <button type="button" className="cb-btn cb-menu-login" onClick={() => go('leaderboard')}>
                <PersonIcon />
                Log in
              </button>
            )}
          </div>
          <nav aria-label="Modes">
            <ul className="cb-menu-list">
              {items.map((it) => (
                <li key={it.screen}>
                  <button
                    type="button"
                    className={`cb-menu-item${route.screen === it.screen ? ' on' : ''}`}
                    aria-current={route.screen === it.screen ? 'page' : undefined}
                    aria-describedby={`cb-menu-d-${it.screen.replace(':', '-')}`}
                    onClick={() => go(it.screen)}
                  >
                    {MENU_ICONS[it.screen]}
                    <span className="cb-menu-item-name">{it.name}</span>
                  </button>
                  <span id={`cb-menu-d-${it.screen.replace(':', '-')}`} hidden>
                    {it.blurb}
                  </span>
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
                    aria-label={it.screen === 'stats' && badgesNew ? 'Stats, a new badge' : undefined}
                    onClick={() => go(it.screen)}
                  >
                    {MENU_ICONS[it.screen]}
                    <span className="cb-menu-item-name">{it.name}</span>
                    {it.screen === 'stats' && badgesNew && <span className="cb-menu-dot" aria-hidden="true" />}
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
