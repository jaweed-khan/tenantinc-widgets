import React, { useState } from 'react';
import type { Unit, SpaceType, UnitSize, WidgetConfig } from '../types';
import { groupBySizeSorted, sortUnits, orderTypes } from '../filters';
import {
  PriceBlock,
  CtaButton,
  FeatureList,
  PromoBadge,
  JunkFeeDisclaimer,
  PlayCircleIcon,
} from './Pricing';
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

const TYPE_LABEL: Partial<Record<SpaceType, string>> = {
  parking: 'Parking',
};

// Every size group opens by default, same as the grid layout.
const SIZE_DEFAULT_OPEN: Record<UnitSize, boolean> = {
  other: true,
  extra_small: true,
  small: true,
  medium: true,
  large: true,
  extra_large: true,
};

const ChevronDown = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

// ── Card — one unit per row (Figma 7112-47133 "Retail New Layout") ─────────────
// White display panel (image + "See what fits" beside the size/amenities) next to
// a grey action panel (promo banner over price + CTA), both full card height.

export function DefaultCard({ unit, config }: { unit: Unit; config: WidgetConfig }) {
  return (
    <div className="sl-default-card">
      <div className="sl-dv-display">
        <div className="sl-dv-image-col">
          <img
            className="sl-dv-img"
            src={unitImageSrc(unit, defaultImg)}
            alt="Storage Unit"
            onError={unitImageOnError(unit, defaultImg)}
          />
          <a href="#" className="sl-dv-see-fits">
            See what fits <PlayCircleIcon />
          </a>
        </div>

        <div className="sl-dv-info">
          <div className="sl-dv-heading">
            <div className="sl-dv-title">{unit.dimensions}</div>
            {unit.subtype && <div className="sl-dv-subtype">{unit.subtype}</div>}
          </div>
          <FeatureList features={unit.features} />
        </div>
      </div>

      <div className="sl-dv-action">
        <div className="sl-dv-actions">
          {unit.promo && <PromoBadge text={unit.promo} />}
          <div className="sl-dv-price-button">
            <div className="sl-dv-price">
              <PriceBlock unit={unit} config={config} />
              {config.showJunkFeeDisclaimer && <JunkFeeDisclaimer config={config} />}
            </div>
            <CtaButton unit={unit} config={config} full colClass="sl-dv-btn-col" />
          </div>
        </div>
      </div>
    </div>
  );
}

function CardRows({ units, config }: { units: Unit[]; config: WidgetConfig }) {
  return (
    <div className="sl-dv-rows">
      {units.map((u) => (
        <DefaultCard key={u.id} unit={u} config={config} />
      ))}
    </div>
  );
}

// ── Storage: grouped by size accordions ───────────────────────────────────────

function StorageAccordions({ units, config }: { units: Unit[]; config: WidgetConfig }) {
  const [open, setOpen] = useState<Record<UnitSize, boolean>>(SIZE_DEFAULT_OPEN);
  const toggle = (size: UnitSize) => setOpen((o) => ({ ...o, [size]: !o[size] }));

  return (
    <>
      {groupBySizeSorted(units, config.sortBy).map(({ size, units: groupUnits }) => {
        const isOpen = open[size];
        return (
          <div key={size} className={`sl-accordion${isOpen ? ' expanded' : ''}`}>
            <div className="sl-accordion-header" onClick={() => toggle(size)}>
              <span className="sl-accordion-title">{SIZE_LABEL[size]}</span>
              <span className="sl-chevron"><ChevronDown /></span>
            </div>
            {isOpen && (
              <div className="sl-accordion-body">
                <CardRows units={groupUnits} config={config} />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

// ── Non-storage types: one named accordion each ───────────────────────────────

function TypeAccordion({ spaceType, units, config }: { spaceType: SpaceType; units: Unit[]; config: WidgetConfig }) {
  const [open, setOpen] = useState(true);
  const label = TYPE_LABEL[spaceType] ?? (spaceType.charAt(0).toUpperCase() + spaceType.slice(1));

  return (
    <div className={`sl-accordion${open ? ' expanded' : ''}`}>
      <div className="sl-accordion-header" onClick={() => setOpen((o) => !o)}>
        <span className="sl-accordion-title">{label}</span>
        <span className="sl-chevron"><ChevronDown /></span>
      </div>
      {open && (
        <div className="sl-accordion-body">
          <CardRows units={sortUnits(units, config.sortBy)} config={config} />
        </div>
      )}
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function DefaultView({ units, config }: { units: Unit[]; config: WidgetConfig }) {
  if (units.length === 0) {
    return <div className="sl-empty-msg">No spaces match your filters.</div>;
  }

  // Unique types, then reordered so the editor's chosen category leads.
  const orderedTypes = orderTypes(
    Array.from(new Set(units.map((u) => u.type))) as SpaceType[],
    config.categoryOrdering,
  );

  return (
    <div className="sl-default-view">
      {orderedTypes.map((spaceType) => {
        const typeUnits = units.filter((u) => u.type === spaceType);
        if (spaceType === 'storage') {
          return <StorageAccordions key="storage" units={typeUnits} config={config} />;
        }
        return <TypeAccordion key={spaceType} spaceType={spaceType} units={typeUnits} config={config} />;
      })}
    </div>
  );
}
