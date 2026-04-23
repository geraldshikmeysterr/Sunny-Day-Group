"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { MapPin, X, Check, Undo2 } from "lucide-react";

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
  previewGeojson?: ZoneGeoJSON | null;
  mode: "view" | "draw";
  onPolygonComplete?: (geojson: ZoneGeoJSON) => void;
  onDrawCancel?: () => void;
  center?: [number, number];
};

const DEFAULT_CENTER: [number, number] = [55.751244, 37.618423];
const DEFAULT_ZOOM = 11;

// GeoJSON [lng, lat] → Yandex Maps [lat, lng]
function toYmaps(coords: [number, number][]): [number, number][] {
  return coords.map(([lng, lat]) => [lat, lng]);
}
// Yandex Maps [lat, lng] → GeoJSON [lng, lat]
function toGeojson(coords: [number, number][]): [number, number][] {
  return coords.map(([lat, lng]) => [lng, lat]);
}

declare global {
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

type DrawState = {
  points: [number, number][];
  preview: any;
  previewType: "polyline" | "polygon" | null;
  markers: any[];
};

// Updates the in-progress preview in place to avoid flicker during drag.
// Falls back to remove+recreate only when the geometry type changes.
function updateDrawPreview(ymaps: any, map: any, d: DrawState) {
  const pts = d.points;
  const needsPolygon = pts.length >= 3;
  let targetType: DrawState["previewType"] = null;
  if (pts.length >= 2) targetType = needsPolygon ? "polygon" : "polyline";

  if (d.preview && d.previewType === targetType) {
    if (targetType === "polygon") {
      d.preview.geometry.setCoordinates([[...pts, pts[0]]]);
    } else if (targetType === "polyline") {
      d.preview.geometry.setCoordinates(pts);
    }
    return;
  }

  if (d.preview) { map.geoObjects.remove(d.preview); d.preview = null; d.previewType = null; }
  if (pts.length < 2) return;

  const opts = { interactivityModel: "default#transparent" };
  if (needsPolygon) {
    d.preview = new ymaps.Polygon([[...pts, pts[0]]], {}, {
      ...opts, fillColor: "#F5730040", strokeColor: "#F57300", strokeWidth: 2,
    });
    d.previewType = "polygon";
  } else {
    d.preview = new ymaps.Polyline(pts, {}, {
      ...opts, strokeColor: "#F57300", strokeWidth: 2, strokeStyle: "dash",
    });
    d.previewType = "polyline";
  }
  map.geoObjects.add(d.preview);
}

// Removes a specific marker (by reference) from the draw state.
function removeMarkerAt(map: any, d: DrawState, dot: any): number {
  const idx = d.markers.indexOf(dot);
  if (idx === -1) return -1;
  map.geoObjects.remove(dot);
  d.markers.splice(idx, 1);
  d.points.splice(idx, 1);
  return d.points.length;
}

// Creates a draggable marker. Uses indexOf(dot) in the drag handler so spliced
// arrays don't break coordinate updates after arbitrary point deletions.
function addDraggableMarker(
  ymaps: any,
  map: any,
  coords: [number, number],
  d: DrawState,
  hoveredRef: { current: any },
) {
  const dot = new ymaps.Placemark(coords, {}, {
    preset: "islands#circleDotIcon", iconColor: "#F57300", draggable: true, cursor: "grab",
  });
  dot.events.add("drag", () => {
    const idx = d.markers.indexOf(dot);
    if (idx !== -1) {
      d.points[idx] = dot.geometry.getCoordinates() as [number, number];
      updateDrawPreview(ymaps, map, d);
    }
  });
  dot.events.add("mouseenter", () => { hoveredRef.current = dot; });
  dot.events.add("mouseleave", () => { if (hoveredRef.current === dot) hoveredRef.current = null; });
  map.geoObjects.add(dot);
  d.markers.push(dot);
}

export default function DeliveryZoneMap({
  zones, previewGeojson, mode, onPolygonComplete, onDrawCancel, center,
}: Readonly<Props>) {
  const apiKey = process.env.NEXT_PUBLIC_YANDEX_MAPS_KEY ?? "";
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const drawRef = useRef<DrawState>({ points: [], preview: null, previewType: null, markers: [] });
  const previewRef = useRef<any>(null);
  const hoveredMarkerRef = useRef<any>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [pointCount, setPointCount] = useState(0);

  const getCenter = useCallback((): [number, number] => {
    if (center) return center;
    if (zones.length > 0) {
      const c = zones[0].geojson.coordinates[0];
      return [c.reduce((s, p) => s + p[1], 0) / c.length, c.reduce((s, p) => s + p[0], 0) / c.length];
    }
    return DEFAULT_CENTER;
  }, [center, zones]);

  const clearDrawing = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const { preview, markers } = drawRef.current;
    if (preview) map.geoObjects.remove(preview);
    markers.forEach((m) => map.geoObjects.remove(m));
    drawRef.current = { points: [], preview: null, previewType: null, markers: [] };
    hoveredMarkerRef.current = null;
    setPointCount(0);
  }, []);

  const completePolygon = useCallback(() => {
    const d = drawRef.current;
    if (d.points.length < 3) return;
    const geojson: ZoneGeoJSON = { type: "Polygon", coordinates: [toGeojson([...d.points, d.points[0]])] };
    clearDrawing();
    onPolygonComplete?.(geojson);
  }, [clearDrawing, onPolygonComplete]);

  // Deletes a specific marker, or the last one if none given.
  const deletePoint = useCallback((target?: any) => {
    const map = mapRef.current;
    const d = drawRef.current;
    if (!map || d.points.length === 0) return;
    const dot = target ?? d.markers.at(-1);
    if (!dot) return;
    if (hoveredMarkerRef.current === dot) hoveredMarkerRef.current = null;
    const newCount = removeMarkerAt(map, d, dot);
    if (newCount !== -1) {
      setPointCount(newCount);
      updateDrawPreview(globalThis.ymaps, map, d);
    }
  }, []);

  const handleCancel = useCallback(() => {
    clearDrawing();
    onDrawCancel?.();
  }, [clearDrawing, onDrawCancel]);

  // Map initialisation (runs once per mount)
  useEffect(() => {
    if (!apiKey || !containerRef.current) return;
    let destroyed = false;

    loadYandexMaps(apiKey).then(() => {
      if (destroyed || !containerRef.current) return;

      const ymaps = globalThis.ymaps;
      const map = new ymaps.Map(
        containerRef.current,
        { center: getCenter(), zoom: DEFAULT_ZOOM, controls: ["zoomControl", "fullscreenControl"] },
        { suppressMapOpenBlock: true }
      );
      mapRef.current = map;

      zones.forEach((zone) => {
        map.geoObjects.add(new ymaps.Polygon(
          [toYmaps(zone.geojson.coordinates[0])],
          { hintContent: zone.name },
          {
            fillColor: zone.is_active ? "#F5730030" : "#94a3b830",
            strokeColor: zone.is_active ? "#F57300" : "#94a3b8",
            strokeWidth: 2,
            interactivityModel: "default#transparent",
          }
        ));
      });

      map.events.add("click", (e: any) => {
        if (modeRef.current !== "draw") return;
        const coords: [number, number] = e.get("coords");
        const d = drawRef.current;
        d.points.push(coords);
        setPointCount(d.points.length);
        addDraggableMarker(ymaps, map, coords, d, hoveredMarkerRef);
        updateDrawPreview(ymaps, map, d);
      });
    });

    return () => {
      destroyed = true;
      if (mapRef.current) { mapRef.current.destroy(); mapRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  // Show / update the saved-zone preview polygon when previewGeojson changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !globalThis.ymaps) return;

    if (previewRef.current) { map.geoObjects.remove(previewRef.current); previewRef.current = null; }

    if (previewGeojson) {
      previewRef.current = new globalThis.ymaps.Polygon(
        [toYmaps(previewGeojson.coordinates[0])],
        { hintContent: "Зона" },
        { fillColor: "#F5730040", strokeColor: "#F57300", strokeWidth: 2, interactivityModel: "default#transparent" }
      );
      map.geoObjects.add(previewRef.current);
    }
  }, [previewGeojson]);

  // Keyboard shortcuts (active only in draw mode).
  useEffect(() => {
    if (mode !== "draw") return;
    const onKey = (e: KeyboardEvent) => {
      // Don't intercept keys while the user is typing in a form field.
      const tag = (document.activeElement as HTMLElement | null)?.tagName?.toLowerCase() ?? "";
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if (e.key === "Escape") { handleCancel(); return; }
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        deletePoint(hoveredMarkerRef.current ?? undefined);
      }
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [mode, handleCancel, deletePoint]);

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
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {mode === "draw" && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-white/95 backdrop-blur-sm rounded-full shadow-md px-3 py-1.5 text-xs whitespace-nowrap">
          <span className="text-neutral-500">
            {pointCount < 3 ? `Кликайте по карте (${pointCount}/3)` : `${pointCount} точек`}
          </span>

          {pointCount > 0 && (
            <button onClick={() => deletePoint()} title="Удалить последнюю точку (Backspace)"
              className="flex items-center gap-1 text-neutral-500 hover:text-neutral-700 transition-colors">
              <Undo2 size={12} /> Отмена
            </button>
          )}

          {pointCount >= 3 && (
            <button onClick={completePolygon}
              className="flex items-center gap-1 bg-brand-500 hover:bg-brand-600 text-white rounded-full px-3 py-1 font-medium transition-colors">
              <Check size={12} /> Завершить
            </button>
          )}

          <button onClick={handleCancel} className="text-neutral-400 hover:text-neutral-600">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
