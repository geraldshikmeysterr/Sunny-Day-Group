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
  X, Plus, GripVertical, Edit2, Trash2, Eye, EyeOff,
  Loader2, CheckCircle2, PenLine,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import DeliveryZoneMap, { type ZoneGeoJSON, type DeliveryZone } from "./DeliveryZoneMap";

type FullZone = DeliveryZone & {
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

const EMPTY_FORM: ZoneForm = {
  id: null, name: "", delivery_fee: "0", free_from: "", min_order: "0", geojson: null,
};

type Props = {
  cityId: string;
  cityName: string;
  onClose: () => void;
};

// ---------------------------------------------------------------------------
// Sortable zone row
// ---------------------------------------------------------------------------

function ZoneRow({
  zone,
  onEdit,
  onToggle,
  onDelete,
  deleting,
}: {
  zone: FullZone;
  onEdit: (z: FullZone) => void;
  onToggle: (z: FullZone) => void;
  onDelete: (z: FullZone) => void;
  deleting: boolean;
}) {
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
      <button
        {...attributes}
        {...listeners}
        className="text-neutral-300 hover:text-neutral-400 cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical size={14} />
      </button>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-neutral-800 truncate">{zone.name}</p>
        <p className="text-xs text-neutral-400 num">
          {zone.delivery_fee === 0 ? "Бесплатно" : `${zone.delivery_fee} ₽`}
          {zone.min_order > 0 && ` · от ${zone.min_order} ₽`}
          {zone.free_from != null && ` · бесплатно от ${zone.free_from} ₽`}
        </p>
      </div>

      <div className="flex items-center gap-0.5 flex-shrink-0">
        <button onClick={() => onEdit(zone)} className="btn-ghost btn-sm text-brand-500 px-1.5">
          <Edit2 size={13} />
        </button>
        <button onClick={() => onToggle(zone)} className="btn-ghost btn-sm text-neutral-400 px-1.5">
          {zone.is_active ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
        <button
          onClick={() => onDelete(zone)}
          disabled={deleting}
          className="btn-ghost btn-sm text-danger-500 px-1.5"
        >
          {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

export default function CityZonesModal({ cityId, cityName, onClose }: Props) {
  const supabase = createClient();
  const [zones, setZones] = useState<FullZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapMode, setMapMode] = useState<"view" | "draw">("view");
  const [form, setForm] = useState<ZoneForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [mapKey, setMapKey] = useState(0);
  const [formError, setFormError] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // ------------------------------------------------------------------
  // Data fetching
  // ------------------------------------------------------------------

  const fetchZones = useCallback(async () => {
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

  // ------------------------------------------------------------------
  // Zone form actions
  // ------------------------------------------------------------------

  function openAddForm() {
    setForm({ ...EMPTY_FORM });
    setMapMode("draw");
    setFormError("");
  }

  function openEditForm(zone: FullZone) {
    setForm({
      id: zone.id,
      name: zone.name,
      delivery_fee: String(zone.delivery_fee),
      free_from: zone.free_from != null ? String(zone.free_from) : "",
      min_order: String(zone.min_order),
      geojson: zone.geojson,
    });
    setMapMode("view");
    setFormError("");
  }

  function cancelForm() {
    setForm(null);
    setMapMode("view");
    setFormError("");
  }

  function handlePolygonComplete(geojson: ZoneGeoJSON) {
    setForm((prev) => prev ? { ...prev, geojson } : prev);
    setMapMode("view");
  }

  function validateForm(f: ZoneForm): string {
    if (!f.name.trim()) return "Введите название зоны";
    if (!f.geojson) return "Нарисуйте зону на карте";
    const fee = Number(f.delivery_fee);
    const min = Number(f.min_order);
    const free = f.free_from.trim() ? Number(f.free_from) : null;
    if (isNaN(fee) || fee < 0) return "Некорректная стоимость доставки";
    if (isNaN(min) || min < 0) return "Некорректный минимальный заказ";
    if (free !== null && (isNaN(free) || free < 0)) return "Некорректная сумма для бесплатной доставки";
    return "";
  }

  async function saveZone() {
    if (!form) return;
    const err = validateForm(form);
    if (err) { setFormError(err); return; }

    setSaving(true);
    setFormError("");

    const payload = {
      city_id: cityId,
      name: form.name.trim(),
      delivery_fee: Number(form.delivery_fee),
      min_order: Number(form.min_order),
      free_from: form.free_from.trim() ? Number(form.free_from) : null,
      geojson: form.geojson,
      sort_order: form.id
        ? zones.find((z) => z.id === form.id)?.sort_order ?? 0
        : zones.length,
    };

    const { error } = form.id
      ? await supabase.from("delivery_zones").update(payload).eq("id", form.id)
      : await supabase.from("delivery_zones").insert(payload);

    if (error) {
      setFormError(error.message);
    } else {
      toast.success(form.id ? "Зона обновлена" : "Зона добавлена");
      setForm(null);
      setMapMode("view");
      await fetchZones();
      setMapKey((k) => k + 1);
    }
    setSaving(false);
  }

  async function toggleZone(zone: FullZone) {
    await supabase
      .from("delivery_zones")
      .update({ is_active: !zone.is_active })
      .eq("id", zone.id);
    setZones((prev) =>
      prev.map((z) => z.id === zone.id ? { ...z, is_active: !zone.is_active } : z)
    );
    setMapKey((k) => k + 1);
  }

  async function deleteZone(zone: FullZone) {
    if (!confirm(`Удалить зону «${zone.name}»?`)) return;
    setDeletingId(zone.id);
    const { error } = await supabase.from("delivery_zones").delete().eq("id", zone.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Зона удалена");
      setZones((prev) => prev.filter((z) => z.id !== zone.id));
      if (form?.id === zone.id) cancelForm();
      setMapKey((k) => k + 1);
    }
    setDeletingId(null);
  }

  // ------------------------------------------------------------------
  // Drag-and-drop sort
  // ------------------------------------------------------------------

  async function handleDragEnd(event: any) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = zones.findIndex((z) => z.id === active.id);
    const newIndex = zones.findIndex((z) => z.id === over.id);
    const reordered = arrayMove(zones, oldIndex, newIndex).map((z, i) => ({
      ...z,
      sort_order: i,
    }));
    setZones(reordered);

    await Promise.all(
      reordered.map((z) =>
        supabase.from("delivery_zones").update({ sort_order: z.sort_order }).eq("id", z.id)
      )
    );
  }

  // ------------------------------------------------------------------
  // Derived map zones (for the map component)
  // ------------------------------------------------------------------

  const mapZones: DeliveryZone[] = zones.map((z) => ({
    id: z.id,
    name: z.name,
    geojson: z.geojson,
    is_active: z.is_active,
    sort_order: z.sort_order,
  }));

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-card-lg w-full max-w-5xl h-[85vh] flex flex-col animate-scale-in overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 flex-shrink-0">
          <div>
            <h2 className="text-xl font-semibold">Зоны доставки</h2>
            <p className="text-sm text-neutral-500">{cityName}</p>
          </div>
          <button onClick={onClose} className="btn-ghost btn-sm"><X size={16} /></button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">

          {/* Left panel — zone list or form */}
          <div className="w-72 flex-shrink-0 border-r border-neutral-200 flex flex-col">

            {form === null ? (
              /* Zone list */
              <>
                <div className="p-3 border-b border-neutral-100">
                  <button onClick={openAddForm} className="btn-primary btn-sm w-full">
                    <Plus size={14} /> Добавить зону
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {loading ? (
                    Array.from({ length: 3 }, (_, i) => (
                      <div key={i} className="skeleton h-14 rounded-lg" />
                    ))
                  ) : zones.length === 0 ? (
                    <p className="text-sm text-neutral-400 text-center py-8">
                      Зон пока нет.<br />Нажмите «Добавить зону».
                    </p>
                  ) : (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={zones.map((z) => z.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {zones.map((zone) => (
                          <ZoneRow
                            key={zone.id}
                            zone={zone}
                            onEdit={openEditForm}
                            onToggle={toggleZone}
                            onDelete={deleteZone}
                            deleting={deletingId === zone.id}
                          />
                        ))}
                      </SortableContext>
                    </DndContext>
                  )}
                </div>
              </>
            ) : (
              /* Zone form */
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <p className="text-sm font-semibold text-neutral-700">
                  {form.id ? "Редактировать зону" : "Новая зона"}
                </p>

                <div>
                  <label className="label">Название *</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((p) => p && { ...p, name: e.target.value })}
                    className="input"
                    placeholder="Центр города"
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">Доставка, ₽</label>
                    <input
                      type="number"
                      min="0"
                      value={form.delivery_fee}
                      onChange={(e) => setForm((p) => p && { ...p, delivery_fee: e.target.value })}
                      className="input"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="label">Мин. заказ, ₽</label>
                    <input
                      type="number"
                      min="0"
                      value={form.min_order}
                      onChange={(e) => setForm((p) => p && { ...p, min_order: e.target.value })}
                      className="input"
                      placeholder="0"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="label">Бесплатно от, ₽</label>
                    <input
                      type="number"
                      min="0"
                      value={form.free_from}
                      onChange={(e) => setForm((p) => p && { ...p, free_from: e.target.value })}
                      className="input"
                      placeholder="Не указано"
                    />
                  </div>
                </div>

                {/* Polygon status */}
                <div className="rounded-lg border border-neutral-200 p-3">
                  {form.geojson ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-success-700">
                        <CheckCircle2 size={14} className="text-success-500" />
                        Зона нарисована
                      </div>
                      <button
                        onClick={() => { setMapMode("draw"); }}
                        className="btn-ghost btn-sm text-xs text-neutral-500 px-2"
                      >
                        <PenLine size={12} /> Перерисовать
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-neutral-500 text-center">
                      {mapMode === "draw"
                        ? "Кликайте по карте для нанесения точек.\nДвойной клик — завершить."
                        : "Нарисуйте зону на карте →"}
                    </p>
                  )}
                </div>

                {formError && (
                  <p className="text-xs text-danger-600 bg-danger-50 px-3 py-2 rounded-lg">
                    {formError}
                  </p>
                )}

                <div className="flex gap-2 pt-1">
                  <button onClick={cancelForm} className="btn-secondary btn-sm flex-1">
                    Отмена
                  </button>
                  <button onClick={saveZone} disabled={saving} className="btn-primary btn-sm flex-1">
                    {saving && <Loader2 size={13} className="animate-spin" />}
                    Сохранить
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right panel — map */}
          <div className="flex-1 p-3">
            <DeliveryZoneMap
              key={mapKey}
              zones={mapZones}
              mode={mapMode}
              onPolygonComplete={handlePolygonComplete}
              onDrawCancel={() => {
                if (!form?.geojson) {
                  setMapMode("draw");
                } else {
                  setMapMode("view");
                }
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
