"use client";

import { useEffect, useRef, useState } from "react";
import {
  MapPin,
  ExternalLink,
  Layers,
  Maximize2,
  Minimize2,
  CheckCircle2,
  Compass,
} from "lucide-react";
import { CrmSectionCard } from "@/components/crm/ui";

declare global {
  interface Window {
    google?: any;
    _googleMapsLoadingPromise?: Promise<void>;
  }
}

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.maps) return Promise.resolve();

  if (window.initGoogleMapsPromise) return window.initGoogleMapsPromise;

  window.initGoogleMapsPromise = new Promise((resolve) => {
    const existingScript =
      document.getElementById("google-maps-script") ||
      document.getElementById("google-maps-sdk");
    if (existingScript) {
      if (window.google?.maps) {
        resolve();
      } else {
        existingScript.addEventListener("load", () => resolve());
      }
      return;
    }

    const script = document.createElement("script");
    script.id = "google-maps-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry,drawing`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      console.warn("Failed to load Google Maps script.");
      resolve();
    };
    document.head.appendChild(script);
  });

  return window.initGoogleMapsPromise;
}

interface PropertyDetailMapViewProps {
  coordinates?: { lat?: number | string; lng?: number | string } | any;
  boundaries?: Array<{ lat: number | string; lng: number | string }> | any;
  location?: { address?: string; city?: string; state?: string; areaHectares?: number } | any;
  title?: string;
  address?: string;
}

export default function PropertyDetailMapView({
  coordinates,
  boundaries,
  location,
  title,
  address,
}: PropertyDetailMapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const polygonRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [areaHectares, setAreaHectares] = useState<number | null>(() => {
    const ha = location?.areaHectares ? Number(location.areaHectares) : null;
    return ha && !isNaN(ha) ? ha : null;
  });

  // Universal helper to extract polygon points from any shape (GeoJSON, [{coordinates:...}], [{lat, lng}], [[lng, lat]])
  const extractPolygonPoints = (raw: any): Array<{ lat: number; lng: number }> => {
    if (!raw) return [];

    if (Array.isArray(raw)) {
      if (raw.length === 0) return [];

      // 1. Direct array of { lat, lng }
      if (typeof raw[0]?.lat === "number" && typeof raw[0]?.lng === "number") {
        return raw.map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }));
      }
      // 2. [{ type: "Polygon", coordinates: [...] }] or [{ coordinates: [...] }]
      if (raw[0]?.coordinates) {
        return extractPolygonPoints(raw[0].coordinates);
      }
      // 3. Nested array (e.g. GeoJSON coordinates: [[[lng, lat], ...]])
      if (Array.isArray(raw[0])) {
        if (Array.isArray(raw[0][0])) {
          return extractPolygonPoints(raw[0]);
        }
        return raw
          .map((p: any) => {
            const a = Number(p[0]);
            const b = Number(p[1]);
            if (isNaN(a) || isNaN(b)) return null;
            // Standard GeoJSON in India: [lng (~70-90), lat (~8-35)]
            if (a > 60 && a < 100 && b > 5 && b < 40) return { lat: b, lng: a };
            return { lat: a, lng: b };
          })
          .filter(Boolean) as Array<{ lat: number; lng: number }>;
      }
      // 4. Array of objects with string lat/lng
      return raw
        .map((p: any) => {
          if (!p) return null;
          const lat = typeof p.lat === "number" ? p.lat : parseFloat(p.lat);
          const lng = typeof p.lng === "number" ? p.lng : parseFloat(p.lng);
          if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
          return null;
        })
        .filter(Boolean) as Array<{ lat: number; lng: number }>;
    }

    if (raw && typeof raw === "object") {
      if (raw.coordinates) return extractPolygonPoints(raw.coordinates);
      if (raw.geometry?.coordinates) return extractPolygonPoints(raw.geometry.coordinates);
    }

    return [];
  };

  // Robust parsing of boundaries
  const parsedBoundaries: Array<{ lat: number; lng: number }> = (() => {
    const fromBoundaries = extractPolygonPoints(boundaries);
    if (fromBoundaries.length >= 3) return fromBoundaries;

    // Check if coordinates was saved as an array of polygon points
    if (Array.isArray(coordinates) && coordinates.length >= 3) {
      const fromCoords = extractPolygonPoints(coordinates);
      if (fromCoords.length >= 3) return fromCoords;
    }
    return fromBoundaries;
  })();

  // Robust parsing of single center coordinates
  const parsedCoords = (() => {
    if (!coordinates) return null;
    if (typeof coordinates.lat === "number" && typeof coordinates.lng === "number") {
      return { lat: coordinates.lat, lng: coordinates.lng };
    }
    if (typeof coordinates.lat === "string" && typeof coordinates.lng === "string") {
      const lat = parseFloat(coordinates.lat);
      const lng = parseFloat(coordinates.lng);
      if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
    }
    if (Array.isArray(coordinates) && coordinates.length === 2 && typeof coordinates[0] === "number") {
      return { lat: Number(coordinates[0]), lng: Number(coordinates[1]) };
    }
    return null;
  })();

  useEffect(() => {
    const apiKey =
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
      "AIzaSyCr0RqrqbwLz7YzZU3ZjtDeS9vK5idU700";

    loadGoogleMapsScript(apiKey).then(() => {
      if (window.google?.maps && mapContainerRef.current && !mapInstanceRef.current) {
        initMap();
      }
    });
  }, [coordinates, boundaries, address]);

  const [geocodedPos, setGeocodedPos] = useState<{ lat: number; lng: number } | null>(null);

  const initMap = () => {
    if (!window.google?.maps || !mapContainerRef.current) return;

    let center = { lat: 26.9124, lng: 75.7873 }; // Jaipur fallback
    if (parsedCoords) {
      center = parsedCoords;
    } else if (parsedBoundaries.length > 0) {
      center = parsedBoundaries[0];
    } else if (geocodedPos) {
      center = geocodedPos;
    }

    const map = new window.google.maps.Map(mapContainerRef.current, {
      center,
      zoom: parsedBoundaries.length > 0 || parsedCoords ? 16 : 13,
      mapTypeId: window.google.maps.MapTypeId.HYBRID,
      tilt: 0,
      fullscreenControl: true,
      streetViewControl: false,
      mapTypeControl: true,
      mapTypeControlOptions: {
        position: window.google.maps.ControlPosition.TOP_LEFT,
      },
    });

    mapInstanceRef.current = map;
    setMapLoaded(true);

    const bounds = new window.google.maps.LatLngBounds();

    // 1. Draw boundary polygon if present
    if (parsedBoundaries.length >= 3) {
      const polygon = new window.google.maps.Polygon({
        paths: parsedBoundaries,
        strokeColor: "#10b981",
        strokeOpacity: 1.0,
        strokeWeight: 3.5,
        fillColor: "#10b981",
        fillOpacity: 0.38,
        map,
        zIndex: 99999,
      });

      polygonRef.current = polygon;
      parsedBoundaries.forEach((p, idx) => {
        bounds.extend(p);
        // Add corner vertex dot
        new window.google.maps.Marker({
          position: p,
          map,
          title: `Boundary Vertex ${idx + 1}`,
          zIndex: 999999,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 5,
            fillColor: "#10b981",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
        });
      });

      map.fitBounds(bounds, { top: 35, right: 35, bottom: 35, left: 35 });

      // Compute area if spherical geometry library is present
      if (window.google?.maps?.geometry?.spherical) {
        const areaSqMeters = window.google.maps.geometry.spherical.computeArea(
          polygon.getPath()
        );
        const ha = areaSqMeters / 10000;
        setAreaHectares(parseFloat(ha.toFixed(4)));
      }
    } else if (parsedCoords) {
      bounds.extend(parsedCoords);
      map.setCenter(parsedCoords);
      map.setZoom(17);
    }

    // 2. Add marker pin
    const pinPos =
      parsedCoords ||
      (parsedBoundaries.length > 0 ? parsedBoundaries[0] : null) ||
      geocodedPos;

    if (pinPos) {
      const marker = new window.google.maps.Marker({
        position: pinPos,
        map,
        title: title || "Property Location",
        animation: window.google.maps.Animation.DROP,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: "#10b981",
          fillOpacity: 1,
          strokeWeight: 2,
          strokeColor: "#ffffff",
        },
      });
      markerRef.current = marker;
    } else if (address && window.google?.maps?.Geocoder) {
      // Fallback: Geocode address to locate on map
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ address }, (results: any, status: any) => {
        if (status === "OK" && results?.[0]?.geometry?.location) {
          const loc = results[0].geometry.location;
          const pos = { lat: loc.lat(), lng: loc.lng() };
          setGeocodedPos(pos);
          map.setCenter(pos);
          map.setZoom(14);
          new window.google.maps.Marker({
            position: pos,
            map,
            title: title || address,
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: "#10b981",
              fillOpacity: 1,
              strokeWeight: 2,
              strokeColor: "#ffffff",
            },
          });
        }
      });
    }
  };

  const centerCoords =
    parsedCoords ||
    (parsedBoundaries.length > 0 ? parsedBoundaries[0] : null) ||
    geocodedPos;

  const validCenter =
    centerCoords &&
    typeof centerCoords.lat === "number" &&
    typeof centerCoords.lng === "number" &&
    !isNaN(centerCoords.lat) &&
    !isNaN(centerCoords.lng)
      ? centerCoords
      : null;

  const googleMapsUrl = validCenter
    ? `https://www.google.com/maps/search/?api=1&query=${validCenter.lat},${validCenter.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || title || "India")}`;

  return (
    <CrmSectionCard title="Map & Geographical Boundaries">
      <div className="space-y-3">
        {/* Top Metric Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--surface-dim)] px-3.5 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            {validCenter ? (
              <span className="font-mono text-[var(--text-muted)]">
                GPS: <strong className="text-[var(--text-main)]">{validCenter.lat.toFixed(6)}, {validCenter.lng.toFixed(6)}</strong>
              </span>
            ) : address ? (
              <span className="text-[var(--text-muted)]">
                Location: <strong className="text-[var(--text-main)]">{address}</strong>
              </span>
            ) : null}
            {areaHectares != null && (
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 size={13} />
                Plotted Boundary Area: <strong>{areaHectares} Hectares</strong> ({parseFloat((areaHectares * 3.953686).toFixed(3))} Bigha)
              </span>
            )}
            {parsedBoundaries.length > 0 && (
              <span className="rounded bg-[var(--card-bg)] px-2 py-0.5 font-medium text-[var(--text-muted)] border border-[var(--border-color)]">
                {parsedBoundaries.length} Polygon Vertices
              </span>
            )}
          </div>

          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--card-bg)] px-2.5 py-1 font-semibold text-[var(--primary)] shadow-sm border border-[var(--border-color)] hover:bg-[var(--surface-dim)] transition-colors"
          >
            <ExternalLink size={13} /> Open in Google Maps
          </a>
        </div>

        {/* Map Container */}
        <div className="relative h-[380px] w-full overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-dim)] shadow-inner">
          <div ref={mapContainerRef} className="h-full w-full" />
        </div>
      </div>
    </CrmSectionCard>
  );
}
