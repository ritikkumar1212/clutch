"use client";

/* Campus Radar map: target-pin picker + translucent radius circle.
   PRIVACY RULE 1: this map NEVER renders other users — it only shows the
   pin the REQUESTER chooses and their selected radius. Other students'
   GPS coordinates stay server-side in Redis and are never sent to clients. */
import { useCallback, useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { UIET_CENTER } from "@/lib/geo";

interface Props {
  lat: number | null;
  lng: number | null;
  radiusM: number;
  onPinChange: (lat: number, lng: number, landmark?: string | null) => void;
  compact?: boolean;
}

const PIN_SVG = `
<div class="cr-pin">
  <svg width="30" height="38" viewBox="0 0 30 38" xmlns="http://www.w3.org/2000/svg">
    <path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 12.6 21 13.2 21.6a2.5 2.5 0 003.6 0C17.4 36 30 25.5 30 15 30 6.7 23.3 0 15 0z"
      fill="#22d3ee" stroke="#0b1020" stroke-width="1.5"/>
    <circle cx="15" cy="14.5" r="6" fill="#0b1020"/>
    <circle cx="15" cy="14.5" r="2.6" fill="#22d3ee"/>
  </svg>
</div>`;

export default function MapPicker({ lat, lng, radiusM, onPinChange, compact }: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markerRef = useRef<import("leaflet").Marker | null>(null);
  const circleRef = useRef<import("leaflet").Circle | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const [locating, setLocating] = useState(false);
  const [geocodeNote, setGeocodeNote] = useState<string | null>(null);
  const onChangeRef = useRef(onPinChange);
  onChangeRef.current = onPinChange;

  const reverseGeocode = useCallback(async (la: number, ln: number): Promise<string | null> => {
    // OSM Nominatim — respectful usage: one call per pin drop, browser-cached
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&lat=${la}&lon=${ln}`,
        { headers: { Accept: "application/json" } }
      );
      if (!res.ok) return null;
      const data = await res.json();
      const a = data?.address || {};
      return (
        [a.building, a.amenities, a.shop, a.neighbourhood, a.suburb, a.road, a.city]
          .filter(Boolean)
          .slice(0, 3)
          .join(", ") || data?.display_name?.split(",").slice(0, 2).join(",") || null
      );
    } catch {
      return null;
    }
  }, []);

  // init map once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !divRef.current || mapRef.current) return;
      LRef.current = L;

      const map = L.map(divRef.current, {
        center: UIET_CENTER,
        zoom: 16,
        zoomControl: false,
        attributionControl: true,
      });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map);

      map.on("click", (e) => {
        placePin(e.latlng.lat, e.latlng.lng, true);
      });

      mapRef.current = map;
      // if an initial pin exists (e.g. returned to the screen), draw it
      if (lat != null && lng != null) placePin(lat, lng, false);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function placePin(la: number, ln: number, geocode: boolean) {
    const L = LRef.current;
    if (!L) return;
    if (!markerRef.current) {
      const icon = L.divIcon({ html: PIN_SVG, className: "", iconSize: [30, 38], iconAnchor: [15, 37] });
      markerRef.current = L.marker([la, ln], { icon, draggable: true }).addTo(mapRef.current!);
      markerRef.current.on("dragend", () => {
        const p = markerRef.current!.getLatLng();
        emitChange(p.lat, p.lng, true);
      });
    } else {
      markerRef.current.setLatLng([la, ln]);
    }
    if (!circleRef.current) {
      circleRef.current = L.circle([la, ln], {
        radius: radiusM,
        color: "#22d3ee",
        weight: 1.5,
        opacity: 0.8,
        fillColor: "#22d3ee",
        fillOpacity: 0.10,
      }).addTo(mapRef.current!);
    } else {
      circleRef.current.setLatLng([la, ln]);
    }
    mapRef.current!.panTo([la, ln], { animate: true });
    emitChange(la, ln, geocode);
  }

  function emitChange(la: number, ln: number, geocode: boolean) {
    onChangeRef.current(la, ln, null);
    if (geocode) {
      setGeocodeNote("looking up landmark…");
      reverseGeocode(la, ln).then((label) => {
        setGeocodeNote(label || null);
        onChangeRef.current(la, ln, label);
      });
    }
  }

  // radius updates without re-creating the circle
  useEffect(() => {
    circleRef.current?.setRadius(radiusM);
  }, [radiusM]);

  // external lat/lng changes (e.g. "use my location") move the pin
  useEffect(() => {
    if (lat != null && lng != null && mapRef.current) {
      if (!markerRef.current || markerRef.current.getLatLng().lat !== lat) {
        placePin(lat, lng, false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  function locateMe() {
    if (!("geolocation" in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        placePin(p.coords.latitude, p.coords.longitude, true);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line">
      <div ref={divRef} className={`w-full ${compact ? "h-44" : "h-64"}`} aria-label="Campus map — tap to drop the target pin" role="application" />
      <button
        type="button"
        onClick={locateMe}
        className="absolute right-2 top-2 z-[6] flex items-center gap-1 rounded-xl border border-line bg-panel/90 px-3 py-2 text-xs font-semibold text-neon shadow-lg backdrop-blur active:scale-95"
      >
        {locating ? "Locating…" : "Use my location"}
      </button>
      {geocodeNote && (
        <div className="absolute bottom-1 left-1 right-1 z-[6] truncate rounded-lg bg-ink/80 px-2 py-1 text-[11px] text-muted">
          {geocodeNote}
        </div>
      )}
    </div>
  );
}
