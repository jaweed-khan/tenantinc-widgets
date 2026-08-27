import React, { useEffect, useMemo, useRef, useState } from 'react';
import './NavigationBar.css';
import storelocalLogo from './Storelocal_logo.png';
import { CloseCircleIcon } from '@shared/ui';
import {
  ChevronDown,
  ChevronRight,
  PhoneIcon,
  MessageAiIcon,
  CreditCardIcon,
  UsFlagIcon,
  UserCircleIcon,
  HamburgerIcon,
  PhoneCallIcon,
  CloseIcon,
  SelfStorageIcon,
  BusinessStorageIcon,
  DriveUpIcon,
  VehicleRvIcon,
  MailboxIcon,
  ClimateControlledIcon,
  EnvelopeIcon,
  MapPinIcon,
  LoginIcon,
  KeyIcon,
  SearchIcon,
} from './icons';
import { fetchPropertyContact, DEFAULT_PROPERTY_ID } from '@shared/propertyContact';
import { fetchLocationTree, DEFAULT_CITY_BASE_PATH, type NavState } from '@shared/propertyNav';
import { imageUrl } from '@shared/dudaCollections';
import { fetchDudaNavigation, type DudaNavItem } from '@shared/dudaNav';
import { navTreeToLinks } from './navigationMapper';
import { FindStorageMegaMenu, demoLocationTree, type DemoPortfolio } from './FindStorageMegaMenu';

// ---------------------------------------------------------------------------
// Types + defaults
// ---------------------------------------------------------------------------

/** A second-level (city) item; may nest a third-level list (facilities). */
interface NavSubItem {
  label: string;
  href: string;
  /** Optional third-level dropdown, e.g. a city's individual facilities. */
  children?: NavSubItem[];
}

/** A first-level dropdown row; may open a second-level list on hover. */
interface NavMenuItem {
  label: string;
  href: string;
  /** Optional leading icon (used by the Storage Types menu). */
  icon?: React.ReactNode;
  children?: NavSubItem[];
}

interface NavLink {
  /** Duda page alias — stable id used to recognise Find Storage across renames. */
  alias?: string;
  label: string;
  href: string;
  hasDropdown?: boolean;
  /** Two-level hover mega-menu (first-level rows, each optionally nesting a city list). */
  menu?: NavMenuItem[];
}

/** Structural shape shared by every level of the mobile accordion tree
 *  (NavMenuItem and NavSubItem both satisfy it). */
type MobileMenuNode = { label: string; href: string; icon?: React.ReactNode; children?: MobileMenuNode[] };

// Hardcoded for now — the real data will come from a collection / props later.
const FIND_STORAGE_MENU: NavMenuItem[] = [
  { label: 'All Locations', href: '#' },
  {
    label: 'Arizona',
    href: '#',
    children: [
      { label: 'Phoenix', href: '#' },
      { label: 'Tucson', href: '#' },
      { label: 'Mesa', href: '#' },
      { label: 'Scottsdale', href: '#' },
    ],
  },
  {
    label: 'California',
    href: '#',
    children: [
      { label: 'Los Angeles', href: '#' },
      { label: 'San Diego', href: '#' },
      { label: 'Newport Beach', href: '#' },
      { label: 'Oceanside', href: '#' },
      { label: 'Santa Barbara', href: '#' },
      { label: 'San Luis Obispo', href: '#' },
      { label: 'Riverside', href: '#' },
      { label: 'Redlands', href: '#' },
    ],
  },
  {
    label: 'Oregon',
    href: '#',
    children: [
      { label: 'Portland', href: '#' },
      { label: 'Eugene', href: '#' },
      { label: 'Salem', href: '#' },
      { label: 'Bend', href: '#' },
    ],
  },
  {
    label: 'Washington',
    href: '#',
    children: [
      { label: 'Seattle', href: '#' },
      { label: 'Spokane', href: '#' },
      { label: 'Tacoma', href: '#' },
      { label: 'Bellevue', href: '#' },
    ],
  },
];

// Destinations for Find Storage › California › Irvine › 5281 California.
//
// SITE-RELATIVE, not absolute. These used to be pinned to one site's preview
// host (mariposa26-testing.multiscreensite.com), which is wrong for a shared
// bundle: the same dist/ file is served to every customer site, so a hardcoded
// host sent visitors to somebody else's site. A path resolves against whichever
// host is serving the page, so one value is correct on the preview host
// (*.multiscreensite.com), the live domain and any custom domain without the
// bundle needing to know which it is. Same reasoning as the hrefs
// @shared/propertyNav builds.
//
// A plain path on a real <a> also keeps Duda's own routing in charge. Building
// an absolute URL from window.location.origin would break the editor preview
// (→ my.duda.co 404) — see the note in #05's Pricing.tsx.
//
// Still NOT props: Duda's link picker feeds the JS tab an editor URL
// (mariposa.responsivewebsitebuilder.io/home/site/<id>/…), which used to
// override the defaults and send visitors into the editor.
// forceHardcodedLinks() below re-applies these no matter where the nav data came
// from, so nothing Duda passes can win.
const IRVINE_URL = '/';
/** Canonical site home — where the logo (both bars and the drawer) must point. */
const HOME_URL = '/';

/**
 * Duda's link picker hands the JS tab an EDITOR url
 * (mariposa.responsivewebsitebuilder.io/home/site/<id>/home), which sent anyone
 * clicking the logo into the editor. Same trap `forceHardcodedLinks` exists for,
 * so the logo gets the same treatment: an editor url (or an unset '#') falls back
 * to HOME_URL — the current site's root — while a genuine custom link still wins.
 */
const EDITOR_URL_RE = /responsivewebsitebuilder\.io|\/home\/site\//i;

function resolveLogoLink(link?: string): string {
  if (!link || link === '#' || EDITOR_URL_RE.test(link)) return HOME_URL;
  return link;
}
const FACILITY_URL = '/property-landing-page';
/** The Duda dynamic property pages live under this path — see locationBasePath. */
const DEFAULT_LOCATION_BASE_PATH = '/storage-units';
/** Where the pinned "All Locations" row points. */
const ALL_LOCATIONS_URL = '#';
const IRVINE_LABEL = 'Irvine';
const FACILITY_LABEL = '5281 California';

/**
 * Force the two hardcoded hrefs onto any matching menu entry, at any depth.
 * Applied to the final link list so it also covers a full `links` override
 * coming from the Duda JS tab.
 */
function forceHardcodedLinks<T extends { label: string; href?: string; children?: T[]; menu?: T[] }>(items: T[]): T[] {
  return items.map((item) => {
    const href =
      item.label === FACILITY_LABEL ? FACILITY_URL
        : item.label === IRVINE_LABEL ? IRVINE_URL
          : item.href;
    return {
      ...item,
      href,
      ...(item.children ? { children: forceHardcodedLinks(item.children) } : null),
      ...(item.menu ? { menu: forceHardcodedLinks(item.menu) } : null),
    };
  });
}

/** The one link that opens the mega menu instead of the hover dropdown. */
const FIND_STORAGE_LABEL = 'Find Storage';

/**
 * Turn the collection-derived location tree into Find Storage's MOBILE accordion.
 *
 * Desktop no longer uses this — that link opens <FindStorageMegaMenu /> — but the
 * drawer still nests state › city › facility. State and city rows both carry
 * their real hrefs (`/locations/<state>` and `/locations/<state>/<city>`), so the
 * drawer and the mega menu now point at the same places. "All Locations" stays
 * pinned to the top.
 *
 * TWO LEVELS ONLY: state › city. A city does not expand to its facilities — it
 * is a link, and tapping it follows `NavCity.href`, which is already the right
 * destination either way: the facility's landing page when the city holds one,
 * the city page when it holds several. A third tier of accordions inside a
 * drawer that is itself inside an accordion buries the thing being looked for
 * behind three taps, and the city page lists the same facilities on arrival.
 */
function locationTreeToMenu(tree: NavState[]): NavMenuItem[] {
  return [
    { label: 'All Locations', href: ALL_LOCATIONS_URL },
    ...tree.map((state) => ({
      label: state.label,
      href: state.href,
      // No `children`: a city is a leaf here, so the row renders as a link
      // rather than a third dropdown. city.properties is still read by the
      // desktop mega menu, which has the room for the extra tier.
      children: state.cities.map((city) => ({
        label: city.label,
        href: city.href,
      })),
    })),
  ];
}

/** Build the default nav, injecting Irvine under Find Storage › California.
 *
 *  Irvine is a LEAF, matching locationTreeToMenu above — the drawer is two
 *  levels throughout, so the "5281 California" tier it used to nest is gone.
 *  Its own href still comes from forceHardcodedLinks, which pins any row
 *  labelled "Irvine" to IRVINE_URL whatever this sets. */
function buildDefaultLinks(): NavLink[] {
  const findStorageMenu: NavMenuItem[] = FIND_STORAGE_MENU.map((state) =>
    state.label === 'California'
      ? {
          ...state,
          children: [
            ...(state.children ?? []),
            { label: IRVINE_LABEL, href: IRVINE_URL },
          ],
        }
      : state,
  );
  // Only Find Storage is built-in (its own custom mega menu). Every other menu
  // item comes from Duda's page tree at runtime. So while the tree is loading OR
  // if the read fails, the bar shows just Find Storage — no page-driven links and
  // no '#' placeholders (fail closed), rather than stale hardcoded sections.
  return [
    { label: 'Find Storage', href: '#', hasDropdown: true, menu: findStorageMenu },
  ];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface NavigationBarProps {
  /**
   * Content-menu IMAGE input (`logoImage`) — the way an editor sets the logo.
   * Typed `unknown` because Duda doesn't hand images over in one shape: it may be
   * a plain URL string or an object keyed `image` / `url` / `src`, so it goes
   * through `imageUrl()` rather than being trusted. Wins over `logoUrl`.
   */
  logoImage?: unknown;
  /** Override the bundled storelocal logo with a custom image URL (plain string). */
  logoUrl?: string;
  /**
   * Click destination for the logo (Duda link picker). An editor url or '#' is
   * ignored in favour of the live home page — see resolveLogoLink.
   */
  logoLink?: string;
  /* Irvine / 5281 California are hardcoded (see IRVINE_URL / FACILITY_URL).
     The former lagunaBeachUrl + bowlingDrUrl props were removed: Duda's link
     picker supplied editor URLs through them, which sent visitors into the
     website builder. Anything the JS tab still passes is simply ignored. */
  /** Property whose phone number is pulled from the `Properties` collection.
   *  The `phone` prop/default remains the fallback. */
  propertyId?: string;
  /** Colour of the raised logo tile. Default storelocal green. */
  logoBg?: string;
  /** Primary-bar height. 'narrow' = 100px, 'wide' = 180px. Default 'narrow'. */
  height?: 'narrow' | 'wide';
  /** Logo treatment. 'banner' = raised tile overlapping the bar (default),
   *  'inline' = logo sits inline at the left of the bar. */
  logoStyle?: 'banner' | 'inline';
  /** Bottom separator style. Default 'shadow'. */
  separator?: 'shadow' | 'line' | 'none';
  /** Duda content-menu toggle: show the secondary utility bar on top. Default true. */
  showTopBar?: boolean;
  /** Per-item visibility toggles for the utility items (top bar / inline actions). */
  showPhone?: boolean;
  showChat?: boolean;
  showAccount?: boolean;
  showPayBill?: boolean;
  showLanguage?: boolean;
  phone?: string;
  phoneHref?: string;
  /* The smsPhone / smsPhoneHref props were removed with the "message" utility
     item. Anything the Duda JS tab still passes for them is simply ignored. */
  liveChatLabel?: string;
  liveChatUrl?: string;
  /** Language label for the top-bar selector, e.g. "EN". */
  language?: string;
  payBillLabel?: string;
  /** External URL for the Bill Pay item (from the "Enable external URLs" group). */
  payBillUrl?: string;
  accountLabel?: string;
  /** External URL for the My Account item (from the "Enable external URLs" group). */
  accountUrl?: string;
  links?: NavLink[];
  /**
   * Path the property pages live under, prefixed to each Find Storage link built
   * from a property's `slug`. Defaults to the live layout, `/storage-units`, so
   * a link reads "/storage-units/california/bellflower/…". Pass '' for links off
   * the site root. Leading/trailing slashes are normalised.
   */
  locationBasePath?: string;
  /**
   * Path the CITY pages live under. Default `/locations`, giving
   * "/locations/california/irvine" for a city holding more than one facility. A
   * city with exactly one facility always links straight to that facility.
   */
  cityBasePath?: string;
  /**
   * Which UI the Find Storage link opens.
   * - 'mega'     — full-viewport popup (search + states + cities + nearby). Default.
   * - 'dropdown' — the old three-level hover cascade (state › city › facility),
   *                the same one Storage Types and Resources use.
   * Duda editors toggle between the two from the content menu.
   */
  findStorageStyle?: 'mega' | 'dropdown';
  /**
   * Which page-tree entry becomes the custom Find Storage mega menu. Matched by
   * Duda page `alias` first (most stable), then `path`, then the `Find Storage`
   * title as a last resort. Set these to the site's actual values if they differ.
   */
  findStorageAlias?: string;
  findStoragePath?: string;
  /**
   * Which DEMO portfolio the mega menu falls back to where there is no `dmAPI`
   * (the Duda editor and the dev harness). `'small'` is a three-facility company,
   * which is what triggers the map frame. Has NO effect on a published page — the
   * collection answers there and the demo tree is never built.
   */
  demoPortfolio?: DemoPortfolio;
}

export function NavigationBar({
  logoImage,
  logoUrl,
  logoBg = 'transparent',
  height = 'narrow',
  logoStyle = 'banner',
  separator = 'shadow',
  showTopBar = true,
  showPhone = true,
  showChat = true,
  showAccount = true,
  showPayBill = true,
  showLanguage = true,
  phone = '(800) 874-9487',
  phoneHref,
  liveChatLabel = 'Live Chat',
  liveChatUrl = '#',
  language = 'EN',
  payBillLabel = 'Pay Bill',
  payBillUrl = '#',
  accountLabel = 'My Account',
  accountUrl = '#',
  logoLink,
  links,
  propertyId = DEFAULT_PROPERTY_ID,
  locationBasePath = DEFAULT_LOCATION_BASE_PATH,
  cityBasePath = DEFAULT_CITY_BASE_PATH,
  findStorageStyle = 'mega',
  findStorageAlias = 'storage-units',
  findStoragePath = '/storage-units',
  demoPortfolio = 'full',
}: NavigationBarProps) {
  // Recognise the Find Storage page across renames: alias → path → title.
  const isFindStorageLink = (l: NavLink): boolean =>
    (!!l.alias && l.alias === findStorageAlias) || l.href === findStoragePath || l.label === FIND_STORAGE_LABEL;
  // Normalise so an unknown value from Duda falls back to the popup rather than
  // a link that does nothing.
  const useMega = findStorageStyle !== 'dropdown';
  // Logo destination, with Duda's editor url filtered out (see resolveLogoLink).
  const homeLink = resolveLogoLink(logoLink);

  // Logo source: the content-menu image input first, then the plain-url prop, then
  // the bundled mark. `||` not `??` on purpose — Duda leaves an untouched field as
  // '', which `??` would happily pass to <img src=""> and render as broken.
  const logoSrc = imageUrl(logoImage) || (logoUrl ?? '').trim() || storelocalLogo;

  const [menuOpen, setMenuOpen] = useState(false);
  /* Wheel over the overlay must not scroll the page behind it. touch-action
     handles the finger (see .nav-mm-overlay) but there is no CSS equivalent
     for a wheel, and React attaches its own wheel listener PASSIVELY — so
     preventDefault has to come from a native non-passive one. Same shape as
     the rental flow's scrim.
     Deliberately not the body-overflow lock the other modals use: this bar is
     position: sticky, and an overflow-hidden ancestor would take away the
     scrollport it sticks against. */
  const mmOverlayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = mmOverlayRef.current;
    if (!menuOpen || !el) return undefined;
    const stop = (e: WheelEvent) => e.preventDefault();
    el.addEventListener('wheel', stop, { passive: false });
    return () => el.removeEventListener('wheel', stop);
  }, [menuOpen]);
  // Desktop "Find Storage" mega menu. Click-to-open: it holds three columns and a
  // scroll region, which a hover panel loses the moment the pointer clips a gap.
  const [megaOpen, setMegaOpen] = useState(false);
  // Desktop hover mega-menu: which top-level link is open, and which of its
  // rows is currently hovered (plus that row's vertical offset so the city
  // panel lines up with it).
  const [openLink, setOpenLink] = useState<string | null>(null);
  const [subIndex, setSubIndex] = useState<number | null>(null);
  const [subTop, setSubTop] = useState(0);
  // Mobile menu: which accordion rows are open, keyed by full path so nested
  // (state › city › facility) accordions each open independently.
  const [mobileOpen, setMobileOpen] = useState<Record<string, boolean>>({});
  const toggleMobile = (key: string) =>
    setMobileOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  // Phone from the Duda `Properties` collection when available; the prop/default
  // stays as the fallback (this bundle holds no API key — collection only).
  const [livePhone, setLivePhone] = useState<{ phone: string; digits: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPropertyContact('#02 nav', propertyId)
      .then((c) => {
        if (!cancelled && c?.phone) setLivePhone({ phone: c.phone, digits: c.phoneDigits });
      })
      .catch((err) => console.error('[NavigationBar] property contact error:', err));
    return () => { cancelled = true; };
  }, [propertyId]);

  // Find Storage, built from the `Properties` collection: state › city › facility,
  // grouped off each property's `slug`. Empty until it loads, and empty for good in
  // the Duda editor and the dev harness (no dmAPI) — both keep the hardcoded menu.
  const [locationTree, setLocationTree] = useState<NavState[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchLocationTree('#02 nav', { basePath: locationBasePath, cityBasePath })
      .then((tree) => { if (!cancelled) setLocationTree(tree); })
      .catch((err) => console.error('[NavigationBar] location tree error:', err));
    return () => { cancelled = true; };
  }, [locationBasePath, cityBasePath]);

  // The whole menu, read from the site's page tree via dmAPI: every page marked
  // "show in navigation", in Duda's order, with visible sub-pages nested. Empty
  // in the Duda editor and the harness (no dmAPI) — the hardcoded defaults cover
  // those, same as the location tree above.
  const [navTree, setNavTree] = useState<DudaNavItem[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchDudaNavigation()
      .then((tree) => { if (!cancelled) setNavTree(tree); })
      .catch((err) => console.error('[NavigationBar] nav tree error:', err));
    return () => { cancelled = true; };
  }, []);

  // What the mega menu renders. The Duda EDITOR and the dev harness have no
  // dmAPI, so the tree above stays empty there — the demo tree keeps the panel
  // populated while someone is working on the page instead of showing an editor
  // three empty columns.
  const megaTree = useMemo(
    () => (locationTree.length
      ? locationTree
      : demoLocationTree(locationBasePath, cityBasePath, demoPortfolio)),
    [locationTree, locationBasePath, cityBasePath, demoPortfolio],
  );

  // Public window-event hook so ANY element on the Duda page — a Text link, an
  // HTML/Embed widget, another button — can open, close, or toggle the Find
  // Storage mega menu without reaching into React state or the trigger DOM.
  //
  //   window.dispatchEvent(new Event('tenantinc:find-storage:open'))
  //   window.dispatchEvent(new Event('tenantinc:find-storage:close'))
  //   window.dispatchEvent(new Event('tenantinc:find-storage:toggle'))
  //
  // Wired in BOTH mega and dropdown modes: even when the in-bar Find Storage
  // link is the hover cascade, an external text/HTML element can still pop the
  // mega panel. The mega menu component is always mounted below for the same
  // reason.
  //
  // The panel has its own mobile layout now, so these work at every width. The
  // drawer is closed on the way in: the two are full-screen layers and would
  // otherwise stack.
  //
  // Each handler ACKNOWLEDGES by calling preventDefault, so a caller that sends a
  // `cancelable` CustomEvent can tell whether a nav was actually here to answer
  // (see @shared/findStorageBus, and the same handshake in tierBus). The
  // breadcrumb's "Find Storage" crumb needs that: it is in a different bundle, a
  // page need not have a nav, and it must warn rather than look inert.
  // preventDefault on a NON-cancelable event is a no-op, so the plain
  // `new Event(...)` one-liner above keeps working exactly as documented.
  useEffect(() => {
    const open = (e: Event) => { setMenuOpen(false); setMegaOpen(true); e.preventDefault(); };
    const close = (e: Event) => { setMegaOpen(false); e.preventDefault(); };
    const toggle = (e: Event) => { setMenuOpen(false); setMegaOpen((o) => !o); e.preventDefault(); };
    window.addEventListener('tenantinc:find-storage:open', open);
    window.addEventListener('tenantinc:find-storage:close', close);
    window.addEventListener('tenantinc:find-storage:toggle', toggle);
    return () => {
      window.removeEventListener('tenantinc:find-storage:open', open);
      window.removeEventListener('tenantinc:find-storage:close', close);
      window.removeEventListener('tenantinc:find-storage:toggle', toggle);
    };
  }, []);

  const displayPhone = livePhone?.phone || phone;
  const telHref = phoneHref ?? `tel:${(livePhone?.digits || displayPhone).replace(/[^0-9+]/g, '')}`;
  // The SMS / "message" utility item was removed at the client's request — the
  // phone entry above is the only contact number in the bar now. (Live Chat is a
  // separate item, still controlled by `showChat`.)
  // Full override via `links`, else the default nav. The two hardcoded
  // destinations are re-applied so a Duda-supplied editor URL can't replace them.
  //
  // Deliberately NOT applied to the collection-built menu below: those hrefs come
  // from property slugs, not from Duda, so there is no editor URL to defend
  // against — and forceHardcodedLinks matches on LABEL, so a real city called
  // "Irvine" would have its link rewritten to the hardcoded testing URL. The live
  // data contains exactly that city.
  const baseLinks = forceHardcodedLinks(links ?? buildDefaultLinks());

  // Swap Find Storage's menu for the live one once the collection answers. An
  // explicit `links` override still wins — that's the caller taking full control.
  // The menu, in priority order:
  //  1. explicit `links` override — caller takes full control.
  //  2. live: the whole visible page tree, in Duda's order (dmAPI present).
  //  3. editor / harness (no dmAPI): the hardcoded defaults, so the bar isn't empty.
  // Find Storage keeps the custom mega menu — the render claims it by label — and
  // its dropdown-mode menu is filled from the Properties location tree.
  const linkList: NavLink[] = links
    ? baseLinks
    : navTree.length
      ? (navTreeToLinks(navTree) as NavLink[]).map((l) =>
          isFindStorageLink(l) && locationTree.length
            ? { ...l, hasDropdown: true, menu: locationTreeToMenu(locationTree) }
            : l,
        )
      : baseLinks;

  // Recursively render mobile sub-levels: a leaf is a link; a node with children
  // becomes a nested accordion toggle. Each deeper level indents 16px.
  const renderMobileChildren = (nodes: MobileMenuNode[], parentKey: string, depth: number): React.ReactNode =>
    nodes.map((node) => {
      const key = `${parentKey}/${node.label}`;
      const kids = node.children;
      const open = !!mobileOpen[key];
      const indent = depth > 0 ? { paddingLeft: 15 + depth * 16 } : undefined;
      if (!kids?.length) {
        return (
          <a key={key} className="nav-mm-sub-item" href={node.href} style={indent}>
            {node.icon && <span className="nav-mm-sub-icon">{node.icon}</span>}
            <span>{node.label}</span>
          </a>
        );
      }
      return (
        <React.Fragment key={key}>
          <button
            type="button"
            className={`nav-mm-sub-item nav-mm-sub-toggle${open ? ' is-open' : ''}`}
            style={indent}
            aria-expanded={open}
            onClick={() => toggleMobile(key)}
          >
            {node.icon && <span className="nav-mm-sub-icon">{node.icon}</span>}
            <span>{node.label}</span>
            <ChevronDown size={16} className={`nav-mm-chevron${open ? ' is-open' : ''}`} />
          </button>
          {open && renderMobileChildren(kids, key, depth + 1)}
        </React.Fragment>
      );
    });

  const closeMenus = () => {
    setOpenLink(null);
    setSubIndex(null);
  };

  // Desktop nav links. "Find Storage" opens the mega menu; the others keep the
  // two-level hover dropdown.
  //
  // REVERTING TO THE OLD FIND STORAGE MENU: the hover cascade below is untouched
  // and still drives Storage Types / Resources. Delete the `isFindStorage`
  // branches here (trigger + `hasMenu`), drop <FindStorageMegaMenu /> from the
  // markup at the bottom, and Find Storage falls straight back into the same
  // state › city › facility cascade it used before.
  const navLinks = (
    <ul className="nav-links">
      {linkList.map((link) => {
        // Only claim Find Storage for the mega popup when the editor has actually
        // opted into it — otherwise Find Storage falls into the same hover cascade
        // Storage Types / Resources use, driven by `link.menu`.
        const isFindStorage = useMega && isFindStorageLink(link);
        const hasMenu = !!link.menu?.length && !isFindStorage;
        const isOpen = hasMenu && openLink === link.label;
        const activeItem = isOpen && subIndex != null ? link.menu![subIndex] : undefined;
        // A dropdown parent with no real destination (a Duda folder → '#' or empty
        // path) must toggle, not navigate — <a href="#"> jumps to top and href=""
        // reloads the page. Render it as a button instead.
        const isFolderToggle = hasMenu && (!link.href || link.href === '#');
        return (
          <li
            key={link.label}
            className="nav-item"
            onMouseEnter={() => {
              if (!hasMenu) return;
              // A hover dropdown and the mega menu must not overlap on screen.
              setMegaOpen(false);
              setOpenLink(link.label);
            }}
            onMouseLeave={closeMenus}
          >
            {isFindStorage ? (
              <button
                type="button"
                className="nav-link nav-link-trigger"
                data-nav-mega-trigger
                aria-expanded={megaOpen}
                onClick={() => {
                  // Opening the panel closes any hover dropdown, so the two can
                  // never be on screen at once.
                  closeMenus();
                  setMegaOpen((o) => !o);
                }}
              >
                <span>{link.label}</span>
                {link.hasDropdown && (
                  <ChevronDown size={20} className={`nav-link-chevron${megaOpen ? ' is-open' : ''}`} />
                )}
              </button>
            ) : isFolderToggle ? (
              <button
                type="button"
                className="nav-link nav-link-trigger"
                aria-expanded={isOpen}
                onClick={() => {
                  setMegaOpen(false);
                  setOpenLink(isOpen ? null : link.label);
                }}
              >
                <span>{link.label}</span>
                {link.hasDropdown && (
                  <ChevronDown size={20} className={`nav-link-chevron${isOpen ? ' is-open' : ''}`} />
                )}
              </button>
            ) : (
              <a className="nav-link" href={link.href}>
                <span>{link.label}</span>
                {link.hasDropdown && <ChevronDown size={20} className="nav-link-chevron" />}
              </a>
            )}

            {isOpen && (
              <div className="nav-dropdown">
                <ul className="nav-dd-panel">
                  {link.menu!.map((item, i) => (
                    <li
                      key={item.label}
                      className={`nav-dd-item${subIndex === i ? ' is-active' : ''}`}
                      onMouseEnter={(e) => {
                        setSubIndex(i);
                        setSubTop((e.currentTarget as HTMLElement).offsetTop);
                      }}
                    >
                      <a className="nav-dd-link" href={item.href}>
                        {item.icon && <span className="nav-dd-icon">{item.icon}</span>}
                        <span>{item.label}</span>
                      </a>
                      {item.children?.length ? (
                        <ChevronRight size={16} className="nav-dd-arrow" />
                      ) : null}
                    </li>
                  ))}
                </ul>

                {/* TWO levels only: state › city. The facility flyout that used to
                    hang off each city is gone — three nested hover panels is a lot
                    of target to keep the pointer inside, and the city row already
                    goes to /locations/<state>/<city>, which lists its facilities.
                    So the leaf is one click further away, not unreachable.
                    `sub.children` is still populated (the mobile drawer renders
                    all three levels); this variant just stops reading it. */}
                {activeItem?.children?.length ? (
                  <ul className="nav-subpanel" style={{ top: subTop }}>
                    {activeItem.children.map((sub) => (
                      <li key={sub.label} className="nav-sub-item">
                        <a href={sub.href}><span>{sub.label}</span></a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );

  // Secondary-bar utility row (also reused in the mobile drawer when the top bar is on).
  // Each item is gated by its own visibility toggle from the content menu.
  const topItems = (
    <div className="nav-top-items">
      {showPhone && (
        <a className="nav-top-item" href={telHref}>
          <PhoneIcon size={24} />
          <span>{displayPhone}</span>
        </a>
      )}
      {showChat && (
        <a className="nav-top-item" href={liveChatUrl}>
          <MessageAiIcon size={24} />
          <span>{liveChatLabel}</span>
        </a>
      )}
      {showPayBill && (
        <a className="nav-top-item" href={payBillUrl}>
          <CreditCardIcon size={24} />
          <span>{payBillLabel}</span>
        </a>
      )}
      {showLanguage && (
        <button className="nav-top-item nav-lang" type="button">
          <UsFlagIcon />
          <span>{language}</span>
          <ChevronDown size={24} className="nav-link-chevron" />
        </button>
      )}
      {showAccount && (
        <a className="nav-top-item" href={accountUrl}>
          <UserCircleIcon size={24} />
          <span>{accountLabel}</span>
        </a>
      )}
    </div>
  );

  // Inline actions used only when the top bar is OFF (single-bar layout).
  const actions = (
    <div className="nav-actions">
      {showPhone && (
        <a className="nav-phone" href={telHref}>
          <PhoneIcon size={24} />
          <span>{displayPhone}</span>
        </a>
      )}
      {showPayBill && <a className="nav-paybill" href={payBillUrl}>{payBillLabel}</a>}
      {/* Language first, then chat, then account. */}
      {showLanguage && (
        <button className="nav-icon-btn nav-lang" type="button" aria-label="Language">
          <UsFlagIcon width={26} height={18} />
          <ChevronDown size={20} className="nav-link-chevron" />
        </button>
      )}
      {/* The glyph IS the control (6380-125980 draws these at the size of their
          box), rather than a small mark floating in the middle of one. 40 by
          preference over the frame's 44. The stroke stays a true 2px either
          way — see the note on MessageAiIcon. */}
      {showChat && (
        <button className="nav-icon-btn" aria-label="AI chat">
          <MessageAiIcon size={40} />
        </button>
      )}
      {showAccount && (
        <a className="nav-icon-btn" href={accountUrl} aria-label="Account">
          <UserCircleIcon size={40} />
        </a>
      )}
    </div>
  );

  // Normalise the enum-style props so an empty/unknown value from Duda can never
  // produce e.g. a `logo-` class that renders no logo at all.
  const isWide = height === 'wide';
  const logoMode = logoStyle === 'inline' ? 'inline' : 'banner';
  const sepMode = separator === 'line' || separator === 'none' ? separator : 'shadow';

  const barClass = [
    'nav-bar',
    showTopBar ? 'has-topbar' : '',
    isWide ? 'is-wide' : '',
    `logo-${logoMode}`,
    `sep-${sepMode}`,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <nav className={barClass}>
      {showTopBar && (
        <div className="nav-topbar">
          <div className="nav-topbar-inner">{topItems}</div>
        </div>
      )}

      <div className="nav-primary">
        <div className="nav-inner">
          {logoMode === 'inline' && (
            <a className="nav-logo-inline" href={homeLink} aria-label="Home">
              <img className="nav-logo-img" src={logoSrc} alt="storelocal storage" />
            </a>
          )}
          <div className="nav-right">
            {navLinks}
            {!showTopBar && actions}
          </div>
          {/* Call and menu, in that order (Figma 11665-237163). The number is
              the same one the top bar shows — live from the Company collection
              when there is one, the `phone` prop otherwise — so a visitor never
              gets two different numbers for the same site. */}
          <div className="nav-mobile-actions">
            <a className="nav-mobile-call" href={telHref} aria-label={`Call ${displayPhone}`}>
              <PhoneCallIcon size={30} />
            </a>
            <button className="nav-burger" onClick={() => setMenuOpen(true)} aria-label="Open menu">
              <HamburgerIcon />
            </button>
          </div>
        </div>
      </div>

      {/* Find Storage mega menu — always mounted so an external element (a
          Duda Text link, an HTML/Embed widget) can pop it via the
          `tenantinc:find-storage:*` window events even when the in-bar Find
          Storage link is the hover cascade ('dropdown' mode). Below 1024px this
          panel is display:none and those events open the drawer instead. */}
      <FindStorageMegaMenu open={megaOpen} onClose={() => setMegaOpen(false)} tree={megaTree} />

      {/* Raised logo tile — absolutely positioned so it spans both bars and
          protrudes below. Space is reserved via padding-left on the bar inners
          so it never overlaps the nav content. Only in 'banner' mode. */}
      {logoMode === 'banner' && (
        <a className="nav-logo" href={homeLink} style={{ background: logoBg }} aria-label="Home">
          <img className="nav-logo-img" src={logoSrc} alt="storelocal storage" />
        </a>
      )}

      {/* Mobile slide-out menu (hamburger). Always mounted so it animates both
          in and out; `is-open` drives the slide + overlay fade. */}
      <div className={`nav-mobile-menu${menuOpen ? ' is-open' : ''}`} role="dialog" aria-modal="true" aria-hidden={!menuOpen}>
        <div className="nav-mm-overlay" ref={mmOverlayRef} onClick={() => setMenuOpen(false)} />
        <div className="nav-mm-panel">
          <div className="nav-mm-header">
            <a className="nav-mm-logo" href={homeLink} aria-label="Home">
              <img className="nav-mm-logo-img" src={logoSrc} alt="storelocal storage" />
            </a>
            <button className="nav-mm-close" onClick={() => setMenuOpen(false)} aria-label="Close menu">
              {/* Filled disc: .nav-mm-panel is #fff. 32 fills the button box,
                  which lost its 4px padding so the mark is a true 32. */}
              <CloseCircleIcon size={32} />
            </button>
          </div>

          <div className="nav-mm-body">
            {/* The grey block (Figma 7101-46038) holds BOTH the four circles and
                the search bar. The search used to sit outside it on white, which
                is why it read as a separate strip rather than part of the
                header. */}
            <div className="nav-mm-top">
            {/* Quick actions */}
            <div className="nav-mm-quick">
              <a className="nav-mm-quick-item" href="#">
                <span className="nav-mm-circle"><EnvelopeIcon size={22} /></span>
                <span className="nav-mm-quick-label">Email</span>
              </a>
              <a className="nav-mm-quick-item" href={telHref}>
                <span className="nav-mm-circle"><PhoneIcon size={22} /></span>
                <span className="nav-mm-quick-label">Phone</span>
              </a>
              <a className="nav-mm-quick-item" href="#">
                <span className="nav-mm-circle"><MapPinIcon size={22} /></span>
                <span className="nav-mm-quick-label">Map</span>
              </a>
              <a className="nav-mm-quick-item" href={payBillUrl}>
                <span className="nav-mm-circle"><CreditCardIcon size={22} /></span>
                <span className="nav-mm-quick-label">Billpay</span>
              </a>
            </div>

            {/* Location search — the whole bar is the way into the full-screen
                Find Storage panel, which is where the real search field, the
                state list and the city list live. Tapping ANY part of it (field,
                type, magnifier) swaps the drawer for that panel; nothing is typed
                here, hence `readOnly` — a keyboard would slide up over a field
                that is about to be replaced. */}
            <form
              className="nav-mm-search"
              onSubmit={(e) => e.preventDefault()}
              onClick={() => { setMenuOpen(false); setMegaOpen(true); }}
            >
              <input
                className="nav-mm-search-input"
                type="text"
                placeholder="City, ZIP or Address"
                aria-label="Search location"
                readOnly
              />
              <span className="nav-mm-search-divider" />
              <button className="nav-mm-search-type" type="button">
                <span>Storage</span>
                <ChevronDown size={16} />
              </button>
              <button className="nav-mm-search-btn" type="submit" aria-label="Search">
                <SearchIcon size={20} />
              </button>
            </form>
            </div>

            {/* Account / utility links — inset on the wrapping div, see below */}
            <div className="nav-mm-account-inset">
              <ul className="nav-mm-account">
                <li><a href="#"><LoginIcon size={24} /><span>Login</span></a></li>
                <li><a href={accountUrl}><UserCircleIcon size={24} /><span>{accountLabel}</span></a></li>
                <li><a href={liveChatUrl}><MessageAiIcon size={24} /><span>{liveChatLabel}</span></a></li>
                <li><a href="#"><KeyIcon size={24} /><span>Get Gatecode</span></a></li>
                <li><a href="#"><CreditCardIcon size={24} /><span>Find my Reservation</span></a></li>
              </ul>
            </div>

            <div className="nav-mm-divider" />

            {/* Nav accordion — recurses into nested state › city › facility levels.
                The inset lives on the wrapping div, not the <ul>: Duda's global
                stylesheet resets list padding from an id-scoped selector, which
                outranks any single class of ours, so a padded <ul> collapsed flush
                to the drawer's left edge on a live site. */}
            <div className="nav-mm-nav-inset">
            <ul className="nav-mm-nav">
              {linkList.map((link) => {
                const expandable = !!link.menu?.length;
                const open = !!mobileOpen[link.label];
                return (
                  <li key={link.label} className="nav-mm-nav-item">
                    {expandable ? (
                      <button
                        type="button"
                        className={`nav-mm-nav-row${open ? ' is-open' : ''}`}
                        aria-expanded={open}
                        onClick={() => toggleMobile(link.label)}
                      >
                        <span>{link.label}</span>
                        <ChevronDown size={16} className={`nav-mm-chevron${open ? ' is-open' : ''}`} />
                      </button>
                    ) : (
                      <a className="nav-mm-nav-row" href={link.href}>
                        <span>{link.label}</span>
                      </a>
                    )}

                    {expandable && open && (
                      <div className="nav-mm-sub">
                        {renderMobileChildren(link.menu!, link.label, 0)}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
