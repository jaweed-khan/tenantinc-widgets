import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './BlogsPage.css';
import { CloseCircleIcon } from '@shared/ui/icons';
import { ShareIcon, FilterHorizontalIcon, SearchIcon } from './icons';
import { BLOG_IMAGES, cover } from '@shared/demoImages';
import { Breadcrumb } from '@shared/Breadcrumb';
import { hasCollectionsApi, logSource, bool } from '@shared/dudaCollections';
import { fetchBlogPosts, slugify, type BlogPostData } from '@shared/blogPosts';
import { SOCIAL_ICONS } from '@shared/socialIcons';
import { absolutePostUrl, shareTargets, type SocialProfiles } from '@shared/shareLinks';
import { useSocialProfiles } from '@shared/useSocialProfiles';

// ===========================================================================
// Widget #15 — Blogs Page (full-page blog listing)
//
// The page-level counterpart to #12 blogs-listing. #12 is a SECTION widget:
// three cards, prev/dots/next pagination, no filtering. This one is the whole
// blog index — a tag filter row on the left, a search field on the right, and a
// three-column grid that lazy-loads more cards as the reader scrolls.
//
// #12 is untouched by design: it still ships on the Property Landing Page and
// must keep behaving exactly as it does. The card markup here is a deliberate
// copy of #12's rather than a shared import, so the two can diverge (they
// already do — see the line-clamp note on .bpg-card-title) without either one
// having to grow a variant prop.
//
// Scope: breadcrumb, heading, intro paragraph, filter bar, grid — the whole
// page, in that order.
//
// The 80px "Self Storage Blogs" hero used to be a Duda SECTION above this
// widget, which made the breadcrumb's position a problem: the frame puts the
// trail above the hero, and a widget sitting under that section could only ever
// draw it underneath. The heading is the widget's own now (`blogHeading` /
// `blogDescription` from the content menu), so the order matches the frame with
// nothing to arrange on the Duda side.
//
// The breadcrumb was originally left out on the grounds that the Duda page
// "already has its own breadcrumb element". It does not — checked on the live
// site — so the widget draws it (9340:23373).
//
// KNOWN CEILING — the lazy load is client-side. `readCollection` does a single
// `.get()` and Duda's pageSize is 100 (see @shared/dudaCollections), so this
// slices at most the first 100 published posts. Going beyond that needs the
// collection read itself to walk `page`, which is not done here.
//
// Figma: desktop page 9340:23282 (bar 9340:23520, card 9340:23540),
//        mobile page 10640:65677 (bar 10640:65983).
// ===========================================================================

// ---------------------------------------------------------------------------
// Dev-harness fallback. Outside Duda there's no dmAPI to read, so without this
// the harness would render an empty page. Nine posts so the full 3x3 grid, the
// chip row and the "More" panel are all exercised.
//
// Two of them also carry `storage-outlet-irvine` — the property-slug tag #05's
// "Local Blogs" section matches on (@shared/localBlogs). It's the demo property
// that section falls back to, so its "See all blogs" button lands here and
// actually filters in the harness instead of hitting an unknown category.
// ---------------------------------------------------------------------------

const DEMO_POSTS: BlogPostData[] = [
  { id: 'b1', title: 'Spring Cleaning Made Simple: Storage Outlet Has Your Back', author: 'Storage Outlet', date: 'Mar 15, 2026 @ 4:30pm', timestamp: 9, excerpt: "Don't start the year off with overflowing closets, stuffed garages, and just too much clutter. Here's how a storage unit can help you reset.", image: BLOG_IMAGES[0], href: '/blogs/spring-cleaning-made-simple', slug: 'spring-cleaning-made-simple', tags: ['Storage Advice', 'storage-outlet-irvine'] },
  { id: 'b2', title: '5 Tips for Packing a Storage Unit Efficiently', author: 'Storage Outlet', date: 'Mar 10, 2026 @ 1:15pm', timestamp: 8, excerpt: 'Make the most of every square foot. These simple packing strategies help you fit more and keep your belongings easy to reach.', image: BLOG_IMAGES[1], href: '/blogs/packing-a-storage-unit', slug: 'packing-a-storage-unit', tags: ['Packing', 'Storage Advice'] },
  { id: 'b3', title: 'How to Choose the Right Storage Unit Size', author: 'Storage Outlet', date: 'Mar 4, 2026 @ 9:00am', timestamp: 7, excerpt: 'From lockers to large drive-up units, picking the right size saves money and hassle. Our guide breaks down what fits where.', image: BLOG_IMAGES[2], href: '/blogs/choosing-a-unit-size', slug: 'choosing-a-unit-size', tags: ['Storage Advice'] },
  { id: 'b4', title: 'Climate-Controlled Storage: Is It Worth It?', author: 'Storage Outlet', date: 'Feb 26, 2026 @ 11:45am', timestamp: 6, excerpt: "Temperature swings can damage furniture, electronics, and documents. Here's when climate control is worth the upgrade.", image: BLOG_IMAGES[3], href: '/blogs/climate-controlled-storage', slug: 'climate-controlled-storage', tags: ['Technology'] },
  { id: 'b5', title: 'Got boxes? Everything you need to know about cardboard.', author: 'Storage Outlet', date: 'Feb 18, 2026 @ 8:20am', timestamp: 5, excerpt: 'Single wall, double wall, wardrobe, dish barrel — a plain-English tour of the boxes worth buying and the ones worth skipping.', image: BLOG_IMAGES[4], href: '/blogs/got-boxes', slug: 'got-boxes', tags: ['Packing'] },
  { id: 'b6', title: 'Storing Business Inventory Without Renting a Warehouse', author: 'Storage Outlet', date: 'Feb 9, 2026 @ 3:05pm', timestamp: 4, excerpt: 'Seasonal stock, sample cases, trade-show kit — how small businesses use self storage as flexible overflow space.', image: BLOG_IMAGES[5], href: '/blogs/storing-business-inventory', slug: 'storing-business-inventory', tags: ['Business'] },
  { id: 'b7', title: 'Smart Locks and 24/7 Access: Storage Tech in 2026', author: 'Storage Outlet', date: 'Jan 30, 2026 @ 10:00am', timestamp: 3, excerpt: 'App-controlled gates, unit-level sensors, and video that actually helps. What the new hardware changes for renters.', image: BLOG_IMAGES[0], href: '/blogs/smart-locks-and-24-7-access', slug: 'smart-locks-and-24-7-access', tags: ['Technology'] },
  { id: 'b8', title: 'Moving Across Town? Use Storage as a Staging Area', author: 'Storage Outlet', date: 'Jan 21, 2026 @ 2:40pm', timestamp: 2, excerpt: 'Closing dates rarely line up. A short-term unit turns a stressful two-day scramble into a move you can pace.', image: BLOG_IMAGES[1], href: '/blogs/moving-across-town', slug: 'moving-across-town', tags: ['Moving', 'Storage Advice', 'storage-outlet-irvine'] },
  { id: 'b9', title: 'A Landlord’s Guide to Turnover Storage', author: 'Storage Outlet', date: 'Jan 12, 2026 @ 9:30am', timestamp: 1, excerpt: 'Appliances, spare fixtures, and tenant leave-behinds add up fast. Keeping them off-site keeps units rentable.', image: BLOG_IMAGES[2], href: '/blogs/landlords-guide-to-turnover-storage', slug: 'landlords-guide-to-turnover-storage', tags: ['Business', 'Moving'] },
];

/** Hold the skeleton back this long so a fast collection read doesn't flash it. */
const SKELETON_DELAY_MS = 200;

/** Start the next batch before the reader hits the bottom. */
const PREFETCH_MARGIN = '400px';

/** Stand-in when a row has no thumbnail/mainImage. */
const NO_IMAGE = 'linear-gradient(135deg, #dfe3e8 0%, #c4cdd5 100%)';

const DEFAULT_BATCH_SIZE = 9;
const DEFAULT_VISIBLE_TAGS = 3;

/**
 * Floor for the number of placeholder cards on the first paint.
 *
 * The count is otherwise the batch size, because that is how many cards actually
 * land — a 3-card skeleton followed by a 9-card grid is a three-row jump, which
 * was the bulk of this widget's CLS. The floor covers a small configured
 * `batchSize`, so the placeholder always reserves more than a single row.
 *
 * It is a guess in one direction only: a collection holding fewer posts than
 * this still collapses the grid on arrival. Nothing can be known about the row
 * count before the read, and under-reserving (the old behaviour) shifts the rest
 * of the page down, which is the more expensive mistake.
 */
const MIN_SKELETON_CARDS = 6;

// ---------------------------------------------------------------------------
// Blog card
// ---------------------------------------------------------------------------

/** Icon per share key, so the shared target list stays markup-free. */
const ICON_BY_KEY = Object.fromEntries(SOCIAL_ICONS.map((s) => [s.key, s.Icon]));

/**
 * The card's share popover — all six brand glyphs (Figma 9340:23554).
 *
 * These used to be rendered at `href="#"`, so every one was a dead click. See
 * @shared/shareLinks for what each of the six now resolves to.
 */
function SharePopover({ post, profiles }: { post: BlogPostData; profiles: SocialProfiles }) {
  const url = absolutePostUrl(post.href);

  return (
    <div className="bpg-share-pop" role="menu">
      {shareTargets(url, post.title, profiles).map(({ key, label, href }) => {
        const Icon = ICON_BY_KEY[key];
        return (
          <a
            key={key}
            className="bpg-social"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            title={label}
            role="menuitem"
          >
            <Icon size={26} />
          </a>
        );
      })}
    </div>
  );
}

interface BlogCardProps {
  post: BlogPostData;
  profiles: SocialProfiles;
  shareOpen: boolean;
  onToggleShare: () => void;
}

function BlogCard({ post, profiles, shareOpen, onToggleShare }: BlogCardProps) {
  // authorName / publishDate can both be blank on a row — build the byline from
  // whichever parts exist so it never reads "By ,".
  const byline = [post.author && `By ${post.author}`, post.date].filter(Boolean).join(',  ');

  const linked = !!post.href && post.href !== '#';

  return (
    <article className="bpg-card">
      <div className="bpg-card-img" style={{ background: post.image ? cover(post.image) : NO_IMAGE }} />
      <div className="bpg-card-body">
        {/* The title is the card's one real link; .bpg-card-link stretches its
            hit area over the whole card (see CSS). It can't wrap the card in an
            <a> because the Share button and its popover live inside. */}
        <p className="bpg-card-title">
          {linked ? (
            <a className="bpg-card-link" href={post.href}>{post.title}</a>
          ) : (
            post.title
          )}
        </p>
        {byline && <p className="bpg-card-byline">{byline}</p>}
        {post.excerpt && <p className="bpg-card-excerpt">{post.excerpt}</p>}
        <div className="bpg-card-footer">
          <a className="bpg-readmore" href={linked ? post.href : '#'} tabIndex={-1}>Read more</a>
          <button className="bpg-share" type="button" onClick={onToggleShare} aria-expanded={shareOpen}>
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
 * Placeholder cards shown while the collection read is in flight.
 *
 * This mirrors BlogCard's DOM element for element — same .bpg-card, same
 * .bpg-card-img, same .bpg-card-body, same .bpg-card-footer — and the CSS
 * reserves a fixed box for the title, byline and excerpt (the --bpg-*-h tokens).
 * So a skeleton card and a loaded card are the same height to the pixel, and the
 * read landing costs nothing on CLS. Anything added to BlogCard's body needs a
 * counterpart here, or the two drift apart again.
 */
function CardSkeletons({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <article className="bpg-card bpg-card--skeleton" key={i} aria-hidden="true">
          <div className="bpg-card-img" />
          <div className="bpg-card-body">
            {/* Three bars for the 3-line title box, two for the 2-line excerpt —
                the bars divide their box up, so the widths are the only thing
                chosen here and the heights follow the tokens. */}
            <div className="bpg-skel-box bpg-skel-box--title">
              <span className="bpg-skel" />
              <span className="bpg-skel" />
              <span className="bpg-skel" style={{ width: '55%' }} />
            </div>
            <div className="bpg-skel-box bpg-skel-box--byline">
              <span className="bpg-skel" style={{ width: '60%' }} />
            </div>
            <div className="bpg-skel-box bpg-skel-box--excerpt">
              <span className="bpg-skel" />
              <span className="bpg-skel" style={{ width: '80%' }} />
            </div>
            <div className="bpg-card-footer">
              <span className="bpg-skel bpg-skel--readmore" />
              <span className="bpg-skel bpg-skel--share" />
            </div>
          </div>
        </article>
      ))}
    </>
  );
}

/** Pill-shaped placeholders so the real chip labels don't flash in. */
function BarSkeleton() {
  return (
    <div className="bpg-bar" aria-hidden="true">
      <div className="bpg-bar-left">
        <span className="bpg-skel bpg-skel--pill" style={{ width: 44 }} />
        <div className="bpg-chips">
          {[111, 160, 133].map((w, i) => (
            <span className="bpg-skel bpg-skel--pill" key={i} style={{ width: w }} />
          ))}
        </div>
      </div>
      <span className="bpg-skel bpg-skel--field" />
    </div>
  );
}

/** Chip used in the bar and in the tag panel. */
function TagChip({ tag, active, onToggle }: { tag: string; active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`bpg-chip${active ? ' active' : ''}`}
      onClick={onToggle}
      aria-pressed={active}
    >
      {/* Outlined ring: an active chip's background is #101318. */}
      {active && <span className="bpg-chip-x"><CloseCircleIcon outlined size={20} /></span>}
      <span>{tag}</span>
    </button>
  );
}

interface FilterPopupProps {
  tags: string[];
  activeTags: string[];
  onToggle: (tag: string) => void;
  onClear: () => void;
  onClose: () => void;
}

/**
 * All-categories picker (Figma 10630:52147 — "Side panel").
 *
 * A lightbox rather than the drop-down strip this used to be: on mobile the
 * inline chip row is hidden entirely, so this is the ONLY way to the tags and it
 * needs the whole screen to show a long category list. Desktop matches the
 * property landing page's filter lightbox (SpaceList's .sl-filter-modal —
 * 436px, centred, 20px radius) so the two read as one system; mobile goes
 * edge-to-edge full screen.
 */
function FilterPopup({ tags, activeTags, onToggle, onClear, onClose }: FilterPopupProps) {
  // Escape closes; lock host-page scroll for as long as the lightbox is up —
  // full screen on mobile means the page behind it must not scroll away.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const activeCount = activeTags.length;

  return (
    <div className="bpg-modal-overlay" onClick={onClose}>
      <div
        className="bpg-filter-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Filter by category"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bpg-modal-header">
          <div className="bpg-modal-title-row">
            <span className="bpg-modal-icon"><FilterHorizontalIcon size={20} /></span>
            <span className="bpg-modal-title">Filters</span>
            {activeCount > 0 && <span className="bpg-modal-badge">{activeCount}</span>}
          </div>
          <div className="bpg-modal-header-right">
            {/* "Reset", matching #05 and #08 — three filter popups in the same
                site should not each name this differently. */}
            {activeCount > 0 && (
              <button type="button" className="bpg-modal-reset" onClick={onClear}>Reset</button>
            )}
            <button type="button" className="bpg-modal-close" onClick={onClose} aria-label="Close filters">
              {/* Filled disc: .bpg-filter-modal is #fff. 32 fills the 32px
                  button box exactly; the box has no padding to inset it. */}
              <CloseCircleIcon size={32} />
            </button>
          </div>
        </div>

        <div className="bpg-modal-separator" />

        <div className="bpg-modal-body">
          <div className="bpg-modal-group">
            <div className="bpg-modal-group-title">Categories</div>
            <div className="bpg-modal-chips">
              {tags.map((tag) => (
                <TagChip key={tag} tag={tag} active={activeTags.includes(tag)} onToggle={() => onToggle(tag)} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface BlogsPageProps {
  /** Duda collection name (case-sensitive). */
  collection?: string;
  /**
   * Page heading — the h1, centred, under the breadcrumb (Duda `blogHeading`).
   * The widget draws this now; it used to be a Duda section above the widget,
   * which is what the scope note at the top of this file described.
   */
  blogHeading?: string;
  /** Centred paragraph under the heading (Duda `blogDescription`). */
  blogDescription?: string;
  /**
   * Duda content-menu CHECKBOX, so it can arrive as a real boolean or as the
   * string "true"/"false" depending on how the field is serialised — hence
   * `bool()` rather than a bare truthiness test. A bare test would read the
   * string "false" as true and hide the paragraph exactly when it should show.
   */
  hideDescription?: boolean | string;
  /**
   * Breadcrumb (Figma 9340:23373). Named to match #16 blog-post's props, so the
   * two blog widgets are configured the same way.
   *
   * DESKTOP ONLY — hidden under 900px in CSS. There is no mobile frame for it.
   *
   * Sits at the top of the widget, above the heading — which is the frame's
   * order, and is only true now that the heading is the widget's own rather
   * than a Duda section above it.
   */
  showBreadcrumb?: boolean;
  homeLabel?: string;
  homeHref?: string;
  /** The trailing crumb — this page, so it is not a link. */
  listingLabel?: string;
  /**
   * Path of the blog page the post slugs hang off. Cards link at
   * `${blogBasePath}/${slug}`, which is the URL #16 blog-post reads back — keep
   * the two in step or the cards will link past the article page.
   */
  blogBasePath?: string;
  searchPlaceholder?: string;
  /** Chips shown inline before the "More" chip; the rest live in the panel. */
  visibleTagCount?: number;
  /** Cards added per lazy-load batch (also the initial count). */
  batchSize?: number;
}

/** Duda sends '' for untouched text fields and can send '' for numbers too. */
function positiveInt(v: number | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}

// ── ?category= deep link ────────────────────────────────────────────────────
// `/blogs?category=storage-advice` opens the page with that chip already on, so
// a category link anywhere on the site (or off it) lands on a filtered grid.
//
// The traffic is ONE WAY on purpose: the param is read once on load and deleted
// when the reader turns the chip off, but toggling a chip never writes one. This
// widget is a section on a Duda page whose URL it does not own, and a filter bar
// that rewrites the address on every click would fight the page's own params and
// make a shared link mean whatever the last click was.

const CATEGORY_PARAM = 'category';

/** The requested category, verbatim ('' when absent). */
function readCategoryParam(): string {
  try {
    return (new URLSearchParams(window.location.search).get(CATEGORY_PARAM) ?? '').trim();
  } catch {
    return '';
  }
}

/** Drop `?category=` and leave every other param alone. */
function clearCategoryParam(): void {
  try {
    const p = new URLSearchParams(window.location.search);
    if (!p.has(CATEGORY_PARAM)) return;
    p.delete(CATEGORY_PARAM);
    const qs = p.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`);
  } catch {
    // Silently fail if replaceState isn't available (e.g. sandboxed iframe).
  }
}

/**
 * The tag the param names, or null.
 *
 * Matched on the slug rather than the raw string, because the value in a link is
 * written by hand: `Storage Advice`, `storage-advice` and `storage_advice` all
 * have to find the "Storage Advice" chip. Tag labels are the site's own data, so
 * two of them colliding on one slug isn't worth guessing between — first wins.
 */
function matchCategory(tags: string[], raw: string): string | null {
  const want = slugify(raw);
  if (!want) return null;
  return tags.find((t) => slugify(t) === want) ?? null;
}

/**
 * Every tag across the posts, in first-seen order.
 *
 * The list is newest-first, so the leading chips are the categories the site is
 * publishing in right now.
 */
function collectTags(posts: BlogPostData[]): string[] {
  const out: string[] = [];
  for (const post of posts) {
    for (const tag of post.tags ?? []) {
      if (!out.includes(tag)) out.push(tag);
    }
  }
  return out;
}

export function BlogsPage({
  collection = 'BlogPosts',
  blogHeading = 'Self Storage Blogs',
  blogDescription = '',
  hideDescription = false,
  blogBasePath = '/blogs',
  showBreadcrumb = true,
  homeLabel = 'Home',
  homeHref = '/',
  listingLabel = 'Storage Blogs',
  searchPlaceholder = 'Search Blog',
  visibleTagCount,
  batchSize,
}: BlogsPageProps) {
  const inlineTagCount = positiveInt(visibleTagCount, DEFAULT_VISIBLE_TAGS);
  const perBatch = positiveInt(batchSize, DEFAULT_BATCH_SIZE);
  const placeholder = searchPlaceholder.trim() || 'Search Blog';

  /* The heading block. Rendered in the loading branch as well as the real one:
     both values are props, already in hand before the collection resolves, so
     painting them costs no layout shift and gives the reader something true
     while the posts load — the same reasoning the breadcrumb already uses.
     An empty heading renders no <h1> at all rather than an empty one, so an
     operator who clears the field gets nothing instead of a blank 48px line. */
  const headingText = (blogHeading ?? '').trim();
  const descriptionText = bool(hideDescription) ? '' : (blogDescription ?? '').trim();
  const pageHead = (headingText || descriptionText) ? (
    <header className="bpg-head">
      {headingText && <h1 className="bpg-title">{headingText}</h1>}
      {descriptionText && <p className="bpg-intro">{descriptionText}</p>}
    </header>
  ) : null;

  const [posts, setPosts] = useState<BlogPostData[]>([]);
  const [loading, setLoading] = useState(true);
  const [pastDelay, setPastDelay] = useState(false);

  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [shown, setShown] = useState(perBatch);
  const [openShareId, setOpenShareId] = useState<string | null>(null);

  // Brand profile links for the three glyphs that can't carry a share URL.
  const profiles = useSocialProfiles('#15');

  const sentinelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // The requested category, captured on the first render: reading it later would
  // race the deletion below and come back empty.
  const urlCategory = useRef(readCategoryParam()).current;
  /** The chip `?category=` switched on, while the param is still in the URL. */
  const [linkedTag, setLinkedTag] = useState<string | null>(null);
  const linkApplied = useRef(false);

  // ── Data ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    /**
     * Land the posts and, on a `?category=` link, the chip it names — in ONE
     * state update. Selecting the chip from its own effect instead would commit
     * the unfiltered grid first and then filter it, so a deep link flashed every
     * post before settling on the category.
     *
     * One shot, whether or not the category matched: re-running it (the effect
     * re-fires if `collection` changes) would re-select a chip the reader had
     * since switched off.
     */
    const applyPosts = (list: BlogPostData[]) => {
      setPosts(list);
      if (linkApplied.current || !urlCategory) return;
      linkApplied.current = true;

      const match = matchCategory(collectTags(list), urlCategory);
      // A category no post carries leaves the param in place and the grid
      // unfiltered — rewriting a URL we never acted on would hide the typo.
      if (!match) return;

      setLinkedTag(match);
      setActiveTags([match]);
    };

    // No dmAPI means we're not in Duda (dev harness / site editor) — show the
    // demo set rather than an empty page, and skip the fetch entirely.
    if (!hasCollectionsApi()) {
      logSource('#15', 'blog posts', false, 'no dmAPI — not in Duda');
      applyPosts(DEMO_POSTS);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => { if (!cancelled) setPastDelay(true); }, SKELETON_DELAY_MS);

    fetchBlogPosts(collection, blogBasePath)
      .then((live) => {
        if (cancelled) return;
        logSource('#15', 'blog posts', true, `${collection}, ${live.length} rows`);
        applyPosts(live);
      })
      .catch((err) => console.error('[BlogsPage] fetchBlogPosts error:', err))
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; clearTimeout(timer); };
  }, [collection, blogBasePath, urlCategory]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const allTags = useMemo(() => collectTags(posts), [posts]);

  // Turning the deep-linked chip off (its own X, "Reset", or the empty
  // state's reset) drops the param, so a reload doesn't bring the filter back.
  // `linkedTag` is then forgotten, which is what stops a re-check re-adding it.
  useEffect(() => {
    if (!linkedTag || activeTags.includes(linkedTag)) return;
    clearCategoryParam();
    setLinkedTag(null);
  }, [linkedTag, activeTags]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return posts.filter((post) => {
      const tags = post.tags ?? [];
      // OR within tags: a post shows if it carries ANY of the active ones.
      if (activeTags.length && !activeTags.some((t) => tags.includes(t))) return false;
      if (!term) return true;
      return [post.title, post.author, post.excerpt, ...tags].join(' ').toLowerCase().includes(term);
    });
  }, [posts, activeTags, query]);

  // Clamp rather than store-and-correct, so a narrowing filter can't leave us
  // claiming to show more cards than exist.
  const visibleCount = Math.min(shown, filtered.length);
  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  // Chips visible inline; the rest are only reachable through the panel. On
  // mobile the inline row is hidden entirely (CSS) and the panel is the only way in.
  // An ACTIVE chip is always inline, even when it sits past the cut: a
  // `?category=` link (or a pick from the panel) can name any tag, and a
  // filtered grid whose only sign of a filter is the button's badge reads as
  // broken. Everything else keeps the plain first-N order.
  const inlineTags = useMemo(() => {
    const head = allTags.slice(0, inlineTagCount);
    const promoted = activeTags.filter((t) => allTags.includes(t) && !head.includes(t));
    return [...head, ...promoted];
  }, [allTags, inlineTagCount, activeTags]);
  const hasHiddenTags = allTags.length > inlineTags.length;

  // ── Filter / search interaction ────────────────────────────────────────────

  // Any change to the result set restarts the lazy load from the first batch —
  // otherwise switching filters would keep a deep scroll position's worth of
  // cards mounted for a much shorter list.
  const resetBatches = useCallback(() => setShown(perBatch), [perBatch]);

  const toggleTag = useCallback((tag: string) => {
    setActiveTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
    resetBatches();
  }, [resetBatches]);

  const clearFilters = useCallback(() => {
    setActiveTags([]);
    setQuery('');
    resetBatches();
  }, [resetBatches]);

  // Editor changes to batchSize should take effect without a remount.
  useEffect(() => { setShown(perBatch); }, [perBatch]);

  // ── Lazy load ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (shown >= filtered.length) return;

    // jsdom (the smoke test) and older browsers have no IntersectionObserver.
    // Rendering everything is the right degradation — a sentinel that can never
    // fire would strand the reader on the first batch with no way forward.
    if (typeof IntersectionObserver === 'undefined') {
      setShown(filtered.length);
      return;
    }

    const el = sentinelRef.current;
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown((s) => s + perBatch);
        }
      },
      { rootMargin: PREFETCH_MARGIN },
    );
    io.observe(el);
    return () => io.disconnect();
    // `shown` HAS to be a dependency. An IntersectionObserver only fires on a
    // change of intersection, so once the sentinel is in view and stays in view
    // (a short list, a tall viewport, or a fast scroll to the bottom) it never
    // fires a second time. Tearing the observer down and re-observing after each
    // batch re-evaluates from scratch, which is what keeps the batches coming.
    // The guard above terminates it — `shown` overshoots `filtered.length` on
    // the last batch, so the effect returns before creating another observer.
  }, [shown, filtered.length, perBatch]);

  // ── Dismissals ────────────────────────────────────────────────────────────

  // At most one share popover open at a time, closed by Escape or a click
  // outside. With nine cards on screen, leaving popovers open as the reader
  // moves down the grid gets messy fast. (The filter lightbox owns its own
  // Escape / click-outside handling — see FilterPopup.)
  useEffect(() => {
    if (!openShareId) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenShareId(null);
    };
    const onDown = (e: Event) => {
      const target = e.target;
      if (!(target instanceof Element) || !target.closest('.bpg-card')) setOpenShareId(null);
    };

    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [openShareId]);

  // ── Render ────────────────────────────────────────────────────────────────

  /* Two crumbs: Home, then this page. The trailing one carries no href —
     Breadcrumb drops it on the last item regardless. Rendered in the loading
     branch too: both labels are constants, so showing them costs no shift and
     gives the reader something true while the posts resolve (the same reasoning
     BlogsListing's skeleton uses for its heading). */
  const crumbs = showBreadcrumb
    ? <Breadcrumb className="bpg-crumbs" items={[{ label: homeLabel, href: homeHref }, { label: listingLabel }]} />
    : null;

  // Still reading: skeleton once past the delay, nothing before it — never paint
  // the demo constants first.
  if (loading) {
    if (!pastDelay) return null;
    return (
      <div className="bpg-wrapper">
        {crumbs}
        {pageHead}
        <BarSkeleton />
        <div className="bpg-grid">
          <CardSkeletons count={Math.max(MIN_SKELETON_CARDS, perBatch)} />
        </div>
        <span className="bpg-sr-only" role="status">Loading blog posts…</span>
      </div>
    );
  }

  // Published collection empty → render nothing rather than a bare filter bar.
  if (!posts.length) return null;

  const activeCount = activeTags.length;

  return (
    <div className="bpg-wrapper">
      {crumbs}
      {pageHead}

      {/* ── Filter / search bar ─────────────────────────────────────────────── */}
      <div className="bpg-bar">
        <div className="bpg-bar-left">
          {allTags.length > 0 && (
            <button
              type="button"
              /* Dark when the panel is open OR a category is actually
                 selected. It was panel-open only, so a button carrying two
                 applied filters looked identical to one carrying none the
                 moment the popup closed. */
              className={`bpg-filter-btn${panelOpen || activeCount > 0 ? ' active' : ''}`}
              onClick={() => setPanelOpen((o) => !o)}
              aria-label="Filter by category"
              aria-expanded={panelOpen}
              title="Filter by category"
            >
              <FilterHorizontalIcon />
              {activeCount > 0 && <span className="bpg-filter-badge">{activeCount}</span>}
            </button>
          )}

          <div className="bpg-chips">
            {inlineTags.map((tag) => (
              <TagChip key={tag} tag={tag} active={activeTags.includes(tag)} onToggle={() => toggleTag(tag)} />
            ))}
            {hasHiddenTags && (
              <button type="button" className="bpg-chip bpg-chip-more" onClick={() => setPanelOpen((o) => !o)}>
                More
              </button>
            )}
          </div>
        </div>

        <div className="bpg-search">
          <input
            ref={searchInputRef}
            className="bpg-search-input"
            type="text"
            placeholder={placeholder}
            value={query}
            onChange={(e) => { setQuery(e.target.value); resetBatches(); }}
            aria-label={placeholder}
          />
          {/* Filtering is live on change, so this only puts the caret back in
              the field — it has nothing to submit. */}
          <button
            type="button"
            className="bpg-search-btn"
            aria-label="Search"
            onClick={() => searchInputRef.current?.focus()}
          >
            <SearchIcon />
          </button>
        </div>
      </div>

      {/* ── All-categories popup ────────────────────────────────────────────── */}
      {panelOpen && allTags.length > 0 && (
        <FilterPopup
          tags={allTags}
          activeTags={activeTags}
          onToggle={toggleTag}
          /* Reset CLOSES as well as clearing, as it now does in #05 and #08.
             The tags are widget state, not a draft held by the popup, so the
             cleared list is already live and the close cannot discard it. */
          onClear={() => { setActiveTags([]); resetBatches(); setPanelOpen(false); }}
          onClose={() => setPanelOpen(false)}
        />
      )}

      {/* ── Grid ─────────────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="bpg-empty">
          <p className="bpg-empty-text">
            {query.trim() ? <>No posts match “{query.trim()}”.</> : 'No posts in the selected categories.'}
          </p>
          <button type="button" className="bpg-empty-reset" onClick={clearFilters}>Clear filters</button>
        </div>
      ) : (
        <>
          <div className="bpg-grid">
            {visible.map((post) => (
              <BlogCard
                key={post.id}
                post={post}
                profiles={profiles}
                shareOpen={openShareId === post.id}
                onToggleShare={() => setOpenShareId((cur) => (cur === post.id ? null : post.id))}
              />
            ))}
            {hasMore && <CardSkeletons count={Math.min(3, filtered.length - visibleCount)} />}
          </div>

          {/* Crossing into view (400px early) appends the next batch. */}
          {hasMore && <div className="bpg-sentinel" ref={sentinelRef} aria-hidden="true" />}

          <span className="bpg-sr-only" role="status">
            {`Showing ${visibleCount} of ${filtered.length} blog posts`}
          </span>
        </>
      )}

    </div>
  );
}
