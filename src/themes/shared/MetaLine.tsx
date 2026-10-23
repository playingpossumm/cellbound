// A small line under a band's title: items on one line with a separator between them. When they
// do not fit, they stack with no separators, so a separator is never left at the end of a line.
import { Fragment, useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export function MetaLine({ className, sepClass, items }: { className: string; sepClass: string; items: string[] }): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const key = items.join('|');
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const parent = el.parentElement;
    // What the answer depends on: the room the line has and the number of lines it takes.
    const shape = () => `${parent?.clientWidth ?? 0}:${el.offsetHeight}`;
    let seen = '';
    const fit = () => {
      el.classList.remove('is-stacked');
      const first = el.firstElementChild as HTMLElement | null;
      const last = el.lastElementChild as HTMLElement | null;
      if (first && last && last.offsetTop > first.offsetTop + 2) el.classList.add('is-stacked');
      seen = shape();
    };
    fit();
    // The text is first laid out in a fallback font, and the real one, when it arrives, makes the
    // line wider with no change to the band's width. So the font is asked for here, and the line
    // is fitted again when the request is answered.
    let alive = true;
    const cs = getComputedStyle(el);
    const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    void document.fonts?.load(font, el.textContent ?? '').then(
      () => alive && fit(),
      () => undefined,
    );
    // The line's own height is watched too, for any other late change. The work waits for the next
    // frame, so that stacking the line, which changes the band's height, raises no ResizeObserver loop.
    let frame = 0;
    const later = () => {
      if (shape() === seen) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    };
    const watch = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(later);
    watch?.observe(el);
    if (parent) watch?.observe(parent);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      watch?.disconnect();
    };
  }, [key]);
  return (
    <div className={className} ref={ref}>
      {items.map((text, i) => (
        <Fragment key={i}>
          {i > 0 && <span className={sepClass} aria-hidden="true" />}
          <span>{text}</span>
        </Fragment>
      ))}
    </div>
  );
}
