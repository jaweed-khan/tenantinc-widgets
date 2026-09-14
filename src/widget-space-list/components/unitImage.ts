// ---------------------------------------------------------------------------
// One image per space card, stepping down until something loads.
//
//   1. {siteId}/dms3rep/multi/{Stem}_{Amenity}.png   the site's own, by amenity
//   2. {siteId}/dms3rep/multi/{Stem}.png             the site's own, by band
//   3. duda-unit-images/{Stem}.png                   the shared S3 set, by band
//   (nothing)                                        no artwork ⇒ no <img>
//
// THERE IS NO FALLBACK RENDER. Running out of candidates hides the element
// rather than substituting a bundled picture: a generic placeholder on a card
// that is selling a specific space is worse than no picture, because it looks
// like the space's own photo and is not.
//
// Walking the list IS the existence check. There is no way to know in advance
// which files exist: a missing one answers 403 — from Duda's CDN and from
// CloudFront alike, not 404 — and only a real request reveals it. `error`
// fires either way.
//
// The cost is one failed request per missing step, once, then cached by the
// browser. That is why the list is short and the S3 tier contributes ONE url
// rather than an amenity variant known not to exist there.
// ---------------------------------------------------------------------------
import type { Unit } from '../types';

type ImageUnit = Pick<Unit, 'mediaImages'>;

/** The candidates for a unit, most specific first, with no blanks. */
function chain(unit: ImageUnit): string[] {
  return (unit.mediaImages ?? []).filter(Boolean);
}

/**
 * What to request first, or undefined when there is no artwork to try at all.
 *
 * Undefined is the caller's signal to render NO `<img>` — an empty `src` makes
 * the browser re-request the page itself, which is both a wasted round trip and
 * a spurious error.
 */
export function unitImageSrc(unit: ImageUnit): string | undefined {
  return chain(unit)[0];
}

/**
 * Step to the next candidate whenever one fails, and hide the image once they
 * are exhausted.
 *
 * Position is read from the element's CURRENT src rather than kept in state,
 * so the handler stays pure and a re-render cannot rewind it — state here
 * would let the chain oscillate between the same two candidates forever.
 *
 * Hiding is inline `display:none` rather than the `hidden` attribute, because
 * the card stylesheets set `display` on these images and a stylesheet rule
 * beats the attribute.
 */
export function unitImageOnError(
  unit: ImageUnit,
): (e: { currentTarget: HTMLImageElement }) => void {
  return (e) => {
    const el = e.currentTarget;
    const list = chain(unit);
    const i = list.findIndex((c) => el.src === c || el.src.endsWith(c));
    const next = list[(i < 0 ? 0 : i) + 1];
    if (next && el.src !== next) {
      el.src = next;
      return;
    }
    // Out of candidates: nothing here is a picture of this space.
    el.style.display = 'none';
  };
}
