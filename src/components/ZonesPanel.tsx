"use client";
import { useState, useEffect, useCallback } from "react";
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus, GripVertical, Edit2, Trash2, Eye, EyeOff,
  Loader2, CheckCircle2, PenLine, FileJson,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import DeliveryZoneMap, { type ZoneGeoJSON, type DeliveryZone } from "./DeliveryZoneMap";

export type FullZone = DeliveryZone & {
  delivery_fee: number;
  free_from: number | null;
  min_order: number;
};

type ZoneForm = {
  id: string | null;
  name: string;
  delivery_fee: string;
  free_from: string;
  min_order: string;
  geojson: ZoneGeoJSON | null;
};

type ZoneBase = {
  name: string;
  delivery_fee: number;
  min_order: number;
  free_from: number | null;
  geojson: ZoneGeoJSON;
  is_active: boolean;
  sort_order: number;
};

const EMPTY_FORM: ZoneForm = {
  id: null, name: "", delivery_fee: "0", free_from: "", min_order: "0", geojson: null,
};

type Props = {
  cityId?: string;
  pendingZones?: FullZone[];
  onPendingChange?: (zones: FullZone[]) => void;
};

// ---------------------------------------------------------------------------
// Sortable row
// ---------------------------------------------------------------------------

function ZoneRow({ zone, onEdit, onToggle, onDelete, deleting }: Readonly<{
  zone: FullZone;
  onEdit: (z: FullZone) => void;
  onToggle: (z: FullZone) => void;
  onDelete: (z: FullZone) => void;
  deleting: boolean;
}>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: zone.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 px-3 py-2.5 rounded-lg border border-neutral-200 bg-white",
        isDragging && "shadow-lg opacity-80 z-10",
        !zone.is_active && "opacity-60"
      )}
    >
      <button {...attributes} {...listeners} className="text-neutral-300 hover:text-neutral-400 cursor-grab active:cursor-grabbing touch-none">
        <GripVertical size={14} />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-neutral-800 truncate">{zone.name}</p>
        <p className="text-xs text-neutral-400 num">
          {zone.delivery_fee === 0 ? "Бесплатная доставка" : `${zone.delivery_fee} ₽`}
          {zone.min_order > 0 && ` · от ${zone.min_order} ₽`}
          {zone.free_from != null && ` · бесплатно от ${zone.free_from} ₽`}
        </p>
      </div>
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <button onClick={() => onEdit(zone)} className="btn-ghost btn-sm text-brand-500 px-1.5"><Edit2 size={13} /></button>
        <button onClick={() => onToggle(zone)} className="btn-ghost btn-sm text-neutral-400 px-1.5">
          {zone.is_active ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
        <button onClick={() => onDelete(zone)} disabled={deleting} className="btn-ghost btn-sm text-danger-500 px-1.5">
          {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ZonesPanel
// ---------------------------------------------------------------------------

export default function ZonesPanel({ cityId, pendingZones, onPendingChange }: Readonly<Props>) {
  const supabase = createClient();
  const isPending = !cityId;

  const [zones, setZones] = useState<FullZone[]>(pendingZones ?? []);
  const [loading, setLoading] = useState(!isPending);
  const [mapMode, setMapMode] = useState<"view" | "draw">("view");
  const [form, setForm] = useState<ZoneForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [mapKey, setMapKey] = useState(0);
  const [formError, setFormError] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // ------------------------------------------------------------------
  // Load zones from DB (edit mode only)
  // ------------------------------------------------------------------

  const fetchZones = useCallback(async () => {
    if (!cityId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("delivery_zones")
      .select("id, name, delivery_fee, free_from, min_order, geojson, is_active, sort_order")
      .eq("city_id", cityId)
      .order("sort_order")
      .order("created_at");
    if (error) toast.error("Не удалось загрузить зоны");
    setZones((data as FullZone[]) ?? []);
    setLoading(false);
  }, [cityId]);

  useEffect(() => { fetchZones(); }, [fetchZones]);

  const syncPending = useCallback((updated: FullZone[]) => {
    if (isPending) onPendingChange?.(updated);
  }, [isPending, onPendingChange]);

  // ------------------------------------------------------------------
  // Form helpers
  // ------------------------------------------------------------------

  function resetFormState() {
    setFormError("");
    setShowImport(false);
    setImportText("");
  }

  function openAdd() {
    setForm({ ...EMPTY_FORM });
    setMapMode("draw");
    resetFormState();
  }

  function openEdit(zone: FullZone) {
    setForm({
      id: zone.id,
      name: zone.name,
      delivery_fee: String(zone.delivery_fee),
      free_from: zone.free_from === null ? "" : String(zone.free_from),
      min_order: String(zone.min_order),
      geojson: zone.geojson,
    });
    setMapMode("view");
    resetFormState();
  }

  function cancelForm() {
    setForm(null);
    setMapMode("view");
    resetFormState();
  }

  function handlePolygonComplete(geojson: ZoneGeoJSON) {
    setForm((prev) => prev ? { ...prev, geojson } : prev);
    setMapMode("view");
  }

  function importGeoJSON() {
    try {
      const parsed = JSON.parse(importText.trim());
      let geojson: ZoneGeoJSON | null = null;

      if (parsed.type === "Polygon") {
        geojson = parsed as ZoneGeoJSON;
      } else if (parsed.type === "Feature" && parsed.geometry?.type === "Polygon") {
        geojson = parsed.geometry as ZoneGeoJSON;
      } else if (parsed.type === "FeatureCollection" && Array.isArray(parsed.features)) {
        const poly = parsed.features.find((f: any) => f.geometry?.type === "Polygon");
        if (poly) geojson = poly.geometry as ZoneGeoJSON;
      }

      if (geojson === null) {
        toast.error("Не найден полигон в GeoJSON");
        return;
      }

      setForm((prev) => prev ? { ...prev, geojson } : prev);
      setShowImport(false);
      setImportText("");
      setMapKey((k) => k + 1);
      toast.success("Зона импортирована");
    } catch {
      toast.error("Некорректный JSON");
    }
  }

  function validate(f: ZoneForm): string {
    if (!f.name.trim()) return "Введите название зоны";
    if (!f.geojson) return "Нарисуйте или импортируйте зону";
    if (Number.isNaN(Number(f.delivery_fee)) || Number(f.delivery_fee) < 0) return "Некорректная стоимость доставки";
    if (Number.isNaN(Number(f.min_order)) || Number(f.min_order) < 0) return "Некорректный минимальный заказ";
    const free = f.free_from.trim() ? Number(f.free_from) : null;
    if (free !== null && (Number.isNaN(free) || free < 0)) return "Некорректная сумма для бесплатной доставки";
    return "";
  }

  // ------------------------------------------------------------------
  // CRUD helpers extracted to keep saveZone complexity low
  // ------------------------------------------------------------------

  function applyPendingZone(base: ZoneBase, formId: string | null) {
    const updated = formId
      ? zones.map((z) => z.id === formId ? { ...z, ...base } : z)
      : [...zones, { ...base, id: crypto.randomUUID() }];
    setZones(updated);
    syncPending(updated);
    setForm(null);
    setMapMode("view");
    setMapKey((k) => k + 1);
  }

  async function applyDbZone(base: ZoneBase, formId: string | null) {
    const payload = { ...base, city_id: cityId };
    const { error } = formId
      ? await supabase.from("delivery_zones").update(payload).eq("id", formId)
      : await supabase.from("delivery_zones").insert(payload);
    if (error) {
      setFormError(error.message);
    } else {
      toast.success(formId ? "Зона обновлена" : "Зона добавлена");
      setForm(null);
      setMapMode("view");
      await fetchZones();
      setMapKey((k) => k + 1);
    }
  }

  async function saveZone() {
    if (!form) return;
    const err = validate(form);
    if (err) { setFormError(err); return; }
    setSaving(true);
    setFormError("");

    const base: ZoneBase = {
      name: form.name.trim(),
      delivery_fee: Number(form.delivery_fee),
      min_order: Number(form.min_order),
      free_from: form.free_from.trim() ? Number(form.free_from) : null,
      geojson: form.geojson!,
      is_active: true,
      sort_order: form.id ? (zones.find((z) => z.id === form.id)?.sort_order ?? 0) : zones.length,
    };

    if (isPending) {
      applyPendingZone(base, form.id);
    } else {
      await applyDbZone(base, form.id);
    }
    setSaving(false);
  }

  async function toggleZone(zone: FullZone) {
    const updated = zones.map((z) => z.id === zone.id ? { ...z, is_active: !zone.is_active } : z);
    setZones(updated);
    setMapKey((k) => k + 1);
    if (isPending) {
      syncPending(updated);
    } else {
      await supabase.from("delivery_zones").update({ is_active: !zone.is_active }).eq("id", zone.id);
    }
  }

  async function deleteZone(zone: FullZone) {
    if (!confirm(`Удалить зону «${zone.name}»?`)) return;
    setDeletingId(zone.id);
    if (!isPending) {
      const { error } = await supabase.from("delivery_zones").delete().eq("id", zone.id);
      if (error) { toast.error(error.message); setDeletingId(null); return; }
      toast.success("Зона удалена");
    }
    const updated = zones.filter((z) => z.id !== zone.id);
    setZones(updated);
    syncPending(updated);
    if (form?.id === zone.id) cancelForm();
    setMapKey((k) => k + 1);
    setDeletingId(null);
  }

  async function handleDragEnd(event: any) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = zones.findIndex((z) => z.id === active.id);
    const newIndex = zones.findIndex((z) => z.id === over.id);
    const reordered = arrayMove(zones, oldIndex, newIndex).map((z, i) => ({ ...z, sort_order: i }));
    setZones(reordered);
    syncPending(reordered);
    if (!isPending) {
      await Promise.all(
        reordered.map((z) => supabase.from("delivery_zones").update({ sort_order: z.sort_order }).eq("id", z.id))
      );
    }
  }

  const mapZones: DeliveryZone[] = zones.map((z) => ({
    id: z.id, name: z.name, geojson: z.geojson, is_active: z.is_active, sort_order: z.sort_order,
  }));

  // ------------------------------------------------------------------
  // Render helpers
  // ------------------------------------------------------------------

  function renderZoneList() {
    if (loading) {
      return Array.from({ length: 2 }, (_, i) => <div key={i} className="skeleton h-14 rounded-lg" />);
    }
    if (zones.length === 0) {
      return <p className="text-xs text-neutral-400 text-center py-6">Зон пока нет</p>;
    }
    return (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={zones.map((z) => z.id)} strategy={verticalListSortingStrategy}>
          {zones.map((zone) => (
            <ZoneRow
              key={zone.id}
              zone={zone}
              onEdit={openEdit}
              onToggle={toggleZone}
              onDelete={deleteZone}
              deleting={deletingId === zone.id}
            />
          ))}
        </SortableContext>
      </DndContext>
    );
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div className="flex h-full min-h-0">
      {/* Left: zone list or form */}
      <div className="w-56 flex-shrink-0 border-r border-neutral-200 flex flex-col">
        {form === null ? (
          <>
            <div className="p-3 border-b border-neutral-100">
              <button onClick={openAdd} className="btn-primary btn-sm w-full">
                <Plus size={14} /> Добавить зону
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {renderZoneList()}
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            <p className="text-sm font-semibold text-neutral-700">
              {form.id ? "Редактировать зону" : "Новая зона"}
            </p>
            <div>
              <label htmlFor="zone-name" className="label">Название *</label>
              <input
                id="zone-name"
                value={form.name}
                onChange={(e) => setForm((p) => p && { ...p, name: e.target.value })}
                className="input"
                placeholder="Центр города"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="zone-fee" className="label">Доставка, ₽</label>
                <input id="zone-fee" type="number" min="0" value={form.delivery_fee}
                  onChange={(e) => setForm((p) => p && { ...p, delivery_fee: e.target.value })}
                  className="input" placeholder="0" />
              </div>
              <div>
                <label htmlFor="zone-min-order" className="label">Мин. заказ, ₽</label>
                <input id="zone-min-order" type="number" min="0" value={form.min_order}
                  onChange={(e) => setForm((p) => p && { ...p, min_order: e.target.value })}
                  className="input" placeholder="0" />
              </div>
              <div className="col-span-2">
                <label htmlFor="zone-free-from" className="label">Бесплатно от, ₽</label>
                <input id="zone-free-from" type="number" min="0" value={form.free_from}
                  onChange={(e) => setForm((p) => p && { ...p, free_from: e.target.value })}
                  className="input" placeholder="Не указано" />
              </div>
            </div>

            {/* Polygon status */}
            <div className="rounded-lg border border-neutral-200 p-2.5 space-y-2">
              {form.geojson ? (
                <div className="flex items-center justify-between gap-1 flex-wrap">
                  <span className="flex items-center gap-1.5 text-xs text-success-700">
                    <CheckCircle2 size={13} className="text-success-500 flex-shrink-0" />
                    Зона нарисована
                  </span>
                  <button onClick={() => setMapMode("draw")} className="btn-ghost btn-sm text-xs px-2 flex-shrink-0">
                    <PenLine size={12} /> Перерисовать
                  </button>
                </div>
              ) : (
                <p className="text-xs text-neutral-500 text-center">
                  {mapMode === "draw" ? "Кликайте по карте, нажмите «Завершить»" : "Нарисуйте зону на карте →"}
                </p>
              )}

              {/* GeoJSON import */}
              <button
                onClick={() => setShowImport((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-600 w-full"
              >
                <FileJson size={12} />
                {showImport ? "Скрыть импорт" : "Импорт GeoJSON"}
              </button>
              {showImport && (
                <div className="space-y-1.5">
                  <textarea
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    className="input text-xs font-mono h-20 resize-none"
                    placeholder='{"type":"Polygon","coordinates":[...]}'
                  />
                  <button
                    onClick={importGeoJSON}
                    disabled={!importText.trim()}
                    className="btn-secondary btn-sm w-full text-xs"
                  >
                    Применить
                  </button>
                </div>
              )}
            </div>

            {formError && (
              <p className="text-xs text-danger-600 bg-danger-50 px-3 py-2 rounded-lg">{formError}</p>
            )}
            <div className="flex gap-2">
              <button onClick={cancelForm} className="btn-secondary btn-sm flex-1">Отмена</button>
              <button onClick={saveZone} disabled={saving} className="btn-primary btn-sm flex-1">
                {saving && <Loader2 size={13} className="animate-spin" />} Сохранить
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right: map */}
      <div className="flex-1 p-3">
        <DeliveryZoneMap
          key={mapKey}
          zones={mapZones}
          previewGeojson={form?.geojson ?? null}
          mode={mapMode}
          onPolygonComplete={handlePolygonComplete}
          onDrawCancel={() => setMapMode(form?.geojson ? "view" : "draw")}
        />
      </div>
    </div>
  );
}
