// ===========================================================================
// Windowed pagination dots.
//
// Every carousel in this repo rendered one dot per position, which is fine for
// 3 pages and unusable for 20 items once the arrows step by one. This caps the
// row at MAX_DOTS and slides the window instead.
//
// It takes a `className` prefix rather than owning any styling, because each
// widget already has its own dot CSS (.blog-dot, .nl-dot, .sl-nb2-dot …) and
// this is meant to drop into all of them without a restyle.
// ===========================================================================

import { dotWindow, MAX_DOTS } from './useCarousel';

export interface CarouselDotsProps {
  /** Number of positions, i.e. `maxIndex + 1`. */
  count: number;
  active: number;
  onPick: (i: number) => void;
  /** Existing dot class for this widget, e.g. `blog-dot`. */
  dotClass: string;
  /** Appended to the active dot. Defaults to the repo-wide `active`. */
  activeClass?: string;
  max?: number;
  /** Announced label per dot; `{n}` is replaced with the 1-based position. */
  label?: string;
}

export function CarouselDots({
  count,
  active,
  onPick,
  dotClass,
  activeClass = 'active',
  max = MAX_DOTS,
  label = 'Go to item {n}',
}: CarouselDotsProps) {
  const { start, end, clippedStart, clippedEnd } = dotWindow(count, active, max);

  return (
    <>
      {Array.from({ length: end - start }).map((_, n) => {
        const i = start + n;
        // The dot at a clipped edge shrinks, so the row reads as a window onto a
        // longer list rather than the whole list. Scale (not width) keeps every
        // dot on the same 16px pitch — the strip's height is reserved in CSS and
        // must not change as the window moves.
        const isEdge =
          (clippedStart && n === 0) || (clippedEnd && n === end - start - 1);
        return (
          <button
            key={i}
            className={`${dotClass}${i === active ? ` ${activeClass}` : ''}`}
            style={isEdge ? { transform: 'scale(0.6)' } : undefined}
            onClick={() => onPick(i)}
            aria-label={label.replace('{n}', String(i + 1))}
            aria-current={i === active ? 'true' : undefined}
          />
        );
      })}
    </>
  );
}
