// ===========================================================================
// Widget #08 — Map Locations (city page). Figma 10622:77201.
//
// Header row (count + Filter / sort pills), then a fixed-height row: a scrolling
// column of property cards on the left and a Google map on the right that stays
// put while the cards scroll. Below that, the city's SEO copy.
//
// The map is the shared keyless `output=embed` iframe with our own DOM bubbles
// projected on top (@shared/NearbyMap) — no Maps JS API, no key, nothing for
// Duda's CSP to block. The Figma bubbles differ from #07's pins, so this widget
// passes `renderPin` rather than restyling the shared component.
//
// DATA: the city's properties come from /properties (collection-first) and each
// one's spaces from /space-groups/…/groups — the same two-call chain #05's
// "Nearby Storage" uses, staged the same way. See ./api.ts. ./data.ts is now
// only the pre-first-response placeholder for the Duda editor and the harness.
// ===========================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import './MapLocations.css';
import { NearbyMap, type MapPoint, type PositionedPoint } from '@shared/NearbyMap';
import { RichText } from '@shared/richText';
import { CloseCircleIcon } from '@shared/ui';
import { CITY_FACILITIES, type CityFacility, type CityUnit } from './data';
import { PROPERTY_IMAGES } from '@shared/demoImages';
import { FilterPanel } from './FilterPanel';
import {
  INITIAL_FILTERS, activeFilterCount, filterFacilities, deriveFilterOptions, visibleUnits,
  type FilterState,
} from './filters';
import { fetchPlaceProperties, fetchCitySpaces, toCityFacility, type PlaceScope } from './api';
import { getUserLocation } from '@shared/nearbyProperties';
import { resolveCompanyIdFromSources } from '@shared/companySource';
import { stateNameFromCode, stateCodeFromName } from '@shared/usStates';
import { slugLabel } from '@shared/propertyNav';
import { rentalHref, saveUnitSelection } from '@shared/unitHandoff';
import { fetchGoogleRatingsByPlace, ratingForProperty, type RatingSummary } from '@shared/reviewsCollections';
import { hasCollectionsApi } from '@shared/dudaCollections';
import { Shimmer } from '@shared/Shimmer';
import cfg from './config.json';
import { useMediaQuery, MOBILE_STICKY_QUERY } from '@shared/stickyStack';
import { FilterIcon, ChevronBigDownIcon, SortIcon, StarIcon, TagIcon, MapLocationIcon } from './icons';
import { Breadcrumb, locationCrumbHead, normaliseBase, type Crumb } from '@shared/Breadcrumb';

// ── Icons (inline SVG — the AMD bundle can't load remote assets) ─────────────

const Icon = {
  search: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.6-3.6" />
    </svg>
  ),
  /** map/map-location — the "Map View" toggle. */
  mapView: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),
  /** list/list-default — the "List View" toggle. */
  listView: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  ),
  pin: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),
  phone: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  ),
};

function Stars({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <span className="ml-stars">
      {Array.from({ length: full }, (_, i) => <StarIcon key={`f${i}`} />)}
      {half && <StarIcon half />}
    </span>
  );
}

// ── Unit row ────────────────────────────────────────────────────────────────

function UnitRow({
  unit, facility, rentalPageUrl, companyId,
}: {
  unit: CityUnit;
  /** The facility this unit belongs to — its id is what makes the handoff
   *  unambiguous on a city page listing several properties. */
  facility: CityFacility;
  rentalPageUrl?: string;
  companyId?: string;
}) {
  return (
    <div className="ml-unit">
      <div className="ml-unit-info">
        <span className="ml-unit-dims">{unit.dimensions}</span>
        <span className="ml-unit-subtype">{unit.subtype}</span>
      </div>

      <div className="ml-unit-prices">
        <span className="ml-unit-tag"><TagIcon size={16} /></span>
        <div className="ml-price-strike">
          <span className="ml-price-label">IN-STORE</span>
          <span className="ml-price-was">${unit.inStorePrice}</span>
        </div>
        <span className="ml-price-divider" />
        <div className="ml-price-start">
          <span className="ml-price-label ml-price-label--dark">STARTING AT</span>
          <span className="ml-price-now">${unit.startingPrice}</span>
        </div>
        {/* Straight to the rental page, with the unit handed over in
            localStorage (see @shared/unitHandoff). An anchor so Duda's router
            handles it in preview and published, and middle-click still works. */}
        <a
          className="ml-select"
          href={rentalHref(rentalPageUrl)}
          onClick={() => saveUnitSelection({
            tierId: unit.id,
            size: unit.dimensions,
            price: unit.startingPrice,
            propertyId: facility.id,
            companyId,
          })}
        >
          Select
        </a>
      </div>
    </div>
  );
}

// ── Property card ───────────────────────────────────────────────────────────

function PropertyCard({
  facility,
  index,
  active,
  compact,
  filters,
  rating,
  rentalPageUrl,
  companyId,
  propertyBasePath,
  onActivate,
  onSelect,
}: {
  facility: CityFacility;
  index: number;
  active: boolean;
  /** Mobile card: unit rows collapse to one "Units starting at $X" button. */
  compact: boolean;
  /** Active filters — the three listed spaces are drawn from the matching
   *  ones, so the card agrees with what the visitor filtered. */
  filters: FilterState;
  /** This property's Google rating, or null when the collection has none
   *  (and always in the editor/harness, where there is no dmAPI). */
  rating: RatingSummary | null;
  /** Passed down to each unit's Select — see @shared/unitHandoff. */
  rentalPageUrl?: string;
  companyId?: string;
  /** Where the property pages live, e.g. '/storage-units'. */
  propertyBasePath: string;
  /** Pointer entered the card — raises its marker. Hover, not intent. */
  onActivate: () => void;
  /** The card was CLICKED, which is intent: the visitor has moved on to this
   *  property, so a bubble still open over another one is stale. Separate from
   *  onActivate because hovering down the list must not dismiss it. */
  onSelect: () => void;
}) {
  // Three, per the design; "See All Spaces" covers the rest. A live property
  // has 26–38 tiers, so this is the difference between a card and a wall.
  const shown = visibleUnits(facility, filters);
  // The slug IS the property page's path — same base #02's nav links under.
  const propertyHref = facility.slug
    ? `${propertyBasePath}/${facility.slug.replace(/^\/+/, '')}`
    : undefined;
  const cls = [
    'ml-card',
    facility.featured ? 'ml-card--featured' : '',
    active ? 'ml-card--active' : '',
  ].filter(Boolean).join(' ');

  return (
    /* data-facility-id is the hook the map uses to scroll this card into view
       when its marker is clicked — see `revealCard`. An attribute rather than a
       ref map: the cards are rendered by a child component from a list that
       re-orders on sort, and threading refs back up for that is more moving
       parts than one lookup. */
    <article className={cls} data-facility-id={facility.id} onMouseEnter={onActivate} onClick={onSelect}>
      {/* Photo header — image, dark scrim, distance, and the property details */}
      <div className="ml-card-head">
        <img className="ml-card-photo" src={PROPERTY_IMAGES[index % PROPERTY_IMAGES.length]} alt="" />
        <span className="ml-card-scrim" />

        {facility.featured && (
          <div className="ml-featured">
            <StarIcon size={16} color="#fff" />
            <span>Featured Property</span>
          </div>
        )}

        {/* Only when it's actually known. NaN means no visitor location (or the
            property has no coordinates), and "NaN Miles" was rendering on the
            card. One decimal, so 3.4523 doesn't print in full. */}
        {Number.isFinite(facility.distanceMiles) && (
          <span className="ml-distance">{facility.distanceMiles.toFixed(1)} Miles</span>
        )}

        <div className="ml-card-data">
          <p className="ml-card-name">{facility.name}</p>

          {/* Rating from the GoogleReviews collection (see `rating` prop).
              Still conditional: it's absent in the Duda editor and the harness,
              where dmAPI doesn't exist, and rendering the row regardless printed
              a bare "0" with no stars — which reads as a one-star facility
              rather than an unrated one. */}
          {/* Reads the facility's stamped score, not the collection object
              directly, so the preview fallback shows here too (see `rated`).
              `rating` is still consulted for the outbound link, which only a
              real collection row can supply. */}
          {facility.rating > 0 && (
            <div className="ml-rating">
              <span className="ml-rating-score">{facility.rating}</span>
              <Stars rating={facility.rating} />
              {rating?.reviewsUrl ? (
                <a className="ml-reviews" href={rating.reviewsUrl} target="_blank" rel="noreferrer">
                  {facility.reviewCount} Reviews
                </a>
              ) : (
                // No destination in the collection — a bare <a href="#"> would
                // scroll the host page to the top when clicked.
                <span className="ml-reviews">{facility.reviewCount} Reviews</span>
              )}
            </div>
          )}

          <a
            className="ml-card-row ml-card-row--address"
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(facility.address)}`}
            target="_blank"
            rel="noreferrer"
            title={facility.address}
          >
            {Icon.pin}<span>{facility.address}</span>
          </a>

          <a className="ml-card-row" href={`tel:${facility.phone.replace(/[^0-9+]/g, '')}`}>
            {Icon.phone}<span>{facility.phone}</span>
          </a>
        </div>
      </div>

      {/* Available spaces */}
      <div className="ml-card-body">
        {facility.promo && (
          <div className="ml-promo">
            <TagIcon size={16} />
            <span className="ml-promo-text">{facility.promo}</span>
          </div>
        )}

        {compact ? (
          /* Goes to the property page — the same propertyHref "See All Spaces"
             uses on the wide card. It was a bare <button> with no handler, so
             the one control the mobile card offers did nothing at all.

             Unlike "See All Spaces" it cannot simply be dropped when the row
             has no slug: collapsing the unit rows makes this the ONLY place a
             mobile card shows its price. So it degrades to a plain <span>
             carrying the same text and no click affordance. */
          propertyHref ? (
            <a className="ml-cta" href={propertyHref}>
              Units starting at {facility.priceLabel}
            </a>
          ) : (
            <span className="ml-cta ml-cta--static">
              Units starting at {facility.priceLabel}
            </span>
          )
        ) : (
          <>
            <div className="ml-units">
              {shown.map((u) => (
                <UnitRow
                  key={u.id}
                  unit={u}
                  facility={facility}
                  rentalPageUrl={rentalPageUrl}
                  companyId={companyId}
                />
              ))}
            </div>

            <div className="ml-card-foot">
              <span className="ml-admin-fee">+ Plus ${facility.adminFee} Admin Fee</span>
              {/* Always offered, however few spaces the card lists — the link
                  goes to the property's own page, not just "more of this list",
                  so it is worth having even when nothing is hidden. Absent only
                  when the row carries no slug and there is nowhere to point. */}
              {propertyHref && (
                <a className="ml-see-all" href={propertyHref}>See All Spaces</a>
              )}
            </div>
          </>
        )}
      </div>
    </article>
  );
}

// ── Loading placeholders ────────────────────────────────────────────────────

/**
 * One card-shaped placeholder.
 *
 * It reuses PropertyCard's OWN class names rather than approximating the layout
 * with free-standing bars. That is what keeps the swap free of layout shift:
 * every container contributes its real geometry from the stylesheet — the head's
 * fixed 234px, the body's 24px padding and 16px gap, each row's 10px padding and
 * 1px rule — so only the leaf blocks need a height, and those are taken from the
 * type they stand in for rather than guessed:
 *
 *   .ml-unit-info    19 (dims, 16px/normal) + 16 (subtype, 12px/16px)  = 35
 *   .ml-unit-prices  max(12 + 24 price stack, 33 select)               = 36
 *   .ml-unit         10 + max(35, 36) + 10 + 1px rule                  = 57
 *   .ml-card-foot    19 ("See All Spaces", 16px/normal)                = 19
 *   card             234 + 48 + 16 + 3x57 + 19 + 8px border            = 496
 *
 * An earlier version sized these by eye and ran ~22px tall per card, which is
 * the shift this replaces. If the card's type scale changes, the numbers above
 * are the ones to revisit.
 *
 * Composed from @shared/Shimmer rather than new CSS, per that module's header:
 * each widget is its own bundle, so a skeleton carrying its own class names would
 * need the same rules copied into every stylesheet. It also inherits Shimmer's
 * `prefers-reduced-motion` handling, which MapLocations.css has nowhere of its own.
 */
function CardSkeleton({ compact }: { compact: boolean }) {
  return (
    <article className="ml-card ml-card--skeleton" aria-hidden="true">
      {/* `.ml-card-head` is a fixed 234px and clips to the card's 16px radius. */}
      <div className="ml-card-head">
        <Shimmer w="100%" h="100%" r={0} />
      </div>
      <div className="ml-card-body">
        {compact ? (
          /* The mobile card collapses its rows into one CTA (33px), so the
             placeholder has to as well or the phone layout jumps instead. */
          <Shimmer w="100%" h={33} r={4} />
        ) : (
          <>
            <div className="ml-units">
              {[0, 1, 2].map((i) => (
                <div className="ml-unit" key={i}>
                  {/* 17 + 4 + 14 = the 19 + 16 these stand in for. .ml-unit-info
                      carries no gap — in a real card its two children are TEXT,
                      held apart by their line boxes — so two solid bars fused
                      into one 35px block. The gap comes out of the bars rather
                      than being added to them, because the heights here are what
                      reserve the row and stop the column jumping on arrival. */}
                  <div className="ml-unit-info">
                    <Shimmer w={86} h={17} />
                    <Shimmer w={104} h={14} />
                  </div>
                  <div className="ml-unit-prices">
                    <Shimmer w={64} h={36} />
                    <Shimmer w={78} h={33} r={4} />
                  </div>
                </div>
              ))}
            </div>
            <div className="ml-card-foot">
              <Shimmer w={132} h={19} />
              <Shimmer w={92} h={19} />
            </div>
          </>
        )}
      </div>
    </article>
  );
}

/**
 * The listing column while the first /properties call is in flight.
 *
 * THREE cards, deliberately more than a small city returns: per the note in #15
 * blogs-page, over-reserving collapses the column on arrival while
 * under-reserving pushes the rest of the page down, and the second is the more
 * expensive mistake.
 *
 * No initial-delay grace period (unlike #06/#12/#15): this widget's properties
 * call measures ~430ms, so holding the skeleton back 200ms would only add a
 * third visible state — the same reasoning #03 records for its own load.
 */
function CitySkeleton({ compact, count = 3 }: { compact: boolean; count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => <CardSkeleton key={i} compact={compact} />)}
      <span className="ml-sr-only" role="status">Loading storage facilities…</span>
    </>
  );
}

// ── Props ───────────────────────────────────────────────────────────────────

export interface MapLocationsProps {
  /**
   * City shown in the heading and the SEO block, e.g. "Fullerton, CA".
   *
   * ALSO the match key: everything before the first comma is compared against
   * each property's `Address.city` (case- and spacing-insensitive), so "Fullerton,
   * CA" and "fullerton" both work. Blank lists every property rather than none.
   */
  city?: string;
  /**
   * State page scope, e.g. "california" or "CA". Set on `/locations/{state}`.
   * Normally omitted — it is read from the URL (see `locationBasePath`).
   */
  state?: string;
  /**
   * Path the location pages live under. `/locations` by default, matching the
   * links #02's mega menu builds, so `/locations/{state}` and
   * `/locations/{state}/{city}` are parsed off the URL with nothing passed from
   * Duda at all. Set it if the pages move.
   */
  locationBasePath?: string;
  /**
   * Company whose properties to list. Normally omitted — it resolves from the
   * `Company` collection, with config.json as the editor/harness fallback.
   */
  companyId?: string;
  /** Heading under the map. */
  seoHeading?: string;
  /** SEO copy. HTML is parsed (see @shared/richText); blank hides the block. */
  seoContent?: string;
  /**
   * CEILING on the pinned map's height, not its height. Left unset it scales
   * with the browser window; set it to hold the map shorter than the viewport.
   * Either way it is capped to the viewport so it cannot overflow it.
   */
  rowHeight?: number | string;
  /**
   * Where a unit's Select goes. Default '/rental'. The chosen unit rides in
   * localStorage rather than the URL — see @shared/unitHandoff.
   */
  rentalPageUrl?: string;
  /**
   * Where the property pages live — '/storage-units' by default, the same base
   * #02's nav links under, so "See All Spaces" and the nav agree.
   */
  propertyBasePath?: string;
  /**
   * The property to feature: its id or its slug. That card takes the green
   * outline and the "Featured Property" ribbon, and is pinned to the top of the
   * list whatever the sort or the filters.
   *
   * Nothing in the properties API marks a property as featured — it is an
   * operator decision — so without this no card is featured on live data.
   */
  featuredPropertyId?: string;
  /** @deprecated The sort is a real control now — see SORT_OPTIONS. */
  sortLabel?: string;
}

/**
 * Sort options for the header dropdown.
 *
 * PLACEHOLDER SET, pending what the client actually wants. Both reorder for
 * real rather than being decorative, so swapping in the final list is a data
 * change, not a rewrite.
 */
const SORT_OPTIONS = [
  { id: 'distance', label: 'Closest Distance' },
  { id: 'reviews', label: 'Highly Reviewed' },
] as const;

type SortId = typeof SORT_OPTIONS[number]['id'];

/** Sort a copy — never mutate the source list, which is module-level demo data. */
function sortFacilities(list: CityFacility[], by: SortId): CityFacility[] {
  const out = [...list];

  // A featured property is PINNED TO THE TOP, whatever the sort or the filters.
  // That is the whole point of featuring one: it is a placement the operator
  // has chosen, not a ranking the data earned, so it must not drift down the
  // list when someone sorts by distance or filters the spaces.
  const featuredFirst = (a: CityFacility, b: CityFacility) =>
    Number(!!b.featured) - Number(!!a.featured);

  if (by === 'distance') {
    // Missing distance sorts LAST, not as 0 — otherwise a facility with no
    // distance would float to the top of a "Closest Distance" list.
    const miles = (f: CityFacility) =>
      Number.isFinite(f.distanceMiles) ? f.distanceMiles : Infinity;
    return out.sort((a, b) => featuredFirst(a, b) || (miles(a) - miles(b)));
  }
  // Highly Reviewed: rating first, then review count as the tie-break — a 4.5
  // from 300 people should outrank a 4.5 from 3.
  const rating = (f: CityFacility) => Number(f.rating ?? 0);
  const count = (f: CityFacility) => Number(f.reviewCount ?? 0);
  return out.sort((a, b) =>
    featuredFirst(a, b) || (rating(b) - rating(a)) || (count(b) - count(a)));
}

/**
 * SEO copy, written with placeholders rather than a place name.
 *
 * `{city}` and `{city}, {state}` are filled from the page's own scope, so one
 * body of copy serves every city page. On a STATE page (`/locations/{state}`,
 * no city segment) there is no city to name, so both resolve to the state —
 * "Storage in California", not "Storage in , California".
 *
 * Editors get the same tokens: anything typed into the `seoContent` field runs
 * through the same substitution, so operator-written copy stays portable
 * between pages instead of being pinned to one town.
 *
 * Every block is a heading <p> followed by a body <p> — never a <br> between the
 * two. The first block was already written this way and the other two were not,
 * so the first sat looser than the pair beneath it. `.ml-seo-body` gives a
 * heading paragraph a smaller bottom margin than a body one, which is what puts
 * the small gap under each heading while keeping the blocks themselves apart.
 */
const DEFAULT_SEO = `<p><strong>Storage in {city}</strong></p>
<p>If you are looking for high quality self storage in {city}, {state}, we can help. We provide customers with a high quality, well-maintained self storage facility at a great price. A friendly, professional on-site manager is always here to help you.</p>
<p><strong>Self Storage Features</strong></p>
<p>At our storage facilities, we offer a wide range of features and amenities that make packing and self storage easy. You will find drive-up storage units for simple loading and unloading, delivery receiving services, packing and moving supplies right on site, and long gate access hours.</p>
<p><strong>Secure Storage Units</strong></p>
<p>When you rent storage units in {city}, {state}, you want total security. Our property is covered with 24/7 video surveillance, electronic gate access, and a manager who is always on site.</p>`;

/**
 * Fill `{city}` / `{state}` in a body of copy.
 *
 * `{city}, {state}` is matched as ONE unit before the tokens are handled
 * separately, because a state page has to collapse the whole pair to the state
 * name — replacing the tokens independently would leave the comma stranded.
 *
 * Unknown tokens are left alone rather than blanked: `{foo}` on the page is a
 * visible, fixable mistake, whereas silently deleting it hides it.
 */
/**
 * A state in whatever form — "CA", "california", "north-carolina" — as its
 * proper name: "California", "North Carolina".
 *
 * `stateNameFromCode` alone is not enough: it passes anything it doesn't
 * recognise as a CODE straight back, so a URL slug returns lowercase and the
 * page reads "Storage in california". Round-tripping through the code fixes
 * that, and an unknown value still title-cases rather than printing raw.
 */
export function stateDisplayName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const code = stateCodeFromName(trimmed)
    || (trimmed.length === 2 ? trimmed.toUpperCase() : '');
  return code ? stateNameFromCode(code) : slugLabel(trimmed);
}

export function fillPlaceTokens(copy: string, place: { city: string; state: string }): string {
  const city = place.city.trim();
  const state = place.state.trim();
  // No city ⇒ a state page: the pair and the bare {city} both become the state.
  const pair = city && state ? `${city}, ${state}` : city || state;

  return copy
    .replace(/\{city\}\s*,\s*\{state\}/gi, pair)
    .replace(/\{city\}/gi, city || state)
    .replace(/\{state\}/gi, state);
}

/**
 * `/locations/california/fullerton` → { state: 'california', city: 'fullerton' }
 *
 * The page URL already says which place it is, so a state or city page needs
 * NOTHING passed from Duda. Explicit props still win — a static page, the dev
 * harness, and the Duda editor (where the path is the editor's, not the site's)
 * all need to be able to say it outright.
 *
 * Anything that is not under the base path returns {} and the widget lists the
 * whole portfolio, which is the same fallback as an unconfigured instance.
 */
export function parseLocationPath(pathname: string, basePath = DEFAULT_LOCATION_BASE_PATH): PlaceScope {
  const base = basePath.trim().replace(/^\/+|\/+$/g, '').toLowerCase();
  const parts = pathname.split('/').map((v) => v.trim()).filter(Boolean).map(decodeURIComponent);
  if (base) {
    // Find the base anywhere in the path — Duda can serve a page from a nested
    // path, and a leading language segment (/en/locations/...) is common.
    const at = parts.findIndex((v) => v.toLowerCase() === base);
    if (at === -1) return {};
    parts.splice(0, at + 1);
  }
  return { state: parts[0] ?? '', city: parts[1] ?? '' };
}

/** Where the state/city pages live. Matches #02's mega-menu links. */
const DEFAULT_LOCATION_BASE_PATH = '/locations';

/** Where the property pages live. Matches #02's `locationBasePath`. */
const DEFAULT_PROPERTY_BASE_PATH = '/storage-units';

// ── Component ───────────────────────────────────────────────────────────────

export function MapLocations({
  city,
  state,
  locationBasePath = DEFAULT_LOCATION_BASE_PATH,
  companyId,
  seoHeading,
  seoContent = DEFAULT_SEO,
  rowHeight = '100vh',
  rentalPageUrl,
  propertyBasePath = DEFAULT_PROPERTY_BASE_PATH,
  featuredPropertyId,
  sortLabel = 'Closest Distance',
}: MapLocationsProps) {
  // The page URL is the source of truth on /locations/{state}[/{city}], so a
  // real page passes nothing. Props override it for static pages, the harness,
  // and the Duda editor — where the path is the editor's, not the site's.
  // Duda text fields arrive as '' until the editor types something, and a
  // default parameter only catches `undefined`, so trim-then-fall-back.
  const fromUrl = useMemo(
    () => parseLocationPath(
      typeof window === 'undefined' ? '' : window.location.pathname,
      locationBasePath,
    ),
    [locationBasePath],
  );
  const scope: PlaceScope = {
    state: (state ?? '').trim() || fromUrl.state || '',
    city: (city ?? '').trim() || fromUrl.city || '',
  };

  /**
   * Breadcrumb trail — Figma 10622:77309.
   *
   * Built from the scope the page already resolved, so it needs no new data and
   * follows a dynamic page from city to city on its own. The last entry is the
   * page you are on and is deliberately NOT a link.
   *
   * Hrefs are root-relative for the same reason #02's are: one path is correct
   * on the preview host, the live domain and any custom domain, and Duda serves
   * every page from the site root. `locationBasePath` already names where the
   * state/city pages live (default `/locations`), so the state crumb and the
   * "Find Storage" index are derived from it rather than hardcoded a second time.
   */
  const crumbs = useMemo<Crumb[]>(() => {
    const base = normaliseBase(locationBasePath);
    const trail: Crumb[] = [...locationCrumbHead()];
    if (scope.state) trail.push({ label: stateDisplayName(scope.state), href: `${base}/${scope.state}` });
    // The city crumb wants the bare town — `cityLabel` may carry the ", CA" an
    // editor typed, which reads wrong next to the state crumb beside it.
    // Breadcrumb drops the href on the last item, so whatever ends the trail is
    // the current page — a state page simply stops at the state.
    if (scope.city) trail.push({ label: slugLabel(scope.city) });
    return trail;
  }, [locationBasePath, scope.state, scope.city]);

  // Heading reads "… in Fullerton, CA" on a city page and "… in California" on a
  // state page. Prefer whatever the editor typed — it carries the ", CA" the
  // slug can't — and title-case a slug segment otherwise.
  const cityLabel =
    (city ?? '').trim()
    || (scope.city ? slugLabel(scope.city) : '')
    || stateDisplayName(scope.state ?? '')
    || 'all locations';

  // Values behind {city} / {state} in the SEO copy.
  //
  // {state} is the CODE ("CA") because it reads inside "Fullerton, CA" — the
  // form the copy actually uses it in. A state page has no city, so the copy
  // falls back to the state standing alone, and there the full name reads
  // properly ("Storage in California"), which is what `cityLabel` already holds.
  //
  // The `city` prop may arrive as "Fullerton, CA" — it doubles as the display
  // label — so the part before the comma is the city and anything after it is
  // a state the editor has spelled out. Otherwise the slug supplies both.
  const [typedCity, typedState] = (city ?? '').split(',').map((v) => v.trim());
  const placeTokens = useMemo(() => {
    const cityName = typedCity || (scope.city ? slugLabel(scope.city) : '');
    const rawState = typedState || scope.state;
    const stateCode = rawState
      ? (stateCodeFromName(rawState) || rawState.toUpperCase())
      : '';
    // No city ⇒ state page ⇒ both tokens become the state's full name.
    return cityName
      ? { city: cityName, state: stateCode }
      : { city: '', state: cityLabel };
  }, [typedCity, typedState, scope.city, scope.state, cityLabel]);

  // Normalised like #02's base paths: a missing leading slash would make the
  // link relative to the current /locations/... page, and a trailing one would
  // double up into '/storage-units//california/...'.
  const normalisedPropertyBase = useMemo(() => {
    const t = propertyBasePath.trim().replace(/\/+$/, '');
    if (!t) return '';
    return t.startsWith('/') ? t : `/${t}`;
  }, [propertyBasePath]);

  const [sortBy, setSortBy] = useState<SortId>('distance');
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  // Live facilities for this city; null until the first load settles, which is
  // what tells the render to show skeletons rather than an empty-city message.
  const [liveFacilities, setLiveFacilities] = useState<CityFacility[] | null>(null);

  // The company is site DATA (Company collection), not build output — same
  // precedence as #05: explicit prop → collection → config.json. Held as state
  // so the data effect can wait for it instead of firing at the wrong company.
  const [resolvedCompanyId, setResolvedCompanyId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    resolveCompanyIdFromSources('#08 map-locations', { companyId }, cfg.companyId)
      .then((id) => { if (!cancelled) setResolvedCompanyId(id); });
    return () => { cancelled = true; };
  }, [companyId]);

  // Ratings come from the `GoogleReviews` collection, not the properties API,
  // so they load independently of everything above and simply appear on the
  // cards when they arrive. Published-site only (no dmAPI in the editor or the
  // harness), where it stays empty and the cards show no rating block.
  const [ratings, setRatings] = useState<{
    byPlace: Map<string, RatingSummary>; overall: RatingSummary | null;
  }>({ byPlace: new Map(), overall: null });

  useEffect(() => {
    let cancelled = false;
    fetchGoogleRatingsByPlace('#08 map-locations')
      .then((r) => { if (!cancelled) setRatings(r); })
      .catch((err) => console.error('[MapLocations] ratings error:', err));
    return () => { cancelled = true; };
  }, []);

  // Both calls complete before anything paints: a card is rendered whole or not
  // at all.
  //
  // This used to be staged — properties first, then each card's spaces filling in
  // behind it (the shape #05's NearbySection still uses). That painted a card
  // with its photo, name and address but no unit rows, which then grew by ~171px
  // when its own space-groups call landed, seconds later. The skeleton removed
  // the demo-data flash but not that expansion, because `loading` was already
  // false by then.
  //
  // The cost is a longer skeleton: `/space-groups/…/groups` measures 1.0–3.6s per
  // property (2026-08-17). They run in parallel, so the slowest one gates the
  // paint rather than the sum. The benefit is that nothing moves once it appears.
  useEffect(() => {
    if (!resolvedCompanyId) return;
    let cancelled = false;
    const api = { ...cfg, companyId: resolvedCompanyId };

    (async () => {
      try {
        // Not named `props` — eslint-plugin-react reads `props.map(…)` inside a
        // component as prop access and demands prop-types for it.
        const [cityProps, userLoc] = await Promise.all([
          fetchPlaceProperties(api, scope),
          // Distances are only meaningful from somewhere. Declined geolocation
          // is normal, not an error: the cards then omit the distance line and
          // "Closest Distance" degrades to the API's own order.
          getUserLocation(),
        ]);
        if (cancelled) return;

        const ref = userLoc ?? null;

        // `fetchCitySpaces` never rejects — every failure path inside it returns
        // `{ spaces: [] }` — so one property 404ing yields a card with no unit
        // rows rather than failing the whole batch here.
        const withSpaces = await Promise.all(
          cityProps.map((p) => fetchCitySpaces(api, p.id)
            .then(({ promo, spaces }) => toCityFacility(p, spaces, promo, ref))),
        );
        if (cancelled) return;
        setLiveFacilities(withSpaces);
      } catch (err) {
        console.error('[MapLocations] load error:', err);
        if (!cancelled) setLiveFacilities([]);
      }
    })();

    return () => { cancelled = true; };
  }, [resolvedCompanyId, scope.state, scope.city]);

  // Filter panel (Figma 10557:146492) — a centred lightbox, like #05's.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);

  const loading = liveFacilities === null;
  // Nothing stands in before the first response — the column renders skeletons
  // instead (see CitySkeleton). Demo facilities used to fill this gap, but they
  // carry invented names, addresses, prices and coordinates, so the page painted
  // a plausible-looking city and then replaced it wholesale a few hundred
  // milliseconds later. That is the exact swap @shared/Shimmer's header rules
  // out: skeletons while loading, real constants only as an EMPTY-result
  // fallback. Once the load settles an empty city is still shown as empty.
  const sourceFacilities = liveFacilities ?? [];

  const filtered = useMemo(
    () => filterFacilities(sourceFacilities, filters),
    [sourceFacilities, filters],
  );
  const filterOptions = useMemo(() => deriveFilterOptions(sourceFacilities), [sourceFacilities]);

  // Stamp the collection's rating onto each facility BEFORE sorting, or
  // "Highly Reviewed" would sort on the hardcoded 0 every card carries out of
  // toCityFacility and silently do nothing.
  //
  // PREVIEW FALLBACK. Ratings live in the `GoogleReviews` collection, which is
  // readable only on a PUBLISHED Duda page — there is no dmAPI in the editor or
  // the dev harness, so the reviews line under the property name would never
  // render while anyone is designing the page. Outside Duda we therefore show
  // the demo ratings from data.ts so the row is visible and reviewable.
  //
  // Deliberately gated on `hasCollectionsApi()` rather than "no rating found":
  // on a published site with the collection genuinely empty, a card must show
  // NO rating rather than an invented one. Printing "4.5 ★ 32 Reviews" for a
  // facility nobody has reviewed would mislead a customer.
  const isPreview = !hasCollectionsApi();
  const rated = useMemo(() => filtered.map((f, i) => {
    const r = ratingForProperty(f.name, ratings);
    if (r) return { ...f, rating: r.score, reviewCount: r.count };
    if (isPreview && !(f.rating > 0)) {
      const demo = CITY_FACILITIES[i % CITY_FACILITIES.length];
      return { ...f, rating: demo.rating, reviewCount: demo.reviewCount };
    }
    return f;
  }), [filtered, ratings, isPreview]);

  // Featuring is an operator choice, and nothing in the properties API carries
  // it — so it comes from a prop naming the property (its id or its slug). The
  // demo rows keep their own `featured` flag for the editor and the harness.
  const flagged = useMemo(() => {
    const want = (featuredPropertyId ?? '').trim().toLowerCase();
    if (!want) return rated;
    return rated.map((f) => ({
      ...f,
      featured: f.id.toLowerCase() === want || (f.slug ?? '').toLowerCase() === want,
    }));
  }, [rated, featuredPropertyId]);

  const facilities = useMemo(() => sortFacilities(flagged, sortBy), [flagged, sortBy]);
  const sortLabelText =
    SORT_OPTIONS.find((o) => o.id === sortBy)?.label ?? SORT_OPTIONS[0].label;

  // Click-outside closes the dropdown. Pointerdown rather than click so it
  // closes before the next control receives its own event.
  useEffect(() => {
    if (!sortOpen) return;
    const onDown = (e: PointerEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSortOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [sortOpen]);
  // Which card/bubble is highlighted — a card and its bubble share the outline.
  /** The widget's own root — scopes the card lookup in `revealCard`. */
  const wrapRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string>('');
  /** Which bubble has its popup open. Null = none. */
  const [openId, setOpenId] = useState<string | null>(null);

  // Kept valid as the list changes. `useState`'s initial value is read once, so
  // seeding it from `facilities` left it '' forever with async data — nothing was
  // ever highlighted. Re-seeds only when the current selection has gone from the
  // list, so filtering or sorting doesn't yank the highlight off the visitor's
  // chosen card.
  useEffect(() => {
    if (facilities.length === 0) { if (activeId) setActiveId(''); return; }
    if (!facilities.some((f) => f.id === activeId)) setActiveId(facilities[0].id);
  }, [facilities, activeId]);

  const filterCount = activeFilterCount(filters);

  // Mobile is a different composition, not just a reflow: a search field, a
  // Map/List toggle and "Filter & Sort" replace the desktop header, and only
  // one of the map or the list is on screen at a time (Figma 10609:72429 /
  // 10609:72649). That's DOM structure, so it needs a JS breakpoint rather
  // than the media queries the rest of the layout uses.
  const isMobile = useMediaQuery(MOBILE_STICKY_QUERY);
  const [mobileView, setMobileView] = useState<'list' | 'map'>('list');
  const showMap = !isMobile || mobileView === 'map';
  const showCards = !isMobile || mobileView === 'list';

  // Only plottable facilities become pins. Live properties can have lat/lng
  // null (all seven do today), and a 0/0 placeholder would drop a pin in the
  // Atlantic and drag the map's centre with it.
  const plottable = facilities.filter((f) => f.hasCoords !== false && (f.lat !== 0 || f.lng !== 0));

  const points: MapPoint[] = plottable.map((f) => ({
    id: f.id,
    lat: f.lat,
    lng: f.lng,
    label: f.priceLabel,
    name: f.name,
    active: f.id === activeId,
  }));

  // Guarded: `facilities[0].lat` threw the moment the list could be empty —
  // which the static data never was, but a filtered or still-loading live list
  // is. Centre on the active facility when there is one, else the first
  // plottable, else nothing renders the map at all (see hasMap below).
  const centerOf = plottable.find((f) => f.id === activeId) ?? plottable[0];

  /**
   * Centre the MAP so the open marker sits up and to the right of the middle,
   * not on it — the popup hangs below-left of its bubble, so a dead-centred
   * marker pushed the card into the bottom-left corner. Shifting the centre
   * south-west by the same amount moves the pair back into the middle.
   *
   * Measured as a fraction of the plotted SPREAD rather than a fixed number of
   * degrees, because NearbyMap picks its own zoom to fit every point: a tight
   * cluster of city facilities and a whole state need the same visual nudge but
   * wildly different degree offsets, and the spread tracks the zoom.
   *
   * Only while a popup is open. With none there is nothing to make room for,
   * and the default view stays exactly where it was — including on hover, which
   * moves `activeId` but opens nothing.
   */
  const center = useMemo(() => {
    if (!centerOf) return null;
    if (openId !== centerOf.id) return { lat: centerOf.lat, lng: centerOf.lng };
    const lats = plottable.map((f) => f.lat);
    const lngs = plottable.map((f) => f.lng);
    // A single plotted property has no spread; fall back to something small
    // enough to read as a nudge at the zoom one point gets.
    const latSpan = (Math.max(...lats) - Math.min(...lats)) || 0.03;
    const lngSpan = (Math.max(...lngs) - Math.min(...lngs)) || 0.03;
    return { lat: centerOf.lat - latSpan * 0.10, lng: centerOf.lng - lngSpan * 0.15 };
  }, [centerOf, openId, plottable]);

  const hasMap = center !== null;

  // Figma bubble: white pill, 4px border — primary when active, black when not
  // (10622-77299 / -77303). Clicking one opens the popup above it; the pin
  // render-prop draws both, since NearbyMap only gives us this one hook inside
  // the map box.
  /**
   * Bring a marker's card to the top of the screen.
   *
   * `.ml-cards` is not a scroll box — it is a plain column, and the MAP is what
   * is `position: sticky` — so the cards move with the PAGE. This scrolls the
   * window, and the map stays pinned beside it.
   *
   * Scoped to this widget's own wrapper rather than the document: two map
   * widgets on one page would otherwise fight over the same facility ids.
   *
   * rAF because the click also sets `activeId`, and the active card takes a
   * heavier outline — measuring before that paints can land a few pixels out.
   */
  const revealCard = (id: string) => {
    requestAnimationFrame(() => {
      const el = wrapRef.current?.querySelector(`[data-facility-id="${CSS.escape(id)}"]`);
      if (!el) return;   // mobile shows the map OR the cards, never both
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    });
  };

  const renderPin = (p: PositionedPoint) => {
    const isActive = p.id === activeId;
    const facility = facilities.find((f) => f.id === p.id);
    const isOpen = p.id === openId;

    /* On a phone the frame parks this across the top of the MAP rather than by
       its bubble, which also keeps it clear of the edges — and .ml-pin is
       shrink-wrapped around the bubble, so a popup inside it has nothing
       map-sized to position against. Rendered outside the pin there, inside it
       on desktop where `right: 0` has to mean the bubble's right edge. */
    const popup = isOpen && facility ? (

      <div
        /* On a phone the frame parks the popup across the top of the map
           rather than over its bubble, which also keeps it from being
           clipped when the bubble sits near an edge. */
        className={`ml-popup${isMobile ? ' ml-popup--centred' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* The CARD is the link, not any one line in it — an <a> laid over
            the whole thing rather than a click handler, so it opens in a new
            tab on a middle click, shows its target in the status bar, and is
            reachable by keyboard like any other link.
            The close button, the address and the reviews link sit ABOVE it
            on z-index and keep their own destinations; everything else is
            the property page. Rendered only when the row has a slug, since
            there is nowhere to point without one. */}
        {facility.slug && (
          <a
            className="ml-popup-link"
            href={`${normalisedPropertyBase}/${facility.slug.replace(/^\/+/, '')}`}
            aria-label={facility.name}
          />
        )}
        <img
          className="ml-popup-photo"
          src={PROPERTY_IMAGES[facilities.indexOf(facility) % PROPERTY_IMAGES.length]}
          alt=""
        />
        {/* The address and the review count are TEXT here, not links.
            The whole card is one destination, so a second target inside it
            would send some clicks somewhere else — and pointer-events alone
            would not have stopped that: it blocks the mouse but not Enter,
            so tabbing to a link and pressing it would still have opened
            Google Maps. They keep the frame's underline; the left-hand
            cards keep their real links. */}
        <div className="ml-popup-body">
          <p className="ml-popup-name">{facility.name}</p>
          <span className="ml-popup-address">{facility.address}</span>
          <div className="ml-popup-rating">
            <StarIcon size={16} />
            <span className="ml-popup-score">{facility.rating}</span>
            <span className="ml-popup-reviews">{facility.reviewCount} Reviews</span>
          </div>
          <span className="ml-popup-from">Units starting at {facility.priceLabel}</span>
          {/* The mobile frame adds a CTA here; the desktop one doesn't. */}
          {isMobile && <button type="button" className="ml-cta">See All Units</button>}
        </div>
        <button
          type="button"
          className="ml-popup-close"
          aria-label="Close"
          onClick={(e) => { e.stopPropagation(); setOpenId(null); }}
        >
          {/* Filled disc: the popup card is #fff. */}
          <CloseCircleIcon size={32} />
        </button>
      </div>
    ) : null;

    return (
      <>
        {/* One box at the point, shrink-wrapped to the bubble. The popup used to
            be a SIBLING anchored to the same coordinates, which meant it could
            only ever be centred on the point or offset by a guess — the bubble's
            width changes with the price, so its edges were not knowable. Inside
            here, `right: 0` is the bubble's right edge exactly. */}
        <span
          className={`ml-pin${isActive ? ' ml-pin--active' : ''}${isOpen ? ' ml-pin--open' : ''}`}
          style={{ left: p.left, top: p.top }}
        >
        <button
          type="button"
          className={`ml-bubble${isActive ? ' ml-bubble--active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            setActiveId(p.id);
            setOpenId((cur) => (cur === p.id ? null : p.id));
            revealCard(p.id);
          }}
          title={p.name}
        >
          {/* NO STAR YET.
              The frame puts one ahead of the price, but it marks a FEATURED
              property — not the selected one, which is what this drew before.
              There is no `featured` flag on the API yet (confirmed with Jaweed,
              2026-08-25), and showing it on selection made every property look
              featured in turn. Restore as `{facility?.featured && <StarIcon
              size={24} color="#101318" />}` once the field exists. */}
          <span>{p.label}</span>
        </button>

        {/* "Selected Location" tab under the active bubble — mobile only. */}
        {isMobile && isActive && (
          <span className="ml-bubble-tag">
            Selected Location
          </span>
        )}

        {!isMobile && popup}
        </span>
        {isMobile && popup}
      </>
    );
  };

  return (
    <div className="ml-wrapper" ref={wrapRef} style={{ ['--ml-row-h' as string]: typeof rowHeight === 'number' ? `${rowHeight}px` : rowHeight }}>
      {/* Breadcrumb strip. `.ml-wrapper` is a 24px-gap column, so it spaces
          itself against the header below without a margin of its own. Desktop
          only: the node this comes from is the 1316px frame, and #08's mobile
          frames are drawn separately (10609:*) — see the note on RfSkeleton's
          mobile branch for why a desktop shape is not just a narrower one. */}
      {!isMobile && <Breadcrumb items={crumbs} />}

      {isMobile ? (
        /* Mobile — search, then a Map/List toggle beside "Filter & Sort",
           then the count. Figma 10609:72429 / 10609:72649. */
        <>
          <div className="ml-mcontrols">
            <div className="ml-search">
              <input
                className="ml-search-input"
                type="text"
                placeholder="Enter ZIP, City, State"
                aria-label="Search by ZIP, city or state"
              />
              <button type="button" className="ml-search-btn" aria-label="Search">
                {Icon.search}
              </button>
            </div>

            <div className="ml-mtoggles">
              {/* Names the view you'd switch TO, as the frames do. */}
              <button
                type="button"
                className="ml-pill ml-pill--view"
                onClick={() => setMobileView((v) => (v === 'map' ? 'list' : 'map'))}
              >
                {mobileView === 'map' ? Icon.listView : <MapLocationIcon size={24} />}
                <span>{mobileView === 'map' ? 'List View' : 'Map View'}</span>
              </button>

              <button
                type="button"
                className="ml-pill ml-pill--dark"
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen(true)}
              >
                <FilterIcon size={24} /><span>Filter &amp; Sort</span>
                {filterCount > 0 && <span className="ml-pill-badge">{filterCount}</span>}
              </button>
            </div>
          </div>

          <p className="ml-heading">
            {/* The count is unknown until the response lands; "0 Self Storage
                Facilities in Fullerton" reads as a finished, empty page. */}
            {loading
              ? <Shimmer w={28} h={20} style={{ display: 'inline-block', verticalAlign: '-3px' }} />
              : facilities.length}
            {' '}Self Storage {facilities.length === 1 ? 'Facility' : 'Facilities'} in {cityLabel}
          </p>
        </>
      ) : (
        /* Desktop — count on the left, Filter + sort pills on the right. */
        <div className="ml-header">
          <p className="ml-heading">
            {loading
              ? <Shimmer w={28} h={20} style={{ display: 'inline-block', verticalAlign: '-3px' }} />
              : facilities.length}
            {' '}Storage {facilities.length === 1 ? 'Facility' : 'Facilities'} in {cityLabel}
          </p>
          <div className="ml-controls">
            <button
              type="button"
              // Selected state tracks whether filters ARE APPLIED, not whether
              // the lightbox happens to be open — the dark pill and its green
              // count are the design's way of saying "5 filters are on"
              // (Figma 10629-81025), which stays true after the panel closes.
              className={`ml-pill${filterCount > 0 ? ' ml-pill--on' : ''}`}
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen(true)}
            >
              <FilterIcon size={24} /><span>Filter</span>
              {filterCount > 0 && <span className="ml-pill-count">{filterCount}</span>}
            </button>

            {/* Sort — a real listbox. Figma shows the closed pill only, so the
                open menu follows the filter modal's surface (white, 12px radius,
                the same elevation) rather than inventing a new one. */}
            <div className="ml-sort" ref={sortRef}>
              <button
                type="button"
                className={`ml-pill${sortOpen ? ' ml-pill--open' : ''}`}
                aria-haspopup="listbox"
                aria-expanded={sortOpen}
                onClick={() => setSortOpen((o) => !o)}
              >
                <SortIcon size={24} />
                <span className="ml-pill-sort">{sortLabelText}</span>
                <ChevronBigDownIcon size={24} className="ml-pill-chev" />
              </button>
              {sortOpen && (
                <ul className="ml-sort-menu" role="listbox" aria-label="Sort facilities">
                  {SORT_OPTIONS.map((o) => (
                    <li key={o.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={o.id === sortBy}
                        className={`ml-sort-opt${o.id === sortBy ? ' ml-sort-opt--on' : ''}`}
                        onClick={() => { setSortBy(o.id); setSortOpen(false); }}
                      >
                        {o.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Desktop: the cards travel with the page while the map pins beside them
          until the last card clears. Mobile: one or the other. */}
      <div className="ml-row">
        {showCards && (
          <div className="ml-cards">
            {loading ? <CitySkeleton compact={isMobile} /> : facilities.map((f, i) => (
              <PropertyCard
                key={f.id}
                facility={f}
                index={i}
                active={f.id === activeId}
                compact={isMobile}
                filters={filters}
                rating={ratingForProperty(f.name, ratings)}
                rentalPageUrl={rentalPageUrl}
                companyId={resolvedCompanyId ?? undefined}
                propertyBasePath={normalisedPropertyBase}
                onActivate={() => setActiveId(f.id)}
                onSelect={() => {
                  setActiveId(f.id);
                  /* Close a bubble belonging to a DIFFERENT property. Clicking
                     the card of the one already open leaves it alone — it is
                     the same facility, so the bubble is still about what the
                     visitor is looking at. */
                  setOpenId((cur) => (cur && cur !== f.id ? null : cur));
                }}
              />
            ))}
            {/* Nothing to show. The two cases read very differently to a
                visitor — "this city has no facilities" versus "your filters
                excluded them all" — and only the second one is recoverable, so
                it gets the reset. */}
            {!loading && facilities.length === 0 && (
              <div className="ml-empty" role="status">
                {filterCount > 0 ? (
                  <>
                    <p className="ml-empty-title">No facilities match these filters</p>
                    <button type="button" className="ml-empty-reset" onClick={() => setFilters(INITIAL_FILTERS)}>
                      Clear all filters
                    </button>
                  </>
                ) : (
                  <p className="ml-empty-title">No storage facilities in {cityLabel} yet.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* The map needs at least one property with real coordinates. Without
            any it is omitted entirely rather than rendered blank or centred on
            null island — the list is still perfectly usable.

            While loading it holds its place with a placeholder: no facility is
            plottable yet, so `hasMap` is false and the column would otherwise
            appear only once the response lands, shifting the whole row. The
            placeholder fills `.ml-map`, which already owns the height (a min()
            of `--ml-row-h` and the viewport) and clips to its own 16px radius. */}
        {showMap && (loading || hasMap) && (
          <div className="ml-map">
            {/* `!center` rather than `loading` alone so the centre is narrowed
                to non-null for NearbyMap; the outer guard makes the two
                equivalent, but only this form proves it. */}
            {loading || !center ? (
              <Shimmer w="100%" h="100%" r={0} />
            ) : (
              <NearbyMap
                center={center}
                points={points}
                height="100%"
                renderPin={renderPin}
                hideCenterMarker
              />
            )}
          </div>
        )}
      </div>

      {/* City SEO copy. The mobile map view is a full-screen map, so the frame
          drops the copy there — it comes back with the list. */}
      {seoContent && showCards && (
        <div className="ml-seo">
          {/* The heading takes the tokens too, so an editor-typed heading can
              travel between pages the same way the body does. */}
          <p className="ml-seo-heading">
            {fillPlaceTokens(seoHeading?.trim() || `Self Storage Units in ${cityLabel}`, placeTokens)}
          </p>
          <RichText value={fillPlaceTokens(seoContent, placeTokens)} className="ml-seo-body" />
        </div>
      )}

      {/* Filter lightbox — its overlay is fixed, so where it sits here is moot. */}
      {filtersOpen && (
        <FilterPanel
          // Mobile only: the button says "Filter & Sort", so the sort lives in
          // the panel. Desktop keeps its own header pill (Figma 10557-146402
          // has no Sort group).
          {...(isMobile ? {
            sortOptions: SORT_OPTIONS,
            sortBy,
            onSortChange: (id: string) => setSortBy(id as SortId),
            fullScreen: true,
          } : {})}
          filters={filters}
          options={filterOptions}
          resultCount={filtered.length}
          onChange={setFilters}
          onClose={() => setFiltersOpen(false)}
          // Reset means "no filters", which is now also the opening state —
          // it used to reset to the Figma's pre-selected pills, i.e. clearing
          // the filters would have applied five of them.
          onReset={() => setFilters(INITIAL_FILTERS)}
          onApply={() => setFiltersOpen(false)}
        />
      )}
    </div>
  );
}
