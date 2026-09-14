// ===========================================================================
// The DEFAULT left-hand panel — Figma 8815-115354 ("Account Info - Display").
//
// Heading + Edit, then two columns (Primary Contact | Documents), then
// Alternate Contact beneath the first column, then a tinted action panel with
// the balance, "Pay Now" and two more links.
//
// "Pay Now" is the only route to the Make a Payment screen, so it takes the
// notification orange (Primary/Notifications) rather than the CTA green — one
// of the very few places in the kit where those two differ deliberately.
// ===========================================================================

import { Button, MapPinIcon, PhoneIcon } from '@shared/ui';
import {
  CarFrontIcon, EnvelopeIcon, FileTextIcon, UserArrowRightIcon, UserSettingsIcon,
} from './icons';
import type { AccountSpace, Contact } from './data';

/** One icon + text row. The address arrives as several lines and keeps them. */
function InfoRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="ma-info__row">
      <span className="ma-info__icon">{icon}</span>
      <span className="ma-info__text">{children}</span>
    </li>
  );
}

/**
 * The ALTERNATE contact's row order — name, address, email, phone. The primary
 * contact runs name, email, phone, address, licence instead, so it is spelled
 * out at its own call site rather than both sharing one order and one of them
 * coming out wrong.
 */
function AlternateContact({ contact }: { contact: Contact }) {
  return (
    <ul className="ma-info__list">
      <InfoRow icon={<UserSettingsIcon />}>{contact.name}</InfoRow>
      {contact.address && (
        <InfoRow icon={<MapPinIcon size={24} />}>
          {contact.address.map((l) => <span key={l} className="ma-info__line">{l}</span>)}
        </InfoRow>
      )}
      {contact.email && <InfoRow icon={<EnvelopeIcon />}>{contact.email}</InfoRow>}
      {contact.phone && <InfoRow icon={<PhoneIcon size={24} />}>{contact.phone}</InfoRow>}
    </ul>
  );
}

export function AccountInfoPanel({
  space,
  onPayNow,
  onEdit,
}: {
  space: AccountSpace;
  onPayNow: () => void;
  /** Opens the Edit panel (8815-115876) in this panel's place. */
  onEdit: () => void;
}) {
  const primary = space.primaryContact;
  const alt = space.alternateContact;

  return (
    <section className="ma-account">
      <div className="ma-account__body">
        <header className="ma-account__head">
          <h2 className="ma-account__title">{space.title}</h2>
          <Button tone="dark" className="ma-btn-40" onClick={onEdit}>Edit</Button>
        </header>
        <hr className="ma-account__rule" />

        <div className="ma-account__cols">
          <div className="ma-account__col ma-account__col--contact">
            <h3 className="ma-account__label">Primary Contact</h3>
            <ul className="ma-info__list">
              <InfoRow icon={<UserSettingsIcon />}>{primary.name}</InfoRow>
              {primary.email && <InfoRow icon={<EnvelopeIcon />}>{primary.email}</InfoRow>}
              {primary.phone && <InfoRow icon={<PhoneIcon size={24} />}>{primary.phone}</InfoRow>}
              {primary.address && (
                <InfoRow icon={<MapPinIcon size={24} />}>
                  {primary.address.map((l) => <span key={l} className="ma-info__line">{l}</span>)}
                </InfoRow>
              )}
              {primary.licence && <InfoRow icon={<CarFrontIcon />}>{primary.licence}</InfoRow>}
            </ul>
          </div>

          <div className="ma-account__col ma-account__col--docs">
            <h3 className="ma-account__label">Documents</h3>
            <ul className="ma-info__list ma-docs">
              {space.documents.map((doc) => (
                <li className="ma-docs__row" key={doc.label}>
                  <span className="ma-info__icon"><FileTextIcon /></span>
                  {/* A real link once the documents API is wired; a button today
                      so it is focusable and announced, without a dead href. */}
                  <button type="button" className="ma-docs__link">{doc.label}</button>
                  {doc.status && <span className="ma-docs__chip">{doc.status}</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {alt && (
          <div className="ma-account__alt">
            <h3 className="ma-account__label">Alternate Contact</h3>
            <AlternateContact contact={alt} />
          </div>
        )}
      </div>

      {/* Action panel — tinted, and square only at the top so it finishes the
          card's rounded bottom. */}
      <div className="ma-action">
        <div className="ma-action__due">
          <p className="ma-action__dueLabel">{space.dueLabel}</p>
          <div className="ma-action__pay">
            <p className="ma-action__amount">{space.dueAmount}</p>
            <button type="button" className="ma-paynow" onClick={onPayNow}>Pay Now</button>
          </div>
        </div>

        <ul className="ma-info__list ma-action__links">
          <li className="ma-info__row">
            <span className="ma-info__icon"><FileTextIcon /></span>
            <button type="button" className="ma-docs__link">Change Address Form</button>
          </li>
          <li className="ma-info__row">
            <span className="ma-info__icon"><UserArrowRightIcon /></span>
            <button type="button" className="ma-docs__link">Schedule Move Out</button>
          </li>
        </ul>
      </div>
    </section>
  );
}
