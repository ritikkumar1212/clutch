"use client";

import { useEffect, useState } from "react";

export interface GeoPos {
  lat: number;
  lng: number;
  accuracy?: number;
}

/* One-shot "get my location" with loading + error state. */
export function useGeolocation() {
  const [pos, setPos] = useState<GeoPos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const locate = () => {
    if (!("geolocation" in navigator)) {
      setError("Geolocation not supported on this device");
      return;
    }
    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
        setLoading(false);
      },
      (e) => {
        setError(
          e.code === e.PERMISSION_DENIED
            ? "Location permission denied — tap the map to drop a pin instead"
            : "Could not get your location"
        );
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  return { pos, error, loading, locate, setPos };
}

/* Subscribes to live updates of the device position (for distance labels). */
export function useLivePosition(enabled = true) {
  const [pos, setPos] = useState<GeoPos | null>(null);
  useEffect(() => {
    if (!enabled || !("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => {},
      { enableHighAccuracy: false, maximumAge: 15000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);
  return pos;
}
