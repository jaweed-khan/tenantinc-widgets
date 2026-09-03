import React, { useEffect, useState } from 'react';
import './BlogsListing.css';
import { ShareIcon, ChevronRight, SOCIALS } from './icons';
import { BLOG_IMAGES, cover } from '@shared/demoImages';
import { hasCollectionsApi } from '@shared/dudaCollections';
import { fetchBlogPosts, type BlogPostData } from '@shared/blogPosts';
import { useCarousel, usePrefersReducedMotion } from '@shared/useCarousel';
import { CarouselDots } from '@shared/CarouselDots';
import { absolutePostUrl, shareTargets, type SocialProfiles } from '@shared/shareLinks';
import { useSocialProfiles } from '@shared/useSocialProfiles';

// ---------------------------------------------------------------------------
// Posts come from the Duda `BlogPosts` collection (see @shared/blogPosts). The set
// below is the dev-harness fallback only — outside Duda there's no dmAPI to
// read, so without it the harness would render an empty section.
// ---------------------------------------------------------------------------

const DEMO_POSTS: BlogPostData[] = [
  { id: 'b1', title: 'Spring Cleaning Made Simple: Storage Outlet Has Your Back', author: 'Storage Outlet', date: 'Mar 15, 2026 @ 4:30pm', timestamp: 4, excerpt: "Don't start the year off with overflowing closets, stuffed garages, and just too much clutter. Here's how a storage unit can help you reset.", image: BLOG_IMAGES[0], href: '/blogs/spring-cleaning-made-simple', slug: 'spring-cleaning-made-simple' },
  { id: 'b2', title: '5 Tips for Packing a Storage Unit Efficiently', author: 'Storage Outlet', date: 'Mar 10, 2026 @ 1:15pm', timestamp: 3, excerpt: 'Make the most of every square foot. These simple packing strategies help you fit more and keep your belongings easy to reach.', image: BLOG_IMAGES[1], href: '/blogs/packing-a-storage-unit', slug: 'packing-a-storage-unit' },
  { id: 'b3', title: 'How to Choose the Right Storage Unit Size', author: 'Storage Outlet', date: 'Mar 4, 2026 @ 9:00am', timestamp: 2, excerpt: 'From lockers to large drive-up units, picking the right size saves money and hassle. Our guide breaks down what fits where.', image: BLOG_IMAGES[2], href: '/blogs/choosing-a-unit-size', slug: 'choosing-a-unit-size' },
  { id: 'b4', title: 'Climate-Controlled Storage: Is It Worth It?', author: 'Storage Outlet', date: 'Feb 26, 2026 @ 11:45am', timestamp: 1, excerpt: "Temperature swings can damage furniture, electronics, and documents. Here's when climate control is worth the upgrade.", image: BLOG_IMAGES[3], href: '/blogs/climate-controlled-storage', slug: 'climate-controlled-storage' },
  // Four more than the Figma frame shows, so the harness exercises what a real
  // collection does: the carousel steps by one, so 8 posts is 6 desktop stops —
  // enough to watch the slide repeat and the dot window move.
  { id: 'b5', title: 'Moving House? A Storage Unit Buys You Breathing Room', author: 'Storage Outlet', date: 'Feb 19, 2026 @ 3:20pm', timestamp: 5, excerpt: 'Completion dates rarely line up. Short-term storage bridges the gap between moving out and moving in without the panic.', image: BLOG_IMAGES[4], href: '/blogs/moving-house-storage', slug: 'moving-house-storage' },
  { id: 'b6', title: 'Storing Seasonal Gear Without Losing the Garage', author: 'Storage Outlet', date: 'Feb 11, 2026 @ 10:05am', timestamp: 6, excerpt: 'Skis in summer, patio furniture in winter. Rotating seasonal kit through a small unit keeps the garage usable year-round.', image: BLOG_IMAGES[5], href: '/blogs/seasonal-gear-storage', slug: 'seasonal-gear-storage' },
  { id: 'b7', title: 'What You Can (and Cannot) Keep in a Storage Unit', author: 'Storage Outlet', date: 'Feb 3, 2026 @ 8:40am', timestamp: 7, excerpt: 'Most things are fine. Perishables, plants and anything flammable are not. A quick rundown before you start packing.', image: BLOG_IMAGES[0], href: '/blogs/what-you-can-store', slug: 'what-you-can-store' },
  { id: 'b8', title: 'Small Business Storage: Stock, Records and Equipment', author: 'Storage Outlet', date: 'Jan 28, 2026 @ 2:15pm', timestamp: 8, excerpt: 'Cheaper than extra office space and easier to scale. How local businesses use self storage as an overflow stockroom.', image: BLOG_IMAGES[1], href: '/blogs/small-business-storage', slug: 'small-business-storage' },
];

const CARDS_PER_PAGE = 3;

/** Hold the skeleton back this long so a fast collection read doesn't flash it. */
const SKELETON_DELAY_MS = 200;

/** Stand-in when a row has no thumbnail/mainImage. */
const NO_IMAGE = 'linear-gradient(135deg, #dfe3e8 0%, #c4cdd5 100%)';

// ---------------------------------------------------------------------------
// Blog card
// ---------------------------------------------------------------------------

/** Icon per share key, so the shared target list stays markup-free. */
const ICON_BY_KEY = Object.fromEntries(SOCIALS.map((s) => [s.key, s.Icon]));

/**
 * The card's share popover — all six brand glyphs (Figma 9340:23554).
 *
 * These used to be rendered at `href="#"`, so every one was a dead click. See
 * @shared/shareLinks for what each of the six now resolves to.
 */
function SharePopover({ post, profiles }: { post: BlogPostData; profiles: SocialProfiles }) {
  const url = absolutePostUrl(post.href);

  return (
    <div className="blog-share-pop" role="menu">
      {shareTargets(url, post.title, profiles).map(({ key, label, href }) => {
        const Icon = ICON_BY_KEY[key];
        return (
          <a
            key={key}
            className="blog-social"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            title={label}
            role="menuitem"
          >
            <Icon />
          </a>
        );
      })}
    </div>
  );
}

function BlogCard({ post, profiles }: { post: BlogPostData; profiles: SocialProfiles }) {
  const [shareOpen, setShareOpen] = useState(false);

  // authorName / publishDate can both be blank on a row — build the byline from
  // whichever parts exist so it never reads "By ,".
  const byline = [post.author && `By ${post.author}`, post.date]
    .filter(Boolean)
    .join(',  ');

  const linked = !!post.href && post.href !== '#';

  return (
    <article className="blog-card">
      <div className="blog-card-img" style={{ background: post.image ? cover(post.image) : NO_IMAGE }} />
      <div className="blog-card-body">
        {/* The title is the card's one real link; .blog-card-link stretches its
            hit area over the whole card (see CSS). It can't wrap the card in an
            <a> because the Share button and its popover live inside. */}
        <p className="blog-card-title">
          {linked ? (
            <a className="blog-card-link" href={post.href}>{post.title}</a>
          ) : (
            post.title
          )}
        </p>
        {byline && <p className="blog-card-byline">{byline}</p>}
        {post.excerpt && <p className="blog-card-excerpt">{post.excerpt}</p>}
        <div className="blog-card-footer">
          <a className="blog-readmore" href={linked ? post.href : '#'} tabIndex={-1}>Read more</a>
          <button className="blog-share" onClick={() => setShareOpen((o) => !o)} aria-expanded={shareOpen}>
            <ShareIcon size={24} />
            Share
          </button>
        </div>
      </div>

      {shareOpen && <SharePopover post={post} profiles={profiles} />}
    </article>
  );
}

/**
 * One placeholder card.
 *
 * This mirrors BlogCard's DOM element for element — same .blog-card, same
 * .blog-card-img, same .blog-card-body, same .blog-card-footer — and the CSS caps
 * the title, byline and excerpt at the --blog-*-h tokens that .blog-card's
 * min-height is summed from. So a skeleton card and a loaded card are the same
 * height to the pixel, and the read landing costs nothing on CLS. Anything added
 * to BlogCard's body needs a counterpart here, or the two drift apart again.
 */
function SkeletonCard() {
  return (
    <article className="blog-card blog-card--skeleton">
      <div className="blog-card-img" />
      <div className="blog-card-body">
        {/* Two bars for the 2-line title box, three for the 3-line excerpt — the
            bars divide their box up, so the widths are the only thing chosen here
            and the heights follow the tokens. */}
        <div className="blog-skel-box blog-skel-box--title">
          <span className="blog-skel" />
          <span className="blog-skel" style={{ width: '55%' }} />
        </div>
        <div className="blog-skel-box blog-skel-box--byline">
          <span className="blog-skel" style={{ width: '60%' }} />
        </div>
        <div className="blog-skel-box blog-skel-box--excerpt">
          <span className="blog-skel" />
          <span className="blog-skel" />
          <span className="blog-skel" style={{ width: '80%' }} />
        </div>
        <div className="blog-card-footer">
          <span className="blog-skel blog-skel--readmore" />
          <span className="blog-skel blog-skel--share" />
        </div>
      </div>
    </article>
  );
}

/**
 * Desktop placeholder row.
 *
 * The count is CARDS_PER_PAGE, deliberately: this listing paginates one row at a
 * time, so any other number would reserve rows the loaded grid then has to take
 * back.
 */
function DesktopSkeleton() {
  return (
    <div className="blog-grid" aria-hidden="true">
      {Array.from({ length: CARDS_PER_PAGE }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

/**
 * Mobile placeholder — one card, matching the single-card carousel below 900px.
 *
 * The desktop frame is `display: none` at this width, so without this the mobile
 * loading state was blank and the whole card arrived out of nowhere: the widest
 * shift in the widget, on exactly the viewport CLS is scored hardest on.
 *
 * The heading is the real string rather than a grey bar. It's a constant, so
 * rendering it costs no shift and gives the reader something true to look at.
 */
function MobileSkeleton({ title }: { title: React.ReactNode }) {
  return (
    <div className="blog-mobile">
      {title}
      <SkeletonCard />
      {/* The dots row is reserved, not guessed: how many posts there are decides
          how many dots, but not the strip's height (they never wrap). Three is
          simply what looks right. */}
      <div className="blog-pagination blog-pagination-dots" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span className="blog-skel blog-skel--dot" key={i} />
        ))}
      </div>
    </div>
  );
}

/**
 * The sliding strip both frames share.
 *
 * Every post is rendered once and a single transform moves the row; `perView`
 * sets each item's width, so the same track is a 3-up on desktop and a 1-up on
 * mobile. Overflow is hidden by .blog-track-window, so the cards outside the
 * view are present (and pre-loaded) but clipped.
 *
 * `index` is passed only to keep the clipped cards out of the tab order — they
 * are in the DOM, so without `inert` a keyboard user tabs through offscreen
 * links and the strip appears to scroll on its own.
 */
function Track({
  posts,
  profiles,
  perView,
  index,
  offsetPct,
  animate,
  handlers,
  onCardClickCapture,
}: {
  posts: BlogPostData[];
  profiles: SocialProfiles;
  perView: number;
  index: number;
  offsetPct: number;
  animate: boolean;
  handlers: React.HTMLAttributes<HTMLElement>;
  onCardClickCapture?: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className="blog-track-window"
      // Drives both the item width and the transform's step — see the CSS.
      style={{ '--blog-per-view': perView } as React.CSSProperties}
      {...handlers}
      onClickCapture={onCardClickCapture}
    >
      <div
        className="blog-track"
        style={{
          // Deliberately NOT a percentage. A translateX percentage resolves
          // against the element's own width, and this track's width is set by
          // flex against the WINDOW (`flex: 0 0 calc(100%/perView)` makes the
          // items size off the window, leaving the track itself window-width
          // however many items it holds). Percentages therefore under-shift and
          // the last card never reaches the right edge.
          //
          // One step is one item = 1/perView of the window, and `--blog-step` is
          // exactly that, so the shift is expressed in real pixels.
          //
          // The offset is divided by 100 in JS rather than inside the calc():
          // `calc(-500 * var(--blog-step) / 100)` multiplies a <number> by a
          // <percentage>, which browsers resolve inconsistently — it silently
          // came out one step short. A plain decimal multiplier is unambiguous.
          transform: `translateX(calc(${(offsetPct / 100).toFixed(6)} * var(--blog-step)))`,
          transition: animate ? 'transform 0.45s cubic-bezier(0.22, 0.61, 0.36, 1)' : 'none',
        }}
      >
        {posts.map((post, i) => {
          const visible = i >= index && i < index + perView;
          return (
            <div
              // `is-offscreen` drops the card's shadow while it is outside the
              // window. The window clips X but leaves Y visible (so a card's own
              // shadow can show), and with no gap between items on mobile the
              // NEXT card's shadow reached back across the clip seam and drew a
              // hard line down the card on screen. A card nobody can see has no
              // reason to cast one — see the rule in the CSS.
              className={`blog-track-item${visible ? '' : ' is-offscreen'}`}
              key={post.id}
              // Sized off the SAME variable the transform steps by, so the card
              // pitch and the slide distance can never disagree.
              style={{ flex: '0 0 var(--blog-item)' }}
              // Clipped cards keep their links focusable, so tabbing would walk
              // into a card nobody can see. `inert` takes them out of both the
              // tab order and the accessibility tree in one go; the aria-hidden
              // mirror covers browsers that don't support it yet.
              {...(visible ? {} : { inert: '' as unknown as boolean })}
              aria-hidden={visible ? undefined : true}
            >
              <BlogCard post={post} profiles={profiles} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface BlogsListingProps {
  heading?: string;
  subheading?: string;
  /** Duda collection name (case-sensitive). */
  collection?: string;
  /**
   * Path of the blog page the post slugs hang off. Cards link at
   * `${blogBasePath}/${slug}`, which is the URL #16 blog-post reads back — keep
   * the two in step or the cards will link past the article page.
   */
  blogBasePath?: string;
}

export function BlogsListing({
  heading = 'Self Storage Blog',
  subheading = 'Tips, guides, and news to help you store smarter — from packing hacks to choosing the right unit.',
  collection = 'BlogPosts',
  blogBasePath = '/blogs',
}: BlogsListingProps) {
  const [posts, setPosts] = useState<BlogPostData[]>([]);
  const [loading, setLoading] = useState(true);
  const [pastDelay, setPastDelay] = useState(false);
  // Two independent carousels — the frames are mutually exclusive in CSS
  // (.blog-desktop is display:none below 900px), so their positions never need
  // to agree and keeping them apart avoids a resize jumping the reader.
  const desktop = useCarousel({ count: posts.length, perView: CARDS_PER_PAGE });
  const mobile = useCarousel({ count: posts.length, perView: 1, draggable: true });
  const reduceMotion = usePrefersReducedMotion();

  // Brand profile links for the three glyphs that can't carry a share URL.
  const profiles = useSocialProfiles('#12');

  useEffect(() => {
    // No dmAPI means we're not in Duda (dev harness) — show the demo set rather
    // than an empty section, and skip the fetch entirely.
    if (!hasCollectionsApi()) {
      setPosts(DEMO_POSTS);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => { if (!cancelled) setPastDelay(true); }, SKELETON_DELAY_MS);

    fetchBlogPosts(collection, blogBasePath)
      .then((live) => { if (!cancelled) setPosts(live); })
      .catch((err) => console.error('[BlogsListing] fetchBlogPosts error:', err))
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; clearTimeout(timer); };
  }, [collection, blogBasePath]);

  // Positions, not pages: the arrows step one card, so a 9-post collection has
  // 7 desktop positions (9 - 3) rather than 3 pages. The dot row is windowed to
  // MAX_DOTS, so the count no longer bounds how wide the strip can get.
  const desktopStops = desktop.maxIndex + 1;

  const headingBlock = (
    <div className="blog-heading-block">
      <div className="blog-title">{heading}</div>
      <p className="blog-subtitle">{subheading}</p>
    </div>
  );

  // Shared with the skeleton, so the loading and loaded mobile frames open with
  // the identical element — a heading that changed between the two would shift
  // the card under it.
  const mobileTitleBlock = (
    <div className="blog-mobile-title">
      <span>Storage Blogs</span>
    </div>
  );

  // Still reading: skeleton once past the delay, nothing before it. Both frames
  // render and CSS picks one, exactly as in the loaded branch — the desktop grid
  // is `display: none` below 900px, so a mobile reader needs its own placeholder.
  if (loading) {
    if (!pastDelay) return null;
    return (
      <div className="blog-wrapper">
        <div className="blog-desktop">
          {headingBlock}
          <DesktopSkeleton />
        </div>
        <MobileSkeleton title={mobileTitleBlock} />
        <span className="blog-sr-only" role="status">Loading blog posts…</span>
      </div>
    );
  }

  // Published collection empty → render nothing rather than a bare heading.
  if (!posts.length) return null;

  return (
    <div className="blog-wrapper">

      {/* ── Desktop ─────────────────────────────────────────────────────── */}
      <div className="blog-desktop">
        {headingBlock}

        <Track
          posts={posts}
          profiles={profiles}
          perView={CARDS_PER_PAGE}
          index={desktop.index}
          offsetPct={desktop.offsetPct}
          animate={!reduceMotion}
          handlers={{}}
        />

        {desktopStops > 1 && (
          <div className="blog-pagination">
            {/* Disabled at each end rather than hidden: a control that vanishes
                moves the dots row sideways as you reach the last card. */}
            <button className="blog-page-btn blog-page-btn-prev" onClick={desktop.prev} disabled={!desktop.canPrev} aria-label="Previous">
              <ChevronRight size={40} />
            </button>
            <CarouselDots count={desktopStops} active={desktop.index} onPick={desktop.goTo} dotClass="blog-dot" label="Go to post {n}" />
            <button className="blog-page-btn" onClick={desktop.next} disabled={!desktop.canNext} aria-label="Next">
              <ChevronRight size={40} />
            </button>
          </div>
        )}
      </div>

      {/* ── Mobile ──────────────────────────────────────────────────────── */}
      <div className="blog-mobile">
        {mobileTitleBlock}
        {/* Dots indicate position, dragging moves — no arrows in this view. */}
        <Track
          posts={posts}
          profiles={profiles}
          perView={1}
          index={mobile.index}
          offsetPct={mobile.offsetPct}
          // A tween during the drag would lag the finger; only the release snap
          // is animated.
          animate={!reduceMotion && !mobile.dragging}
          handlers={mobile.handlers}
          // A drag ends in a click on whichever card is under the finger, which
          // would open that post. Swallow it at the capture phase, before the
          // card's own link sees it.
          onCardClickCapture={(e) => {
            if (mobile.didDrag.current) {
              mobile.didDrag.current = false;
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        />
        {/* The strip renders even for a single post (when there are no dots to
            show): its height is reserved in CSS, and dropping the row outright
            would make a one-post collection 40px shorter than the skeleton that
            stood in for it. */}
        <div className="blog-pagination blog-pagination-dots">
          {posts.length > 1 && (
            <CarouselDots count={posts.length} active={mobile.index} onPick={mobile.goTo} dotClass="blog-dot" label="Go to post {n}" />
          )}
        </div>
      </div>

    </div>
  );
}
