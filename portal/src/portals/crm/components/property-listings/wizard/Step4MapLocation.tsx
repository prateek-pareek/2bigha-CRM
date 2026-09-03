"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import {
  MapPin,
  Search,
  PenTool,
  Move,
  Trash2,
  XCircle,
  HelpCircle,
  CheckCircle2,
  Loader2,
  Check,
} from "lucide-react";
import type { PropertyListingWizardDraft } from "./Step1LandDetails";

interface Step4MapLocationProps {
  draft: PropertyListingWizardDraft;
  onChange: <K extends keyof PropertyListingWizardDraft>(
    key: K,
    value: PropertyListingWizardDraft[K]
  ) => void;
  error?: string;
}

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
    const existingScript = document.getElementById("google-maps-script");
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
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry`;
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

export function Step4MapLocation({ draft, onChange, error }: Step4MapLocationProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const [mapMode, setMapMode] = useState<"pan" | "draw">("draw");
  const [mapType, setMapType] = useState<"satellite" | "map">("satellite");
  const [searchQuery, setSearchQuery] = useState(
    draft.mapLocation?.address ||
      (draft.city && draft.state ? `${draft.city}, ${draft.district || ""}, ${draft.state}, India` : "")
  );

  const mapInstanceRef = useRef<any>(null);
  const markerInstanceRef = useRef<any>(null);
  const activePolygonRef = useRef<any>(null);
  const activePolylineRef = useRef<any>(null);
  const drawnPointsRef = useRef<Array<{ lat: number; lng: number }>>([]);
  const pointMarkersRef = useRef<any[]>([]);
  const isDrawingActiveRef = useRef<boolean>(true);
  const renderedCoordsKeyRef = useRef<string>("");

  const [isCompleted, setIsCompleted] = useState(false);
  const [pointCount, setPointCount] = useState(0);

  const defaultCenter = useMemo(() => {
    return {
      lat: draft.mapLocation?.lat || 28.4595,
      lng: draft.mapLocation?.lng || 77.0266,
    };
  }, [draft.mapLocation?.lat, draft.mapLocation?.lng]);

  // Load Google Maps API
  useEffect(() => {
    const key =
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
      "AIzaSyCr0RqrqbwLz7YzZU3ZjtDeS9vK5idU700";
    loadGoogleMapsScript(key).then(() => {
      if (window.google?.maps) {
        setGoogleAvailable(true);
      }
      setMapLoaded(true);
    });
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!mapLoaded || !googleAvailable || !mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    try {
      const google = window.google;
      const map = new google.maps.Map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: 17,
        mapTypeId: mapType === "satellite" ? google.maps.MapTypeId.HYBRID : google.maps.MapTypeId.ROADMAP,
        disableDefaultUI: false,
        zoomControl: true,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: true,
        clickableIcons: false,
        draggable: false, // In drawing mode initially
        draggableCursor: "crosshair",
      });

      mapInstanceRef.current = map;

      // Location Marker
      const marker = new google.maps.Marker({
        position: defaultCenter,
        map,
        title: draft.mapLocation?.name || "Selected Location",
        zIndex: 999999,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: "#ef4444",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });
      markerInstanceRef.current = marker;

      // Autocomplete Search
      if (searchInputRef.current) {
        const autocomplete = new google.maps.places.Autocomplete(searchInputRef.current, {
          types: ["geocode", "establishment"],
          componentRestrictions: { country: "in" },
        });

        autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();
          if (!place.geometry || !place.geometry.location) return;

          const lat = place.geometry.location.lat();
          const lng = place.geometry.location.lng();
          const addr = place.formatted_address || place.name || "";
          const name = place.name || addr.split(",")[0] || "Location";

          map.setCenter({ lat, lng });
          map.setZoom(17);
          marker.setPosition({ lat, lng });

          setSearchQuery(addr);
          onChange("mapLocation", {
            name,
            address: addr,
            placeId: place.place_id,
            lat,
            lng,
          });
        });
      }

      // Map Click Handler for Vertex Placement
      map.addListener("click", (e: any) => {
        if (!e.latLng || !isDrawingActiveRef.current) return;

        const lat = e.latLng.lat();
        const lng = e.latLng.lng();

        // If clicking near the first point after ≥ 3 points, complete polygon
        if (drawnPointsRef.current.length >= 3) {
          const first = drawnPointsRef.current[0];
          if (google.maps.geometry?.spherical) {
            const dist = google.maps.geometry.spherical.computeDistanceBetween(
              new google.maps.LatLng(lat, lng),
              new google.maps.LatLng(first.lat, first.lng)
            );
            if (dist < 15) {
              completeManualPolygon();
              return;
            }
          }
        }

        addPoint({ lat, lng });
      });

      // Double click to complete polygon
      map.addListener("dblclick", (e: any) => {
        if (drawnPointsRef.current.length >= 3 && isDrawingActiveRef.current) {
          e.stop();
          completeManualPolygon();
        }
      });

      // Restore existing polygon if draft had it
      if (draft.mapCoordinates && draft.mapCoordinates.length >= 3) {
        const coords = draft.mapCoordinates.map((c) => ({ lat: c.lat, lng: c.lng }));
        renderCompletedPolygon(coords);
      }
    } catch (err) {
      console.warn("Google Maps setup error:", err);
    }
  }, [mapLoaded, googleAvailable]);

  // Reactive polygon boundary rendering from loaded draft
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google?.maps) return;

    let coords: Array<{ lat: number; lng: number }> = [];
    if (draft.mapCoordinates && draft.mapCoordinates.length >= 3) {
      coords = draft.mapCoordinates.map((c) => ({ lat: Number(c.lat), lng: Number(c.lng) }));
    } else if (draft.mapBoundaries && Array.isArray(draft.mapBoundaries) && draft.mapBoundaries.length > 0) {
      const b = draft.mapBoundaries[0];
      if (b?.coordinates && Array.isArray(b.coordinates)) {
        coords = b.coordinates.map((c: any) => ({ lat: Number(c.lat), lng: Number(c.lng) }));
      }
    }

    const key = JSON.stringify({
      coords,
      lat: draft.mapLocation?.lat,
      lng: draft.mapLocation?.lng,
    });
    if (key === renderedCoordsKeyRef.current) return;
    renderedCoordsKeyRef.current = key;

    if (coords.length >= 3) {
      renderCompletedPolygon(coords);
      const bounds = new window.google.maps.LatLngBounds();
      coords.forEach((c) => bounds.extend(c));
      mapInstanceRef.current.fitBounds(bounds);
    } else if (draft.mapLocation?.lat && draft.mapLocation?.lng) {
      mapInstanceRef.current.setCenter({
        lat: Number(draft.mapLocation.lat),
        lng: Number(draft.mapLocation.lng),
      });
      mapInstanceRef.current.setZoom(17);
    }
  }, [draft.mapBoundaries, draft.mapCoordinates, draft.mapLocation, mapLoaded]);

  // Handle map type switch
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google?.maps) return;
    const google = window.google;
    mapInstanceRef.current.setMapTypeId(
      mapType === "satellite" ? google.maps.MapTypeId.HYBRID : google.maps.MapTypeId.ROADMAP
    );
  }, [mapType]);

  const addPoint = (pt: { lat: number; lng: number }) => {
    if (!window.google?.maps || !mapInstanceRef.current) return;
    const google = window.google;

    const nextPoints = [...drawnPointsRef.current, pt];
    drawnPointsRef.current = nextPoints;
    setPointCount(nextPoints.length);

    const isFirst = nextPoints.length === 1;

    // Create high-visibility vertex marker
    const marker = new google.maps.Marker({
      position: pt,
      map: mapInstanceRef.current,
      zIndex: 9999999,
      title: isFirst ? "First Point (Click here to close boundary)" : `Point ${nextPoints.length}`,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: isFirst ? 8 : 5,
        fillColor: isFirst ? "#10b981" : "#3b82f6",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2.5,
      },
    });

    if (isFirst) {
      marker.addListener("click", (ev: any) => {
        ev.stop?.();
        if (drawnPointsRef.current.length >= 3) {
          completeManualPolygon();
        }
      });
    }

    pointMarkersRef.current.push(marker);

    // Update in-progress polyline connecting points
    if (activePolylineRef.current) {
      activePolylineRef.current.setPath(nextPoints);
    } else {
      activePolylineRef.current = new google.maps.Polyline({
        path: nextPoints,
        strokeColor: "#2563eb",
        strokeOpacity: 0.95,
        strokeWeight: 3.5,
        zIndex: 999998,
        map: mapInstanceRef.current,
      });
    }
  };

  const completeManualPolygon = () => {
    if (drawnPointsRef.current.length < 3) return;
    const coords = [...drawnPointsRef.current];
    renderCompletedPolygon(coords);
  };

  const renderCompletedPolygon = (coords: Array<{ lat: number; lng: number }>) => {
    if (!window.google?.maps || !mapInstanceRef.current) return;
    const google = window.google;

    clearTempMarkersAndLines();

    if (activePolygonRef.current) {
      activePolygonRef.current.setMap(null);
    }

    const polygon = new google.maps.Polygon({
      paths: coords,
      fillColor: "#3b82f6",
      fillOpacity: 0.4,
      strokeColor: "#2563eb",
      strokeWeight: 3,
      clickable: true,
      editable: true,
      zIndex: 999999,
      map: mapInstanceRef.current,
    });

    activePolygonRef.current = polygon;
    isDrawingActiveRef.current = false;
    setMapMode("pan");
    mapInstanceRef.current.setOptions({
      draggable: true,
      draggableCursor: null,
    });
    setIsCompleted(true);
    setPointCount(coords.length);

    setupPolygonEventListeners(polygon);
  };

  const setupPolygonEventListeners = (polygon: any) => {
    const updateData = () => {
      const path = polygon.getPath();
      const coords: Array<{ lat: number; lng: number }> = [];
      for (let i = 0; i < path.getLength(); i++) {
        const pt = path.getAt(i);
        coords.push({ lat: pt.lat(), lng: pt.lng() });
      }

      let areaHectares = 0;
      if (window.google?.maps?.geometry?.spherical) {
        const areaSqMeters = window.google.maps.geometry.spherical.computeArea(path);
        areaHectares = Number((areaSqMeters / 10000).toFixed(2));
      }

      setPointCount(coords.length);
      onChange("mapBoundaries", [{ type: "Polygon", coordinates: coords }]);
      onChange("mapCoordinates", coords);
      onChange("calculatedAreaHectares", areaHectares);

      if (!draft.mapLocation && coords.length > 0) {
        const addr = `${draft.city || ""}${draft.district ? ", " + draft.district : ""}${draft.state ? ", " + draft.state : ""}` || "Selected Location";
        onChange("mapLocation", {
          name: draft.city || "Property Location",
          address: addr,
          lat: coords[0].lat,
          lng: coords[0].lng,
        });
      }
    };

    polygon.addListener("rightclick", () => {
      clearBoundaries();
    });

    polygon.getPath().addListener("set_at", updateData);
    polygon.getPath().addListener("insert_at", updateData);
    polygon.getPath().addListener("remove_at", updateData);
  };

  const clearTempMarkersAndLines = () => {
    pointMarkersRef.current.forEach((m) => m.setMap(null));
    pointMarkersRef.current = [];
    if (activePolylineRef.current) {
      activePolylineRef.current.setMap(null);
      activePolylineRef.current = null;
    }
    drawnPointsRef.current = [];
  };

  const handleStartDrawing = () => {
    clearBoundaries();
    isDrawingActiveRef.current = true;
    setMapMode("draw");
    setIsCompleted(false);
    setPointCount(0);

    if (mapInstanceRef.current) {
      mapInstanceRef.current.setOptions({
        draggable: false, // Disables map panning so clicking adds points immediately
        draggableCursor: "crosshair",
      });
    }
  };

  const handlePanMap = () => {
    isDrawingActiveRef.current = false;
    setMapMode("pan");
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setOptions({
        draggable: true, // Enables smooth map panning
        draggableCursor: null,
      });
    }
  };

  const clearBoundaries = () => {
    clearTempMarkersAndLines();
    if (activePolygonRef.current) {
      activePolygonRef.current.setMap(null);
      activePolygonRef.current = null;
    }
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setOptions({
        draggable: true,
        draggableCursor: null,
      });
    }
    isDrawingActiveRef.current = false;
    setMapMode("pan");
    setIsCompleted(false);
    setPointCount(0);
    onChange("mapBoundaries", null);
    onChange("mapCoordinates", null);
    onChange("calculatedAreaHectares", 0);
  };

  const clearLocation = () => {
    clearBoundaries();
    setSearchQuery("");
    if (markerInstanceRef.current) {
      markerInstanceRef.current.setMap(null);
      markerInstanceRef.current = null;
    }
    onChange("mapLocation", null);
  };

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    if (window.google?.maps?.Geocoder && mapInstanceRef.current) {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ address: searchQuery }, (results: any, status: any) => {
        if (status === "OK" && results[0]) {
          const loc = results[0].geometry.location;
          const lat = loc.lat();
          const lng = loc.lng();
          const addr = results[0].formatted_address;
          const name = addr.split(",")[0];

          mapInstanceRef.current.setCenter({ lat, lng });
          mapInstanceRef.current.setZoom(17);

          if (!markerInstanceRef.current) {
            markerInstanceRef.current = new window.google.maps.Marker({
              map: mapInstanceRef.current,
              zIndex: 999999,
              icon: {
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: "#ef4444",
                fillOpacity: 1,
                strokeColor: "#ffffff",
                strokeWeight: 2,
              },
            });
          }
          markerInstanceRef.current.setPosition({ lat, lng });

          onChange("mapLocation", {
            name,
            address: addr,
            placeId: results[0].place_id,
            lat,
            lng,
          });
        }
      });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface)] p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between border-b border-[var(--border-color)] pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold text-sm">
              4
            </span>
            <div>
              <h2 className="text-base font-semibold text-[var(--foreground)]">
                Draw Property Boundaries
              </h2>
              <p className="text-xs text-[var(--text-muted)]">Mark property on Google Maps</p>
            </div>
          </div>
        </div>

        {/* 1. Location Search Input */}
        <form onSubmit={handleManualSearch} className="mb-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search location on Google Maps (e.g. Gurugram, Shahjahanpur, Haryana)"
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3.5 py-2 text-xs text-[var(--foreground)] placeholder:text-[var(--text-muted)] focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 pl-10 pr-24"
            />
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
            >
              Search
            </button>
          </div>
        </form>

        {/* 2. Selected Location Banner */}
        {draft.mapLocation && (
          <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-emerald-500/20 bg-emerald-50/40 dark:bg-emerald-950/20 p-3.5 text-xs text-emerald-800 dark:text-emerald-300">
            <MapPin className="h-4 w-4 shrink-0 text-rose-500 mt-0.5" />
            <div>
              <span className="font-semibold text-[var(--foreground)]">Location Selected: </span>
              <span>
                {draft.mapLocation.name} - {draft.mapLocation.address}. Red marker shows the location.
                You can now draw boundaries anywhere on the map.
              </span>
            </div>
          </div>
        )}

        {/* 3. Action Toolbar & Stats Bar */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleStartDrawing}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold shadow-sm transition-all cursor-pointer ${
                mapMode === "draw"
                  ? "bg-emerald-600 text-white hover:bg-emerald-700 ring-2 ring-emerald-500/40 shadow-emerald-600/30"
                  : "border border-[var(--border-color)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-dim)]"
              }`}
            >
              <PenTool className="h-4 w-4" />
              Start Drawing
            </button>

            <button
              type="button"
              onClick={handlePanMap}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold shadow-sm transition-all cursor-pointer ${
                mapMode === "pan"
                  ? "bg-emerald-600 text-white hover:bg-emerald-700 ring-2 ring-emerald-500/40"
                  : "border border-[var(--border-color)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-dim)]"
              }`}
            >
              <Move className="h-4 w-4" />
              Pan Map
            </button>

            {mapMode === "draw" && pointCount >= 3 && !isCompleted && (
              <button
                type="button"
                onClick={completeManualPolygon}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-md hover:bg-emerald-700 animate-pulse"
              >
                <Check className="h-4 w-4" />
                Complete Boundary
              </button>
            )}

            <button
              type="button"
              onClick={clearBoundaries}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3.5 py-2 text-xs font-semibold text-[var(--foreground)] shadow-sm hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/20 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear Boundaries
            </button>

            <button
              type="button"
              onClick={clearLocation}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3.5 py-2 text-xs font-semibold text-[var(--foreground)] shadow-sm hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/20 cursor-pointer"
            >
              <XCircle className="h-3.5 w-3.5" />
              Clear Location
            </button>
          </div>

          {/* Metric Badges */}
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-[var(--text-muted)]">
            <span className="rounded-md border border-[var(--border-color)] bg-[var(--surface-dim)] px-2.5 py-1.5">
              📍 Location: {draft.mapLocation?.name || "None"}
            </span>
            <span className="rounded-md border border-[var(--border-color)] bg-[var(--surface-dim)] px-2.5 py-1.5">
              📐 {isCompleted ? 1 : 0} boundary(ies)
            </span>
            <span className="rounded-md border border-[var(--border-color)] bg-[var(--surface-dim)] px-2.5 py-1.5">
              📌 {pointCount} coordinates
            </span>
            <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 font-semibold text-emerald-700 dark:text-emerald-300">
              📏 {draft.calculatedAreaHectares || 0} hectares
            </span>
          </div>
        </div>

        {/* 4. Google Maps Container */}
        <div className="relative h-[480px] w-full overflow-hidden rounded-xl border border-[var(--border-color)] bg-zinc-900 shadow-inner">
          {/* Map / Satellite Toggle */}
          <div className="absolute top-3 left-3 z-30 flex overflow-hidden rounded-md border border-white/20 bg-black/70 shadow-lg backdrop-blur-md">
            <button
              type="button"
              onClick={() => setMapType("map")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                mapType === "map" ? "bg-white text-zinc-900 font-semibold" : "text-white hover:bg-white/10"
              }`}
            >
              Map
            </button>
            <button
              type="button"
              onClick={() => setMapType("satellite")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                mapType === "satellite" ? "bg-white text-zinc-900 font-semibold" : "text-white hover:bg-white/10"
              }`}
            >
              Satellite
            </button>
          </div>

          {/* Real Google Maps div */}
          <div ref={mapContainerRef} className="h-full w-full" />

          {/* Loading state indicator */}
          {!mapLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/80 backdrop-blur-sm text-white text-xs gap-2 z-20">
              <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
              Loading Google Maps...
            </div>
          )}

          {/* Completion Badge */}
          {isCompleted && (
            <div className="pointer-events-none absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xl z-30">
              <CheckCircle2 className="h-4 w-4" />
              Boundary Completed ({draft.calculatedAreaHectares} ha)
            </div>
          )}

          {/* Active Mode Banner */}
          {mapMode === "draw" && !isCompleted && (
            <div className="pointer-events-none absolute bottom-4 inset-x-0 flex justify-center z-30">
              <span className="rounded-full bg-emerald-600/90 px-4 py-2 text-xs font-medium text-white shadow-lg backdrop-blur-sm border border-white/20">
                ✏️ Drawing Mode Active: Click points on the map to create boundary. Click the first green dot, double-click, or click &quot;Complete Boundary&quot; to finish.
              </span>
            </div>
          )}
        </div>

        {/* 5. Instructions Card (matching PDF page 4) */}
        <div className="mt-5 rounded-xl border border-[var(--border-color)] bg-[var(--surface-dim)]/40 p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--foreground)]">
            <HelpCircle className="h-4 w-4 text-emerald-600" />
            <span>How to use the property boundary tool:</span>
          </div>
          <ul className="grid grid-cols-1 gap-1.5 text-xs text-[var(--text-muted)] md:grid-cols-2">
            <li>• Search for a location using the search box above to set a reference point</li>
            <li>• The red marker shows your selected location with detailed information</li>
            <li>• Click &quot;Start Drawing&quot; to activate drawing mode</li>
            <li>• Click on the map to place points and create your property boundary</li>
            <li>• Continue clicking to add more points to your shape</li>
            <li>• Click the green dot (first point) or double-click to complete the boundary</li>
            <li>• You can draw only one boundary. Clear existing boundary to redraw.</li>
            <li>• After drawing, you can drag the corner points to adjust the shape</li>
            <li>• Right-click on any boundary to delete it</li>
            <li>• Use &quot;Clear Location&quot; to remove the location marker and search</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
