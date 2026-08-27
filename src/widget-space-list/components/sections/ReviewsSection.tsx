import React, { useEffect, useState } from 'react';
import { useCarousel, usePrefersReducedMotion } from '@shared/useCarousel';
import { CarouselDots } from '@shared/CarouselDots';
import { Shimmer } from '@shared/Shimmer';
import { fetchAllReviewSources, type ReviewSourceData } from '@shared/reviewsCollections';
import { CarouselChevron } from '../chevron';

type Platform = 'google' | 'yelp';

interface ReviewData {
  id: number;
  author: string;
  rating: number;
  text: string;
  timeAgo: string;
  platform: Platform;
}

const ALL_REVIEWS: ReviewData[] = [
  {
    id: 1, platform: 'google', author: 'Michael Reyes', rating: 5,
    text: '"Great customer service with secure and clean facilities. We have been customers for over 2 years and rent out a climate control unit. We have never had any problems. Would recommend for short term or long term storage needs.."',
    timeAgo: '4 months ago',
  },
  {
    id: 2, platform: 'google', author: 'Lucas Brady', rating: 5,
    text: '"Awesome customer service and super clean, secure facilities! We\'ve been renting a climate-controlled unit for over 2 years and have had zero issues. Totally recommend for both short and long-term storage!"',
    timeAgo: '3 months ago',
  },
  {
    id: 3, platform: 'google', author: 'Jesse Miller', rating: 5,
    text: '"This place is super convenient! It\'s secure, clean, and really well managed. Staff are awesome. Totally recommend storing your stuff here!"',
    timeAgo: '2 months ago',
  },
  {
    id: 4, platform: 'yelp', author: 'Jenny Mongelli', rating: 5,
    text: '"Exceptional customer service at this facility — always secure and impeccably clean. As customers for more than two years, we\'ve had zero issues with our climate-controlled unit. Highly recommend!"',
    timeAgo: '5 months ago',
  },
  {
    id: 5, platform: 'yelp', author: 'David Thompson', rating: 4,
    text: '"Great facility with easy access, well-lit and clean. Staff are friendly and helpful. Would definitely recommend to anyone looking for storage in the area."',
    timeAgo: '1 month ago',
  },
];

/** Yelp brand red — the logo disc and the rating squares must not drift apart. */
const YELP_RED = '#EE2628';

const PLATFORM_META: Record<Platform, { label: string; score: number; count: number; starColor: string }> = {
  google:  { label: 'Google',  score: 4.3, count: 264, starColor: '#FFD000' },
  yelp:    { label: 'Yelp',    score: 4.1, count: 87,  starColor: YELP_RED },
};

// ── Icons ─────────────────────────────────────────────────────────────────────

function GoogleLogo() {
  return (
    <svg width="46" height="47" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

/**
 * Yelp burst mark, white on the brand red.
 *
 * Was a <text>"y"</text> stand-in, which rendered in whatever font the host page
 * happened to resolve — Duda sites set their own, so the letterform was never
 * predictable. This is the real vector, so it draws identically everywhere.
 *
 * The mark is nested as its own <svg> with the source's 0 0 32 32 viewBox rather
 * than transform-scaled: the browser does the fitting, so there are no hand-
 * computed scale/translate numbers to get subtly wrong.
 */
const YELP_BURST =
  'M13.961 22.279c0.246-0.273 0.601-0.444 0.995-0.444 0.739 0 1.338 0.599 1.338 1.338 0 0.016-0 0.032-0.001 0.048l0-0.002-0.237 6.483c-0.027 0.719-0.616 1.293-1.34 1.293-0.077 0-0.153-0.006-0.226-0.019l0.008 0.001c-1.763-0.303-3.331-0.962-4.69-1.902l0.039 0.025c-0.351-0.245-0.578-0.647-0.578-1.102 0-0.346 0.131-0.661 0.346-0.898l-0.001 0.001 4.345-4.829zM12.853 20.434l-6.301 1.572c-0.097 0.025-0.208 0.039-0.322 0.039-0.687 0-1.253-0.517-1.332-1.183l-0.001-0.006c-0.046-0.389-0.073-0.839-0.073-1.295 0-1.324 0.223-2.597 0.635-3.781l-0.024 0.081c0.183-0.534 0.681-0.911 1.267-0.911 0.214 0 0.417 0.050 0.596 0.14l-0.008-0.004 5.833 2.848c0.45 0.221 0.754 0.677 0.754 1.203 0 0.623-0.427 1.147-1.004 1.294l-0.009 0.002zM13.924 15.223l-6.104-10.574c-0.112-0.191-0.178-0.421-0.178-0.667 0-0.529 0.307-0.987 0.752-1.204l0.008-0.003c1.918-0.938 4.153-1.568 6.511-1.761l0.067-0.004c0.031-0.003 0.067-0.004 0.104-0.004 0.738 0 1.337 0.599 1.337 1.337 0 0.001 0 0.001 0 0.002v-0 12.207c-0 0.739-0.599 1.338-1.338 1.338-0.493 0-0.923-0.266-1.155-0.663l-0.003-0.006zM19.918 20.681l6.176 2.007c0.541 0.18 0.925 0.682 0.925 1.274 0 0.209-0.048 0.407-0.134 0.584l0.003-0.008c-0.758 1.569-1.799 2.889-3.068 3.945l-0.019 0.015c-0.23 0.19-0.527 0.306-0.852 0.306-0.477 0-0.896-0.249-1.134-0.625l-0.003-0.006-3.449-5.51c-0.128-0.201-0.203-0.446-0.203-0.709 0-0.738 0.598-1.336 1.336-1.336 0.147 0 0.289 0.024 0.421 0.068l-0.009-0.003zM26.197 16.742l-6.242 1.791c-0.11 0.033-0.237 0.052-0.368 0.052-0.737 0-1.335-0.598-1.335-1.335 0-0.282 0.087-0.543 0.236-0.758l-0.003 0.004 3.63-5.383c0.244-0.358 0.65-0.59 1.111-0.59 0.339 0 0.649 0.126 0.885 0.334l-0.001-0.001c1.25 1.104 2.25 2.459 2.925 3.99l0.029 0.073c0.070 0.158 0.111 0.342 0.111 0.535 0 0.608-0.405 1.121-0.959 1.286l-0.009 0.002z';

function YelpLogo() {
  return (
    <svg width="46" height="47" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="24" fill={YELP_RED} />
      <svg x="11" y="10" width="26" height="28" viewBox="0 0 32 32">
        <path fill="#ffffff" d={YELP_BURST} />
      </svg>
    </svg>
  );
}

function PlatformLogo({ platform }: { platform: Platform }) {
  if (platform === 'google') return <GoogleLogo />;
  return <YelpLogo />;
}

function UserCircleIcon() {
  // Pika user-circle, traced from the Figma review-card design.
  return (
    <svg width="42" height="42" viewBox="0 0 42 42" fill="none" stroke="#101318" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <path d="M33.2406 33.5068C33.0627 30.437 30.3927 28 27.125 28H14.875C11.6073 28 8.93731 30.437 8.75944 33.5068M8.75944 33.5068C11.9152 36.5957 16.2352 38.5 21 38.5C25.7648 38.5 30.0848 36.5957 33.2406 33.5068C36.486 30.33 38.5 25.9002 38.5 21C38.5 11.335 30.665 3.5 21 3.5C11.335 3.5 3.5 11.335 3.5 21C3.5 25.9002 5.51402 30.33 8.75944 33.5068ZM26.25 17.5C26.25 20.3995 23.8995 22.75 21 22.75C18.1005 22.75 15.75 20.3995 15.75 17.5C15.75 14.6005 18.1005 12.25 21 12.25C23.8995 12.25 26.25 14.6005 26.25 17.5Z" />
    </svg>
  );
}

// Shared round rating star (matches the Reviews widget). Yelp keeps its red colour.
const ROUND_STAR =
  'M16.5423 5.649L12.0203 4.63275L9.67431 0.562657C9.24231 -0.187552 8.17831 -0.187552 7.74631 0.562657L5.40031 4.63275L0.878308 5.649C0.0453085 5.83655 -0.283691 6.86707 0.282309 7.51841L3.35531 11.0503L2.90631 15.7483C2.82331 16.6137 3.68431 17.2518 4.46631 16.9032L8.71131 15.0164L12.9563 16.9032C13.7383 17.2508 14.5993 16.6137 14.5163 15.7483L14.0673 11.0503L17.1403 7.51841C17.7063 6.86809 17.3773 5.83655 16.5443 5.649H16.5423Z';

/**
 * `badged` draws Yelp's own rating style: a white star knocked out of a filled
 * square, rather than a bare coloured star. Yelp shows ratings that way, so the
 * red-star version read as "Google stars painted red" instead of a Yelp rating.
 * Unfilled squares stay the same grey the bare stars used, so both platforms
 * dim identically.
 *
 * The star is inset with translate+scale about the square's centre —
 * t = (box - box*s)/2 — so it keeps a border on all four sides at any size.
 */
function Stars({
  rating, size = 14, color = '#FFD000', badged = false,
}: { rating: number; size?: number; color?: string; badged?: boolean }) {
  const filled = Math.round(rating);
  return (
    <div className={`sl-rv2-stars${badged ? ' sl-rv2-stars--badged' : ''}`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const on = i < filled;
        return badged ? (
          <svg key={i} width={size} height={size} viewBox="0 0 17.15 17" xmlns="http://www.w3.org/2000/svg">
            <rect width="17.15" height="17" rx="3" fill={on ? color : '#DFE3E8'} />
            <path d={ROUND_STAR} fill="#ffffff" transform="translate(2.57 2.55) scale(0.7)" />
          </svg>
        ) : (
          <svg key={i} width={size} height={size} viewBox="0 0 17.15 17" fill={on ? color : '#DFE3E8'} xmlns="http://www.w3.org/2000/svg">
            <path d={ROUND_STAR} />
          </svg>
        );
      })}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ReviewsSection() {
  const [platform, setPlatform] = useState<Platform>('google');

  // Google + Yelp from their Duda collections — both the review list AND the
  // summary score/count. ALL_REVIEWS + PLATFORM_META stay as the fallback (dev
  // harness, Duda editor, or missing/empty collections).
  const [live, setLive] = useState<Partial<Record<Platform, ReviewSourceData>> | null>(null);
  // True until the read settles, so the demo reviews never paint first.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchAllReviewSources('#05 reviews accordion')
      .then(({ google, yelp }) => {
        if (cancelled) return;
        const next: Partial<Record<Platform, ReviewSourceData>> = {};
        if (google?.reviews.length) next.google = google;
        if (yelp?.reviews.length) next.yelp = yelp;
        if (Object.keys(next).length) setLive(next);
      })
      .catch((err) => console.error('[ReviewsSection] collection read error:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const liveSource = live?.[platform];
  const fallbackMeta = PLATFORM_META[platform];
  // Live score/count when this platform came back, else the static summary.
  const meta = liveSource
    ? { ...fallbackMeta, score: liveSource.score, count: liveSource.count }
    : fallbackMeta;

  const reviews: ReviewData[] = liveSource
    ? liveSource.reviews.map((r, i) => ({
        id: i + 1, platform, author: r.author, rating: r.rating, text: r.text, timeAgo: r.timeAgo,
      }))
    : ALL_REVIEWS.filter((r) => r.platform === platform);
  const total = reviews.length;
  // One review at a time, dragged with the finger — the same shared hook the
  // blog listing and the other sidebar sections use, so the feel and the 6-dot
  // cap are identical everywhere. Index clamping lives in the hook.
  const carousel = useCarousel({ count: total, perView: 1, draggable: true });
  const reduceMotion = usePrefersReducedMotion();

  function handlePlatform(p: Platform) {
    setPlatform(p);
    // Each platform has its own review list, so a switch has to rewind — index 3
    // of Google is meaningless once the Yelp list is showing.
    carousel.goTo(0);
  }

  // The score/count summary is live too, so the whole block waits rather than
  // showing the static summary and then correcting it.
  if (loading) {
    return (
      <div className="sl-rv2">
        <div className="sl-rv2-tabs">
          <Shimmer w={96} h={38} r={100} />
          <Shimmer w={80} h={38} r={100} />
        </div>
        <Shimmer h={52} r={8} style={{ marginBottom: 12 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Shimmer w="50%" h={18} />
          <Shimmer w={92} h={14} />
          <Shimmer h={14} />
          <Shimmer w="78%" h={14} />
        </div>
      </div>
    );
  }

  return (
    <div className="sl-rv2">

      {/* Platform tabs */}
      <div className="sl-rv2-tabs">
        {(['google', 'yelp'] as Platform[]).map((p) => (
          <button
            key={p}
            className={`sl-rv2-tab${platform === p ? ' active' : ''}`}
            onClick={() => handlePlatform(p)}
          >
            {PLATFORM_META[p].label}
          </button>
        ))}
      </div>

      {/* Rating summary */}
      <div className="sl-rv2-summary">
        <div className="sl-rv2-summary-left">
          <PlatformLogo platform={platform} />
          <span className="sl-rv2-score">{meta.score}</span>
          <span className="sl-rv2-out-of">/ 5</span>
        </div>
        <div className="sl-rv2-summary-right">
          <Stars rating={meta.score} size={17} color={meta.starColor} badged={platform === 'yelp'} />
          <span className="sl-rv2-count">{meta.count} ratings</span>
        </div>
      </div>

      {/* Review card — swipeable: the arrows are hidden on mobile. */}
      {total > 0 && (
        /* Every review renders once and one transform slides the row; the window
           clips the rest. The item must stay exactly one window wide or the
           pitch stops matching the step and the cards drift. */
        <div className="sl-rv2-track-window" {...carousel.handlers}>
          <div
            className="sl-rv2-track"
            style={{
              transform: `translateX(calc(${(carousel.offsetPct / 100).toFixed(6)} * 100%))`,
              transition:
                reduceMotion || carousel.dragging
                  ? 'none'
                  : 'transform 0.45s cubic-bezier(0.22, 0.61, 0.36, 1)',
            }}
          >
            {reviews.map((r, i) => (
              <div
                className="sl-rv2-track-item"
                key={r.id ?? i}
                {...(i === carousel.index ? {} : { inert: '' as unknown as boolean })}
                aria-hidden={i === carousel.index ? undefined : true}
              >
                <div className="sl-rv2-card">
                  <div className="sl-rv2-card-header">
                    <UserCircleIcon />
                    <div className="sl-rv2-author-info">
                      <p className="sl-rv2-author">{r.author}</p>
                      <Stars rating={r.rating} size={14} color={meta.starColor} badged={platform === 'yelp'} />
                    </div>
                  </div>
                  <p className="sl-rv2-text">{r.text}</p>
                  <p className="sl-rv2-time">{r.timeAgo}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pagination */}
      {total > 1 && (
        <div className="sl-rv2-pagination">
          <button
            className="sl-rv2-arrow"
            onClick={carousel.prev}
            disabled={!carousel.canPrev}
            aria-label="Previous review"
          >
            <CarouselChevron dir="left" />
          </button>
          {/* Capped at 6 with the window sliding — a property with 40 Google
              reviews must not print 40 dots into a sidebar this narrow. */}
          <CarouselDots
            count={total}
            active={carousel.index}
            onPick={carousel.goTo}
            dotClass="sl-rv2-dot"
            label="Go to review {n}"
          />
          <button
            className="sl-rv2-arrow"
            onClick={carousel.next}
            disabled={!carousel.canNext}
            aria-label="Next review"
          >
            <CarouselChevron dir="right" />
          </button>
        </div>
      )}

    </div>
  );
}
