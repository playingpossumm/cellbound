// The Collection: every lens and card, locked ones with how to open them, and the technique
// codex with each technique's placements and best single placement.
import { useState } from 'react';
import { TECHNIQUES, type TechniqueId } from '../../../engine/techniques';
import { TIER_NAMES } from '../items';
import { LENSES } from '../lenses';
import type { UnlockId } from '../model';
import { REWARDS } from '../rewards';
import { formatScore } from '../state';
import { MARKS } from '../tuning';
import { milestoneOf, unlockedSet, type RunStats } from '../stats';
import { LockIcon } from './icons';
import { CardBody, cardClass, LensCard, Page, TierDot } from './parts';

type Tab = 'lenses' | 'cards' | 'codex';
const TABS: [Tab, string][] = [
  ['lenses', 'Lenses'],
  ['cards', 'Cards'],
  ['codex', 'Codex'],
];

function Locked({ id, stats }: { id: UnlockId; stats: RunStats }) {
  const m = milestoneOf(id);
  return (
    <span className="cb-run-lock">
      <LockIcon className="cb-run-lock-icon" />
      <span>
        {m.how}{' '}
        <span className="cb-run-dim">
          {Math.min(m.goal, m.progress(stats))} of {m.goal}
        </span>
      </span>
    </span>
  );
}

export function Collection({ stats, onBack }: { stats: RunStats; onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('lenses');
  const open = unlockedSet(stats);
  const byTier = new Map<number, TechniqueId[]>();
  for (const [id, t] of Object.entries(TECHNIQUES) as [TechniqueId, { tier: number }][]) {
    if (t.tier === 0) continue;
    byTier.set(t.tier, [...(byTier.get(t.tier) ?? []), id]);
  }
  return (
    <Page title="Collection" onBack={onBack}>
      <div className="cb-run-tabs" role="tablist" aria-label="Collection">
        {TABS.map(([id, name]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`cb-run-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`cb-run-panel-${id}`}
            className={`cb-run-tab${tab === id ? ' is-on' : ''}`}
            onClick={() => setTab(id)}
          >
            {name}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`cb-run-panel-${tab}`} aria-labelledby={`cb-run-tab-${tab}`}>
        {tab === 'lenses' && (
          <ul className="cb-run-grid">
            {LENSES.map((l) => {
              const locked = !!l.unlock && !open.has(l.unlock);
              return (
                <li key={l.id} className={locked ? 'is-locked' : ''}>
                  <LensCard def={l}>{locked && l.unlock && <Locked id={l.unlock} stats={stats} />}</LensCard>
                </li>
              );
            })}
          </ul>
        )}
        {tab === 'cards' && (
          <ul className="cb-run-grid">
            {REWARDS.map((r) => {
              const locked = !!r.unlock && !open.has(r.unlock);
              return (
                <li key={r.id} className={locked ? 'is-locked' : ''}>
                  <div className={cardClass(r.id) + ' is-tile'}>
                    <CardBody id={r.id} />
                    {locked && r.unlock && <Locked id={r.unlock} stats={stats} />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {tab === 'codex' && (
          <div className="cb-run-codex">
            {stats.best && (
              <p className="cb-run-best">
                <TierDot tier={TECHNIQUES[stats.best.technique].tier} />
                <span>{TECHNIQUES[stats.best.technique].name}</span>
                <strong>{formatScore(stats.best.points)}</strong>
                <span className="cb-run-sr">is your best placement</span>
              </p>
            )}
            <table className="cb-run-codex-table">
              <caption className="cb-run-sr">Techniques by tier</caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="cb-run-sr">Technique</span>
                  </th>
                  <th scope="col" className="is-num">
                    Placed
                  </th>
                  <th scope="col" className="is-num">
                    Best
                  </th>
                </tr>
              </thead>
              {[...byTier.entries()].map(([tier, ids]) => (
                <tbody key={tier} className={`cb-run-codex-tier cb-run-t${tier}`}>
                  <tr>
                    <th scope="colgroup" colSpan={3} className="cb-run-codex-h">
                      <TierDot tier={tier} />
                      {TIER_NAMES[tier]}
                      <span className="cb-run-codex-marks">{MARKS[tier]} marks</span>
                    </th>
                  </tr>
                  {ids.map((id) => {
                    const c = stats.codex[id];
                    return (
                      <tr key={id} className={c?.n ? '' : 'is-unseen'}>
                        <th scope="row">{TECHNIQUES[id].name}</th>
                        <td className="is-num">{c?.n ?? 0}</td>
                        <td className="is-num">{c?.n ? formatScore(c.best) : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>
        )}
      </div>
    </Page>
  );
}
