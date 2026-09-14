// ---------------------------------------------------------------------------
// A draggable, zoomable map of one location.
//
// Renders the keyless `output=embed` iframe FIRST and upgrades to a real map
// once the JS API is available. That order matters: the iframe needs no key and
// already pans on desktop, so a site with no key configured, a blocked script
// or a referrer-rejected key keeps exactly what it has today rather than losing
// its map. Nothing here can leave the card empty.
//
// The upgrade buys two things the iframe cannot do: ONE-FINGER PAN ON MOBILE,
// and a pin the visitor can pick up and move. Inside an iframe a single finger
// scrolls the page and two are needed to move the map, and the pin belongs to
// Google — both are their behaviour, unreachable from our CSS.
// ---------------------------------------------------------------------------
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { loadGoogleMaps, fetchMapsKey, type GMap, type GMarker } from './googleMaps';
import { DEFAULT_PLACES_BASE } from './placesApi';
import './InteractiveMap.css';

export interface InteractiveMapProps {
  lat: number;
  lng: number;
  /** Accessible name, e.g. "Map of Storage Outlet - Bellflower". */
  title: string;
  /**
   * Proxy base that serves the Maps key from /api/maps/config.
   *
   * The key is NOT a prop: the JS API authenticates from the page so it cannot
   * be hidden, but it need not be hardcoded into the bundle, the Duda JS tab or
   * the harness. One place to configure, one place to rotate.
   */
  proxyBase?: string;
  zoom?: number;
  className?: string;
  /**
   * Let the visitor pick the pin up and move it.
   *
   * Nothing is persisted — the position is thrown away on reload, and the
   * property's real coordinates are never touched. That is the whole reason
   * `Reset pin` exists: a pin dragged off the building is WRONG, so there has
   * to be a way back that is not "reload the page". The reset appears only
   * once the pin has actually been moved.
   */
  draggablePin?: boolean;
}

const DEFAULT_ZOOM = 15;
/** Google's own limits — clamping here stops the buttons queueing dead zooms. */
const MIN_ZOOM = 3;
const MAX_ZOOM = 20;

export function InteractiveMap({
  lat, lng, title, proxyBase, zoom = DEFAULT_ZOOM, className, draggablePin = true,
}: InteractiveMapProps) {
  const holder = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GMap | null>(null);
  const markerRef = useRef<GMarker | null>(null);
  const [live, setLive] = useState(false);
  /** The pin has been dragged away from the property — offer the way back. */
  const [moved, setMoved] = useState(false);

  /*
   * Construction values, held in a ref so they can be CURRENT without being
   * effect dependencies. Previously lat/lng/zoom/title were deps, so a parent
   * re-render with new coordinates built a second google.maps.Map over the same
   * div — re-downloading tiles, and now also discarding a dragged pin. The
   * effect below runs once per proxyBase; moving the pin and the viewport is
   * the next effect's job.
   */
  const init = useRef({ lat, lng, zoom, title, draggablePin });
  init.current = { lat, lng, zoom, title, draggablePin };

  useEffect(() => {
    let dead = false;
    /** Removed on teardown — they outlive the component otherwise. */
    let listeners: Array<{ remove?: () => void }> = [];

    void fetchMapsKey(proxyBase || DEFAULT_PLACES_BASE)
      .then((key) => (key ? loadGoogleMaps(key) : null))
      .then((api) => {
        // `mapRef.current` guards against a second construction — React 18
        // StrictMode runs effects twice in development.
        if (dead || !api || !holder.current || mapRef.current) return;
        const { lat: la, lng: ln, zoom: z, title: t, draggablePin: drag } = init.current;
        const center = { lat: la, lng: ln };

        const map = new api.Map(holder.current, {
          center,
          zoom: z,
          /*
           * THE POINT OF THE WHOLE CHANGE. 'greedy' makes one finger pan the map
           * instead of scrolling the page, which is what an iframe cannot do.
           * The trade is that a one-finger drag starting on the map no longer
           * scrolls past it — acceptable for a card-sized map with page either
           * side of it, and it is what "grab and move around" asks for.
           */
          gestureHandling: 'greedy',
          zoomControl: false,        // ours, so they match the card
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          // Points of interest stay: a storage unit's neighbours are useful
          // context, and hiding them makes the map look broken rather than clean.
        });

        const marker = new api.Marker({
          position: center,
          map,
          title: t,
          draggable: drag,
          // Google's default is a pointer; the grab cursors are the only hint
          // on desktop that this pin can be picked up at all.
          cursor: drag ? 'grab' : undefined,
        });
        if (drag) {
          listeners.push(marker.addListener('dragend', () => { if (!dead) setMoved(true); }));
        }

        mapRef.current = map;
        markerRef.current = marker;
        if (!dead) setLive(true);
      })
      /*
       * Construction can throw — a half-initialised namespace, a revoked key,
       * a CSP refusal mid-load. `live` then stays false, which leaves the
       * iframe up, so the card still has a map. Without this the rejection
       * would be unhandled and the reason would never reach the console.
       */
      .catch((err) => {
        console.warn('[InteractiveMap] the live map could not be created — keeping the embed:', err);
      });

    /*
     * Tear the map down properly, not just flag the promise.
     *
     * The refs are the important part. Construction is guarded by
     * `mapRef.current` so it cannot run twice, which means a ref left pointing
     * at the OLD map would block the rebuild entirely if `proxyBase` changed —
     * the map would keep authenticating against the proxy it no longer uses.
     *
     * Google gives a Map no destructor: it becomes collectable once nothing
     * references it and React has removed the div. What does have to go by
     * hand is the marker's own listener, and the marker's link to the map.
     * `live` returns to false so the iframe comes back while the next one
     * loads, rather than leaving an empty canvas.
     */
    return () => {
      dead = true;
      listeners.forEach((l) => { try { l?.remove?.(); } catch { /* already gone */ } });
      listeners = [];
      try { markerRef.current?.setMap(null); } catch { /* the API may be gone */ }
      markerRef.current = null;
      mapRef.current = null;
      setLive(false);
      setMoved(false);
    };
  }, [proxyBase]);

  /*
   * Follow the bound property on a dynamic page: move the pin, re-centre, and
   * drop any dragged position — it belonged to the property we just left, and
   * leaving it would strand the pin on a different facility's map.
   */
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    marker.setPosition({ lat, lng });
    map.panTo({ lat, lng });
    setMoved(false);
  }, [lat, lng]);

  /** Put the pin back on the property and bring the viewport with it. */
  const resetPin = useCallback(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    marker.setPosition({ lat, lng });
    map.panTo({ lat, lng });
    setMoved(false);
  }, [lat, lng]);

  const nudge = (by: number) => {
    const m = mapRef.current;
    if (!m) return;
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, (m.getZoom() ?? zoom) + by));
    m.setZoom(next);
  };

  return (
    <div className={`im-wrap${className ? ` ${className}` : ''}`}>
      {/* Kept mounted until the real map is ready, so there is never a blank
          box between the two. */}
      {!live && (
        <iframe
          className="im-frame"
          title={title}
          src={`https://www.google.com/maps?q=${lat},${lng}&z=${zoom}&output=embed`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      )}
      {/* Always mounted and sized: google.maps.Map measures the element it is
          given, so it cannot be display:none at construction. Idle it is
          pointer-transparent, and it only claims the application role once
          there is actually a map to interact with. */}
      <div
        ref={holder}
        className={`im-canvas${live ? '' : ' im-canvas--idle'}`}
        aria-label={live ? title : undefined}
        role={live ? 'application' : undefined}
        aria-hidden={live ? undefined : true}
      />

      {/* Only once the pin is actually off the property — a permanent reset
          button on an untouched map is noise, and invites a click that does
          nothing. `aria-live` announces it, since dragging a pin gives a
          screen-reader user nothing else to go on. */}
      {live && moved && (
        <div className="im-reset" aria-live="polite">
          <button type="button" className="im-reset-btn" onClick={resetPin}>
            Reset pin
          </button>
        </div>
      )}

      {live && (
        <div className="im-zoom">
          <button type="button" className="im-zoom-btn" onClick={() => nudge(1)} aria-label="Zoom in">+</button>
          <button type="button" className="im-zoom-btn" onClick={() => nudge(-1)} aria-label="Zoom out">−</button>
        </div>
      )}
    </div>
  );
}
