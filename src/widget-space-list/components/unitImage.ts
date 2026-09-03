// ---------------------------------------------------------------------------
// One image, four steps down, used by every card that shows a space.
//
//   1. mediaImages[0]   {Band}_{Amenity}.png  — Small_Driveup.png
//   2. mediaImages[1]   {Band}.png            — Small.png
//   3. unit.image       the bundled render for this dimension / size band
//   4. defaultImg       the generic placeholder
//
// Step 3 is the reason this exists. The cards already fell back on error, but
// straight to the GENERIC default — so pointing `src` at a Media Manager url
// would have dropped a 10x20 card from its own 10x20 render to a plain
// placeholder every time the operator had not uploaded Large.png. Worse than
// doing nothing, and it would only show on sites that had started using it.
//
// Walking the list IS the existence check. There is no way to know in advance
// which files an operator uploaded: a missing one answers 403 from Duda's CDN
// (not 404), and only a real request reveals it. `error` fires either way.
//
// The cost is one failed request per missing step, once, then cached by the
// browser. That is why the list is kept to two entries.
// ---------------------------------------------------------------------------
import type { Unit } from '../types';

type ImageUnit = Pick<Unit, 'image' | 'mediaImages'>;

/** The full chain for a unit, most specific first, with no blanks. */
function chain(unit: ImageUnit, fallback: string): string[] {
  return [...(unit.mediaImages ?? []), unit.image, fallback].filter(Boolean);
}

/** What to request first. */
export function unitImageSrc(unit: ImageUnit, fallback: string): string {
  return chain(unit, fallback)[0] ?? fallback;
}

/**
 * Step to the next candidate whenever one fails.
 *
 * Position is read from the element's CURRENT src rather than kept in state,
 * so the handler stays pure and a re-render cannot rewind it. Comparing the
 * resolved `el.src` against each candidate needs `endsWith`, because the
 * browser reports an absolute URL while a bundled import may be a relative one.
 *
 * Stops at the last entry: without that, a browser that also fails the generic
 * placeholder would re-fire `error` on the same src forever.
 */
export function unitImageOnError(
  unit: ImageUnit,
  fallback: string,
): (e: { currentTarget: HTMLImageElement }) => void {
  return (e) => {
    const el = e.currentTarget;
    const list = chain(unit, fallback);
    const i = list.findIndex((c) => el.src === c || el.src.endsWith(c));
    const next = list[(i < 0 ? 0 : i) + 1];
    if (next && el.src !== next) el.src = next;
  };
}
