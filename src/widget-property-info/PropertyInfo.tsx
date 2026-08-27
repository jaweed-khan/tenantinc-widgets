import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './PropertyInfo.css';
import { useStickySlot, useMediaQuery, MOBILE_STICKY_QUERY } from '@shared/stickyStack';
import { useSwipe } from '@shared/useSwipe';
import { scrollToSpaceList } from '@shared/promoBus';
import { createLead, fetchPropertyDetails, propertyBreadcrumb, stateName, type PropertyDetails, type BoundPropertyProps } from './api';
import {
  Breadcrumb, collapseMiddle, locationCrumbHead, normaliseBase, placeSlug,
  LOCATION_BASE_PATH, type Crumb,
} from '@shared/Breadcrumb';
import { fetchPropertyImages } from '@shared/propertyImages';
import { fetchReviewSource } from '@shared/reviewsCollections';
import {
  MapPinIcon, MapPinSolidIcon, PhoneIcon, EnvelopeIcon, ClockIcon, CalendarCheckIcon,
  PhotoExpandIcon, ChevronRight, Stars, SOCIALS, CreditCardIcon, LocationsIcon,
  LightboxChevron,
} from './icons';
import { MessageModal } from '@shared/components/MessageModal';
import { CloseCircleIcon } from '@shared/ui/icons';

// ---------------------------------------------------------------------------
// Types + demo data
// ---------------------------------------------------------------------------

interface PhoneEntry { number: string; note?: string; }

export interface PropertyInfoProps {
  /** Desktop display mode. 'full' = detailed layout (default), 'hero' = image-led banner. */
  displayMode?: 'full' | 'hero';
  /** Primary/featured image — the hero-view background and first gallery slide. */
  heroImage?: string;
  /** Additional gallery images (the "Other Images" list). */
  images?: string[];
  /** Dark overlay strength over the hero image, 0–100 (%). Default 50. */
  overlayOpacity?: number;
  name?: string;
  rating?: number;
  reviewCount?: number;
  reviewsUrl?: string;
  address?: string;
  addressUrl?: string;
  phones?: PhoneEntry[];
  messageUrl?: string;
  gateStatus?: string;
  gateNote?: string;
  officeStatus?: string;
  officeNote?: string;
  /** Third hours line ("Call Center Open"), shown only when the property has one. */
  callCenterStatus?: string;
  callCenterNote?: string;
  reservationUrl?: string;
  breadcrumb?: string[];
  /**
   * Mobile: pin the contact row (Phone/Email/Billpay/Map/Locations) to the top of
   * the page once it scrolls out of view. It shares one fixed stack with #05's
   * filter bar, which pins beneath it — see @shared/stickyStack.
   */
  stickyContactRow?: boolean;
  /** Height of the theme's own fixed header, so the stack clears it. */
  stickyOffsetTop?: number;
  /** Duda editor flag — pinning is skipped in the editor. */
  inEditor?: boolean;
}

/**
 * Props = the widget's own settings plus the dynamic-page bindings. Everything in
 * `BoundPropertyProps` (`propertyId`, `propertyName`, `propertyAddress`, …) is a
 * content-menu field the editor connects to a `Properties` column with "Connect to
 * data"; see @shared/propertyBinding. All optional — unbound behaves as before.
 */
type Props = PropertyInfoProps & BoundPropertyProps;

/**
 * Loading state for the whole widget. Mirrors the full-desktop shape (info
 * column beside the gallery + map) so the swap to real content barely shifts
 * layout; collapses to a single column on mobile via the CSS.
 */
function PropertySkeleton({ displayMode }: { displayMode: 'full' | 'hero' }) {
  return (
    <>
      {/* Wrapped in the SAME .pi-desktop / .pi-mobile switch the real layouts
          use, so the placeholder cannot show a composition the content will
          not. Mobile is not a narrower desktop here: it is a full-bleed hero,
          a row of five circles and a centred hours block — see `mobile` in
          PropertyInfo. The desktop skeleton was being drawn at every width,
          which is why a phone got two big cards and no hero. */}
      <div className="pi-desktop">
      {displayMode === 'hero' ? (
        /* Banner beside a map. Reuses the real .pi-hero-wrap / .pi-hero-row —
           plain flex boxes with a gap — so the placeholder stacks at 1180px
           off the same rule the content does, rather than a copy of it. */
        <div className="pi-hero-wrap" aria-hidden="true">
          <span className="pi-skel-bar pi-skel-crumb" />
          <div className="pi-hero-row">
            <span className="pi-skel-block pi-skel-hero-card" />
            <span className="pi-skel-block pi-skel-hero-map" />
          </div>
        </div>
      ) : (
      <div className="pi-skel" aria-hidden="true">
        <div className="pi-skel-info">
          <span className="pi-skel-bar pi-skel-name" />
          <span className="pi-skel-bar pi-skel-rating" />
          <span className="pi-skel-bar pi-skel-line" />
          <span className="pi-skel-bar pi-skel-line short" />
          <span className="pi-skel-bar pi-skel-line" />
          <span className="pi-skel-bar pi-skel-line short" />
          <span className="pi-skel-bar pi-skel-line" />
        </div>
        <div className="pi-skel-media">
          <span className="pi-skel-bar pi-skel-crumb" />
          <div className="pi-skel-cards">
            <span className="pi-skel-block" />
            <span className="pi-skel-block" />
          </div>
        </div>
      </div>
      )}
      </div>

      <div className="pi-mobile">
        <div className="pi-skel-m" aria-hidden="true">
          <span className="pi-skel-block pi-skel-m-hero" />
          <div className="pi-skel-m-circles">
            {Array.from({ length: 5 }, (_, i) => (
              <div className="pi-skel-m-circle-item" key={i}>
                <span className="pi-skel-bar pi-skel-m-circle" />
                <span className="pi-skel-bar pi-skel-m-circle-label" />
              </div>
            ))}
          </div>
          <div className="pi-skel-m-hours">
            <span className="pi-skel-bar pi-skel-m-hour" />
            <span className="pi-skel-bar pi-skel-m-hour" />
            <span className="pi-skel-bar pi-skel-m-hour" />
            <span className="pi-skel-bar pi-skel-m-seehours" />
          </div>
        </div>
      </div>
      <span className="pi-sr-only" role="status">Loading property details…</span>
    </>
  );
}

/**
 * Fills its box with either a real image (URL) or a CSS gradient placeholder.
 * Gradient strings contain "gradient(" — anything else is treated as an image src.
 */
function ImageFill({ src, className, alt = '', onClick }: {
  src: string;
  className?: string;
  alt?: string;
  /** Used by the lightbox so a click on the photo doesn't close the overlay. */
  onClick?: React.MouseEventHandler;
}) {
  if (src && src.includes('gradient(')) {
    return <span className={className} style={{ background: src }} aria-hidden="true" onClick={onClick} />;
  }
  return <img className={className} src={src} alt={alt} onClick={onClick} />;
}

// Demo "See all Hours" data (real values come from Duda later, like the other
// widgets). Desktop shows a full week in two columns (Figma 6485-144634); the
// mobile modal shows the condensed summary (Figma 6485-144656).
const HOURS_COLUMNS: { title: string; rows: string[] }[] = [
  {
    title: 'Gate Hours',
    rows: [
      'Monday: 6:00 AM - 10:00 PM', 'Tuesday: 6:00 AM - 10:00 PM',
      'Wednesday: 6:00 AM - 10:00 PM', 'Thursday: 6:00 AM - 10:00 PM',
      'Friday: 6:00 AM - 10:00 PM', 'Saturday: 6:00 AM - 10:00 PM',
      'Sunday: 6:00 AM - 10:00 PM',
    ],
  },
  {
    title: 'Office Hours',
    rows: [
      'Monday: 6:00 AM - 10:00 PM', 'Tuesday: 6:00 AM - 10:00 PM',
      'Wednesday: 6:00 AM - 10:00 PM', 'Thursday: 6:00 AM - 10:00 PM',
      'Friday: 6:00 AM - 10:00 PM', 'Saturday: 6:00 AM - 10:00 PM',
      'Sunday: 6:00 AM - 10:00 PM',
    ],
  },
];
const HOURS_MOBILE: { title: string; rows: string[] }[] = [
  { title: 'Office Hours', rows: ['Mon-Sat: 8:00 AM - 5:00 PM', 'Sun: 10:00 AM - 3:00 PM'] },
  { title: 'Gate Hours', rows: ['Mon-Sun: 6:00 AM - 10:00 PM'] },
];

/**
 * Shown when a property genuinely has NO photos — not while they load. Loading
 * is a skeleton (see `imagesLoading`); these appear only once the lookup has
 * settled empty, so a facility without uploads still looks like a facility
 * rather than a grey gradient.
 */
const DEFAULT_GALLERY = [
  'https://irp.cdn-website.com/37c2908c/dms3rep/multi/Hallway.png',
  'https://irp.cdn-website.com/37c2908c/dms3rep/multi/Boxes.png',
];

const DEFAULTS: Required<Pick<PropertyInfoProps, 'name' | 'rating' | 'reviewCount' | 'address' | 'phones' | 'gateStatus' | 'gateNote' | 'officeStatus' | 'officeNote' | 'breadcrumb'>> = {
  name: 'Storelocal Storage Dove Mountain',
  rating: 4.5,
  reviewCount: 32,
  address: '1301 E. Mission Ave, Fullerton, CA 02027',
  phones: [
    { number: '(877) 657-7465', note: 'New Customer' },
    { number: '(877) 847-9487', note: 'Existing Customer' },
  ],
  gateStatus: 'Gate Open',
  gateNote: 'Closes 11:30pm',
  officeStatus: 'Office Closed',
  officeNote: 'Opens 8:30am',
  breadcrumb: ['Home', 'Find storage', 'California', 'Irvine', '5281 California'],
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PropertyInfo(props: Props) {
  const {
    displayMode = 'full',
    heroImage,
    images,
    overlayOpacity = 50,
    name = DEFAULTS.name,
    rating = DEFAULTS.rating,
    reviewCount = DEFAULTS.reviewCount,
    reviewsUrl = '#',
    address = DEFAULTS.address,
    addressUrl = '#',
    phones = DEFAULTS.phones,
    messageUrl = '#',
    gateStatus = DEFAULTS.gateStatus,
    gateNote = DEFAULTS.gateNote,
    officeStatus = DEFAULTS.officeStatus,
    officeNote = DEFAULTS.officeNote,
    callCenterStatus = 'Call Center Open',
    callCenterNote = 'Closes 8:30pm',
    reservationUrl = '#',
    breadcrumb = DEFAULTS.breadcrumb,
    stickyContactRow = true,
    stickyOffsetTop = 0,
    inEditor = false,
    // Dynamic-page bindings (content menu → "Connect to data" → Properties > …).
    propertyId,
    propertyName,
    propertyAddress,
    propertyPhones,
    propertyEmails,
    propertyAccessHours,
    propertySocials,
    propertyUnitCounts,
    propertyTimezone,
  } = props;

  // Pin the mobile contact row to the shared stack (order 10 — above #05's
  // filter bar). Viewport query, not container width: it has to agree with the
  // `@media (max-width: 768px)` desktop/mobile switch in the CSS.
  const isMobileViewport = useMediaQuery(MOBILE_STICKY_QUERY);
  const circles = useStickySlot({
    id: 'pi-contact-row',
    order: 10,
    enabled: stickyContactRow && isMobileViewport && !inEditor,
    offsetTop: stickyOffsetTop,
    // `pi-wrapper` comes along so the row keeps the widget's inherited font,
    // colour and box-sizing once it's portaled out of the widget's tree.
    className: 'pi-wrapper pi-m-circles-pinned',
  });

  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const thumbsRef = useRef<HTMLDivElement>(null);
  const [hoursOpen, setHoursOpen] = useState(false);
  const [reservationOpen, setReservationOpen] = useState(false);
  const [reservationCode, setReservationCode] = useState('');
  const [messageOpen, setMessageOpen] = useState(false);

  // Live property details from the API; null until loaded (or on failure),
  // in which case the props/DEFAULTS above keep rendering unchanged.
  const [property, setProperty] = useState<PropertyDetails | null>(null);
  // No initial-delay grace period here (unlike promotions): this endpoint
  // answers in ~570ms, so a delay would just add a third visible state.
  const [loading, setLoading] = useState(true);

  // Google rating average + total from the `GoogleReviews` collection; the
  // rating/reviewCount props stay as the fallback.
  const [googleRating, setGoogleRating] = useState<{ score: number; count: number } | null>(null);
  // Held by the MAIN skeleton, not a per-section one like the gallery below.
  //
  // The gallery waits on the property (it needs an id), so it outlives the main
  // gate and gets its own placeholder. This read does not: it takes no property
  // id and starts on mount, in parallel with the property fetch — so it belongs
  // to the same first wave, and the widget can simply wait for both.
  //
  // Without it the skeleton cleared on the property alone and the card painted
  // DEFAULTS.rating / DEFAULTS.reviewCount — an invented "4.5 (32 Reviews)" —
  // before the real figures swapped in, in all three layouts. Inventing a rating
  // is worse than inventing a name: a shopper may act on it.
  //
  // It cannot strand the skeleton: fetchReviewSource returns immediately when
  // there is no dmAPI (the Duda editor and the dev harness), and its failures are
  // caught below.
  //
  // Deps stay [] on purpose. The rating is site-wide, not per-property, so a
  // binding change re-runs the property effect only and this stays settled.
  const [ratingLoading, setRatingLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchReviewSource('google', '#03 property-info')
      .then((src) => {
        if (!cancelled && src && src.score > 0) {
          setGoogleRating({ score: src.score, count: src.count });
        }
      })
      .catch((err) => console.error('[PropertyInfo] GoogleReviews read error:', err))
      .finally(() => { if (!cancelled) setRatingLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Re-runs whenever a binding changes, so switching row in the dynamic-page
  // dropdown (or connecting a field in the editor) repaints with the new property
  // instead of keeping whatever loaded first.
  useEffect(() => {
    let cancelled = false;
    const bound: BoundPropertyProps = {
      propertyId, propertyName, propertyAddress, propertyPhones, propertyEmails,
      propertyAccessHours, propertySocials, propertyUnitCounts, propertyTimezone,
    };
    setLoading(true);
    fetchPropertyDetails(bound)
      .then((found) => { if (!cancelled && found) setProperty(found); })
      .catch((err) => console.error('[PropertyInfo] fetchPropertyDetails error:', err))
      // Skeleton stays up until the request settles, so the widget never paints
      // the placeholder name/address/phones and then swap them for live values.
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [
    propertyId, propertyName, propertyAddress, propertyPhones, propertyEmails,
    propertyAccessHours, propertySocials, propertyUnitCounts, propertyTimezone,
  ]);

  // Gallery photos from the `PropertiesInternal` collection, for whichever
  // property this page resolved to. Its own effect rather than part of
  // fetchPropertyDetails: that call has a REST fallback and this has none, so a
  // missing collection must not look like a failed property lookup.
  const [collectionImages, setCollectionImages] = useState<string[]>([]);
  // The photo lookup runs AFTER the property resolves, so it outlives the
  // widget's own loading gate. Without tracking it separately the gallery would
  // paint the fallbacks and then swap them for the real photos a moment later —
  // the flash this skeleton exists to prevent.
  const [imagesLoading, setImagesLoading] = useState(true);
  useEffect(() => {
    const id = property?.id;
    // Clear first — otherwise switching row in the dynamic-page dropdown shows
    // the previous property's photos until the new ones land.
    setCollectionImages([]);
    if (!id) {
      // Nothing to wait for: an unbound widget resolves no property, so the
      // props/defaults are already the final answer.
      setImagesLoading(false);
      return undefined;
    }
    setImagesLoading(true);
    let cancelled = false;
    fetchPropertyImages(id)
      .then((urls) => { if (!cancelled) setCollectionImages(urls); })
      .catch((err) => console.warn('[PropertyInfo] property images unavailable:', err))
      .finally(() => { if (!cancelled) setImagesLoading(false); });
    return () => { cancelled = true; };
  }, [property?.id]);

  // Google rating: collection first, then the prop/DEFAULT.
  const displayRating = googleRating?.score ?? rating;
  const displayReviewCount = googleRating?.count ?? reviewCount;

  // Precedence: API value -> prop -> DEFAULT (empty API strings/arrays don't win).
  const displayName = property?.name || name;
  const displayAddress = property?.address || address;
  const displayPhones = property?.phones.length ? property.phones : phones;
  // Breadcrumb follows the property's own state/city/street, so a dynamic page
  // doesn't render Irvine's trail above a Fontana facility. An explicitly set
  // `breadcrumb` prop still wins; the DEFAULT is the last resort.
  const displayBreadcrumb =
    props.breadcrumb ?? propertyBreadcrumb(property) ?? breadcrumb;

  /**
   * The same trail, with somewhere to go (Figma 9499:22620).
   *
   * The labels still come from `propertyBreadcrumb`, so a dynamic page keeps
   * rendering its own trail; this adds the hrefs, which every crumb previously
   * lacked — they were all `href="#"`, so it LOOKED like a breadcrumb and
   * navigated nowhere.
   *
   * Links are derived from the property's state and city, not from the label
   * text: the label is a display name ("California") while the path segment is
   * a slug ("california"). Root-relative for the reason #02's links are — one
   * path is right on the preview host, the live domain and any custom domain,
   * and Duda serves every page from the site root.
   *
   * Only a trail built from a RESOLVED property gets links. A caller-supplied
   * `breadcrumb` prop, or the DEFAULT, is arbitrary text that cannot be mapped
   * to pages, so it stays plain rather than inventing URLs that may 404.
   */
  const crumbs = useMemo<Crumb[]>(() => {
    const plain = displayBreadcrumb.map((label) => ({ label }));
    if (props.breadcrumb || !property) return plain;
    const base = normaliseBase(LOCATION_BASE_PATH);
    const stateLabel = stateName(property.state);
    const stateSlug = placeSlug(stateLabel);
    const citySlug = placeSlug(property.city);
    const head = locationCrumbHead();
    const trail: Crumb[] = [...head];
    if (stateSlug) trail.push({ label: stateLabel, href: `${base}/${stateSlug}` });
    if (stateSlug && citySlug) trail.push({ label: property.city, href: `${base}/${stateSlug}/${citySlug}` });
    // The street IS this page; Breadcrumb drops the href on the last item.
    if (property.street) trail.push({ label: property.street });
    // No address parts leaves just the head, which is not a trail — keep the
    // labels so the row is never silently dropped.
    return trail.length > head.length ? trail : plain;
  }, [displayBreadcrumb, props.breadcrumb, property]);

  /** The same trail, shortened for the hero (Figma 9693:40309): Home keeps its
   *  place as the icon, the page you are on keeps its name, and everything
   *  between becomes an ellipsis — one per crumb, each still linked. */
  const mobileCrumbs = useMemo<Crumb[]>(() => collapseMiddle(crumbs), [crumbs]);
  // "Send us a Message" -> explicit prop wins, else mailto: the API email.
  const messageHref = messageUrl !== '#' ? messageUrl : property?.email ? `mailto:${property.email}` : '#';

  // Live gate/office status from AccessHours (computed in the property's tz);
  // falls back to the static props/DEFAULTS until loaded or when disabled.
  const gate = property?.hours.gate;
  const office = property?.hours.office;
  const callCenter = property?.hours.callCenter;
  const displayGateStatus = gate?.label ?? gateStatus;
  const displayGateNote = gate?.note ?? gateNote;
  const displayOfficeStatus = office?.label ?? officeStatus;
  const displayOfficeNote = office?.note ?? officeNote;
  const gateStatusClass = `pi-status pi-status--${gate ? (gate.isOpen ? 'open' : 'closed') : 'open'}`;
  const officeStatusClass = `pi-status pi-status--${office ? (office.isOpen ? 'open' : 'closed') : 'closed'}`;
  // Call centre is "if available": once live data has loaded, show it only when the
  // property actually has an enabled call_center section; before then (and in the dev
  // harness, which has no API) fall back to the prop so the line is still previewable.
  const showCallCenter = property ? !!callCenter : !!callCenterStatus;
  const displayCallCenterStatus = callCenter?.label ?? callCenterStatus;
  const displayCallCenterNote = callCenter?.note ?? callCenterNote;
  const callCenterStatusClass = `pi-status pi-status--${callCenter ? (callCenter.isOpen ? 'open' : 'closed') : 'open'}`;
  // Renders "Label (note)" or just "Label" when the note is empty.
  const hoursText = (note: string) => (note ? ` (${note})` : '');

  // Map API social platforms → icon keys (API says "twitter", icon key is "x").
  const socialUrlByKey = new Map<string, string>();
  for (const s of property?.socials ?? []) {
    const key = s.platform === 'twitter' ? 'x' : s.platform;
    if (!socialUrlByKey.has(key)) socialUrlByKey.set(key, s.url);
  }
  // With API socials, show only the platforms the property actually set (real
  // links). Without, keep the full icon row as decorative placeholders.
  const socialItems = socialUrlByKey.size
    ? SOCIALS.filter((s) => socialUrlByKey.has(s.key)).map((s) => ({ ...s, url: socialUrlByKey.get(s.key)! }))
    : SOCIALS.map((s) => ({ ...s, url: '#' }));
  // Address links out to Google Maps at the API coordinates when available.
  const hasCoords = property?.lat != null && property?.lng != null;
  const mapsHref = addressUrl !== '#'
    ? addressUrl
    : hasCoords ? `https://www.google.com/maps?q=${property!.lat},${property!.lng}` : '#';

  // Real embedded map when the API gave us coordinates; CSS placeholder otherwise.
  const mapEl = (
    <div className="pi-map" role="img" aria-label="Map showing the property location">
      {hasCoords ? (
        <iframe
          className="pi-map-iframe"
          title={`Map of ${displayName}`}
          src={`https://www.google.com/maps?q=${property!.lat},${property!.lng}&z=15&output=embed`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      ) : (
        <span className="pi-map-pin" />
      )}
    </div>
  );

  // Hours modal data: use the API's grouped weekly schedule when present,
  // otherwise the demo constants. Desktop shows both columns; the mobile
  // (condensed) modal reuses the same data.
  const apiHoursColumns = (property?.scheduleSections ?? []).map((s) => ({
    title: s.title,
    rows: s.rows.map((r) => `${r.days}: ${r.hours}`),
  }));
  const hoursDesktop = apiHoursColumns.length ? apiHoursColumns : HOURS_COLUMNS;
  const hoursSummary = apiHoursColumns.length ? apiHoursColumns : HOURS_MOBILE;

  // Slide list, in precedence order:
  //   1. the property's own photos from `PropertiesInternal` — per-property, so
  //      they must beat a single hero image set once on the widget, which would
  //      otherwise show the same photo on every dynamic page;
  //   2. the heroImage/images props (a static page, or the Duda editor);
  //   3. DEFAULT_GALLERY, so a property with no uploads still shows photos.
  const provided = (collectionImages.length
    ? collectionImages
    : [heroImage, ...(images ?? [])]
  ).filter(Boolean) as string[];
  /* Keep the active thumbnail centred as the photo changes, so stepping past
     the eighth image rolls the rail along instead of leaving the marker off
     screen. scrollLeft rather than scrollIntoView: the latter also scrolls
     ancestors, and inside a fixed full-screen overlay that drags the page
     behind it. */
  useEffect(() => {
    const rail = thumbsRef.current;
    const thumb = rail?.children[index] as HTMLElement | undefined;
    if (!rail || !thumb) return;
    rail.scrollTo({
      left: thumb.offsetLeft - (rail.clientWidth - thumb.clientWidth) / 2,
      behavior: 'smooth',
    });
  }, [index, lightbox]);

  const slides = provided.length ? provided : DEFAULT_GALLERY;
  const heroSlide = slides[0];
  const current = slides[index] ?? slides[0];
  const overlay = Math.max(0, Math.min(1, overlayOpacity / 100));

  const prev = () => setIndex((i) => (i - 1 + slides.length) % slides.length);
  const next = () => setIndex((i) => (i + 1) % slides.length);

  /* ── Drag-to-slide ──────────────────────────────────────────────────────
     The gallery used to be ONE <img> whose src was swapped, so a swipe could
     only ever cut to the next photo — there was nothing to move. It is a track
     of every slide now: the finger drags it, and letting go animates it the
     rest of the way onto whichever slide it settled towards.

     Pointer events rather than touch: one code path covers finger, mouse and
     pen. `touch-action: pan-y` on the frame is what keeps the page scrollable
     — the browser hands us horizontal gestures and keeps vertical ones. */
  const galleryRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<
    { x: number; y: number; w: number; axis: 'none' | 'x' | 'y'; dx: number } | null
  >(null);
  const [dragDx, setDragDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  /* A drag ends in a click on the button, which would open the lightbox. */
  const draggedRef = useRef(false);

  const onGalleryDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Arrows and dots are inside the frame and have their own jobs.
    if ((e.target as HTMLElement).closest?.('.pi-gallery-nav')) return;
    dragRef.current = {
      x: e.clientX, y: e.clientY, axis: 'none', dx: 0,
      w: galleryRef.current?.clientWidth || 1,
    };
    draggedRef.current = false;
  };

  const onGalleryMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    /* Which way is this going? Decided ONCE, after 8px, and never revisited —
       re-deciding mid-gesture makes a diagonal swipe flip between scrolling
       the page and moving the track. A vertical verdict abandons the drag for
       good and the page scrolls as usual. */
    if (d.axis === 'none') {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (d.axis === 'x') {
        setDragging(true);
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }
    }
    if (d.axis !== 'x') return;
    draggedRef.current = true;
    /* Resistance at the two ends: there is no slide beyond the first or last,
       so the track gives about a third as much rather than pulling away from
       the frame and showing empty space. */
    const atEnd = (index === 0 && dx > 0) || (index === slides.length - 1 && dx < 0);
    d.dx = atEnd ? dx / 3 : dx;
    setDragDx(d.dx);
  };

  const onGalleryUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragDx(0);
    setDragging(false);
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (!d || d.axis !== 'x') return;
    /* A fifth of the frame commits, capped at 60px so a wide desktop card does
       not demand an unreasonably long drag. Below that it settles back. */
    const threshold = Math.min(60, d.w * 0.2);
    if (d.dx <= -threshold && index < slides.length - 1) setIndex(index + 1);
    else if (d.dx >= threshold && index > 0) setIndex(index - 1);
  };

  // There's no reservation-lookup endpoint yet, so "Go" just follows the
  // configured reservationUrl (what the old link did). Once a lookup exists,
  // reservationCode is what it needs.
  const submitReservation = (e: React.FormEvent) => {
    e.preventDefault();
    if (reservationUrl && reservationUrl !== '#') window.location.href = reservationUrl;
  };

  useEffect(() => {
    if (!lightbox) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightbox(false);
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    }
    document.addEventListener('keydown', onKey);
    // Lock the page behind the overlay, so a swipe that isn't quite horizontal
    // scrolls nothing underneath.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [lightbox]);

  // The arrows are display:none under 768px, so swiping is the ONLY way to move
  // between photos on a phone. ignoreAfterSwipe stops the click that ends a swipe
  // from also closing the overlay.
  const lbSwipe = useSwipe({ onSwipeLeft: () => next(), onSwipeRight: () => prev() });
  const closeLightbox = lbSwipe.ignoreAfterSwipe(() => setLightbox(false));

  // Hours modal: Esc closes; lock background scroll while open.
  useEffect(() => {
    if (!hoursOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setHoursOpen(false); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [hoursOpen]);

  const hoursModal = hoursOpen && (
    <div className="pi-hours-overlay" onMouseDown={() => setHoursOpen(false)}>
      <div
        className="pi-hours-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Hours"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="pi-hours-head">
          <span className="pi-hours-title"><ClockIcon size={24} /><span>Hours</span></span>
          <button type="button" className="pi-hours-close" aria-label="Close" onClick={() => setHoursOpen(false)}>
            {/* Filled disc: the hours panel is on a white card. */}
            <CloseCircleIcon size={32} />
          </button>
        </div>
        <div className="pi-hours-body">
          {/* Desktop: full week, two columns */}
          <div className="pi-hours-cols">
            {hoursDesktop.map((col) => (
              <div className="pi-hours-col" key={col.title}>
                <p className="pi-hours-col-title">{col.title}</p>
                {col.rows.map((r) => <p className="pi-hours-line" key={r}>{r}</p>)}
              </div>
            ))}
          </div>
          {/* Mobile: condensed summary */}
          <div className="pi-hours-summary">
            {hoursSummary.map((g) => (
              <div className="pi-hours-group" key={g.title}>
                <p className="pi-hours-col-title">{g.title}</p>
                {g.rows.map((r) => <p className="pi-hours-line" key={r}>{r}</p>)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // Shared with #08's city page — same frame, so the same component rather than
  // a second copy of it here.
  const breadcrumbNav = <Breadcrumb items={crumbs} className="pi-breadcrumb" />;

  const lightboxEl = lightbox && (
    <div
      className="pi-lightbox"
      onClick={closeLightbox}
      {...lbSwipe.handlers}
    >
      <button
        type="button"
        className="pi-lb-close"
        aria-label="Close gallery"
        onClick={(e) => { e.stopPropagation(); setLightbox(false); }}
      >
        {/* Outlined ring: .pi-lightbox is rgba(0,0,0,.88).
            52 and 32 are the icon's two Figma frames, and the SIZE PROP picks
            between them rather than CSS: the ring is inset 1.5 at stroke 3 on
            the 52 but 1 at stroke 2 on the 32, so it is chosen per size, not
            scaled. Rendering the 52 at 32px through CSS would give a 1.85px
            ring instead of 2px. Same 768px boundary as .pi-lb-close's own
            width/height below, so the box and the mark can never disagree. */}
        <CloseCircleIcon outlined size={isMobileViewport ? 32 : 52} />
      </button>
      <span className="pi-lb-arrow pi-lb-arrow--prev" role="button" tabIndex={0} aria-label="Previous photo"
        onClick={(e) => { e.stopPropagation(); prev(); }}>
        <LightboxChevron size={20} className="pi-lb-chev" />
      </span>
      {/* The wrap deliberately does NOT swallow clicks: it's 90vw x 80vh, so on a
          phone it was almost the whole screen and left nowhere to tap to close.
          Only the photo itself is exempt. */}
      <span className="pi-lb-stage" onClick={(e) => e.stopPropagation()}>
        <span className="pi-lb-img-wrap">
          <ImageFill className="pi-lb-img" src={current} onClick={(e) => e.stopPropagation()} />
        </span>
        {/* Thumbnail rail. Only drawn when there is more than one photo — a
            single thumbnail of the picture already on screen is noise. */}
        {slides.length > 1 && (
          <div className="pi-lb-thumbs" ref={thumbsRef}>
            {slides.map((src, i) => (
              <button
                key={`${src}-${i}`}
                type="button"
                className={`pi-lb-thumb${i === index ? ' is-active' : ''}`}
                aria-label={`View photo ${i + 1}`}
                aria-current={i === index || undefined}
                onClick={(e) => { e.stopPropagation(); setIndex(i); }}
              >
                <ImageFill className="pi-lb-thumb-img" src={src} />
              </button>
            ))}
          </div>
        )}
      </span>
      <span className="pi-lb-arrow" role="button" tabIndex={0} aria-label="Next photo"
        onClick={(e) => { e.stopPropagation(); next(); }}>
        <LightboxChevron size={20} className="pi-lb-chev" />
      </span>
      {/* No stopPropagation: a tap on the counter should close like anywhere else */}
      <span className="pi-lb-counter">{index + 1} / {slides.length}</span>
    </div>
  );

  // ── Desktop: hero (image-led) view ─────────────────────────────────────
  const heroDesktop = (
    <div className="pi-hero-wrap">
      {breadcrumbNav}
      <div className="pi-hero-row">
        <div className="pi-hero-card">
          <ImageFill className="pi-hero-img" src={heroSlide} />
          <span className="pi-hero-overlay" style={{ background: `rgba(16, 19, 24, ${overlay})` }} />
          <button className="pi-hero-expand" onClick={() => setLightbox(true)} aria-label="Open photo gallery">
            <PhotoExpandIcon size={48} />
          </button>
          <div className="pi-hero-content">
            <p className="pi-hero-name">{displayName}</p>
            <div className="pi-hero-meta">
              <div className="pi-hero-rating">
                <span className="pi-hero-score">{displayRating}</span>
                <Stars rating={displayRating} width={77} />
                <a className="pi-reviews pi-hero-reviews" href={reviewsUrl}>{displayReviewCount} Reviews</a>
              </div>
              <a className="pi-hero-address" href={mapsHref}>
                <MapPinIcon size={24} />
                <span className="pi-underline">{displayAddress}</span>
              </a>
            </div>
          </div>
        </div>

        <div className="pi-hero-map">
          {mapEl}
        </div>
      </div>
    </div>
  );

  // ── Desktop: full view (default) ───────────────────────────────────────
  const fullDesktop = (
    <div className="pi-row">
      {/* Info column */}
      <div className="pi-info">
        <p className="pi-name">{displayName}</p>

        <div className="pi-rating">
          <span className="pi-rating-score">{displayRating}</span>
          <Stars rating={displayRating} width={77} />
          <a className="pi-reviews" href={reviewsUrl}>{displayReviewCount} Reviews</a>
        </div>

        <div className="pi-contact">
          <a className="pi-contact-row pi-link" href={mapsHref}>
            <MapPinIcon size={24} />
            <span className="pi-underline">{displayAddress}</span>
          </a>

          <div className="pi-phones">
            {displayPhones.map((p, i) => (
              <a
                key={p.number}
                className={`pi-contact-row${i > 0 ? ' pi-contact-row--indent' : ''}`}
                href={`tel:${p.number.replace(/[^0-9+]/g, '')}`}
              >
                {i === 0 && <PhoneIcon size={24} />}
                <span><span className="pi-underline">{p.number}</span>{p.note ? ` (${p.note})` : ''}</span>
              </a>
            ))}
          </div>

          <a className="pi-contact-row" href={messageHref}
            onClick={(e) => { e.preventDefault(); setMessageOpen(true); }}>
            <EnvelopeIcon size={24} />
            <span className="pi-underline">Send us a Message</span>
          </a>

          <div className="pi-hours">
            <div className="pi-contact-row">
              <ClockIcon size={24} />
              <span><span className={gateStatusClass}>{displayGateStatus}</span>{hoursText(displayGateNote)}</span>
            </div>
            <div className="pi-contact-row pi-contact-row--indent">
              <span><span className={officeStatusClass}>{displayOfficeStatus}</span>{hoursText(displayOfficeNote)}</span>
            </div>
            {showCallCenter && (
              <div className="pi-contact-row pi-contact-row--indent">
                <span><span className={callCenterStatusClass}>{displayCallCenterStatus}</span>{hoursText(displayCallCenterNote)}</span>
              </div>
            )}
            <div className="pi-contact-row pi-contact-row--indent">
              <a className="pi-underline pi-see-hours" href="#"
                onClick={(e) => { e.preventDefault(); setHoursOpen(true); }}>See all Hours</a>
            </div>
          </div>
        </div>
      </div>

      {/* Media column (breadcrumb + gallery + map) */}
      <div className="pi-media">
        {breadcrumbNav}

        <div className="pi-cards">
          {/* Gallery */}
          <div className="pi-card-col">
            {imagesLoading ? (
              // The photos are still resolving. A skeleton in the gallery's own
              // footprint, so the card keeps its size and nothing shifts when
              // the real images arrive.
              <div className="pi-gallery pi-gallery--loading" aria-hidden="true">
                <span className="pi-skel-block pi-gallery-skel" />
              </div>
            ) : (
            <button
              className="pi-gallery"
              ref={galleryRef}
              onClick={() => {
                /* Swallow the click that ends a drag — otherwise every swipe
                   would also open the lightbox. */
                if (draggedRef.current) { draggedRef.current = false; return; }
                setLightbox(true);
              }}
              onPointerDown={onGalleryDown}
              onPointerMove={onGalleryMove}
              onPointerUp={onGalleryUp}
              onPointerCancel={onGalleryUp}
              aria-label="Open photo gallery"
            >
              {/* Every slide, side by side. `current` is still what the
                  lightbox opens on; this is only what is on screen. */}
              <span
                className="pi-gallery-track"
                style={{
                  transform: `translate3d(calc(${-index * 100}% + ${dragDx}px), 0, 0)`,
                  ...(dragging ? { transition: 'none' } : null),
                }}
              >
                {slides.map((src, i) => (
                  <span className="pi-gallery-slide" key={`${src}-${i}`}>
                    <ImageFill className="pi-gallery-img" src={src} />
                  </span>
                ))}
              </span>
              <span className="pi-gallery-overlay" />
              <span className="pi-gallery-expand"><PhotoExpandIcon size={48} /></span>
              <span className="pi-gallery-nav" onClick={(e) => e.stopPropagation()}>
                <span className="pi-gallery-arrow pi-gallery-arrow--prev" role="button" tabIndex={0} aria-label="Previous photo" onClick={prev}>
                  <ChevronRight size={32} />
                </span>
                <span className="pi-gallery-dots">
                  {slides.map((_, i) => (
                    <span key={i} className={`pi-gallery-dot${i === index ? ' active' : ''}`} onClick={() => setIndex(i)} />
                  ))}
                </span>
                <span className="pi-gallery-arrow" role="button" tabIndex={0} aria-label="Next photo" onClick={next}>
                  <ChevronRight size={32} />
                </span>
              </span>
            </button>
            )}
            {/* Clicking the link swaps it for the reservation-code lookup
                (Figma 9697-22507); Escape puts the link back. */}
            {reservationOpen ? (
              <form className="pi-res-form" onSubmit={submitReservation}>
                <input
                  className="pi-res-input"
                  type="text"
                  placeholder="Reservation Code"
                  aria-label="Reservation Code"
                  value={reservationCode}
                  autoFocus
                  onChange={(e) => setReservationCode(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape') setReservationOpen(false); }}
                />
                <button type="submit" className="pi-res-go">Go</button>
              </form>
            ) : (
              <button
                type="button"
                className="pi-reservation"
                onClick={() => setReservationOpen(true)}
              >
                <CalendarCheckIcon size={24} />
                <span className="pi-underline">Find my Reservation</span>
              </button>
            )}
          </div>

          {/* Map (fake) */}
          <div className="pi-card-col">
            {mapEl}
            <div className="pi-socials">
              {socialItems.map(({ key, label, Icon, url }) => (
                <a key={key} className="pi-social" href={url}
                  target={url !== '#' ? '_blank' : undefined}
                  rel={url !== '#' ? 'noopener noreferrer' : undefined}
                  aria-label={label} title={label}>
                  <Icon size={29} />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ── Mobile: single layout (regardless of desktop displayMode) ──────────
  const phoneHref = displayPhones[0] ? `tel:${displayPhones[0].number.replace(/[^0-9+]/g, '')}` : '#';
  const mobile = (
    <div className="pi-mobile">
      <div className="pi-m-hero">
        <ImageFill className="pi-m-hero-img" src={heroSlide} />
        <span className="pi-m-hero-overlay" style={{ background: `rgba(16, 19, 24, ${overlay})` }} />
        <div className="pi-m-hero-top">
          {/* Figma 9693:40309 — inside the hero, so white on the image: a home
              icon, then one "…" per hidden crumb, then the page you are on.
              Slashes, not the chevrons the page-top trail uses. */}
          <Breadcrumb
            items={mobileCrumbs}
            variant="hero"
            className="pi-breadcrumb pi-m-breadcrumb"
          />
          <button className="pi-m-expand" onClick={() => setLightbox(true)} aria-label="Open photo gallery">
            <PhotoExpandIcon size={40} />
          </button>
        </div>
        <div className="pi-m-hero-content">
          <p className="pi-m-name">{displayName}</p>
          <div className="pi-m-rating">
            <span className="pi-m-score">{displayRating}</span>
            <Stars rating={displayRating} width={77} />
            <a className="pi-reviews pi-m-reviews" href={reviewsUrl}>{displayReviewCount} Reviews</a>
          </div>
          <a className="pi-m-address" href={mapsHref}>
            <MapPinSolidIcon size={16} />
            <span className="pi-underline">{displayAddress}</span>
          </a>
        </div>
      </div>

      {/* Zero-height marker at the row's natural position — the stack pins the
          row once this passes under the top of the viewport. */}
      <div ref={circles.sentinelRef} className="pi-m-sticky-sentinel" />
      {/* The slot holds the row's space in the page while it's pinned, so
          nothing jumps. Its height is frozen by the hook on pin. */}
      <div ref={circles.slotRef} className="pi-m-circles-slot">
        {(() => {
          const row = (
            <div className="pi-m-circles">
              <a className="pi-m-circle-item" href={phoneHref}>
                <span className="pi-m-circle"><PhoneIcon size={24} /></span>
                <span className="pi-m-circle-label">Phone</span>
              </a>
              <a className="pi-m-circle-item" href={messageHref}
                onClick={(e) => { e.preventDefault(); setMessageOpen(true); }}>
                <span className="pi-m-circle"><EnvelopeIcon size={24} /></span>
                <span className="pi-m-circle-label">Email</span>
              </a>
              <a className="pi-m-circle-item" href="#">
                <span className="pi-m-circle"><CreditCardIcon size={24} /></span>
                <span className="pi-m-circle-label">Billpay</span>
              </a>
              <a className="pi-m-circle-item" href={mapsHref}>
                <span className="pi-m-circle"><MapPinIcon size={24} /></span>
                <span className="pi-m-circle-label">Map</span>
              </a>
              {/* Scrolls to the space list rather than navigating — same helper
                  the Promotions widget uses for "See Qualifying Units". */}
              <a
                className="pi-m-circle-item"
                href="#"
                onClick={(e) => { e.preventDefault(); scrollToSpaceList(); }}
              >
                <span className="pi-m-circle"><LocationsIcon size={24} /></span>
                <span className="pi-m-circle-label">Locations</span>
              </a>
            </div>
          );
          return circles.target ? createPortal(row, circles.target) : row;
        })()}
      </div>

      <div className="pi-m-hours">
        <p><span className={gateStatusClass}>{displayGateStatus}</span>{hoursText(displayGateNote)}</p>
        <p><span className={officeStatusClass}>{displayOfficeStatus}</span>{hoursText(displayOfficeNote)}</p>
        {showCallCenter && (
          <p><span className={callCenterStatusClass}>{displayCallCenterStatus}</span>{hoursText(displayCallCenterNote)}</p>
        )}
        <a className="pi-m-seehours pi-underline" href="#"
          onClick={(e) => { e.preventDefault(); setHoursOpen(true); }}>See all Hours</a>
      </div>
    </div>
  );

  // Hold everything behind a skeleton until BOTH first-wave reads settle — the
  // property and the Google rating. Covering the whole widget (rather than just
  // the API-driven text) keeps it to one coherent loading state and guarantees
  // nothing is painted then replaced. The gallery is the exception and waits
  // separately, because it cannot start until the property gives it an id.
  if (loading || ratingLoading) {
    return (
      <div className="pi-wrapper">
        <PropertySkeleton displayMode={displayMode} />
      </div>
    );
  }

  return (
    <div className="pi-wrapper">
      <div className="pi-desktop">
        {displayMode === 'hero' ? heroDesktop : fullDesktop}
      </div>
      {mobile}
      {lightboxEl}
      {hoursModal}
      <MessageModal
        open={messageOpen}
        onClose={() => setMessageOpen(false)}
        facilities={[{ name: displayName, address: displayAddress }]}
        // This widget's creds and bound property; the modal has no idea which
        // company it is filing against and should not.
        submitLead={(input) => createLead(input, {
          propertyId, propertyName, propertyAddress, propertyPhones, propertyEmails,
          propertyAccessHours, propertySocials, propertyUnitCounts, propertyTimezone,
        })}
      />
    </div>
  );
}
