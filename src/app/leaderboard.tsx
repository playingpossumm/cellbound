// The leaderboard: today's Daily by time, today's Daily Run by score, the best run and the longest
// Daily streak, for everyone who plays. A device joins with a name and a 4-digit PIN; the same name
// and PIN on another device bring the player's history and scores along (src/sync/account.ts).
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { dailyDate } from '../engine';
import { formatTime } from '../game/logic';
import { fetchBoards, joinLeaderboard, LeaderboardError, syncLeaderboard, useAccount } from '../sync/account';
import type { BoardKind, BoardRow, Boards } from '../sync/rules';
import { HintIcon } from './icons';
import { Page } from './screens';

const TABS: [BoardKind, string][] = [
  ['daily', 'Daily'],
  ['drun', 'Daily run'],
  ['best', 'Best run'],
  ['streak', 'Streak'],
];

/** 1250 becomes "1,250", whatever the device's language. */
const score = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function valueOf(kind: BoardKind, v: number): string {
  if (kind === 'daily') return formatTime(v);
  if (kind === 'streak') return `${v} ${v === 1 ? 'day' : 'days'}`;
  return score(v);
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

export function LeaderboardScreen() {
  const token = useAccount((s) => s.token);
  return (
    <Page title="Leaderboard" back>
      {token ? <BoardView /> : <JoinForm />}
    </Page>
  );
}

function JoinForm() {
  const [name, setName] = useState(() => useAccount.getState().name ?? '');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await joinLeaderboard(name, pin);
    } catch (err) {
      setError(err instanceof LeaderboardError ? err.message : 'The leaderboard could not be reached.');
      setBusy(false);
    }
  };
  return (
    <form className="cb-form cb-join" onSubmit={submit} aria-describedby="cb-join-d">
      <label className="cb-field">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={16} autoComplete="nickname" autoCapitalize="words" spellCheck={false} required />
      </label>
      <label className="cb-field">
        <span>PIN</span>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          autoComplete="off"
          required
        />
      </label>
      <p id="cb-join-d" hidden>
        Choose a name and a 4-digit PIN. The same name and PIN on another device bring your scores and history with you.
      </p>
      {error && (
        <p className="cb-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="cb-btn primary cb-join-go" disabled={busy}>
        Join
      </button>
    </form>
  );
}

function BoardView() {
  const [kind, setKind] = useState<BoardKind>('daily');
  const [data, setData] = useState<Boards | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      // This device's latest results go up first, so its own rows are current.
      await syncLeaderboard();
      setData(await fetchBoards(dailyDate()));
    } catch (e) {
      setError(e instanceof LeaderboardError ? e.message : 'The leaderboard could not be reached.');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const rows = data?.[kind] ?? [];
  return (
    <>
      <div className="cb-seg cb-lb-tabs" role="tablist" aria-label="Boards">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" id={`cb-lb-tab-${k}`} aria-selected={kind === k} aria-controls="cb-lb-panel" className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
            {label}
          </button>
        ))}
      </div>
      <div id="cb-lb-panel" role="tabpanel" aria-labelledby={`cb-lb-tab-${kind}`}>
        {error ? (
          <div className="cb-lb-note">
            <p className="cb-error" role="alert">
              {error}
            </p>
            <button type="button" className="cb-btn" onClick={() => void load()}>
              Try again
            </button>
          </div>
        ) : !data ? (
          <p className="cb-spinner cb-lb-wait" role="status">
            <span className="cb-sr">Loading the leaderboard</span>
          </p>
        ) : rows.length === 0 ? (
          <p className="cb-muted cb-lb-note">No one yet.</p>
        ) : (
          <ol className="cb-lb">
            {rows.map((r, i) => (
              <Row key={`${r.rank}:${r.name}`} kind={kind} row={r} apart={i > 0 && r.rank > rows[i - 1].rank + 1} />
            ))}
          </ol>
        )}
      </div>
    </>
  );
}

function Row({ kind, row, apart }: { kind: BoardKind; row: BoardRow; apart: boolean }) {
  const marks = kind === 'daily' && (row.mistakes || row.hints);
  return (
    <li className={`cb-lb-row${row.you ? ' is-you' : ''}${apart ? ' is-apart' : ''}`} aria-current={row.you ? 'true' : undefined}>
      <span className="cb-lb-rank">{row.rank}</span>
      <span className="cb-lb-name">{row.name}</span>
      {marks ? (
        <span className="cb-lb-marks" aria-label={[row.mistakes ? plural(row.mistakes, 'mistake') : '', row.hints ? plural(row.hints, 'hint') : ''].filter(Boolean).join(', ')}>
          {row.mistakes ? <span aria-hidden="true">×{row.mistakes}</span> : null}
          {row.hints ? (
            <span aria-hidden="true">
              <HintIcon />
              {row.hints}
            </span>
          ) : null}
        </span>
      ) : null}
      <span className="cb-lb-value">{valueOf(kind, row.value)}</span>
    </li>
  );
}
