// The Learn screen: the lesson list, one lesson at a time, and its practice puzzle.
import { useEffect, useLayoutEffect, useState, type ComponentType, type KeyboardEvent, type ReactNode } from 'react';
import { GameView, type GameViewProps } from '../../app/GameView';
import { TopBar } from '../../app/TopBar';
import { startGame, useGame } from '../../game/store';
import { BackIcon, CheckIcon, ChevronIcon } from '../run/ui/icons';
import { useScreenEntry } from '../screenEntry';
import './learn.css';
import { LESSONS, lessonById, practicePuzzle, type LessonId } from './lessons';
import { MiniBoard } from './MiniBoard';
import { markLessonDone, peekLessonRequest, takeLessonRequest, useLearnStore } from './store';

type View = { name: 'list' } | { name: 'lesson'; id: LessonId; step: number } | { name: 'practice'; id: LessonId };

export interface LearnAppProps {
  onExit: () => void;
  /** Lets a preview swap in a different play surface. The app passes nothing. */
  GameViewComponent?: ComponentType<GameViewProps>;
}

/** A Learn page: the app's top bar (menu and back), then the page. */
function Page({ title, onBack, backLabel, children }: { title?: string; onBack: () => void; backLabel?: string; children: ReactNode }) {
  const ref = useScreenEntry<HTMLElement>();
  return (
    <div className="cb-learn">
      <TopBar title="Learn" quietTitle={title === 'Learn'} onBack={onBack} backLabel={backLabel} />
      <main className="cb-learn-page" ref={ref} tabIndex={-1}>
        {title && <h1 className="cb-learn-title">{title}</h1>}
        {children}
      </main>
    </div>
  );
}

export function LearnApp({ onExit, GameViewComponent = GameView }: LearnAppProps) {
  const done = useLearnStore((s) => s.done);
  const request = useLearnStore((s) => s.request);
  // Peek, do not take: React may call this initialiser twice, and the effect below clears the request.
  const [view, setView] = useState<View>(() => {
    const id = peekLessonRequest();
    return id ? { name: 'lesson', id, step: 0 } : { name: 'list' };
  });

  // A request waiting when this screen opened, or one that arrives while it is open.
  useEffect(() => {
    if (!request) return;
    const id = takeLessonRequest();
    if (id) setView({ name: 'lesson', id, step: 0 });
  }, [request]);

  if (view.name === 'list') {
    return <LessonList done={done} onExit={onExit} onOpen={(id) => setView({ name: 'lesson', id, step: 0 })} />;
  }
  if (view.name === 'lesson') {
    return (
      <LessonView
        id={view.id}
        step={view.step}
        done={done[view.id] !== undefined}
        onStep={(step) => setView({ name: 'lesson', id: view.id, step })}
        onList={() => setView({ name: 'list' })}
        onPractice={() => setView({ name: 'practice', id: view.id })}
      />
    );
  }
  return (
    <Practice
      id={view.id}
      GameViewComponent={GameViewComponent}
      onLesson={() => setView({ name: 'lesson', id: view.id, step: 0 })}
      onList={() => setView({ name: 'list' })}
      onNext={(id) => setView({ name: 'lesson', id, step: 0 })}
    />
  );
}

/**
 * The lessons in order. A finished one carries a tick and the next one stands out, so the list
 * shows where the player is without saying it. Each rule's text waits in its lesson.
 */
function LessonList({ done, onExit, onOpen }: { done: Partial<Record<LessonId, number>>; onExit: () => void; onOpen: (id: LessonId) => void }) {
  const next = LESSONS.find((l) => done[l.id] === undefined)?.id;
  return (
    <Page title="Learn" onBack={onExit}>
      <ol className="cb-learn-list">
        {LESSONS.map((l, k) => {
          const isDone = done[l.id] !== undefined;
          return (
            <li key={l.id}>
              <button
                type="button"
                className={'cb-learn-row' + (isDone ? ' is-done' : '') + (l.id === next ? ' is-next' : '')}
                aria-describedby={isDone || l.id === next ? `cb-learn-s-${l.id}` : undefined}
                onClick={() => onOpen(l.id)}
              >
                <span className="cb-learn-num" aria-hidden="true">
                  {k + 1}
                </span>
                <span className="cb-learn-row-title">{l.title}</span>
                <span className="cb-learn-status" aria-hidden="true">
                  {isDone ? <CheckIcon className="cb-learn-status-icon" /> : <ChevronIcon className="cb-learn-status-icon" />}
                </span>
                {(isDone || l.id === next) && (
                  <span id={`cb-learn-s-${l.id}`} hidden>
                    {isDone ? 'Done' : 'Next'}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </Page>
  );
}

function LessonView(p: {
  id: LessonId;
  step: number;
  done: boolean;
  onStep: (n: number) => void;
  onList: () => void;
  onPractice: () => void;
}) {
  const lesson = lessonById(p.id);
  const last = p.step >= lesson.steps.length - 1;
  const step = lesson.steps[Math.min(p.step, lesson.steps.length - 1)];
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' && !last) p.onStep(p.step + 1);
    if (e.key === 'ArrowLeft' && p.step > 0) p.onStep(p.step - 1);
  };
  return (
    <Page onBack={p.onList} backLabel="All lessons">
      <div className="cb-learn-lesson" onKeyDown={onKey}>
        <h1 className="cb-learn-title">
          {lesson.title}
          {p.done && (
            <span className="cb-learn-title-done">
              <CheckIcon className="cb-learn-status-icon" />
              <span className="cb-learn-visually-hidden">, done</span>
            </span>
          )}
        </h1>
        <p className="cb-learn-rule">{lesson.rule}</p>
        <figure className="cb-learn-figure">
          <MiniBoard art={step.art} />
        </figure>
        <p className="cb-learn-step-text" aria-live="polite">
          {step.text}
        </p>
        <ol className="cb-learn-steps" aria-label="Steps">
          {lesson.steps.map((_, k) => (
            <li key={k} className={'cb-learn-step' + (k === p.step ? ' is-on' : k < p.step ? ' is-past' : '')} aria-current={k === p.step ? 'step' : undefined}>
              <span className="cb-learn-visually-hidden">
                Step {k + 1} of {lesson.steps.length}
              </span>
            </li>
          ))}
        </ol>
        <div className="cb-learn-actions">
          <button type="button" className="cb-learn-btn" disabled={p.step === 0} onClick={() => p.onStep(p.step - 1)}>
            Back
          </button>
          {last ? (
            <button type="button" className="cb-learn-btn is-primary" onClick={p.onPractice} autoFocus>
              {p.done ? 'Practice again' : 'Practice puzzle'}
            </button>
          ) : (
            <>
              <button type="button" className="cb-learn-btn is-primary" onClick={() => p.onStep(p.step + 1)}>
                Next
              </button>
              <button type="button" className="cb-learn-btn is-quiet" onClick={p.onPractice}>
                Skip to practice
              </button>
            </>
          )}
        </div>
      </div>
    </Page>
  );
}

function Practice(p: {
  id: LessonId;
  GameViewComponent: ComponentType<GameViewProps>;
  onLesson: () => void;
  onList: () => void;
  onNext: (id: LessonId) => void;
}) {
  const lesson = lessonById(p.id);
  const game = useGame();
  // A new key each time, so practising again always starts from the givens.
  const [key] = useState(() => `learn:${p.id}:${Date.now().toString(36)}`);
  const current = game && game.key === key ? game : null;

  // Start the puzzle, and start it again if the shell closes the game while this screen stays open.
  // The same key resumes the saved game, so nothing is lost.
  const missing = current === null;
  useEffect(() => {
    if (missing) startGame({ key, mode: 'learn', puzzle: practicePuzzle(p.id) });
  }, [missing, key, p.id]);

  useLayoutEffect(() => {
    if (current?.status === 'solved') markLessonDone(p.id);
  }, [current?.status, p.id]);

  if (!current) {
    return (
      <Page onBack={p.onLesson}>
        <p className="cb-learn-lead" role="status">
          Setting up the practice puzzle.
        </p>
      </Page>
    );
  }
  const following = LESSONS[LESSONS.findIndex((l) => l.id === p.id) + 1];
  const GameViewComponent = p.GameViewComponent;
  return (
    <GameViewComponent
      game={current}
      title="Learn"
      subtitle="Practice"
      onExit={p.onLesson}
      extra={
        <div className="cb-learn-extra">
          <button type="button" className="cb-learn-btn is-small" onClick={p.onLesson}>
            <BackIcon className="cb-learn-btn-icon" />
            {lesson.title}
          </button>
        </div>
      }
      endPanel={
        current.status === 'solved' ? (
          <section className="cb-learn-panel" aria-labelledby="cb-learn-panel-h">
            <h2 id="cb-learn-panel-h" className="cb-learn-panel-title">
              Lesson complete
            </h2>
            <div className="cb-learn-actions">
              {following && (
                <button type="button" className="cb-learn-btn is-primary" onClick={() => p.onNext(following.id)} autoFocus aria-label={`Next lesson, ${following.title}`}>
                  {following.title}
                  <ChevronIcon className="cb-learn-btn-icon" />
                </button>
              )}
              <button type="button" className={'cb-learn-btn' + (following ? '' : ' is-primary')} onClick={p.onList}>
                All lessons
              </button>
            </div>
          </section>
        ) : undefined
      }
    />
  );
}
