import React, { useEffect } from 'react';
import { CloseCircleIcon } from '@shared/ui/icons';
import { TagOutlineIcon } from './icons';

/**
 * Promotion disclaimer / fine-print modal (Figma 7158:80964).
 *
 * Opened by the (i) control on a promo bar. The copy was previously reachable
 * only as the button's native `title` tooltip — which never appears on touch,
 * can't be selected or scrolled, and is truncated by the browser. Long fine
 * print is exactly the content that needs a real surface.
 *
 * Structure and behaviour deliberately mirror the "See all Hours" modal in #05
 * (.sl-hours-*): same 20px radius, hb-elevation-large shadow, inner header
 * divider, 32px close, and the same close-on-overlay / Escape / scroll-lock
 * contract. The styles are duplicated rather than imported because each widget
 * ships as its own AMD bundle and cannot reach another's CSS.
 */
export function DisclaimerModal({
  title,
  body,
  onClose,
}: {
  title: string;
  body: string;
  onClose: () => void;
}) {
  // Escape closes, and the host page is locked while open. Restores the
  // previous overflow rather than clearing it — Duda pages set their own, and
  // blanking it would leave the page scrollable when it should not be.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  // Blank lines in the API's description become paragraph breaks, matching the
  // two-paragraph frame. Falls back to a single block when there are none.
  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  return (
    // mousedown, not click: a drag that STARTS inside the card and releases on
    // the overlay (selecting the fine print) would otherwise close it.
    <div className="promo-modal-overlay" onMouseDown={onClose} role="presentation">
      <div
        className="promo-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="promo-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="promo-modal-head">
          <p className="promo-modal-title" id="promo-modal-title">
            {/* Hollow variant here — the promo bar's filled tag is a different
                style in the design (Figma Tag style="Stroke"). */}
            <TagOutlineIcon size={24} />
            <span>{title}</span>
          </p>
          <button type="button" className="promo-modal-close" onClick={onClose} aria-label="Close">
            {/* Filled disc: .promo-modal is #ffffff, so the outlined ring
                #03's lightbox and the mega menu use (both dark) would be
                invisible here.
                32 desktop AND mobile, and every part of this control is the
                "Send us a Message" modal's, which is the contact-popup
                standard: same mark, same 32px box with no padding, same hover.
                It carries no mobile override for the same reason that one
                doesn't — one size serves both. Was an 18px glyph adrift in a
                32px button, which matched no other popup here. */}
            <CloseCircleIcon size={32} />
          </button>
        </div>
        <div className="promo-modal-body">
          {paragraphs.map((p, i) => (
            <p className="promo-modal-text" key={i}>{p}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
