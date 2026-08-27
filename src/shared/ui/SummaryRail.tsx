import React from 'react';
import './SummaryRail.css';
import { formatPrice } from './format';
import { CheckIcon, TagIcon, MapPinIcon, PhoneIcon } from './icons';
import {
  VisaMark, MastercardMark, AmexMark, DiscoverMark, ApplePayMark, GooglePayMark,
} from './paymentIcons';

// ===========================================================================
// <SummaryRail /> — the order-summary card shared by the value-tiers page and
// the rent-or-reserve flow. Facility hero, selected size + amenities, the
// standard/promo price pair, a promo banner, the money breakdown (passed as
// children so each widget supplies its own data source), and payment marks.
//
// The money block is `children`: value-tiers passes its tier-context breakdown,
// rental-flow passes the live move-in quote — the container is identical.
// ===========================================================================

export interface SummaryRailProps {
  imageUrl?: string;
  onImgError?: React.ReactEventHandler<HTMLImageElement>;
  name?: string;
  address?: string;
  phone?: string;
  /** Display-formatted size, e.g. "10' x 10'". */
  size: string;
  /** Optional trailing tier/label after the size, e.g. "BEST" → "10' x 10' | BEST". */
  tierName?: string;
  /** Bold sub-line under the size. */
  summary?: string;
  /** Amenity labels rendered as a check-list. */
  amenities?: string[];
  /** "Change Space" link target; omitted → no link. */
  changeSpaceUrl?: string;
  /** Standard rate (struck when a promo price is present) and promo rate, as
   *  raw numbers — formatted here so every widget renders prices identically. */
  standardPrice?: number;
  promoPrice?: number;
  /** Price column labels; default STANDARD / PROMO RATE. */
  priceLabels?: { standard: string; promo: string };
  /** Promo banner text. */
  promo?: string;
  /** Seconds left on a unit hold; renders the countdown bar (rental only). */
  holdRemaining?: number;
  /** Show the payment-method marks (default true). */
  showPayments?: boolean;
  /** Replaces the image hero outright. The rental flow's mobile sheet swaps it
   *  for a logo-and-contact row; anything that does not pass this keeps the
   *  photo with the name, address and phone laid over it. */
  heroSlot?: React.ReactNode;
  /** The money breakdown block. */
  children?: React.ReactNode;
}

const fmtCountdown = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function SummaryRail({
  imageUrl,
  onImgError,
  name,
  address,
  phone,
  size,
  tierName,
  summary,
  amenities,
  changeSpaceUrl,
  standardPrice,
  promoPrice,
  priceLabels = { standard: 'STANDARD', promo: 'PROMO RATE' },
  promo,
  holdRemaining,
  showPayments = true,
  heroSlot,
  children,
}: SummaryRailProps) {
  return (
    <aside className="ts-card">
      {holdRemaining != null && (
        <div className="ts-card-holdbar">
          Holding Space For <b className="ts-card-holdtime">{fmtCountdown(holdRemaining)}</b>
        </div>
      )}

      {heroSlot ?? (
      <div className="ts-card-hero">
        {imageUrl
          ? <img className="ts-card-hero-img" src={imageUrl} alt={name ?? 'Storage facility'} onError={onImgError} />
          : <div className="ts-card-hero-img ts-card-hero-img--placeholder" aria-hidden="true" />}
        <div className="ts-card-hero-overlay" />
        <div className="ts-card-hero-content">
          {name && <p className="ts-card-storename">{name}</p>}
          {address && (
            <span className="ts-card-line">
              <MapPinIcon size={24} className="ts-card-line-icon" />
              <span>{address}</span>
            </span>
          )}
          {phone && (
            <a className="ts-card-line" href={`tel:${phone.replace(/\D/g, '')}`}>
              <PhoneIcon size={24} className="ts-card-line-icon" />
              <span>{phone}</span>
            </a>
          )}
        </div>
      </div>
      )}

      <div className="ts-card-body">
        <div className="ts-card-top">
          <div className="ts-card-top-left">
            {size && (
              <p className="ts-card-size">
                {size}{tierName ? <> <span className="ts-card-bar">|</span> {tierName}</> : null}
              </p>
            )}
            {summary && <p className="ts-card-sub">{summary}</p>}
            {amenities && amenities.length > 0 && (
              <div className="ts-card-amenities">
                {amenities.map((f) => (
                  <div className="ts-feat" key={f}><CheckIcon size={16} className="ts-feat-check" /><span>{f}</span></div>
                ))}
              </div>
            )}
          </div>
          <div className="ts-card-top-right">
            {changeSpaceUrl && <a className="ts-card-change" href={changeSpaceUrl}>Change Space</a>}
            {(standardPrice != null || promoPrice != null) && (
              <div className="ts-card-prices">
                {promoPrice != null ? (
                  <>
                    <div className="ts-price-instore">
                      <span className="ts-price-label">{priceLabels.standard}</span>
                      <span className="ts-price-strike">{standardPrice != null ? formatPrice(standardPrice) : null}</span>
                    </div>
                    <span className="ts-price-sep" />
                    <div className="ts-price-online">
                      <span className="ts-price-label">{priceLabels.promo}</span>
                      <span className="ts-price-amount">{formatPrice(promoPrice)}</span>
                    </div>
                  </>
                ) : (
                  <div className="ts-price-online">
                    <span className="ts-price-amount">{standardPrice != null ? formatPrice(standardPrice) : null}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {promo && (
          <div className="ts-card-promo">
            <TagIcon size={16} className="ts-promo-icon" />
            <span className="ts-promo-text">{promo}</span>
          </div>
        )}

        {children}

        {showPayments && (
          <div className="ts-card-payments">
            {/* Two groups, as the frame has them: the four card chips, then the
                wallet marks. They carry different gaps (4px vs 5.219px). */}
            <span className="ts-pay-methods">
              <span className="ts-pay-box"><VisaMark /></span>
              <span className="ts-pay-box"><MastercardMark /></span>
              <span className="ts-pay-box"><AmexMark /></span>
              <span className="ts-pay-box"><DiscoverMark /></span>
            </span>
            {/* NOT wrapped in .ts-pay-box: the Apple/Google artwork draws its
                own rule and fill, so a chip here would double the border. */}
            <span className="ts-pay-buttons">
              <span className="ts-pay-box"><ApplePayMark /></span>
              {/* The same chip as the four card marks and Apple Pay — it used
                  to carry a --pill modifier that rounded it to 12px against
                  their 2.7px, so the row ended on an odd shape. */}
              <span className="ts-pay-box"><GooglePayMark /></span>
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}
