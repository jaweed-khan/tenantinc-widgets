import React, { useState } from 'react';
import type { Unit, UnitSize, WidgetConfig } from '../types';
import { PriceBlock, CtaButton, FeatureList, CheckIcon, JunkFeeDisclaimer, PromoTagIcon } from './Pricing';
import defaultImg from '../assets/tenantinc-default.png';
import { unitImageSrc, unitImageOnError } from './unitImage';

const SIZE_LABEL: Record<UnitSize, string> = {
  other: 'Other',
  extra_small: 'Extra Small',
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
  extra_large: 'Extra Large',
};

// ── Icons ─────────────────────────────────────────────────────────────────────

function PlayCircleIcon() {
  // Pika play/play-circle (outline) — inherits currentColor from .sl-lc-see-fits.
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <path d="M12.0001 21.1501C17.0535 21.1501 21.1501 17.0535 21.1501 12.0001C21.1501 6.94669 17.0535 2.8501 12.0001 2.8501C6.94669 2.8501 2.8501 6.94669 2.8501 12.0001C2.8501 17.0535 6.94669 21.1501 12.0001 21.1501Z" />
      <path d="M9.50012 11.896C9.50012 10.4641 9.50012 9.74818 9.79935 9.34849C10.0601 9.00019 10.4593 8.78227 10.8933 8.75127C11.3913 8.7157 11.9935 9.10284 13.1979 9.87713L13.3597 9.98113C14.4049 10.653 14.9275 10.989 15.108 11.4161C15.2657 11.7894 15.2657 12.2105 15.108 12.5838C14.9275 13.011 14.4049 13.3469 13.3597 14.0188L13.1979 14.1228C11.9935 14.8971 11.3913 15.2842 10.8933 15.2487C10.4593 15.2177 10.0601 14.9997 9.79935 14.6514C9.50012 14.2517 9.50012 13.5358 9.50012 12.104V11.896Z" />
    </svg>
  );
}

/** Small promo tag flag pinned to the top-right of an available size pill. */
function SizeTagIcon() {
  return (
    /* currentColor — a fill attribute is unthemeable and unstyleable; the
       colour comes from .sl-lc-size-tag. */
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M5.5 2h7.1c.5 0 1 .2 1.4.6l7.4 7.4c.8.8.8 2 0 2.8l-7.1 7.1c-.8.8-2 .8-2.8 0L4.1 12.5c-.4-.4-.6-.9-.6-1.4V4A2 2 0 0 1 5.5 2Zm2.5 3.5A1.5 1.5 0 1 0 8 8.5 1.5 1.5 0 0 0 8 5.5Z" />
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ListCard({ size, units, config }: { size: UnitSize; units: Unit[]; config: WidgetConfig }) {
  const [selectedId, setSelectedId] = useState(units[0].id);
  // The selected unit may disappear if filters change; fall back to first.
  const selected = units.find((u) => u.id === selectedId) ?? units[0];

  return (
    <div className="sl-list-card">
      {/* Display panel — image + amenities (left) and the size grid (right) */}
      <div className="sl-lc-display">
        <div className="sl-lc-left">
          <div className="sl-lc-image-col">
            <img
              className="sl-lc-img"
              src={unitImageSrc(selected, defaultImg)}
              alt="Storage Unit"
              onError={unitImageOnError(selected, defaultImg)}
            />
            <a href="#" className="sl-lc-see-fits">
              See what fits <PlayCircleIcon />
            </a>
          </div>

          <div className="sl-lc-info">
            <div className="sl-lc-size-label">{SIZE_LABEL[size]}</div>
            {selected.subtype && (
              <span className="sl-lc-subtype">
                <CheckIcon /> {selected.subtype}
              </span>
            )}
            <FeatureList features={selected.features} />
          </div>
        </div>

        <div className="sl-lc-sizes">
          {units.map((u) => {
            const isSelected = u.id === selected.id;
            const isUnavail = u.availability === 'waitlist';
            return (
              <button
                key={u.id}
                className={`sl-lc-size${isSelected ? ' selected' : ''}${isUnavail ? ' unavail' : ''}`}
                onClick={() => setSelectedId(u.id)}
              >
                {u.dimensions}
                {u.promo && <span className="sl-lc-size-tag"><SizeTagIcon /></span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Action panel — promo banner + price + CTA */}
      <div className="sl-lc-action">
        {selected.promo && (
          <div className="sl-lc-promo">
            <span className="sl-lc-promo-icon"><PromoTagIcon size={16} /></span>
            {selected.promo}
          </div>
        )}
        <div className="sl-lc-price-button">
          <div className="sl-lc-price">
            <PriceBlock unit={selected} config={config} />
            {config.showJunkFeeDisclaimer && <JunkFeeDisclaimer config={config} />}
          </div>
          <CtaButton unit={selected} config={config} full colClass="sl-lc-btn-col" />
        </div>
      </div>
    </div>
  );
}
