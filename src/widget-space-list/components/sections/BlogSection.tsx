import React, { useEffect, useState } from 'react';
import { BLOG_IMAGES, cover } from '@shared/demoImages';
import { hasCollectionsApi } from '@shared/dudaCollections';
import { fetchBlogPosts, type BlogPostData } from '@shared/blogPosts';
import { useCarousel, usePrefersReducedMotion } from '@shared/useCarousel';
import { CarouselDots } from '@shared/CarouselDots';
import { CarouselChevron } from '../chevron';

// ---------------------------------------------------------------------------
// Posts come from the Duda `BlogPosts` collection via @shared/blogPosts — the
// same reader, mapping and PUBLISHED filter that widget #12 uses, so the two
// never disagree about what a post looks like. The set below is the dev-harness
// fallback only: outside Duda there's no dmAPI to read.
// ---------------------------------------------------------------------------

const DEMO_POSTS: BlogPostData[] = [
  { id: 'b1', title: 'Spring Cleaning Made Simple: Storage Outlet Has Your Back', author: 'Storage Outlet', date: 'Mar 15, 2026 @ 4:30pm', timestamp: 3, excerpt: "Don't start the year off with overflowing closets, stuffed garages, and just too much stuff taking over your home.", image: BLOG_IMAGES[0], href: '#' },
  { id: 'b2', title: 'How to Pack a Storage Unit Like a Pro', author: 'Storage Outlet', date: 'Feb 28, 2026 @ 10:00am', timestamp: 2, excerpt: 'Maximise every square foot of your storage unit with these expert packing tips and tricks for a stress-free experience.', image: BLOG_IMAGES[1], href: '#' },
  { id: 'b3', title: 'Climate Controlled vs. Standard Units: What You Need to Know', author: 'Storage Outlet', date: 'Feb 14, 2026 @ 2:00pm', timestamp: 1, excerpt: 'Not sure which unit type is right for your belongings? We break down the key differences to help you decide.', image: BLOG_IMAGES[2], href: '#' },
];

/** Stand-in when a row has no thumbnail/mainImage (same as #12). */
const NO_IMAGE = 'linear-gradient(135deg, #dfe3e8 0%, #c4cdd5 100%)';

// ── Icons ─────────────────────────────────────────────────────────────────────

function ShareIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92c0-1.61-1.31-2.92-2.92-2.92z"/>
    </svg>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

/** Shown while the collection read is in flight, so the panel never shows a
 *  half-empty card or a flash of demo copy. Shared with the Local Blogs
 *  section, which reads the same collection through the same card. */
export function BlogSkeletonCard() {
  return (
    <div className="sl-blog2" aria-hidden="true">
      <div className="sl-blog2-bg">
      <div className="sl-blog2-card sl-blog2-skeleton">
        <div className="sl-blog2-image sl-blog2-sk-block" />
        <div className="sl-blog2-body">
          <span className="sl-blog2-sk-line sl-blog2-sk-title" />
          <span className="sl-blog2-sk-line sl-blog2-sk-title sl-blog2-sk-title--short" />
          <span className="sl-blog2-sk-line sl-blog2-sk-byline" />
          <span className="sl-blog2-sk-line sl-blog2-sk-excerpt" />
          <span className="sl-blog2-sk-line sl-blog2-sk-excerpt sl-blog2-sk-excerpt--short" />
          <div className="sl-blog2-footer">
            <span className="sl-blog2-sk-line sl-blog2-sk-readmore" />
            <span className="sl-blog2-sk-line sl-blog2-sk-share" />
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

// ── Carousel ──────────────────────────────────────────────────────────────────

export interface BlogCarouselProps {
  /** Non-empty; the callers own the loading and empty states. */
  posts: BlogPostData[];
  /** Rendered under the pagination — the Local Blogs section's "See all blogs". */
  footer?: React.ReactNode;
}

/**
 * One post at a time, one dot per post — the card itself, with no opinion about
 * where the posts came from.
 *
 * Shared by this section (every post) and Local Blogs (this property's posts),
 * so the two can never drift into looking like different cards.
 */
export function BlogCarousel({ posts, footer }: BlogCarouselProps) {
  const total = posts.length;
  // One post at a time, dragged with the finger — the same shared hook the blog
  // listing (#12) and Nearby Storage use, so the feel and the 6-dot cap are
  // identical everywhere. Index clamping lives in the hook.
  const carousel = useCarousel({ count: total, perView: 1, draggable: true });
  const reduceMotion = usePrefersReducedMotion();
  const current = carousel.index;

  return (
    <div className="sl-blog2">

      {/* Gray background zone with card. Swipeable: the arrows are hidden on
          mobile (see SpaceList.css), so this is how you move between posts. */}
      <div className="sl-blog2-bg">
        {/* Every post renders once and one transform slides the row; the window
            clips the rest. Drag handlers sit on the window so a swipe anywhere
            over the card moves it. */}
        <div className="sl-blog2-track-window" {...carousel.handlers}>
          <div
            className="sl-blog2-track"
            style={{
              // The step is the card PITCH: one window plus the 10px flex gap
              // between cards (see .sl-blog2-track). Stepping by 100% alone
              // would leave the row 12px short with every press.
              transform: `translateX(calc(${(carousel.offsetPct / 100).toFixed(6)} * (100% + 10px)))`,
              transition:
                reduceMotion || carousel.dragging
                  ? 'none'
                  : 'transform 0.45s cubic-bezier(0.22, 0.61, 0.36, 1)',
            }}
          >
            {posts.map((p, i) => {
              // authorName / publishDate can both be blank on a row — build the
              // byline from whichever parts exist so it never reads "By ,".
              const byline = [p.author && `By ${p.author}`, p.date].filter(Boolean).join(',  ');
              const linked = !!p.href && p.href !== '#';
              return (
                <div
                  className="sl-blog2-track-item"
                  key={p.id}
                  // Clipped posts keep their links focusable, so tabbing would
                  // walk into a card nobody can see.
                  {...(i === current ? {} : { inert: '' as unknown as boolean })}
                  aria-hidden={i === current ? undefined : true}
                >
                  <div className="sl-blog2-card">

                    {/* Hero image */}
                    <div
                      className="sl-blog2-image"
                      style={{ background: p.image ? cover(p.image) : NO_IMAGE }}
                    />

                    {/* Card body */}
                    <div className="sl-blog2-body">
                      <p className="sl-blog2-title">
                        {linked ? <a className="sl-blog2-title-link" href={p.href}>{p.title}</a> : p.title}
                      </p>
                      {byline && <p className="sl-blog2-byline">{byline}</p>}
                      {p.excerpt && <p className="sl-blog2-excerpt">{p.excerpt}</p>}
                      <div className="sl-blog2-footer">
                        <a href={linked ? p.href : '#'} className="sl-blog2-read-more">Read more</a>
                        <div className="sl-blog2-share">
                          <ShareIcon />
                          <a href="#" className="sl-blog2-share-link">Share</a>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Pagination — one post at a time, one dot per post */}
      {total > 1 && (
        <div className="sl-blog2-pagination">
          <button
            className="sl-blog2-arrow"
            onClick={carousel.prev}
            disabled={!carousel.canPrev}
            aria-label="Previous post"
          >
            <CarouselChevron dir="left" />
          </button>
          {/* Capped at 6 with the window sliding — a collection with 20 posts
              must not print 20 dots into a sidebar this narrow. */}
          <CarouselDots
            count={total}
            active={current}
            onPick={carousel.goTo}
            dotClass="sl-blog2-dot"
            label="Go to post {n}"
          />
          <button
            className="sl-blog2-arrow"
            onClick={carousel.next}
            disabled={!carousel.canNext}
            aria-label="Next post"
          >
            <CarouselChevron dir="right" />
          </button>
        </div>
      )}

      {footer}

    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export interface BlogSectionProps {
  /** Duda collection name (case-sensitive). Default 'BlogPosts'. */
  collection?: string;
  /**
   * Path of the blog page the post slugs hang off. Posts link at
   * `${blogBasePath}/${slug}`, the URL #16 blog-post reads back.
   */
  blogBasePath?: string;
}

export function BlogSection({ collection = 'BlogPosts', blogBasePath = '/blogs' }: BlogSectionProps) {
  const [posts, setPosts] = useState<BlogPostData[]>([]);
  const [loading, setLoading] = useState(true);

  // This section only mounts when its accordion is opened, so the read is lazy.
  useEffect(() => {
    // No dmAPI means we're not in Duda (dev harness) — show the demo set rather
    // than an empty card, and skip the read entirely.
    if (!hasCollectionsApi()) {
      setPosts(DEMO_POSTS);
      setLoading(false);
      return;
    }

    let cancelled = false;
    fetchBlogPosts(collection, blogBasePath)
      .then((live) => { if (!cancelled) setPosts(live); })
      .catch((err) => console.error('[BlogSection] fetchBlogPosts error:', err))
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [collection, blogBasePath]);

  if (loading) return <BlogSkeletonCard />;

  // Published collection empty → say so rather than render an empty card.
  if (!posts.length) {
    return <p className="sl-blog2-empty">No blog posts published yet.</p>;
  }

  return <BlogCarousel posts={posts} />;
}
