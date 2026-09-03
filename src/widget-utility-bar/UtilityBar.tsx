import React, { useEffect, useRef, useState } from 'react';
import './UtilityBar.css';
import { CloseCircleIcon } from '@shared/ui/icons';
import { InfoIcon, CloseIcon } from './icons';

// ---------------------------------------------------------------------------
// Utility Bar — a dismissible announcement bar.
//
// Dismissal: clicking × writes a flag to localStorage that hides the bar for
// `dismissDurationHours` (default 24h). On load the bar stays hidden until the
// flag expires, then reappears automatically.
//
// Editor aid: when `inEditor` is true a small floating debug panel shows the
// current state + live countdown and offers a "Delete Flag" button so an editor
// can clear the dismissal and make the bar pop back up.
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'tenantinc_utility_bar_dismissed';

interface DismissFlag {
  dismissed: boolean;
  expires: number;
}

function getFlag(): DismissFlag | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DismissFlag;
    if (!parsed?.expires) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isFlagActive(): boolean {
  const flag = getFlag();
  if (!flag) return false;
  if (Date.now() >= flag.expires) {
    clearFlag();
    return false;
  }
  return true;
}

function persistDismiss(durationHours: number): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ dismissed: true, expires: Date.now() + durationHours * 60 * 60 * 1000 }),
    );
  } catch {
    /* sandboxed iframe / storage disabled — fail soft */
  }
}

function clearFlag(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* fail soft */
  }
}

function msToHMS(ms: number): string {
  if (ms <= 0) return '0s';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

export interface UtilityBarProps {
  message?: string;
  showInfo?: boolean;
  infoMessage?: string;
  infoStyle?: 'tooltip' | 'modal';
  showClose?: boolean;
  sticky?: boolean;
  dismissDurationHours?: number;
  /**
   * Bar colour, from the Duda content menu's radio group
   * (`data.config.utilitybarColour`): `black` | `primary` | `cta`.
   *
   * Anything else — unset, an unsubstituted token, a value someone renames in
   * Duda — falls back to black, which is what the bar has always been.
   */
  utilitybarColour?: string;
  /**
   * Message, info mark and close mark colour, from the Duda content menu's
   * radio group (`data.config.textColour`): `white` | `black`. Anything else
   * falls back to white. The tooltip keeps its own palette either way — it is
   * a dark box floating off the bar, not part of it.
   */
  textColour?: string;
  inEditor?: boolean;
}

export function UtilityBar({
  message = '$30 Admin fee applied to all transactions',
  showInfo = true,
  infoMessage = 'This fee covers administrative processing and is applied once per transaction.',
  infoStyle = 'tooltip',
  showClose = true,
  sticky = false,
  dismissDurationHours = 24,
  utilitybarColour,
  textColour,
  inEditor = false,
}: UtilityBarProps) {
  /* Normalised, not trusted: Duda sends whatever the radio's value column
     holds, and an unbound field can arrive as '', undefined, or a literal
     '{{utilitybarColour}}'. Only the three known values do anything. */
  const barTone = (() => {
    const v = String(utilitybarColour ?? '').trim().toLowerCase();
    return v === 'primary' || v === 'cta' ? v : 'black';
  })();
  /* Same treatment: only 'black' does anything, everything else is white. */
  const textTone = String(textColour ?? '').trim().toLowerCase() === 'black' ? 'black' : 'white';
  // Read the flag synchronously on first render so the bar never flashes.
  const [flagActive, setFlagActive] = useState<boolean>(() => isFlagActive());
  const [, setTick] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);

  // While dismissed, tick every second to drive the countdown and to auto-show
  // the bar the moment the flag expires (even with the page left open).
  useEffect(() => {
    if (!flagActive) return;
    const id = window.setInterval(() => {
      if (!isFlagActive()) setFlagActive(false);
      else setTick((t) => t + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [flagActive]);

  useEffect(() => {
    if (!modalOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setModalOpen(false);
    }
    document.addEventListener('keydown', onKey);
    /* The page behind must not scroll under the overlay. Body overflow, the
       same lock every other modal in the repo uses — safe here because this
       widget's bar is `position: fixed`, not sticky, so an overflow-hidden
       body cannot take away a scrollport it never used. */
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [modalOpen]);

  function handleClose() {
    persistDismiss(dismissDurationHours);
    setFlagActive(true);
  }

  function handleDeleteFlag() {
    clearFlag();
    setFlagActive(false);
  }

  const showBar = !flagActive;
  const showDebug = inEditor;
  const empty = !showBar && !showDebug;

  /**
   * Collapse the HOST too, not just our own output.
   *
   * Returning null already leaves nothing of ours on the page, but the element
   * Duda wraps an external app in keeps its own box — so a visitor who dismissed
   * the bar was left with a band of the row's padding sitting above the header.
   * Nothing inside React can reach that, because it is not ours to render.
   *
   * Hides what it finds and restores the previous INLINE value AND its priority
   * on the way back — never a blanket `display: ''`, which would wipe a display
   * the theme had set deliberately.
   *
   * `none` goes on with `!important`. The chain is Duda's own furniture
   * (`.flex-element`, `.widget-wrapper`, `.dmCustomWidget`), and Duda's flex
   * layout states `display` on those from its own sheet — a plain inline value
   * loses to any of those rules that carries `!important`, and we would be
   * hiding nothing while appearing to. Nothing else here needs forcing: the
   * host's `min-height: 10px` (the 10px band that survived) and its padding
   * both stop applying the moment the box is gone.
   *
   * Two rules, because the chain has two different kinds of box in it:
   *
   * 1. The first two levels are collapsed unconditionally. They are
   *    createWidget's mount div and the container Duda handed this widget
   *    (`container.appendChild(mountEl)`), and BOTH exist solely for this
   *    widget — so anything else Duda leaves inside them is this widget's too,
   *    and goes with it. The previous version stopped dead at either one the
   *    moment Duda left a second node there, which left the container's own
   *    box on the page.
   *
   * 2. Above that the walk continues while every sibling PAINTS NOTHING, rather
   *    than while the ancestor is a strict only-child. A Duda row routinely
   *    carries zero-height helper divs beside the widget, and a single one of
   *    those ended the walk even though it contributed nothing — leaving the
   *    row's padding as the band that survived.
   *
   * The safety is unchanged and lives in rule 2: an ancestor holding anything
   * with height is a row shared with real content, and hiding it would take
   * that content with it, so the walk stops there. Zero height is the test
   * because zero height is zero painted area — that is exactly the definition
   * of leaving no trace.
   */
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || !empty) return undefined;

    /* Our own chain is excluded by the caller; this asks only whether the REST
       of an ancestor's contents would still draw something. Text directly
       inside it counts — a bare text node has no element to measure. */
    const paintsNothing = (node: Node, skip: Node): boolean => {
      if (node === skip) return true;
      if (node.nodeType === Node.TEXT_NODE) return !node.textContent?.trim();
      if (node.nodeType !== Node.ELEMENT_NODE) return true;
      return (node as Element).getBoundingClientRect().height === 0;
    };

    const nodes: HTMLElement[] = [];
    let child: HTMLElement = el;
    let n: HTMLElement | null = el.parentElement;
    // Rule 1 — the mount div and Duda's container for this widget.
    for (let i = 0; i < 2 && n && n !== document.body; i++) {
      nodes.push(n);
      child = n;
      n = n.parentElement;
    }
    // Rule 2 — keep going while nothing else up there would draw.
    for (; n && n !== document.body; child = n, n = n.parentElement) {
      const blank = Array.from(n.childNodes).every((c) => paintsNothing(c, child));
      if (!blank) break;
      nodes.push(n);
    }

    const previous = nodes.map((node) => ({
      value: node.style.getPropertyValue('display'),
      priority: node.style.getPropertyPriority('display'),
    }));
    nodes.forEach((node) => { node.style.setProperty('display', 'none', 'important'); });
    return () => {
      nodes.forEach((node, i) => {
        const { value, priority } = previous[i];
        // Removed, not set to '', so a host that had no inline display goes
        // back to having none rather than to an empty declaration.
        if (value) node.style.setProperty('display', value, priority);
        else node.style.removeProperty('display');
      });
    };
  }, [empty]);

  const flag = getFlag();
  const remaining = flag ? flag.expires - Date.now() : 0;

  const info =
    showInfo &&
    (infoStyle === 'tooltip' ? (
      <span className="ub-info ub-info--tooltip" tabIndex={0} role="button" aria-label="More information">
        <InfoIcon size={22} />
        <span className="ub-tooltip" role="tooltip">{infoMessage}</span>
      </span>
    ) : (
      <button className="ub-info" onClick={() => setModalOpen(true)} aria-label="More information">
        <InfoIcon size={22} />
      </button>
    ));

  // Rendered even when empty — the effect above needs a node to walk up from,
  // and .ub-wrapper--empty keeps it out of the layout in the meantime.
  return (
    <div className={`ub-wrapper${empty ? ' ub-wrapper--empty' : ''}`} ref={rootRef}>
      {showBar && (
        <div className={`ub-bar ub-bar--${barTone} ub-bar--text-${textTone} ${sticky ? 'ub-bar--sticky' : 'ub-bar--block'}`}>
          <div className="ub-inner">
            <div className="ub-spacer" />
            <div className="ub-message-wrap">
              <span className="ub-message">{message}</span>
              {info}
            </div>
            <div className="ub-close-wrap">
              {showClose && (
                <button className="ub-close" onClick={handleClose} aria-label="Close">
                  {/* Outlined ring: .ub-bar is #000, so the white-on-dark
                      treatment. 32 desktop and mobile, and it is the icon's own
                      32 FRAME rather than a scaled 52: `outlined` picks the
                      ring per size (stroke 2 / inset 1 at 32, stroke 3 / inset
                      1.5 at 52), and `size <= 32` is the switch. */}
                  <CloseCircleIcon outlined size={32} color="currentColor" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showInfo && infoStyle === 'modal' && modalOpen && (
        <div
          className="ub-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div className="ub-modal" role="dialog" aria-modal="true">
            <button className="ub-modal-close" onClick={() => setModalOpen(false)} aria-label="Close">
              <CloseIcon size={18} />
            </button>
            <div className="ub-modal-body">{infoMessage}</div>
          </div>
        </div>
      )}

      {showDebug && (
        <div className="ub-debug">
          <span className="ub-debug-label">Debug</span>
          <div className="ub-debug-row">
            <span className="ub-debug-key">State:</span>
            <span className={`ub-debug-badge ${flagActive ? 'ub-debug-badge--hidden' : 'ub-debug-badge--shown'}`}>
              {flagActive ? 'Hidden' : 'Shown'}
            </span>
          </div>
          {flagActive && (
            <div className="ub-debug-row">
              <span className="ub-debug-key">Expires in:</span>
              <span className="ub-debug-countdown">{msToHMS(remaining)}</span>
            </div>
          )}
          <button className="ub-debug-btn" onClick={handleDeleteFlag}>🗑 Delete Flag</button>
        </div>
      )}
    </div>
  );
}
