"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  MapPin,
  ExternalLink,
  Layers,
  Maximize2,
  Minimize2,
  CheckCircle2,
  Copy,
  Check,
} from "lucide-react";
import { CrmSectionCard } from "@/components/crm/ui";
import { toast } from "sonner";

declare global {
  interface Window {
    google?: any;
    initGoogleMapsPromise?: Promise<void>;
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

interface LatLngPoint {
  lat: number;
  lng: number;
}

interface PropertyDetailMapViewProps {
  coordinates?: { lat?: number | string; lng?: number | string } | any;
  boundaries?: Array<{ lat: number | string; lng: number | string }> | any;
  location?: { address?: string; city?: string; state?: string; areaHectares?: number } | any;
  geoJson?: any;
  calculatedArea?: number;
  title?: string;
  address?: string;
}

export default function PropertyDetailMapView({
  coordinates,
  boundaries,
  location,
  geoJson,
  calculatedArea,
  title,
  address,
}: PropertyDetailMapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const polygonRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const vertexMarkersRef = useRef<any[]>([]);

  const [copiedGps, setCopiedGps] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [geocodedPos, setGeocodedPos] = useState<LatLngPoint | null>(null);

  // Universal helper to parse any raw shape into an array of {lat, lng} points
  const extractPolygonPoints = useCallback((raw: any): LatLngPoint[] => {
    if (!raw) return [];

    // If stringified JSON, parse it first
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        return extractPolygonPoints(parsed);
      } catch {
        return [];
      }
    }

    if (Array.isArray(raw)) {
      if (raw.length === 0) return [];

      // 1. Array of objects { lat, lng } or { latitude, longitude }
      if (
        (raw[0]?.lat != null || raw[0]?.latitude != null) &&
        (raw[0]?.lng != null || raw[0]?.longitude != null)
      ) {
        return raw
          .map((p) => {
            const lat = Number(p.lat ?? p.latitude);
            const lng = Number(p.lng ?? p.longitude ?? p.long);
            if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
            return null;
          })
          .filter(Boolean) as LatLngPoint[];
      }

      // 2. Array of objects containing coordinates property
      if (raw[0]?.coordinates) {
        return extractPolygonPoints(raw[0].coordinates);
      }

      // 3. Nested array (e.g. GeoJSON coordinates: [[[lng, lat], ...]] or [[lng, lat], ...])
      if (Array.isArray(raw[0])) {
        if (Array.isArray(raw[0][0])) {
          return extractPolygonPoints(raw[0]);
        }
        return raw
          .map((p: any) => {
            const a = Number(p[0]);
            const b = Number(p[1]);
            if (isNaN(a) || isNaN(b)) return null;
            // Standard GeoJSON coordinates format is [longitude, latitude]
            // In India: longitude is ~68-98°E, latitude is ~8-37°N
            if (a > 60 && a < 100 && b > 5 && b < 40) {
              return { lat: b, lng: a };
            }
            // In case coords were saved as [lat, lng]
            if (b > 60 && b < 100 && a > 5 && a < 40) {
              return { lat: a, lng: b };
            }
            return { lat: a, lng: b };
          })
          .filter(Boolean) as LatLngPoint[];
      }

      // 4. Array of objects with string lat/lng
      return raw
        .map((p: any) => {
          if (!p) return null;
          const lat = typeof p.lat === "number" ? p.lat : parseFloat(p.lat ?? p.latitude);
          const lng = typeof p.lng === "number" ? p.lng : parseFloat(p.lng ?? p.longitude);
          if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
          return null;
        })
        .filter(Boolean) as LatLngPoint[];
    }

    if (raw && typeof raw === "object") {
      if (raw.type === "FeatureCollection" && Array.isArray(raw.features) && raw.features.length > 0) {
        return extractPolygonPoints(raw.features[0]?.geometry?.coordinates);
      }
      if (raw.type === "Feature" && raw.geometry?.coordinates) {
        return extractPolygonPoints(raw.geometry.coordinates);
      }
      if (raw.geometry?.coordinates) {
        return extractPolygonPoints(raw.geometry.coordinates);
      }
      if (raw.coordinates) {
        return extractPolygonPoints(raw.coordinates);
      }
    }

    return [];
  }, []);

  // Compute parsed polygon boundaries from geoJson, boundaries, or coordinates
  const parsedBoundaries: LatLngPoint[] = (() => {
    if (geoJson) {
      const pts = extractPolygonPoints(geoJson);
      if (pts.length >= 3) return pts;
    }
    if (boundaries) {
      const pts = extractPolygonPoints(boundaries);
      if (pts.length >= 3) return pts;
    }
    if (Array.isArray(coordinates) && coordinates.length >= 3) {
      const pts = extractPolygonPoints(coordinates);
      if (pts.length >= 3) return pts;
    }
    return [];
  })();

  // Compute parsed center coordinate
  const parsedCoords: LatLngPoint | null = (() => {
    if (!coordinates) return null;
    if (typeof coordinates.lat === "number" && typeof coordinates.lng === "number") {
      return { lat: coordinates.lat, lng: coordinates.lng };
    }
    if (typeof coordinates.latitude === "number" && typeof coordinates.longitude === "number") {
      return { lat: coordinates.latitude, lng: coordinates.longitude };
    }
    if (typeof coordinates.lat === "string" && typeof coordinates.lng === "string") {
      const lat = parseFloat(coordinates.lat);
      const lng = parseFloat(coordinates.lng);
      if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
    }
    if (Array.isArray(coordinates) && coordinates.length === 2) {
      const a = Number(coordinates[0]);
      const b = Number(coordinates[1]);
      if (!isNaN(a) && !isNaN(b)) {
        if (a > 60 && a < 100 && b > 5 && b < 40) return { lat: b, lng: a };
        return { lat: a, lng: b };
      }
    }
    return null;
  })();

  // Calculated or measured area in hectares
  const [computedHectares, setComputedHectares] = useState<number | null>(() => {
    if (calculatedArea != null && calculatedArea > 0) {
      // 2Bigha calculatedArea is typically in square meters
      return parseFloat((calculatedArea / 10000).toFixed(4));
    }
    const ha = location?.areaHectares ? Number(location.areaHectares) : null;
    return ha && !isNaN(ha) ? ha : null;
  });

  // Center point priority: explicit parsed center -> centroid / 1st vertex of boundary -> geocoded address
  const activeCenter: LatLngPoint | null =
    parsedCoords ||
    (parsedBoundaries.length > 0 ? parsedBoundaries[0] : null) ||
    geocodedPos;

  // Initialize or re-render map overlays whenever props change
  const renderMapOverlays = useCallback(() => {
    if (!window.google?.maps || !mapContainerRef.current) return;

    // Create Map instance if not already created
    if (!mapInstanceRef.current) {
      const initialCenter = activeCenter || { lat: 26.9124, lng: 75.7873 }; // Jaipur fallback
      const map = new window.google.maps.Map(mapContainerRef.current, {
        center: initialCenter,
        zoom: parsedBoundaries.length > 0 || parsedCoords ? 16 : 13,
        mapTypeId: window.google.maps.MapTypeId.HYBRID,
        tilt: 0,
        fullscreenControl: false,
        streetViewControl: true,
        mapTypeControl: true,
        mapTypeControlOptions: {
          position: window.google.maps.ControlPosition.TOP_LEFT,
        },
      });
      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;

    // 1. Clear previous polygon & vertex markers
    if (polygonRef.current) {
      polygonRef.current.setMap(null);
      polygonRef.current = null;
    }
    vertexMarkersRef.current.forEach((m) => m.setMap(null));
    vertexMarkersRef.current = [];

    // 2. Clear previous center pin
    if (markerRef.current) {
      markerRef.current.setMap(null);
      markerRef.current = null;
    }

    const bounds = new window.google.maps.LatLngBounds();

    // 3. Draw Polygon if 3 or more boundary points exist
    if (parsedBoundaries.length >= 3) {
      const polygon = new window.google.maps.Polygon({
        paths: parsedBoundaries,
        strokeColor: "#10b981",
        strokeOpacity: 1.0,
        strokeWeight: 3.5,
        fillColor: "#10b981",
        fillOpacity: 0.35,
        map,
        zIndex: 99999,
      });
      polygonRef.current = polygon;

      parsedBoundaries.forEach((p, idx) => {
        bounds.extend(p);
        const vertexMarker = new window.google.maps.Marker({
          position: p,
          map,
          title: `Boundary Point #${idx + 1}: ${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`,
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
        vertexMarkersRef.current.push(vertexMarker);
      });

      map.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 });

      // Compute area dynamically if spherical geometry is loaded and not already set
      if (calculatedArea != null && calculatedArea > 0) {
        setComputedHectares(parseFloat((calculatedArea / 10000).toFixed(4)));
      } else if (window.google?.maps?.geometry?.spherical) {
        const areaSqMeters = window.google.maps.geometry.spherical.computeArea(
          polygon.getPath()
        );
        const ha = areaSqMeters / 10000;
        setComputedHectares(parseFloat(ha.toFixed(4)));
      }
    } else if (parsedCoords) {
      bounds.extend(parsedCoords);
      map.setCenter(parsedCoords);
      map.setZoom(17);
    }

    // 4. Place Center Marker Pin
    const pinPos =
      parsedCoords ||
      (parsedBoundaries.length > 0 ? parsedBoundaries[0] : null) ||
      geocodedPos;

    if (pinPos) {
      const marker = new window.google.maps.Marker({
        position: pinPos,
        map,
        title: title || "Property Coordinates",
        animation: window.google.maps.Animation.DROP,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: "#059669",
          fillOpacity: 1,
          strokeWeight: 2.5,
          strokeColor: "#ffffff",
        },
      });
      markerRef.current = marker;
    } else if (address && window.google?.maps?.Geocoder && !geocodedPos) {
      // Fallback Geocoding
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ address }, (results: any, status: any) => {
        if (status === "OK" && results?.[0]?.geometry?.location) {
          const loc = results[0].geometry.location;
          const pos = { lat: loc.lat(), lng: loc.lng() };
          setGeocodedPos(pos);
          map.setCenter(pos);
          map.setZoom(14);
          const geocodedMarker = new window.google.maps.Marker({
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
          markerRef.current = geocodedMarker;
        }
      });
    }
  }, [
    activeCenter,
    address,
    calculatedArea,
    geocodedPos,
    parsedBoundaries,
    parsedCoords,
    title,
  ]);

  useEffect(() => {
    const apiKey =
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
      "AIzaSyCr0RqrqbwLz7YzZU3ZjtDeS9vK5idU700";

    loadGoogleMapsScript(apiKey).then(() => {
      renderMapOverlays();
    });
  }, [renderMapOverlays]);

  const copyGpsToClipboard = () => {
    if (!activeCenter) return;
    const str = `${activeCenter.lat.toFixed(6)}, ${activeCenter.lng.toFixed(6)}`;
    navigator.clipboard.writeText(str);
    setCopiedGps(true);
    toast.success(`Copied GPS coordinates (${str}) to clipboard`);
    setTimeout(() => setCopiedGps(false), 2000);
  };

  const googleMapsUrl = activeCenter
    ? `https://www.google.com/maps/search/?api=1&query=${activeCenter.lat},${activeCenter.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || title || "India")}`;

  return (
    <CrmSectionCard title="Map & Geographical Boundaries">
      <div className="space-y-3">
        {/* Top Metric Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg bg-[var(--surface-dim)] px-4 py-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            {activeCenter ? (
              <button
                type="button"
                onClick={copyGpsToClipboard}
                className="group inline-flex items-center gap-1.5 rounded-md bg-[var(--card-bg)] px-2.5 py-1 font-mono text-[var(--text-main)] border border-[var(--border-color)] hover:border-[var(--primary)] transition-colors shadow-sm"
                title="Click to copy GPS coordinates"
              >
                <MapPin size={13} className="text-emerald-500" />
                <span className="text-[var(--text-muted)] group-hover:text-[var(--text-main)]">GPS:</span>
                <strong>
                  {activeCenter.lat.toFixed(6)}, {activeCenter.lng.toFixed(6)}
                </strong>
                {copiedGps ? (
                  <Check size={12} className="text-emerald-500 ml-0.5" />
                ) : (
                  <Copy size={12} className="text-[var(--text-muted)] group-hover:text-[var(--primary)] ml-0.5" />
                )}
              </button>
            ) : address ? (
              <span className="text-[var(--text-muted)] inline-flex items-center gap-1.5">
                <MapPin size={13} className="text-[var(--primary)]" />
                Address: <strong className="text-[var(--text-main)]">{address}</strong>
              </span>
            ) : null}

            {computedHectares != null && (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 font-medium text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400" />
                Plotted Boundary: <strong>{computedHectares} Hectares</strong> ({parseFloat((computedHectares * 3.953686).toFixed(3))} Bigha)
              </span>
            )}

            {parsedBoundaries.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md bg-[var(--card-bg)] px-2.5 py-1 font-medium text-[var(--text-muted)] border border-[var(--border-color)] shadow-sm">
                <Layers size={13} className="text-[var(--primary)]" />
                {parsedBoundaries.length} Polygon Vertices
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsFullscreen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--card-bg)] px-2.5 py-1 font-medium text-[var(--text-muted)] border border-[var(--border-color)] hover:text-[var(--text-main)] hover:bg-[var(--surface-dim)] transition-colors shadow-sm"
              title={isFullscreen ? "Exit Fullscreen" : "Expand Map"}
            >
              {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              <span>{isFullscreen ? "Standard View" : "Expand"}</span>
            </button>

            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--card-bg)] px-2.5 py-1 font-semibold text-[var(--primary)] shadow-sm border border-[var(--border-color)] hover:bg-[var(--surface-dim)] transition-colors"
            >
              <ExternalLink size={13} /> Open in Google Maps
            </a>
          </div>
        </div>

        {/* Map Container */}
        <div
          className={`relative w-full overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-dim)] shadow-inner transition-all duration-300 ${
            isFullscreen ? "h-[620px]" : "h-[420px]"
          }`}
        >
          <div ref={mapContainerRef} className="h-full w-full" />
        </div>
      </div>
    </CrmSectionCard>
  );
}
