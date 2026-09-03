// ---------------------------------------------------------------------------
// DEMO card imagery for the Space List.
//
// The API does not yet return an image (nor an image-type key) per unit, so we
// DERIVE a card image from the fields it does return: dimensions, size and type.
//   • exact dimension match (5x10 / 10x10 / 10x15 / 10x20 / 10x30) → that render
//   • otherwise the nearest render by size category
//   • parking → covered vs. open space
// When the backend adds an image/type field to the unit, replace the body of
// spaceImageFor() with a direct lookup on it — nothing else needs to change.
// ---------------------------------------------------------------------------
import type { SpaceType, UnitSize } from './types';

import locker from './assets/spaces/locker.jpg';
import s5x10 from './assets/spaces/5x10.jpg';
import s10x10 from './assets/spaces/10x10.jpg';
import s10x15 from './assets/spaces/10x15.jpg';
import s10x20 from './assets/spaces/10x20.jpg';
import s10x30 from './assets/spaces/10x30.jpg';
import parkingCovered from './assets/spaces/parking-covered.jpg';
import parkingOpen from './assets/spaces/parking.jpg';

const BY_DIMS: Record<string, string> = {
  '5x10': s5x10,
  '10x10': s10x10,
  '10x15': s10x15,
  '10x20': s10x20,
  '10x30': s10x30,
};

const BY_SIZE: Record<UnitSize, string> = {
  other: locker,
  extra_small: locker,
  small: locker,
  medium: s10x10,
  large: s10x20,
  extra_large: s10x30,
};

/** "10' x 20'" → "10x20" (grabs the first two numbers, ignores quotes/spacing). */
function normalizeDims(dimensions: string): string {
  const m = dimensions.match(/(\d+)\D+(\d+)/);
  return m ? `${m[1]}x${m[2]}` : '';
}

export function spaceImageFor(unit: {
  type: SpaceType;
  dimensions: string;
  size: UnitSize;
  subtype?: string;
}): string {
  if (unit.type === 'parking') {
    // "Covered" / "Enclosed" parking → the covered render; "Outdoor" etc. → open.
    return /cover|enclos/i.test(unit.subtype ?? '') ? parkingCovered : parkingOpen;
  }
  return BY_DIMS[normalizeDims(unit.dimensions)] ?? BY_SIZE[unit.size] ?? s10x10;
}

// ---------------------------------------------------------------------------
// Operator artwork from the site's Duda Media Manager.
//
// An uploaded file is served from Duda's CDN at a path built only from the
// SITE ID and the filename (verified live 2026-09-01):
//
//   https://irp.cdn-website.com/{siteId}/dms3rep/multi/Small.png
//
// The Media Manager FOLDER does not appear in that path — a file dropped into
// a "spaces" folder is served flat from dms3rep/multi/ like every other. So
// there is nothing to look up and no proxy to build: the folder is an
// organising device in Duda's UI, and the only question that matters is
// whether the FILE resolves, which the browser answers by itself.
//
// `siteId` arrives as a Duda prop (data.siteId) and is populated in the editor
// as well as on a published page — it is what already keys the saved accordion
// config. That is why this works where anything built on `window.dmAPI` could
// not: dmAPI is published-site only.
//
// Returns undefined rather than a guess when there is no site id, so the card
// keeps its bundled render instead of requesting a URL that cannot exist.
// ---------------------------------------------------------------------------

const DUDA_CDN = 'https://irp.cdn-website.com';

/**
 * Band → filename stem.
 *
 * `XSmall` / `XLarge`, NOT `ExtraSmall` / `ExtraLarge`. This is the operator's
 * convention, confirmed against the live CDN 2026-09-01: XSmall.png and
 * XLarge.png return 200, the Extra* spellings 403. Guessing the long form
 * would have meant every extra-small and extra-large card silently skipping
 * artwork that was sitting there.
 *
 * No spaces, since a filename with one needs percent-encoding and is easy to
 * get subtly wrong (a double space, a non-breaking space).
 *
 * `other` is absent on purpose — the bucket for a tier whose dimensions did not
 * parse, so there is no meaningful picture to ask for.
 */
const MEDIA_FILE_STEM: Partial<Record<UnitSize, string>> = {
  extra_small: 'XSmall',
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
  extra_large: 'XLarge',
};

/**
 * The operator's own image for a size band, or undefined.
 *
 * `.png` only. Trying `.jpg` as well would double the failed requests on every
 * site that has uploaded nothing, to catch a case an operator can fix by
 * renaming one file.
 *
 * `baseUrl` overrides the derived CDN root — a different region, images hosted
 * elsewhere, or the dev harness pointing at a real site.
 */
/**
 * Amenity label -> the token used in a filename.
 *
 * A MAP RATHER THAN A RULE, because the names operators actually use are not
 * derivable from the API labels: "Drive-Up Access" is filed as Driveup, and
 * "Climate Control" as Climate_Controlled — one drops a word and a hyphen, the
 * other gains a suffix. No single transform produces both.
 *
 * Keys are lower-cased and stripped of punctuation before lookup, so
 * "Drive-Up Access", "drive up access" and "DriveUp  Access" all land on the
 * same entry. Anything unlisted falls through to amenitySlug() below, which is
 * predictable and needs no code change — the map exists only to honour names
 * already chosen for the common ones.
 */
const AMENITY_FILE_TOKEN: Record<string, string> = {
  driveupaccess: 'Driveup',
  driveup: 'Driveup',
  climatecontrol: 'Climate_Controlled',
  climatecontrolled: 'Climate_Controlled',
  interioraccess: 'Interior_Access',
};

/** Lookup key: letters and digits only, lower-cased. */
const amenityKey = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * Fallback for an amenity with no alias: punctuation runs become single
 * underscores. "24 Hours access" -> "24_Hours_access". Left as the operator
 * capitalised it, since the filename has to match a real upload and guessing
 * at title case would be one more way to miss.
 */
function amenitySlug(label: string): string {
  return label.trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export function amenityFileToken(label?: string): string | undefined {
  const raw = (label ?? '').trim();
  if (!raw) return undefined;
  const alias = AMENITY_FILE_TOKEN[amenityKey(raw)];
  if (alias) return alias;
  // An amenity of only punctuation slugs to '', which is not a filename.
  return amenitySlug(raw) || undefined;
}
/**
 * Operator artwork for a size band, MOST specific first.
 *
 *   1. {Band}_{Amenity}.png   e.g. Small_Driveup.png
 *   2. {Band}.png             e.g. Small.png
 *
 * Returned as an ordered list rather than one url because the card walks it:
 * each entry is tried and the next is used when the browser reports the image
 * did not load. There is no way to know in advance which exists — a missing
 * file answers 403 from Duda's CDN, and only a real request reveals that.
 *
 * The amenity is the one ALREADY SHOWN as the card subtitle, so the picture
 * and the caption beside it can never disagree.
 *
 * `.png` only. Trying `.jpg` as well would double the failed requests on every
 * site that has uploaded nothing, to catch a case an operator fixes by
 * renaming one file.
 */
/**
 * Parking's fallback picture.
 *
 * Parking is NOT filed by size band. A bay is described by what fits in it, not
 * by how many square feet it is, so the operator's library is named for the
 * vehicles — Car.png, Car_RV.png, Car_RV_Boat.png, Covered_Car_RV.png and so
 * on. The broadest of those is the safe default: a bay that takes a boat also
 * takes a car, so the picture is never a promise the space cannot keep.
 */
const PARKING_DEFAULT_STEM = 'Car_RV_Boat';

export function mediaManagerImagesFor(
  size: UnitSize,
  opts: { siteId?: string; baseUrl?: string; amenity?: string; type?: SpaceType } = {},
): string[] {
  const parking = opts.type === 'parking';
  // Storage is filed by band; parking has no band of its own and falls back to
  // the broadest vehicle picture instead.
  const stem = parking ? PARKING_DEFAULT_STEM : MEDIA_FILE_STEM[size];
  if (!stem) return [];

  let root = (opts.baseUrl ?? '').trim().replace(/\/+$/, '');
  if (!root) {
    const id = (opts.siteId ?? '').trim();
    // 'dev-site' is the harness placeholder: a request against it can only
    // 403, so it is treated as no site at all.
    if (!id || id === 'dev-site') return [];
    root = `${DUDA_CDN}/${encodeURIComponent(id)}/dms3rep/multi`;
  }

  const token = amenityFileToken(opts.amenity);
  /*
   * Parking's specific file is the amenity ALONE — Covered_Car_RV.png, not
   * Car_RV_Boat_Covered_Car_RV.png. The names already say what the space is,
   * so prefixing the default would describe it twice and match nothing that
   * has been uploaded.
   */
  const names = token
    ? [parking ? token : `${stem}_${token}`, stem]
    : [stem];
  return names.map((n) => `${root}/${n}.png`);
}
