import React, { useEffect, useState } from 'react';
import { propertyImage } from '@shared/demoImages';
import { fetchPropertyHeroImages } from '@shared/propertyImages';
import {
  fetchProperties,
  extractNearbyProperties,
  getUserLocation,
  haversineMiles,
  fetchPropertySpaces,
  formatDistance,
} from '@shared/nearbyProperties';
import { useCarousel, usePrefersReducedMotion } from '@shared/useCarousel';
import { CarouselDots } from '@shared/CarouselDots';
import { NearbyMap, type MapPoint } from '@shared/NearbyMap';
import cfg from '../../config.json';
import { resolveCompanyIdFromSources } from '@shared/companySource';
import { usePropertyId } from '../../propertyContext';
import { PromoTagIcon } from '../Pricing';
import { CarouselChevron } from '../chevron';

type ViewMode = 'list' | 'map';

interface NearbyUnit {
  dimensions: string;
  subtype: string;
  inStore: number;
  startingAt: number;
}

interface NearbyProperty {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** First facility photo URL from the API, if any (else placeholder). */
  imageUrl?: string;
  /** Miles from the reference location; null if unknown. */
  distanceMiles: number | null;
  /** Rating/reviews aren't in the properties API; present only on demo data. */
  rating?: number;
  reviewCount?: number;
  address: string;
  phone: string;
  promotion: string;
  units: NearbyUnit[];
  adminFee: number;
}

const MAX_NEARBY = 6;
const DEFAULT_ADMIN_FEE = 20;

const DEMO_PROPERTIES: NearbyProperty[] = [
  { id: '1', name: '3rd Street Storage',  lat: 0, lng: 0, distanceMiles: 1.7, rating: 4.5, reviewCount: 32, address: '8478 3rd Street, Fullerton, CA 02027',   phone: '(555) 555-5555', promotion: 'Short Promotion Title', adminFee: 20, units: [{ dimensions: "5' x 5'", subtype: 'Climate Controlled', inStore: 55,  startingAt: 25  }, { dimensions: "10' x 10'", subtype: 'Drive Up', inStore: 174, startingAt: 140 }, { dimensions: "10' x 12'", subtype: 'Drive Up', inStore: 580, startingAt: 450 }] },
  { id: '2', name: 'Storfun Storage',      lat: 0, lng: 0, distanceMiles: 2.5, rating: 4.5, reviewCount: 19, address: '210 Holt Ave, Pomona, CA 91768',          phone: '(555) 555-1111', promotion: 'First Month Free', adminFee: 20, units: [{ dimensions: "5' x 5'", subtype: 'Climate Controlled', inStore: 60,  startingAt: 30  }, { dimensions: "10' x 10'", subtype: 'Climate Controlled', inStore: 190, startingAt: 155 }, { dimensions: "10' x 20'", subtype: 'Drive Up', inStore: 320, startingAt: 260 }] },
  { id: '3', name: 'Green Street Storage', lat: 0, lng: 0, distanceMiles: 3.0, rating: 4.2, reviewCount: 41, address: '540 Green St, Covina, CA 91722',          phone: '(555) 555-2222', promotion: 'No Admin Fee Today', adminFee: 0,  units: [{ dimensions: "5' x 5'", subtype: 'Drive Up', inStore: 45,  startingAt: 22  }, { dimensions: "10' x 10'", subtype: 'Drive Up', inStore: 160, startingAt: 130 }, { dimensions: "10' x 15'", subtype: 'Drive Up', inStore: 200, startingAt: 170 }] },
  { id: '4', name: 'Maple Avenue Storage', lat: 0, lng: 0, distanceMiles: 3.8, rating: 4.8, reviewCount: 18, address: '100 Maple Ave, Fullerton, CA 02028',      phone: '(555) 555-3333', promotion: 'Short Promotion Title', adminFee: 20, units: [{ dimensions: "5' x 10'", subtype: 'Climate Controlled', inStore: 90,  startingAt: 65  }, { dimensions: "10' x 10'", subtype: 'Climate Controlled', inStore: 174, startingAt: 140 }, { dimensions: "10' x 20'", subtype: 'Drive Up', inStore: 310, startingAt: 250 }] },
  { id: '5', name: 'Central Self Storage', lat: 0, lng: 0, distanceMiles: 4.1, rating: 4.7, reviewCount: 54, address: '22 Central Blvd, Fullerton, CA 02029',   phone: '(555) 555-4444', promotion: 'Short Promotion Title', adminFee: 20, units: [{ dimensions: "5' x 5'", subtype: 'Drive Up', inStore: 55,  startingAt: 25  }, { dimensions: "10' x 10'", subtype: 'Drive Up', inStore: 174, startingAt: 140 }, { dimensions: "10' x 12'", subtype: 'Drive Up', inStore: 580, startingAt: 450 }] },
];

// ── Icons ─────────────────────────────────────────────────────────────────────

// Tag mark: the exact Figma vector, same as #07 nearby-locations uses. Imported
// as PromoTagIcon (identical path, already in this widget) rather than kept as a
// third copy — the local one here was a rough 24x24 stand-in with a hardcoded
// #509e2f fill, so it neither matched the shape nor could be themed.
const TagIcon = PromoTagIcon;


function MapPinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="white" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M8.00027 1.33333C6.89219 1.33333 5.44063 1.71745 4.25329 2.68153C3.04102 3.66586 2.14062 5.2271 2.14062 7.48148C2.14062 9.75511 3.21704 11.6241 4.43297 12.9076C5.0426 13.5511 5.70019 14.0619 6.30394 14.4159C6.88105 14.7544 7.49439 15 8.00027 15C8.50615 15 9.1195 14.7544 9.69661 14.4159C10.3004 14.0619 10.9579 13.5511 11.5676 12.9076C12.7835 11.6241 13.8599 9.75511 13.8599 7.48148C13.8599 5.2271 12.9595 3.66586 11.7473 2.68153C10.5599 1.71745 9.10835 1.33333 8.00027 1.33333ZM5.71973 7.19297C5.71973 5.93338 6.74083 4.91227 8.00043 4.91227C9.26003 4.91227 10.2811 5.93338 10.2811 7.19297C10.2811 8.45257 9.26003 9.47368 8.00043 9.47368C6.74083 9.47368 5.71973 8.45257 5.71973 7.19297Z" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="white" xmlns="http://www.w3.org/2000/svg">
      <path d="M5.36398 8.11545C5.09378 8.36585 4.78548 8.60104 4.49713 8.81529C5.17576 9.82491 6.022 10.6889 7.01465 11.3862C7.30745 11.0339 7.63607 10.6446 7.98993 10.3227C9.0284 9.37799 10.4636 9.00172 11.8319 9.3155C12.3635 9.43741 12.9969 9.62899 13.5279 9.98616C14.0806 10.358 14.5376 10.9226 14.635 11.7457C14.6743 12.0778 14.6837 12.4752 14.6237 12.8423C14.4172 14.1053 13.1904 14.7659 12.1134 14.6387C10.1192 14.4033 8.32398 13.7873 6.79149 12.8362C5.23715 11.8716 3.96312 10.5682 3.03069 8.98815C2.1549 7.50408 1.58536 5.78439 1.36118 3.88422C1.23416 2.80763 1.894 1.58024 3.15726 1.37366C3.50113 1.31743 3.89134 1.32868 4.18497 1.35516C4.96125 1.42518 5.51945 1.81474 5.90181 2.32153C6.26737 2.80607 6.47181 3.39414 6.60308 3.90659C6.99348 5.43064 6.5179 7.04617 5.36398 8.11545Z" />
    </svg>
  );
}

// ── Stars (with half-star support) ────────────────────────────────────────────

// Canonical round rating star (shared with the Reviews widget).
const ROUND_STAR =
  'M16.5423 5.649L12.0203 4.63275L9.67431 0.562657C9.24231 -0.187552 8.17831 -0.187552 7.74631 0.562657L5.40031 4.63275L0.878308 5.649C0.0453085 5.83655 -0.283691 6.86707 0.282309 7.51841L3.35531 11.0503L2.90631 15.7483C2.82331 16.6137 3.68431 17.2518 4.46631 16.9032L8.71131 15.0164L12.9563 16.9032C13.7383 17.2508 14.5993 16.6137 14.5163 15.7483L14.0673 11.0503L17.1403 7.51841C17.7063 6.86809 17.3773 5.83655 16.5443 5.649H16.5423Z';

function Stars({ rating, size = 16, color = '#FFD000' }: { rating: number; size?: number; color?: string }) {
  const full  = Math.floor(rating);
  const half  = rating - full >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);
  const vb = '0 0 17.15 17';

  return (
    <div className="sl-nb2-stars">
      {Array.from({ length: full }).map((_, i) => (
        <svg key={`f${i}`} width={size} height={size} viewBox={vb} fill={color}><path d={ROUND_STAR}/></svg>
      ))}
      {half && (
        <span style={{ position: 'relative', display: 'inline-flex', width: size, height: size, flexShrink: 0 }}>
          <svg width={size} height={size} viewBox={vb} fill="#DFE3E8" style={{ position: 'absolute' }}><path d={ROUND_STAR}/></svg>
          <svg width={size} height={size} viewBox={vb} fill={color} style={{ position: 'absolute', clipPath: 'inset(0 50% 0 0)' }}><path d={ROUND_STAR}/></svg>
        </span>
      )}
      {Array.from({ length: empty }).map((_, i) => (
        <svg key={`e${i}`} width={size} height={size} viewBox={vb} fill="#DFE3E8"><path d={ROUND_STAR}/></svg>
      ))}
    </div>
  );
}

// ── Property card ─────────────────────────────────────────────────────────────

function PropertyCard({ p, index }: { p: NearbyProperty; index: number }) {
  return (
    <div className="sl-nb2-card">

      {/* Image area */}
      <div className="sl-nb2-img" style={{ background: propertyImage(p.imageUrl, index) }}>
        <div className="sl-nb2-img-overlay" />
        {p.distanceMiles != null && (
          <span className="sl-nb2-distance">{formatDistance(p.distanceMiles)}</span>
        )}
        <div className="sl-nb2-prop-info">
          <p className="sl-nb2-prop-name">{p.name}</p>
          {p.rating != null && (
            <div className="sl-nb2-prop-rating">
              <span className="sl-nb2-prop-score">{p.rating}</span>
              <Stars rating={p.rating} size={16} color="#FBBC05" />
              <a href="#" className="sl-nb2-prop-reviews">{p.reviewCount} Reviews</a>
            </div>
          )}
          <div className="sl-nb2-prop-meta">
            {p.address && (
              <div className="sl-nb2-prop-meta-row">
                <MapPinIcon />
                <a href="#" className="sl-nb2-prop-meta-link">{p.address}</a>
              </div>
            )}
            {p.phone && (
              <div className="sl-nb2-prop-meta-row">
                <PhoneIcon />
                <a href={`tel:${p.phone.replace(/[^0-9+]/g, '')}`} className="sl-nb2-prop-meta-link">{p.phone}</a>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Available spaces */}
      <div className="sl-nb2-spaces">

        {/* Promo banner */}
        {p.promotion && (
          <div className="sl-nb2-promo">
            <TagIcon />
            <span className="sl-nb2-promo-title">{p.promotion}</span>
          </div>
        )}

        {/* Unit rows */}
        {p.units.length > 0 && (
        <div className="sl-nb2-units">
          {p.units.map((u, i) => (
            <div key={i} className="sl-nb2-unit-row">
              <div className="sl-nb2-unit-info">
                <span className="sl-nb2-unit-dims">{u.dimensions}</span>
                <span className="sl-nb2-unit-type">{u.subtype}</span>
              </div>
              <div className="sl-nb2-unit-pricing">
                <TagIcon />
                <div className="sl-nb2-instore">
                  <span className="sl-nb2-instore-label">IN-STORE</span>
                  <span className="sl-nb2-instore-price">${u.inStore}</span>
                </div>
                <div className="sl-nb2-vdivider" />
                <div className="sl-nb2-starting">
                  <span className="sl-nb2-starting-label">STARTING AT</span>
                  <span className="sl-nb2-starting-price">${u.startingAt}</span>
                </div>
                <button className="sl-nb2-select">Select</button>
              </div>
            </div>
          ))}
        </div>
        )}

        {/* Footer */}
        <div className="sl-nb2-footer">
          {p.adminFee > 0 && (
            <span className="sl-nb2-admin-fee">+ Plus ${p.adminFee} Admin Fee</span>
          )}
          <a href="#" className="sl-nb2-see-all">
            See All Spaces
          </a>
        </div>

      </div>
    </div>
  );
}

/** Loading placeholder mirroring the card's geometry (image, promo, 3 unit rows,
 *  footer) so the panel doesn't jump when the real card arrives. */
function SkeletonCard() {
  return (
    <div className="sl-nb2-card sl-nb2-skeleton" aria-hidden="true">
      <div className="sl-nb2-img sl-nb2-sk-block" />
      <div className="sl-nb2-spaces">
        <div className="sl-nb2-sk-line sl-nb2-sk-promo" />
        <div className="sl-nb2-units">
          {[0, 1, 2].map((i) => (
            <div key={i} className="sl-nb2-unit-row">
              <div className="sl-nb2-unit-info">
                <span className="sl-nb2-sk-line sl-nb2-sk-dims" />
                <span className="sl-nb2-sk-line sl-nb2-sk-type" />
              </div>
              <div className="sl-nb2-unit-pricing">
                <span className="sl-nb2-sk-line sl-nb2-sk-price" />
                <span className="sl-nb2-sk-block sl-nb2-sk-btn" />
              </div>
            </div>
          ))}
        </div>
        <div className="sl-nb2-footer">
          <span className="sl-nb2-sk-line sl-nb2-sk-fee" />
          <span className="sl-nb2-sk-line sl-nb2-sk-seeall" />
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function NearbySection() {
  // Which facility this Space List is showing — from Duda via SpaceList, '' when
  // unbound. Deliberately NOT cfg.propertyId: that build-time value belongs to a
  // different company on this site, so using it would anchor "nearby" to a
  // property that isn't in the list and exclude nothing.
  const currentPropertyId = usePropertyId();
  const [view, setView] = useState<ViewMode>('list');

  // null = still loading; [] = loaded but nothing nearby.
  const [apiProps, setApiProps] = useState<NearbyProperty[] | null>(null);
  const [refLoc, setRefLoc] = useState<{ lat: number; lng: number } | null>(null);

  // This section only mounts when the "Nearby Storage" accordion is opened, so
  // the fetch happens lazily. Same two location scenarios as widget #07:
  // visitor geolocation → else the current property's coordinates.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Company comes from the `Company` collection, not config.json — see
        // @shared/companySource. Cached, so this shares the page's single read.
        const creds = {
          ...cfg,
          companyId: await resolveCompanyIdFromSources('#05 nearby', {}, cfg.companyId),
        };
        const [raw, userLoc] = await Promise.all([
          // No requirePropertyId: this section wants ALL the company's properties,
          // and the collection is the site's own data — nothing to distrust.
          fetchProperties(creds, {}),
          getUserLocation(),
        ]);
        const all = extractNearbyProperties(raw, cfg.appId);

        const current = currentPropertyId ? all.find((p) => p.id === currentPropertyId) : undefined;
        const ref = userLoc
          ? { ...userLoc, source: 'user' as const }
          : current
            ? { lat: current.lat, lng: current.lng, source: 'property' as const }
            : null;
        if (!ref) { if (!cancelled) setApiProps([]); return; }

        const ranked = all
          .filter((p) => p.id !== currentPropertyId)
          .map((p) => ({ p, distanceMiles: haversineMiles(ref, p) }))
          .sort((a, b) => a.distanceMiles - b.distanceMiles)
          .slice(0, MAX_NEARBY);

        // Hero photos for the whole list in one read (see @shared/propertyImages).
        // Fails soft: without it each card keeps the API's own image.
        const heroes = await fetchPropertyHeroImages().catch(() => new Map<string, string>());

        // Stage 1: paint cards with distance/name/address/phone immediately.
        const base: NearbyProperty[] = ranked.map(({ p, distanceMiles }) => ({
          id: p.id,
          name: p.name,
          lat: p.lat,
          lng: p.lng,
          // The operator's chosen hero beats the API's Images field.
          imageUrl: heroes.get(p.id) || p.imageUrl,
          distanceMiles,
          address: p.address,
          phone: p.phone,
          promotion: '',
          units: [],
          adminFee: DEFAULT_ADMIN_FEE,
        }));
        if (!cancelled) { setRefLoc({ lat: ref.lat, lng: ref.lng }); setApiProps(base); }

        // Stage 2: enrich each card with spaces + promo as they resolve.
        ranked.forEach(({ p }) => {
          fetchPropertySpaces(cfg, p.id).then(({ promo, spaces }) => {
            if (cancelled) return;
            setApiProps((prev) =>
              prev
                ? prev.map((c) =>
                    c.id === p.id
                      ? {
                          ...c,
                          promotion: promo ?? '',
                          units: spaces.map((s) => ({
                            dimensions: s.size,
                            subtype: s.subtype,
                            inStore: s.inStorePrice,
                            startingAt: s.startingPrice,
                          })),
                        }
                      : c,
                  )
                : prev,
            );
          });
        });
      } catch (err) {
        console.error('[NearbySection] load error:', err);
        if (!cancelled) setApiProps([]);
      }
    })();

    return () => { cancelled = true; };
  }, [currentPropertyId]);

  // While loading we render a skeleton card — showing DEMO_PROPERTIES here meant
  // real-looking names/prices flashed up and were then replaced. Demo data is
  // still the fallback for an EMPTY result, so the section never renders blank
  // inside the editor or preview.
  const loading = apiProps === null;
  const properties = apiProps && apiProps.length ? apiProps : DEMO_PROPERTIES;
  const total = properties.length;
  /* The header badge is counted in SectionAccordion, not here: this component
     is unmounted while the section is closed, so anything it reported would
     vanish the moment somebody collapsed it. */
  // One card at a time, dragged with the finger — same shared hook the blog
  // listing uses, so the feel and the 6-dot cap stay identical across widgets.
  const carousel = useCarousel({ count: total, perView: 1, draggable: true });
  const reduceMotion = usePrefersReducedMotion();
  const safePage = carousel.index;

  // Map pins from the live nearby list (price = cheapest starting rate).
  const mapPoints: MapPoint[] = (apiProps ?? []).map((p, i) => ({
    id: p.id,
    lat: p.lat,
    lng: p.lng,
    label: p.units[0] ? `$${p.units[0].startingAt}` : undefined,
    name: p.name,
    address: p.address,
    distance: p.distanceMiles != null ? formatDistance(p.distanceMiles) : undefined,
    active: i === safePage,
  }));

  return (
    <div className="sl-nb2">

      {/* View toggle */}
      <div className="sl-nb2-view-tabs">
        <button className={`sl-nb2-view-tab${view === 'list' ? ' active' : ''}`} onClick={() => setView('list')}>List View</button>
        <button className={`sl-nb2-view-tab${view === 'map'  ? ' active' : ''}`} onClick={() => setView('map')}>Map View</button>
      </div>

      {/* Content */}
      {/* Swipeable: the arrows are hidden on mobile (see SpaceList.css). */}
      {/* Swipe pages the cards, so it is list-view only too: on the map it would
          be invisible navigation with no dots to reflect it, and it would fight
          the map's own drag-to-pan. */}
      <div className={`sl-nb2-content${view === 'list' ? '' : ' sl-nb2-content--no-pager'}`}>
        {loading && view === 'list' ? (
          <SkeletonCard />
        ) : view === 'map' ? (
          refLoc && mapPoints.length ? (
            <NearbyMap center={refLoc} points={mapPoints} height={280} />
          ) : (
            <div className="sl-nb2-map-placeholder">
              <span>Map unavailable</span>
            </div>
          )
        ) : (
          /* Every property renders once and one transform slides the row; the
             window clips the rest. Drag handlers live on the window so a swipe
             anywhere over the card moves it. List view only — on the map a drag
             would fight the map's own pan. */
          <div className="sl-nb2-track-window" {...carousel.handlers}>
            <div
              className="sl-nb2-track"
              style={{
                transform: `translateX(calc(${(carousel.offsetPct / 100).toFixed(6)} * (100% + 10px)))`,
                transition:
                  reduceMotion || carousel.dragging
                    ? 'none'
                    : 'transform 0.45s cubic-bezier(0.22, 0.61, 0.36, 1)',
              }}
            >
              {properties.map((p, i) => (
                <div
                  className="sl-nb2-track-item"
                  key={p.id ?? i}
                  {...(i === safePage ? {} : { inert: '' as unknown as boolean })}
                  aria-hidden={i === safePage ? undefined : true}
                >
                  <PropertyCard p={p} index={i} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Pagination — LIST VIEW ONLY. The map plots every property at once, so
          there is nothing to page through there. Still only hidden (not
          unmounted) while loading, so the row keeps its height instead of the
          cards jumping when the count arrives. */}
      {view === 'list' && (
        <div className="sl-nb2-pagination" style={loading ? { visibility: 'hidden' } : undefined}>
          <button className="sl-nb2-arrow" onClick={carousel.prev} disabled={!carousel.canPrev} aria-label="Previous property">
            <CarouselChevron dir="left" />
          </button>
          {/* Capped at 6 with the window sliding — a company with 20 nearby
              properties must not print 20 dots. */}
          <CarouselDots
            count={total}
            active={safePage}
            onPick={carousel.goTo}
            dotClass="sl-nb2-dot"
            label="Go to nearby property {n}"
          />
          <button className="sl-nb2-arrow" onClick={carousel.next} disabled={!carousel.canNext} aria-label="Next property">
            <CarouselChevron dir="right" />
          </button>
        </div>
      )}

    </div>
  );
}
