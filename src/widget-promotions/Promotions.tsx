import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMediaQuery } from '@shared/stickyStack';
import { useCarousel, usePrefersReducedMotion } from '@shared/useCarousel';
import { CarouselDots } from '@shared/CarouselDots';
import './Promotions.css';
import { fetchSpaceGroups, extractPromos, type ApiPromo } from './api';
import cfg from './config.json';
import { fetchWebsiteSpaceGroupId } from '@shared/spaceGroups';
import { resolvePropertyId } from '@shared/propertyBinding';
import { resolveCompanyIdFromSources } from '@shared/companySource';
import { imageUrl } from '@shared/dudaCollections';
import { emitShowPromo, scrollToSpaceList } from '@shared/promoBus';
import { DisclaimerModal } from './DisclaimerModal';
import { TagIcon, InfoIcon, ChevronRight, CarouselChevron } from './icons';
import promoBanner from './assets/promo-banner.png';
import promoBannerMobile from './assets/promo-banner-mobile.png';

// ---------------------------------------------------------------------------
// Promotion bars
//
// One promotion fills the width. Two, three or four split it evenly (a half, a
// third, a quarter each). Beyond four the bars stay a quarter wide and page in
// groups of four behind arrows + dots — there is no auto-advance; the viewer
// drives it.
// ---------------------------------------------------------------------------

interface BarItem { id: string; title: string; info?: string; url: string; ctaLabel: string; }

/** Max bars shown at once; also the carousel's page size. */
/**
 * Bars visible at once on DESKTOP: 1 fills the row, 2 split 50/50, 3 split
 * 33/33/33, 4 split into quarters. From FIVE promos the row becomes a sliding
 * window over them — still four wide, moving one at a time.
 *
 * Tablet shows 2 and phone 1, so on those the window starts one promotion
 * sooner and two sooner respectively.
 */
const PAGE_SIZE = 4;

/**
 * Hold off on the skeleton for this long. A fast API response then renders the
 * real bars directly, instead of flashing a placeholder for 80ms.
 */
const SKELETON_DELAY_MS = 200;

/** Placeholder count — the live promo count is unknown until the fetch lands. */
const SKELETON_BARS = 2;

/** Shown while the promotions fetch is still in flight (past the delay above). */
function PromoBarsSkeleton() {
  return (
    <>
      <div className="promo-bars promo-bars--skeleton" data-cols={String(SKELETON_BARS)} aria-hidden="true">
        {Array.from({ length: SKELETON_BARS }, (_, i) => (
          <div className="promo-bar promo-bar--skeleton" key={i}>
            <div className="promo-bar-inner">
              <span className="promo-skel promo-skel--title" />
              <span className="promo-skel promo-skel--cta" />
            </div>
          </div>
        ))}
      </div>
      <span className="promo-sr-only" role="status">Loading promotions…</span>
    </>
  );
}

/**
 * Shown in the disclaimer modal when a promo has no `description`. The live data
 * currently has one promo with description: "" — an empty string, not a missing
 * field — so without this the (i) renders an inert icon that does nothing.
 * PLACEHOLDER: swap for the real fine print once it is authored in Hummingbird.
 */
const PLACEHOLDER_INFO =
  'Dorem ipsum dolor sit amet, consectetur adipiscing elit. Etiam eu turpis molestie, ' +
  'dictum est a, mattis tellus. Sed dignissim, metus nec fringilla accumsan, risus sem ' +
  'sollicitudin lacus, ut interdum tellus elit sed risus. Maecenas eget condimentum ' +
  'velit, sit amet feugiat lectus.\n\n' +
  'Curabitur tempor quis eros tempus lacinia. Nam bibendum pellentesque quam a ' +
  'convallis. Sed ut vulputate nisi. Integer in felis sed leo vestibulum venenatis. ' +
  'Suspendisse quis arcu sem.';

function PromoBarItem({ item }: { item: BarItem }) {
  // A bar with no explicit link filters the Space List to this promo's
  // qualifying units and scrolls to it; a real URL is left to navigate.
  const isFilterCta = !item.url || item.url === '#';

  // The (i) control opens the disclaimer modal (Figma 7158:80964). Per bar, not
  // lifted to PromoBars, so each bar owns its own copy and closing one cannot
  // affect another.
  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <div className="promo-bar">
      <div className="promo-bar-inner">
        {/* Tag + title group so the info icon can sit hard right (Figma 6242-44608). */}
        <div className="promo-bar-titlerow">
          <div className="promo-bar-titlewrap">
            <TagIcon size={36} />
            <span className="promo-bar-title">{item.title}</span>
          </div>
          {/* Always a button now: with the placeholder fallback there is always
              something to show, so the icon never renders as an inert span. */}
          <button
            type="button"
            className="promo-bar-info"
            aria-label={`More information about ${item.title}`}
            aria-haspopup="dialog"
            onClick={() => setInfoOpen(true)}
          >
            <InfoIcon size={36} />
          </button>
        </div>
        <a
          className="promo-bar-cta"
          href={item.url || '#'}
          onClick={(e) => {
            if (!isFilterCta) return;
            e.preventDefault();
            emitShowPromo({ promoId: item.id, promoTitle: item.title });
            scrollToSpaceList();
          }}
        >
          <ChevronRight size={24} />
          <span>{item.ctaLabel}</span>
        </a>
      </div>

      {/* Portalled to <body>: the bar sets overflow:hidden and Duda's row
          wrappers add their own stacking contexts, either of which would clip a
          modal rendered in place. */}
      {infoOpen && createPortal(
        <DisclaimerModal
          title={item.title}
          body={item.info || PLACEHOLDER_INFO}
          onClose={() => setInfoOpen(false)}
        />,
        document.body,
      )}
    </div>
  );
}

function PromoBars({ items }: { items: BarItem[] }) {

  /* How many fit at once. The two boundaries are the CSS's own — 560px is
     where the bars used to stack vertically, 900px where three and four across
     already collapsed to two — so JS and CSS never disagree about which layout
     is on screen. Anything past the count becomes a slide. */
  const isMobile = useMediaQuery('(max-width: 560px)');
  const isTablet = useMediaQuery('(max-width: 900px)');
  const visibleCount = isMobile ? 1 : isTablet ? 2 : PAGE_SIZE;

  /**
   * A sliding WINDOW, not pages of N. Six promotions with four visible give
   * offsets 0, 1 and 2 — three stops — and every press moves the row by exactly
   * one promotion. Paging in blocks of four instead put the fifth and sixth on
   * a slide of their own, stretched across a width meant for four.
   */
  const maxOffset = Math.max(0, items.length - visibleCount);
  const paged = maxOffset > 0;

  // The shared carousel hook owns the index, the bounds and the drag. This
  // widget already slid a transform track one item at a time — what it gained
  // here is a drag that FOLLOWS the finger (useSwipe only classified a finished
  // gesture, so the row jumped after the fact) and the 6-dot cap.
  const carousel = useCarousel({ count: items.length, perView: visibleCount, draggable: true });
  const reduceMotion = usePrefersReducedMotion();
  const current = carousel.index;

  if (!paged) {
    return (
      <div className="promo-bars" data-cols={Math.min(items.length, visibleCount)}>
        {items.map((item) => (
          <PromoBarItem key={item.id} item={item} />
        ))}
      </div>
    );
  }

  return (
    <div className="promo-bars-carousel">
      {/* The viewport clips; the track slides inside it. Clipping HERE is what
          makes this safe — the note this replaces avoided a transform track
          because Duda's row wrappers clip, but a track that never leaves its own
          viewport is never theirs to cut. */}
      <div className="promo-bars-viewport" {...carousel.handlers}>
        <div
          className="promo-bars promo-bars--track"
          data-cols={visibleCount}
          /* One number, because calc() cannot divide by a custom property in
             every engine. offset x step, where step = (100% + gap) / visible,
             is the same as (offset / visible) x (100% + gap) — so the division
             happens here and the CSS only multiplies.
             Fed from offsetPct (not the index) so a finger drag moves the row
             continuously rather than only snapping at the end of the gesture. */
          style={{
            // POSITIVE, because the CSS already applies the `* -1`. offsetPct is
            // negative as it moves forward (it is a translate, not an index), so
            // negating it here gives the positive offset the CSS expects — and
            // it carries the live drag, not just the settled index.
            '--promo-shift': (-carousel.offsetPct / 100) / visibleCount,
            // No tween while a finger is down, or the row lags the thumb.
            transition: reduceMotion || carousel.dragging ? 'none' : undefined,
          } as React.CSSProperties}
        >
          {/* Every promotion is mounted, not just the visible window — that is
              what lets one transform carry the whole row past the edge. */}
          {items.map((item) => (
            <PromoBarItem key={item.id} item={item} />
          ))}
        </div>
      </div>

      {/* Chevron, dots, chevron — the same row #05's Local Blogs carousel uses
          (.sl-blog2-pagination), down to the glyph, the 40px round buttons and
          the dot colours, so the two widgets page identically. */}
      <div className="promo-pager">
        <button
          type="button"
          className="promo-pager-arrow"
          aria-label="Previous promotions"
          disabled={!carousel.canPrev}
          onClick={carousel.prev}
        >
          <CarouselChevron dir="left" />
        </button>

        {/* Capped at 6 with the window sliding — a property with 20 promotions
            gives 20 stops, and that many dots would not fit the row. */}
        <div className="promo-dots" aria-label="Promotion pages">
          <CarouselDots
            count={maxOffset + 1}
            active={current}
            onPick={carousel.goTo}
            dotClass="promo-dot"
            activeClass="promo-dot--active"
            label="Go to promotions {n}"
          />
        </div>

        <button
          type="button"
          className="promo-pager-arrow"
          aria-label="Next promotions"
          disabled={!carousel.canNext}
          onClick={carousel.next}
        >
          <CarouselChevron dir="right" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Titles for `demoBars`. Mixed lengths on purpose — see the prop's note. */
const DEMO_TITLES = [
  '$1 MOVE IN SPECIAL',
  'First Full Month Free!',
  'First 3 Months 30% Off',
  'Half Price Storage For Your First Two Months When You Book Online Today',
  '50% Off Selected Units',
  'Free Lock With Every Rental',
];

export interface PromotionsProps {
  /** View mode (Duda dropdown). Default 'bar'. */
  mode?: 'banner' | 'bar';

  // ── Mode 1: banner (uploaded image + link) ──
  /**
   * Content-menu IMAGE inputs. `unknown`, not `string`: a Duda image field
   * hands over an OBJECT ({url, ...}) rather than a URL, and which key holds it
   * varies — `imageUrl()` normalises every shape, and still passes a plain
   * string straight through for a JS tab that already unwrapped it.
   */
  bannerImage?: unknown;
  /** Swapped in below 640px, the same width the bundled default art swaps at. */
  bannerImageMobile?: unknown;
  bannerUrl?: string;
  bannerAlt?: string;

  // ── Mode 2: promotion bars (coloured bar + text + link) ──
  barText?: string;
  barUrl?: string;
  barCtaLabel?: string;
  /** Optional fine-print shown on the info icon's tooltip. */
  barInfo?: string;

  // ── Dynamic pages ──
  /**
   * Content-menu field connected to `Properties > id` — whose promotions to show.
   * Unset = the config.json property (static behaviour). See @shared/propertyBinding.
   */
  propertyId?: string;
  /**
   * Per-instance company override. Normally unset — the company comes from the
   * one-row `Company` collection, which is the source of truth for the whole site.
   */
  companyId?: string;
  /**
   * The property's space group. Not a column on the Properties collection, so it
   * can't be bound; leave empty on a dynamic page to auto-resolve that property's
   * "Website Group", or set it to pin one.
   */
  spaceGroupId?: string;

  /**
   * PREVIEW ONLY — render this many placeholder promotions instead of whatever
   * the API returned, and skip the fetch's loading state.
   *
   * The 1/2/3/4-across layouts, the phone carousel and its dots all key off how
   * many promos there are, and a property with exactly that many live promos is
   * not something you can conjure on demand. Duda never sets this, so unset —
   * which is every real page — nothing here changes.
   */
  demoBars?: number;
}

export function Promotions({
  mode = 'bar',
  bannerImage,
  bannerImageMobile,
  bannerUrl = '#',
  bannerAlt = '',
  demoBars,
  barText,
  barUrl = '#',
  barCtaLabel = 'See Qualifying Units',
  barInfo,
  propertyId,
  companyId,
  spaceGroupId,
}: PromotionsProps) {
  // Only two modes. Anything else from Duda (including the retired 'cards')
  // falls through to the bars, which absorbed the old cards layout.
  const view: 'banner' | 'bar' = mode === 'banner' ? 'banner' : 'bar';

  // Effective property for this instance: the dynamic-page binding, else config.json.
  const effectivePropertyId = resolvePropertyId({ propertyId }, cfg.propertyId);

  // The bars are API-driven — every tier's `allocated_promo` from the
  // space-groups API, deduped. There is no static demo set: until the fetch
  // resolves we show a skeleton, and if it returns nothing we render nothing.
  const [apiPromos, setApiPromos] = useState<ApiPromo[]>([]);
  const [loading, setLoading] = useState(true);
  const [pastDelay, setPastDelay] = useState(false);

  useEffect(() => {
    // Banner mode never reads the API, so don't call it.
    if (view === 'banner') { setLoading(false); return; }

    let cancelled = false;
    const timer = setTimeout(() => { if (!cancelled) setPastDelay(true); }, SKELETON_DELAY_MS);

    (async () => {
      // The `Company` collection is the source of truth; cfg.companyId is only the
      // editor/harness fallback. This endpoint is REST-only with no collection to
      // degrade to, so a wrong company here means no promotions at all.
      const company = await resolveCompanyIdFromSources('#06 promotions', { companyId }, cfg.companyId);
      if (cancelled) return;

      // Pointed at a different facility than the one config.json was built for?
      // Then the configured space group belongs to ANOTHER property and must never
      // be used — it would show a different facility's promotions.
      const isDynamicTarget =
        effectivePropertyId !== cfg.propertyId || company !== cfg.companyId;

      const sg = spaceGroupId
        ? spaceGroupId
        : isDynamicTarget || !cfg.spaceGroupId
          ? await fetchWebsiteSpaceGroupId({ ...cfg, companyId: company }, effectivePropertyId)
          : cfg.spaceGroupId;
      if (cancelled) return;

      // No website group for THIS property and nothing pinned: render nothing rather
      // than falling back to a group belonging to another facility. spaceGroups.ts
      // has already logged why it found none.
      if (!sg) { setApiPromos([]); return; }

      const raw = await fetchSpaceGroups(effectivePropertyId, sg, company);
      if (!cancelled) setApiPromos(extractPromos(raw));
    })()
      .catch((err) => console.error('[Promotions] fetchSpaceGroups error:', err))
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; clearTimeout(timer); };
  }, [view, effectivePropertyId, companyId, spaceGroupId]);

  // ── Mode 1: banner ────────────────────────────────────────────────────
  if (view === 'banner') {
    const uploaded = imageUrl(bannerImage);
    const desktopSrc = uploaded || promoBanner;
    /* The bundled mobile art is a fallback for the bundled DESKTOP art, so it
       only applies while nothing has been uploaded. An editor who supplies a
       desktop banner and no mobile one gets that banner at every width — the
       old behaviour — rather than their artwork above 640px and ours below. */
    const mobileSrc = imageUrl(bannerImageMobile) || (uploaded ? '' : promoBannerMobile);

    return (
      <div className="promo-wrapper">
        <a className="promo-banner" href={bannerUrl}>
          {/* Always a <picture>: <source> is what lets the browser pick before
              it fetches, so the wrong-size image is never downloaded. With no
              mobile art there is simply no <source> and the <img> stands alone. */}
          <picture>
            {mobileSrc && <source media="(max-width: 640px)" srcSet={mobileSrc} />}
            <img className="promo-banner-img" src={desktopSrc} alt={bannerAlt || 'Current promotion'} />
          </picture>
        </a>
      </div>
    );
  }

  // ── Mode 2: promotion bars ────────────────────────────────────────────
  // Deliberately varied lengths: a one-word promo and a promo that wraps onto
  // two lines exercise different halves of the layout, and the wrapping one is
  // where the icon alignment and the centring actually get tested.
  const demoCount = Math.max(0, Math.min(Math.floor(demoBars ?? 0), 12));

  // Still fetching: show the skeleton once we're past the delay, nothing before
  // (a sub-200ms response shouldn't flash a placeholder). Placeholders do not
  // wait on a request they are standing in for.
  if (loading && !demoCount) {
    return pastDelay ? <div className="promo-wrapper"><PromoBarsSkeleton /></div> : null;
  }

  // One bar per live promo. `barText` remains an explicit editor override for
  // sites that want to hand-write a single bar instead.
  const barItems: BarItem[] = demoCount
    ? Array.from({ length: demoCount }, (_, i) => ({
        id: `demo-${i}`,
        title: DEMO_TITLES[i % DEMO_TITLES.length],
        info: 'Placeholder terms. Offer applies to new rentals only and cannot be combined with any other promotion.',
        url: barUrl,
        ctaLabel: barCtaLabel,
      }))
    : apiPromos.length
    ? apiPromos.map((p) => ({
        id: p.id,
        title: p.title,
        info: p.info,
        url: barUrl,
        ctaLabel: barCtaLabel,
      }))
    : barText
      ? [{ id: 'bar', title: barText, info: barInfo, url: barUrl, ctaLabel: barCtaLabel }]
      : [];

  // No promotions and no manual override → render nothing rather than an
  // empty green bar.
  if (!barItems.length) return null;

  return (
    <div className="promo-wrapper">
      <PromoBars items={barItems} />
    </div>
  );
}
