import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/base.css';
import App from './app/App';
import { applyThemeNow } from './app/theme';
import { candidates } from './engine';
import { actions, getGame } from './game/store';

applyThemeNow();

// Development only: lets the e2e tests read the solution, drive the store, and find a cell that
// logic proves (candidates), so a test can play the way a player would.
if (import.meta.env.DEV) {
  (window as unknown as { __cellbound: unknown }).__cellbound = { actions, getGame, candidates };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
