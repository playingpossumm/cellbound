// Motion that CSS cannot carry alone: a key that springs back, a number that bumps, a shake, a
// copy of some points flying to the score. Springs are sampled into keyframes for the Web
// Animations API, so they run on the compositor like the stylesheets' animations. Everything here
// does nothing with reduced motion (from the device or the setting, both on <html>) or where the
// browser has no element.animate, as in the unit tests. The timings are the Motion Lab's Lively.

export const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
export const EASE_IN_OUT = 'cubic-bezier(0.77, 0, 0.175, 1)';

/** True when the page may move: no reduced motion, and the Web Animations API is there. */
export function moves(): boolean {
  if (typeof document === 'undefined' || typeof Element === 'undefined' || typeof Element.prototype.animate !== 'function') return false;
  return document.documentElement.dataset.reducedMotion !== 'true';
}

/** A damped spring from `from` to `to`, sampled at 120 Hz, and how long it takes to settle. */
export function springValues(from: number, to: number, k: number, c: number, v0 = 0): { xs: number[]; ms: number } {
  const dt = 1 / 120;
  const tol = Math.max(0.0005, 0.001 * Math.abs(to - from));
  const xs = [from];
  let x = from;
  let v = v0;
  for (let i = 0; i < 360; i++) {
    v += (-k * (x - to) - c * v) * dt;
    x += v * dt;
    xs.push(x);
    if (i > 8 && Math.abs(x - to) < tol && Math.abs(v) < 0.02) break;
  }
  xs[xs.length - 1] = to;
  return { xs, ms: (xs.length - 1) * dt * 1000 };
}

/** Plays a spring on an element's transform, as at most 49 linear keyframes. */
export function spring(
  el: Element | null | undefined,
  from: number,
  to: number,
  fmt: (x: number) => string,
  k: number,
  c: number,
  v0 = 0,
  opts: KeyframeAnimationOptions = {},
): Animation | null {
  if (!el || !moves()) return null;
  const { xs, ms } = springValues(from, to, k, c, v0);
  const stride = Math.max(1, Math.ceil(xs.length / 48));
  const frames: Keyframe[] = [];
  for (let i = 0; i < xs.length; i += stride) frames.push({ transform: fmt(xs[i]) });
  frames.push({ transform: fmt(to) });
  return el.animate(frames, { duration: ms, easing: 'linear', ...opts });
}

export const scale = (s: number) => `scale(${s.toFixed(4)})`;

/** A quick swell and settle, for a number that just changed. */
export function bump(el: Element | null | undefined, amount = 0.1): void {
  spring(el, 1, 1, scale, 600, 20, amount * 40);
}

/** A sideways shake that dies away, of amp pixels at most. */
export function shake(el: Element | null | undefined, amp: number, ms = 320): void {
  if (!el || !moves() || amp < 0.3) return;
  const frames: Keyframe[] = [];
  for (let i = 0; i <= 18; i++) {
    const t = i / 18;
    const x = i === 18 ? 0 : amp * Math.exp(-3.5 * t) * Math.sin(t * Math.PI * 6);
    frames.push({ transform: `translateX(${x.toFixed(2)}px)` });
  }
  el.animate(frames, { duration: ms, easing: 'linear' });
}

/**
 * A title's letters, each its own span (see Letters in the Run's parts), shake loose: each drops
 * in from a tilt, one after another.
 */
export function shakeLoose(el: HTMLElement | null | undefined, o: { lift: number; tilt: number; k: number; c: number; gap: number; delay?: number }): void {
  if (!el) return;
  Array.from(el.children).forEach((ch, i) => {
    const side = i % 2 ? 1 : -1;
    spring(ch, 0, 1, (x) => `translateY(${(-o.lift * (1 - x)).toFixed(2)}px) rotate(${(side * o.tilt * (1 - x)).toFixed(2)}deg)`, o.k, o.c, 0, {
      delay: (o.delay ?? 0) + i * o.gap,
      fill: 'backwards',
    });
  });
}

const pressed = new WeakMap<Element, Animation>();

/** A key under the finger or the mouse: squashed to 94 percent in 80 ms. */
export function pressKey(el: Element): void {
  if (!moves()) return;
  pressed.get(el)?.cancel();
  pressed.set(el, el.animate([{ transform: 'none' }, { transform: 'translateY(1px) scale(0.94)' }], { duration: 80, easing: EASE_OUT, fill: 'forwards' }));
  // The release is heard on the window, so a key that the press disabled (the last digit of a
  // board) or that the finger slid off still springs back.
  const up = () => {
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    releaseKey(el);
  };
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

/** Lets a pressed key go: it springs back from 94 percent. */
export function releaseKey(el: Element): void {
  const down = pressed.get(el);
  if (!down) return;
  pressed.delete(el);
  down.cancel();
  spring(el, 0.94, 1, (s) => `translateY(${((1 - s) / 0.06).toFixed(2)}px) scale(${s.toFixed(4)})`, 700, 20);
}

/** Pointer handlers for a key: spread them on the button. Only the main button presses. */
export const PRESS = {
  onPointerDown(e: { button: number; currentTarget: Element }) {
    if (e.button === 0 && !(e.currentTarget as HTMLButtonElement).disabled) pressKey(e.currentTarget);
  },
  onPointerLeave(e: { currentTarget: Element }) {
    releaseKey(e.currentTarget);
  },
};

/**
 * Flies a copy of `text` from one element to another on an arc, shrinking as it goes, in a layer
 * over the whole page so nothing clips it. Resolves when it lands, at once without motion.
 */
export function fly(from: Element, to: Element, text: string, ms: number, className = ''): Promise<void> {
  if (!moves() || !from.isConnected || !to.isConnected) return Promise.resolve();
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  const cs = getComputedStyle(from);
  const ghost = document.createElement('span');
  ghost.className = `cb-fly${className ? ` ${className}` : ''}`;
  ghost.setAttribute('aria-hidden', 'true');
  ghost.textContent = text;
  ghost.style.fontSize = cs.fontSize;
  ghost.style.color = cs.color;
  document.body.appendChild(ghost);
  ghost.style.left = `${a.left + a.width / 2 - ghost.offsetWidth / 2}px`;
  ghost.style.top = `${a.top + a.height / 2 - ghost.offsetHeight / 2}px`;
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const arc = -(20 + Math.min(40, Math.abs(dx) * 0.2));
  const frames: Keyframe[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    frames.push({
      transform: `translate(${(dx * e).toFixed(1)}px, ${(dy * e + arc * 4 * t * (1 - t)).toFixed(1)}px) scale(${(1 - 0.3 * e).toFixed(3)})`,
      opacity: t < 0.85 ? 1 : (1 - t) / 0.15,
    });
  }
  const done = () => ghost.remove();
  return ghost.animate(frames, { duration: ms, easing: 'linear', fill: 'forwards' }).finished.then(done, done);
}
