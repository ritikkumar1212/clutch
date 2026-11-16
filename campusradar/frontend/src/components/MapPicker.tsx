"use client";

/* Campus Radar map: target-pin picker.
   PRIVACY RULE 1: this map NEVER renders other users — it only shows the
   pin the REQUESTER chooses. Other students'
   GPS coordinates stay server-side in Redis and are never sent to clients. */
import { useCallback, useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { UIET_CENTER } from "@/lib/geo";

interface Props {
  lat: number | null;
  lng: number | null;
  onPinChange: (lat: number, lng: number, landmark?: string | null) => void;
  compact?: boolean;
}

interface SearchResult {
  lat: string;
  lon: string;
  display_name: string;
}

interface RouteResult {
  geometry: string;
  distance: number;
  duration: number;
}

const PIN_SVG = `
<div class="cr-pin">
  <svg width="34" height="42" viewBox="0 0 34 42" xmlns="http://www.w3.org/2000/svg">
    <path d="M17 1C8.16 1 1 8.16 1 17c0 11.2 13.5 22.5 15 23.7a1.54 1.54 0 002 0C19.5 39.5 33 28.2 33 17 33 8.16 25.84 1 17 1z"
      fill="#f2c6a3" stroke="#0b0b0b" stroke-width="2"/>
    <circle cx="17" cy="17" r="6.5" fill="#0b0b0b"/>
    <circle cx="17" cy="17" r="3" fill="#f2c6a3"/>
  </svg>
</div>`;

export default function MapPicker({ lat, lng, onPinChange, compact }: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markerRef = useRef<import("leaflet").Marker | null>(null);
  const routeRef = useRef<import("leaflet").Polyline | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const [locating, setLocating] = useState(false);
  const [geocodeNote, setGeocodeNote] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [routing, setRouting] = useState(false);
  const [routeInfo, setRouteInfo] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const searchRequestRef = useRef(0);
  const onChangeRef = useRef(onPinChange);
  onChangeRef.current = onPinChange;

  function locationErrorMessage(error: GeolocationPositionError) {
    if (error.code === error.PERMISSION_DENIED) {
      return "Allow location access in your browser settings";
    }
    if (error.code === error.TIMEOUT) {
      return "Location lookup timed out — try again";
    }
    return "Could not detect your location — check device location services";
  }

  const reverseGeocode = useCallback(async (la: number, ln: number): Promise<string | null> => {
    const apiKey = process.env.NEXT_PUBLIC_LOCATIONIQ_API_KEY;
    if (!apiKey) return null;
    try {
      const params = new URLSearchParams({
        key: apiKey,
        lat: String(la),
        lon: String(ln),
        format: "json",
      });
      const res = await fetch(`https://us1.locationiq.com/v1/reverse?${params}`);
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

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    (async () => {
      const apiKey = process.env.NEXT_PUBLIC_LOCATIONIQ_API_KEY;
      if (!apiKey) {
        setMapError("LocationIQ API key is not configured");
        return;
      }

      try {
        const L = (await import("leaflet")).default;
        if (cancelled || !divRef.current || mapRef.current) return;
        LRef.current = L;

        const map = L.map(divRef.current, {
          center: UIET_CENTER,
          zoom: 16,
          zoomControl: false,
          attributionControl: true,
        });
        L.tileLayer(
          `https://{s}-tiles.locationiq.com/v3/streets/r/{z}/{x}/{y}.png?key=${encodeURIComponent(apiKey)}`,
          {
            attribution: '&copy; <a href="https://locationiq.com/">LocationIQ</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            subdomains: ["a", "b", "c"],
            maxZoom: 19,
          },
        ).addTo(map);

        map.on("click", (e) => {
          placePin(e.latlng.lat, e.latlng.lng, true);
        });

        mapRef.current = map;
        if (lat != null && lng != null) placePin(lat, lng, false);
      } catch {
        if (!cancelled) setMapError("Could not load LocationIQ map");
      }
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
      routeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  function placePin(la: number, ln: number, geocode: boolean) {
    const L = LRef.current;
    if (!L) return;
    if (!markerRef.current) {
      const icon = L.divIcon({ html: PIN_SVG, className: "", iconSize: [34, 42], iconAnchor: [17, 41] });
      markerRef.current = L.marker([la, ln], { icon, draggable: true }).addTo(mapRef.current!);
      markerRef.current.on("dragend", () => {
        const p = markerRef.current!.getLatLng();
        emitChange(p.lat, p.lng, true);
      });
    } else {
      markerRef.current.setLatLng([la, ln]);
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

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 3) {
      setSuggestions([]);
      setSearchError(null);
      return;
    }

    const apiKey = process.env.NEXT_PUBLIC_LOCATIONIQ_API_KEY;
    if (!apiKey) return;

    const requestId = ++searchRequestRef.current;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const params = new URLSearchParams({
          key: apiKey,
          q: query,
          limit: "5",
          dedupe: "1",
          format: "json",
        });
        const res = await fetch(`https://api.locationiq.com/v1/autocomplete?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Autocomplete request failed");
        const data = await res.json();
        if (requestId === searchRequestRef.current) {
          setSuggestions(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (requestId === searchRequestRef.current) setSearchError("Could not search addresses");
      } finally {
        if (requestId === searchRequestRef.current) setSearching(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery]);

  function selectSearchResult(result: SearchResult) {
    const resultLat = Number(result.lat);
    const resultLng = Number(result.lon);
    if (!Number.isFinite(resultLat) || !Number.isFinite(resultLng)) return;
    setSearchQuery(result.display_name);
    setSuggestions([]);
    setSearchError(null);
    placePin(resultLat, resultLng, false);
    setGeocodeNote(result.display_name);
    onChangeRef.current(resultLat, resultLng, result.display_name);
  }

  async function forwardGeocode() {
    const query = searchQuery.trim();
    const apiKey = process.env.NEXT_PUBLIC_LOCATIONIQ_API_KEY;
    if (!query || !apiKey) return;

    setSearching(true);
    setSearchError(null);
    setSuggestions([]);
    try {
      const params = new URLSearchParams({
        key: apiKey,
        q: query,
        format: "json",
        limit: "5",
        dedupe: "1",
      });
      const res = await fetch(`https://us1.locationiq.com/v1/search?${params}`);
      if (!res.ok) throw new Error("Forward geocoding request failed");
      const results = await res.json() as SearchResult[];
      if (results[0]) {
        selectSearchResult(results[0]);
      } else {
        setSearchError("No matching address found");
      }
    } catch {
      setSearchError("Could not search this address");
    } finally {
      setSearching(false);
    }
  }

  function decodePolyline(encoded: string): [number, number][] {
    const points: [number, number][] = [];
    let index = 0;
    let latValue = 0;
    let lngValue = 0;

    while (index < encoded.length) {
      let shift = 0;
      let result = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      latValue += result & 1 ? ~(result >> 1) : result >> 1;

      shift = 0;
      result = 0;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      lngValue += result & 1 ? ~(result >> 1) : result >> 1;
      points.push([latValue / 1e5, lngValue / 1e5]);
    }
    return points;
  }

  function formatDistance(meters: number) {
    return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
  }

  function formatDuration(seconds: number) {
    const minutes = Math.round(seconds / 60);
    return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  }

  function getDirections() {
    if (lat == null || lng == null) {
      setRouteInfo("Choose a destination first");
      return;
    }
    if (!("geolocation" in navigator)) {
      setRouteInfo("Location access is unavailable");
      return;
    }
    const apiKey = process.env.NEXT_PUBLIC_LOCATIONIQ_API_KEY;
    if (!apiKey) {
      setRouteInfo("LocationIQ API key is not configured");
      return;
    }

    setRouting(true);
    setRouteInfo(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const originLat = position.coords.latitude;
          const originLng = position.coords.longitude;
          const params = new URLSearchParams({
            key: apiKey,
            steps: "true",
            alternatives: "true",
            geometries: "polyline",
            overview: "full",
          });
          const res = await fetch(
            `https://us1.locationiq.com/v1/directions/driving/${originLng},${originLat};${lng},${lat}?${params}`,
          );
          if (!res.ok) throw new Error("Directions request failed");
          const data = await res.json() as { routes?: RouteResult[] };
          const route = data.routes?.[0];
          const L = LRef.current;
          const map = mapRef.current;
          if (!route || !L || !map) throw new Error("No route found");

          routeRef.current?.remove();
          routeRef.current = L.polyline(decodePolyline(route.geometry), {
            color: "#22d3ee",
            weight: 4,
            opacity: 0.85,
          }).addTo(map);
          map.fitBounds(routeRef.current.getBounds(), { padding: [24, 24] });
          setRouteInfo(`${formatDistance(route.distance)} · ${formatDuration(route.duration)}`);
        } catch {
          setRouteInfo("Could not find a driving route");
        } finally {
          setRouting(false);
        }
      },
      (error) => {
        setRouting(false);
        setRouteInfo(locationErrorMessage(error));
      },
      { enableHighAccuracy: false, maximumAge: 30000, timeout: 20000 },
    );
  }

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
      (error) => {
        setLocating(false);
        setGeocodeNote(locationErrorMessage(error));
      },
      { enableHighAccuracy: false, maximumAge: 30000, timeout: 20000 },
    );
  }

  return (
    <div className={`cr-map-shell relative overflow-hidden rounded-[20px] border border-line bg-panel shadow-[0_12px_30px_rgba(0,0,0,0.18)] ${expanded ? "" : "h-[68px]"}`}>
      <div className="absolute left-2 right-2 top-2 z-[7]">
        <div className="relative">
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35m1.35-5.15a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z" />
          </svg>
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onFocus={() => setExpanded(true)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void forwardGeocode();
              }
            }}
            placeholder="Search Maps"
            aria-label="Search Maps"
            className="w-full rounded-full border border-slate-200 bg-white py-3 pl-10 pr-20 text-sm text-slate-700 shadow-[0_5px_16px_rgba(15,23,42,0.12)] transition-shadow placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:shadow-[0_6px_18px_rgba(8,145,178,0.16)]"
          />
          <button
            type="button"
            onClick={() => {
              if (!expanded) {
                setExpanded(true);
                return;
              }
              getDirections();
            }}
            disabled={routing}
            aria-label="Get directions"
            title="Get directions"
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-cyan-700 transition-colors hover:bg-cyan-50 active:scale-95 disabled:opacity-60"
          >
            <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none">
              <path d="M13.2 3.8 20.2 10.8a1.7 1.7 0 0 1 0 2.4l-7 7a1.7 1.7 0 0 1-2.4 0l-7-7a1.7 1.7 0 0 1 0-2.4l7-7a1.7 1.7 0 0 1 2.4 0Z" fill="currentColor" />
              <path d="M8.8 12h6.4m0 0-2.4-2.4M15.2 12l-2.4 2.4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
              className="absolute right-11 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <span aria-hidden="true" className="text-base leading-none">×</span>
            </button>
          )}
        </div>
        {expanded && (searching || searchError || suggestions.length > 0) && (
          <div className="mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur">
            {searching && <p className="px-3 py-2 text-xs text-slate-500">Searching…</p>}
            {searchError && <p className="px-3 py-2 text-xs text-red-500">{searchError}</p>}
            {suggestions.map((result) => (
              <button
                key={`${result.lat},${result.lon}`}
                type="button"
                onClick={() => selectSearchResult(result)}
                className="block w-full border-b border-slate-100 px-3 py-2 text-left text-xs text-slate-700 last:border-0 hover:bg-cyan-50"
              >
                {result.display_name}
              </button>
            ))}
          </div>
        )}
      </div>
      {expanded && (
        <>
          <div
            ref={divRef}
            className={`w-full ${compact ? "h-48" : "h-56"}`}
            aria-label="Campus map — tap to drop the target pin"
            role="application"
          />
          {mapError && (
            <div className="absolute inset-0 z-[6] flex items-center justify-center bg-white/95 px-4 text-center text-xs text-red-500">
              {mapError}
            </div>
          )}
          <button
            type="button"
            onClick={locateMe}
            className="absolute right-2 top-2 z-[6] flex items-center gap-1 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-700 shadow-md backdrop-blur active:scale-95"
          >
            {locating ? "Locating…" : "Locate me"}
          </button>
          {(routeInfo || geocodeNote) && (
            <div className="absolute bottom-6 left-2 right-auto z-[6] max-w-[82%] overflow-hidden rounded-lg bg-white/75 shadow-sm backdrop-blur-sm">
              {geocodeNote && (
                <div className="truncate border-b border-slate-200/70 px-2.5 py-1.5 text-xs font-semibold text-slate-700">
                  {geocodeNote}
                </div>
              )}
              {routeInfo && (
                <div className="truncate px-2.5 py-1 text-[11px] text-slate-500">
                  {routeInfo}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
