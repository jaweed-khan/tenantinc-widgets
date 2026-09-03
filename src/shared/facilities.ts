// ===========================================================================
// Every property on the company, as the contact modal's facility list.
//
// #03 and #05 both open the shared "Send us a Message" modal, and both used to
// hand it a one-element array holding the property whose page it is. So the
// "Select Property" dropdown had exactly one option — the one already chosen —
// and the modal's own "Change Property" control, gated on `facilities.length > 1`,
// never rendered at all. Clearing the preselected property left the shopper with
// a picker that could only offer it straight back.
//
// This is the list to change TO.
// ===========================================================================

import { fetchProperties, extractNearbyProperties, type NearbyApiConfig } from './nearbyProperties';
import { resolveCompanyIdFromSources } from './companySource';

/** Matches `Facility` in components/MessageModal — structurally, not by import,
 *  so the modal never has to depend on where its list came from. */
export interface FacilityOption {
  id: string;
  name: string;
  address?: string;
}

/**
 * Promise-cached per company. #03 and #05 can both be on one page (a property
 * page carries the info panel AND the listing), and neither knows about the
 * other, so without this the same request goes out twice. Caching the PROMISE,
 * not the result, means two callers mounting in the same tick share one flight
 * rather than racing.
 */
const inFlight = new Map<string, Promise<FacilityOption[]>>();

export async function fetchFacilities(
  tag: string,
  cfg: NearbyApiConfig,
  companyIdProp?: string,
): Promise<FacilityOption[]> {
  const companyId = await resolveCompanyIdFromSources(tag, { companyId: companyIdProp }, cfg.companyId);
  if (!companyId) return [];

  const cached = inFlight.get(companyId);
  if (cached) return cached;

  const run = (async () => {
    try {
      const raw = await fetchProperties({ ...cfg, companyId }, {});
      /*
       * requireCoords:false is REQUIRED, not a preference. Verified live
       * 2026-08-13 and recorded on extractNearbyProperties: every property on
       * the current company has `lat: null, lng: null`, so the default would
       * drop all of them and this would return an empty list. Nothing here
       * ranks by distance — it is a list of names to contact — so a property
       * that cannot be plotted is still perfectly contactable.
       */
      const all = extractNearbyProperties(raw, cfg.appId, { requireCoords: false });
      return all
        .filter((p) => p.name)
        .map((p) => ({ id: p.id, name: p.name, address: p.address || undefined }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
      // Fails soft: the caller falls back to the property whose page this is,
      // which is the behaviour that existed before this list did. A contact
      // form that cannot list the portfolio is still a working contact form.
      console.error(`[${tag}] fetchFacilities failed:`, err);
      // Not cached as a rejection — drop it so a later mount can retry.
      inFlight.delete(companyId);
      return [];
    }
  })();

  inFlight.set(companyId, run);
  return run;
}
