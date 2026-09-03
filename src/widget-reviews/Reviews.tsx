import React, { useEffect, useState } from 'react';
import './Reviews.css';
import {
  Stars,
  PlatformLogo,
  UserAvatar,
  ChevronRight,
  type Platform,
} from './icons';
import { fetchAllReviewSources, type ReviewSourceData } from '@shared/reviewsCollections';
import { Shimmer } from '@shared/Shimmer';
import { useCarousel, usePrefersReducedMotion } from '@shared/useCarousel';
import { CarouselDots } from '@shared/CarouselDots';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Review {
  id: string;
  author: string;
  rating: number;
  text: string;
  timeAgo: string;
}

/**
 * Label for the mobile source pills. These must name the PLATFORM, not the
 * business — `source.name` holds the business name from the collection
 * (`placeName` / `businessName`), so the pills read "Storage Outlet" /
 * "Storelocal Self Storage" on live data. It only ever looked right because the
 * demo sources happen to be named "Google" and "Yelp".
 */
const PLATFORM_LABEL: Record<Platform, string> = {
  google: 'Google',
  yelp: 'Yelp',
  reviews: 'Reviews',
};

interface ReviewSource {
  key: Platform;
  /** Business name from the collection — used for the link's accessible name. */
  name: string;
  score: number;
  count: number;
  /** Destination for the whole score block. Empty until real URLs are wired. */
  reviewsUrl: string;
  reviews: Review[];
}

// ---------------------------------------------------------------------------
// Demo data — replace with live API data when available
// ---------------------------------------------------------------------------

const DEMO_SOURCES: ReviewSource[] = [
  {
    key: 'google',
    name: 'Google',
    score: 4.3,
    count: 264,
    reviewsUrl: '',
    reviews: [
      { id: 'g1', author: 'Michael Reyes', rating: 5, text: '"Great customer service with secure and clean facilities. We have been customers for over 2 years and rent out a climate control unit. We have never had any problems. Would recommend for short term or long term storage needs."', timeAgo: '4 months ago' },
      { id: 'g2', author: 'Lucas Brady', rating: 5, text: '"Awesome customer service and super clean, secure facilities! We\'ve been renting a climate-controlled unit for over 2 years and have had zero issues. Totally recommend it for both short and long-term storage!"', timeAgo: '4 months ago' },
      { id: 'g3', author: 'Sarah Chen', rating: 4, text: '"The facility is immaculate and the staff are incredibly helpful. Moving in was a breeze and the online portal makes billing simple. Highly recommended."', timeAgo: '2 months ago' },
      { id: 'g4', author: 'Mike Patterson', rating: 5, text: '"Exceptional service from the moment I walked in. The unit is exactly as described and the security cameras everywhere give real peace of mind."', timeAgo: '1 month ago' },
    ],
  },
  {
    key: 'yelp',
    name: 'Yelp',
    score: 4.9,
    count: 76,
    reviewsUrl: '',
    reviews: [
      { id: 'y1', author: 'David Thompson', rating: 5, text: '"Excellent customer service and clean, secure facilities. We\'ve rented a climate-controlled unit for over 2 years without any issues. Highly recommend for both short and long-term storage!"', timeAgo: '4 months ago' },
      { id: 'y2', author: 'Jesse Miller', rating: 5, text: '"This place is super convenient! It\'s secure, clean, and really well managed. India and Delicia are awesome, and I totally recommend storing your stuff here!"', timeAgo: '4 months ago' },
      { id: 'y3', author: 'Amanda Torres', rating: 5, text: '"I was nervous about putting my belongings in storage but this place gave me total confidence. Climate controlled units are spotless and the access hours are very flexible."', timeAgo: '3 months ago' },
      { id: 'y4', author: 'Daniel Wu', rating: 4, text: '"Really solid storage facility. Easy access, great staff, very clean. Pricing is fair and competitive. Would definitely rent here again."', timeAgo: '5 months ago' },
    ],
  },
];

const REVIEWS_PER_PAGE = 2;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SourceHeader({ source }: { source: ReviewSource }) {
  return (
    <div className="rw-source-header">
      {/* The whole logo + score + stars block links to the platform's reviews,
          from the collection's `reviewsUrl`. When it's absent the href attribute
          is omitted rather than left as href="" — an empty href reloads the page
          on click. Opens in a new tab since it leaves the customer's site. */}
      <a
        className="rw-source-meta"
        href={source.reviewsUrl || undefined}
        target={source.reviewsUrl ? '_blank' : undefined}
        rel={source.reviewsUrl ? 'noopener noreferrer' : undefined}
        aria-label={`See ${source.name} reviews`}
      >
        <PlatformLogo platform={source.key} />
        <div className="rw-source-score-block">
          <span className="rw-source-score">{source.score}</span>
          <span className="rw-source-out-of">/ 5</span>
        </div>
        <div className="rw-source-rating-col">
          <Stars platform={source.key} rating={5} width={source.key === 'yelp' ? 110 : 105} />
          <span className="rw-source-count">{source.count} ratings</span>
        </div>
      </a>
    </div>
  );
}

function ReviewCard({ review, source }: { review: Review; source: ReviewSource }) {
  return (
    <div className="rw-card">
      <div className="rw-card-author">
        <UserAvatar />
        <div className="rw-card-author-info">
          <span className="rw-card-author-name">{review.author}</span>
          <Stars platform={source.key} rating={review.rating} width={source.key === 'yelp' ? 89 : 85} />
        </div>
      </div>
      <p className="rw-card-text">{review.text}</p>
      <span className="rw-card-time">{review.timeAgo}</span>
    </div>
  );
}

/**
 * One source column with its OWN pager.
 *
 * Josh Wright asked for "their own carousel dots per column instead of scrolling
 * the whole section" (2026-08-27): Google and Yelp hold different numbers of
 * reviews, so a single shared page number ran one column out of cards while the
 * other still had plenty, and paging moved both at once.
 *
 * A component per column rather than state in the parent, because each column
 * needs its own hook and hooks cannot be called inside a `.map()`.
 *
 * The cards stay a 2-up vertical grid — `.rw-column-cards` equalises row heights
 * ACROSS the columns, so Google's first card lines up with Yelp's. Sliding the
 * column would break that alignment, which is the "retaining the testimonials
 * layout" Josh asked about, so the page swap is kept and the dots are what move.
 */
function SourceColumn({ source }: { source: ReviewSource }) {
  const totalPages = Math.max(1, Math.ceil(source.reviews.length / REVIEWS_PER_PAGE));
  const carousel = useCarousel({ count: totalPages, perView: 1 });
  const reduceMotion = usePrefersReducedMotion();

  /* Pages, not cards, and that is the shape of this view rather than a
     shortcut: a column stacks REVIEWS_PER_PAGE reviews VERTICALLY, so there is
     no horizontal card to step past — the unit that moves is the pair. #12 and
     #07 step one card because theirs sit side by side.
     The strip holds every page and one transform moves it; the slice-and-swap
     this replaces re-rendered a different pair into a static grid, which is a
     cut with nothing on screen to animate. */
  const pages = Array.from(
    { length: totalPages },
    (_, i) => source.reviews.slice(i * REVIEWS_PER_PAGE, i * REVIEWS_PER_PAGE + REVIEWS_PER_PAGE),
  );

  return (
    <div className="rw-column">
      <SourceHeader source={source} />
      <div className="rw-track-window">
        <div
          className="rw-track"
          style={{
            transform: `translateX(calc(${(carousel.offsetPct / 100).toFixed(6)} * 100%))`,
            transition: reduceMotion ? 'none' : 'transform 0.45s cubic-bezier(0.22, 0.61, 0.36, 1)',
          }}
        >
          {pages.map((page, i) => (
            <div className="rw-track-page" key={i} aria-hidden={i === carousel.index ? undefined : true}>
              <div className="rw-column-cards">
                {page.map((review) => (
                  <ReviewCard key={review.id} review={review} source={source} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Only when this column has more than one page of its own. */}
      {totalPages > 1 && (
        <Pagination
          page={carousel.index}
          total={totalPages}
          onPrev={carousel.prev}
          onNext={carousel.next}
          onDot={carousel.goTo}
          canPrev={carousel.canPrev}
          canNext={carousel.canNext}
        />
      )}
    </div>
  );
}

function Pagination({ page, total, onPrev, onNext, onDot, canPrev, canNext }: {
  page: number; total: number;
  onPrev: () => void; onNext: () => void; onDot: (i: number) => void;
  /* Optional so the mobile pager, which still owns its own bounds, can omit
     them and keep the original first/last comparison. */
  canPrev?: boolean; canNext?: boolean;
}) {
  const prevOff = canPrev === undefined ? page === 0 : !canPrev;
  const nextOff = canNext === undefined ? page === total - 1 : !canNext;

  return (
    <div className="rw-pagination">
      <button className="rw-page-btn rw-page-btn-prev" onClick={onPrev} disabled={prevOff} aria-label="Previous">
        <ChevronRight size={40} />
      </button>
      {/* Capped at 6 with the window sliding — a source with 40 reviews is 20
          pages, and 20 dots would not fit under a column. */}
      <CarouselDots
        count={total}
        active={page}
        onPick={onDot}
        dotClass="rw-page-dot"
        label="Go to page {n}"
      />
      <button className="rw-page-btn" onClick={onNext} disabled={nextOff} aria-label="Next">
        <ChevronRight size={40} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface ReviewsProps {
  heading?: string;
  subheading?: string;
}

export function Reviews({
  heading = 'Customer Reviews',
  subheading = 'Read what our customers have to say about their storage experience with us.',
}: ReviewsProps) {
  // Google + Yelp reviews from their Duda collections; DEMO_SOURCES stays as the
  // fallback (dev harness, Duda editor, or a missing/empty collection).
  const [sources, setSources] = useState<ReviewSource[]>(DEMO_SOURCES);
  // True until the collection read settles. Without it DEMO_SOURCES rendered
  // straight away — real-looking authors, ratings and quotes that were then
  // swapped for the property's actual reviews.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchAllReviewSources('#09 reviews')
      .then(({ google, yelp }) => {
        if (cancelled) return;
        const live = [google, yelp]
          .filter((s): s is ReviewSourceData => !!s && s.reviews.length > 0)
          .map((s) => ({
            key: s.platform as Platform,
            name: s.name,
            score: s.score,
            count: s.count,
            reviewsUrl: s.reviewsUrl,
            reviews: s.reviews.map((r) => ({
              id: r.id, author: r.author, rating: r.rating, text: r.text, timeAgo: r.timeAgo,
            })),
          }));
        // Only swap when at least one platform answered, so a partial outage
        // can't blank the widget.
        if (live.length) setSources(live);
      })
      .catch((err) => console.error('[Reviews] collection read error:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const [mobileSourceIdx, setMobileSourceIdx] = useState(0);

  const mobileSource = sources[Math.min(mobileSourceIdx, sources.length - 1)] ?? sources[0];
  const totalMobilePages = mobileSource.reviews.length;

  // One review at a time, dragged with the finger — the same shared hook the
  // other carousels use, so the feel and the 6-dot cap are identical.
  //
  // This replaces a remount-and-replay-a-keyframe approach: the card used to be
  // keyed by source+page so React rebuilt it, and a CSS animation faded it in
  // from 28px away. That read as a fade rather than a slide, could not follow a
  // finger, and needed a `mobileDir` state purely to choose which keyframe to
  // play. A real track moving under a clip needs none of that.
  const mobileCarousel = useCarousel({ count: totalMobilePages, perView: 1, draggable: true });
  const reduceMotion = usePrefersReducedMotion();
  const mobilePage = mobileCarousel.index;

  function switchMobileSource(idx: number) {
    setMobileSourceIdx(idx);
    // Each source has its own review list, so a switch has to rewind — index 7
    // of Google is meaningless once Yelp's list is showing.
    mobileCarousel.goTo(0);
  }

  // Skeleton until the collections answer: two source columns of cards, matching
  // the real geometry so the swap barely shifts. The heading is static copy, so it
  // paints straight away.
  if (loading) {
    return (
      <div className="rw-wrapper">
        <div className="rw-desktop">
          <div className="rw-heading-block">
            <div className="rw-title">{heading}</div>
            <p className="rw-subtitle">{subheading}</p>
          </div>
          <div className="rw-columns">
            {[0, 1].map((col) => (
              <div className="rw-column" key={col}>
                <Shimmer h={64} r={8} mb={16} />
                <div className="rw-column-cards">
                  {[0, 1, 2].map((i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                      <Shimmer w="45%" h={18} />
                      <Shimmer w={96} h={14} />
                      <Shimmer h={14} />
                      <Shimmer w="80%" h={14} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rw-mobile">
          <div className="rw-mobile-titlebar">
            <span className="rw-mobile-heading">Reviews</span>
          </div>
          <div style={{ padding: '0 31px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Shimmer w="45%" h={18} />
            <Shimmer w={96} h={14} />
            <Shimmer h={14} />
            <Shimmer w="80%" h={14} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rw-wrapper">

      {/* ── Desktop layout ──────────────────────────────────────────────── */}
      <div className="rw-desktop">
        <div className="rw-heading-block">
          <div className="rw-title">{heading}</div>
          <p className="rw-subtitle">{subheading}</p>
        </div>

        {/* Each column pages itself — see SourceColumn. There is deliberately no
            pager for the section as a whole any more: Google and Yelp hold
            different numbers of reviews, so one shared page number ran the
            shorter column out of cards while the other still had plenty. */}
        <div className="rw-columns">
          {sources.map((source) => (
            <SourceColumn key={source.key} source={source} />
          ))}
        </div>
      </div>

      {/* ── Mobile layout ───────────────────────────────────────────────── */}
      <div className="rw-mobile">
        <div className="rw-mobile-titlebar">
          <span className="rw-mobile-heading">Reviews</span>
        </div>

        <div className="rw-mobile-tabs">
          {sources.map((source, idx) => (
            <button
              key={source.key}
              className={`rw-mobile-tab${mobileSourceIdx === idx ? ' active' : ''}`}
              onClick={() => switchMobileSource(idx)}
            >
              {PLATFORM_LABEL[source.key]}
            </button>
          ))}
        </div>

        <div className="rw-mobile-body">
          <SourceHeader source={mobileSource} />
          {/* Every review of the selected source renders once and one transform
              slides the row; the window clips the rest. The item must stay
              exactly one window wide or the pitch stops matching the distance
              the transform steps by, and the cards drift with every step. */}
          <div className="rw-mobile-track-window" {...mobileCarousel.handlers}>
            <div
              className="rw-mobile-track"
              style={{
                transform: `translateX(calc(${(mobileCarousel.offsetPct / 100).toFixed(6)} * (100% + 10px)))`,
                transition:
                  reduceMotion || mobileCarousel.dragging
                    ? 'none'
                    : 'transform 0.45s cubic-bezier(0.22, 0.61, 0.36, 1)',
              }}
            >
              {mobileSource.reviews.map((review, i) => (
                <div
                  className="rw-mobile-track-item"
                  key={review.id}
                  {...(i === mobilePage ? {} : { inert: '' as unknown as boolean })}
                  aria-hidden={i === mobilePage ? undefined : true}
                >
                  <ReviewCard review={review} source={mobileSource} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <Pagination
          page={mobilePage}
          total={totalMobilePages}
          onPrev={mobileCarousel.prev}
          onNext={mobileCarousel.next}
          onDot={mobileCarousel.goTo}
          canPrev={mobileCarousel.canPrev}
          canNext={mobileCarousel.canNext}
        />
      </div>

    </div>
  );
}
