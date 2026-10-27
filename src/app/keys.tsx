// The keys the play screen answers to, as Settings lists them for a device with a keyboard.
// Keep this list, the key handler in GameView.tsx, the tools' data-key and the README in step;
// GameView.test.tsx presses every key listed here.
import type { ReactNode } from 'react';

const ROWS: [keys: ReactNode, what: string][] = [
  [
    <>
      <kbd>1</kbd> to <kbd>9</kbd>
    </>,
    'Digit',
  ],
  [
    <>
      <kbd>Shift</kbd> and a digit
    </>,
    'Note',
  ],
  [<kbd>N</kbd>, 'Notes on or off'],
  [
    <>
      <kbd>E</kbd> or <kbd>Backspace</kbd>
    </>,
    'Erase',
  ],
  [<kbd>Z</kbd>, 'Undo'],
  [<kbd>Y</kbd>, 'Redo'],
  [<kbd>H</kbd>, 'Hint'],
  [<kbd>P</kbd>, 'Pause'],
  [
    <>
      Arrow keys or <kbd>WASD</kbd>
    </>,
    'Move',
  ],
  [<kbd>Esc</kbd>, 'Clear the selection'],
];

export function KeyList() {
  return (
    <dl className="cb-key-list">
      {ROWS.map(([keys, what]) => (
        <div key={what}>
          <dt>{keys}</dt>
          <dd>{what}</dd>
        </div>
      ))}
    </dl>
  );
}
