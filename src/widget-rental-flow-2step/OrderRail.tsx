import React, { useEffect, useState } from 'react';
import { PROPERTY_IMAGES } from '@shared/demoImages';
import { fetchPropertyHeroImage } from '@shared/propertyImages';
import { MoneyBreakdown, SummaryRail } from '@shared/ui';
import { PhoneIcon } from '@shared/ui/icons';
import type { PropertyInfo, SelectionContext, MoveInQuote } from './api';

// ---------------------------------------------------------------------------
// Order-summary rail (right side of every flow screen). Thin wrapper over the
// shared <SummaryRail> — the SAME card the value-tiers page renders — feeding
// it the live selection + real move-in quote. Facility facts + selection are
// LIVE; the money breakdown is REAL when a unit resolves (GET
// /units/{id}/lease-set-up). No made-up figures: without a quote the rail says
// exactly why in one sentence. Facility photo is still a demo asset.
// ---------------------------------------------------------------------------

// NO-DEMO-MONEY policy (Raymond, 2026-08-03): the rail never shows made-up
// figures. Without a resolved quote it says exactly why in one sentence.
function railMoneyNote(hasSelection: boolean, failed: boolean): string {
  if (failed) {
    return 'We’re experiencing technical difficulties retrieving live pricing. '
      + 'Please try again in a few minutes — your final costs are always confirmed before you pay.';
  }
  return hasSelection
    ? 'Calculating your move-in cost… Your final costs are always confirmed before you pay.'
    : 'Select a space to see your move-in cost.';
}

export function OrderRail({
  property,
  selection,
  quote,
  unitLabel,
  changeSpaceUrl,
  quoteFailed = false,
  estimate = false,
  paid = false,
  sheetLogo,
}: {
  property?: PropertyInfo;
  selection?: SelectionContext;
  quote?: MoveInQuote;
  /** Unit number shown BEFORE the size, e.g. "#111 | 5’ x 7’". SummaryRail
   *  composes `size | tierName`, so when this is set the unit leads and the size
   *  moves into the trailing slot. */
  unitLabel?: string;
  changeSpaceUrl?: string;
  /** Quote pipeline failed — show the technical-difficulty note, never fakes. */
  quoteFailed?: boolean;
  /** No money moved (reservation hold): the reserve endpoint re-prices
   *  server-side and does not echo the final breakdown, so the shown total is
   *  an ESTIMATE, not a confirmed charge. Labels it accordingly. */
  estimate?: boolean;
  /** The money has actually been taken — i.e. this is the confirmation page,
   *  not a step in the flow. Only then can the total be described in the past
   *  tense; before it, the same figure is what the shopper is ABOUT to pay. */
  paid?: boolean;
  /** Mobile dropdown only. With a logo the image hero is replaced by a
   *  logo-and-contact row (Figma 12028-86142) — inside the sheet the photo is
   *  a second copy of what the page already showed, and the shopper opened the
   *  panel for the numbers. */
  sheetLogo?: string;
}) {
  const phone = property?.phone
    ? property.phone.replace(/^1?(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3')
    : undefined;

  // The selected property's own hero photo. Until it lands (and on any site
  // without the collection) the rail keeps the demo image it has always shown,
  // so the card never renders with an empty frame.
  const [hero, setHero] = useState('');
  useEffect(() => {
    const id = property?.id;
    setHero('');
    if (!id) return undefined;
    let cancelled = false;
    fetchPropertyHeroImage(id)
      .then((url) => { if (!cancelled) setHero(url); })
      .catch(() => { /* no collection — the demo image stands in */ });
    return () => { cancelled = true; };
  }, [property?.id]);
  /* Figma 12028-86142: logo left, address over phone on the right, both 12px.
     No address icon, and the phone mark is the kit's own rather than the
     frame's export. Built here rather than passed in because the address and
     phone are already resolved on this component. */
  const sheetHead = sheetLogo ? (
    <div className="rf-sheethead">
      <img className="rf-sheethead-logo" src={sheetLogo} alt="" />
      <div className="rf-sheethead-info">
        {property?.address && <p className="rf-sheethead-addr">{property.address}</p>}
        {phone && (
          <a className="rf-sheethead-phone" href={`tel:${phone.replace(/\D/g, '')}`}>
            <PhoneIcon size={16} />
            <span>{phone}</span>
          </a>
        )}
      </div>
    </div>
  ) : undefined;

  /* Three states, one label. `estimate` outranks `paid` because a reservation
     confirms without taking money — it is neither a cost still to come nor an
     amount already paid. */
  const totalLabel = estimate
    ? 'Estimated Move-In Total:'
    : paid ? 'Total Paid to Move-In:' : 'Total Cost to Move-In:';
  const showStrike = selection?.inStore != null && selection?.online != null
    && selection.inStore > selection.online;

  return (
    <SummaryRail
      heroSlot={sheetHead}
      imageUrl={hero || PROPERTY_IMAGES[0]}
      name={property?.name}
      address={property?.address}
      phone={phone}
      size={unitLabel ?? (selection ? selection.size.replace(/'/g, '’') : '')}
      tierName={unitLabel ? selection?.size.replace(/'/g, '’') : undefined}
      summary={selection?.features?.[0]}
      /* Four at most. features[0] is the summary line above, so the list is
         everything after it — slice(1, 5) is indices 1-4, i.e. four rows.
         Capped HERE rather than in SummaryRail because that component is
         shared with #14, whose cards show the full set; and because every
         rail in this flow, desktop column and mobile sheet alike, is the same
         OrderRail element, so one cap covers both. */
      amenities={selection?.features?.slice(1, 5)}
      changeSpaceUrl={changeSpaceUrl}
      standardPrice={
        showStrike ? selection!.inStore
          : selection?.online ?? undefined
      }
      promoPrice={showStrike ? selection!.online : undefined}
      priceLabels={{ standard: 'IN-STORE', promo: 'ONLINE' }}
      promo={selection?.promo}
    >
      <div className="ts-card-breakdown">
        {quote ? (
          <>
            {/* No unitNumber: MoneyBreakdown renders it as a "Unit #be23fl" row,
                which repeats what the card's own header already says and shows
                the raw id rather than the space number. Dropped at the call
                site rather than in the component — #14 passes it too and keeps
                the row. */}
            <MoneyBreakdown
              totalDue={quote.totalDue}
              totalTax={quote.totalTax}
              lines={quote.lines}
              showTotal={false}
            />
            <div className="ts-bd-row ts-bd-row--total">
              <span className="ts-bd-total-label">{totalLabel}</span>
              <span className="ts-bd-total-amt">${quote.totalDue.toFixed(2)}</span>
            </div>
            {estimate && (
              <p className="ts-bd-note">
                Estimate only — no payment was taken for this reservation. Your
                exact move-in total is confirmed when you complete your rental.
              </p>
            )}
          </>
        ) : (
          <>
            <p className="ts-bd-note">{railMoneyNote(!!selection, quoteFailed)}</p>
            <div className="ts-bd-row ts-bd-row--total">
              <span className="ts-bd-total-label">{totalLabel}</span>
              <span className="ts-bd-total-amt">—</span>
            </div>
          </>
        )}
      </div>
    </SummaryRail>
  );
}
