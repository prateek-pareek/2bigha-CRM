/**
 * The one Google Maps key for every property-listing map (wizard steps, detail view).
 * They share a single `<script id="google-maps-script">`, so whichever component loads
 * first decides the key for the whole page — they must all resolve it the same way.
 * A keyless load fails with "ApiProjectMapError" and blocks geocoding.
 */
export const GOOGLE_MAPS_API_KEY =
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "AIzaSyCr0RqrqbwLz7YzZU3ZjtDeS9vK5idU700";
