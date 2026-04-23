"use client";
import { useEffect, useRef, useCallback } from "react";
import { MapPin, Pencil, X } from "lucide-react";

// GeoJSON Polygon geometry as stored in delivery_zones.geojson
// Coordinates follow GeoJSON spec: [longitude, latitude]
// Yandex Maps uses [latitude, longitude] — conversion happens inside this component.
export type ZoneGeoJSON = {
  type: "Polygon";
  coordinates: [number, number][][];
};

export type DeliveryZone = {
  id: string;
  name: string;
  geojson: ZoneGeoJSON;
  is_active: boolean;
  sort_order: number;
};

type Props = {
  // Zones to render as polygons on the map.
  zones: DeliveryZone[];
  // 'view'  — read-only, shows all zones.
  // 'draw'  — allows the user to draw a new polygon by clicking.
  mode: "view" | "draw";
  // Called with the completed GeoJSON polygon when the user closes the polygon.
  onPolygonComplete?: (geojson: ZoneGeoJSON) => void;
  // Called when the user cancels drawing (Escape or cancel button).
  onDrawCancel?: () => void;
  // Optional centre for the initial map view [lat, lng].
  // Defaults to the centroid of the first zone, or Moscow if no zones exist.
  center?: [number, number];
};

const DEFAULT_CENTER: [number, number] = [55.751244, 37.618423]; // Moscow
const DEFAULT_ZOOM = 11;
const YANDEX_MAPS_URL = `https://api-maps.yandex.ru/2.1/?apikey=${process.env.NEXT_PUBLIC_YANDEX_MAPS_KEY ?? ""}&lang=ru_RU`;

// Convert GeoJSON [lng, lat] pairs to Yandex Maps [lat, lng] pairs.
function geojsonToYmaps(coords: [number, number][]): [number, number][] {
  return coords.map(([lng, lat]) => [lat, lng]);
}

// Convert Yandex Maps [lat, lng] pairs back to GeoJSON [lng, lat] pairs.
function ymapsToGeojson(coords: [number, number][]): [number, number][] {
  return coords.map(([lat, lng]) => [lng, lat]);
}

declare global {
  interface Window {
    ymaps: any;
    _ymapsReady: boolean;
    _ymapsCallbacks: Array<() => void>;
  }
}

// Loads the Yandex Maps 2.1 script once per page, regardless of how many
// DeliveryZoneMap instances are mounted. Extra calls reuse the same promise.
function loadYandexMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window._ymapsReady) return Promise.resolve();

  return new Promise((resolve) => {
    if (!window._ymapsCallbacks) window._ymapsCallbacks = [];
    window._ymapsCallbacks.push(resolve);

    if (document.querySelector(`script[src^="https://api-maps.yandex.ru"]`)) return;

    const script = document.createElement("script");
    script.src = YANDEX_MAPS_URL;
    script.async = true;
    script.onload = () => {
      window.ymaps.ready(() => {
        window._ymapsReady = true;
        window._ymapsCallbacks.forEach((cb) => cb());
        window._ymapsCallbacks = [];
      });
    };
    document.head.appendChild(script);
  });
}

export default function DeliveryZoneMap({
  zones,
  mode,
  onPolygonComplete,
  onDrawCancel,
  center,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const drawingRef = useRef<{
    points: [number, number][];
    polyline: any;
    markers: any[];
  }>({ points: [], polyline: null, markers: [] });

  const apiKeyMissing = !process.env.NEXT_PUBLIC_YANDEX_MAPS_KEY;

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  const getMapCenter = useCallback((): [number, number] => {
    if (center) return center;
    if (zones.length > 0) {
      const coords = zones[0].geojson.coordinates[0];
      const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
      const lng = coords.reduce((s, c) => s + c[0], 0) / coords.length;
      return [lat, lng];
    }
    return DEFAULT_CENTER;
  }, [center, zones]);

  const clearDrawing = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const { polyline, markers } = drawingRef.current;
    if (polyline) map.geoObjects.remove(polyline);
    markers.forEach((m) => map.geoObjects.remove(m));
    drawingRef.current = { points: [], polyline: null, markers: [] };
  }, []);

  // ------------------------------------------------------------------
  // Map initialisation
  // ------------------------------------------------------------------

  useEffect(() => {
    if (apiKeyMissing || !containerRef.current) return;

    let destroyed = false;

    loadYandexMaps().then(() => {
      if (destroyed || !containerRef.current) return;

      const ymaps = window.ymaps;
      const map = new ymaps.Map(containerRef.current, {
        center: getMapCenter(),
        zoom: DEFAULT_ZOOM,
        controls: ["zoomControl", "fullscreenControl"],
      });
      mapRef.current = map;

      // Render existing zones
      zones.forEach((zone) => {
        const polygon = new ymaps.Polygon(
          [geojsonToYmaps(zone.geojson.coordinates[0])],
          { hintContent: zone.name },
          {
            fillColor: zone.is_active ? "#F5730030" : "#94a3b830",
            strokeColor: zone.is_active ? "#F57300" : "#94a3b8",
            strokeWidth: 2,
            opacity: 0.8,
          }
        );
        map.geoObjects.add(polygon);
      });

      // Drawing mode: click to place points, double-click to close polygon
      if (mode === "draw") {
        map.events.add("click", (e: any) => {
          const coords: [number, number] = e.get("coords");
          const d = drawingRef.current;
          d.points.push(coords);

          // Dot marker at each vertex
          const dot = new ymaps.Placemark(coords, {}, {
            preset: "islands#circleDotIcon",
            iconColor: "#F57300",
          });
          map.geoObjects.add(dot);
          d.markers.push(dot);

          // Update preview polyline
          if (d.polyline) map.geoObjects.remove(d.polyline);
          if (d.points.length >= 2) {
            d.polyline = new ymaps.Polyline(
              [...d.points, d.points[0]],
              {},
              { strokeColor: "#F57300", strokeWidth: 2, strokeStyle: "dash" }
            );
            map.geoObjects.add(d.polyline);
          }
        });

        map.events.add("dblclick", (e: any) => {
          e.preventDefault();
          const d = drawingRef.current;
          if (d.points.length < 3) return;

          const closed = [...d.points, d.points[0]];
          const geojson: ZoneGeoJSON = {
            type: "Polygon",
            coordinates: [ymapsToGeojson(closed)],
          };
          clearDrawing();
          onPolygonComplete?.(geojson);
        });
      }
    });

    return () => {
      destroyed = true;
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  // Zones and mode are intentionally excluded: the map re-initialises only
  // when the component mounts. Zone updates are handled by the parent by
  // unmounting/remounting with a key prop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKeyMissing]);

  // ------------------------------------------------------------------
  // Keyboard: Escape cancels drawing
  // ------------------------------------------------------------------

  useEffect(() => {
    if (mode !== "draw") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { clearDrawing(); onDrawCancel?.(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, clearDrawing, onDrawCancel]);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  if (apiKeyMissing) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-full min-h-64 bg-neutral-50 rounded-xl border-2 border-dashed border-neutral-200 text-neutral-400">
        <MapPin size={32} className="text-neutral-300" />
        <p className="text-sm font-medium">Карта недоступна</p>
        <p className="text-xs text-center px-6">
          Добавьте <code className="bg-neutral-100 px-1 rounded">NEXT_PUBLIC_YANDEX_MAPS_KEY</code> в <code className="bg-neutral-100 px-1 rounded">.env.local</code>
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-64 rounded-xl overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />

      {mode === "draw" && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-white/95 backdrop-blur-sm rounded-full shadow-md px-4 py-2 text-sm pointer-events-none">
          <Pencil size={13} className="text-brand-500" />
          <span>Кликайте по карте, чтобы нанести точки. Двойной клик — завершить.</span>
          <button
            className="pointer-events-auto btn-ghost btn-sm ml-1"
            onClick={() => { clearDrawing(); onDrawCancel?.(); }}
          >
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
