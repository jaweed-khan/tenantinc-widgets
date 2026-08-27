// ===========================================================================
// Property contact details (name / address / phone / socials) from the Duda
// `Properties` collection — for widgets that need them but hold no API
// credentials of their own (#02 navigation bar, #13 footer).
//
// Collection ONLY, deliberately: unlike #03/#05/#07/#10 these widgets have no
// config.json and therefore no key to fall back to a REST call with. When the
// collection isn't available (Duda editor, dev harness, collection renamed) this
// returns null and the caller keeps its hardcoded values — which is the fallback.
//
// `Properties` is an EXTERNAL collection, so values arrive as parsed JSON:
// Address is an object, Phones/Emails/SocialMedia are arrays. No rich-text
// unwrapping needed here (see @shared/propertiesSource).
// ===========================================================================

import { readCollection, hasCollectionsApi, str, logSource, type CollectionRow } from './dudaCollections';
import { PROPERTIES_COLLECTION } from './propertiesSource';

/** The facility these widgets currently render for. Overridable per instance so
 *  a future per-page property only needs the prop threading, not a rewrite. */
export const DEFAULT_PROPERTY_ID = 'Y2wzzC8AYv';

export interface PropertyContact {
  id: string;
  name: string;
  /** "5281 California, Irvine, CA 92617" */
  address: string;
  /** Formatted primary phone, e.g. "(888) 888-8888". */
  phone: string;
  /** Raw digits for tel: links. */
  phoneDigits: string;
  /** Platform key (facebook/instagram/youtube/linkedin/x) → url. */
  socials: { platform: string; url: string }[];
  lat: number | null;
  lng: number | null;
}

/** "18888888888" → "(888) 888-8888"; leaves anything unrecognised alone. */
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (local.length !== 10) return raw;
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}

function mapRow(p: CollectionRow): PropertyContact {
  const addr = p.Address && typeof p.Address === 'object' ? (p.Address as Record<string, unknown>) : null;
  const address = addr
    ? [
        [str(addr.address), str(addr.address2)].filter(Boolean).join(' ').trim(),
        str(addr.city),
        `${str(addr.state)} ${str(addr.zip)}`.trim(),
      ].filter(Boolean).join(', ')
    : '';

  const phones = Array.isArray(p.Phones) ? (p.Phones as Record<string, unknown>[]) : [];
  const primary = phones.find((ph) => Number(ph.status) !== 0) ?? phones[0];
  const rawPhone = str(primary?.phone ?? primary?.number);

  const socialsRaw = Array.isArray(p.SocialMedia) ? (p.SocialMedia as Record<string, unknown>[]) : [];
  const socials = socialsRaw
    // The API says "twitter"; our icon key is "x".
    .map((s) => {
      const platform = str(s.type ?? s.platform).toLowerCase();
      return { platform: platform === 'twitter' ? 'x' : platform, url: str(s.url ?? s.link) };
    })
    .filter((s) => s.platform && s.url);

  const lat = addr && typeof addr.lat === 'number' ? addr.lat : null;
  const lng = addr && typeof addr.lng === 'number' ? addr.lng : null;

  return {
    id: str(p.id),
    name: str(p.name),
    address,
    phone: rawPhone ? formatPhone(rawPhone) : '',
    phoneDigits: rawPhone.replace(/\D/g, ''),
    socials,
    lat,
    lng,
  };
}

/**
 * Contact details for one property. null when the collection is unavailable or
 * doesn't contain the requested property — caller keeps its own defaults.
 */
export async function fetchPropertyContact(
  widgetTag: string,
  propertyId: string = DEFAULT_PROPERTY_ID,
  collectionName: string = PROPERTIES_COLLECTION,
): Promise<PropertyContact | null> {
  if (!hasCollectionsApi()) {
    logSource(widgetTag, 'property contact', false, 'no dmAPI — not in Duda');
    return null;
  }

  const rows = await readCollection(collectionName);
  const match = rows.find((r) => str(r.id) === propertyId);

  if (!match) {
    logSource(
      widgetTag, 'property contact', false,
      rows.length ? `${collectionName} has ${rows.length} rows, none id ${propertyId}` : `${collectionName} empty`,
    );
    return null;
  }

  const contact = mapRow(match);
  logSource(
    widgetTag, 'property contact', true,
    `${collectionName} → ${contact.name || propertyId}, phone ${contact.phone || 'none'}, ${contact.socials.length} socials`,
  );
  return contact;
}
