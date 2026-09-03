import React, { useEffect, useMemo, useRef, useState } from 'react';
import './NearbyLocations.css';
import { PROPERTY_IMAGES, cover, propertyImage } from '@shared/demoImages';
import { fetchPropertyHeroImages } from '@shared/propertyImages';
import {
  StarRating,
  PhoneIcon,
  TagIcon,
  MapPinIcon,
  ChevronRight,
} from './icons';
import { NearbyMap, type MapPoint } from '@shared/NearbyMap';
import { useCarousel, usePrefersReducedMotion } from '@shared/useCarousel';
import { CarouselDots } from '@shared/CarouselDots';
import { rentalHref, saveUnitSelection } from '@shared/unitHandoff';
import { emitOpenTiers } from '@shared/tierBus';
import { boundText } from '@shared/propertyBinding';
import {
  fetchProperties,
  resolveNearbyCompanyId,
  extractProperties,
  getUserLocation,
  haversineMiles,
  fetchSpacesForProperties,
  formatDistance,
  fetchPriorityOrder,
  sortByPriorityThenName,
  INTERNAL_PROPERTIES_COLLECTION,
  type NearbyProperty,
  type NearbySpace,
  type PropertySpaces,
} from './nearbyApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Space = NearbySpace;

/** Card-ready property: live fields + presentation extras (image, fee, rating). */
interface Property extends Omit<NearbyProperty, 'spaces'> {
  /** CSS gradient / demo cover — Images aren't in the API yet. */
  image: string;
  adminFee: number;
  /** Rating/reviews aren't in the properties API; present only on demo data. */
  rating?: number;
  reviewCount?: number;
  /**
   * **`null` = not looked up yet** — the card renders `SpacesSkeleton` in their
   * place. Only the properties on the visible page are ever looked up (see the
   * spaces effect), so most of the list sits at `null` and costs nothing.
   *
   * An empty ARRAY is different and means "looked up, this property has no
   * bookable space" — the space block is then omitted, as before.
   */
  spaces: NearbySpace[] | null;
}

// ---------------------------------------------------------------------------
// Demo data — fallback when the API is unreachable or returns nothing
// ---------------------------------------------------------------------------

const SPACES: Space[] = [
  { size: '5’ x 5’', subtype: 'Climate Controlled', inStorePrice: 55, startingPrice: 25 },
  { size: '10’ x 10’', subtype: 'Drive Up', inStorePrice: 174, startingPrice: 140 },
  { size: '10’ x 12’', subtype: 'Drive Up', inStorePrice: 580, startingPrice: 450 },
];

const ADDRESS = '8478 3rd Street, Fullerton, CA 02027';
const PHONE = '(555) 555-5555';

const DEMO_PROPERTIES: Property[] = [
  { id: 'p1', name: '3rd Street Storage', distanceMiles: 1.7, rating: 4.5, reviewCount: 32, address: ADDRESS, phone: PHONE, lat: 0, lng: 0, image: cover(PROPERTY_IMAGES[0]), promo: '$1 Move-In', adminFee: 20, spaces: SPACES },
  { id: 'p2', name: 'Storfun Storage', distanceMiles: 2.5, rating: 4.5, reviewCount: 32, address: ADDRESS, phone: PHONE, lat: 0, lng: 0, image: cover(PROPERTY_IMAGES[1]), promo: 'Short Promotion Title', adminFee: 20, spaces: SPACES },
  { id: 'p3', name: 'Green Street Storage', distanceMiles: 3, rating: 4.5, reviewCount: 32, address: ADDRESS, phone: PHONE, lat: 0, lng: 0, image: cover(PROPERTY_IMAGES[2]), promo: 'Short Promotion Title', adminFee: 20, spaces: SPACES },
  { id: 'p4', name: 'Lakeside Self Storage', distanceMiles: 4.1, rating: 4, reviewCount: 18, address: ADDRESS, phone: PHONE, lat: 0, lng: 0, image: cover(PROPERTY_IMAGES[3]), promo: 'Short Promotion Title', adminFee: 20, spaces: SPACES },
  { id: 'p5', name: 'Uptown Storage Co.', distanceMiles: 5.3, rating: 5, reviewCount: 47, address: ADDRESS, phone: PHONE, lat: 0, lng: 0, image: cover(PROPERTY_IMAGES[4]), promo: 'Short Promotion Title', adminFee: 20, spaces: SPACES },
  { id: 'p6', name: 'Riverside Storage', distanceMiles: 6.2, rating: 4.5, reviewCount: 29, address: ADDRESS, phone: PHONE, lat: 0, lng: 0, image: cover(PROPERTY_IMAGES[5]), promo: 'Short Promotion Title', adminFee: 20, spaces: SPACES },
];

/**
 * Columns is FIXED at three — the card was drawn for a 1314px / 3-up grid and
 * `.nl-grid` is `repeat(3, 1fr)`. Only the number of ROWS is configurable, so
 * the two layouts are 3 cards and 6 cards; the grid wraps on its own.
 */
const COLUMNS = 3;

/** Where the property pages live. Matches #02's `locationBasePath` and #08's. */
const DEFAULT_PROPERTY_BASE_PATH = '/storage-units';

/**
 * Where a Select lands when the widget is given no `rentalPageUrl`.
 *
 * DELIBERATELY NOT `@shared/unitHandoff`'s `DEFAULT_RENTAL_PATH` ('/rental'):
 * #07's cards point at OTHER facilities and this site's rental flow is published
 * at `/rent-or-reserve`, so the shared default sends every nearby Select to a
 * page that does not exist. Only #07 is changed — #05's Pricing and #08's cards
 * still take the shared default, so moving this one does not silently retarget
 * the space list on every property page.
 *
 * Nothing else about the handoff changes: the picked tier still travels in
 * localStorage (`saveUnitSelection`), and the rental flow reads it on whatever
 * page it is mounted on, so no extra params are needed to make this work.
 */
const DEFAULT_NEARBY_RENTAL_PATH = '/rent-or-reserve';

/**
 * Duda content-menu fields are TEXT inputs, so a toggle can arrive as the STRING
 * `'false'` — which is truthy, and would switch a feature on for every operator
 * who explicitly turned it off. Same coercion the `rows`/`sortMode` props do.
 */
function boolProp(v: unknown): boolean {
  if (typeof v === 'string') return !/^(|false|0|no|off)$/i.test(v.trim());
  return Boolean(v);
}

/**
 * Compare by distance, nearest first, with the NAME as the tie-break.
 *
 * The tie-break is not cosmetic. Properties with no coordinates (or no reference
 * point at all) get `distanceMiles: null`, and `Infinity - Infinity` is NaN —
 * a comparator returning NaN leaves the sort order unspecified, so the
 * distance-less tail could come back differently on each load. Comparing equals
 * by name settles it.
 */
function byDistanceThenName(
  a: { distanceMiles: number | null; name: string },
  b: { distanceMiles: number | null; name: string },
): number {
  const da = a.distanceMiles ?? Infinity;
  const db = b.distanceMiles ?? Infinity;
  if (da !== db) return da - db;
  return (a.name || '').localeCompare(b.name || '', 'en', { numeric: true, sensitivity: 'base' });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SpaceRow({
  space,
  propertyId,
  companyId,
  rentalPageUrl,
  enableValueTiers,
  valueTiersChannel,
  valueTiersPageUrl,
}: {
  space: Space;
  /** The facility this space belongs to — what makes the handoff unambiguous on
   *  a widget that lists several properties at once. */
  propertyId: string;
  companyId: string;
  /** Already normalised by the widget (`rentalPath`) — `rentalHref` here is a
   *  no-op on it, and only guards a direct render of this sub-component. */
  rentalPageUrl?: string;
  /** Select goes through the #14 value-tiers step, exactly as #05's does. */
  enableValueTiers: boolean;
  valueTiersChannel?: string;
  valueTiersPageUrl?: string;
}) {
  /**
   * Where Select points, mirroring #05's `CtaButton`:
   *
   *  1. **Value tiers as a PAGE** — an href carrying the same four params #05
   *     sends, so the target prices the same group. `propertyId` is THIS CARD's
   *     facility, not the page's: every row on this widget is a different
   *     property, which is the whole difference from #05.
   *  2. **Value tiers as a MODAL** (enabled, no page URL) — the href stays the
   *     rental page and the click emits on `tierBus` instead; see onSelect.
   *  3. **No value-tiers step** — straight to the rental page
   *     (`/rent-or-reserve` by default; see `DEFAULT_NEARBY_RENTAL_PATH`).
   */
  const tiersHref = enableValueTiers && valueTiersPageUrl
    ? `${valueTiersPageUrl}?${new URLSearchParams({
        size: space.size,
        ...(space.unitGroupId ? { unitGroupId: space.unitGroupId } : {}),
        ...(propertyId ? { propertyId } : {}),
        ...(companyId ? { companyId } : {}),
      }).toString()}`
    : undefined;

  function onSelect(e: React.MouseEvent<HTMLAnchorElement>) {
    // The tiers PAGE is a plain navigation — nothing to hand over in storage,
    // the params carry it.
    if (tiersHref) return;

    if (enableValueTiers) {
      // #14's modal is not scoped by property — it ADOPTS the emitted one as its
      // API context (see onOpenTiers in TierSelection.tsx), so an unchanneled
      // modal on this page serves a nearby facility correctly.
      const handled = emitOpenTiers({
        size: space.size,
        unitGroupId: space.unitGroupId,
        unitId: space.tierId,
        propertyId: propertyId || undefined,
        channel: valueTiersChannel || undefined,
      });
      if (handled) { e.preventDefault(); return; }
      // UNHANDLED FALLS THROUGH TO THE RENTAL PAGE rather than dead-ending.
      // #05 shows an error here because its Select is the page's primary action
      // and a missing modal is a misconfiguration to fix. #07's cards point at
      // OTHER facilities, on pages that may legitimately carry no #14 at all, so
      // the honest degradation is the step the tiers modal would have led to.
      // eslint-disable-next-line no-console
      console.warn(
        '[#07 nearby] value tiers enabled but no modal handled the Select — place a '
        + 'mode="modal" #14 on this page, or set valueTiersPageUrl. Going to the rental page.',
      );
    }

    saveUnitSelection({
      tierId: space.tierId!,
      unitGroupId: space.unitGroupId,
      size: space.size,
      // Size AND price, so the rental flow resolves the tier that was clicked
      // rather than the cheapest unit of that size.
      price: space.startingPrice,
      propertyId,
      companyId: companyId || undefined,
    });
  }

  return (
    <div className="nl-space-row">
      <div className="nl-space-info">
        <span className="nl-space-size">{space.size}</span>
        <span className="nl-space-subtype">{space.subtype}</span>
      </div>
      <div className="nl-space-prices">
        <div className="nl-price-strike">
          <span className="nl-price-strike-label">IN-STORE</span>
          <span className="nl-price-strike-value">${space.inStorePrice}</span>
        </div>
        <span className="nl-price-divider" />
        <div className="nl-price-start">
          <span className="nl-price-start-label">STARTING AT</span>
          <span className="nl-price-start-value">${space.startingPrice}</span>
        </div>
        {/* Same routing as #05's Select: value tiers when configured, else the
            rental page with the picked tier in localStorage (@shared/unitHandoff).
            An ANCHOR, not a button — Duda's router handles a real link in preview
            and published alike, and middle-click still works.

            No tier id means no API row behind this space (demo/fixture data), and
            neither route can price what was clicked — so the control renders
            inert rather than sending the visitor somewhere that resolves to
            nothing. */}
        {space.tierId ? (
          <a
            className="nl-select-btn"
            href={tiersHref ?? rentalHref(rentalPageUrl || DEFAULT_NEARBY_RENTAL_PATH)}
            onClick={onSelect}
          >
            Select
          </a>
        ) : (
          <span className="nl-select-btn nl-select-btn--inert">Select</span>
        )}
      </div>
    </div>
  );
}

/**
 * How many space rows every card reserves — see `ReservedSpaceRow`. It is also
 * what `fetchPropertySpaces` returns at most (the cheapest three), so a fully
 * stocked facility fills the slots exactly and none of them go to waste.
 */
const SPACE_SLOTS = 3;

/**
 * An INVISIBLE copy of a real space row, used to pad a facility that lists
 * fewer than `SPACE_SLOTS` spaces.
 *
 * The point is constant card height: the mobile carousel shows one card at a
 * time and the desktop grid pages three or six, so a facility with one bookable
 * size next to one with three made the card jump as the visitor moved between
 * them. Padding the list keeps every card the same height whatever it holds.
 *
 * **It is the real markup with `visibility: hidden`, deliberately not a
 * `min-height` in pixels.** The row's height comes from its own contents — the
 * size/subtype lines against the Select button — so a copy of those contents
 * tracks any change to them automatically, where a hardcoded number silently
 * stops matching the moment the button's padding or a font size moves. The text
 * is placeholder and never read: `visibility: hidden` takes it out of the
 * accessibility tree, and `aria-hidden` says so for anything that disagrees.
 */
function ReservedSpaceRow() {
  return (
    <div className="nl-space-row nl-space-row--reserved" aria-hidden="true">
      <div className="nl-space-info">
        <span className="nl-space-size">5&apos; x 5&apos;</span>
        <span className="nl-space-subtype">Reserved</span>
      </div>
      <div className="nl-space-prices">
        <div className="nl-price-strike">
          <span className="nl-price-strike-label">IN-STORE</span>
          <span className="nl-price-strike-value">$0</span>
        </div>
        <span className="nl-price-divider" />
        <div className="nl-price-start">
          <span className="nl-price-start-label">STARTING AT</span>
          <span className="nl-price-start-value">$0</span>
        </div>
        <span className="nl-select-btn">Select</span>
      </div>
    </div>
  );
}

function PropertyCard({
  property,
  propertyBasePath,
  rentalPageUrl,
  companyId,
  enableValueTiers,
  valueTiersChannel,
  valueTiersPageUrl,
}: {
  property: Property;
  /** Where the property pages live, e.g. '/storage-units'. */
  propertyBasePath: string;
  /** Pre-resolved by the widget — `/rent-or-reserve` unless the instance set
   *  its own `rentalPageUrl`. Passed straight down to each Select. */
  rentalPageUrl?: string;
  companyId: string;
  /** Passed straight down to each space's Select — see SpaceRow. */
  enableValueTiers: boolean;
  valueTiersChannel?: string;
  valueTiersPageUrl?: string;
}) {
  /**
   * The facility's own page. The SLUG is the path — `state/city/name-<id>`, the
   * same value #02's nav and #08's cards build their links from — so this is
   * `/storage-units/california/bellflower/storage-outlet-bellflower-340079517`.
   *
   * Undefined when the row carries no slug: there is then nowhere to point, and
   * a link to the base path alone would drop the visitor on a page that is not
   * this facility. The photo stops being clickable and "See All Spaces" renders
   * as plain text instead.
   */
  const propertyHref = property.slug
    ? `${propertyBasePath}/${property.slug.replace(/^\/+/, '')}`
    : undefined;

  return (
    <div className="nl-card">
      <div className="nl-card-image" style={{ background: property.image }}>
        <div className="nl-card-image-overlay" />
        {/* The whole photo is the link to the facility's page — a STRETCHED
            anchor rather than a wrapper, because the details block over it holds
            its own links (phone, map) and an <a> cannot nest inside an <a>.
            `.nl-card-data` is pointer-events: none so a click on the name or the
            empty space around it falls through to this; its real links opt back
            in. See NearbyLocations.css. */}
        {propertyHref && (
          <a
            className="nl-card-image-link"
            href={propertyHref}
            aria-label={`View ${property.name}`}
          />
        )}
        {property.distanceMiles != null && (
          <span className="nl-card-distance">{formatDistance(property.distanceMiles)}</span>
        )}
        <div className="nl-card-data">
          <span className="nl-card-name">{property.name}</span>
          {property.rating != null && (
            <div className="nl-card-rating">
              <span className="nl-card-rating-num">{property.rating}</span>
              <StarRating rating={property.rating} size={16} />
              {/* A span, not an <a href="#">: there is no reviews destination
                  here, and "#" scrolls the host page to the top when clicked. */}
              <span className="nl-card-reviews">{property.reviewCount} Reviews</span>
            </div>
          )}
          {property.address && (
            <a
              className="nl-card-meta"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(property.address)}`}
              target="_blank"
              rel="noreferrer"
            >
              <MapPinIcon size={16} />
              <span>{property.address}</span>
            </a>
          )}
          {property.phone && (
            <a className="nl-card-meta" href={`tel:${property.phone.replace(/[^0-9+]/g, '')}`}>
              <PhoneIcon size={16} />
              <span>{property.phone}</span>
            </a>
          )}
        </div>
      </div>

      <div className="nl-card-body">
        {/* The property's own details are known from the collection, so the card
            is real from the first paint; only the priced spaces wait on their
            per-property lookup. */}
        {property.spaces === null ? (
          <SpacesSkeleton />
        ) : (
          <>
            {property.promo && (
              <div className="nl-promo">
                <TagIcon size={16} />
                <span className="nl-promo-text">{property.promo}</span>
              </div>
            )}

            {/* ALWAYS `SPACE_SLOTS` rows, real ones first and invisible ones
                after, so every card is the same height whether the facility
                lists three bookable sizes or one. The block is unconditional
                for the same reason — a facility with nothing bookable used to
                omit it entirely and come out dramatically shorter than its
                neighbours.

                A divider belongs BETWEEN two real rows, so the one that would
                introduce a reserved row is reserved too: it keeps its 25px of
                height (1px rule + 12px margins) and draws nothing, which is
                what stops a hairline trailing off under the last real row. */}
            <div className="nl-spaces">
              {Array.from({ length: SPACE_SLOTS }, (_, i) => property.spaces?.[i]).map((space, i) => (
                <React.Fragment key={i}>
                  {i > 0 && (
                    <span className={`nl-space-divider${space ? '' : ' nl-space-divider--reserved'}`} />
                  )}
                  {space ? (
                    <SpaceRow
                      space={space}
                      propertyId={property.id}
                      companyId={companyId}
                      rentalPageUrl={rentalPageUrl}
                      enableValueTiers={enableValueTiers}
                      valueTiersChannel={valueTiersChannel}
                      valueTiersPageUrl={valueTiersPageUrl}
                    />
                  ) : (
                    <ReservedSpaceRow />
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* The promo's height, reserved when the facility has no promo —
                and placed AFTER the spaces so the visible content still moves
                UP to fill the gap rather than sitting under a blank band. The
                footer's `margin-top: auto` keeps it on the bottom edge either
                way, so the card's total height is the same as a promo card's.
                A hidden copy of the real bar rather than a pixel height, for
                the reason `ReservedSpaceRow` is one. */}
            {!property.promo && (
              <div className="nl-promo nl-promo--reserved" aria-hidden="true">
                <TagIcon size={16} />
                <span className="nl-promo-text">Reserved</span>
              </div>
            )}
          </>
        )}

        {/* THE WHOLE FOOTER IS THE LINK, not just "See All Spaces" — the
            admin-fee line and the space between the two are the same target as
            the label. So the footer is the <a> and the label is a SPAN: an <a>
            cannot nest inside an <a>, and the outer one is the bigger hit area.
            An anchor rather than a click handler for the reason the photo link
            is one — Duda's router handles a real link in preview and published
            alike, and middle-click survives.
            Offered however few spaces the card lists: it goes to the facility's
            own page, not just "more of this list".
            Always rendered, and the label always keeps the CTA colour +
            underline: the footer must read the same from card to card. `href` is
            simply absent when the row carries no slug — there is nowhere to
            point, and the base path alone would land on a page that is not this
            facility. */}
        <a className="nl-card-footer" href={propertyHref}>
          <span className="nl-admin-fee">+ Plus ${property.adminFee} Admin Fee</span>
          <span className="nl-see-all">See All Spaces</span>
        </a>
      </div>
    </div>
  );
}

/** Loading placeholder mirroring the card's own geometry (image, promo, 3 space
 *  rows, footer) so the grid doesn't reflow when the real cards arrive. */
/**
 * The promo bar + space rows as placeholders — the part of a card that waits on
 * the space-groups lookup.
 *
 * Shared by `SkeletonCard` (whole card, while the property list itself loads) and
 * by a REAL card whose spaces haven't arrived yet. Sharing it is what makes the
 * hand-off free of layout shift: the block a pending card reserves is the same
 * block the finished card fills.
 *
 * **Three rows and one promo line is the exact reservation, not a guess.**
 * `fetchPropertySpaces` returns the cheapest THREE spaces and at most one promo,
 * so a property with a full complement settles into precisely this height. The
 * remaining movement is a property that turns out to have no promo, or fewer than
 * three spaces, which shrinks its own card once — unavoidable without knowing the
 * answer before asking, and far cheaper than holding the whole page back.
 */
function SpacesSkeleton() {
  return (
    // The class is not decoration: this wrapper is a SINGLE child of
    // `.nl-card-body`, so that column's 16px gap falls outside it rather than
    // between the promo bar and the rows. Without it they touch.
    <div className="nl-skeleton-spaces" aria-hidden="true">
      <div className="nl-skeleton-line nl-skeleton-promo" />
      <div className="nl-spaces">
        {[0, 1, 2].map((i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="nl-space-divider" />}
            <div className="nl-skeleton-space-row">
              <div className="nl-skeleton-lines">
                <div className="nl-skeleton-line nl-skeleton-size" />
                <div className="nl-skeleton-line nl-skeleton-subtype" />
              </div>
              <div className="nl-skeleton-line nl-skeleton-price" />
              <div className="nl-skeleton-block nl-skeleton-btn" />
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

/**
 * How long #07 will sit on skeleton cards before giving up. See `stalled` — it
 * is a backstop for an unbounded `await`, not part of the normal load, and it is
 * deliberately longer than the bounded chain's worst legitimate case.
 */
const STALL_DEADLINE_MS = 30000;

function SkeletonCard() {
  return (
    <div className="nl-card nl-skeleton-card" aria-hidden="true">
      <div className="nl-card-image nl-skeleton-block" />
      <div className="nl-card-body">
        <SpacesSkeleton />
        <div className="nl-card-footer">
          <div className="nl-skeleton-line nl-skeleton-fee" />
          <div className="nl-skeleton-line nl-skeleton-seeall" />
        </div>
      </div>
    </div>
  );
}

/* The local one-dot-per-position renderer is gone: @shared/CarouselDots caps
   the row at MAX_DOTS and slides a window instead, which is what stops a long
   list drawing a dot per item. It takes our existing `nl-dot` class, so the
   look is unchanged. */


// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface NearbyLocationsProps {
  heading?: string;
  subheading?: string;
  /** Duda setting: only show properties within this many miles. 0/unset = nearest-first. */
  radiusMiles?: number;
  /** Fixed admin fee shown on each card (not per-property in the API). */
  adminFee?: number;
  /**
   * The page's own property, if Duda passes one — used to anchor distances when
   * the visitor declines geolocation, and to leave that facility out of its own
   * "nearby" list. Optional: this widget is normally site-wide, and it must NOT
   * fall back to config.json's build-time id, which belongs to another company.
   */
  propertyId?: string;
  /**
   * Grid layout: **1 row of 3** (default, one page = 3 cards) or **2 rows of 3**
   * (one page = 6). Columns are fixed at three — see COLUMNS.
   *
   * Typed loosely because a Duda content-menu field is a TEXT input: the value
   * arrives as `'2'`, not `2`. Anything that isn't 2 means one row.
   */
  rows?: 1 | 2 | string | number;
  /**
   * How the list is ordered.
   *
   *  - `'nearest'` (default) — every property, closest to the visitor first.
   *  - `'featured'` — the operator's own order, from the
   *    `nearbyLocationPriorityOrder` column of
   *    the `PropertiesInternal` collection (ties, and everything left unranked,
   *    fall back to the property name).
   *
   * Matched loosely (`/featur/i`) so a Duda dropdown labelled "Featured
   * Facilities" works as well as the bare token.
   */
  sortMode?: 'nearest' | 'featured' | string;
  /**
   * Optional cap on how many properties the list holds. **0 (default) = no cap:
   * the whole portfolio, sorted, paged.**
   *
   * It used to default to two pages' worth because every property cost a
   * space-groups lookup, so a 100-facility portfolio meant ~200 REST calls up
   * front. That is no longer true — spaces are fetched only for the cards on the
   * visible page (see the spaces effect), so the list length now costs one
   * collection read regardless of size. The cap survives only as a deliberate
   * "show the nearest N" setting.
   */
  maxProperties?: number;
  /**
   * Collection holding the site's own per-property extras —
   * `nearbyLocationPriorityOrder` and
   * the hero photos. Overridable only because a collection name is site data.
   */
  internalCollection?: string;
  /**
   * Where the facility pages live. A property's `slug` is `state/city/name-<id>`,
   * so a card links to `/storage-units/<slug>` — the same base #02's nav and
   * #08's cards use, and the default is the same `/storage-units`.
   *
   * Normalised before use: a missing leading slash would make the link relative
   * to the page the widget happens to sit on, and a trailing one would double up
   * into `/storage-units//california/…`.
   */
  propertyBasePath?: string;
  /**
   * Where a Select lands. Default `/rent-or-reserve`
   * (`DEFAULT_NEARBY_RENTAL_PATH`, NOT @shared/unitHandoff's `/rental`) — the
   * picked tier travels in localStorage, so the href stays clean.
   *
   * A Duda content-menu field is a TEXT input, so an operator who cleared it
   * sends `''` and a dynamic page can send an unsubstituted `{{token}}`; both go
   * through `boundText` and fall back to the default rather than resolving to
   * the shared `/rental`.
   */
  rentalPageUrl?: string;
  /**
   * Select goes through the #14 value-tiers step first, exactly as #05's does —
   * the modal on this page (`tierBus`) or `valueTiersPageUrl` when one is set.
   *
   * Typed loosely because a Duda content-menu field is a TEXT input: an operator
   * who turned this OFF can send the string `'false'`, which is truthy. See
   * `boolProp`.
   */
  enableValueTiers?: boolean | string;
  /** Disambiguates several #14 modals on one page. Both sides must match. */
  valueTiersChannel?: string;
  /** Value tiers as a PAGE rather than a modal. Set ⇒ Select navigates there
   *  with `size`/`unitGroupId`/`propertyId`/`companyId`, as #05 does. */
  valueTiersPageUrl?: string;
}

export function NearbyLocations({
  heading = 'Nearby Properties',
  subheading = 'Browse other storage facilities in the area and compare available spaces and prices.',
  radiusMiles = 0,
  adminFee = 20,
  propertyId = '',
  rows = 1,
  sortMode = 'nearest',
  maxProperties = 0,
  internalCollection = INTERNAL_PROPERTIES_COLLECTION,
  propertyBasePath = DEFAULT_PROPERTY_BASE_PATH,
  rentalPageUrl,
  enableValueTiers = false,
  valueTiersChannel,
  valueTiersPageUrl,
}: NearbyLocationsProps) {
  const valueTiers = boolProp(enableValueTiers);
  /**
   * The Select destination, resolved ONCE for every card on the widget.
   *
   * `boundText` first, then the default: an empty Duda field or an
   * unsubstituted `{{token}}` must fall back to `/rent-or-reserve`, where a
   * default parameter (`rentalPageUrl = DEFAULT_NEARBY_RENTAL_PATH`) only fires
   * on `undefined` and would let `''` reach `rentalHref`, which answers the
   * SHARED `/rental`. `rentalHref` then normalises exactly as before — a missing
   * leading slash would make the link relative to the page the widget sits on
   * (fatal at /storage-units/california/…) and a trailing one would double up.
   */
  const rentalPath = rentalHref(boundText(rentalPageUrl) || DEFAULT_NEARBY_RENTAL_PATH);
  // Duda hands these over as strings, so coerce before deriving anything.
  const rowCount = Number(rows) >= 2 ? 2 : 1;
  const cardsPerPage = COLUMNS * rowCount;
  const featured = /featur/i.test(String(sortMode));
  // 0 / unset / junk ⇒ no cap: the whole sorted portfolio, paged.
  const cap = Math.max(0, Number(maxProperties) || 0);

  /**
   * Normalised like #02's and #08's base paths — a missing leading slash makes
   * the card link relative to whatever page the widget sits on (fatal on a
   * property page at /storage-units/california/…) and a trailing one doubles up.
   */
  const propertyBase = useMemo(() => {
    const t = String(propertyBasePath ?? '').trim().replace(/\/+$/, '');
    if (!t) return '';
    return t.startsWith('/') ? t : `/${t}`;
  }, [propertyBasePath]);

  /**
   * The company the cards' facilities belong to — carried by a Select handoff so
   * the rental flow resolves the unit against the right company.
   *
   * Resolved asynchronously (collection reads), and `''` until it lands. That is
   * fine here where it would not be for the space lookups: nothing is fetched
   * with it, and a Select in the first moments simply hands over one fewer hint —
   * the rental flow still has the property id, the size and the price.
   */
  const [handoffCompanyId, setHandoffCompanyId] = useState('');
  useEffect(() => {
    let cancelled = false;
    resolveNearbyCompanyId(internalCollection)
      .then((id) => { if (!cancelled) setHandoffCompanyId(id); })
      .catch(() => { /* no company hint — the handoff degrades, nothing breaks */ });
    return () => { cancelled = true; };
  }, [internalCollection]);

  /**
   * Spaces per property id, for the lifetime of the page.
   *
   * A ref, not state: it is a cache, and re-rendering on a write would be a
   * second render for data the state update below already carries. It deliberately
   * SURVIVES a re-sort — the ids don't change when the order does, so toggling
   * layout or ordering re-uses every lookup already paid for and costs nothing.
   */
  const spacesCache = useRef(new Map<string, PropertySpaces>());
  /** Ids with a lookup in flight, so a re-render can't fire a second one. */
  const spacesInFlight = useRef(new Set<string>());

  const [mobileView, setMobileView] = useState<'list' | 'map'>('list');

  // null = still loading; [] = loaded but nothing to show.
  const [apiProperties, setApiProperties] = useState<Property[] | null>(null);
  /**
   * Last resort: nothing has painted and we have stopped waiting.
   *
   * Every boundary below is bounded now (`@shared/withTimeout`), so this should
   * not fire — it exists because "the widget never leaves its skeletons" is the
   * one failure a visitor cannot recover from, and a single unbounded `await`
   * anywhere in the chain reintroduces it. Cheap insurance against the next one.
   *
   * NOT the same as `apiProperties = []`, and the distinction matters:
   * `emptyMessage` reads an empty ARRAY as "the filter matched nothing" and would
   * announce "No featured facilities yet — set nearbyLocationPriorityOrder…",
   * diagnosing an operator error that did not happen. This flag ends the loading
   * state without claiming anything about the data.
   *
   * It is also NOT terminal: the effect keeps running, so a slow answer still
   * lands and replaces what this fell back to. That is what makes the deadline
   * safe to set at a length a legitimate load could occasionally exceed.
   */
  const [stalled, setStalled] = useState(false);
  // Reference coordinates (map centre).
  const [refLoc, setRefLoc] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Re-running means the ordering or the layout changed, so the cards on screen
    // are the wrong ones — back to skeletons rather than stale-then-swap.
    setApiProperties(null);
    setRefLoc(null);
    setStalled(false);

    // The bounded chain's absolute worst case is a little OVER this — the
    // collection wait plus a timed-out read plus a timed-out REST fall-back for
    // the properties, then the priority order and the hero photos in sequence —
    // so an extraordinarily slow load can be pre-empted. That is deliberate
    // rather than a miscalculation: sizing the deadline to the theoretical worst
    // case would put it near a minute, where it stops being a rescue. It is safe
    // because it is not terminal — see `stalled`; the answer still lands and
    // replaces what this fell back to.
    const deadline = setTimeout(() => {
      if (!cancelled) setStalled(true);
    }, STALL_DEADLINE_MS);

    (async () => {
      try {
        // Properties + a geolocation attempt run together (geo may prompt).
        //
        // FEATURED DOES NOT ASK. Its order comes from the operator's
        // `nearbyLocationPriorityOrder`, so the answer would be thrown away — and
        // a permission
        // prompt whose result is discarded is the worst of both outcomes.
        const [raw, userLoc] = await Promise.all([
          fetchProperties(internalCollection),
          featured ? Promise.resolve(null) : getUserLocation(),
        ]);
        const all = extractProperties(raw);

        // Reference point: the visitor's location, else this page's own property
        // when Duda passed one. Often there is neither — geolocation is declined and
        // the widget is site-wide — and that must NOT blank the list: showing every
        // location without distances is still the useful thing to show.
        //
        // `hasCoords !== false` on the fallback: coordinate-less rows now survive
        // extraction carrying lat/lng 0, and anchoring the whole list to 0,0 would
        // measure every distance from the Gulf of Guinea.
        const current = propertyId ? all.find((p) => p.id === propertyId) : undefined;
        const ref = userLoc
          ? { ...userLoc, source: 'user' as const }
          : current && current.hasCoords !== false
            ? { lat: current.lat, lng: current.lng, source: 'property' as const }
            : null;

        // Never exclude by a property id we weren't given — with none, nothing is
        // "the current facility" and every location belongs in the list.
        const others = propertyId ? all.filter((p) => p.id !== propertyId) : all;

        // Distances are attached in both modes when they're knowable — a featured
        // card still shows "3 Miles" if the visitor's position happens to be known
        // from a page property — but only ORDER by them in nearest mode.
        const measured = others.map((p) => ({
          ...p,
          distanceMiles:
            ref && p.hasCoords !== false ? haversineMiles(ref, p) : (null as number | null),
        }));

        let ranked: typeof measured;
        if (featured) {
          const priorities = await fetchPriorityOrder(internalCollection);
          // FEATURED IS AN OPT-IN LIST. A property with no
          // `nearbyLocationPriorityOrder` is not
          // "ranked last", it is not featured at all — so it is filtered out
          // rather than sorted to the tail. The operator's column IS the list.
          //
          // Consequence, deliberate: with nothing ranked this yields an empty
          // list, and the widget then says so (see emptyMessage) instead of
          // quietly showing the whole portfolio in name order — which would look
          // identical to a working featured list and hide the missing column.
          const chosen = measured.filter((p) => priorities.has(p.id));
          if (!chosen.length && measured.length) {
            // eslint-disable-next-line no-console
            console.warn(
              `[#07 nearby] featured mode: no row in ${internalCollection} has a nearbyLocationPriorityOrder, so there is nothing to feature`,
            );
          }
          ranked = sortByPriorityThenName(chosen, priorities);
        } else {
          ranked = [...measured].sort(byDistanceThenName);
          // A radius is meaningless without a reference point; applying it then would
          // filter everything out, which is how this used to render empty. It is also
          // meaningless in featured mode, where the operator picked the list.
          if (ref && radiusMiles > 0) {
            ranked = ranked.filter((p) => (p.distanceMiles ?? Infinity) <= radiusMiles);
          }
        }

        // The whole sorted list, unless an explicit cap says otherwise. Length is
        // free now: the space lookups below follow the visible page, not the list.
        const top = cap > 0 ? ranked.slice(0, cap) : ranked;

        // PAINT THE CARDS NOW, spaces later.
        //
        // This used to enrich every property before painting anything, so nothing
        // appeared until the slowest of N space lookups returned and the whole
        // portfolio had to be capped to keep N small. The card's property details
        // (name, address, phone, distance, photo) all come from the collection read
        // that just returned — there is nothing to wait for. Only the priced spaces
        // need the per-property REST calls, and those are now fetched for the
        // visible page alone.
        //
        // The reason it was eager is still respected: the old staged version shifted
        // the layout because an unenriched card was SHORTER than the skeleton above
        // it and shorter again than the finished card. `SpacesSkeleton` is what fixes
        // that — a pending card reserves exactly the block its spaces will fill, so
        // cards arrive at their final height and settle in place.
        //
        // Already-cached spaces are seeded straight in, so re-sorting or switching
        // layout re-paints finished cards as finished rather than back to skeletons.
        //
        // One read for the whole list — the hero photos live in a collection keyed
        // by property id, and asking per card would repeat the same read. Fails
        // soft to an empty map, and each card then keeps its own source.
        const heroes = await fetchPropertyHeroImages(internalCollection).catch(
          () => new Map<string, string>(),
        );

        // THE SLUG IS COLLECTION-ONLY. Verified live 2026-08-25: the REST
        // `/properties` response carries no `slug` field on either company, so
        // it exists solely on the Duda collections (`PropertiesInternal`, and
        // `Properties`). Whenever the widget is on the REST path — the Duda
        // editor and the dev harness, where there is no `dmAPI` — every card is
        // slug-less and its photo and "See All Spaces" have nowhere to point.
        //
        // Said out loud, once, because the symptom (links that do nothing) looks
        // identical to a coding bug and gives no hint that the cause is the
        // source the list came from.
        if (top.length && !top.some((p) => p.slug)) {
          // eslint-disable-next-line no-console
          console.warn(
            `[#07 nearby] no property carries a "slug", so the card photos and "See All Spaces" `
            + `have no facility page to link to. The slug lives on the Duda collections only `
            + `(${internalCollection} / Properties) — in the dev harness, reload with `
            + `?mockCollections=1 to exercise it.`,
          );
        }

        const cards: Property[] = top.map((p, i) => {
          const cached = spacesCache.current.get(p.id);
          return {
            ...p,
            // heroimage wins over the API's own Images field, which is the
            // one the operator actually chose for this property.
            image: propertyImage(heroes.get(p.id) || p.imageUrl, i),
            adminFee,
            promo: cached?.promo,
            spaces: cached ? cached.spaces : null,
          };
        });

        if (!cancelled) {
          setApiProperties(cards);
          setRefLoc(ref);
        }
      } catch {
        if (!cancelled) {
          setApiProperties([]);
          setRefLoc(null);
        }
      }
    })();

    return () => { cancelled = true; clearTimeout(deadline); };
  }, [radiusMiles, adminFee, propertyId, featured, cap, internalCollection]);

  // While loading we render skeleton cards — showing DEMO_PROPERTIES here meant
  // real-looking names/prices flashed up and were then replaced. Demo data is
  // still the fallback for an EMPTY result, so the section never renders blank in
  // the editor/preview.
  // `stalled` ends the loading state without pretending the data arrived — the
  // fallback below is then the same one the unreachable-API `catch` produces.
  const loading = apiProperties === null && !stalled;
  const properties = apiProperties && apiProperties.length ? apiProperties : DEMO_PROPERTIES;
  /**
   * Why the list is empty, when it is — or `null` to fall back to demo cards.
   *
   * Only a FILTER earns a message. An empty result with no filter applied is the
   * unreachable-API case, which keeps the existing demo-card fallback so the
   * section never renders blank in the Duda editor or a preview.
   *
   * Featured is a filter (the `nearbyLocationPriorityOrder` column), and it is
   * the one worth
   * naming: an operator who has selected "featured facilities" and filled nothing
   * in needs to be told that, not shown six invented facilities.
   */
  const emptyMessage =
    // `apiProperties` rather than `!loading`: a stalled load also ends `loading`,
    // and it has no idea whether a filter matched anything. Only a completed read
    // that came back empty may name a reason.
    apiProperties && apiProperties.length === 0
      ? featured
        ? `No featured facilities yet — set “nearbyLocationPriorityOrder” on the properties to feature.`
        : radiusMiles > 0
          ? `No properties found within ${radiusMiles} miles.`
          : null
      : null;

  const totalPages = Math.ceil(properties.length / cardsPerPage);

  /* Desktop steps ONE CARD at a time, exactly as #12's blog listing does — the
     arrows advance a position, not a page, so nine properties give seven stops
     rather than three.
     The strip's items are COLUMNS, not cards, which is what keeps the `rows: 2`
     layout: a column holds `rowCount` cards stacked, so three columns are on
     screen either way and one step is one column. With rows: 1 a column IS a
     card and this is #12 byte for byte. */
  const columns = Array.from(
    { length: Math.ceil(properties.length / rowCount) },
    (_, i) => properties.slice(i * rowCount, i * rowCount + rowCount),
  );
  const deskCar = useCarousel({ count: columns.length, perView: COLUMNS });
  /* Mobile is one card, dragged. useSwipe only classified a finished gesture,
     so the card did not move under the finger — it jumped after the fact.
     useCarousel follows the drag and snaps on release, the same hook and feel
     #05's nearby section and the blog listing use. */
  const mobileCar = useCarousel({ count: properties.length, perView: 1, draggable: true });
  const reduceMotion = usePrefersReducedMotion();
  const safePage = deskCar.index;
  const mobileIdx = mobileCar.index;
  /* Pulled out so the reset effect can depend on THESE rather than on the two
     carousel objects, which are new every render and would re-run it — and
     re-running it refetches. Both are useCallback'd inside the hook. */
  const deskGoTo = deskCar.goTo;
  const mobileGoTo = mobileCar.goTo;
  /* Back to the first page whenever the set is refetched. Its own effect, not a
     line inside the fetch above: the carousels cannot be declared until
     `totalPages` and `properties` exist, which is below that effect, so the
     reset has to live down here with them. */
  useEffect(() => {
    deskGoTo(0);
    mobileGoTo(0);
  }, [radiusMiles, adminFee, propertyId, featured, cap, internalCollection, deskGoTo, mobileGoTo]);

  /**
   * The ids on screen right now — the desktop page's cards plus the one card the
   * mobile carousel is showing.
   *
   * Both frames are always in the DOM (one is `display: none`), so both count as
   * visible; the mobile index normally sits inside the desktop page anyway, and
   * only adds an id once a visitor has swiped past it. The result is
   * `cardsPerPage` ids — **3 for a one-row layout, 6 for two** — which is exactly
   * the fan-out the spaces effect performs.
   */
  const visibleIds = useMemo(() => {
    if (!apiProperties?.length) return [] as string[];
    const ids = apiProperties
      .slice(safePage * cardsPerPage, safePage * cardsPerPage + cardsPerPage)
      .map((p) => p.id);
    const onMobile = apiProperties[Math.min(mobileIdx, apiProperties.length - 1)]?.id;
    if (onMobile && !ids.includes(onMobile)) ids.push(onMobile);
    return ids;
  }, [apiProperties, safePage, cardsPerPage, mobileIdx]);

  /**
   * Spaces for the visible cards — one parallel batch per page.
   *
   * Runs on every page turn and swipe, and asks only for ids it has neither
   * cached nor got in flight, so paging back to a page already seen costs nothing
   * and no id is ever requested twice.
   *
   * Results land **per property as each resolves** rather than after the slowest
   * of the batch: `SpacesSkeleton` has already reserved each card's space block,
   * so a card filling in early moves nothing on the page. That is the whole reason
   * the eager all-or-nothing paint could be dropped.
   *
   * The cache is written before the cancelled check on purpose — a lookup that
   * finished after a re-sort is still a valid answer for that property, and
   * throwing it away would make the next page turn pay for it again.
   */
  useEffect(() => {
    const missing = visibleIds.filter(
      (id) => !spacesCache.current.has(id) && !spacesInFlight.current.has(id),
    );
    if (!missing.length) return;

    let cancelled = false;
    missing.forEach((id) => spacesInFlight.current.add(id));

    fetchSpacesForProperties(missing, (id, data) => {
      spacesCache.current.set(id, data);
      spacesInFlight.current.delete(id);
      if (cancelled) return;
      setApiProperties((prev) =>
        prev
          ? prev.map((p) =>
              p.id === id ? { ...p, promo: data.promo, spaces: data.spaces } : p,
            )
          : prev,
      );
    }).catch((err) => {
      // `fetchSpacesForProperties` now guarantees a result per id even when it
      // throws, so the cards are already resolved by the time this runs — this
      // is the unhandled-rejection guard, plus the in-flight release for any id
      // that somehow slipped through. Without the release those ids are pinned:
      // the set is only cleared BY a result, so a skipped one would never be
      // requested again and its card would shimmer for the life of the page.
      missing.forEach((id) => spacesInFlight.current.delete(id));
      // eslint-disable-next-line no-console
      console.warn('[#07 nearby] space lookup failed for', missing, err);
    });

    return () => { cancelled = true; };
  }, [visibleIds]);


  // Map pins from the live properties (price = cheapest starting rate).
  // Coordinate-less properties are DROPPED here, not plotted: extraction now keeps
  // them (see extractProperties) carrying lat/lng 0, which is a real place in the
  // Atlantic, and one such pin would blow the map's auto-fit out to the whole
  // globe. `active` is matched on identity rather than index for the same reason —
  // after the filter the indices no longer line up with the list.
  const mapPoints: MapPoint[] = (apiProperties ?? [])
    .filter((p) => p.hasCoords !== false)
    .map((p) => ({
      id: p.id,
      lat: p.lat,
      lng: p.lng,
      label: p.spaces?.[0] ? `$${p.spaces[0].startingPrice}` : undefined,
      name: p.name,
      address: p.address,
      distance: p.distanceMiles != null ? formatDistance(p.distanceMiles) : undefined,
      active: p.id === apiProperties?.[Math.min(mobileIdx, apiProperties.length - 1)]?.id,
    }));

  /* Where to centre the map.
     `refLoc` when there is one — the visitor's own location, or the property
     this page is about — because then the map should be about THEM.
     Otherwise the middle of the pins. The map used to require refLoc and say
     "Map unavailable" without it, which is wrong whenever there are locations
     to show: refLoc is null on the common path for this widget, where
     geolocation is declined and `propertyId` is unset (it is optional here, and
     the list already handles its absence by dropping distances rather than
     going blank). So the map was refusing to draw ten plottable properties for
     want of a centre it could work out from the pins themselves.
     NearbyMap's fitZoom then picks the largest zoom that fits them all, so a
     portfolio spread across several states still frames correctly. */
  const mapCenter = refLoc ?? (mapPoints.length
    ? {
      lat: mapPoints.reduce((t, p) => t + p.lat, 0) / mapPoints.length,
      lng: mapPoints.reduce((t, p) => t + p.lng, 0) / mapPoints.length,
    }
    : null);

  return (
    <div className="nl-wrapper">
      {/* One announcement for the whole widget: the desktop and mobile frames are
          both always in the DOM (one is display:none), so putting this inside each
          skeleton would queue it twice. The cards themselves are aria-hidden, so
          without this a screen reader gets silence for the whole load. */}
      {loading && (
        <span className="nl-sr-only" role="status">Loading nearby locations…</span>
      )}

      {/* ── Desktop ─────────────────────────────────────────────────────── */}
      <div className="nl-desktop">
        <div className="nl-heading-block">
          <div className="nl-title">{heading}</div>
          <p className="nl-subtitle">{subheading}</p>
        </div>

        {emptyMessage ? (
          <p className="nl-empty">{emptyMessage}</p>
        ) : (
          <>
            {loading ? (
              <div className="nl-grid">
                {Array.from({ length: cardsPerPage }, (_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : (
              /* EVERY page rendered once inside a track, and one transform moves
                 it. The old `pageCards.slice(...)` re-rendered a different set
                 into a static grid — an instant cut, with nothing on screen to
                 animate. */
              <div className="nl-track-window" style={{ '--nl-per-view': COLUMNS } as React.CSSProperties}>
                <div
                  className="nl-track"
                  style={{
                    /* Pixels, not a percentage. A translateX percentage resolves
                       against the TRACK's own width, and the items are sized off
                       the window, so a percentage under-shifts and the last
                       column never reaches the edge — #12 documents the same
                       trap. --nl-step is one column, the same quantity the items
                       are sized by, so pitch and travel cannot drift apart. */
                    transform: `translateX(calc(${(deskCar.offsetPct / 100).toFixed(6)} * var(--nl-step)))`,
                    transition: reduceMotion ? 'none' : 'transform 0.45s cubic-bezier(0.22, 0.61, 0.36, 1)',
                  }}
                >
                  {columns.map((col, i) => (
                    <div className="nl-track-col" key={col[0]?.id ?? i}>
                      {col.map((property) => (
                        <PropertyCard
                          key={property.id}
                          property={property}
                          propertyBasePath={propertyBase}
                          rentalPageUrl={rentalPath}
                          companyId={handoffCompanyId}
                          enableValueTiers={valueTiers}
                          valueTiersChannel={valueTiersChannel}
                          valueTiersPageUrl={valueTiersPageUrl}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!loading && totalPages > 1 && (
              <div className="nl-pagination">
                <button className="nl-page-btn nl-page-btn-prev" onClick={deskCar.prev} disabled={!deskCar.canPrev} aria-label="Previous">
                  <ChevronRight size={40} />
                </button>
                <CarouselDots count={deskCar.maxIndex + 1} active={safePage} onPick={deskCar.goTo} dotClass="nl-dot" label="Go to page {n}" />
                <button className="nl-page-btn" onClick={deskCar.next} disabled={!deskCar.canNext} aria-label="Next">
                  <ChevronRight size={40} />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Mobile ──────────────────────────────────────────────────────── */}
      <div className="nl-mobile">
        <div className="nl-mobile-title">
          <span>Nearby Storage</span>
        </div>

        <div className="nl-mobile-tabs">
          <button className={`nl-mobile-tab${mobileView === 'list' ? ' active' : ''}`} onClick={() => setMobileView('list')}>List View</button>
          <button className={`nl-mobile-tab${mobileView === 'map' ? ' active' : ''}`} onClick={() => setMobileView('map')}>Map View</button>
        </div>

        {mobileView === 'list' ? (
          emptyMessage ? (
            <p className="nl-empty">{emptyMessage}</p>
          ) : (
            <>
              {loading ? (
                <SkeletonCard />
              ) : (
                <>
                  {/* Dots are the indicator, swiping is the control — this view
                      never had arrows to begin with. */}
                  <div
                    className="nl-track-window nl-track-window--mobile"
                    style={{ '--nl-per-view': 1 } as React.CSSProperties}
                    {...mobileCar.handlers}
                  >
                    <div
                      className="nl-track"
                      style={{
                        transform: `translateX(calc(${(mobileCar.offsetPct / 100).toFixed(6)} * var(--nl-step)))`,
                        transition:
                          reduceMotion || mobileCar.dragging
                            ? 'none'
                            : 'transform 0.45s cubic-bezier(0.22, 0.61, 0.36, 1)',
                      }}
                    >
                      {properties.map((property, i) => (
                        <div className="nl-track-col" key={property.id} aria-hidden={i === mobileIdx ? undefined : true}>
                          <PropertyCard
                            property={property}
                            propertyBasePath={propertyBase}
                            rentalPageUrl={rentalPath}
                            companyId={handoffCompanyId}
                            enableValueTiers={valueTiers}
                            valueTiersChannel={valueTiersChannel}
                            valueTiersPageUrl={valueTiersPageUrl}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="nl-pagination nl-pagination-dots">
                    <CarouselDots count={properties.length} active={mobileIdx} onPick={mobileCar.goTo} dotClass="nl-dot" />
                  </div>
                </>
              )}
            </>
          )
        ) : loading ? (
          /* "Map unavailable" is the RIGHT answer when geolocation was declined and
             no propertyId anchors us — but it used to be the answer while the fetch
             was still in flight too, stating something false. Both cases produce
             refLoc === null, so the loading one has to be tested first. */
          <div className="nl-map"><span className="nl-skeleton-block nl-skeleton-map" /></div>
        ) : mapCenter && mapPoints.length ? (
          <NearbyMap center={mapCenter} points={mapPoints} className="nl-map" />
        ) : (
          <div className="nl-map"><span className="nl-map-selected">Map unavailable</span></div>
        )}
      </div>

    </div>
  );
}
