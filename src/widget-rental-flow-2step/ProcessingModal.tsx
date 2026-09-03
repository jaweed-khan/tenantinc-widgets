// ===========================================================================
// "We're finalizing your lease & payment" — the lightbox shown after Pay Now.
// Figma: Mariposa — Duda, node 8509-35122.
//
// The Figma frame is one still: a green bar filled to roughly 25%. Nothing in a
// static frame says how it moves, so the animation is the deliberate addition —
// it's the whole point of the screen. It advances on a timer to `onDone`.
//
// NOT REAL PROGRESS, and it doesn't pretend to be. A bar that races to 90% and
// stalls is worse than no bar; this eases toward completion over `durationMs` and
// only reaches 100% when the flow actually finishes. Once there is a real payment
// call, drive `progress` from its stages instead.
//
// Deliberately NOT dismissable — no close button, Escape ignored. A payment is in
// flight; letting someone close the overlay invites a second submission.
//
// MOBILE is not a lightbox at all (Figma 8538-21871): the same content takes the
// whole page, white, with the logo centred at the top. A card floating over a
// dimmed page is a desktop idea; on a phone there is nothing left of the page to
// see around it, so the dim reads as a rendering fault.
//
// This is also the ONLY screen in the flow rendered through a portal — see the
// note at the return.
// ===========================================================================

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import storelocalLogo from '../widget-navigation-bar/Storelocal_logo.png';

/** How long the wrap-up runs before `onDone`, once there is nothing to wait for. */
const DEFAULT_DURATION_MS = 3200;
/** Bar refresh interval — 60ms is smooth without thrashing React. */
const TICK_MS = 60;
/**
 * While `waiting`, the bar eases toward this and stops.
 *
 * It must never reach 100% with a request still in flight: a full bar that then
 * sits there is the "raced to the end and stalled" pattern the header warns
 * about, and it reads as a hang rather than as work.
 */
const WAIT_CAP_PCT = 90;
/**
 * How long the bar takes to creep to the cap. Deliberately much longer than the
 * finish, so it is still moving through a slow call rather than parked.
 */
const WAIT_DURATION_MS = 15000;
/** Once the wait ends, the run from wherever the bar is to 100%. */
const FINISH_MS = 700;

export function ProcessingModal({
  open, firstName, facilityName, durationMs = DEFAULT_DURATION_MS, onDone, note, waiting = false,
  logoSrc = storelocalLogo,
}: {
  open: boolean;
  /**
   * The header's logo, so this screen shows the SAME brand as everything the
   * shopper has just been through.
   *
   * It used to import the bundled storelocal PNG and render that directly, so
   * an operator who set their own logo in the content panel got their brand all
   * the way to Pay Now and then storelocal on the screen after it — announced
   * as "storelocal storage" to a screen reader, too.
   *
   * The caller resolves the precedence (content-panel image, then a plain URL,
   * then the bundle); the default here is that same bundled file, so a caller
   * that passes nothing behaves exactly as before.
   */
  logoSrc?: string;
  /**
   * A request is still in flight, so do not finish.
   *
   * The modal opens the moment Pay Now is pressed rather than after the rental
   * returns — several seconds of a disabled button told the shopper nothing.
   * While this is true the bar creeps toward WAIT_CAP_PCT and `onDone` is never
   * called; when it goes false the bar completes and the flow moves on.
   */
  waiting?: boolean;
  /** Greeted by name in the heading, as the design shows ("John, we're …"). */
  firstName?: string;
  facilityName?: string;
  durationMs?: number;
  onDone?: () => void;
  /** Extra line under the copy — the demo banner on the prototype bridge. */
  note?: React.ReactNode;
}) {
  const [pct, setPct] = useState(0);
  /*
   * Everything the timer needs lives in refs, and the effect depends only on
   * things that should genuinely restart it.
   *
   * THE BAR USED TO JUMP BACK TO ZERO once a second. `onDone` was in the
   * dependency list and the caller passes an inline arrow, so it is a new
   * function on every render — and the parent re-renders every second because
   * the hold countdown ticks. Each of those tore the effect down and rebuilt
   * it, resetting the start time and, mid-wait, the bar with it.
   */
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  /** When the CURRENT phase began — not when the effect last happened to run. */
  const startedRef = useRef(0);
  /** Which phase that timestamp belongs to, so a re-run can tell it is the same one. */
  const phaseRef = useRef<'wait' | 'finish' | null>(null);
  /** Where the bar stood when the wait ended; the finish runs from there. */
  const handoffRef = useRef(0);
  /** Latest value, readable without making `pct` an effect dependency. */
  const pctRef = useRef(0);
  pctRef.current = pct;

  useEffect(() => {
    if (!open) {
      setPct(0);
      pctRef.current = 0;
      handoffRef.current = 0;
      phaseRef.current = null;
      return undefined;
    }

    const phase: 'wait' | 'finish' = waiting ? 'wait' : 'finish';
    // Only a genuine phase CHANGE restarts the clock. A re-render does not.
    if (phaseRef.current !== phase) {
      phaseRef.current = phase;
      startedRef.current = Date.now();
      if (phase === 'finish') handoffRef.current = pctRef.current;
    }

    /*
     * Two phases, one timer.
     *
     * WAITING: ease toward the cap over WAIT_DURATION_MS and stay there. onDone
     *   is never called, so nothing downstream fires while the request is out.
     * FINISHING: ease from wherever the bar reached to 100 over FINISH_MS, then
     *   onDone once.
     *
     * Ease-out in both, so it moves confidently at first and settles rather
     * than crawling linearly — it reads as "working", not "stuck".
     */
    const from = phase === 'wait' ? 0 : handoffRef.current;
    const span = phase === 'wait'
      ? WAIT_DURATION_MS
      // Straight to finish with no wait behind it is the preview path, which
      // keeps its original full-length animation.
      : (from > 0 ? FINISH_MS : durationMs);
    const target = phase === 'wait' ? WAIT_CAP_PCT : 100;
    let fired = false;

    const id = window.setInterval(() => {
      const t = Math.min(1, (Date.now() - startedRef.current) / span);
      const eased = 1 - (1 - t) ** 2;
      const next = from + (target - from) * eased;
      // MONOTONIC. Whatever else happens, the bar never goes backwards — that
      // is the one thing a progress bar must not do.
      setPct((cur) => (next > cur ? next : cur));
      if (phase === 'finish' && t >= 1 && !fired) {
        fired = true;
        window.clearInterval(id);
        onDoneRef.current?.();
      }
    }, TICK_MS);

    // Scroll lock only — no Escape handler, on purpose (see the header note).
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearInterval(id);
      document.body.style.overflow = prev;
    };
    // onDone is deliberately absent: it is read through a ref. Including it
    // restarts this effect on every parent render, which is the bug above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, durationMs, waiting]);

  if (!open) return null;

  const shown = Math.round(pct);

  const greeting = firstName?.trim();

  const screen = (
    <div className="rf-overlay rf-overlay--solid rf-overlay--proc" role="presentation">
      <div className="rf-proc" role="dialog" aria-modal="true" aria-labelledby="rf-proc-title">
        {/* Mobile only, via CSS — the desktop lightbox floats over a page that
            still shows the sticky header's logo behind it. */}
        {/* alt is EMPTY on purpose: this is decorative here — the heading
            beside it already names the facility — and the old hardcoded
            "storelocal storage" would announce the wrong brand on any site that
            sets its own logo. */}
        <img className="rf-proc-logo" src={logoSrc} alt="" />
        <h2 className="rf-proc-title" id="rf-proc-title">
          {greeting && <span className="rf-proc-name">{greeting}, </span>}
          we&rsquo;re finalizing your lease &amp; payment
        </h2>

        <div
          className="rf-proc-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={shown}
          aria-label="Finalizing your lease and payment"
        >
          <div className="rf-proc-bar-fill" style={{ width: `${shown}%` }} />
        </div>

        <p className="rf-proc-copy">
          Thank you for choosing {facilityName || 'Storelocal Storage'}.<br />
          Please sit tight as we wrap up your payment.
        </p>

        {note}
      </div>
    </div>
  );

  // Portalled to <body>. .rf-wrapper is `container-type: inline-size`, which
  // implies `contain: layout` and therefore makes the wrapper the containing
  // block for `position: fixed` children — so an overlay left inside it pins to
  // the WIDGET, not the viewport, and a full-page take-over would start
  // wherever the widget starts rather than at the top of the screen.
  return typeof document !== 'undefined' && document.body
    ? createPortal(screen, document.body)
    : screen;
}
