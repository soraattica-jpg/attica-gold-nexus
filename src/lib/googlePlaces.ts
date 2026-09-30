const GOOGLE_MAPS_PLACES_API_KEY = (
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  || (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "")
).trim();

type GoogleMapsWindow = Window & typeof globalThis & {
  google?: GoogleMapsLike;
  __atticaGooglePlacesLoaderPromise?: Promise<GoogleMapsLike>;
};

type GoogleMapsLike = {
  maps: {
    Geocoder: new () => {
      geocode: (
        request: { address: string },
        callback: (results: GooglePlaceLike[] | null, status: string) => void,
      ) => void;
    };
    places: {
      AutocompleteService: new () => {
        getPlacePredictions: (
          request: { input: string; componentRestrictions?: { country: string } },
          callback: (predictions: Array<{ description?: string; place_id?: string }> | null, status: string) => void,
        ) => void;
      };
      PlacesService: new (container: HTMLDivElement) => {
        getDetails: (
          request: { placeId: string; fields: string[] },
          callback: (place: GooglePlaceLike | null, status: string) => void,
        ) => void;
      };
    };
  };
};

type GooglePlaceAddressComponent = {
  long_name?: string;
  short_name?: string;
  types?: string[];
};

type GooglePlaceGeometryLocation = {
  lat?: (() => number) | number;
  lng?: (() => number) | number;
};

type GooglePlaceLike = {
  name?: string;
  formatted_address?: string;
  address_components?: GooglePlaceAddressComponent[];
  geometry?: {
    location?: GooglePlaceGeometryLocation;
  };
};

export type GooglePlaceSelection = {
  location: string;
  district: string;
  label: string;
  lat: number | null;
  lng: number | null;
};

export type GooglePlaceSuggestion = {
  description: string;
  placeId?: string;
};

const GOOGLE_PLACES_SCRIPT_ID = "attica-google-places-script";

const getScriptMount = () => {
  if (typeof document === "undefined") return null;
  return document.head || document.documentElement || null;
};

const toCoordinate = (value: unknown) => {
  if (typeof value === "function") {
    const result = value();
    return Number.isFinite(result) ? result : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
};

const pickAddressComponent = (components: GooglePlaceAddressComponent[], candidateTypes: string[]) => {
  for (const component of components) {
    const types = Array.isArray(component?.types) ? component.types : [];
    if (candidateTypes.some((candidate) => types.includes(candidate))) {
      return String(component.long_name || component.short_name || "").trim();
    }
  }
  return "";
};

export async function loadGooglePlacesLibrary() {
  if (typeof window === "undefined") {
    throw new Error("Google Places requires a browser environment");
  }

  if (!GOOGLE_MAPS_PLACES_API_KEY) {
    throw new Error("Missing Google Maps Places API key");
  }

  const googleWindow = window as GoogleMapsWindow;
  if (googleWindow.google?.maps?.places) {
    return googleWindow.google;
  }

  if (googleWindow.__atticaGooglePlacesLoaderPromise) {
    return googleWindow.__atticaGooglePlacesLoaderPromise;
  }

  googleWindow.__atticaGooglePlacesLoaderPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(GOOGLE_PLACES_SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener("load", () => {
        if (googleWindow.google?.maps?.places) {
          resolve(googleWindow.google);
          return;
        }
        reject(new Error("Google Places library did not initialize"));
      }, { once: true });
      existingScript.addEventListener("error", () => {
        reject(new Error("Google Places script failed to load"));
      }, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_PLACES_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_PLACES_API_KEY)}&libraries=places`;
    script.onload = () => {
      if (googleWindow.google?.maps?.places) {
        resolve(googleWindow.google);
        return;
      }
      reject(new Error("Google Places library did not initialize"));
    };
    script.onerror = () => reject(new Error("Google Places script failed to load"));
    const mount = getScriptMount();
    if (!mount) {
      reject(new Error("Google Places script mount is not ready"));
      return;
    }
    mount.appendChild(script);
  });

  return googleWindow.__atticaGooglePlacesLoaderPromise;
}

export async function geocodeGoogleAddress(address: string) {
  const google = await loadGooglePlacesLibrary();
  const geocoder = new google.maps.Geocoder();

  return new Promise<GooglePlaceSelection | null>((resolve, reject) => {
    geocoder.geocode(
      {
        address,
        componentRestrictions: { country: "IN" },
      },
      (results: GooglePlaceLike[], status: string) => {
        if (status !== "OK" || !Array.isArray(results) || results.length === 0) {
          if (status === "ZERO_RESULTS") {
            resolve(null);
            return;
          }
          reject(new Error(`Google geocode returned ${status}`));
          return;
        }

        resolve(extractGooglePlaceSelection(results[0]));
      },
    );
  });
}

export async function getGooglePlaceSuggestions(query: string) {
  const google = await loadGooglePlacesLibrary();
  const autocompleteService = new google.maps.places.AutocompleteService();

  return new Promise<GooglePlaceSuggestion[]>((resolve, reject) => {
    autocompleteService.getPlacePredictions(
      {
        input: String(query || "").trim(),
        componentRestrictions: { country: "in" },
        types: ["geocode"],
      },
      (predictions: Array<{ description?: string; place_id?: string }> | null, status: string) => {
        if (!["OK", "ZERO_RESULTS"].includes(status)) {
          reject(new Error(`Google autocomplete returned ${status}`));
          return;
        }

        resolve(
          Array.isArray(predictions)
            ? predictions
                .map((prediction) => ({
                  description: String(prediction?.description || "").trim(),
                  placeId: String(prediction?.place_id || "").trim() || undefined,
                }))
                .filter((prediction) => prediction.description)
            : [],
        );
      },
    );
  });
}

export function extractGooglePlaceSelection(place: GooglePlaceLike | null | undefined): GooglePlaceSelection {
  const addressComponents = Array.isArray(place?.address_components) ? place.address_components : [];
  const formattedAddress = String(place?.formatted_address || place?.name || "").trim();
  const parsedParts = formattedAddress.split(",").map((part) => part.trim()).filter(Boolean);

  const location = (
    pickAddressComponent(addressComponents, ["sublocality_level_1", "sublocality", "neighborhood", "locality"])
    || parsedParts[0]
    || String(place?.name || "").trim()
  );
  const district = (
    pickAddressComponent(addressComponents, ["locality", "administrative_area_level_2", "administrative_area_level_1"])
    || parsedParts[1]
    || ""
  );

  return {
    location,
    district,
    label: formattedAddress || [location, district].filter(Boolean).join(", "),
    lat: toCoordinate(place?.geometry?.location?.lat),
    lng: toCoordinate(place?.geometry?.location?.lng),
  };
}
