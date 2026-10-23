import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/base.css';
import App from './app/App';
import { applyThemeNow } from './app/theme';
import { actions, getGame } from './game/store';

applyThemeNow();

// Development only: lets the e2e tests read the solution and drive the store.
if (import.meta.env.DEV) {
  (window as unknown as { __cellbound: unknown }).__cellbound = { actions, getGame };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
