// ===========================================================================
// Duda Collections — client-side READ
//
// Published widgets can read any of the site's collections straight from the
// page via the read-only Collections JS API (`window.dmAPI`). No credentials
// are involved: the API is implicitly scoped to the site it's running on, and
// the data is public by construction (it renders on a public website).
// WRITES are a different story — they need Partner API credentials and have to
// go through a server-side proxy (see accordion-sync.php).
//
// Everything here fails SOFT: outside Duda `window.dmAPI` is simply undefined,
// so callers get an empty array and fall back to their own defaults rather
// than throwing into render.
//
// Extracted from widget-space-list/accordionConfigApi.ts once a second widget
// (blogs listing) needed it. The envelope/field-shape tolerance below is
// hard-won — the API has been seen to return rows several different ways.
//
// VERIFIED on site d0aa72e3 (published page, 2026-07-28). `.get()` resolves to:
//   { name: "BlogPosts", values: [ …rows… ], fields: null, filters: [],
//     language: null, search: null, sortBy: [],
//     page: { pageSize: 100, pageNumber: 0, totalPages: 1 } }
// Two things that matter:
//  • rows are on `.values` (handled below);
//  • `pageSize` is 100 — a collection may hold up to 1000 items, so a single
//    get() is NOT guaranteed to be the whole collection. Fine for small
//    collections; anything that could exceed 100 rows needs to walk `page`.
//
// `window.dmAPI` is PUBLISHED-SITE ONLY — it is undefined in the Duda editor,
// so callers must have something sensible to show there (see BlogsListing,
// which falls back to demo posts).
// ===========================================================================

import { withTimeout, TIMEOUTS } from './withTimeout';

/** Minimal shape of the bits of the Collections JS API we touch. The real API
 *  also exposes .where()/.orderBy()/limits, which we don't rely on. */
interface DmCollectionQuery {
  get(): Promise<unknown>;
}
interface DmCollectionsAPI {
  data(collectionName: string): DmCollectionQuery;
}
interface DmAPILike {
  loadCollectionsAPI?: () => Promise<DmCollectionsAPI>;
}

export type CollectionRow = Record<string, unknown>;

function getDmAPI(): DmAPILike | null {
  const w = window as unknown as { dmAPI?: DmAPILike };
  return w.dmAPI ?? null;
}

/** True when the Collections JS API is available (i.e. we're inside Duda). */
export function hasCollectionsApi(): boolean {
  return !!getDmAPI()?.loadCollectionsAPI;
}

/** Pull a rows array out of whatever envelope the JS API returns. */
function extractRows(res: unknown): CollectionRow[] {
  if (Array.isArray(res)) return res as CollectionRow[];
  if (res && typeof res === 'object') {
    const obj = res as Record<string, unknown>;
    const arr = obj.values ?? obj.data ?? obj.rows;
    if (Array.isArray(arr)) return arr as CollectionRow[];
  }
  return [];
}

/**
 * Rows may arrive flat ({title,…}) or nested under a `data` key
 * ({id, data:{title,…}}) depending on the API surface. Flatten to the fields,
 * keeping the row-level id reachable as `__rowId` for callers that need it.
 */
function flattenRow(row: CollectionRow): CollectionRow {
  const nested = row.data && typeof row.data === 'object' && !Array.isArray(row.data)
    ? (row.data as CollectionRow)
    : null;
  if (!nested) return row;
  return { ...nested, __rowId: row.id };
}

// ── Waiting for the API, rather than checking once ──────────────────────────

/** How long to keep looking for `dmAPI` before concluding it isn't coming. */
const API_WAIT_MS = 1500;
const API_POLL_MS = 100;

let apiWait: Promise<boolean> | null = null;

/**
 * True once `dmAPI.loadCollectionsAPI` exists, false after ~1.5s of it not.
 *
 * ── WHY POLL, WHEN `hasCollectionsApi()` ANSWERS IMMEDIATELY ────────────────
 * `dmAPI` is injected by the published page's own scripts, and an external-app
 * widget can mount before they have run. A single synchronous check is therefore
 * a RACE, and losing it is silent and expensive: `readCollection` returns `[]`,
 * so #07 decides `PropertiesInternal` is empty, falls through `Properties` to the
 * keyed REST call — which on this site is a DIFFERENT company (see CLAUDE.md) —
 * and renders another company's facilities, or none. Reload and the timing
 * changes, which is exactly the "sometimes it works" report.
 *
 * `@shared/sitePages` already reached this conclusion and polls for 5s; this is
 * the same fix for the collections surface.
 *
 * SHORT on purpose, where sitePages can afford 5s. The footer paints its fallback
 * immediately and swaps later, so waiting costs it nothing; a collection read
 * blocks its caller's first paint, and in the Duda editor and the dev harness
 * `dmAPI` is never coming — so every read there pays this in full before falling
 * back to REST. 1.5s is the compromise: comfortably longer than a script-ordering
 * race, short enough to be unremarkable in the editor.
 *
 * Cached page-wide, so the several widgets on a page share ONE wait rather than
 * each polling their own.
 *
 * `hasCollectionsApi()` is deliberately NOT changed. It is the SYNCHRONOUS gate
 * several widgets use to decide whether to show demo data (#02's location tree
 * and star ratings, #13's demo locations), and those need an answer during
 * render. Making it async, or making it wait, would change what the editor shows
 * in a way this fix has no business touching.
 */
function waitForCollectionsApi(): Promise<boolean> {
  if (getDmAPI()?.loadCollectionsAPI) return Promise.resolve(true);
  if (apiWait) return apiWait;
  apiWait = new Promise<boolean>((resolve) => {
    const deadline = Date.now() + API_WAIT_MS;
    const tick = () => {
      if (getDmAPI()?.loadCollectionsAPI) return resolve(true);
      if (Date.now() >= deadline) {
        logSource('shared', 'collections API', false, `no dmAPI after ${API_WAIT_MS}ms — Duda editor, dev harness, or an older site`);
        return resolve(false);
      }
      setTimeout(tick, API_POLL_MS);
    };
    tick();
  });
  return apiWait;
}

/**
 * Read every row of a collection by name (case-sensitive — it's the lookup key).
 * Returns [] on ANY failure: not in Duda, no dmAPI, collection absent, network
 * error, or the read not answering at all. Never throws.
 *
 * ── THE TIMEOUT IS NOT BELT-AND-BRACES ──────────────────────────────────────
 * "Never throws" was already true; "always settles" was not, and that is the
 * failure that hurts. `loadCollectionsAPI()` and `.get()` are promises handed
 * over by the page's own scripts, and nothing here bounded them — so a read
 * that never answered left this promise pending for the life of the page.
 *
 * Which would be one slow widget, except that `internalProperties.ts` and
 * `propertyImages.ts` cache the PROMISE rather than the result, deliberately, so
 * every widget on the page shares one request. A single hung read is therefore
 * joined by every later caller and never resolves for any of them: #07 sits on
 * skeleton cards, #13's locations panel never appears, #03's hero photo never
 * arrives. Timing-dependent, so it comes and goes between reloads.
 *
 * Expiry lands on the same `[]` every other failure here does, so it introduces
 * no path a caller doesn't already handle — it just means a stall degrades like
 * a missing collection instead of hanging.
 */
export async function readCollection(collectionName: string): Promise<CollectionRow[]> {
  try {
    // Waits rather than checking once — see waitForCollectionsApi.
    if (!(await waitForCollectionsApi())) return [];
    const dmAPI = getDmAPI();
    if (!dmAPI?.loadCollectionsAPI) return [];
    // Bounded as ONE operation, not two: the budget is for answering the read,
    // and splitting it would let a slow `loadCollectionsAPI()` spend the whole
    // allowance and still leave `.get()` its own.
    return await withTimeout(
      (async () => {
        const collections = await dmAPI.loadCollectionsAPI!();
        const res = await collections.data(collectionName).get();
        return extractRows(res).map(flattenRow);
      })(),
      TIMEOUTS.collection,
      [] as CollectionRow[],
      `dmAPI read of "${collectionName}"`,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[dudaCollections] read of "${collectionName}" failed`, err);
    return [];
  }
}

// ── Field coercion helpers ───────────────────────────────────────────────────
// Collection values are loosely typed: text columns can arrive as numbers,
// image columns as either a URL string or an object wrapping one.

/** Trimmed string, or '' for null/undefined/non-scalar. */
export function str(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

/**
 * NATIVE collections return every column as a string — `rating: "4.8"`,
 * `active: "true"`, `length: "5"` — so numbers and booleans need coercing.
 * (External collections like Properties give real types; these are no-ops there.)
 */
export function num(v: unknown, fallback = 0): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;
  const n = parseFloat(str(v));
  return Number.isFinite(n) ? n : fallback;
}

export function bool(v: unknown, fallback = false): boolean {
  if (typeof v === 'boolean') return v;
  const s = str(v).toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'no') return false;
  return fallback;
}

/**
 * One-line trace of where a widget's data actually came from, so it's obvious in
 * the console whether a collection was used or the fallback kicked in.
 *   [collections] #09 google reviews ← collection (GoogleReviews, 5 rows)
 *   [collections] #09 google reviews ← fallback (no dmAPI — not in Duda)
 */
export function logSource(widget: string, what: string, fromCollection: boolean, detail = ''): void {
  const via = fromCollection ? 'collection' : 'fallback';
  // eslint-disable-next-line no-console
  console.info(`[collections] ${widget} ${what} ← ${via}${detail ? ` (${detail})` : ''}`);
}

/**
 * Flatten a rich-text column to plain text.
 *
 * Duda's rich-text columns return HTML, not text — an `authorName` of
 * "StoreLocal" arrives as `<p class="rteBlock">StoreLocal</p>` (verified on site
 * d0aa72e3). Rendering that raw would print the markup, so anything destined for
 * a text node has to come through here.
 *
 * Parsed via DOMParser rather than a regex so entities decode correctly; a
 * document parsed this way has no browsing context, so nothing in it executes.
 */
export function plainText(v: unknown): string {
  const s = str(v);
  // Nothing to do for values with no markup or entities.
  if (!s || !/[<&]/.test(s)) return s;
  try {
    const doc = new DOMParser().parseFromString(s, 'text/html');
    return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
  } catch {
    return s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }
}

/**
 * Coax an image column OR a content-menu image field into a URL.
 *
 * Duda hands images over in several shapes: a plain string, and objects keyed
 * `url` / `src` / `path` — plus **`image`**, which is what a content-menu image
 * input and the "Other Images" list actually use (`[{ image: url }, …]`). That key
 * was missing here, so an image picked in the content menu coerced to '' and the
 * widget silently fell back to its bundled default.
 */
export function imageUrl(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    for (const k of ['image', 'url', 'src', 'href', 'path', 'original']) {
      const hit = o[k];
      if (typeof hit === 'string' && hit.trim()) return hit.trim();
    }
  }
  return '';
}

/** Parse a collection date (ISO, epoch ms/seconds, or a display string). */
export function parseDate(v: unknown): Date | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    // Heuristic: seconds-since-epoch values are ~10 digits, ms ~13.
    const ms = v < 1e12 ? v * 1000 : v;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = str(v);
  if (!s) return null;
  const numeric = /^\d+$/.test(s) ? Number(s) : NaN;
  if (!Number.isNaN(numeric)) return parseDate(numeric);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
