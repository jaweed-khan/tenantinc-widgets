// ---------------------------------------------------------------------------
// Google Maps JavaScript API loader.
//
// WHY THIS EXISTS, GIVEN WE ALREADY HAVE MAPS
//
// #03's map and @shared/NearbyMap both use the keyless `output=embed` iframe.
// That is the right call for NearbyMap — its price pins are projected on top,
// so the iframe is deliberately pointer-events:none to stop panning drifting
// them out of alignment.
//
// But an iframe map REQUIRES TWO FINGERS TO PAN on a touch device. One finger
// scrolls the page. That behaviour lives inside Google's frame and no CSS of
// ours can reach it, which is why "grab and move the map" could not be fixed
// without changing approach. `gestureHandling: 'greedy'` on a real map instance
// is the switch that makes one finger pan, and it only exists on the JS API.
//
// THE KEY IS BROWSER-VISIBLE, AND THAT IS NORMAL
//
// The Maps JS API runs in the page and authenticates from the page, so its key
// cannot be proxied — tenant-proxy hides GOOGLE_API_KEY for Places precisely
// because that one can be billed by anyone who sees it. This must therefore be
// a SEPARATE key, restricted by HTTP referrer to the site's domains, where
// being public is the intended design. Never reuse the proxy's key here.
//
// Fails soft: no key, a blocked script, a CSP refusal — all resolve to null and
// the caller keeps its iframe, which still pans on desktop.
// ---------------------------------------------------------------------------

/** Minimal surface we use — typing the whole API would be noise. */
export interface GMapsApi {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => GMap;
  Marker: new (opts: Record<string, unknown>) => GMarker;
  LatLng: new (lat: number, lng: number) => unknown;
}

export interface GMap {
  setCenter(pos: { lat: number; lng: number }): void;
  setZoom(z: number): void;
  getZoom(): number | undefined;
  panTo(pos: { lat: number; lng: number }): void;
  /** Live centre — what an overlay must reproject against as the map moves. */
  getCenter(): { lat(): number; lng(): number } | null | undefined;
  addListener(event: string, handler: () => void): { remove?: () => void };
}

/** Only what a draggable pin needs. `addListener` returns a remover. */
export interface GMarker {
  setPosition(pos: { lat: number; lng: number }): void;
  getPosition(): { lat(): number; lng(): number } | null | undefined;
  setMap(map: GMap | null): void;
  addListener(event: string, handler: () => void): { remove?: () => void };
}

declare global {
  interface Window {
    google?: { maps?: GMapsApi };
    [k: string]: unknown;
  }
}

/**
 * One load per page however many widgets ask — the API throws on a second.
 *
 * Deliberately NOT keyed by apiKey: a page can only ever host one Maps API, so
 * if two widgets somehow resolved different keys the second could not have its
 * own instance anyway. First key wins, which is the only thing that can happen.
 */
let loader: Promise<GMapsApi | null> | null = null;

/**
 * One config fetch per PROXY BASE.
 *
 * Keyed rather than a single slot: #03 takes a `mapsProxyBase` binding while
 * NearbyMap's callers fall back to the shared default, so two widgets on one
 * property page can legitimately ask different servers. A single cached promise
 * meant whichever mounted first won and the other silently read its key from
 * the wrong proxy — or, if the first had no base at all, never fetched again.
 */
const keyFetches = new Map<string, Promise<string>>();

/**
 * The browser key, from the proxy rather than the bundle.
 *
 * The Maps JS API authenticates from the page, so this key cannot be hidden —
 * but it need not be HARDCODED. Serving it from /api/maps/config keeps it out
 * of the widget bundle, the Duda JS tab and the dev harness, and means rotating
 * it takes no rebuild. What actually protects it is the HTTP referrer
 * restriction on the key itself.
 *
 * Returns '' on anything unexpected, which the caller treats as "no key" and
 * falls back to the keyless embed.
 */
export function fetchMapsKey(proxyBase: string): Promise<string> {
  // Normalise BEFORE the cache lookup, so a trailing slash cannot open a
  // second request to the same server.
  const base = (proxyBase || '').replace(/\/$/, '');
  if (!base) return Promise.resolve('');
  const cached = keyFetches.get(base);
  if (cached) return cached;
  const pending = fetch(`${base}/api/maps/config`, { headers: { Accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { enabled?: boolean; key?: string; reason?: string } | null) => {
      // The proxy refuses to serve the server-side key and says why; surface
      // that rather than silently falling back and leaving nobody the wiser.
      if (j?.reason) console.warn('[googleMaps]', j.reason);
      return j?.enabled && typeof j.key === 'string' ? j.key : '';
    })
    .catch(() => '');
  keyFetches.set(base, pending);
  return pending;
}

export function loadGoogleMaps(apiKey: string): Promise<GMapsApi | null> {
  if (loader) return loader;

  const key = (apiKey ?? '').trim();
  if (!key) return Promise.resolve(null);

  loader = new Promise<GMapsApi | null>((resolve) => {
    if (typeof document === 'undefined') { resolve(null); return; }
    // Another widget — or the host page — may already have it.
    if (window.google?.maps) { resolve(window.google.maps); return; }

    /*
     * A uniquely named global callback rather than the `load` event: the script
     * resolves further modules after it executes, so `load` can fire before
     * `google.maps` is usable. The name is random so two widgets initialising
     * together cannot overwrite each other's.
     */
    const cbName = `__gmapsReady_${Math.random().toString(36).slice(2)}`;
    let timer = 0;
    /*
     * Settles exactly once. `delete window[cbName]` is what the stop below
     * tests, so a late callback after a timeout — or a timeout after a
     * callback — cannot resolve a second time. The timer is cleared too: the
     * script is long-lived and an orphaned 8s handle would keep a closure over
     * this promise alive for no reason.
     */
    const done = (api: GMapsApi | null) => {
      if (!window[cbName]) return;
      delete window[cbName];
      if (timer) window.clearTimeout(timer);
      resolve(api);
    };
    window[cbName] = () => done(window.google?.maps ?? null);

    const tag = document.createElement('script');
    tag.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=${cbName}&loading=async`;
    tag.async = true;
    tag.addEventListener('error', () => {
      console.warn('[googleMaps] the Maps JS API could not be loaded — keeping the embedded map.');
      done(null);
    });
    document.head.appendChild(tag);

    /*
     * A stop, because `error` does not fire for every failure: a key rejected
     * for referrer restrictions loads the script and then complains in the
     * console without ever calling back. Without this the caller would wait for
     * a map that is never coming.
     */
    timer = window.setTimeout(() => {
      /*
       * `window.google.maps` EXISTING is not the same as it being usable: with
       * `loading=async` the namespace appears before its modules resolve, and
       * the callback is the only signal that `Map` is really there. Handing
       * back a half-built namespace would throw inside `new api.Map(...)` in
       * the caller instead of falling back, so this hands back null unless the
       * constructor we actually use is present.
       */
      const api = window.google?.maps;
      done(typeof api?.Map === 'function' ? api : null);
    }, 8000);
  });

  return loader;
}
