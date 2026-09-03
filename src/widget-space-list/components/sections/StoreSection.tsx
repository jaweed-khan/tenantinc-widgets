import React, { useEffect, useState } from 'react';
import { SOCIAL_ICONS } from '@shared/socialIcons';
import type { HoursStatus, ScheduleRow } from '@shared/accessHours';
import { MessageModal } from '@shared/components/MessageModal';
import { createLead } from '../../propertyApi';
import { usePropertyId } from '../../propertyContext';
import { fetchFacilities, type FacilityOption } from '@shared/facilities';
import cfg from '../../config.json';
import { CloseCircleIcon } from '@shared/ui';

// ── Icons ─────────────────────────────────────────────────────────────────────

// Pika stroke icons traced from the Figma side-panel design.
const strokeProps = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

function PhoneIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" {...strokeProps}>
      <path d="M5.40731 12.974C4.16988 10.8771 3.35625 8.43264 3.03493 5.70916C2.89384 4.51323 3.63519 3.25377 4.89733 3.04738C5.29394 2.98252 5.78431 2.99232 6.18768 3.0287C7.87081 3.18051 8.56658 4.6661 8.93595 6.10803C9.43051 8.03869 8.82802 10.0852 7.36633 11.4397C6.76147 12.0002 6.06056 12.4721 5.40731 12.974ZM5.40731 12.974C6.72406 15.2053 8.52068 17.043 10.7146 18.4047M10.7146 18.4047C12.8787 19.7478 15.4294 20.6276 18.2874 20.965C19.4834 21.1062 20.7424 20.3643 20.9487 19.1022C21.0194 18.6693 21.011 18.1714 20.9595 17.7362C20.7499 15.9658 19.0455 15.2967 17.5244 14.9479C15.7912 14.5505 13.9733 15.0271 12.6579 16.2238C11.9438 16.8733 11.3466 17.6768 10.7146 18.4047Z" />
    </svg>
  );
}

function EnvelopeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" {...strokeProps}>
      <path d="M21.8032 7.76159L16.295 11.2668C14.7385 12.2573 13.9602 12.7526 13.1238 12.9455C12.3843 13.1161 11.6157 13.1161 10.8762 12.9455C10.0398 12.7526 9.26153 12.2573 7.70499 11.2668L2.19678 7.76159M21.8032 7.76159C22 8.72189 22 10.006 22 12C22 14.8003 22 16.2004 21.455 17.27C20.9757 18.2108 20.2108 18.9757 19.27 19.455C18.2004 20 16.8003 20 14 20H10C7.19974 20 5.79961 20 4.73005 19.455C3.78924 18.9757 3.02433 18.2108 2.54497 17.27C2 16.2004 2 14.8003 2 12C2 10.006 2 8.72189 2.19678 7.76159M21.8032 7.76159C21.7237 7.37332 21.6119 7.03798 21.455 6.73005C20.9757 5.78924 20.2108 5.02433 19.27 4.54497C18.2004 4 16.8003 4 14 4H10C7.19974 4 5.79961 4 4.73005 4.54497C3.78924 5.02433 3.02433 5.78924 2.54497 6.73005C2.38807 7.03798 2.27634 7.37332 2.19678 7.76159" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" {...strokeProps}>
      <path d="M11.9995 8V12.8164C11.9995 12.9874 12.0869 13.1465 12.2311 13.2383L14.9995 15M21.1496 12.0001C21.1496 17.0535 17.053 21.1501 11.9996 21.1501C6.9462 21.1501 2.84961 17.0535 2.84961 12.0001C2.84961 6.94669 6.9462 2.8501 11.9996 2.8501C17.053 2.8501 21.1496 6.94669 21.1496 12.0001Z" />
    </svg>
  );
}

function WriteReviewIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" {...strokeProps}>
      <path d="M16.2 3H7.8C6.11984 3 5.27976 3 4.63803 3.32698C4.07354 3.6146 3.6146 4.07354 3.32698 4.63803C3 5.27976 3 6.11984 3 7.8V12.2C3 13.8802 3 14.7202 3.32698 15.362C3.6146 15.9265 4.07354 16.3854 4.63803 16.673C5.27976 17 6.11984 17 7.8 17H8V21L13 17H16.2C17.8802 17 18.7202 17 19.362 16.673C19.9265 16.3854 20.3854 15.9265 20.673 15.362C21 14.7202 21 13.8802 21 12.2V7.8C21 6.11984 21 5.27976 20.673 4.63803C20.3854 4.07354 19.9265 3.6146 19.362 3.32698C18.7202 3 17.8802 3 16.2 3Z" />
      <path d="M9.0258 12.2118C9.03341 11.9795 9.03721 11.8633 9.06595 11.7542C9.09143 11.6575 9.13129 11.5651 9.18418 11.4804C9.24382 11.3847 9.32568 11.3025 9.48939 11.1381L13.4359 7.17476C13.6331 6.97678 13.9407 6.9431 14.1757 7.09378C14.4595 7.27574 14.7015 7.51618 14.8858 7.79917L14.8987 7.81897C15.0597 8.06623 15.026 8.39297 14.818 8.60187L10.9081 12.5284C10.7382 12.699 10.6533 12.7843 10.5542 12.8455C10.4664 12.8998 10.3707 12.94 10.2705 12.9647C10.1575 12.9924 10.0374 12.9932 9.79717 12.9948L9 13L9.0258 12.2118Z" strokeWidth="1" />
    </svg>
  );
}

function CalendarCheckIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" {...strokeProps}>
      <path d="M16 2V4.12777M16 4.12777V6M16 4.12777C15.0589 4 13.8284 4 12 4C10.1716 4 8.94106 4 8 4.12777M16 4.12777C16.4978 4.19536 16.9146 4.29871 17.2961 4.45672C18.7663 5.06569 19.9343 6.23373 20.5433 7.7039C21 8.80653 21 10.2044 21 13C21 15.7956 21 17.1935 20.5433 18.2961C19.9343 19.7663 18.7663 20.9343 17.2961 21.5433C16.1935 22 14.7956 22 12 22C9.20435 22 7.80653 22 6.7039 21.5433C5.23373 20.9343 4.06569 19.7663 3.45672 18.2961C3 17.1935 3 15.7956 3 13C3 10.2044 3 8.80653 3.45672 7.7039C4.06569 6.23373 5.23373 5.06569 6.7039 4.45672C7.08538 4.29871 7.50219 4.19536 8 4.12777M8 2V4.12777M8 4.12777V6M8.75 13.9219L10.924 16.0936C11.99 14.2295 13.4794 12.6552 15.25 11.4462" />
    </svg>
  );
}

// Social icons live in @shared/socialIcons (imported above) so #05 and #03 match.

// ── Sub-components ────────────────────────────────────────────────────────────

function StarRatingInput() {
  const [hovered, setHovered] = useState(0);
  const [selected, setSelected] = useState(0);
  const active = hovered || selected;
  const path = 'M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2Z';

  return (
    <div className="sl-pi-stars">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          className="sl-pi-star-btn"
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => setSelected(i === selected ? 0 : i)}
          aria-label={`Rate ${i} star${i > 1 ? 's' : ''}`}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill={i <= active ? '#FBBC05' : 'none'} stroke={i <= active ? '#FBBC05' : '#a5b4bf'} strokeWidth="1.5" strokeLinejoin="round">
            <path d={path}/>
          </svg>
        </button>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface StoreSectionProps {
  /** Contact phones from the properties API; falls back to demo numbers. */
  phones?: { number: string; note?: string }[];
  /** Social links from the properties API; falls back to placeholder icons. */
  socials?: { platform: string; url: string }[];
  /** Live gate/office status from AccessHours; falls back to demo text. */
  hours?: { office: HoursStatus | null; gate: HoursStatus | null };
  /** Grouped weekly schedule per section for "See all Hours". */
  schedule?: { office: ScheduleRow[]; gate: ScheduleRow[] };
  /** Per-type day-by-day schedule for the "See all Hours" popup. */
  scheduleSections?: { title: string; rows: ScheduleRow[] }[];
  /** Property name, shown in the "Send us a Message" popup. */
  facilityName?: string;
  /** Its address, shown under the name in that popup. Without it the modal
   *  printed a bare facility name with nothing beneath. */
  facilityAddress?: string;
}

// Demo per-day hours shown in the popup until the API supplies real ones.
const DEMO_HOURS_SECTIONS: { title: string; rows: { days: string; hours: string }[] }[] = [
  { title: 'Gate Hours', rows: [
    { days: 'Monday', hours: '6:00am – 11:30pm' }, { days: 'Tuesday', hours: '6:00am – 11:30pm' },
    { days: 'Wednesday', hours: '6:00am – 11:30pm' }, { days: 'Thursday', hours: '6:00am – 11:30pm' },
    { days: 'Friday', hours: '6:00am – 11:30pm' }, { days: 'Saturday', hours: '6:00am – 11:30pm' },
    { days: 'Sunday', hours: '6:00am – 11:30pm' },
  ] },
  { title: 'Office Hours', rows: [
    { days: 'Monday', hours: '8:30am – 6:00pm' }, { days: 'Tuesday', hours: '8:30am – 6:00pm' },
    { days: 'Wednesday', hours: '8:30am – 6:00pm' }, { days: 'Thursday', hours: '8:30am – 6:00pm' },
    { days: 'Friday', hours: '8:30am – 6:00pm' }, { days: 'Saturday', hours: '8:30am – 5:00pm' },
    { days: 'Sunday', hours: '10:00am – 4:00pm' },
  ] },
];

// Default contact numbers shown until the API supplies real ones.
const DEMO_PHONES = [
  { number: '(877) 657-7465', note: 'New Customer' },
  { number: '(877) 847-9487', note: 'Existing Customer' },
];

export function StoreSection({ phones, socials, hours, scheduleSections, facilityName, facilityAddress }: StoreSectionProps = {}) {
  // The bound property, so the enquiry files against the facility the shopper
  // is actually looking at. The old clone sent none and fell back to
  // config.json's — which on this site is another company's property.
  const leadPropertyId = usePropertyId();

  /* Every property on the company, for the contact modal's "Select Property".
     Fetched when the modal is first opened rather than on mount: nothing else
     in this section needs it, and a shopper who never opens the form should not
     pay for the request. fetchFacilities promise-caches per company, so if #03
     is on the same page the two share one flight.

     cfg is read directly here because this section is built into a module-level
     map with nowhere to pass a prop (see propertyContext / SectionAccordion) —
     the same reason leadPropertyId comes from context. fetchFacilities resolves
     the real company itself and only falls back to this. */
  const [facilityOptions, setFacilityOptions] = useState<FacilityOption[]>([]);
  const [hoursOpen, setHoursOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [reservationCode, setReservationCode] = useState('');

  useEffect(() => {
    if (!messageOpen || facilityOptions.length) return undefined;
    let cancelled = false;
    void fetchFacilities('#05 space-list', cfg).then((list) => {
      if (!cancelled) setFacilityOptions(list);
    });
    return () => { cancelled = true; };
    // facilityOptions is read by the guard above; depending on it would re-run
    // this the moment the list lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageOpen]);

  const phoneList = phones && phones.length ? phones : DEMO_PHONES;

  // Live gate/office status from AccessHours; demo text until loaded.
  const gate = hours?.gate;
  const office = hours?.office;
  const gateStatusText = gate?.label ?? 'Gate Open';
  const gateStatusNote = gate?.note ?? 'Closes 11:30pm';
  const officeStatusText = office?.label ?? 'Office Closed';
  const officeStatusNote = office?.note ?? 'Opens 8:30am';
  const gateStatusCls = `sl-pi-status--${gate ? (gate.isOpen ? 'open' : 'closed') : 'open'}`;
  const officeStatusCls = `sl-pi-status--${office ? (office.isOpen ? 'open' : 'closed') : 'closed'}`;
  // Full per-type, day-by-day schedule for the popup; demo until the API loads.
  const hoursSections = scheduleSections && scheduleSections.length ? scheduleSections : DEMO_HOURS_SECTIONS;

  // Esc closes the hours popup; lock background scroll while open.
  useEffect(() => {
    if (!hoursOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setHoursOpen(false); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; };
  }, [hoursOpen]);

  // Map API platforms → icon (API sends "twitter"; icon key is "x").
  const socialUrlByKey = new Map<string, string>();
  for (const s of socials ?? []) {
    const key = s.platform === 'twitter' ? 'x' : s.platform;
    if (!socialUrlByKey.has(key)) socialUrlByKey.set(key, s.url);
  }
  const socialItems = socialUrlByKey.size
    ? SOCIAL_ICONS.filter((s) => socialUrlByKey.has(s.key)).map((s) => ({ ...s, url: socialUrlByKey.get(s.key)! }))
    : SOCIAL_ICONS.map((s) => ({ ...s, url: '#' }));

  return (
    <div className="sl-pi">

      {/* ── Call our Storage Experts ── */}
      <div className="sl-pi-card">
        <div className="sl-pi-card-header">
          <PhoneIcon />
          <span className="sl-pi-card-title">Call our Storage Experts</span>
        </div>
        <div className="sl-pi-card-body">
          {phoneList.map((p, i) => (
            <p className="sl-pi-phone-row" key={`${p.number}-${i}`}>
              <a href={`tel:${p.number.replace(/[^0-9+]/g, '')}`} className="sl-pi-phone-link">{p.number}</a>
              {p.note && <span className="sl-pi-phone-label"> ({p.note})</span>}
            </p>
          ))}
        </div>
      </div>

      {/* ── Send us a Message ── */}
      <button className="sl-pi-card sl-pi-card--action" onClick={() => setMessageOpen(true)}>
        <div className="sl-pi-card-header">
          <EnvelopeIcon />
          <span className="sl-pi-card-title">Send us a Message</span>
        </div>
      </button>

      {/* ── Hours ── */}
      <div className="sl-pi-card">
        <div className="sl-pi-card-header">
          <ClockIcon />
          <span className="sl-pi-card-title">Hours</span>
        </div>
        <div className="sl-pi-card-body">
          <p className="sl-pi-hours-status">
            <span className={gateStatusCls}>{gateStatusText}</span>
            {gateStatusNote && <span className="sl-pi-status-detail"> ({gateStatusNote})</span>}
          </p>
          <p className="sl-pi-hours-status">
            <span className={officeStatusCls}>{officeStatusText}</span>
            {officeStatusNote && <span className="sl-pi-status-detail"> ({officeStatusNote})</span>}
          </p>

          {/* No chevron: this opens a modal, it does not expand in place, and a
              chevron promised disclosure it never delivered. Matches #03's
              "See all Hours", which has always been plain text. */}
          <button className="sl-pi-see-hours" onClick={() => setHoursOpen(true)}>
            See all Hours
          </button>
        </div>
      </div>

      {/* ── Hours popup ── */}
      {hoursOpen && (
        <div className="sl-hours-overlay" onMouseDown={() => setHoursOpen(false)}>
          <div className="sl-hours-modal" role="dialog" aria-modal="true" aria-label="Hours" onMouseDown={(e) => e.stopPropagation()}>
            <div className="sl-hours-head">
              <span className="sl-hours-title"><ClockIcon /><span>Hours</span></span>
              <button type="button" className="sl-hours-close" aria-label="Close" onClick={() => setHoursOpen(false)}>
                {/* Filled disc: .sl-hours-modal is #fff. */}
                <CloseCircleIcon size={32} />
              </button>
            </div>
            <div className="sl-hours-body">
              {hoursSections.map((sec) => (
                <div className="sl-hours-col" key={sec.title}>
                  <p className="sl-hours-col-title">{sec.title}</p>
                  {sec.rows.map((r) => (
                    <p className="sl-hours-line" key={r.days}>{r.days}: {r.hours}</p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Rate and Review ── */}
      <div className="sl-pi-card">
        <div className="sl-pi-card-header">
          <WriteReviewIcon />
          <span className="sl-pi-card-title">Rate and Review</span>
        </div>
        <div className="sl-pi-card-body sl-pi-card-body--stars">
          <StarRatingInput />
        </div>
      </div>

      {/* ── Find my Reservation ── */}
      <div className="sl-pi-card">
        <div className="sl-pi-card-header">
          <CalendarCheckIcon />
          <span className="sl-pi-card-title">Find my Reservation</span>
        </div>
        <div className="sl-pi-card-body sl-pi-card-body--reservation">
          <input
            className="sl-pi-reservation-input"
            type="text"
            placeholder="Reservation Code"
            value={reservationCode}
            onChange={(e) => setReservationCode(e.target.value)}
          />
          <button className="sl-pi-reservation-go">Go</button>
        </div>
      </div>

      {/* ── Social icons ── */}
      <div className="sl-pi-social">
        {socialItems.map(({ key, label, Icon, url }) => (
          <a key={key} className="sl-pi-social-link" href={url}
            target={url !== '#' ? '_blank' : undefined}
            rel={url !== '#' ? 'noopener noreferrer' : undefined}
            aria-label={label}><Icon /></a>
        ))}
      </div>

      {/* The SHARED modal — #05 used to keep its own clone of #03's, which is
          how it fell two revisions behind. createLead is injected because the
          creds are this widget's. */}
      <MessageModal
        open={messageOpen}
        onClose={() => setMessageOpen(false)}
        /* The portfolio once it lands; this listing's own property until then,
           and if the call fails — which is what this passed before. */
        facilities={facilityOptions.length
          ? facilityOptions
          : [{ name: facilityName || 'This Facility', address: facilityAddress }]}
        /* Preselected, and taken OUT of the fetched list by id where possible so
           the chosen entry is the same object the dropdown holds — same
           reasoning as #03's. */
        defaultFacility={
          facilityOptions.find((f) => f.id === leadPropertyId)
          ?? { name: facilityName || 'This Facility', address: facilityAddress }
        }
        submitLead={(input) => createLead(input, { propertyId: leadPropertyId })}
      />

    </div>
  );
}
