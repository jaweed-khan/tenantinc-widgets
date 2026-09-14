// ===========================================================================
// Icons for #19, each backed by the asset EXPORTED FROM FIGMA (9030-31458)
// rather than redrawn. webpack inlines them as data URIs (`asset/inline`), so
// the AMD bundle stays one self-contained file — the same reason #14 and #99
// carry their artwork this way.
//
// Every wrapper sets BOTH dimensions explicitly at the asset's own intrinsic
// size. Nothing here is sized by a descendant rule or left to `auto`, so the
// four 24px stroke glyphs, the 16px marks and the two Google Pay leaves each
// keep the geometry they were drawn at.
//
// Icons the shared kit ALREADY has — map pin, phone, info circle — are NOT
// duplicated here; MyAccount.tsx imports those from '@shared/ui'. The two
// info marks below are the EXCEPTION: the kit's InfoIcon is an outline
// circle-i, and the autopay states (12239-45881) draw mdiInformation FILLED,
// so the kit glyph does not match and the Figma export is used instead.
// ===========================================================================

import bankAsset from './assets/bank.svg';
import checkAsset from './assets/check.svg';
import chevronRightAsset from './assets/chevron-right.svg';
import chevronRight24Asset from './assets/chevron-right-24.svg';
import creditCardAsset from './assets/credit-card.svg';
import creditCardRemoveAsset from './assets/credit-card-remove.svg';
import creditCardRepeatAsset from './assets/credit-card-repeat.svg';
import gpayGMarkAsset from './assets/gpay-g-mark.svg';
import gpayTypefaceAsset from './assets/gpay-typeface.svg';
import shieldSettingsAsset from './assets/shield-settings.svg';
import carFrontAsset from './assets/car-front.svg';
import envelopeAsset from './assets/envelope.svg';
import fileTextAsset from './assets/file-text.svg';
import userArrowRightAsset from './assets/user-arrow-right.svg';
import userSettingsAsset from './assets/user-settings.svg';
import infoFilledAsset from './assets/info-filled.svg';
import infoNoticeAsset from './assets/info-notice.svg';

interface AssetIconProps {
  className?: string;
}

/** 24×24 stroke glyphs — the sizes Figma exported them at. */
export function BankIcon({ className }: AssetIconProps) {
  return <img src={bankAsset} alt="" width={24} height={24} className={className} aria-hidden="true" />;
}

export function CreditCardIcon({ className }: AssetIconProps) {
  return <img src={creditCardAsset} alt="" width={24} height={24} className={className} aria-hidden="true" />;
}

export function CreditCardRemoveIcon({ className }: AssetIconProps) {
  return <img src={creditCardRemoveAsset} alt="" width={24} height={24} className={className} aria-hidden="true" />;
}

export function CreditCardRepeatIcon({ className }: AssetIconProps) {
  return <img src={creditCardRepeatAsset} alt="" width={24} height={24} className={className} aria-hidden="true" />;
}

export function ShieldSettingsIcon({ className }: AssetIconProps) {
  return <img src={shieldSettingsAsset} alt="" width={24} height={24} className={className} aria-hidden="true" />;
}

/** 16×16. */
export function AmenityCheckIcon({ className }: AssetIconProps) {
  return <img src={checkAsset} alt="" width={16} height={16} className={className} aria-hidden="true" />;
}

/**
 * mdiInformation, FILLED — sits beside "Autopay Enrollment". 16×16 with the
 * fill baked in at the frame's #101318; the kit's InfoIcon is the outline
 * variant and is a different glyph, not a recolour of this one.
 */
export function InfoFilledIcon({ className }: AssetIconProps) {
  return <img src={infoFilledAsset} alt="" width={16} height={16} className={className} aria-hidden="true" />;
}

/** The same mark at the notice banner's own size and Guidance blue. 24×24. */
export function InfoNoticeIcon({ className }: AssetIconProps) {
  return <img src={infoNoticeAsset} alt="" width={24} height={24} className={className} aria-hidden="true" />;
}

/** 32×32 — the Payment Activity disclosure, rotated to point down in CSS. */
export function ChevronBigRightIcon({ className }: AssetIconProps) {
  return <img src={chevronRightAsset} alt="" width={32} height={32} className={className} aria-hidden="true" />;
}

/**
 * The SAME chevron at the size the Edit panel's select draws it — 24, not the
 * 32 above scaled down. Figma exports the glyph at each size it is used, and
 * a 32px stroke squeezed into 24 is a thinner line than the one beside it.
 */
export function ChevronBigRight24Icon({ className }: AssetIconProps) {
  return <img src={chevronRight24Asset} alt="" width={24} height={24} className={className} aria-hidden="true" />;
}

/**
 * Google Pay lockup. The kit's <GooglePayMark /> is NOT reused here: its "Pay"
 * wordmark is #3C4043, which is invisible on this button's #101318 fill. These
 * are the frame's own two leaves — the four-colour G and the white typeface —
 * kept at their exported sizes and overlapped exactly as the design lays them
 * out (the typeface offset 33.1px right, 1.59px down from the mark's origin).
 */
export function GooglePayLockup() {
  return (
    <span className="ma-gpay" role="img" aria-label="Google Pay">
      <img src={gpayGMarkAsset} alt="" width={24.6881} height={25.0421} className="ma-gpay__mark" />
      <img src={gpayTypefaceAsset} alt="" width={43.8769} height={28.4063} className="ma-gpay__type" />
    </span>
  );
}

/* ── Account Info view (8815-115354) ─────────────────────────────────────── */

export function UserSettingsIcon({ className }: AssetIconProps) {
  return <img src={userSettingsAsset} alt="" width={24} height={24} className={className} aria-hidden="true" />;
}

export function EnvelopeIcon({ className }: AssetIconProps) {
  return <img src={envelopeAsset} alt="" width={24} height={24} className={className} aria-hidden="true" />;
}

export function CarFrontIcon({ className }: AssetIconProps) {
  return <img src={carFrontAsset} alt="" width={24} height={24} className={className} aria-hidden="true" />;
}

export function FileTextIcon({ className }: AssetIconProps) {
  return <img src={fileTextAsset} alt="" width={24} height={24} className={className} aria-hidden="true" />;
}

export function UserArrowRightIcon({ className }: AssetIconProps) {
  return <img src={userArrowRightAsset} alt="" width={24} height={24} className={className} aria-hidden="true" />;
}

/* Minus / Plus for the mobile prepay stepper (Figma 9023-27879 / 9023-27873).
   Drawn inline rather than added to the bundled asset set: two strokes each,
   and they need `currentColor` so the buttons can invert on press. */
export function MinusIcon({ className }: AssetIconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M5 12h14" />
    </svg>
  );
}

export function PlusIcon({ className }: AssetIconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
