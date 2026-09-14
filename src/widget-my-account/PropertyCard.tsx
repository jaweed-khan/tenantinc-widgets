// ===========================================================================
// One PROPERTY's sidebar card — the photo once at the top, then every unit the
// tenant rents there stacked beneath it, each with its own balance strip.
//
//   8815-115354 / 9030-31458  one unit  → the card the first two frames draw
//   8815-117093               two units → this card, hero once, two blocks
//
// Neither shape is a special case: the units array does both.
//
// SELECTION: the picked unit rings itself in the frame's Primary/Notifications
// orange and opens its details on the left. The whole unit block is one click
// target, and its "Account Info" button does the same thing — which is what
// links the two: pressing it on ANY unit selects that unit and shows its
// account info, so it is both "switch to this unit" and, from the payment
// screen, "go back".
// ===========================================================================

import { Button, MapPinIcon, PhoneIcon } from '@shared/ui';
import { AmenityCheckIcon } from './icons';
import type { AccountSpace, SpaceProperty } from './data';
import propertyHero from './assets/property-hero.jpg';
import unitDimetric from './assets/unit-dimetric.png';

export function PropertyCard({
  property,
  units,
  selectedId,
  onSelect,
  showAccountInfo,
}: {
  property: SpaceProperty;
  /** Every unit the tenant rents at this property, in render order. */
  units: AccountSpace[];
  selectedId: string;
  /** Select a unit AND show its account info — both entry points call this. */
  onSelect: (id: string) => void;
  /**
   * Whether each block shows its "Account Info" button. False on the
   * single-unit default view, where there is nothing to switch to and the
   * frame draws no button.
   */
  showAccountInfo: boolean;
}) {
  return (
    <div className="ma-prop">
      <div className="ma-prop__hero">
        <img src={propertyHero} alt="" className="ma-prop__photo" aria-hidden="true" />
        <div className="ma-prop__scrim" aria-hidden="true" />
        <div className="ma-prop__heroText">
          <p className="ma-prop__name">{property.name}</p>
          <a
            className="ma-prop__row"
            href={`https://maps.google.com/?q=${encodeURIComponent(property.address)}`}
          >
            <MapPinIcon size={24} className="ma-prop__icon" />
            <span>{property.address}</span>
          </a>
          <a className="ma-prop__row" href={`tel:${property.phone.replace(/[^\d+]/g, '')}`}>
            <PhoneIcon size={24} className="ma-prop__icon" />
            <span>{property.phone}</span>
          </a>
        </div>
      </div>

      {units.map((space) => {
        const selected = space.id === selectedId;
        return (
          /* Two things in the node tree are NOT reproduced, because the frames
             do not render them either (checked against the exports): the 4px
             CTA-green ring on each block, and a "See what fits" link — the
             panel is exactly wide enough for the two columns, so the link is
             clipped out of view. The orange SELECTION ring is a different node
             (8815:115553) and is drawn. */
          <div
            className={`ma-unit${selected ? ' ma-unit--selected' : ''}`}
            key={space.id}
          >
            <div className="ma-unit__panel">
              {/* Fills the panel so the whole block is one click target. A
                  button rather than a handler on the div, so it is reachable
                  by keyboard and announced as pressed. The balance strip below
                  sits above it, keeping its own button clickable. */}
              <button
                type="button"
                className="ma-unit__select"
                aria-pressed={selected}
                onClick={() => onSelect(space.id)}
              >
                <span className="ma-sr-only">Show details for space {space.number}</span>
              </button>

              <div className="ma-unit__info">
                <p className="ma-unit__num">{space.number}</p>
                <p className="ma-unit__size">{space.unit.size}</p>
                <ul className="ma-unit__features">
                  {space.unit.features.map((f) => (
                    <li key={f}>
                      <AmenityCheckIcon />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <img src={unitDimetric} alt="" className="ma-unit__image" aria-hidden="true" />
            </div>

            <div className="ma-unit__footer">
              <div className="ma-unit__due">
                <p className="ma-unit__dueLabel">Balance Due</p>
                <p className="ma-unit__dueDate">{space.unit.balanceDate}</p>
              </div>
              <p className="ma-unit__dueAmount">{space.unit.balanceAmount}</p>
              {showAccountInfo && (
                <Button
                  tone="dark"
                  className="ma-btn-40"
                  onClick={() => onSelect(space.id)}
                >
                  Account Info
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
