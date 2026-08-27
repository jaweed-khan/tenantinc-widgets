import React, { useEffect, useMemo, useRef, useState } from 'react';
import './Footer.css';
import tenantLogo from './tenant-logo.svg';
import { SOCIALS, PhoneIcon, AiSparkleIcon, ChevronBigRightIcon } from './icons';
import { fetchPropertyContact, DEFAULT_PROPERTY_ID, type PropertyContact } from '@shared/propertyContact';
import { readSitePages, pageColumnFor, parseRoutes, type SitePage } from '@shared/sitePages';
import { openFindStorage } from '@shared/findStorageBus';
import { hasCollectionsApi } from '@shared/dudaCollections';
import { fetchAllLocations, normalizeBasePath, type FooterLocation } from './allLocations';

// ---------------------------------------------------------------------------
// Types + fallback data
// ---------------------------------------------------------------------------

interface FooterLink {
  label: string;
  href: string;
  /** Opens in a new tab — see SITEMAP_LINK for the only case that sets it. */
  external?: boolean;
}

interface LinkColumn {
  heading: string;
  links: FooterLink[];
}

/**
 * The two link columns are built ENTIRELY from the site's own page tree — there
 * is no hardcoded stand-in any more, and that removal is the point.
 *
 * There used to be a list of the frame's placeholder labels with an href guessed
 * from the route (`<route>/<slugified label>`), rendered wherever the tree could
 * not be read. On a published site those rows were indistinguishable from a
 * working column while pointing at pages that mostly do not exist, so a footer
 * full of 404s looked exactly like a footer that worked. A column with no pages
 * behind it is now simply NOT RENDERED — see `column()` below.
 *
 * The visible consequence, and it is intended: in the Duda editor and the dev
 * harness (no `dmAPI`, so no tree) Storage Types is absent and Company
 * Information shows Sitemap alone. Use `?mockCollections=1` in the harness to
 * see them populated.
 *
 * SITEMAP IS THE ONE EXCEPTION, and it is not a placeholder: `/sitemap.xml` is a
 * file every published Duda site serves, so it always resolves and needs nothing
 * from the page tree. That is enough to earn a column on its own — see
 * `companyColumn`.
 */

/**
 * The last row of the Company Information column — the ONE link that is not a
 * page in the tree, and only when that column has route-driven rows above it.
 *
 * `/sitemap.xml` can never come out of the page tree — it is a file Duda
 * generates, not a page an editor created — so it is appended rather than
 * expected from the route. It is not a placeholder either: every published Duda
 * site serves it, so unlike the labels this file used to hardcode it always
 * resolves. `showSitemapLink={false}` drops it.
 *
 * `external: true` (→ `target="_blank"`) is what makes the actual sitemap open.
 * A Duda site can register a client-side routing callback, and an in-page
 * navigation to a path that is not a page is exactly the case that ends at the
 * site's 404 instead of at the XML; a new tab hands the URL to the browser and
 * bypasses the router entirely. It is also the friendlier behaviour for a raw
 * XML file — the visitor keeps the page they were on.
 */
const SITEMAP_LINK: FooterLink = { label: 'Sitemap', href: '/sitemap.xml', external: true };

/**
 * Heading for the Company Information column when no route matched — i.e. the
 * Sitemap-only case. Every other column takes its heading from the branch page
 * the operator pointed it at.
 */
const COMPANY_HEADING = 'Company Information';

const DEFAULT_PROPERTY_BASE_PATH = '/storage-units';

/**
 * Demo entries for the "All Storage Locations" panel — the frame's own sample
 * data, verbatim.
 *
 * Gated on `hasCollectionsApi()` being FALSE, i.e. the Duda editor and the dev
 * harness, exactly as the mega menu's demo location tree is. Never on an empty
 * result: on a published page with no `PropertiesInternal` collection the panel
 * and its toggle simply do not render, because twenty invented addresses on a
 * live site are far worse than a missing section.
 */
const DEMO_LOCATIONS: FooterLocation[] = [
  ['San Diego', 'CA', '4567 Mission Blvd', '92109'],
  ['Los Angeles', 'CA', '1234 Sunset Blvd', '90026'],
  ['San Francisco', 'CA', '789 Market St', '94103'],
  ['Sacramento', 'CA', '321 Capitol Mall', '95814'],
  ['Fresno', 'CA', '6544 N Blackstone Ave', '93710'],
  ['Irvine', 'CA', '7890 Barranca Pkwy', '92618'],
  ['Burbank', 'CA', '4321 Magnolia Blvd', '91505'],
  ['Oakland', 'CA', '5678 Broadway', '94611'],
  ['Santa Clara', 'CA', '8765 El Camino Real', '95051'],
  ['Bakersfield', 'CA', '3456 Stockdale Hwy', '93309'],
  ['Long Beach', 'CA', '3456 E 7th St', '90804'],
].map(([city, state, street, zip], i) => ({
  id: `demo-${i}`,
  label: `Self Storage In ${city}, ${state}`,
  street,
  cityStateZip: `${city}, ${state} ${zip}`,
  // A plausible slug so the editor sees real links rather than plain text, with
  // the base path prefixed by the caller below. Demo only — a published page
  // reads the collection and never builds one.
  href: `california/${city.toLowerCase().replace(/\s+/g, '-')}/self-storage-${city.toLowerCase().replace(/\s+/g, '-')}`,
}));

/**
 * Where the footer stacks — `.ft-aside` goes full width and the locations grid
 * drops to two columns (Footer.css). Reused here so the "scroll to the panel"
 * behaviour switches on at exactly the width where the panel starts opening
 * below the fold, rather than at a second number that could drift from the CSS.
 */
const STACKED_QUERY = '(max-width: 900px)';

/**
 * The cross-widget sticky stack's element id (`@shared/stickyStack`). #03's
 * contact row and #05's filter bar are `position: fixed` at the top of the
 * viewport for the whole page on mobile — the footer included — so scrolling the
 * locations panel to `block: 'start'` would tuck its heading underneath them.
 * Read by id rather than imported because the stack is appended to <body> by
 * whichever widget owns it, and the footer only needs its HEIGHT.
 */
const STICKY_STACK_ID = 'ti-sticky-stack';

/** Breathing room above the panel once it has been scrolled to. */
const SCROLL_GAP_PX = 16;

/**
 * Duda content-menu fields are TEXT inputs, so a toggle arrives as the STRING
 * `'false'` — which is truthy, and would switch a feature on for every operator
 * who explicitly turned it off. Same coercion #07's props do.
 */
function boolProp(v: unknown): boolean {
  if (typeof v === 'string') return !/^(|false|0|no|off)$/i.test(v.trim());
  return Boolean(v);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface FooterProps {
  companyName?: string;
  phone?: string;
  description?: string;
  sessionId?: string;
  year?: number;
  /** Property whose phone + social links come from the `Properties` collection.
   *  The static values below remain the fallback. */
  propertyId?: string;
  /**
   * Route(s) in the SITE's own page structure whose child pages fill the
   * **Company Information** column, in the order the editor arranged them.
   *
   * **Several routes, comma separated** — the default is
   * `company-information,legal-pages`, so a site that keeps its legal pages in
   * their own top-level section gets `legal-pages/*` in this column alongside
   * `company-information/*`. A Duda content-menu field is one text input, hence
   * the comma rather than a list; `@shared/sitePages` splits it. Routes are
   * gathered in the order given, the FIRST matched branch supplies the heading,
   * and an href reached by two routes (a `legal-pages` branch nested under
   * `company-information`, say) is listed once.
   *
   * Each route is matched loosely (`@shared/sitePages`) against every page's
   * alias, path, last path segment and title, so `legal-pages`,
   * `/legal-pages/` and `Legal Pages` all name the same branch.
   *
   * **A route that matches nothing contributes nothing, and a column with no
   * pages at all is not rendered** — there is no hardcoded stand-in.
   */
  companyRoute?: string;
  /** Heading for that column. Default: the first matched branch's own title. */
  companyHeading?: string;
  /** Same, for the **Storage Types** column. Comma separated too. */
  storageTypesRoute?: string;
  storageTypesHeading?: string;
  /**
   * Append `/sitemap.xml` to the Company Information column. Default **true**,
   * and only ever added when that column has route-driven rows. See
   * `SITEMAP_LINK`.
   */
  showSitemapLink?: boolean | string;
  /**
   * Mirror the NAV exactly, dropping pages hidden from it. **Off by default —
   * hidden pages ARE listed**, because a footer column is where the pages kept
   * out of the top nav belong. See `@shared/sitePages`.
   */
  skipHiddenPages?: boolean | string;
  /** Prefix for the "All Storage Locations" links. Default `/storage-units`. */
  propertyBasePath?: string;
  /**
   * The Connect column's two destinations. Pages, not routes — they hold one
   * link each, so there is nothing to enumerate — but props rather than
   * constants so a site can retarget them without a rebuild of the bundle.
   */
  loginHref?: string;
  contactHref?: string;
}

export function Footer({
  companyName = 'Storage Outlet',
  phone = '(800) 645-9876',
  description = 'Storage Outlet, headquartered in Irvine, owns and operates 15 self storage properties across Southern California. Our locations offer a wide range of secure and conveniently located storage solutions, including personal storage, business storage, and vehicle storage options. We are committed to providing affordable, reliable, and professional storage experiences in every community we serve. With a focus on convenience, security, and customer service, Storage Outlet continues to grow as a trusted neighborhood storage provider.',
  sessionId = '24e6fb82-a285-4a73-b4dc-546500c76981',
  year = 2026,
  propertyId = DEFAULT_PROPERTY_ID,
  companyRoute = 'company-information,legal-pages',
  companyHeading,
  storageTypesRoute = 'storage-types',
  storageTypesHeading,
  skipHiddenPages,
  showSitemapLink = true,
  propertyBasePath = DEFAULT_PROPERTY_BASE_PATH,
  loginHref = '/login',
  contactHref = '/contact-us',
}: FooterProps) {
  // Phone + social links from the Duda `Properties` collection; the static values
  // above remain the fallback (this bundle holds no API key of its own).
  const [contact, setContact] = useState<PropertyContact | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPropertyContact('#13 footer', propertyId)
      .then((c) => { if (!cancelled) setContact(c); })
      .catch((err) => console.error('[Footer] property contact error:', err));
    return () => { cancelled = true; };
  }, [propertyId]);

  // ── The two route-driven columns ──────────────────────────────────────────
  // ONE read of the page tree feeds both. Two effects would each call
  // getNavItemsAsync for the same answer.
  const [pages, setPages] = useState<SitePage[] | null>(null);
  const skipHidden = boolProp(skipHiddenPages);

  useEffect(() => {
    let cancelled = false;
    readSitePages('#13 footer')
      .then((p) => { if (!cancelled) setPages(p); })
      .catch((err) => console.error('[Footer] site pages error:', err));
    return () => { cancelled = true; };
  }, []);

  /**
   * One column's links gathered from every route in the field, or **null** when
   * the tree has nothing under any of them. Used by Storage Types; Company
   * Information assembles its own below, because Sitemap keeps it alive with no
   * pages at all.
   *
   * `null` covers three cases that used to render placeholder rows and must not:
   * the tree has not been read yet (`pages === null`), there is no tree at all
   * (the Duda editor, the dev harness), and the routes simply are not on this
   * site. All three mean "we do not know of any pages here", and the honest
   * rendering of that is no column — a list of invented labels pointing at
   * `<route>/<label>` looks exactly like a working column while every row 404s.
   *
   * There is deliberately no skeleton for the read: the footer is at the bottom
   * of the page, and a column appearing once the tree resolves is better than a
   * shimmer nobody scrolls to.
   */
  const column = (
    route: string,
    heading: string | undefined,
  ): LinkColumn | null => {
    if (!route || !pages?.length) return null;
    const col = pageColumnFor(pages, route, { skipHidden });
    if (!col.links.length) return null;
    return { heading: heading || col.heading, links: col.links };
  };

  /**
   * Company Information: the pages under `companyRoute` — by default BOTH
   * `company-information/*` and `legal-pages/*` — with **Sitemap always last**.
   *
   * This column is the one exception to "no pages ⇒ no column". Sitemap is a
   * real, always-present Duda URL rather than a guessed placeholder, so it is
   * worth a column on its own: an operator who has not built either route yet
   * still gets a working link, and it is the only footer row that needs nothing
   * from the page tree. So the column renders even where the tree is unreadable
   * — the Duda editor and the dev harness included.
   *
   * `showSitemapLink={false}` opts out, and then this column behaves like
   * Storage Types: no pages, no column.
   */
  const companyColumn = useMemo<LinkColumn | null>(() => {
    const col = companyRoute && pages?.length
      ? pageColumnFor(pages, companyRoute, { skipHidden })
      : null;
    const links = col ? [...col.links] : [];
    if (boolProp(showSitemapLink)) links.push(SITEMAP_LINK);
    if (!links.length) return null;
    // The heading comes from the first matched branch where there is one, so a
    // site that named its section something else is followed. COMPANY_HEADING is
    // only reached with no matched route at all — a heading is a section label,
    // not a link, so unlike the old fallback rows it cannot point anywhere wrong.
    return { heading: companyHeading || col?.heading || COMPANY_HEADING, links };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, skipHidden, companyRoute, companyHeading, showSitemapLink]);

  const storageTypesColumn = useMemo(
    () => column(storageTypesRoute, storageTypesHeading),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pages, skipHidden, storageTypesRoute, storageTypesHeading],
  );

  /** Two account actions, not pages under any route — so never tree-driven. */
  const connectColumn = useMemo<LinkColumn>(() => ({
    heading: 'Connect',
    links: [
      { label: 'Login', href: loginHref },
      { label: 'Contact us', href: contactHref },
    ],
  }), [loginHref, contactHref]);

  // The tree WAS readable but a route is not in it — a typo in the field, or the
  // pages have not been created yet. Worth saying: the column is now simply
  // absent, and a missing footer column gives no hint that a route name is the
  // cause. Reported per route, because the field holds several and one of them
  // missing is the normal case (a site with no separate `legal-pages` section).
  useEffect(() => {
    if (!pages?.length) return;
    for (const field of [companyRoute, storageTypesRoute]) {
      if (!field) continue;
      const { matched, missing } = pageColumnFor(pages, field, { skipHidden });
      for (const route of missing) {
        // eslint-disable-next-line no-console
        console.warn(`[Footer] no pages under "${route}" in the site's page tree — that route contributes nothing`);
      }
      if (!matched.length) {
        // The Company Information column still renders — Sitemap needs no page
        // tree — so the two cases get different advice.
        const tail = field === companyRoute
          ? 'that column shows only the Sitemap link'
          : 'that footer column is not rendered';
        // eslint-disable-next-line no-console
        console.warn(`[Footer] none of "${parseRoutes(field).join('", "')}" matched — ${tail}`);
      }
    }
  }, [pages, companyRoute, storageTypesRoute, skipHidden]);

  // ── "All Storage Locations" ───────────────────────────────────────────────
  const propertyBase = useMemo(() => normalizeBasePath(propertyBasePath), [propertyBasePath]);
  const [locations, setLocations] = useState<FooterLocation[] | null>(null);
  const [locationsOpen, setLocationsOpen] = useState(false);

  useEffect(() => {
    // No dmAPI at all ⇒ the editor or the harness, so show the frame's demo
    // entries. Gated on the API being ABSENT and never on an empty result — see
    // DEMO_LOCATIONS.
    if (!hasCollectionsApi()) {
      // Prefixed here rather than in the constant so the editor preview honours
      // whatever `propertyBasePath` the operator configured.
      setLocations(DEMO_LOCATIONS.map((l) => ({ ...l, href: `${propertyBase}/${l.href}` })));
      return undefined;
    }
    let cancelled = false;
    fetchAllLocations(propertyBase)
      .then((l) => { if (!cancelled) setLocations(l); })
      .catch((err) => console.error('[Footer] all locations error:', err));
    return () => { cancelled = true; };
  }, [propertyBase]);

  // The toggle is not rendered when there is nothing behind it, rather than
  // opening an empty panel.
  const hasLocations = !!locations?.length;

  // ── Opening the panel scrolls to it on a stacked layout ───────────────────
  // On a phone the footer is tall — the aside is full width and the description
  // runs to several lines — so "All Locations" opened a panel entirely below the
  // fold: the button appeared to do nothing. Desktop needs none of this; there
  // the panel lands immediately under the divider, already on screen.
  const locationsRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // Only on the way OPEN. Collapsing scrolls nowhere — the visitor is already
    // looking at the toggle, and yanking the page on close reads as a bug.
    if (!locationsOpen) return;
    const el = locationsRef.current;
    if (!el || typeof el.scrollIntoView !== 'function') return;

    // The width is read HERE rather than through a `useMediaQuery` hook, and
    // that is deliberate: nothing in the render depends on it, and a hook would
    // re-run this effect on every resize — so narrowing the window with the
    // panel already open would jump the page. Only the width at the moment of
    // the click matters.
    if (typeof window.matchMedia !== 'function') return;
    if (!window.matchMedia(STACKED_QUERY).matches) return;

    // The panel is `hidden` until this render, so it has only just gained a box;
    // this effect runs after commit, which is why the measurement is valid here
    // and would not have been in the click handler.
    const stack = document.getElementById(STICKY_STACK_ID);
    el.style.scrollMarginTop = `${(stack?.offsetHeight ?? 0) + SCROLL_GAP_PX}px`;

    // Honour the OS setting: a long smooth scroll is exactly the motion people
    // turn this off for. (matchMedia is known to exist by here.)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }, [locationsOpen]);

  const onFindStorage = (): void => {
    // #02 acknowledges by calling preventDefault. Nothing to fall back to on a
    // page with no nav — the mega menu IS the destination — so say so instead of
    // leaving the visitor clicking a control that never responds.
    if (!openFindStorage()) {
      // eslint-disable-next-line no-console
      console.warn('[Footer] Find Storage: no navigation bar (#02) on this page answered the open request');
    }
  };

  const displayPhone = contact?.phone || phone;
  // "Follow <name>" takes the property name from the collection; the copyright
  // line below deliberately keeps the `companyName` prop (see note there).
  const displayFollowName = contact?.name || companyName;
  const telHref = `tel:${(contact?.phoneDigits || displayPhone).replace(/[^0-9+]/g, '')}`;

  // With live data, show only the platforms this property actually has, linked.
  // Without it, keep the full static row (unlinked) exactly as before.
  const socialLinks = contact?.socials.length
    ? SOCIALS
        .filter((s) => contact.socials.some((c) => c.platform === s.key))
        .map((s) => ({ ...s, href: contact.socials.find((c) => c.platform === s.key)!.url }))
    : SOCIALS.map((s) => ({ ...s, href: '#' }));

  return (
    <div className="ft-wrapper">
      <div className="ft-inner ft-top">
        <div className="ft-links">
          {/* Route-driven, so either column can be absent — see `column()`. */}
          {companyColumn && <LinkColumnView column={companyColumn} />}
          {storageTypesColumn && <LinkColumnView column={storageTypesColumn} />}

          {/* Locations — the one column whose rows are controls, not pages. */}
          <nav className="ft-col" aria-label="Locations">
            <p className="ft-col-heading">Locations</p>
            <ul className="ft-list">
              <li>
                <button className="ft-link ft-link-btn" type="button" onClick={onFindStorage}>
                  Find Storage
                </button>
              </li>
              {hasLocations && (
                <li>
                  <button
                    className="ft-link ft-link-btn ft-link-toggle"
                    type="button"
                    aria-expanded={locationsOpen}
                    aria-controls="ft-all-locations"
                    onClick={() => setLocationsOpen((v) => !v)}
                  >
                    <span>All Locations</span>
                    <span className={`ft-chevron${locationsOpen ? ' ft-chevron--open' : ''}`}>
                      <ChevronBigRightIcon size={24} />
                    </span>
                  </button>
                </li>
              )}
            </ul>
          </nav>

          <LinkColumnView column={connectColumn} />
        </div>

        <div className="ft-aside">
          <div className="ft-help">
            <p className="ft-help-heading">Need Help?</p>
            <a className="ft-help-row" href={telHref}>
              <PhoneIcon size={24} />
              <span>{displayPhone}</span>
            </a>
            <button className="ft-help-row ft-help-chat" type="button">
              <AiSparkleIcon size={24} />
              <span>Live Chat</span>
            </button>
          </div>
          <p className="ft-desc">{description}</p>
        </div>
      </div>

      <div className="ft-divider" />

      {/* Kept in the DOM while collapsed (hidden), so the toggle's
          aria-controls always points at something that exists. */}
      {hasLocations && (
        <section className="ft-locations" id="ft-all-locations" ref={locationsRef} hidden={!locationsOpen}>
          <div className="ft-inner">
            <p className="ft-locations-heading">All Storage Locations</p>
            <div className="ft-locations-grid">
              {locations!.map((loc) => (
                <LocationEntry key={loc.id} location={loc} />
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="ft-inner ft-follow">
        <div className="ft-follow-left">
          <span className="ft-follow-label">Follow {displayFollowName}</span>
          <div className="ft-socials">
            {socialLinks.map(({ key, label, Icon, href }) => (
              <a key={key} className="ft-social" href={href} aria-label={label} title={label}>
                <Icon />
              </a>
            ))}
          </div>
        </div>
        <div className="ft-powered">
          <span className="ft-powered-label">powered by</span>
          <img className="ft-tenant" src={tenantLogo} alt="Tenant" />
        </div>
      </div>

      <div className="ft-bottom">
        <div className="ft-inner ft-bottom-row">
          {/* Left on the prop on purpose: the collection's `name` is the FACILITY
              ("Storelocal Dove Mountain"), and a copyright line should name the
              company. Swap to displayFollowName if that's wanted. */}
          <span className="ft-copy">© {year}, {companyName}. All Rights Reserved.</span>
          <span className="ft-session">Session: {sessionId}</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function LinkColumnView({ column }: { column: LinkColumn }): React.ReactElement {
  return (
    <nav className="ft-col" aria-label={column.heading}>
      <p className="ft-col-heading">{column.heading}</p>
      <ul className="ft-list">
        {column.links.map((link) => (
          <li key={link.label}>
            <a
              className="ft-link"
              href={link.href}
              {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * One three-line entry. The WHOLE block is the link (the frame underlines all
 * three lines), and a facility with no slug renders the same block without an
 * `<a>` rather than a dead link — the address is still worth reading.
 */
function LocationEntry({ location }: { location: FooterLocation }): React.ReactElement {
  const body = (
    <>
      <span className="ft-loc-title">{location.label}</span>
      {location.street && <span className="ft-loc-line">{location.street}</span>}
      <span className="ft-loc-line">{location.cityStateZip}</span>
    </>
  );
  return location.href
    ? <a className="ft-loc" href={location.href}>{body}</a>
    : <div className="ft-loc ft-loc--plain">{body}</div>;
}
