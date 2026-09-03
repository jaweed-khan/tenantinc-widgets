// ===========================================================================
// "Find Storage" MEGA MENU (#02 nav bar)
// Figma: node 10557-106986 (panel + nearby facilities) and node 10692-83507
// ("Mega Menu Overflow" — the see-all-cities page and the designer's overflow
// notes, which this file follows for anything the two frames disagree on).
//
// Replaces the old three-level hover cascade (states → cities → facilities,
// each a small white panel). That cascade is still in NavigationBar.tsx and still
// drives Storage Types / Resources — see the revert note there.
//
// A POPUP, NOT A DROPDOWN. The panel is `position: fixed`, filling the viewport
// from the bottom edge of the bar down. The Figma frames show the whole area under
// the nav going dark, and a document-flow panel would slide away under a scroll.
// The offset it is pinned to comes from measuring the bar, and is re-measured on
// scroll. Only the popup's own lists scroll while it is open — but that is done by
// refusing the wheel/touch/key gesture, NOT by an overflow-hidden body, which
// kills the bar's own `position: sticky` (see both effects below).
//
// DESKTOP PAGE 1 — four columns inside the 1322px card (search 440 | states 294 |
// cities 294 + 294):
//
//   SEARCH LOCATION      | SELECT STATE (50) | CALIFORNIA      SEE ALL CITIES
//   ─────────────────────|  one column,      |  two columns, alphabetical DOWN
//   Nearby facilities    |  scrolls          |  column 1 then into column 2
//
// DESKTOP PAGE 2 — "See all cities": the card is replaced by that state's whole
// city list in FOUR columns under a "‹ CALIFORNIA ( 110 )" header that stays put
// while the list scrolls beneath it. Clicking that header goes back to page 1.
//
// MOBILE (≤1024px, the bar's own hamburger breakpoint) — Figma 10692-81757 and
// 10692-82124. The same popup, one thing at a time:
//
//   PAGE 1  SEARCH LOCATION ✕ | Type/Size | City, ZIP, Address 🔍
//           ───────────────────────────────────────────────────
//           SELECT STATE ( 22 ) — one column, scrolls
//   PAGE 2  ‹ CALIFORNIA ( 110 )                              ✕
//           that state's cities, one column, scrolls
//
// Picking a state REPLACES the panel with page 2 (desktop only fills a third
// column); the chevron goes back. No "see all cities" — page 2 already is the
// whole list — and no nearby column, neither of which the mobile frames show.
// A city resolves exactly as it does on desktop.
//
// SEE ALL CITIES appears only when the two-column list actually overflows —
// measured, not guessed from a row count, exactly as the designer's "Data
// Overflow" note describes ("once a column exceeds X rows and begins to scroll,
// the link appears"). The panel height follows the viewport, so a row count would
// be wrong on half the screens it runs on.
//
// WHERE A CITY GOES. ONE facility in the city → straight to that facility's
// landing page, `/storage-units/<state>/<city>/<property>`; TWO OR MORE → the
// city page, `/locations/<state>/<city>`. A city page listing a single property
// is a click through to nothing new, and the property pages exist today while
// the city pages do not. A state row goes to `/locations/<state>`. Both rules
// live in @shared/propertyNav (`NavCity.href` / `NavState.href`) so the mobile
// drawer resolves them the same way. The city and state pages do not exist yet —
// those links are right, they just 404 until they do.
//
// THE SEARCH FIELD filters the state and city columns as it is typed — against
// the city name, each facility's name, and its full address line (street, city,
// state, ZIP), so "93535", "4th Street" and "Lancaster" all land on the same
// place. Nothing is submitted anywhere: there is no search results page on the
// site yet, so the orange button is a no-op and the filtering is what the field
// does. Type/Size are presentation only for the same reason.
//
// WHAT IS NOT WIRED. The Figma's per-facility star rating is left out:
// `GoogleReviews` holds ONE site-wide business score, not a score per property,
// so showing it on each row would be a made-up number.
// ===========================================================================

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import './FindStorageMegaMenu.css';
import { CloseCircleIcon } from '@shared/ui';
import {
  ChevronLeft,
  MapPinFilledIcon,
  PhoneIcon,
  SearchIcon,
  StarRating,
} from './icons';
import {
  fetchGoogleRatingsByPlace,
  ratingForProperty,
  type RatingSummary,
} from '@shared/reviewsCollections';
import { hasCollectionsApi } from '@shared/dudaCollections';
import { FormField, Button } from '@shared/ui';
import { getUserLocation, haversineMiles } from '@shared/nearbyProperties';
import { NearbyMap, type MapPoint } from '@shared/NearbyMap';
import { buildLocationTree, type NavState, type NavProperty } from '@shared/propertyNav';

/** Facilities listed under "Nearby Storage Facilities" (the Figma shows three). */
const NEARBY_COUNT = 3;

/**
 * A company with no more than this many facilities gets the MAP CARDS frame
 * (Figma 10630-54517, "Storage Locations 3") instead of the search/state/city
 * columns — desktop only.
 *
 * Below four, those columns are busywork: one state, two or three cities, each a
 * single click away from the same handful of pages. The frame replaces them with
 * one map per facility — city + street over a map zoomed to that address — above
 * a single "Enter city, state or ZIP" field.
 */
const MAP_MAX_FACILITIES = 3;

/** Each map card in the frame is 249 × 278. */
const CARD_MAP_HEIGHT = 278;

/**
 * Below this the popup switches to the MOBILE frames (Figma 10692-81757 /
 * 10692-82124). Same breakpoint as the bar's hamburger, so the panel and the bar
 * change character together.
 */
const MOBILE_QUERY = '(max-width: 1024px)';

/**
 * Which layout to render. A media QUERY, not a width in state: it is the same
 * condition the stylesheets use, so the JS branch and the CSS can't drift apart.
 */
function useIsMobile(): boolean {
  const supported = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
  const [isMobile, setIsMobile] = useState(() => supported && window.matchMedia(MOBILE_QUERY).matches);

  useEffect(() => {
    if (!supported) return;
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    // Safari < 14 only has the deprecated add/removeListener pair.
    if (mq.addEventListener) {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, [supported]);

  return isMobile;
}

export interface FindStorageMegaMenuProps {
  open: boolean;
  onClose: () => void;
  /** state › city › facility, from the `Properties` collection. */
  tree: NavState[];
  /**
   * Selector for the element that toggles this menu. A mousedown inside it must
   * NOT count as "outside" — otherwise the document listener closes the panel a
   * moment before the trigger's own click reopens it, and the menu never opens.
   */
  triggerSelector?: string;
}

interface NearbyItem {
  property: NavProperty;
  /** null when the browser gave us no position — the row then shows no distance. */
  miles: number | null;
}

// The two selects are placeholders until the search page exists, but the OPTIONS
// are the frame's own (audit 11691-240520 / 11691-240556) — plain nouns, no
// parenthetical dimensions. The "(5x5 - 5x10)" verbiage was invented here to make
// the placeholder look plausible and read as clutter in the audited dropdown; the
// size guide is where dimensions belong.
/** Which stand-in portfolio the editor/harness builds its demo tree from. */
export type DemoPortfolio = 'full' | 'small' | 'one-state';

const TYPE_OPTIONS = ['Storage', 'Parking'];
const SIZE_OPTIONS = ['All Sizes', 'Small', 'Medium', 'Large', 'XLarge'];

/**
 * One Type/Size field — AUDIT: "Implement the same dropdowns than we have in
 * the navigation."
 *
 * It was a native `<select>`, so the open list was whatever the OS draws: the
 * audited screenshot shows a grey macOS menu with a tick, nothing like the site.
 * This is the nav's own dropdown instead — the white 12px-radius panel with
 * `--nav-dd-*` rows (Figma "Sub Tab Element": 42px tall, 15/10 padding,
 * Montserrat 14, an inset bottom hairline per row) — reusing NavigationBar.css's
 * `.nav-dd-panel`/`.nav-dd-item` look so the two menus can't drift apart.
 *
 * The closed box keeps the ".Form 2.0" styling it already had, so only the open
 * list changes.
 *
 * Behaviour a native select gave for free and this has to restate:
 *  - **Escape closes the LIST, not the whole menu.** `stopPropagation` is what
 *    does it — the popup's own Escape handler is on `document`, and React's
 *    listener at the root runs first, so stopping there never reaches it.
 *  - **Arrow keys move the highlight** and `preventDefault()`, which also keeps
 *    the popup's scroll-key blocker off them: it bails on `defaultPrevented`.
 *  - Click outside, or pick a row, closes. Focus returns to the box.
 */
function MegaSelect({
  label,
  value,
  options,
  onPick,
}: {
  label: string;
  value: string;
  options: string[];
  onPick: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  // Open on the current value, so the first ArrowDown moves from where the
  // visitor is rather than from the top of the list.
  const openList = () => {
    setCursor(Math.max(0, options.indexOf(value)));
    setOpen(true);
  };

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) btnRef.current?.focus();
  };

  const pick = (v: string) => {
    onPick(v);
    close();
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (t && rootRef.current?.contains(t)) return;
      // No refocus: the visitor clicked somewhere else on purpose.
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (!open) return;
      e.stopPropagation();
      e.preventDefault();
      close();
      return;
    }
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((i) => {
        const next = e.key === 'ArrowDown' ? i + 1 : i - 1;
        return (next + options.length) % options.length;
      });
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick(options[cursor] ?? value);
      return;
    }
    if (e.key === 'Tab') close(false);
  };

  return (
    <div className="nav-mega-select" ref={rootRef}>
      <button
        className="nav-mega-select-btn"
        type="button"
        ref={btnRef}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
      >
        <span className="nav-mega-select-label">{label}</span>
        <span className="nav-mega-select-value">{value}</span>
      </button>
      {open && (
        <ul className="nav-mega-dd" role="listbox" aria-label={label} onKeyDown={onKeyDown}>
          {options.map((o, i) => (
            <li
              className={`nav-mega-dd-item${i === cursor ? ' is-active' : ''}`}
              key={o}
              role="option"
              aria-selected={o === value}
              onMouseEnter={() => setCursor(i)}
              onClick={() => pick(o)}
            >
              {o}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * "1.7 mi", as the Figma writes it. NOT @shared/nearbyProperties' formatDistance:
 * that one truncates to whole miles ("1 Miles") for the space-list cards, which
 * would collapse every facility in town to "0 Miles" in a list this short.
 */
function milesLabel(miles: number): string {
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles).toLocaleString('en-US')} mi`;
}

/**
 * Does this city match the typed keyword?
 *
 * Four things are matched, so "Lancaster", "4th Street", "93535" and a facility's
 * own name all find the same place:
 *
 *   city label      — from the SLUG, i.e. what the visitor is reading on screen
 *   Address.city    — the raw value too, because the two disagree in the live
 *                     data ("LancasTER"; Gardena's slug says Irvine)
 *   facility name   — "Storelocal Delano"
 *   address line    — street + city + state + ZIP
 *
 * ZIP is also compared on its own as a PREFIX of the digits: partial ZIPs narrow
 * down as they are typed, and a stored ZIP+4 ("93215-1234") still answers to the
 * five digits people actually type. Everything else is a case-insensitive
 * substring — a visitor half way through a street name should already see it.
 */
function cityMatches(city: NavState['cities'][number], q: string): boolean {
  if (city.label.toLowerCase().includes(q)) return true;
  const digits = q.replace(/\D/g, '');
  return city.properties.some(
    (p) =>
      p.label.toLowerCase().includes(q) ||
      p.address.toLowerCase().includes(q) ||
      p.city.toLowerCase().includes(q) ||
      (!!digits && p.zip.replace(/\D/g, '').startsWith(digits)),
  );
}

export function FindStorageMegaMenu({
  open,
  onClose,
  tree,
  triggerSelector = '[data-nav-mega-trigger]',
}: FindStorageMegaMenuProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const cityListRef = useRef<HTMLDivElement | null>(null);
  const isMobile = useIsMobile();

  // Which state's cities are showing, and whether the panel has been swapped for
  // that state's full city grid ("See all cities").
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [showAllCities, setShowAllCities] = useState(false);
  const [cityOverflow, setCityOverflow] = useState(false);

  // Search form. The keyword filters the state and city columns as it is typed;
  // Type/Size are not wired to anything (see the header note).
  const [query, setQuery] = useState('');
  const [type, setType] = useState(TYPE_OPTIONS[0]);
  const [size, setSize] = useState(SIZE_OPTIONS[0]);

  // ── Keyword filter ───────────────────────────────────────────────────────
  const q = query.trim().toLowerCase();

  const filteredTree = useMemo(() => {
    if (!q) return tree;
    return tree
      .map((state) => {
        // A state matched by name keeps ALL of its cities — someone typing
        // "california" wants the state, not the two cities with "cal" in them.
        const stateHit = state.label.toLowerCase().includes(q);
        const cities = stateHit
          ? state.cities
          : state.cities.filter((city) => cityMatches(city, q));
        return { ...state, cities };
      })
      .filter((state) => state.cities.length > 0);
  }, [tree, q]);

  const activeState = useMemo(
    () => filteredTree.find((s) => s.key === activeKey) ?? null,
    [filteredTree, activeKey],
  );

  /**
   * A single-state portfolio has nothing to choose, so the SELECT STATE column
   * is dropped and the cities show directly — desktop and mobile alike.
   *
   * Measured on the UNFILTERED `tree`, deliberately, not on `filteredTree`: a
   * query that happens to narrow a multi-state portfolio to one state would
   * otherwise make the column vanish and the panel re-flow mid-keystroke. It is
   * a property of the site, so it must not change while someone is typing.
   * Filtering down to one state is already handled — desktop auto-selects the
   * first match and fills the cities column.
   */
  const singleState = tree.length === 1;

  // Keep the selection honest against the filter, and on desktop always land on
  // a state: the first one when the menu opens, and the first with a hit while
  // searching, so the cities column is never an empty third of the panel.
  //
  // NOT on mobile: there, picking a state REPLACES the panel with that state's
  // cities, so auto-selecting would open on a city list nobody asked for (and
  // would throw the visitor onto it mid-keystroke while typing). Desktop only
  // fills a third column, so it still helps.
  useEffect(() => {
    if (activeKey && filteredTree.some((s) => s.key === activeKey)) return;
    // Mobile normally lands on NO state (picking one replaces the panel), but a
    // single-state portfolio has no state to pick — its cities are page 1, so
    // the one state has to be active from the start there too.
    const autoSelect = !isMobile || singleState;
    setActiveKey(autoSelect && filteredTree.length ? filteredTree[0].key : null);
  }, [filteredTree, activeKey, isMobile, singleState]);

  // ── Nearby facilities ────────────────────────────────────────────────────
  const allProperties = useMemo(
    () => tree.flatMap((s) => s.cities.flatMap((c) => c.properties)),
    [tree],
  );

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  // Ask for a position only once, and only after the visitor has opened the menu.
  // Asking on page load would put a permission prompt in front of every visitor
  // for a panel most of them never open.
  const askedRef = useRef(false);

  useEffect(() => {
    if (!open || askedRef.current) return;
    askedRef.current = true;
    getUserLocation()
      .then(setCoords)
      .catch(() => { /* denied / unavailable — the list falls back below */ });
  }, [open]);

  /**
   * Facility ratings — AUDIT: "Add in Reviews".
   *
   * Same source and same rule as #08's city page (`fetchGoogleRatingsByPlace` /
   * `ratingForProperty`): the `GoogleReviews` rows grouped by `placeName`, so a
   * facility with its own place gets its OWN score, and one without falls back to
   * the site-wide figure. Nothing is invented — a site with a single business
   * shows that business's rating on each row, which is what it has.
   *
   * Fetched on open and once only, like the geolocation ask above: it is a
   * collection read for a panel most visitors never open. No dmAPI (the Duda
   * editor, the dev harness) fails soft to null and the rows render without a
   * rating line, exactly as before this change.
   */
  const [ratings, setRatings] = useState<{
    byPlace: Map<string, RatingSummary>;
    overall: RatingSummary | null;
  } | null>(null);
  const ratingsAskedRef = useRef(false);

  /**
   * Editor/harness ratings — the same reasoning as `demoLocationTree` in
   * NavigationBar: the Duda editor and the dev harness have no `dmAPI`, so the
   * read above returns nothing and the rows rendered with no rating line at all,
   * which reads as "the audit note wasn't done" rather than "there is no
   * collection here yet".
   *
   * Gated on the API being ABSENT, never on an empty result: on a published page
   * with no `GoogleReviews` collection the rows still show no rating, because
   * inventing a score on a live site is the one thing worse than omitting it.
   * The figures are the frame's own (4.5, and its 32/56/21 counts).
   */
  const demoRatings = !hasCollectionsApi();
  const DEMO_REVIEW_COUNTS = [32, 56, 21];

  useEffect(() => {
    if (!open || ratingsAskedRef.current) return;
    ratingsAskedRef.current = true;
    fetchGoogleRatingsByPlace('#02 mega menu')
      .then(setRatings)
      .catch(() => { /* fails soft — rows just show no rating line */ });
  }, [open]);

  const nearby: NearbyItem[] = useMemo(() => {
    const withCoords = coords
      ? allProperties
          .filter((p) => p.lat != null && p.lng != null)
          .map((p) => ({ property: p, miles: haversineMiles(coords, { lat: p.lat!, lng: p.lng! }) }))
          .sort((a, b) => a.miles - b.miles)
      : [];
    // No position, or no property carries coordinates: list the first few
    // WITHOUT distances rather than rendering an empty column.
    const items = withCoords.length ? withCoords : allProperties.map((p) => ({ property: p, miles: null }));
    return items.slice(0, NEARBY_COUNT);
  }, [coords, allProperties]);

  // ── Small portfolio: one map card per facility ───────────────────────────
  // Desktop only — the mobile frames are the two pages built above, and a row of
  // map cards under them would leave no room for either.
  //
  // A facility with no Address.lat/lng cannot be drawn, so EVERY one of them has
  // to carry coordinates before this frame replaces the columns: a row silently
  // missing a location is worse than the list it displaced.
  const showMap = !isMobile
    && allProperties.length > 0
    && allProperties.length <= MAP_MAX_FACILITIES
    && allProperties.every((p) => p.lat != null && p.lng != null);

  // The field filters the cards, the way it filters the columns in the big
  // layout — with three facilities that's near-instant, but a search box that
  // ignores what you type is worse than no search box.
  // Carries the city's own label along: it comes from the SLUG, and the live
  // Address.city disagrees with it (a row reads "LancasTER") — the heading should
  // read the way every other city label in this menu reads.
  const cardProperties = useMemo(
    () => (showMap
      ? filteredTree.flatMap((s) => s.cities.flatMap(
        (c) => c.properties.map((property) => ({ property, cityLabel: c.label })),
      ))
      : []),
    [showMap, filteredTree],
  );


  // ── Open / close plumbing ────────────────────────────────────────────────
  // Reset to the "nothing picked yet" frame each time the menu is dismissed, so
  // reopening it doesn't drop the visitor back into a state they left behind.
  useEffect(() => {
    if (!open) {
      setActiveKey(null);
      setShowAllCities(false);
    }
  }, [open]);

  // Where the popup starts: the bottom edge of the nav bar, measured rather than
  // assumed. The bar's height changes with the `height` / `showTopBar` props and
  // with the breakpoint, and on a Duda page it can sit below other sections.
  //
  // DESKTOP ONLY. On mobile the popup is FULL SCREEN (`top: 0`) — the frames draw
  // it edge to edge, and starting it under the bar left a strip of the page
  // showing above a layer that is meant to replace the screen. It is safe to
  // cover the bar there because the mobile layout carries its own ✕ in its header
  // row (`.nav-mega-m-close`), where desktop's sits outside the card and needs
  // the bar's edge to hang from.
  const [topOffset, setTopOffset] = useState(0);

  const measureTop = useCallback(() => {
    const bar = rootRef.current?.closest('.nav-bar');
    if (bar) setTopOffset(Math.max(0, bar.getBoundingClientRect().bottom));
  }, []);

  // Re-measured on scroll, NOT locked in place. This used to set
  // `document.body.style.overflow = 'hidden'` while the popup was up, which broke
  // the sticky bar: an overflow-hidden ancestor becomes the sticky element's
  // scrollport, and that box never scrolls, so the bar dropped back to its
  // document position (off-screen, on a scrolled page) the moment the menu opened.
  // Following the bar instead keeps the panel pinned to its bottom edge whether the
  // bar is sticky or scrolls away with the page.
  useLayoutEffect(() => {
    // Nothing to follow when the popup is pinned to the top of the viewport, so
    // mobile skips the measure and its scroll/resize listeners entirely.
    // `isMobile` is in the dep list so a rotation or a resize across the
    // breakpoint re-measures rather than reinstating a stale offset.
    if (!open || isMobile) return;
    measureTop();

    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; measureTop(); });
    };

    window.addEventListener('resize', schedule);
    // Capture, because on a Duda page the scrolling box may be a container rather
    // than the window — a scroll event there doesn't bubble, but it is captured.
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, { capture: true });
    };
  }, [open, isMobile, measureTop]);

  // Nothing behind the popup scrolls while it is open — only the popup's own
  // lists do. The gesture is REFUSED rather than the page being frozen with
  // `body { overflow: hidden }`: that would break the bar's sticky positioning
  // (see the note on the measuring effect above), which is the whole reason this
  // is done the hard way.
  useEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    if (!root) return;

    // Walk from the event's target up to the popup root looking for a scroller
    // that can still take `dy` (negative = up). One that is already at its end
    // can't, and letting the event through there is exactly how a scroll chains
    // out to the document. A target outside the popup never finds one.
    const canScroll = (target: EventTarget | null, dy: number): boolean => {
      let el: Element | null = target instanceof Element ? target : null;
      while (el && root.contains(el)) {
        const style = getComputedStyle(el);
        if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight) {
          const atTop = el.scrollTop <= 0;
          const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
          if (!((dy <= 0 && atTop) || (dy >= 0 && atBottom))) return true;
        }
        el = el.parentElement;
      }
      return false;
    };

    const onWheel = (e: WheelEvent) => {
      if (e.cancelable && !canScroll(e.target, e.deltaY)) e.preventDefault();
    };

    // Touch has no delta of its own — it comes from the distance moved since the
    // last frame, sign-flipped (finger up = content scrolls down).
    let lastY = 0;
    const onTouchStart = (e: TouchEvent) => { lastY = e.touches[0]?.clientY ?? 0; };
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? lastY;
      const dy = lastY - y;
      lastY = y;
      // Multi-touch is a pinch/zoom, not a scroll — leave it alone.
      if (e.touches.length > 1) return;
      if (e.cancelable && !canScroll(e.target, dy)) e.preventDefault();
    };

    // Space/PageDown/… scroll the document too, and the popup is a dialog: the
    // keys belong to whatever is scrollable inside it, or to nothing.
    const SCROLL_KEYS: Record<string, number> = {
      ArrowDown: 1, PageDown: 1, End: 1, ' ': 1, Spacebar: 1,
      ArrowUp: -1, PageUp: -1, Home: -1,
    };
    const onScrollKey = (e: KeyboardEvent) => {
      const dir = SCROLL_KEYS[e.key];
      if (!dir || e.defaultPrevented) return;
      const target = e.target as Element | null;
      // Typing in the search field, or driving a dropdown, is not scrolling. The
      // role selectors cover MegaSelect, which is a button + listbox rather than
      // the native <select> this used to match on.
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (target?.closest('[role="listbox"], [aria-haspopup="listbox"]')) return;
      if (!canScroll(target, dir)) e.preventDefault();
    };

    document.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('keydown', onScrollKey);
    return () => {
      document.removeEventListener('wheel', onWheel);
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('keydown', onScrollKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      if (triggerSelector && target.closest(triggerSelector)) return;
      onClose();
    };

    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open, onClose, triggerSelector]);

  // ── "See all cities" ─────────────────────────────────────────────────────
  // Measured rather than derived from a row count: the column's height depends on
  // the viewport, so 20 cities may overflow on a laptop and fit on a large screen.
  //
  // BOTH AXES since the columns fill sequentially (`column-fill: auto`, see the
  // CSS): a list that outgrows the box no longer makes the box taller, it starts
  // a THIRD column and overflows sideways. Testing height alone — which is all
  // this did while the columns balanced — would report "fits" forever and the
  // link would never appear.
  useLayoutEffect(() => {
    const el = cityListRef.current;
    if (!el || !open || showAllCities) {
      setCityOverflow(false);
      return;
    }
    const check = () => setCityOverflow(
      el.scrollHeight - el.clientHeight > 1 || el.scrollWidth - el.clientWidth > 1,
    );
    check();

    window.addEventListener('resize', check);
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(check);
      // BOTH boxes: the container's height barely moves (it sits at its
      // max-height), so on its own it would never report the thing that actually
      // changes — the balanced height of the columns inside it, which shifts when
      // the state changes and again when the web font finally swaps in.
      ro.observe(el);
      if (el.firstElementChild) ro.observe(el.firstElementChild);
    }
    return () => {
      window.removeEventListener('resize', check);
      ro?.disconnect();
    };
  }, [open, showAllCities, activeKey, tree]);

  const heading = (label: string, count: number) => (
    <h3 className="nav-mega-heading">
      <span>{label}</span>
      <span className="nav-mega-heading-count">( {count} )</span>
    </h3>
  );

  const cityLink = (city: NavState['cities'][number]) => (
    <a key={city.key} className="nav-mega-city" href={city.href}>
      <span className="nav-mega-city-name">{city.label}</span>
      {/* A "1" bubble tells the visitor nothing — only counts worth comparing. */}
      {city.properties.length > 1 && (
        <span className="nav-mega-bubble">{city.properties.length}</span>
      )}
    </a>
  );

  // A LINK, not a button, and used by BOTH the desktop column and the mobile
  // menu — a state is a real page, so the row has to be reachable, keyboard-
  // focusable and middle-clickable. But the row also has to reveal its cities,
  // which is what the panel beside it is for. So: the first click selects and
  // stays put; clicking the already-open state follows the link; a modified
  // click (⌘/ctrl/shift/middle) always navigates.
  //
  // CLICK ONLY, never hover. Opening the city list on hover made the panel
  // twitchy: the pointer has to cross other state rows on its way to the cities,
  // swapping the list out from under it. Keyboard behaves the same for free —
  // Enter on the link is a click, while merely tabbing past changes nothing.
  const stateButton = (state: NavState) => (
    <a
      key={state.key}
      href={state.href}
      className={`nav-mega-state${state.key === activeKey ? ' is-active' : ''}`}
      aria-expanded={state.key === activeKey}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        if (state.key === activeKey) return;
        e.preventDefault();
        setActiveKey(state.key);
      }}
    >
      <span className="nav-mega-state-name">{state.label}</span>
      {state.propertyCount > 1 && (
        <span className="nav-mega-bubble">{state.propertyCount}</span>
      )}
    </a>
  );

  const noMatches = !filteredTree.length && (
    <p className="nav-mega-empty">No locations match “{query.trim()}”.</p>
  );

  // The field + magnifier. Nothing to submit: the lists filter as the visitor
  // types, and there is no results page to post to.
  const searchRow = (
    <div className="nav-mega-search-row">
      <FormField
        label="City, ZIP, Address"
        value={query}
        onChange={setQuery}
        className="nav-mega-field"
      />
      {/* Icon-only by design; the label stays for screen readers. */}
      <Button
        type="submit"
        tone="cta"
        className="nav-mega-search-btn"
        icon={<SearchIcon size={28} />}
      >
        Search
      </Button>
    </div>
  );

  // "Nearby Storage Facilities" — the desktop search column and mobile page 1
  // show the identical block (Figma 10557-106986 and 10692-81165).
  //
  // Each row carries a rating line — AUDIT: "Add in Reviews". It reads a facility's
  // OWN score when `GoogleReviews` has a place for it and the site-wide figure
  // otherwise (see the ratings effect above), so on a single-business site the
  // three rows do show the same score: that is the score the site has, not an
  // invented one. A site with no reviews collection shows no rating line at all.
  const nearbyBlock = (
    <div className="nav-mega-block nav-mega-block--nearby">
      <h3 className="nav-mega-heading nav-mega-heading--sm">Nearby Storage Facilities</h3>
      {nearby.length ? (
        <div className="nav-mega-locations">
          {/* The WHOLE row is one link to the facility's landing page. The
              address and phone lines used to be their own links (maps and tel:),
              which meant two of the three things a visitor is likely to click in
              a nav menu took them off the site instead of to the facility. Maps
              and click-to-call belong on the property page, which is where this
              now goes. */}
          {nearby.map(({ property, miles }, i) => (
            <a
              className="nav-mega-loc"
              key={property.id || property.slug}
              href={property.href}
            >
              <MapPinFilledIcon size={24} />
              <span className="nav-mega-loc-data">
                <span className="nav-mega-loc-name">
                  {property.label}
                  {miles != null && ` - ${milesLabel(miles)}`}
                </span>
                {(() => {
                  const live = ratings ? ratingForProperty(property.label, ratings) : null;
                  const r = live && live.score > 0
                    ? { score: live.score, count: live.count }
                    : demoRatings
                      ? { score: 4.5, count: DEMO_REVIEW_COUNTS[i % DEMO_REVIEW_COUNTS.length] }
                      : null;
                  if (!r) return null;
                  return (
                    <span className="nav-mega-loc-rating">
                      <span className="nav-mega-loc-score">{r.score.toFixed(1)}</span>
                      <StarRating rating={r.score} size={16} />
                      {r.count > 0 && (
                        <span className="nav-mega-loc-reviews">
                          {r.count.toLocaleString('en-US')} Reviews
                        </span>
                      )}
                    </span>
                  );
                })()}
                {property.address && (
                  <span className="nav-mega-loc-line">
                    <MapPinFilledIcon size={16} />
                    <span>{property.address}</span>
                  </span>
                )}
                {property.phone && (
                  <span className="nav-mega-loc-line">
                    <PhoneIcon size={16} />
                    <span>{property.phone}</span>
                  </span>
                )}
              </span>
            </a>
          ))}
        </div>
      ) : (
        <p className="nav-mega-empty">No locations to show yet.</p>
      )}
    </div>
  );

  // Shared by the desktop columns and both mobile pages.
  const searchForm = (
    <form className="nav-mega-form" onSubmit={(e) => e.preventDefault()}>
      <div className="nav-mega-selects">
        <MegaSelect label="Type" value={type} options={TYPE_OPTIONS} onPick={setType} />
        <MegaSelect label="Size" value={size} options={SIZE_OPTIONS} onPick={setSize} />
      </div>
      {searchRow}
    </form>
  );

  // ── Small portfolio (desktop, ≤3 facilities) — Figma 10630-54517 ─────────
  // A centred 800px block: one map card per facility across the top — CITY, ST
  // in bold over the street line, above a map zoomed to that address — and the
  // search field beneath, spanning the row. No Type/Size (the frame has one
  // field), no state or city columns, no nearby list: with three facilities the
  // cards ARE the whole portfolio.
  const mapCardsPanel = (
    <div className="nav-mega-small">
      {cardProperties.length ? (
        <div className="nav-mega-locmaps">
          {cardProperties.map(({ property: p, cityLabel }) => {
            const point: MapPoint = {
              id: p.id || p.slug,
              lat: p.lat!,
              lng: p.lng!,
              // The frame labels the pin with the street, as Google's own embed
              // does for a searched address.
              label: p.street || undefined,
              name: p.label,
              address: p.address,
            };
            return (
              <div className="nav-mega-locmap" key={p.id || p.slug}>
                {/* The heading is the link — the map below it holds the pin's
                    own buttons, and a <button> inside an <a> is invalid. */}
                <a className="nav-mega-locmap-head" href={p.href}>
                  <span className="nav-mega-locmap-city">
                    {[cityLabel || p.city || p.label, p.state].filter(Boolean).join(', ')}
                  </span>
                  {p.street && <span className="nav-mega-locmap-street">{p.street}</span>}
                </a>
                <NearbyMap
                  center={{ lat: p.lat!, lng: p.lng! }}
                  points={[point]}
                  height={CARD_MAP_HEIGHT}
                  className="nav-mega-locmap-canvas"
                  // The centre IS the facility, already marked by its own pin.
                  showCenterMarker={false}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <p className="nav-mega-empty">No locations match “{query.trim()}”.</p>
      )}
      <form className="nav-mega-small-form" onSubmit={(e) => e.preventDefault()}>
        {searchRow}
      </form>
    </div>
  );

  // ── Mobile (≤1024px) — Figma 10692-81165 / 10692-81757 and 10692-82124 ───
  // ONE thing at a time, because there is no room for three columns: page 1 is
  // the search form, then Nearby Storage Facilities, then the state list; picking
  // a state REPLACES the whole panel with that state's cities, and the chevron in
  // the header is the way back. There is no "see all cities" here — page 2
  // already IS the whole list.
  //
  // A city still resolves the same way it does on desktop (`city.href` from
  // buildLocationTree): one facility → that facility's page, several → the city
  // page.
  const mobileClose = (
    <button className="nav-mega-m-close" type="button" onClick={onClose} aria-label="Close menu">
      {/* Figma's **Mobile — 32** frame. Outlined ring: .nav-mega is a near-black
          overlay. 32 is not just a number here — `CloseCircleIcon` branches on
          `size <= 32` to draw the mobile export's thinner ring (stroke 2, inset
          1) instead of the desktop frame's (stroke 3, inset 1.5), so anything
          above 32 renders the DESKTOP mark scaled down. */}
      <CloseCircleIcon outlined size={32} />
    </button>
  );

  // Page 2 (a state's cities, with the chevron back to page 1) only exists when
  // there IS a state to have picked. With one state its cities are already on
  // page 1, and pushing them onto a second page would put a back control in
  // front of a list nobody navigated to — and lose the search field and the
  // nearby facilities on the way.
  const mobilePanel = activeState && !singleState ? (
    <div className="nav-mega-m">
      <div className="nav-mega-m-head">
        <button className="nav-mega-back" type="button" onClick={() => setActiveKey(null)}>
          <ChevronLeft size={24} />
          <span className="nav-mega-back-state">{activeState.label}</span>
          <span className="nav-mega-back-count">( {activeState.cities.length} )</span>
        </button>
        {mobileClose}
      </div>
      <div className="nav-mega-scroll nav-mega-m-list">
        {activeState.cities.map(cityLink)}
      </div>
    </div>
  ) : (
    <div className="nav-mega-m">
      <div className="nav-mega-m-head">
        <h3 className="nav-mega-heading">Search Location</h3>
        {mobileClose}
      </div>
      {searchForm}
      {/* Page 1 scrolls as ONE column below the header — search, facilities and
          the states all move together, as the frame's 852px column does. The
          states list keeping its own scrollport would have pinned the facilities
          in place and left the states a ~100px porthole to read them through. */}
      <div className="nav-mega-scroll nav-mega-m-page">
        <div className="nav-mega-rule" />
        {nearbyBlock}
        <div className="nav-mega-rule" />
        <div className="nav-mega-block">
          {/* One state ⇒ no "Select State" step: its cities ARE this block,
              under the state's own heading. */}
          {singleState ? (
            <>
              {activeState && heading(activeState.label, activeState.cities.length)}
              {noMatches}
              <div className="nav-mega-m-list">
                {activeState?.cities.map(cityLink)}
              </div>
            </>
          ) : (
            <>
              {heading('Select State', filteredTree.length)}
              {noMatches}
              <div className="nav-mega-m-list">
                {filteredTree.map(stateButton)}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={`nav-mega${open ? ' is-open' : ''}`}
      ref={rootRef}
      role="dialog"
      aria-label="Find storage"
      aria-hidden={!open}
      // Full screen on mobile; hung off the measured bottom edge of the bar on
      // desktop. See the topOffset note above.
      style={{ top: isMobile ? 0 : topOffset }}
      // A click on the dark area around the card dismisses it, like any popup.
      // Only the backdrop itself — anything inside the card bubbles up here too.
      onMouseDown={(e) => { if (e.target === rootRef.current) onClose(); }}
    >
      {/* Outside .nav-mega-inner on purpose: the Figma parks the ✕ against the
          viewport corner, past the right edge of the card. */}
      <button className="nav-mega-close" type="button" onClick={onClose} aria-label="Close menu">
        {/* Figma's **Desktop — 52** frame, the component's own default size.
            Outlined ring: .nav-mega is a near-black overlay. */}
        <CloseCircleIcon outlined size={52} />
      </button>

      <div className="nav-mega-inner">
        {isMobile ? mobilePanel : showMap ? mapCardsPanel : showAllCities && activeState ? (
          // ── Page 2: every city in the state, four columns under a header that
          // stays put while the list scrolls beneath it. ────────────────────────
          <div className="nav-mega-all">
            {/* The header IS the back control — the Figma has no separate "back"
                label, just the chevron and the state name. */}
            <button
              className="nav-mega-back"
              type="button"
              onClick={() => setShowAllCities(false)}
            >
              <ChevronLeft size={24} />
              <span className="nav-mega-back-state">{activeState.label}</span>
              <span className="nav-mega-back-count">( {activeState.cities.length} )</span>
            </button>
            <div className="nav-mega-scroll nav-mega-all-scroll">
              <div className="nav-mega-all-cols">
                {activeState.cities.map(cityLink)}
              </div>
            </div>
          </div>
        ) : (
          <div className={`nav-mega-panels${singleState ? ' nav-mega-panels--one-state' : ''}`}>
            {/* ── Search + nearby ─────────────────────────────────────────── */}
            <section className="nav-mega-col nav-mega-col--search">
              <div className="nav-mega-block">
                <h3 className="nav-mega-heading">Search Location</h3>
                {searchForm}
              </div>

              <div className="nav-mega-rule" />

              {nearbyBlock}
            </section>

            {/* ── States: one column, scrolls ───────────────────────────────
                Dropped entirely on a single-state portfolio: a column offering
                one choice that is already made is noise, and the cities take the
                width it frees (see .nav-mega-panels--one-state). */}
            {!singleState && (
              <section className="nav-mega-col nav-mega-col--states">
                {heading('Select State', filteredTree.length)}
                {noMatches}
                <div className="nav-mega-scroll nav-mega-states">
                  {filteredTree.map(stateButton)}
                </div>
              </section>
            )}

            {/* ── Cities: two columns, scrolls ──────────────────────────────
                Rendered whenever a state is active, and ALSO with one state and
                no match at all — the "no locations match" message lived in the
                states column, and without this it would have nowhere to go and
                a query with no hits would show an empty panel. */}
            {(activeState || singleState) && (
              <section className="nav-mega-col nav-mega-col--cities">
                <div className="nav-mega-cities-head">
                  {activeState && heading(activeState.label, activeState.cities.length)}
                  {/* Only once the list actually scrolls — see the header note. */}
                  {activeState && cityOverflow && (
                    <button
                      className="nav-mega-seeall"
                      type="button"
                      onClick={() => setShowAllCities(true)}
                    >
                      See all cities
                    </button>
                  )}
                </div>
                {singleState && noMatches}
                {/* Two columns filled alphabetically DOWN the first and on into the
                    second (Anaheim…Oceanside | Ontario…Torrance in the Figma), which
                    is what CSS columns do — a grid would run A, B across the row. */}
                <div className="nav-mega-scroll nav-mega-cities" ref={cityListRef}>
                  <div className="nav-mega-city-cols">
                    {activeState?.cities.map(cityLink)}
                  </div>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demo tree — the Duda EDITOR and the dev harness have no `dmAPI`, so the
// collection read returns nothing there and the panel would render empty while
// an editor is working on the page. These rows go through the real
// `buildLocationTree`, so the demo behaves exactly like live data: same sorting,
// same single-vs-multi-facility city links, same counts.
// ---------------------------------------------------------------------------

/**
 * state → city → how many facilities to fabricate for it.
 *
 * Sized to exercise BOTH frames the designer drew: California carries far more
 * cities than the two columns can show, so it scrolls and the SEE ALL CITIES link
 * appears; the smaller states fit and correctly show no link. There are also more
 * states than the states column can show, so that one scrolls too.
 */
const DEMO_CITIES: Record<string, Record<string, number>> = {
  arizona: { phoenix: 3, tucson: 1, mesa: 2, scottsdale: 1, chandler: 1, glendale: 2 },
  california: {
    alhambra: 1, anaheim: 2, bakersfield: 1, bellflower: 1, brea: 1, burbank: 2,
    carlsbad: 1, chino: 2, 'chula-vista': 1, corona: 1, 'costa-mesa': 1, downey: 1,
    'elk-grove': 1, escondido: 1, fontana: 2, fremont: 1, fresno: 2, fullerton: 3,
    gardena: 1, 'garden-grove': 1, glendale: 1, hayward: 1, 'huntington-beach': 1,
    inglewood: 1, irvine: 4, lancaster: 2, 'long-beach': 2, 'los-angeles': 5,
    modesto: 1, 'moreno-valley': 1, norwalk: 1, oakland: 2, oceanside: 1, ontario: 1,
    orange: 2, oxnard: 1, palmdale: 1, pasadena: 1, pomona: 1, 'rancho-cucamonga': 1,
    redlands: 1, riverside: 2, sacramento: 2, 'san-bernardino': 1, 'san-diego': 3,
    'san-francisco': 2, 'san-jose': 2, 'santa-ana': 1, 'santa-barbara': 1,
    'santa-clarita': 1, stockton: 1, torrance: 1, 'van-nuys': 1, whittier: 1,
  },
  colorado: { aurora: 1, denver: 2, 'colorado-springs': 1 },
  florida: { jacksonville: 2, miami: 3, orlando: 1, tampa: 2 },
  georgia: { athens: 1, atlanta: 3, savannah: 1 },
  idaho: { boise: 1, meridian: 1 },
  illinois: { chicago: 4, naperville: 1, peoria: 1 },
  nevada: { henderson: 1, 'las-vegas': 2, reno: 1 },
  'new-mexico': { albuquerque: 2, 'santa-fe': 1 },
  'north-carolina': { charlotte: 2, durham: 1, raleigh: 1 },
  oregon: { bend: 1, eugene: 1, portland: 2, salem: 1 },
  tennessee: { memphis: 1, nashville: 2 },
  texas: { austin: 2, dallas: 3, 'el-paso': 1, 'fort-worth': 2, houston: 4, 'san-antonio': 1 },
  utah: { 'salt-lake-city': 2, provo: 1 },
  washington: { bellevue: 1, seattle: 3, spokane: 1, tacoma: 1, vancouver: 1 },
};

/** Real USPS codes — `state.slice(0, 2)` gave Arizona "AR" and Texas "TE". */
const DEMO_STATE_CODES: Record<string, string> = {
  arizona: 'AZ', california: 'CA', colorado: 'CO', florida: 'FL', georgia: 'GA',
  idaho: 'ID', illinois: 'IL', nevada: 'NV', 'new-mexico': 'NM',
  'north-carolina': 'NC', oregon: 'OR', tennessee: 'TN', texas: 'TX', utah: 'UT',
  washington: 'WA',
};

/**
 * A stable five-digit ZIP derived from the city name, so each demo city has its
 * own and searching one narrows to that city — the way a real ZIP behaves. The
 * previous version keyed the ZIP off the facility INDEX, which gave every city's
 * first facility the same "91013" and made ZIP search look broken in the harness.
 */
function demoZip(state: string, city: string): string {
  let hash = 0;
  for (const ch of `${state}/${city}`) hash = (hash * 31 + ch.charCodeAt(0)) % 90000;
  return String(10000 + hash);
}

const DEMO_ROWS = Object.entries(DEMO_CITIES).flatMap(([state, cities]) =>
  Object.entries(cities).flatMap(([city, count]) =>
    Array.from({ length: count }, (_, i) => {
      const cityLabel = city.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
      const n = i + 1;
      return {
        id: `demo-${state}-${city}-${n}`,
        name: `Storage Outlet - ${cityLabel}${count > 1 ? ` #${n}` : ''}`,
        slug: `${state}/${city}/storage-outlet-${city}-${n}`,
        Address: {
          // Street names differ per city too, so a street search is meaningful.
          address: `${100 + n * 7} ${cityLabel} Avenue`,
          city: cityLabel,
          state: DEMO_STATE_CODES[state] ?? state.slice(0, 2).toUpperCase(),
          zip: demoZip(state, city),
        },
        Phones: [{ phone: '8008749487', status: 1 }],
      };
    }),
  ),
);

/**
 * A THREE-facility company, for the small-portfolio frame (map instead of the
 * state/city columns). Coordinates are real Southern California ones, because the
 * map is the whole point of this variant and `buildLocationTree` only carries a
 * `lat`/`lng` through when `Address` actually has them — a demo without them would
 * fall back to the columns and show nothing of what it exists to show.
 */
const DEMO_SMALL_ROWS = [
  {
    id: 'demo-small-irvine',
    name: 'Storage Outlet - Irvine',
    slug: 'california/irvine/storage-outlet-irvine-1',
    Address: { address: '5281 California Ave', city: 'Irvine', state: 'CA', zip: '92617', lat: 33.6797, lng: -117.8311 },
    Phones: [{ phone: '8008749487', status: 1 }],
  },
  {
    id: 'demo-small-bellflower',
    name: 'Storage Outlet - Bellflower',
    slug: 'california/bellflower/storage-outlet-bellflower-2',
    Address: { address: '9525 Somerset Blvd', city: 'Bellflower', state: 'CA', zip: '90706', lat: 33.8817, lng: -118.1170 },
    Phones: [{ phone: '8008749487', status: 1 }],
  },
  {
    id: 'demo-small-chino',
    name: 'Storage Outlet - Chino',
    slug: 'california/chino/storage-outlet-chino-3',
    Address: { address: '12750 Pipeline Ave', city: 'Chino', state: 'CA', zip: '91710', lat: 34.0122, lng: -117.6889 },
    Phones: [{ phone: '8008749487', status: 1 }],
  },
];

/** California only — a one-state portfolio, so the SELECT STATE column is
 *  dropped and the cities show directly. Reuses DEMO_ROWS rather than a second
 *  hand-written set, so the two demos cannot drift. */
const DEMO_ONE_STATE_ROWS = DEMO_ROWS.filter((r) => r.slug.startsWith('california/'));

/**
 * Stand-in tree for the Duda editor and the dev harness. Takes the same base
 * paths as the live tree so the demo links match the ones a visitor would get.
 *
 * `portfolio: 'small'` swaps in the three-facility set above so the map frame can
 * be seen somewhere other than a live three-property site; `'one-state'` narrows
 * to California so the state-less two-column layout can be seen without one.
 */
export function demoLocationTree(
  basePath: string,
  cityBasePath?: string,
  portfolio: DemoPortfolio = 'full',
): NavState[] {
  const rows = portfolio === 'small' ? DEMO_SMALL_ROWS
    : portfolio === 'one-state' ? DEMO_ONE_STATE_ROWS
      : DEMO_ROWS;
  return buildLocationTree(rows, { basePath, cityBasePath });
}
