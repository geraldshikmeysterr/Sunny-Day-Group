"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { MapPin, X, Check } from "lucide-react";

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
  zones: DeliveryZone[];
  mode: "view" | "draw";
  onPolygonComplete?: (geojson: ZoneGeoJSON) => void;
  onDrawCancel?: () => void;
  center?: [number, number];
};

const DEFAULT_CENTER: [number, number] = [55.751244, 37.618423];
const DEFAULT_ZOOM = 11;

// GeoJSON: [lng, lat] → Yandex Maps: [lat, lng]
function toYmaps(coords: [number, number][]): [number, number][] {
  return coords.map(([lng, lat]) => [lat, lng]);
}
// Yandex Maps: [lat, lng] → GeoJSON: [lng, lat]
function toGeojson(coords: [number, number][]): [number, number][] {
  return coords.map(([lat, lng]) => [lng, lat]);
}

declare global {
  // var declarations extend globalThis (required for globalThis.x access)
  var ymaps: any;
  var _ymapsReady: boolean;
  var _ymapsCallbacks: Array<() => void>;
}

function onYmapsScriptLoad() {
  globalThis.ymaps.ready(() => {
    globalThis._ymapsReady = true;
    (globalThis._ymapsCallbacks ?? []).forEach((cb) => cb());
    globalThis._ymapsCallbacks = [];
  });
}

function loadYandexMaps(apiKey: string): Promise<void> {
  if (globalThis.window === undefined) return Promise.resolve();
  if (globalThis._ymapsReady) return Promise.resolve();

  return new Promise((resolve) => {
    if (!globalThis._ymapsCallbacks) globalThis._ymapsCallbacks = [];
    globalThis._ymapsCallbacks.push(resolve);
    if (document.querySelector(`script[src^="https://api-maps.yandex.ru"]`)) return;

    const script = document.createElement("script");
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${apiKey}&lang=ru_RU`;
    script.async = true;
    script.onload = onYmapsScriptLoad;
    document.head.appendChild(script);
  });
}

export default function DeliveryZoneMap({ zones, mode, onPolygonComplete, onDrawCancel, center }: Props) {
  const apiKey = process.env.NEXT_PUBLIC_YANDEX_MAPS_KEY ?? "";
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const drawRef = useRef<{ points: [number, number][]; polyline: any; markers: any[] }>(
    { points: [], polyline: null, markers: [] }
  );
  // Always-current ref so the single registered click handler sees latest mode
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [pointCount, setPointCount] = useState(0);

  const getCenter = useCallback((): [number, number] => {
    if (center) return center;
    if (zones.length > 0) {
      const c = zones[0].geojson.coordinates[0];
      return [
        c.reduce((s, p) => s + p[1], 0) / c.length,
        c.reduce((s, p) => s + p[0], 0) / c.length,
      ];
    }
    return DEFAULT_CENTER;
  }, [center, zones]);

  const clearDrawing = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const { polyline, markers } = drawRef.current;
    if (polyline) map.geoObjects.remove(polyline);
    markers.forEach((m) => map.geoObjects.remove(m));
    drawRef.current = { points: [], polyline: null, markers: [] };
    setPointCount(0);
  }, []);

  const completePolygon = useCallback(() => {
    const d = drawRef.current;
    if (d.points.length < 3) return;
    const closed = [...d.points, d.points[0]];
    const geojson: ZoneGeoJSON = { type: "Polygon", coordinates: [toGeojson(closed)] };
    clearDrawing();
    onPolygonComplete?.(geojson);
  }, [clearDrawing, onPolygonComplete]);

  const handleCancel = useCallback(() => {
    clearDrawing();
    onDrawCancel?.();
  }, [clearDrawing, onDrawCancel]);

  useEffect(() => {
    if (!apiKey || !containerRef.current) return;
    let destroyed = false;

    loadYandexMaps(apiKey).then(() => {
      if (destroyed || !containerRef.current) return;

      const ymaps = window.ymaps;
      const map = new ymaps.Map(
        containerRef.current,
        { center: getCenter(), zoom: DEFAULT_ZOOM, controls: ["zoomControl", "fullscreenControl"] },
        { suppressMapOpenBlock: true }
      );
      mapRef.current = map;

      zones.forEach((zone) => {
        const polygon = new ymaps.Polygon(
          [toYmaps(zone.geojson.coordinates[0])],
          { hintContent: zone.name },
          {
            fillColor: zone.is_active ? "#F5730030" : "#94a3b830",
            strokeColor: zone.is_active ? "#F57300" : "#94a3b8",
            strokeWidth: 2,
            // transparent to events so clicks on polygon still register on map
            interactivityModel: "default#transparent",
          }
        );
        map.geoObjects.add(polygon);
      });

      // Click handler always registered — modeRef guards drawing logic so
      // it works even when mode prop changes after map initialisation.
      map.events.add("click", (e: any) => {
        if (modeRef.current !== "draw") return;
        const coords: [number, number] = e.get("coords");
        const d = drawRef.current;
        d.points.push(coords);
        setPointCount(d.points.length);

        const dot = new ymaps.Placemark(
          coords, {},
          {
            preset: "islands#circleDotIcon",
            iconColor: "#F57300",
            interactivityModel: "default#transparent",
          }
        );
        map.geoObjects.add(dot);
        d.markers.push(dot);

        if (d.polyline) map.geoObjects.remove(d.polyline);
        if (d.points.length >= 2) {
          d.polyline = new ymaps.Polyline(
            [...d.points, d.points[0]], {},
            {
              strokeColor: "#F57300",
              strokeWidth: 2,
              strokeStyle: "dash",
              interactivityModel: "default#transparent",
            }
          );
          map.geoObjects.add(d.polyline);
        }
      });
    });

    return () => {
      destroyed = true;
      if (mapRef.current) { mapRef.current.destroy(); mapRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  useEffect(() => {
    if (mode !== "draw") return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, handleCancel]);

  if (!apiKey) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-full min-h-64 bg-neutral-50 rounded-xl border-2 border-dashed border-neutral-200 text-neutral-400">
        <MapPin size={32} className="text-neutral-300" />
        <p className="text-sm font-medium">Карта недоступна</p>
        <p className="text-xs text-center px-6">
          Добавьте <code className="bg-neutral-100 px-1 rounded">NEXT_PUBLIC_YANDEX_MAPS_KEY</code> в{" "}
          <code className="bg-neutral-100 px-1 rounded">.env.local</code>
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-64 rounded-xl overflow-hidden">
      {/* map container — explicit style height so Yandex Maps gets real dimensions */}
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {mode === "draw" && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-white/95 backdrop-blur-sm rounded-full shadow-md px-3 py-1.5 text-sm">
          {pointCount < 3 ? (
            <span className="text-neutral-500">
              Кликайте по карте — нужно минимум 3 точки{pointCount > 0 ? ` (${pointCount})` : ""}
            </span>
          ) : (
            <>
              <span className="text-neutral-500">{pointCount} точек</span>
              <button
                onClick={completePolygon}
                className="flex items-center gap-1 bg-brand-500 hover:bg-brand-600 text-white rounded-full px-3 py-1 text-xs font-medium transition-colors"
              >
                <Check size={12} /> Завершить
              </button>
            </>
          )}
          <button onClick={handleCancel} className="text-neutral-400 hover:text-neutral-600 ml-1">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
