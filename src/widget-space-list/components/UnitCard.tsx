import React from 'react';
import type { Unit, WidgetConfig } from '../types';
import { PriceBlock, PromoBadge, FeatureList, CtaButton, JunkFeeDisclaimer } from './Pricing';
import defaultImg from '../assets/tenantinc-default.png';
import { unitImageSrc, unitImageOnError } from './unitImage';

export function UnitCard({ unit, config }: { unit: Unit; config: WidgetConfig }) {
  return (
    <div className="sl-unit-card">
      <div className="sl-card-display-panel">
        <div className="sl-card-top">
          <div className="sl-card-info">
            <div className="sl-unit-heading">
              <div className="sl-unit-title">{unit.dimensions}</div>
              {/* Guarded like the other two cards: an empty subtype (no amenity
                  and a generic group name) must take no vertical space rather
                  than leaving an empty line under the size. */}
              {unit.subtype && <div className="sl-unit-subtype">{unit.subtype}</div>}
            </div>
            <FeatureList features={unit.features} />
          </div>
          <div className="sl-card-image-col">
            <img className="sl-unit-img" src={unitImageSrc(unit, defaultImg)} alt="Storage Unit" onError={unitImageOnError(unit, defaultImg)} />
            <a href="#" className="sl-see-fits">
              See what fits
              {/* Pika play/play-circle (outline) — inherits currentColor from .sl-see-fits. */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12.0001 21.1501C17.0535 21.1501 21.1501 17.0535 21.1501 12.0001C21.1501 6.94669 17.0535 2.8501 12.0001 2.8501C6.94669 2.8501 2.8501 6.94669 2.8501 12.0001C2.8501 17.0535 6.94669 21.1501 12.0001 21.1501Z" />
                <path d="M9.50012 11.896C9.50012 10.4641 9.50012 9.74818 9.79935 9.34849C10.0601 9.00019 10.4593 8.78227 10.8933 8.75127C11.3913 8.7157 11.9935 9.10284 13.1979 9.87713L13.3597 9.98113C14.4049 10.653 14.9275 10.989 15.108 11.4161C15.2657 11.7894 15.2657 12.2105 15.108 12.5838C14.9275 13.011 14.4049 13.3469 13.3597 14.0188L13.1979 14.1228C11.9935 14.8971 11.3913 15.2842 10.8933 15.2487C10.4593 15.2177 10.0601 14.9997 9.79935 14.6514C9.50012 14.2517 9.50012 13.5358 9.50012 12.104V11.896Z" />
              </svg>
            </a>
          </div>
        </div>
      </div>

      <div className="sl-card-action-panel">
        {/* Promo sits inside the grey action panel, above the price + CTA — same
            arrangement as the default layout. It used to hang in the white display
            panel above the divider. */}
        {unit.promo && <PromoBadge text={unit.promo} />}
        <div className="sl-card-pricing">
          <PriceBlock unit={unit} config={config} />
          <CtaButton unit={unit} config={config} colClass="sl-cta-col" />
        </div>
        {config.showJunkFeeDisclaimer && <JunkFeeDisclaimer config={config} />}
      </div>
    </div>
  );
}
