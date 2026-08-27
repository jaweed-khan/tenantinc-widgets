// ===========================================================================
// Duda site page tree — client-side READ (`dmAPI.getNavItemsAsync()`)
//
// The site's own route structure, straight off the page. This is a DIFFERENT
// dmAPI surface from `loadCollectionsAPI()` (see dudaCollections.ts): no
// collection is involved, it is the navigation tree the site editor builds by
// dragging pages around in the Pages panel.
//
// Verified against Duda's docs (developer.duda.co "Live Site JS Reference"):
//
//   dmAPI.getNavItemsAsync() -> Promise<NavItem[]>
//   NavItem = { title, alias, uuid, path, visible, subNav: NavItem[] }
//
//   title    page name as it appears in navigation
//   alias    unique internal page identifier; correlates with the URL path
//   uuid     internal id, for Partner API calls
//   path     RELATIVE url path to the page
//   visible  in the navigation menu — "correlates to the hide page feature in
//            the page settings" — and RESPECTIVE TO THE DEVICE, so the same page
//            can be visible: false on desktop and true on mobile
//   subNav   nested children, up to two levels (three layers of page in total)
//
// `getNavItems()` (synchronous, `inNavigation` instead of `visible`, no `uuid`)
// is the deprecated predecessor and Duda says it will be removed "to improve
// performance". Read below only as a fallback, and never preferred.
//
// HIDDEN PAGES ARE INCLUDED, AND THAT IS THE DEFAULT ON PURPOSE. Verified
// against the docs: a page hidden from the nav is still RETURNED, flagged
// `visible: false`, and a hidden-but-published page stays reachable by its
// direct URL. A footer link column is precisely where an operator puts the pages
// they deliberately kept OUT of the top nav — ten legal and about pages do not
// belong in a nav bar — so filtering them out is what makes a correctly built
// route come back looking empty. `skipHidden` opts back in to nav visibility.
//
// FAILS SOFT, ALWAYS — same contract as every other dmAPI reader here. No
// dmAPI (the Duda editor and the dev harness), no getNavItems*, a throw inside
// it, a tree with nothing matching: callers get `[]` / `null` and keep their own
// defaults. Nothing in here may throw into render.
//
// IT ALSO WAITS FOR THE API. `dmAPI` is injected by the page's own scripts, and
// a widget can mount before that has happened — a single synchronous check would
// then fall back permanently on a site where the tree was about to be readable,
// which looks exactly like "the page structure isn't being read". See
// `waitForNavApi`.
//
// THREE LEVELS IS A HARD CEILING. Duda supports at most three layers of page,
// so a "route" here is one or two segments deep — `/company-information` or
// `/company-information/legal`. Deeper structure has to be a dynamic page,
// which brings the caveat below.
//
// DYNAMIC PAGES ARE ONE ENTRY, NOT ONE PER ROW. A collection-driven page
// (`/storage-units/<slug>`, #02's and #07's property pages) appears in this tree
// as the single TEMPLATE page. The tree cannot enumerate the rows behind it —
// that is what `@shared/propertyNav` reads the `Properties` collection for.
// So this module lists STATIC pages an editor created; it is not a sitemap of
// every URL the site serves.
// ===========================================================================

import { logSource } from './dudaCollections';

/** One page in the site's route structure, normalised. */
export interface SitePage {
  /** Page name as it appears in navigation. */
  title: string;
  /** Root-relative href, always with exactly one leading slash. */
  path: string;
  /** Duda's internal page alias (its stable identifier). */
  alias: string;
  /** Duda's page uuid, when the API supplied one (absent on the legacy call). */
  uuid: string;
  /** False when the page is hidden from navigation ON THIS DEVICE. */
  visible: boolean;
  /** Nested pages, in the editor's own order. */
  children: SitePage[];
}

// ── The raw API shape (both generations of it) ───────────────────────────────

interface RawNavItem {
  title?: unknown;
  alias?: unknown;
  uuid?: unknown;
  path?: unknown;
  /** getNavItemsAsync */
  visible?: unknown;
  /** getNavItems (deprecated) */
  inNavigation?: unknown;
  subNav?: unknown;
}

interface DmNavAPI {
  getNavItemsAsync?: () => Promise<unknown>;
  getNavItems?: () => unknown;
}

function getDmAPI(): DmNavAPI | null {
  const w = window as unknown as { dmAPI?: DmNavAPI };
  return w.dmAPI ?? null;
}

/** True when the page tree is readable, i.e. we're on a Duda page that has it. */
export function hasSitePagesApi(): boolean {
  const dm = getDmAPI();
  return !!(dm?.getNavItemsAsync || dm?.getNavItems);
}

// ── Normalising ─────────────────────────────────────────────────────────────

function text(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Duda hands back a RELATIVE path (`company-information/sms-terms`), and an
 * `<a href>` without a leading slash resolves against the CURRENT page — so on
 * `/storage-units/california/…` the footer's links would point at
 * `/storage-units/california/company-information/…` and 404. One leading slash,
 * always.
 *
 * A path that already looks absolute (an external link parked in the nav) is
 * left exactly as it is.
 */
function normalizePath(v: unknown): string {
  const raw = text(v);
  if (!raw) return '';
  if (/^([a-z][a-z0-9+.-]*:)?\/\//i.test(raw) || raw.startsWith('mailto:') || raw.startsWith('tel:')) return raw;
  const trimmed = raw.replace(/^\/+/, '').replace(/\/+$/, '');
  return `/${trimmed}`;
}

/**
 * The two calls disagree on the visibility field — `visible` on the async one,
 * `inNavigation` on the deprecated one — and a MISSING field must mean visible,
 * not hidden. Defaulting the other way would empty the column on any site whose
 * dmAPI returns neither key.
 */
function isVisible(item: RawNavItem): boolean {
  if (typeof item.visible === 'boolean') return item.visible;
  if (typeof item.inNavigation === 'boolean') return item.inNavigation;
  return true;
}

function toSitePage(item: RawNavItem): SitePage | null {
  const title = text(item.title);
  const path = normalizePath(item.path);
  const alias = text(item.alias);
  // A row with neither a path nor an alias cannot be linked or matched, so it is
  // not a page as far as this module is concerned.
  if (!path && !alias) return null;
  return {
    title,
    path,
    alias,
    uuid: text(item.uuid),
    visible: isVisible(item),
    children: toSitePages(item.subNav),
  };
}

function toSitePages(v: unknown): SitePage[] {
  if (!Array.isArray(v)) return [];
  return (v as RawNavItem[])
    .map((item) => (item && typeof item === 'object' ? toSitePage(item) : null))
    .filter((p): p is SitePage => p !== null);
}

// ── Reading ─────────────────────────────────────────────────────────────────

/** How long to keep looking for the API before concluding it isn't coming. */
const WAIT_TIMEOUT_MS = 5000;
const WAIT_POLL_MS = 150;

const sleep = (ms: number) => new Promise<void>((r) => { setTimeout(r, ms); });

/**
 * `window.dmAPI` once it can answer a nav query, or null after ~5s.
 *
 * WHY POLL AT ALL. dmAPI is injected by the published page's own scripts and an
 * external-app widget can mount before they have run, so a single check at mount
 * is a race: lose it and the footer falls back FOREVER on a site where the tree
 * was a few hundred milliseconds away. That failure is indistinguishable from
 * "the widget doesn't read the page structure", which is the whole reason this
 * wait exists rather than a one-shot read.
 *
 * Costs nothing where the API is genuinely absent (the Duda editor, the dev
 * harness): callers render their fallback from the first paint and only the
 * console line arrives late.
 */
async function waitForNavApi(): Promise<DmNavAPI | null> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  for (;;) {
    const dm = getDmAPI();
    if (dm?.getNavItemsAsync || dm?.getNavItems) return dm;
    if (Date.now() >= deadline) return null;
    await sleep(WAIT_POLL_MS);
  }
}

/** One read attempt against an API known to expose a nav call. */
async function readOnce(dm: DmNavAPI): Promise<SitePage[]> {
  const raw = dm.getNavItemsAsync ? await dm.getNavItemsAsync() : dm.getNavItems?.();
  return toSitePages(raw);
}

/**
 * The site's page tree, normalised. `[]` on ANY failure — no dmAPI, no
 * getNavItems*, a rejection, a shape we don't recognise.
 *
 * Not promise-cached the way `companySource`/`internalProperties` are: this is
 * a local call against data already on the page, not a network round trip, and
 * one footer per page reads it once. Cache it here if a second widget starts
 * calling it on the same page.
 */
export async function readSitePages(widgetTag: string): Promise<SitePage[]> {
  const dm = await waitForNavApi();
  if (!dm) {
    logSource(widgetTag, 'site pages', false, `no dmAPI.getNavItems* after ${WAIT_TIMEOUT_MS}ms — Duda editor, dev harness, or an older site`);
    return [];
  }
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  for (;;) {
    try {
      const pages = await readOnce(dm);
      if (pages.length) {
        logSource(widgetTag, 'site pages', true, `${pages.length} top-level pages`);
        return pages;
      }
      // An EMPTY tree is not a real state for a published site — every site has
      // at least a home page — so treat it as "the API answered before the page
      // list was populated" and ask again rather than pinning every consumer to
      // its fallback for the life of the page.
      if (Date.now() >= deadline) {
        logSource(widgetTag, 'site pages', false, 'dmAPI returned no pages');
        return [];
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[sitePages] getNavItems failed', err);
      return [];
    }
    await sleep(WAIT_POLL_MS);
  }
}

// ── Finding a branch ────────────────────────────────────────────────────────

/**
 * Slug form used for every comparison, so an operator can name the route the way
 * they think of it: `company-information`, `/company-information/`,
 * `Company Information` and `company information` all reduce to the same key.
 * Slashes fold to hyphens too, which is what lets a two-segment route
 * (`company-information/legal`) match a two-segment path.
 */
function slug(v: string): string {
  return v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The page's STRUCTURAL identities — what Duda actually calls it. An alias, its
 * full path, and its last path segment all come from the site's routing, so a
 * match on one of these means the route names this page in the URL sense.
 */
function routeKeys(page: SitePage): string[] {
  const keys = [slug(page.alias), slug(page.path)];
  // The last path segment, so `/company-information` is findable as the leaf of
  // a nested path too.
  const tail = page.path.split('/').filter(Boolean).pop();
  if (tail) keys.push(slug(tail));
  return keys.filter(Boolean);
}

/**
 * The page's DISPLAY name. Matched only as a fallback — see `findSitePage`.
 */
function titleKey(page: SitePage): string {
  return slug(page.title);
}

/**
 * The page a route names, or null.
 *
 * BREADTH-FIRST on purpose: a top-level `/company-information` must win over a
 * same-named child parked under some other section, otherwise which branch the
 * footer renders would depend on the editor's page ORDER.
 *
 * ── STRUCTURE FIRST, TITLE ONLY AS A FALLBACK ───────────────────────────────
 * These used to be one pass over alias + path + tail + TITLE together, and the
 * title being equal to the rest is how a route can resolve to a branch the
 * operator never meant. Delete the `/legal-pages` section but leave any page
 * anywhere in the tree still TITLED "Legal Pages", and the old single pass
 * matched that page breadth-first and listed all of ITS children — which reads
 * exactly like "the deleted pages are still cached in the footer", because the
 * rows come back with the same labels the deleted section had.
 *
 * Two passes fix it without giving up the convenience: a route that names a real
 * path always wins, and a title match is only reached when nothing in the site's
 * routing answers to that name at all. A title-only match is `console.warn`ed,
 * because it is a guess and it is the case worth knowing about.
 */
export function findSitePage(pages: SitePage[], route: string): SitePage | null {
  const want = slug(route);
  if (!want) return null;

  const breadthFirst = (match: (page: SitePage) => boolean): SitePage | null => {
    let level = pages;
    while (level.length) {
      for (const page of level) {
        if (match(page)) return page;
      }
      level = level.flatMap((p) => p.children);
    }
    return null;
  };

  const structural = breadthFirst((page) => routeKeys(page).includes(want));
  if (structural) return structural;

  const byTitle = breadthFirst((page) => titleKey(page) === want);
  if (byTitle) {
    // eslint-disable-next-line no-console
    console.warn(
      `[sitePages] no page has the path or alias "${route}" — matched the page TITLED `
      + `"${byTitle.title}" (${byTitle.path}) instead. If that section was deleted, this `
      + `is a different page answering to its name; set the route to a real path.`,
    );
  }
  return byTitle;
}

export interface PageLinkOptions {
  /**
   * Drop pages the editor has hidden from navigation. **Default false — hidden
   * pages ARE listed.**
   *
   * This default is the load-bearing one. Duda returns a hidden page flagged
   * `visible: false`, and it stays reachable by its direct URL; an operator
   * building `/company-information` with ten legal and about pages under it will
   * almost certainly keep them OUT of the top nav, because that is what a footer
   * column is for. Filtering on nav visibility therefore makes a correctly built
   * route come back EMPTY, which reads as the reader being broken.
   *
   * `visible` is also respective to the DEVICE — the same page can be false on
   * desktop and true on mobile — so filtering on it would additionally make the
   * column differ between devices. Pass true only to mirror the nav exactly.
   */
  skipHidden?: boolean;
}

/**
 * A branch's descendants, flattened depth-first into the order the editor
 * arranged them — a footer column is a flat list, and Duda's third page level
 * has nowhere to go in it. The branch page ITSELF is not included; it is the
 * column heading.
 */
export function descendantPages(branch: SitePage, opts: PageLinkOptions = {}): SitePage[] {
  const out: SitePage[] = [];
  const walk = (pages: SitePage[]): void => {
    for (const page of pages) {
      if (opts.skipHidden && !page.visible) continue;
      out.push(page);
      walk(page.children);
    }
  };
  walk(branch.children);
  return out;
}

export interface PageColumn {
  /** The first matched branch's own title — the column heading. */
  heading: string;
  /** Every linkable page under the matched routes, de-duplicated by href. */
  links: { label: string; href: string }[];
  /** Routes that matched a branch with at least one linkable page under it. */
  matched: string[];
  /** Routes that are not in the tree, or whose branch has nothing linkable. */
  missing: string[];
}

/**
 * Split a route FIELD into routes. A Duda content-menu field is one text input,
 * so several routes have to share it — comma separated
 * (`company-information, legal-pages`). Order is the operator's: it decides
 * which branch supplies the heading and which pages come first.
 *
 * Duplicates are dropped here; overlapping BRANCHES are handled by the href
 * de-duplication in `pageColumnFor` (a `legal-pages` branch nested under
 * `company-information` is matched by both routes and must not list twice).
 */
export function parseRoutes(v: string | string[] | undefined | null): string[] {
  const raw = Array.isArray(v) ? v : String(v ?? '').split(/[,\n]/);
  const out: string[] = [];
  for (const r of raw) {
    const route = String(r ?? '').trim();
    if (route && !out.includes(route)) out.push(route);
  }
  return out;
}

/**
 * The footer-ready form: one column's worth of `{ label, href }` gathered from
 * EVERY route in `routes`, in the order given, plus the heading to print above
 * them.
 *
 * `links` is empty when no route matched. That is a real answer, not a failure:
 * the caller renders NO COLUMN rather than a hardcoded stand-in, because a
 * placeholder list is indistinguishable from a working one and its links go
 * nowhere on a deployed site. `matched`/`missing` are what a caller warns with.
 */
export function pageColumnFor(
  pages: SitePage[],
  routes: string | string[],
  opts: PageLinkOptions = {},
): PageColumn {
  const links: { label: string; href: string }[] = [];
  const seen = new Set<string>();
  const matched: string[] = [];
  const missing: string[] = [];
  let heading = '';

  for (const route of parseRoutes(routes)) {
    const branch = findSitePage(pages, route);
    const found = branch
      ? descendantPages(branch, opts)
        // No path means nothing to link to; a label with no destination is
        // worse than one fewer row.
        .filter((p) => p.path)
        .map((p) => ({
          label: p.title || p.path.split('/').filter(Boolean).pop() || p.path,
          href: p.path,
        }))
      : [];
    if (!found.length) {
      missing.push(route);
      continue;
    }
    matched.push(route);
    if (!heading) heading = branch!.title || route;
    for (const link of found) {
      // Two routes can name overlapping branches — most obviously a
      // `legal-pages` section that lives UNDER `company-information`, which the
      // parent route already flattened. First occurrence wins, so the column
      // follows the operator's route order.
      if (seen.has(link.href)) continue;
      seen.add(link.href);
      links.push(link);
    }
  }

  return { heading, links, matched, missing };
}
