"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { UIET_CENTER } from "@/lib/geo";
import type { SharedLocations } from "@/lib/types";
import "leaflet/dist/leaflet.css";

interface Props {
  requestId: string;
  role: "requester" | "helper";
}

export default function LiveLocationMap({ requestId, role }: Props) {
  const mapNodeRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const markersRef = useRef<Record<string, import("leaflet").CircleMarker>>({});
  const hasFitRef = useRef(false);
  const [locations, setLocations] = useState<SharedLocations | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function refresh() {
      try {
        const next = await api<SharedLocations>(`/requests/${requestId}/locations`);
        if (cancelled) return;
        setLocations(next);
        setError("");

        const L = leafletRef.current;
        const map = mapRef.current;
        if (!L || !map) return;
        const points = [
          ["requester", next.requester, "Requester"],
          ["helper", next.helper, "Helper"],
        ] as const;
        const visible: [number, number][] = [];
        for (const [key, point, label] of points) {
          const marker = markersRef.current[key];
          if (!point) {
            marker?.remove();
            delete markersRef.current[key];
            continue;
          }
          visible.push([point.lat, point.lng]);
          if (marker) {
            marker.setLatLng([point.lat, point.lng]);
          } else {
            markersRef.current[key] = L.circleMarker([point.lat, point.lng], {
              radius: 9,
              color: key === "requester" ? "#ff6b5e" : "#8b5cf6",
              fillColor: key === "requester" ? "#ff6b5e" : "#8b5cf6",
              fillOpacity: 0.9,
              weight: 3,
            }).addTo(map).bindTooltip(label, { direction: "top", offset: [0, -8] });
          }
        }
        if (visible.length && !hasFitRef.current) {
          map.fitBounds(L.latLngBounds(visible), { padding: [32, 32], maxZoom: 16 });
          hasFitRef.current = true;
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Live location is temporarily unavailable");
        }
      }
    }

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapNodeRef.current) return;
      leafletRef.current = L;
      mapRef.current = L.map(mapNodeRef.current, {
        center: UIET_CENTER,
        zoom: 15,
        zoomControl: false,
        attributionControl: true,
      });
      L.tileLayer(
        `https://{s}-tiles.locationiq.com/v3/streets/r/{z}/{x}/{y}.png?key=${encodeURIComponent(process.env.NEXT_PUBLIC_LOCATIONIQ_API_KEY ?? "")}`,
        {
          attribution: '&copy; <a href="https://locationiq.com/">LocationIQ</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          subdomains: ["a", "b", "c"],
          maxZoom: 19,
        },
      ).addTo(mapRef.current);
      await refresh();
      timer = setInterval(refresh, 5000);
    })().catch(() => {
      if (!cancelled) setError("Could not load live location map");
    });

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current = {};
    };
  }, [requestId]);

  return (
    <section className="mb-3 overflow-hidden rounded-2xl border border-line bg-panel">
      <div className="flex items-center justify-between px-3 py-1.5">
        <p className="text-[11px] font-bold">Live map</p>
      </div>
      <div ref={mapNodeRef} className="h-40 w-full" aria-label="Live locations of both participants" role="application" />
      {error && <p className="px-3 py-2 text-[11px] text-danger">{error}</p>}
      {locations && !locations.requester && !locations.helper && (
        <p className="px-3 py-2 text-[11px] text-muted">Waiting for both participants to share a live location…</p>
      )}
    </section>
  );
}
