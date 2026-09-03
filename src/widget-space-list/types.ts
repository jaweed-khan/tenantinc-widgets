// ---------------------------------------------------------------------------
// Space List widget — data + prop types
//
// The backend developer's main concern is the `Unit` shape below: this is the
// contract every component renders against. Swap the static DEMO_UNITS in
// data.ts for a Hummingbird-backed Unit[] and nothing in the components needs
// to change. See HANDOFF.md.
// ---------------------------------------------------------------------------

export type SpaceType = 'storage' | 'parking';
/** @deprecated — use SpaceType[] in FilterState.types instead */
export type FilterType = SpaceType;

/**
 * Size categories derived from length × height area (sq ft):
 *   0 → other | 1 → extra_small | 2–24 → small | 25–76 → medium
 *   77–151 → large | 152+ → extra_large
 */
export type UnitSize = 'other' | 'extra_small' | 'small' | 'medium' | 'large' | 'extra_large';

/** A single rentable space. One flat array of these drives both views. */
export interface Unit {
  id: string;
  type: SpaceType;
  size: UnitSize;
  /** Display dimensions, e.g. "5' x 5'" */
  dimensions: string;
  /** Short descriptor shown under the title, e.g. "Climate Controlled" */
  subtype: string;
  /** Bulleted feature list on the card */
  features: string[];
  /** Amenities this unit has — matched against the amenity checkboxes filter */
  amenities: string[];
  /** Number of vacant (available to rent) units in this tier */
  vacantCount?: number;
  /** Amenity names where show_in_filter_bar === 1 — drives the Space Features pills */
  filterBarFeatures: string[];
  image: string;
  /**
   * Operator artwork for this card, MOST SPECIFIC FIRST:
   *
   *   [0] {Band}_{Amenity}.png   e.g. Small_Driveup.png
   *   [1] {Band}.png             e.g. Small.png
   *
   * SEPARATE from `image`, which stays the per-dimension bundled render and is
   * the next fallback once this list is exhausted. Overwriting `image` would
   * have dropped a 10x20 card to the generic default whenever Large.png was
   * missing — worse than today, and only on sites using the feature.
   */
  mediaImages?: string[];
  /** Strike-through "in-store" price */
  inStorePrice: number;
  /** Main "starting at" price */
  startingPrice: number;
  /** Optional "+ Plus $X Admin Fee" line */
  adminFee?: number;
  /** Optional promo badge text */
  promo?: string;
  /** Allocated promotion id — matches the Promotions widget's promo id for cross-widget filtering */
  promoId?: string;
  /**
   * The API's own promo-applied sell rate (`promotion_sell_rate`). Authoritative
   * when present — but null on every tier as of 2026-08-03, hence the two fields
   * below. See promoRate() in components/Pricing.tsx.
   */
  promotionPrice?: number;
  /** The promotion's discount amount (`value`): 50 for "50% off", 1 for "$1 move in". */
  promoValue?: number;
  /**
   * How to read `promoValue`, inferred from the promo NAME because the API's own
   * `type` field is 'regular' for everything. 'percent' → % off the starting
   * price; 'fixed' → the promo IS the price. Undefined when neither could be
   * determined, in which case no promo rate is shown at all.
   */
  promoKind?: 'percent' | 'fixed';
  /** Promotion categories this unit qualifies for — matched against the Promotions filter checkboxes */
  promotions?: string[];
  /** Optional urgency line, e.g. "Only 1 left · Rent soon!" */
  urgency?: string;
  /** CTA state: absent = normal Select, 'call' = Call button, 'waitlist' = Waitlist button */
  availability?: 'call' | 'waitlist';
  /** Offer tier id (= tier_id) — the authoritative product identity handed to #14 */
  unitGroupId?: string;
}

// ---------------------------------------------------------------------------
// Widget-level display config — built from SpaceListProps in SpaceList.tsx
// and threaded down to all card components.
// ---------------------------------------------------------------------------

/** How the in-store strike price is derived from the web price. */
export type InstorePriceMode = 'percentOfWeb' | 'percentDiff' | 'additionOfWeb';

/** Ordering applied to the units inside every group/accordion. */
export type SortBy = 'sizeAsc' | 'sizeDesc' | 'priceAsc' | 'priceDesc';

/** Which top-level category renders first. */
export type CategoryOrdering = 'spaces' | 'parking';

export interface WidgetConfig {
  showInstorePrice: boolean;
  /** Label shown above the in-store strike price ("IN-STORE", "WAS", etc.) */
  instorePriceLabel: string;
  /** How the in-store price relates to the web price (calc wired with real data). */
  instorePriceMode: InstorePriceMode;
  showJunkFeeDisclaimer: boolean;
  /** Disclaimer copy shown when `showJunkFeeDisclaimer` is on. Empty = render nothing. */
  junkFeeCopy: string;
  showUrgencyMessage: boolean;
  /** Vacancy at or below which the urgency message shows. Always a positive int. */
  urgencyThreshold: number;
  /** Ordering of the units within each size group / category accordion. */
  sortBy: SortBy;
  /** Which category accordion renders first. */
  categoryOrdering: CategoryOrdering;
  /** Whether sold-out units appear in the listing at all. */
  showUnavailableUnits: boolean;
  /** For a shown sold-out unit: true → "Join waitlist" CTA, false → "Call". */
  enableWaitlist: boolean;
  callOnLimitedAvailability: boolean;
  ctaButtonCopy: string;
  /** Copy for the note under a sold-out unit's CTA. Empty = render nothing. */
  limitedAvailabilityCopy: string;
  /** Label above the main price. Default 'Starting at'. */
  startingAtLabel: string;
  /**
   * The number `instorePriceMode` applies to the web price — a percentage for the
   * percent modes, currency for the addition mode. 0 = leave the API's own
   * in-store price alone.
   */
  instorePriceAmount: number;
  /**
   * Promo pricing mode. When on, the price pair becomes "Online" (the starting
   * rate, struck through) beside "Promo rate" (the starting rate with the unit's
   * promotion applied), and `instorePriceMode` / `instorePriceAmount` are ignored
   * entirely. A unit with no resolvable promotion shows its starting price alone.
   */
  enablePromoLogic: boolean;
  /* Sold-out tiers are governed by TWO toggles: `showUnavailableUnits` decides
     whether they appear at all (default: hidden), and `enableWaitlist` then picks
     the CTA — "Join waitlist" when on, "Call" when off. The former showWishlist
     toggle (and its "Add to Wishlist" popup) has been removed. */
  /** Live property phone — kept available to the cards; no longer used by the CTA. */
  contactPhone: string;
  /** Live property name — kept available to the cards. */
  facilityName: string;
  /** Select opens the #14 value-tiers modal (via tierBus) instead of nothing. */
  enableValueTiers: boolean;
  valueTiersChannel?: string;
  valueTiersPageUrl?: string;
  /** Where Select goes when there is no value-tiers step. Default '/rental'. */
  rentalPageUrl?: string;
  /** Resolved property + company this widget is showing — carried into the
   *  value-tiers handoff so the target page prices the same unit group
   *  (dynamic pages vary both; the target can't infer them). */
  propertyId?: string;
  companyId?: string;
}

// ---------------------------------------------------------------------------
// Filter option definitions (drive the filter panel UI)
// ---------------------------------------------------------------------------

export interface FilterOption<T extends string = string> {
  value: T;
  label: string;
}

// ---------------------------------------------------------------------------
// Widget props — these come straight from the Duda content panel
// ---------------------------------------------------------------------------

export interface SpaceListProps {
  /**
   * Dropdown in the content panel: which listing layout to render.
   *   'grid'    — card grid inside size-group accordions
   *   'list'    — one card per size group, dimensions as selectable pills
   *   'default' — one horizontal card per unit (Figma 7112-47133); below the
   *               widget's 640px mobile breakpoint this renders 'grid' instead,
   *               since the default card has no mobile frame.
   * Omitted → 'grid' (unchanged behaviour for instances that never set it).
   */
  layoutMode?: 'grid' | 'list' | 'default';
  /** @deprecated Filters now always render as a top bar; this is ignored. */
  filterPosition?: 'left' | 'top' | 'right';
  /** Dropdown in the content panel: which side the accordion panel sits on. Default 'right'. */
  apLocation?: 'left' | 'right';
  /**
   * Toggle: render the side accordion panel at all. Default true. When off the
   * whole panel goes — including the editor-only "Manage accordions" button,
   * which lives inside it — and the listing takes the full width.
   */
  showSideAccordions?: boolean;

  // ── Duda runtime context (forwarded from `data` in the Duda JS tab, NOT
  //    content-panel inputs). Used to gate the editor-only reorder UI and to
  //    key this instance's saved accordion config (siteId + elementId). ───────
  /** True only inside the Duda editor — gates the floating "Reorder" button. */
  inEditor?: boolean;
  /** Duda's per-page unique element id (data.elementId). */
  elementId?: string;
  /** Duda's site id (data.siteId). */
  siteId?: string;
  /**
   * Override for where operator size artwork lives. Empty (the normal case)
   * derives it from `siteId`:
   *   https://irp.cdn-website.com/{siteId}/dms3rep/multi/Small.png
   * Set it for a different CDN region, images hosted elsewhere, or to point
   * the dev harness at a real site.
   */
  spaceImageBaseUrl?: string;
  /**
   * URL of the PHP write-proxy that persists the accordion arrangement to the
   * Duda collection. Set in the Duda JS tab so it can change without a rebuild.
   * When absent (dev harness / not configured) Save applies locally only.
   */
  configApiUrl?: string;
  /** Name of the Duda collection holding the arrangement. Default 'accordionConfig'. */
  configCollection?: string;

  // ── General widget properties ───────────────────────────────────────────
  /**
   * Text field "Property Landing Page Header": the page's <h1>. Set it and it
   * renders verbatim, so an editor can write the whole heading rather than only
   * the property name. Blank/omitted keeps the previous computed heading
   * ("Storage Units in {property name}"), so existing instances are unchanged.
   *
   * Run through `boundText`, so this can also be connected to a Properties
   * column — a binding that fails to resolve falls back to the computed heading
   * instead of printing "{{propertyHeader}}".
   */
  propertyHeader?: string;
  /**
   * Draw the <h1> above the filter bar. Default true.
   *
   * Turn it OFF when #18 widget-space-list-heading is placed above this widget
   * — that exists so #06 promotions can sit BETWEEN the heading and the filter
   * bar on mobile, which is impossible while the heading is inside this
   * widget's own layout. With both on, the page has two <h1>s.
   */
  showHeading?: boolean;
  /** Toggle: show or hide the in-store strike-through price block. Default true. */
  showInstorePrice?: boolean;
  /** Text label above the in-store strike price. Default 'IN-STORE'. */
  instorePriceLabel?: string;
  /** Dropdown: how the in-store price is derived from the web price. Default 'percentOfWeb'. */
  instorePriceMode?: InstorePriceMode;
  /**
   * Number field: the amount `instorePriceMode` applies. Duda number fields can
   * arrive as strings, so this is coerced in SpaceList; blank/0/negative means
   * "use the API's in-store price unchanged".
   */
  instorePriceAmount?: number | string;
  /**
   * Duda toggle `enablePromoLogic`: swap the in-store/starting pair for
   * Online/Promo rate. Overrides the two instore-price settings above.
   * Typed to accept a string because Duda toggles can arrive as 'true'/'false'.
   */
  enablePromoLogic?: boolean | string;
  /**
   * DYNAMIC PAGES — content-menu field connected to `Properties > id` via Duda's
   * "Connect to data". Selects which property's units, sidebar details and nearby
   * list this instance renders. Unset = the config.json property, i.e. the old
   * static behaviour. See @shared/propertyBinding.
   */
  propertyId?: string;
  /**
   * The company that owns `propertyId`. A plain content-menu text field — it is NOT
   * a `Properties` column, so it can't be "connected to data". Required whenever the
   * bound property belongs to a different company than `config.json`, because
   * `properties/{id}/…` only resolves inside its own company. Empty = configured.
   */
  companyId?: string;
  /**
   * The property's space group (unit list). NOT bindable from the Properties
   * collection — it isn't a column there, and each property has several groups of
   * which only "Website Group" is public. Leave EMPTY on a dynamic page and the
   * widget resolves that property's Website Group itself; set it to pin one group.
   */
  spaceGroupId?: string;
  /** Text label above the main price. Default 'Starting at'. */
  startingAtLabel?: string;
  /**
   * Text field: copy for the note under a sold-out unit's CTA. Blank/omitted
   * falls back to 'Limited Availability'.
   */
  limitedAvailabilityCopy?: string;
  /** Toggle: show video thumbnails inside the Size Guide accordion. Default true. */
  showSizeGuideVideos?: boolean;
  /** Toggle: show a junk-fee disclaimer below unit pricing. Default false. */
  showJunkFeeDisclaimer?: boolean;
  /**
   * Text field: the disclaimer copy. Blank/omitted falls back to the standard
   * taxes-and-admin-fees wording, so existing instances read the same as before.
   */
  junkFeeCopy?: string;
  /** Toggle: show "Only X left" urgency messages on eligible units. Default true. */
  showUrgencyMessage?: boolean;
  /**
   * Show the urgency message when a tier has this many units vacant or fewer.
   * Default 5. Duda content-menu number fields can arrive as strings, so this is
   * coerced to a positive integer in SpaceList (bad input falls back to 5).
   */
  urgencyThreshold?: number | string;
  /**
   * Radio in the content panel: how units are ordered inside every size group
   * and category accordion. Default 'sizeAsc'.
   *
   * 'sizeDesc' also flips the size-band order so Extra Large leads; the price
   * sorts leave the canonical small→large band order alone (a band's position
   * has no price meaning).
   */
  sortBy?: SortBy;
  /** Radio in the content panel: show Spaces or Parking first. Default 'spaces'. */
  categoryOrdering?: CategoryOrdering;
  /**
   * Toggle: show sold-out units in the listing at all. Default false (hidden).
   * When on, `enableWaitlist` decides their CTA — "Join waitlist" or "Call".
   */
  showUnavailableUnits?: boolean;
  /**
   * Toggle: for sold-out units that ARE shown, use a "Join waitlist" CTA instead
   * of "Call". Default false. Has no effect while `showUnavailableUnits` is off,
   * since nothing sold out is rendered.
   */
  enableWaitlist?: boolean;
  /** Toggle: show "Call" CTA on units flagged as call-only. Default false. */
  callOnLimitedAvailability?: boolean;
  /** Text for the primary CTA button. Default 'Select'. */
  ctaButtonCopy?: string;

  /** Select opens the #14 value-tiers modal via tierBus. Default false. */
  enableValueTiers?: boolean;
  valueTiersChannel?: string;
  valueTiersPageUrl?: string;
  /**
   * Where Select goes when no value-tiers step is configured. Default
   * '/rental'. The chosen unit rides in localStorage, not the URL — see
   * @shared/unitHandoff.
   */
  rentalPageUrl?: string;

  // ── Editable accordion copy (Duda text inputs) ─────────────────────────────
  /** Heading of the "About" accordion. Default 'About Storage Units in Irvine'. */
  aboutTitle?: string;
  /** Body copy of the "About" accordion. Blank → the section renders nothing. */
  aboutContent?: string;
  /** Body copy of the "Notes" accordion. Blank → falls back to the demo note. */
  notesContent?: string;
  /**
   * Duda collection the "Storage Blogs" accordion reads (case-sensitive).
   * Default 'BlogPosts' — the same collection widget #12 reads.
   */
  blogCollection?: string;
  /** Path the blog post slugs hang off, e.g. "/blog". Default '/blog'. */
  blogBasePath?: string;
  /**
   * Duda collection holding the Feature Highlights copy (case-sensitive).
   * Default 'featurePage'. Three columns — `name` (matched against the
   * property's filter-bar amenity), `description` (under the <h1>) and
   * `content` (rich text, under the listing). See featurePageSource.ts.
   */
  featureCollection?: string;
  /**
   * Mobile: pin the filter bar to the top of the page once it scrolls out of
   * view. It shares one fixed stack with #03's contact row and sits below it —
   * see @shared/stickyStack. Default true.
   */
  stickyFilterBar?: boolean;
  /**
   * Height of the theme's own fixed header, so the stack clears it. Must match
   * the value given to #03 or the two bars will disagree. Default 0.
   */
  stickyOffsetTop?: number;

  // ── AP section visibility toggles ──────────────────────────────────────────
  // Vestigial: SectionAccordion treats every registered section as a candidate
  // and visibility is owned by the "Manage accordions" modal. Kept because the
  // Duda JS tab still passes them and AccordionSectionMeta.enabledBy types
  // against these keys.
  isReviews?:   boolean;
  isFeatures?:  boolean;
  isFeatureHighlights?: boolean;
  isNearby?:    boolean;
  isSizeGuide?: boolean;
  isBlog?:      boolean;
  isLocalBlog?: boolean;
  isStore?:     boolean;
  isNotes?:     boolean;
  isFAQ?:       boolean;
  isHours?:     boolean;
  isAbout?:     boolean;
}

