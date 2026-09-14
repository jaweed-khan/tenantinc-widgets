// ===========================================================================
// Gallery photos for a property, from the `PropertiesInternal` collection.
//
// SEPARATE FROM `Properties` ON PURPOSE. The keyed REST API declares an
// `Images` field but never populated it, so #03's gallery has always fallen
// back to gradient placeholders. The photos live in a second, internal
// collection instead, keyed by the same property id.
//
// Read-only, fails soft to [] everywhere: no dmAPI (the Duda editor and the dev
// harness), collection missing, row missing, column empty. The gallery keeps
// its placeholders in every one of those cases rather than rendering blank.
// ===========================================================================

import { readCollection, str, imageUrl } from './dudaCollections';

/**
 * One read per collection per page.
 *
 * Three widgets now want these photos — #03's gallery, the nearby lists and the
 * rental rail — and they can share a page. The PROMISE is cached, not the rows,
 * so simultaneous callers join the in-flight request instead of each firing
 * their own. Page-lifetime only; a reload picks up collection edits.
 */
const readCache = new Map<string, Promise<Awaited<ReturnType<typeof readCollection>>>>();

function readOnce(collectionName: string) {
  const hit = readCache.get(collectionName);
  if (hit) return hit;
  const p = readCollection(collectionName);
  readCache.set(collectionName, p);
  return p;
}

/** Collection holding the gallery photos. Name is the lookup key, and it is
 *  case-sensitive — see readCollection. */
export const PROPERTY_IMAGES_COLLECTION = 'PropertiesInternal';

/** Column holding the gallery photos. Duda's UI labels it "images". */
const IMAGES_FIELD = 'images';

/**
 * Column holding the single lead photo, labelled "heroimage".
 *
 * It is the property's face: first slide in #03's gallery, the card photo in
 * the nearby lists, and the photo on the rental order rail. Kept separate from
 * `images` so the operator picks it deliberately rather than it being whichever
 * photo happens to be first in the gallery.
 */
const HERO_FIELD = 'heroimage';

/**
 * Column holding the gallery VIDEO, labelled "video" — a Duda video field.
 *
 * Its value is used AS STORED, not rewritten. What the column currently holds
 * is malformed — Duda has concatenated its embed prefix with the page URL,
 * leaving the real id stranded on the end:
 *
 *   https://www.youtube.com/embed/https://mariposa…/storage-units/YyAuFiIv-V4
 *
 * That 303s instead of playing. The collection is being corrected at source,
 * so this deliberately does NOT try to repair it: a parser that rebuilt the
 * URL would keep working once the data is fixed and hide the fact that it ever
 * was not. The poster image is derived separately and degrades on its own.
 */
const VIDEO_FIELD = 'video';

/**
 * Coerce whatever the column hands back into a list of URLs.
 *
 * The shape depends on how the collection was built and cannot be assumed:
 *
 *  - EXTERNAL collection  → a real array, of strings or of `{url}`-ish objects
 *  - NATIVE collection    → one string; either JSON, or several URLs separated
 *                           by newlines/commas/pipes, possibly wrapped in
 *                           `<p class="rteBlock">` by the WYSIWYG
 *  - a single image column → one string or one object
 *
 * Accepting all of them costs a few lines and removes an entire category of
 * "works on my site, blank on theirs". Order is preserved — the first image is
 * the hero — and blanks and duplicates are dropped.
 */
export function toImageList(value: unknown): string[] {
  const out: string[] = [];

  const push = (v: unknown) => {
    const url = imageUrl(v);
    if (url) out.push(url);
  };

  const fromString = (raw: string) => {
    const s = raw.trim();
    if (!s) return;
    // JSON first — a native collection can hold an array as text.
    if (s[0] === '[' || s[0] === '{') {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) { parsed.forEach(push); return; }
        push(parsed);
        return;
      } catch { /* not JSON after all — fall through to splitting */ }
    }
    // Split on newlines, commas and pipes. NOT on spaces: a signed Duda/CDN URL
    // can legitimately contain encoded characters, and a bare space in a URL is
    // far rarer than a filename with one.
    const parts = s.split(/[\n\r|,]+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) { parts.forEach(push); return; }
    push(s);
  };

  if (Array.isArray(value)) value.forEach((v) => (typeof v === 'string' ? fromString(v) : push(v)));
  else if (typeof value === 'string') fromString(value);
  else if (value != null) push(value);

  // De-dupe while keeping order — a repeated hero would show as a dead slide.
  return [...new Set(out)];
}

/**
 * Gallery photos for one property id, or [] when there are none.
 *
 * Matches on the `id` column, the same key `Properties` uses, so a dynamic page
 * that already knows its property id needs nothing new bound. `slug` is accepted
 * as a fallback for a collection keyed that way instead.
 */
export async function fetchPropertyImages(
  propertyId: string,
  opts: { collectionName?: string; slug?: string } = {},
): Promise<string[]> {
  return (await fetchPropertyMedia(propertyId, opts)).images;
}

/** A property's gallery: photos, and any video that follows them. */
export interface PropertyMedia {
  images: string[];
  /** Empty when the column is absent or blank — the common case. */
  videos: string[];
}

/**
 * Photos AND video for one property, in a single pass over the collection.
 *
 * One function rather than two so the row is matched once and the two lists
 * cannot disagree about which property they belong to. `fetchPropertyImages`
 * is kept as the photos-only view because #05, #07 and the rental rail want
 * exactly that and should not have to know a video column exists.
 *
 * Matches on the `id` column, the same key `Properties` uses, so a dynamic page
 * that already knows its property id needs nothing new bound. `slug` is accepted
 * as a fallback for a collection keyed that way instead.
 */
export async function fetchPropertyMedia(
  propertyId: string,
  opts: { collectionName?: string; slug?: string } = {},
): Promise<PropertyMedia> {
  const empty: PropertyMedia = { images: [], videos: [] };
  const id = str(propertyId).trim();
  const slug = str(opts.slug).trim();
  if (!id && !slug) return empty;

  const rows = await readOnce(opts.collectionName ?? PROPERTY_IMAGES_COLLECTION);
  if (!rows.length) return empty;

  const row = rows.find((r) => (id && str(r.id) === id))
    ?? (slug ? rows.find((r) => str(r.slug) === slug) : undefined);
  if (!row) return empty;

  return {
    // Hero first — it is the lead photo, so it must be slide one. Any duplicate
    // of it inside `images` is dropped by toImageList's de-dupe.
    images: toImageList([row[HERO_FIELD], ...toImageList(row[IMAGES_FIELD])]),
    /*
     * The same coercion as the photos: the column can hand back an array, a
     * JSON string, a separated list or a single `{url}`-ish object depending on
     * how the collection was built, and a video URL is no different from an
     * image URL to that parser. Empty column ⇒ [] ⇒ nothing is appended.
     */
    videos: toImageList(row[VIDEO_FIELD]),
  };
}

/**
 * Hero photo per property id, for the whole collection, in ONE read.
 *
 * The nearby lists render several properties at once; asking per card would be
 * N reads of the same collection. Returns an empty Map when there is nothing to
 * read, so every caller can treat "no hero" as the normal case.
 */
export async function fetchPropertyHeroImages(
  collectionName: string = PROPERTY_IMAGES_COLLECTION,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const rows = await readOnce(collectionName);
  for (const row of rows) {
    const id = str(row.id).trim();
    if (!id) continue;
    // Fall back to the first gallery photo: a property with photos but no hero
    // chosen should still show a picture rather than a placeholder.
    const hero = imageUrl(row[HERO_FIELD]) || toImageList(row[IMAGES_FIELD])[0] || '';
    if (hero) out.set(id, hero);
  }
  return out;
}

/** One property's hero photo, or '' when it has none. */
export async function fetchPropertyHeroImage(
  propertyId: string,
  collectionName: string = PROPERTY_IMAGES_COLLECTION,
): Promise<string> {
  const id = str(propertyId).trim();
  if (!id) return '';
  return (await fetchPropertyHeroImages(collectionName)).get(id) ?? '';
}
