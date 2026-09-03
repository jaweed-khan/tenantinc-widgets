// ===========================================================================
// The Hummingbird company this Space List instance is scoped to.
//
// WHY THIS EXISTS. `companyId` arrives as a prop from the Duda JS tab (the site
// reads it out of the content library and forwards it), and an explicit prop
// BEATS the `Company` collection — see @shared/companySource. SpaceList honours
// that, so the unit list queries the right company.
//
// The sidebar sections could not. `SectionAccordion`'s VISUALS map is a
// module-level record of pre-built elements (`<NearbySection />` with no props),
// so NearbySection had to resolve the company itself, and it did so with an
// EMPTY bound — meaning the prop was invisible to it and the `Company`
// collection won instead. On a site whose collection names a different company
// than the prop, the unit list and the "Nearby Storage" sidebar then queried two
// different tenants: the list correct, the sidebar not. This context is how the
// already-resolved id reaches those sections without restructuring VISUALS.
//
// The default is '' — "not resolved yet", deliberately not cfg.companyId. A
// consumer must be able to tell "still resolving" from "resolved to the config
// default", because firing a request against the wrong company and correcting it
// afterwards is exactly the bug this exists to prevent.
// ===========================================================================

import React, { createContext, useContext } from 'react';

const CompanyIdContext = createContext<string>('');

export function CompanyIdProvider(
  { companyId, children }: { companyId: string; children: React.ReactNode },
) {
  return <CompanyIdContext.Provider value={companyId}>{children}</CompanyIdContext.Provider>;
}

/** The resolved company id, or '' while SpaceList is still resolving it. */
export function useCompanyId(): string {
  return useContext(CompanyIdContext);
}
