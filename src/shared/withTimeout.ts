// ===========================================================================
// Wall-clock guards for the boundaries that can hang
//
// Every widget's data path is a chain of `await`s, and the ones that leave the
// page — `dmAPI`, `fetch`, `navigator.geolocation` — have NO inherent upper
// bound. A rejection is handled everywhere in this repo (readCollection returns
// `[]`, #07's effect catches and falls back to demo cards); a promise that
// simply never settles is not, and it is the strictly worse failure:
//
//   • The widget never leaves its loading state. #07 sits on skeleton cards for
//     the life of the page — the reported "it doesn't load, and sometimes not
//     even on refresh".
//   • `internalProperties.ts` and `propertyImages.ts` cache the PROMISE, not the
//     result. One hung read is therefore joined by every later caller on the
//     page, so a single stall becomes permanent and page-wide.
//   • It is timing-dependent, which is why it comes and goes across reloads and
//     looks like a different bug each time.
//
// So the rule these helpers encode: anything that leaves the page gets a wall
// clock, and running out of it is just another failure — the SAME fallback the
// error path already takes. Never a new error state.
//
// A "wall clock" specifically, because the API-provided timeouts do not cover
// the case that actually bites. See `getUserLocation`: Geolocation's own
// `timeout` option does not start until the permission prompt is ANSWERED, so a
// prompt the visitor ignores never fires either callback.
// ===========================================================================

/**
 * `work`, or `fallback` if it hasn't settled within `ms`.
 *
 * Resolves rather than rejects on expiry: every caller here already has a
 * fallback for failure, and turning a stall into that same fallback keeps the
 * timeout from introducing a code path nobody handles.
 *
 * A rejection from `work` still propagates — this bounds the WAIT, it does not
 * swallow errors. Wrap in try/catch as before where that matters.
 *
 * The loser of the race is NOT cancelled: promises have no cancellation, so the
 * underlying request keeps running and is simply ignored. That is fine for the
 * reads it guards (all idempotent), and where the work itself is cancellable —
 * `fetch` — use `timeoutSignal` instead so the request is actually aborted.
 */
export function withTimeout<T>(
  work: Promise<T>,
  ms: number,
  fallback: T,
  label?: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (label) {
        // Worth a line: the fallback is indistinguishable from a legitimate
        // empty answer, so without this a stall looks like "there is no data"
        // rather than "we gave up waiting for it".
        // eslint-disable-next-line no-console
        console.warn(`[withTimeout] ${label} did not answer within ${ms}ms — using the fallback`);
      }
      resolve(fallback);
    }, ms);
    work.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * An `AbortSignal` that fires after `ms`, for `fetch`.
 *
 * Preferred over `withTimeout` for a request, because it actually ABORTS it —
 * the connection is released and the caller's `catch` runs, instead of a dead
 * request being left in flight while we pretend it failed.
 *
 * `AbortSignal.timeout()` is the one-liner for this but is too new to rely on
 * here (the bundles run on whatever browser a customer's visitor brings), so
 * this is the controller spelled out. Returns `undefined` where
 * `AbortController` is missing, which `fetch` accepts as "no signal" — the old
 * unbounded behaviour, only on browsers that predate the fix.
 */
export function timeoutSignal(ms: number): AbortSignal | undefined {
  if (typeof AbortController === 'undefined') return undefined;
  const controller = new AbortController();
  // Aborting a request that has already completed is a no-op, so there is
  // nothing to unsubscribe — the timer fires once and the controller is then
  // garbage along with the signal.
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

/** How long each kind of boundary gets. Named so the numbers are reviewable. */
export const TIMEOUTS = {
  /** A `dmAPI` collection read. Local to the page, so a slow one is a stall. */
  collection: 8000,
  /** One REST round trip to the Hummingbird API. */
  request: 12000,
  /**
   * Geolocation, measured as a WALL CLOCK from the ask — so it covers the
   * permission prompt, which the API's own `timeout` option does not. Long
   * enough for a visitor to read the prompt and click, short enough that a
   * prompt left sitting doesn't hold the widget on skeletons.
   */
  geolocation: 8000,
} as const;
