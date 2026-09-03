// ===========================================================================
// Form field icons — inline SVG, traced byte-for-byte from the Figma exports
// (Mariposa — Duda, node 8753-47700).
//
// INLINE, NOT URLs. The widgets ship as AMD bundles loaded into Duda from a CDN
// and cannot pull remote assets at runtime; Figma's own export URLs also expire
// after ~7 days. Same reasoning as `widget-tier-selection/paymentIcons.tsx`.
//
// GEOMETRY. Every icon is a 24×24 box (`--hb-field-icon-size`) containing the
// exported artwork at its natural size, translated to the offset the design
// specifies. The translate values are derived from each node's Figma insets, NOT
// eyeballed — e.g. the check tick sits in a 14.5×10.72 leaf inset 22.92%/29.17%,
// which after the stroke bleed puts its 16.5×12.72 artwork at (4.5, 6). Nothing
// is scaled, so stroke weights stay a true 2px across the whole set.
//
// COLOUR. Every stroke is `currentColor`, so state colour is set once in CSS on
// the wrapper (grey at rest, green on success, red on error) instead of being
// baked into each icon.
// ===========================================================================

import React from 'react';

export interface IconProps {
  /** Square px size. Defaults to the 24px the form fields use. */
  size?: number;
  className?: string;
}

/** Shared 24-grid frame. `tx`/`ty` place the artwork exactly as Figma does. */
function Frame({
  size = 24,
  className,
  tx,
  ty,
  children,
}: IconProps & { tx: number; ty: number; children: React.ReactNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <g
        transform={`translate(${tx} ${ty})`}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </g>
    </svg>
  );
}

/** search/search-default — "find, explore, magnifying glass, look up". */
export function SearchIcon(props: IconProps) {
  return (
    <Frame {...props} tx={2} ty={2}>
      <path d="M19 19L12.9497 12.9497M12.9497 12.9497C14.2165 11.683 15 9.933 15 8C15 4.13401 11.866 1 8 1C4.13401 1 1 4.13401 1 8C1 11.866 4.13401 15 8 15C9.933 15 11.683 14.2165 12.9497 12.9497Z" />
    </Frame>
  );
}

/** location pin, filled — hollow centre. Traced from Figma 1321316563. */
export function MapPinSolidIcon({ size = 24, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="36 30 24 24" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M48.0004 32C46.3383 32 44.1609 32.5762 42.3799 34.0223C40.5615 35.4988 39.2109 37.8406 39.2109 41.2222C39.2109 44.6327 40.8256 47.4361 42.6495 49.3614C43.5639 50.3266 44.5503 51.0928 45.4559 51.6239C46.3216 52.1315 47.2416 52.5 48.0004 52.5C48.7592 52.5 49.6792 52.1315 50.5449 51.6239C51.4505 51.0928 52.4369 50.3266 53.3514 49.3614C55.1753 47.4361 56.7899 44.6327 56.7899 41.2222C56.7899 37.8406 55.4393 35.4988 53.6209 34.0223C51.8399 32.5762 49.6625 32 48.0004 32ZM44.5796 40.7895C44.5796 38.9001 46.1112 37.3684 48.0006 37.3684C49.89 37.3684 51.4217 38.9001 51.4217 40.7895C51.4217 42.6789 49.89 44.2105 48.0006 44.2105C46.1112 44.2105 44.5796 42.6789 44.5796 40.7895Z" />
    </svg>
  );
}

/** calendar/calendar-default — "date, schedule, month, event, plan". */
export function CalendarIcon(props: IconProps) {
  return (
    <Frame {...props} tx={2} ty={1}>
      <path d="M6 1V3.12777M6 5V3.12777M14 1V3.12777M14 5V3.12777M6 3.12777C5.50219 3.19536 5.08538 3.29871 4.7039 3.45672C3.23373 4.06569 2.06569 5.23373 1.45672 6.7039C1.20333 7.31564 1.09052 8.01824 1.0403 9C1 9.78781 1 10.7554 1 12C1 14.7956 1 16.1935 1.45672 17.2961C2.06569 18.7663 3.23373 19.9343 4.7039 20.5433C5.80653 21 7.20435 21 10 21C12.7956 21 14.1935 21 15.2961 20.5433C16.7663 19.9343 17.9343 18.7663 18.5433 17.2961C19 16.1935 19 14.7956 19 12C19 10.7554 19 9.78781 18.9597 9M18.9597 9C18.9095 8.01824 18.7967 7.31564 18.5433 6.7039C17.9343 5.23373 16.7663 4.06569 15.2961 3.45672C14.9146 3.29871 14.4978 3.19536 14 3.12777M18.9597 9H1.0403M6 3.12777C6.94106 3 8.17157 3 10 3C11.8284 3 13.0589 3 14 3.12777" />
    </Frame>
  );
}

/** check tick/check-tick-single — "confirm, done, approve, success, validation". */
export function CheckIcon(props: IconProps) {
  return (
    <Frame {...props} tx={4.5} ty={6}>
      <path d="M1.00002 6.5001L5.51686 11.7248L5.91769 11.0239C8.06683 7.26593 11.0411 4.0449 14.6162 1.60364L15.5 1.0001" />
    </Frame>
  );
}

/** alert/alert-triangle — "warning, hazard, caution, critical, attention". */
export function AlertIcon(props: IconProps) {
  return (
    <Frame {...props} tx={0.875} ty={2}>
      <path d="M11.1249 11.0001V7.0001M11.1249 14.3751V14.3762M9.73501 1.28373C10.6239 0.905424 11.626 0.905424 12.5149 1.28373C15.1663 2.41217 21.4295 12.4218 21.246 15.0972C21.174 16.1459 20.6544 17.1112 19.8222 17.7421C17.6094 19.4193 4.64042 19.4193 2.42773 17.7421C1.59552 17.1112 1.07585 16.1459 1.0039 15.0972C0.82034 12.4218 7.08357 2.41217 9.73501 1.28373Z" />
    </Frame>
  );
}

/** information/information-circle — "info, details, help, guide, support". */
export function InfoIcon(props: IconProps) {
  return (
    <Frame {...props} tx={2} ty={2}>
      <path d="M10 9.99991V13.9999M10 6.6249V6.62378M19 10C19 14.9706 14.9706 19 10 19C5.02944 19 1 14.9706 1 10C1 5.02944 5.02944 1 10 1C14.9706 1 19 5.02944 19 10Z" />
    </Frame>
  );
}

/** eye/eye-on — "visibility, view, open, watch, seen". Value is revealed. */
export function EyeOnIcon(props: IconProps) {
  return (
    <Frame {...props} tx={2} ty={4}>
      <path d="M19 8C19 10 15.5 15 10 15C4.5 15 1 10 1 8C1 6 4.5 1 10 1C15.5 1 19 6 19 8Z" />
      <path d="M13 8C13 9.65685 11.6569 11 10 11C8.34315 11 7 9.65685 7 8C7 6.34315 8.34315 5 10 5C11.6569 5 13 6.34315 13 8Z" />
    </Frame>
  );
}

/** eye/eye-off — "visibility hidden, private, conceal, unseen". Value is masked. */
export function EyeOffIcon(props: IconProps) {
  return (
    <Frame {...props} tx={1} ty={1}>
      <path d="M19.0778 8.57842C19.6787 9.51267 20 10.394 20 11C20 13 16.5 18 11 18C10.569 18 10.1502 17.9693 9.74452 17.9117M16.2929 5.70713C14.8674 4.71248 13.0762 4 11 4C5.5 4 2 9 2 11C2 12.245 3.35633 14.6526 5.70713 16.2929M13.1213 8.87868L16.2929 5.70713L21 1M8.87868 13.1213L5.70713 16.2929L1 21M8.87868 13.1213C8.33579 12.5784 8 11.8284 8 11C8 9.34315 9.34315 8 11 8C11.8284 8 12.5784 8.33579 13.1213 8.87868M8.87868 13.1213L13.1213 8.87868" />
    </Frame>
  );
}

/** close/x — "dismiss, cancel, remove, close dialog". */
/**
 * The design system's Close mark (Figma 6103:14869 / 8507-23643) — FILLED, and
 * drawn edge-to-edge in its own 18x18 box.
 *
 * Separate from CloseIcon below, which is a 2px STROKE whose glyph occupies
 * only the middle 50% of the shared 24x24 frame: at size={18} that renders a
 * 9px mark, half what the caller asked for. Existing callers are left on it so
 * nothing shifts; anything matching the frames should use this.
 */
/**
 * The checkbox tick — a SOLID geometric mark, not the curved Pika check.
 *
 * Deliberately not square: the design's glyph is 13.41 x 10.12, and the
 * viewBox is cropped to exactly that, so `size` means the drawn width rather
 * than a frame the mark floats inside. Forcing width === height would stretch
 * it.
 */
export function CheckTickSolid({ size = 13, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={(size * 10.1214) / 13.4143}
      viewBox="10.293 11.7928 13.4143 10.1214"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M15 21.9142L23.7073 13.207L22.293 11.7928L15 19.0857L11.7073 15.7928L10.293 17.207L15 21.9142Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function CloseSolidIcon({ size = 18, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="currentColor"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <path d="M18 1.81286L16.1871 0L9 7.18714L1.81286 0L0 1.81286L7.18714 9L0 16.1871L1.81286 18L9 10.8129L16.1871 18L18 16.1871L10.8129 9L18 1.81286Z" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Frame {...props} tx={5} ty={5}>
      <path d="M1 1L13 13M13 1L1 13" />
    </Frame>
  );
}

// --- Order-summary rail icons (shared by value-tiers + rental-flow) ----------

export function TagIcon({ size = 16, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8.56536 2.06851C10.0052 1.99251 10.91 1.94475 11.7786 2.11974C12.5471 2.27458 13.2842 2.55741 13.959 2.95642C14.7216 3.40739 15.3622 4.04817 16.3816 5.06789L19.0422 7.72841C20.2226 8.90824 20.9861 9.6713 21.4186 10.5202C22.2906 12.2315 22.2906 14.2568 21.4186 15.9681C20.9861 16.817 20.2226 17.5801 19.0422 18.7599L18.7599 19.0422C17.5801 20.2226 16.817 20.9861 15.9681 21.4186C14.2568 22.2906 12.2315 22.2906 10.5202 21.4186C9.6713 20.9861 8.90826 20.2226 7.72841 19.0422L5.06789 16.3816C4.04817 15.3622 3.40739 14.7216 2.95642 13.959C2.55741 13.2842 2.27458 12.5471 2.11974 11.7786C1.94475 10.91 1.99251 10.0052 2.06851 8.56536L2.12104 7.56742C2.15943 6.83795 2.19124 6.23336 2.256 5.73945C2.32352 5.22452 2.43504 4.75288 2.67358 4.30811C3.04569 3.61428 3.61428 3.04569 4.30811 2.67358C4.75288 2.43504 5.22452 2.32352 5.73945 2.256C6.23337 2.19124 6.83795 2.15943 7.56743 2.12104L8.56536 2.06851ZM8.4895 6.48779C7.38493 6.48779 6.4895 7.38322 6.4895 8.48779C6.4895 9.59236 7.38493 10.4878 8.4895 10.4878C9.59407 10.4878 10.4895 9.59236 10.4895 8.48779C10.4895 7.38322 9.59407 6.48779 8.4895 6.48779Z" />
    </svg>
  );
}

export function MapPinIcon({ size = 24, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12.0004 13.7105C13.6137 13.7105 14.9215 12.4027 14.9215 10.7895C14.9215 9.17622 13.6137 7.86842 12.0004 7.86842C10.3872 7.86842 9.07936 9.17622 9.07936 10.7895C9.07936 12.4027 10.3872 13.7105 12.0004 13.7105Z" />
      <path d="M12.0004 21.5C13.9478 21.5 19.7899 17.3889 19.7899 11.2222C19.7899 5.05556 14.9215 3 12.0004 3C9.07936 3 4.21094 5.05556 4.21094 11.2222C4.21094 17.3889 10.053 21.5 12.0004 21.5Z" />
    </svg>
  );
}

export function PhoneIcon({ size = 24, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5.40731 12.974C4.16988 10.8771 3.35625 8.43264 3.03493 5.70916C2.89384 4.51323 3.63519 3.25377 4.89733 3.04738C5.29394 2.98252 5.78431 2.99232 6.18768 3.0287C7.87081 3.18051 8.56658 4.6661 8.93595 6.10803C9.43051 8.03869 8.82802 10.0852 7.36633 11.4397C6.76147 12.0002 6.06056 12.4721 5.40731 12.974ZM5.40731 12.974C6.72406 15.2053 8.52068 17.043 10.7146 18.4047M10.7146 18.4047C12.8787 19.7478 15.4294 20.6276 18.2874 20.965C19.4834 21.1062 20.7424 20.3643 20.9487 19.1022C21.0194 18.6693 21.011 18.1714 20.9595 17.7362C20.7499 15.9658 19.0455 15.2967 17.5244 14.9479C15.7912 14.5505 13.9733 15.0271 12.6579 16.2238C11.9438 16.8733 11.3466 17.6768 10.7146 18.4047Z" />
    </svg>
  );
}

// --- Circular close button ---------------------------------------------------

/**
 * The dark circular close button — Figma exports `Frame 1321316547` (52, desktop)
 * and `Frame 1321316546` (32, mobile).
 *
 * ONE component, not two: the two frames are the same drawing at two scales.
 * 52/32 = 1.625, and every value scales by exactly that — stroke 3.25/2, the
 * arm inset 16.25/10, the radius 26/16. So the 32 export is reproduced by
 * rendering the 52 geometry at `size={32}`, and a `viewBox` scale keeps the
 * stroke proportional instead of pinning it at a fixed px like the 24-grid
 * icons above.
 *
 * Unlike the rest of this file this is a BUTTON FACE, not a glyph: it carries
 * its own circle, so it does not take `currentColor` for the ground.
 * `color` sets the X and `background` the disc, both overridable.
 *
 * `outlined` is a stroked ring with a TRANSPARENT centre, so the surface shows
 * through and `background` is unused. Figma ships it in both colourways, which
 * are the same geometry and differ only in `color`: white for a dark surface
 * (`Frame 1321316550` / `1321316551`) and night for a light one
 * (`Frame 1321316549` / `1321316548`).
 *
 * The ring is the one part that does NOT scale by 1.625: Figma insets it 1.5 at
 * stroke 3 on the 52, but 1 at stroke 2 on the 32 — a 1.5 ratio. So its two
 * values are chosen per size rather than scaled, which is why `outlined` reads
 * the size instead of leaving everything to the viewBox. The X is untouched by
 * this and still scales.
 */
export function CloseCircleIcon({
  size = 52,
  className,
  outlined = false,
  /* Literal fallbacks are load-bearing, not belt-and-braces: a widget that
     imports this module directly (rather than the @shared/ui barrel) never
     loads tokens.css, so these custom properties are undefined there. As SVG
     presentation attributes an undefined var() is invalid at computed-value
     time and falls back to the INHERITED value — stroke: none — so the mark
     would simply not draw. */
  color = 'var(--hb-white, #ffffff)',
  background = 'var(--hb-text-night, #101318)',
}: IconProps & {
  /** Stroked ring with a transparent centre — the dark-surface treatment. */
  outlined?: boolean;
  /** The X stroke, and the ring when `outlined`. */
  color?: string;
  /** The disc behind it. Ignored when `outlined` — the centre stays transparent. */
  background?: string;
}) {
  // Figma draws the ring thinner on the small frame; anything at or below 32
  // takes the 32's values so the mobile export is reproduced exactly.
  //
  // Both are given in the SOURCE frame's units and converted into this 52
  // viewBox, because the 32's `stroke-width: 2` means 2px of a 32 frame — left
  // as a literal 2 here the viewBox would shrink it to 1.23px on screen.
  const small = size <= 32;
  const toViewBox = small ? 52 / 32 : 1;
  const ringWidth = (small ? 2 : 3) * toViewBox;
  const ringInset = (small ? 1 : 1.5) * toViewBox;

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 52 52"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      {outlined ? (
        <rect
          x={ringInset}
          y={ringInset}
          width={52 - ringInset * 2}
          height={52 - ringInset * 2}
          rx={26 - ringInset}
          stroke={color}
          strokeWidth={ringWidth}
        />
      ) : (
        <rect width="52" height="52" rx="26" fill={background} />
      )}
      <g stroke={color} strokeWidth="3.25" strokeLinecap="round">
        <path d="M16.25 35.75L35.75 16.25" />
        <path d="M16.25 16.25L35.75 35.75" />
      </g>
    </svg>
  );
}
