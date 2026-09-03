import React, { useEffect, useState } from 'react';
import { usePropertyId } from '../propertyContext';
import { useCompanyId } from '../companyContext';
import { fetchProperties, extractNearbyProperties } from '@shared/nearbyProperties';
import { resolveCompanyIdFromSources } from '@shared/companySource';
import cfg from '../config.json';
import { ReviewsSection } from './sections/ReviewsSection';
import { NearbySection } from './sections/NearbySection';
import { SizeGuideSection } from './sections/SizeGuideSection';
import { BlogSection } from './sections/BlogSection';
import { LocalBlogSection } from './sections/LocalBlogSection';
import { FaqsSection } from './sections/FaqsSection';
import { StoreSection } from './sections/StoreSection';
import { NotesSection } from './sections/NotesSection';
import { AboutSection } from './sections/AboutSection';
import { FeaturesSection } from './sections/FeaturesSection';
import { FeatureHighlightsSection } from './sections/FeatureHighlightsSection';
import { CHEVRON_PATH } from './chevron';
import {
  ACCORDION_SECTIONS,
  resolveVisibleOrder,
  type AccordionConfig,
  type AccordionKey,
} from '../accordionSections';
import type { PropertyExtras } from '../propertyApi';
import type { FeatureHighlight } from '../featureHighlights';

// ── Icons ──────────────────────────────────────────────────────────────────────
// Real icons from Figma (Mariposa accordion set, node 9417-86779). Stroke-style,
// drawn with currentColor so they inherit the .sl-sa-icon / .sl-sa-chevron colour.

function IconInfo() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 11.9999V15.9999M12 8.6249V8.62378M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" />
    </svg>
  );
}

function IconBuilding() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 6H16M14 10H16M14 14H16M8 6H10M8 10H10M8 14H10M16 22V19.6C16 19.0399 16 18.7599 15.891 18.546C15.7951 18.3578 15.6422 18.2049 15.454 18.109C15.2401 18 14.9601 18 14.4 18H9.6C9.03995 18 8.75992 18 8.54601 18.109C8.35785 18.2049 8.20487 18.3578 8.10899 18.546C8 18.7599 8 19.0399 8 19.6V22M16 22H17.4C17.9601 22 18.2401 22 18.454 21.891C18.6422 21.7951 18.7951 21.6422 18.891 21.454C19 21.2401 19 20.9601 19 20.4V5.2C19 4.0799 19 3.51984 18.782 3.09202C18.5903 2.71569 18.2843 2.40973 17.908 2.21799C17.4802 2 16.9201 2 15.8 2H8.2C7.0799 2 6.51984 2 6.09202 2.21799C5.71569 2.40973 5.40973 2.71569 5.21799 3.09202C5 3.51984 5 4.0799 5 5.2V20.4C5 20.9601 5 21.2401 5.10899 21.454C5.20487 21.6422 5.35785 21.7951 5.54601 21.891C5.75992 22 6.03995 22 6.6 22H8M16 22H8" />
    </svg>
  );
}

function IconReview() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16.2 3H7.8C6.11984 3 5.27976 3 4.63803 3.32698C4.07354 3.6146 3.6146 4.07354 3.32698 4.63803C3 5.27976 3 6.11984 3 7.8V12.2C3 13.8802 3 14.7202 3.32698 15.362C3.6146 15.9265 4.07354 16.3854 4.63803 16.673C5.27976 17 6.11984 17 7.8 17H8V21L13 17H16.2C17.8802 17 18.7202 17 19.362 16.673C19.9265 16.3854 20.3854 15.9265 20.673 15.362C21 14.7202 21 13.8802 21 12.2V7.8C21 6.11984 21 5.27976 20.673 4.63803C20.3854 4.07354 19.9265 3.6146 19.362 3.32698C18.7202 3 17.8802 3 16.2 3Z" />
      <path d="M9.0258 12.2118C9.03341 11.9795 9.03721 11.8633 9.06595 11.7542C9.09143 11.6575 9.13129 11.5651 9.18418 11.4804C9.24382 11.3847 9.32568 11.3025 9.48939 11.1381L13.4359 7.17476C13.6331 6.97678 13.9407 6.9431 14.1757 7.09378C14.4595 7.27574 14.7015 7.51618 14.8858 7.79917L14.8987 7.81897C15.0597 8.06623 15.026 8.39297 14.818 8.60187L10.9081 12.5284C10.7382 12.699 10.6533 12.7843 10.5542 12.8455C10.4664 12.8998 10.3707 12.94 10.2705 12.9647C10.1575 12.9924 10.0374 12.9932 9.79717 12.9948L9 13L9.0258 12.2118Z" strokeWidth="1" />
    </svg>
  );
}

function IconQuestion() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.28149 9.71853C9.28149 8.21713 10.4986 7 12 7C13.5014 7 14.7186 8.21713 14.7186 9.71853C14.7186 10.6748 14.2248 11.5157 13.4784 12.0003C12.7544 12.4704 12 13.1368 12 14M12 17H12.001M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" />
    </svg>
  );
}

function IconFile() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 11C20 9.34315 18.6569 8 17 8L16.4 8C16.0284 8 15.8426 8 15.6871 7.97538C14.8313 7.83983 14.1602 7.16865 14.0246 6.31287C14 6.1574 14 5.9716 14 5.6V5C14 3.34315 12.6569 2 11 2M8 13H16M8 17H13M20 10V18C20 20.2091 18.2091 22 16 22H8C5.79086 22 4 20.2091 4 18V6C4 3.79086 5.79086 2 8 2H12C16.4183 2 20 5.58172 20 10Z" />
    </svg>
  );
}

function IconPin() {
  // "Local Blogs" — the document icon above with a place marker instead, so the
  // two blog sections read as related but not interchangeable.
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21C12 21 19 15.5 19 10.2C19 6.22355 15.866 3 12 3C8.13401 3 5 6.22355 5 10.2C5 15.5 12 21 12 21Z" />
      <path d="M14.5 10C14.5 11.3807 13.3807 12.5 12 12.5C10.6193 12.5 9.5 11.3807 9.5 10C9.5 8.61929 10.6193 7.5 12 7.5C13.3807 7.5 14.5 8.61929 14.5 10Z" />
    </svg>
  );
}

function IconScale() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.22213 12.707L7.75767 16.2425M9.87948 7.05L13.415 10.5855M12.7077 4.22163L14.829 6.34295M7.05033 9.87861L9.17165 11.9999M3.65648 17.7981L6.20207 20.3437C6.9941 21.1357 7.39012 21.5318 7.84678 21.6801C8.24846 21.8107 8.68116 21.8107 9.08284 21.6801C9.5395 21.5318 9.93552 21.1357 10.7276 20.3437L20.3442 10.7271C21.1362 9.93503 21.5323 9.53901 21.6806 9.08236C21.8111 8.68067 21.8111 8.24797 21.6806 7.84629C21.5323 7.38963 21.1362 6.99361 20.3442 6.20158L17.7986 3.65599C17.0066 2.86396 16.6106 2.46794 16.1539 2.31957C15.7522 2.18905 15.3195 2.18905 14.9178 2.31957C14.4612 2.46794 14.0652 2.86396 13.2731 3.65599L3.65648 13.2726C2.86445 14.0647 2.46843 14.4607 2.32005 14.9174C2.18954 15.319 2.18954 15.7517 2.32005 16.1534C2.46843 16.6101 2.86445 17.0061 3.65648 17.7981Z" />
    </svg>
  );
}

function IconFeatures() {
  // Pika star (Figma 6513:146326) — "Features & Amenities".
  return (
    <svg width="24" height="24" viewBox="0 0 20.7191 19.9999" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" preserveAspectRatio="xMidYMid meet">
      <path d="M7.50861 4.24743C8.35062 2.48286 8.77163 1.60057 9.32106 1.28045C9.96288 0.906515 10.7562 0.906515 11.398 1.28045C11.9474 1.60057 12.3684 2.48286 13.2105 4.24743C13.4599 4.77026 13.5847 5.03167 13.7632 5.23964C13.9729 5.48393 14.2369 5.67574 14.5341 5.79971C14.7871 5.90525 15.0742 5.9431 15.6486 6.01881C17.587 6.27433 18.5562 6.40209 19.0304 6.82571C19.5844 7.32056 19.8295 8.07504 19.6722 8.801C19.5375 9.42246 18.8285 10.0955 17.4105 11.4416C16.9904 11.8404 16.7803 12.0398 16.6377 12.2739C16.4702 12.5489 16.3693 12.8592 16.3432 13.1801C16.321 13.4533 16.3738 13.7381 16.4792 14.3077C16.8352 16.2302 17.0132 17.1915 16.7569 17.7734C16.4574 18.4532 15.8156 18.9195 15.0766 18.9942C14.4439 19.0582 13.5848 18.5918 11.8664 17.6592C11.3572 17.3829 11.1026 17.2447 10.836 17.1814C10.5227 17.107 10.1964 17.107 9.88311 17.1814C9.61642 17.2447 9.36185 17.3829 8.85271 17.6592C7.13431 18.5918 6.27512 19.0582 5.64246 18.9942C4.90342 18.9195 4.26162 18.4532 3.96218 17.7734C3.70583 17.1915 3.88383 16.2302 4.23982 14.3077C4.34529 13.7381 4.39803 13.4533 4.37582 13.1801C4.34974 12.8592 4.2489 12.5489 4.08138 12.2739C3.93876 12.0398 3.72869 11.8404 3.30854 11.4416C1.89053 10.0955 1.18153 9.42246 1.04686 8.801C0.889558 8.07504 1.1347 7.32056 1.68867 6.82571C2.1629 6.40209 3.13211 6.27433 5.07051 6.01881C5.64484 5.9431 5.93201 5.90525 6.18497 5.79971C6.48212 5.67574 6.74612 5.48393 6.95584 5.23964C7.13439 5.03167 7.25913 4.77026 7.50861 4.24743Z" />
    </svg>
  );
}

function IconNote() {
  // Pika note/note-default (Figma 10199:55934) — "Notes".
  return (
    <svg width="24" height="24" viewBox="0 0 20 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" preserveAspectRatio="xMidYMid meet">
      <path d="M5 9H15M5 13H12M1.00169 5C1.00979 3.83507 1.05658 3.16873 1.32698 2.63803C1.6146 2.07354 2.07354 1.6146 2.63803 1.32698C3.27976 1 4.11984 1 5.8 1H14.2C15.8802 1 16.7202 1 17.362 1.32698C17.9265 1.6146 18.3854 2.07354 18.673 2.63803C18.9434 3.16873 18.9902 3.83507 18.9983 5C19 5.24373 19 5.50929 19 5.8V12.2C19 13.8802 19 14.7202 18.673 15.362C18.3854 15.9265 17.9265 16.3854 17.362 16.673C16.7202 17 15.8802 17 14.2 17H5.8C4.11984 17 3.27976 17 2.63803 16.673C2.07354 16.3854 1.6146 15.9265 1.32698 15.362C1 14.7202 1 13.8802 1 12.2V5.8C1 5.50929 1 5.24373 1.00169 5ZM18.9983 5H1.00169" />
    </svg>
  );
}

function IconReorder() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
      <polyline points="6 3 9 6 6 9" transform="translate(-3 0)" />
    </svg>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface AccordionVisual {
  icon: React.ReactNode;
  /** A number, or 'loading' for the placeholder circle. */
  badge?: number | 'loading';
  content: React.ReactNode;
}

/** Per-key icon + content. Labels + default order live in accordionSections.ts. */
const VISUALS: Record<AccordionKey, AccordionVisual> = {
  store:     { icon: <IconInfo />,     content: <StoreSection /> },
  features:  { icon: <IconFeatures />, content: <FeaturesSection /> },
  // Same star as `features`: the Figma's "Feature Highlights" (9321:25263) and
  // "Features & Amenities" (6513:146326) icons are the same vector. Content is
  // always supplied by the special case below (it needs the page's callbacks).
  highlights: { icon: <IconFeatures />, content: null },
  // No `badge` here on purpose: NearbySection reports its own count through
  // useReportSectionCount, because only it knows how many the API returned.
  // This said `badge: 5` — a literal that never moved while the carousel under
  // it paged through however many actually came back.
  nearby:    { icon: <IconBuilding />, content: <NearbySection /> },
  reviews:   { icon: <IconReview />,   content: <ReviewsSection /> },
  faq:       { icon: <IconQuestion />, content: <FaqsSection /> },
  blog:      { icon: <IconFile />,     content: <BlogSection /> },
  localblog: { icon: <IconPin />,      content: <LocalBlogSection /> },
  sizeguide: { icon: <IconScale />,    content: <SizeGuideSection /> },
  notes:     { icon: <IconNote />,     content: <NotesSection /> },
  about:     { icon: <IconInfo />,     content: <AboutSection /> },
};

const LABELS: Record<AccordionKey, string> = Object.fromEntries(
  ACCORDION_SECTIONS.map((s) => [s.key, s.label]),
) as Record<AccordionKey, string>;

interface AccordionItemDef {
  key: AccordionKey;
  label: string;
  icon: React.ReactNode;
  /** A number, or 'loading' for the placeholder circle. */
  badge?: number | 'loading';
  content: React.ReactNode;
}

export interface SectionAccordionProps {
  /** Per-instance arrangement (order + hidden). Null = default order, none hidden. */
  config?: AccordionConfig | null;
  /** Editor-only: when true, render the floating "Manage accordions" button. */
  inEditor?: boolean;
  /** Opens the manage-accordions modal (owned by SpaceList). */
  onReorderClick?: () => void;
  /** Show video thumbnails inside the Size Guide section. Default true. */
  showSizeGuideVideos?: boolean;
  /** Property FAQ / phone / socials from the second API call. Null = use demo data. */
  propertyExtras?: PropertyExtras | null;
  /** Heading for the About section; blank uses the registry label. */
  aboutTitle?: string;
  /** Body copy for the About section. */
  aboutContent?: string;
  /** Body copy for the Notes section. */
  notesContent?: string;
  /** Duda collection the Storage Blogs section reads. Default 'BlogPosts'. */
  blogCollection?: string;
  /** Path the blog post slugs hang off, e.g. "/blog". */
  blogBasePath?: string;
  /** Rows for the Feature Highlights section. Empty hides the section. */
  featureHighlights?: FeatureHighlight[];
  /** Slug of the feature the page is locked to, so the row can show as active. */
  activeFeatureSlug?: string | null;
  /** Select (or, with null, clear) the feature the page is locked to. */
  onSelectFeature?: (slug: string | null) => void;
}

// ── Single accordion row ──────────────────────────────────────────────────────

function AccordionRow({ item, open, onToggle }: { item: AccordionItemDef; open: boolean; onToggle: () => void }) {
  return (
    <div className={`sl-sa-item${open ? ' open' : ''}`}>
      <button className="sl-sa-header" onClick={onToggle}>
        <div className="sl-sa-header-left">
          <span className="sl-sa-icon">{item.icon}</span>
          <span className="sl-sa-title">{item.label}</span>
          {item.badge === 'loading'
            ? <span className="sl-sa-badge sl-sa-badge--loading" aria-hidden="true" />
            : item.badge !== undefined && (
              <span className="sl-sa-badge">{item.badge}</span>
            )}
        </div>
        <svg className="sl-sa-chevron" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d={CHEVRON_PATH} />
        </svg>
      </button>
      {open && <div className="sl-sa-body">{item.content}</div>}
    </div>
  );
}

/** Mirrors MAX_NEARBY in NearbySection — the badge must not promise more
 *  cards than that section will draw. Change both together. */
const NEARBY_BADGE_MAX = 6;

// ── Main component ────────────────────────────────────────────────────────────

export function SectionAccordion({
  config      = null,
  inEditor    = false,
  onReorderClick,
  showSizeGuideVideos = true,
  propertyExtras = null,
  aboutTitle,
  aboutContent,
  notesContent,
  blogCollection,
  blogBasePath,
  featureHighlights = [],
  activeFeatureSlug = null,
  onSelectFeature,
}: SectionAccordionProps) {
  // Only one section open at a time — opening one closes the currently-open one.
  const [openKey, setOpenKey] = useState<AccordionKey | null>(null);

  // Every section is a candidate; the "Manage accordions" modal controls which
  // are visible (config.hidden) and their order (config.order). No config →
  // all sections shown in default order.
  // Feature Highlights is the one section with nothing of its own to say: its
  // rows ARE the property's filter-bar amenities. With none there is no empty
  // state worth a header, so drop the whole row (header included) rather than
  // offering an accordion that opens onto nothing.
  /**
   * The Nearby Storage badge, counted HERE rather than inside the section.
   *
   * Closed sections are not mounted — `{open && ...}` below — so the section
   * cannot report its own count until somebody expands it, and the badge is
   * meant to be readable before that. Mounting it eagerly is not an option
   * either: its data path calls getUserLocation(), which puts a browser
   * permission prompt on page load.
   *
   * Geolocation only decides the ORDER of the list, never its length, so the
   * count needs none of it: every other property the company has, capped the
   * same way the section caps it. The properties read is promise-cached, so
   * this shares the one the page already makes.
   */
  const currentPropertyId = usePropertyId();
  const boundCompanyId = useCompanyId();
  const [nearbyCount, setNearbyCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // Same company the section itself uses, so the badge cannot count one
        // tenant's properties above a list showing another's. Falls back to the
        // shared resolver only when the provider is still empty.
        const company = boundCompanyId
          || await resolveCompanyIdFromSources('#05 nearby badge', {}, cfg.companyId);
        const creds = { ...cfg, companyId: company };
        const all = extractNearbyProperties(await fetchProperties(creds, {}), cfg.appId);
        const others = all.filter((p) => p.id !== currentPropertyId).length;
        if (!cancelled) setNearbyCount(Math.min(others, NEARBY_BADGE_MAX));
      } catch (err) {
        console.error('[SpaceList] nearby badge count failed:', err);
      }
    })();
    return () => { cancelled = true; };
    // Re-count when the company lands — the provider starts '' and resolves a
    // tick later, so the first pass would otherwise fix the wrong tenant's count.
  }, [currentPropertyId, boundCompanyId]);

  const allKeys = ACCORDION_SECTIONS.map((s) => s.key).filter(
    (k) => k !== 'highlights' || featureHighlights.length > 0,
  );

  const items: AccordionItemDef[] = resolveVisibleOrder(allKeys, config).map((key) => ({
    key,
    // The About heading is editor-editable; everything else uses the registry label.
    label: key === 'about' ? (aboutTitle?.trim() || LABELS.about) : LABELS[key],
    icon: VISUALS[key].icon,
    // A reported count wins; the map's literal is the fallback for sections
    // that do not report one.
    badge: key === 'nearby' ? (nearbyCount ?? 'loading') : VISUALS[key].badge,
    // A few sections take live API data or editor copy; the rest are static.
    content:
      key === 'sizeguide' ? <SizeGuideSection showVideos={showSizeGuideVideos} />
      : key === 'store'   ? <StoreSection phones={propertyExtras?.phones} socials={propertyExtras?.socials} hours={propertyExtras?.hours} schedule={propertyExtras?.schedule} scheduleSections={propertyExtras?.scheduleSections} facilityName={propertyExtras?.name} facilityAddress={propertyExtras?.address} />
      : key === 'faq'     ? <FaqsSection faqs={propertyExtras?.faqs} />
      : key === 'features' ? <FeaturesSection amenities={propertyExtras?.amenities} />
      : key === 'highlights' ? <FeatureHighlightsSection features={featureHighlights} activeSlug={activeFeatureSlug} onSelect={onSelectFeature ?? (() => {})} />
      : key === 'blog'    ? <BlogSection collection={blogCollection} blogBasePath={blogBasePath} />
      : key === 'localblog' ? <LocalBlogSection collection={blogCollection} blogBasePath={blogBasePath} />
      : key === 'notes'   ? <NotesSection content={notesContent} />
      : key === 'about'   ? <AboutSection content={aboutContent} />
      : VISUALS[key].content,
  }));

  // Nothing visible and not in the editor → render nothing. In the editor we
  // still render the panel (even if every section is hidden) so the Manage
  // button stays reachable to un-hide sections.
  if (items.length === 0 && !inEditor) return null;

  return (
    <aside className="sl-sa-panel">
      {items.map((item) => (
        <AccordionRow
          key={item.key}
          item={item}
          open={openKey === item.key}
          onToggle={() => setOpenKey((prev) => (prev === item.key ? null : item.key))}
        />
      ))}
      {inEditor && (
        <button className="sl-sa-reorder-btn" onClick={onReorderClick} type="button">
          <IconReorder />
          <span>Manage accordions</span>
        </button>
      )}
    </aside>
  );
}
