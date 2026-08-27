// ===========================================================================
// Sliding carousel — index state, drag-to-follow, and a windowed dot count.
//
// Replaces the slice-and-swap pattern every carousel in this repo used to share
// (`items.slice(page * per, …)` re-rendered into a static grid). That was an
// instant cut with nothing to animate: the cards never moved, they were simply
// replaced. Here the whole strip is rendered once and a single transform moves
// it, so the browser has something real to tween.
//
// Three things this owns, because each one was reimplemented (or missing) per
// widget:
//
//  • Step-by-one paging with clamped bounds, so arrows can be `disabled` at the
//    ends rather than silently doing nothing.
//  • Drag that FOLLOWS the finger and snaps on release. @shared/useSwipe only
//    classifies a finished gesture, so mid-drag there was no movement at all —
//    the card jumped after the fact. Both still exist: useSwipe is right for
//    things that only need "which way did they flick" (a lightbox).
//  • A dot WINDOW. 20 posts must not mean 20 dots.
//
// The hook is transport-agnostic: it returns an offset in *percent of one step*,
// so the consumer decides how wide a step is (a third of the row on desktop, the
// full width on mobile) without this file knowing anything about layout.
// ===========================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** Most dots on screen at once; the window slides past this many items. */
export const MAX_DOTS = 6;

/** Minimum horizontal travel before a drag counts as a drag and not a tap. */
const DRAG_MIN_PX = 8;

/** Fraction of a step that must be dragged to advance on release. */
const SNAP_RATIO = 0.25;

export interface UseCarouselOptions {
  /** Total items in the strip. */
  count: number;
  /** How many are visible at once (3 on the desktop grid, 1 on mobile). */
  perView?: number;
  /** Enable finger-follow dragging. Off for pointer-only desktop rails. */
  draggable?: boolean;
}

export interface CarouselApi {
  /** Current index — the first visible item. Always within bounds. */
  index: number;
  /** Highest reachable index, i.e. `count - perView` floored at 0. */
  maxIndex: number;
  /** Jump to an index (dot click). Clamped. */
  goTo: (i: number) => void;
  next: () => void;
  prev: () => void;
  canPrev: boolean;
  canNext: boolean;
  /**
   * How far the strip is currently pushed, in percent of ONE STEP. Combine with
   * the step width the consumer owns:
   *   `transform: translateX(calc(${offsetPct}% / perView))` for a flex track
   *   whose children are `100 / perView` percent wide.
   */
  offsetPct: number;
  /** True while a finger is down and moving — suppress the CSS transition. */
  dragging: boolean;
  /** Spread onto the moving track. Empty object when `draggable` is false. */
  handlers: React.HTMLAttributes<HTMLElement>;
  /**
   * True for the click that ends a drag. A drag finishes with a click on the
   * card underneath it, which would otherwise navigate to that blog post.
   */
  didDrag: React.MutableRefObject<boolean>;
  /** Wrap a click handler so it no-ops on the click that ends a drag. */
  ignoreAfterDrag: (fn: () => void) => () => void;
}

export function useCarousel({ count, perView = 1, draggable = false }: UseCarouselOptions): CarouselApi {
  const [index, setIndex] = useState(0);
  const [dragPct, setDragPct] = useState(0);
  const [dragging, setDragging] = useState(false);

  const maxIndex = Math.max(0, count - perView);

  // Clamp on render rather than correcting in an effect: a collection that
  // shrinks between reads must never leave us parked past the end for a frame.
  const safeIndex = Math.min(index, maxIndex);

  const goTo = useCallback((i: number) => {
    setIndex(Math.max(0, Math.min(maxIndex, i)));
  }, [maxIndex]);

  const next = useCallback(() => goTo(safeIndex + 1), [goTo, safeIndex]);
  const prev = useCallback(() => goTo(safeIndex - 1), [goTo, safeIndex]);

  // ── Drag ────────────────────────────────────────────────────────────────
  // Tracked in refs, not state: these update on every touchmove and none of
  // them should cost a render on their own. Only `dragPct` does.
  const start = useRef<{ x: number; y: number } | null>(null);
  const stepPx = useRef(1);
  /** null until the axis is decided; then true = horizontal (we own the drag). */
  const axis = useRef<boolean | null>(null);
  const didDrag = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY };
    axis.current = null;
    didDrag.current = false;
    // Measure the step from the live element — the consumer's CSS owns the
    // width, so reading it here keeps this file out of the layout business.
    const el = e.currentTarget as HTMLElement;
    stepPx.current = Math.max(1, el.getBoundingClientRect().width / perView);
  }, [perView]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const from = start.current;
    if (!from) return;
    const t = e.touches[0];
    const dx = t.clientX - from.x;
    const dy = t.clientY - from.y;

    // Decide the axis ONCE, on the first move that clears the tap threshold.
    // Re-deciding mid-gesture makes a diagonal drag flicker between scrolling
    // the page and moving the carousel.
    if (axis.current === null) {
      if (Math.abs(dx) < DRAG_MIN_PX && Math.abs(dy) < DRAG_MIN_PX) return;
      axis.current = Math.abs(dx) > Math.abs(dy);
    }
    // A vertical drag is the user scrolling the page. Leave it entirely alone.
    if (!axis.current) return;

    didDrag.current = true;
    if (!dragging) setDragging(true);

    let moved = dx / stepPx.current;
    // Rubber-band past the ends instead of stopping dead: a strip that refuses
    // to move reads as broken, one that resists reads as "nothing that way".
    if ((safeIndex === 0 && moved > 0) || (safeIndex === maxIndex && moved < 0)) {
      moved *= 0.35;
    }
    setDragPct(moved * 100);
  }, [dragging, maxIndex, safeIndex]);

  const onTouchEnd = useCallback(() => {
    start.current = null;
    const moved = dragPct / 100;
    setDragPct(0);
    setDragging(false);
    if (axis.current !== true) return;
    // One step per gesture, however far they flung it — the arrows move by one
    // and the swipe must agree, or the dots mean two different things.
    if (moved <= -SNAP_RATIO) goTo(safeIndex + 1);
    else if (moved >= SNAP_RATIO) goTo(safeIndex - 1);
  }, [dragPct, goTo, safeIndex]);

  const ignoreAfterDrag = useCallback((fn: () => void) => () => {
    if (didDrag.current) { didDrag.current = false; return; }
    fn();
  }, []);

  const handlers = useMemo(
    () => (draggable ? { onTouchStart, onTouchMove, onTouchEnd } : {}),
    [draggable, onTouchStart, onTouchMove, onTouchEnd],
  );

  return {
    index: safeIndex,
    maxIndex,
    goTo,
    next,
    prev,
    canPrev: safeIndex > 0,
    canNext: safeIndex < maxIndex,
    offsetPct: -safeIndex * 100 + dragPct,
    dragging,
    handlers,
    didDrag,
    ignoreAfterDrag,
  };
}

/**
 * Which dots to render when there are more positions than `max`.
 *
 * Returns the visible slice plus flags for whether it is clipped at either end,
 * so a consumer can shrink the edge dots and imply "there's more this way".
 * The window only moves once the active dot reaches its edge — a window that
 * re-centres on every step makes the dots slide while the cards do too, and the
 * reader loses track of which thing is moving.
 */
export function dotWindow(total: number, active: number, max: number = MAX_DOTS) {
  if (total <= max) return { start: 0, end: total, clippedStart: false, clippedEnd: false };

  // Keep one dot of lookahead on each side where possible, so the active dot is
  // never flush against the edge unless it truly is the first/last item.
  const half = Math.floor((max - 1) / 2);
  let start = active - half;
  if (start < 0) start = 0;
  if (start > total - max) start = total - max;

  return {
    start,
    end: start + max,
    clippedStart: start > 0,
    clippedEnd: start + max < total,
  };
}

/** True when the visitor has asked for less motion — skip the slide entirely. */
export function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    setReduce(mq.matches);
    const onChange = () => setReduce(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  return reduce;
}
