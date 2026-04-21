"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, Edit2, Trash2, X, Loader2, ImageIcon, Eye, EyeOff, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { validateImageFile } from "@/lib/validateImageFile";
import { toast } from "sonner";
import { CustomSelect } from "@/components/CustomSelect";

type Card = {
  id: string;
  title: string;
  image_url: string | null;
  action_url: string | null;
  sort_order: number;
  is_active: boolean;
};

type ActionType = "none" | "url" | "app";
type MenuType  = "hot" | "frozen";
type AppTarget = "menu" | "category" | "item" | "promo";

const APP_TARGETS: { value: AppTarget; label: string }[] = [
  { value: "menu",     label: "Меню" },
  { value: "category", label: "Категория" },
  { value: "item",     label: "Блюдо" },
  { value: "promo",    label: "Промокод" },
];

function SegmentedControl<T extends string>({
  value, onChange, options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  const count   = options.length;
  const idx     = options.findIndex(o => o.value === value);
  const pct     = idx * 100;

  return (
    <div className="relative flex bg-neutral-200 rounded-xl overflow-hidden" style={{ height: "2.25rem" }}>
      <div
        className="absolute inset-y-0 rounded-xl bg-brand-500 pointer-events-none"
        style={{
          left: 0,
          width: `${100 / count}%`,
          transform: `translateX(${pct}%)`,
          transition: "transform 180ms ease-out",
        }}
      />
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "relative flex-1 h-full text-sm font-medium z-10 transition-colors duration-150",
            value === opt.value ? "text-white" : "text-neutral-600 hover:text-neutral-900"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function parseActionUrl(url: string | null): {
  type: ActionType; menuType: MenuType; appTarget: AppTarget;
  categoryId: string; itemId: string; promoCode: string; externalUrl: string;
} {
  const base = { menuType: "hot" as MenuType, appTarget: "menu" as AppTarget, categoryId: "", itemId: "", promoCode: "", externalUrl: "" };
  if (!url) return { ...base, type: "none" };
  if (url.startsWith("http://") || url.startsWith("https://")) return { ...base, type: "url", externalUrl: url };

  const frozen = url.includes("type=frozen");
  const mt: MenuType = frozen ? "frozen" : "hot";
  const base2 = { ...base, type: "app" as ActionType, menuType: mt };

  if (/^app:\/\/menu(\?type=(hot|frozen))?$/.test(url)) return { ...base2, appTarget: "menu" };
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const PROMO_RE = /^[A-Z0-9_-]{1,50}$/;
  const catM = /app:\/\/menu\?.*category=([^&]+)/.exec(url);
  if (catM && UUID_RE.test(catM[1])) return { ...base2, appTarget: "category", categoryId: catM[1] };
  const itemM = /app:\/\/menu\?.*item=([^&]+)/.exec(url);
  if (itemM && UUID_RE.test(itemM[1])) return { ...base2, appTarget: "item", itemId: itemM[1] };
  const promoM = /app:\/\/promo\?code=([^&]+)/.exec(url);
  if (promoM && PROMO_RE.test(promoM[1].toUpperCase())) return { ...base2, appTarget: "promo", promoCode: promoM[1].toUpperCase() };

  return { ...base, type: "url", externalUrl: url };
}

function buildActionUrl(
  type: ActionType, menuType: MenuType, appTarget: AppTarget,
  categoryId: string, itemId: string, promoCode: string, externalUrl: string,
): string | null {
  if (type === "none") return null;
  if (type === "url") {
    try {
      const u = new URL(externalUrl);
      if (u.protocol !== "https:") return null;
    } catch { return null; }
    return externalUrl;
  }
  const mt = menuType === "frozen" ? "?type=frozen" : "";
  if (appTarget === "menu")     return `app://menu${mt}`;
  const UUID_RE2 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const PROMO_RE2 = /^[A-Z0-9_-]{1,50}$/;
  if (appTarget === "category") return (categoryId && UUID_RE2.test(categoryId)) ? `app://menu?${menuType === "frozen" ? "type=frozen&" : ""}category=${categoryId}` : null;
  if (appTarget === "item")     return (itemId && UUID_RE2.test(itemId))         ? `app://menu?${menuType === "frozen" ? "type=frozen&" : ""}item=${itemId}`         : null;
  if (appTarget === "promo")    return (promoCode && PROMO_RE2.test(promoCode))  ? `app://promo?code=${promoCode}` : null;
  return null;
}

function actionLabel(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  if (url.includes("category=")) return url.includes("frozen") ? "Заморозка · Категория" : "Горячие блюда · Категория";
  if (url.includes("item="))     return url.includes("frozen") ? "Заморозка · Блюдо"     : "Горячие блюда · Блюдо";
  if (url.includes("promo?"))    return "Промокод: " + (/code=([^&]+)/.exec(url)?.[1] ?? "");
  if (url.startsWith("app://menu")) return url.includes("frozen") ? "Заморозка · Меню" : "Горячие блюда · Меню";
  return url;
}

function SortableCard({ card, onEdit, onDelete, onToggle }: {
  card: Card; onEdit: (c: Card) => void; onDelete: (c: Card) => void; onToggle: (c: Card) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const label = actionLabel(card.action_url);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-4 px-4 py-3 bg-white border-b border-neutral-100 transition-all group",
        isDragging && "opacity-40 shadow-lg z-50",
        !card.is_active && "opacity-50"
      )}
    >
      <button {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing text-neutral-300 hover:text-neutral-400 shrink-0 touch-none">
        <GripVertical size={16} />
      </button>

      {card.image_url
        ? <img src={card.image_url} alt="" className="w-20 h-20 rounded-xl object-cover shrink-0" />
        : <div className="w-20 h-20 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0"><ImageIcon size={20} className="text-neutral-400" /></div>
      }

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-neutral-900">{card.title}</p>
        {label
          ? <p className="text-xs text-neutral-400 mt-0.5 truncate max-w-xs">{label}</p>
          : <p className="text-xs text-neutral-300 mt-0.5">Кнопка «Подробнее» отключена</p>
        }
      </div>

      <span className={cn("badge text-xs shrink-0", card.is_active ? "bg-success-50 text-success-700" : "bg-neutral-100 text-neutral-500")}>
        {card.is_active ? "Активна" : "Скрыта"}
      </span>

      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button onClick={() => onToggle(card)} className={cn("btn-ghost btn-sm", card.is_active ? "text-success-500" : "text-neutral-300")}>
          {card.is_active ? <Eye size={15} /> : <EyeOff size={15} />}
        </button>
        <button onClick={() => openEdit(card)} className="btn-ghost btn-sm text-brand-500"><Edit2 size={15} /></button>
        <button onClick={() => onDelete(card)} className="btn-ghost btn-sm text-danger-500"><Trash2 size={15} /></button>
      </div>
    </div>
  );

  function openEdit(c: Card) { onEdit(c); }
}

export default function CarouselPage() {
  const supabase = createClient();
  const [cards, setCards]       = useState<Card[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string; menu_type_slug: string }[]>([]);
  const [menuItems, setMenuItems]   = useState<{ id: string; name: string; menu_type_slug: string }[]>([]);
  const [promos, setPromos]         = useState<{ code: string }[]>([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState<{ open: boolean; editing: Card | null }>({ open: false, editing: null });
  const [saving, setSaving]     = useState(false);

  const [title, setTitle]         = useState("");
  const [isActive, setIsActive]   = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [actionType, setActionType] = useState<ActionType>("none");
  const [menuType, setMenuType]     = useState<MenuType>("hot");
  const [appTarget, setAppTarget]   = useState<AppTarget>("menu");
  const [categoryId, setCategoryId] = useState("");
  const [itemId, setItemId]         = useState("");
  const [promoCode, setPromoCode]   = useState("");
  const [externalUrl, setExternalUrl] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const fetchCards = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("carousel_cards").select("*").order("sort_order").order("created_at");
    setCards(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCards();
    supabase.from("categories").select("id,name,menu_types(slug)").eq("is_active", true).order("name")
      .then(({ data }) => setCategories((data ?? []).map((c: any) => ({ id: c.id, name: c.name, menu_type_slug: c.menu_types?.slug ?? "" }))));
    supabase.from("menu_items").select("id,name,categories(menu_types(slug))").eq("is_global_active", true).order("name")
      .then(({ data }) => setMenuItems((data ?? []).map((i: any) => ({ id: i.id, name: i.name, menu_type_slug: i.categories?.menu_types?.slug ?? "" }))));
    supabase.from("promocodes").select("code").eq("is_active", true).order("code").then(({ data }) => setPromos(data ?? []));
  }, [fetchCards]);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = cards.findIndex(c => c.id === active.id);
    const newIdx = cards.findIndex(c => c.id === over.id);
    const reordered = arrayMove(cards, oldIdx, newIdx);
    setCards(reordered);
    await Promise.all(reordered.map((c, i) => supabase.from("carousel_cards").update({ sort_order: i }).eq("id", c.id)));
  }

  function openAdd() {
    setTitle(""); setIsActive(false); setPhotoFile(null); setPhotoPreview(null);
    setActionType("none"); setMenuType("hot"); setAppTarget("menu");
    setCategoryId(""); setItemId(""); setPromoCode(""); setExternalUrl("");
    setModal({ open: true, editing: null });
  }

  function openEdit(card: Card) {
    const p = parseActionUrl(card.action_url);
    setTitle(card.title); setIsActive(card.is_active);
    setPhotoFile(null); setPhotoPreview(card.image_url);
    setActionType(p.type); setMenuType(p.menuType); setAppTarget(p.appTarget);
    setCategoryId(p.categoryId); setItemId(p.itemId); setPromoCode(p.promoCode); setExternalUrl(p.externalUrl);
    setModal({ open: true, editing: card });
  }

  function closeModal() { setModal({ open: false, editing: null }); setPhotoFile(null); setPhotoPreview(null); }

  async function save() {
    if (!title) return;
    setSaving(true);
    let imageUrl = modal.editing?.image_url ?? null;
    if (photoFile) {
      try {
        const extMap: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
        const ext = extMap[photoFile.type] ?? "jpg";
        const path = `carousel/${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from("carousel-images").upload(path, photoFile, { upsert: true });
        if (error) throw error;
        imageUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/carousel-images/${path}`;
      } catch (e: any) {
        toast.error("Фото не загружено: " + (e.message ?? ""));
        setSaving(false); return;
      }
    }
    if (photoPreview === null) imageUrl = null;

    const action_url = buildActionUrl(actionType, menuType, appTarget, categoryId, itemId, promoCode, externalUrl);
    const payload = { title, image_url: imageUrl, action_url, is_active: isActive };

    if (modal.editing) {
      await supabase.from("carousel_cards").update(payload).eq("id", modal.editing.id);
      toast.success("Карточка обновлена");
    } else {
      await supabase.from("carousel_cards").insert({ ...payload, sort_order: cards.length });
      toast.success("Карточка добавлена");
    }
    closeModal(); await fetchCards(); setSaving(false);
  }

  async function deleteCard(card: Card) {
    if (!confirm(`Удалить карточку «${card.title}»?`)) return;
    await supabase.from("carousel_cards").delete().eq("id", card.id);
    setCards(p => p.filter(c => c.id !== card.id));
    toast.success("Удалено");
  }

  async function toggleActive(card: Card) {
    await supabase.from("carousel_cards").update({ is_active: !card.is_active }).eq("id", card.id);
    setCards(p => p.map(c => c.id === card.id ? { ...c, is_active: !c.is_active } : c));
  }

  const targetSlug      = menuType === "frozen" ? "frozen" : "ready_meals";
  const categoryOptions = categories.filter(c => c.menu_type_slug === targetSlug).map(c => ({ value: c.id, label: c.name }));
  const itemOptions     = menuItems.filter(i => i.menu_type_slug === targetSlug).map(i => ({ value: i.id, label: i.name }));

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Карусель</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Баннеры главного экрана · перетащите для изменения порядка</p>
        </div>
        <button onClick={openAdd} className="btn-primary btn-md"><Plus size={16} /> Добавить</button>
      </div>

      <div className="card overflow-hidden">
        {loading && (
          <div className="divide-y divide-neutral-100">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <div className="skeleton w-5 h-5 rounded" />
                <div className="skeleton w-20 h-20 rounded-xl shrink-0" />
                <div className="skeleton h-4 flex-1 rounded" />
              </div>
            ))}
          </div>
        )}
        {!loading && cards.length === 0 && <div className="py-16 text-center text-neutral-400">Нет карточек</div>}
        {!loading && cards.length > 0 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
              {cards.map(card => (
                <SortableCard key={card.id} card={card} onEdit={openEdit} onDelete={deleteCard} onToggle={toggleActive} />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-card-lg w-full max-w-md max-h-[90vh] flex flex-col animate-scale-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
              <h2 className="text-xl font-semibold">{modal.editing ? "Редактировать карточку" : "Новая карточка"}</h2>
              <button onClick={closeModal} className="btn-ghost btn-sm"><X size={16} /></button>
            </div>

            <div className="overflow-y-auto flex-1 p-6 space-y-4">
              <div>
                <label className="label">Фото</label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "relative w-full h-44 rounded-xl cursor-pointer transition-colors flex items-center justify-center overflow-hidden",
                    photoPreview
                      ? "bg-neutral-100 hover:brightness-95"
                      : "border-2 border-dashed border-neutral-200 bg-neutral-50 hover:bg-neutral-100"
                  )}
                >
                  {photoPreview
                    ? <img src={photoPreview} alt="" className="w-full h-full object-cover rounded-xl" />
                    : <div className="text-center">
                        <ImageIcon size={28} className="mx-auto text-neutral-300 mb-2" />
                        <p className="text-sm text-neutral-400">Нажмите для загрузки</p>
                        <p className="text-xs text-neutral-300 mt-0.5">JPG, PNG, WebP</p>
                      </div>
                  }
                </div>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                  onChange={async e => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const result = await validateImageFile(f);
                    if (!result.ok) { toast.error(result.error); e.target.value = ""; return; }
                    setPhotoFile(f);
                    setPhotoPreview(URL.createObjectURL(f));
                  }}
                />
              </div>

              <div>
                <label className="label">Название *</label>
                <input value={title} onChange={e => setTitle(e.target.value)} className="input" placeholder="Название карточки" autoComplete="off" />
              </div>

              <div className="space-y-3">
                <label className="label">Кнопка «Подробнее»</label>

                <SegmentedControl
                  value={actionType}
                  onChange={setActionType}
                  options={[
                    { value: "none", label: "Отключена" },
                    { value: "url",  label: "Ссылка" },
                    { value: "app",  label: "В приложении" },
                  ]}
                />

                {actionType === "url" && (
                  <input
                    value={externalUrl}
                    onChange={e => setExternalUrl(e.target.value)}
                    className="input"
                    placeholder="https://www.sunnydaygroup.ru/"
                    autoComplete="off"
                  />
                )}

                {actionType === "app" && (
                  <div className="space-y-3">
                    <SegmentedControl
                      value={menuType}
                      onChange={setMenuType}
                      options={[
                        { value: "hot",    label: "Горячие блюда" },
                        { value: "frozen", label: "Заморозка" },
                      ]}
                    />

                    <CustomSelect
                      value={appTarget}
                      onChange={v => setAppTarget(v as AppTarget)}
                      options={APP_TARGETS}
                    />

                    {appTarget === "category" && (
                      <CustomSelect
                        value={categoryId}
                        onChange={setCategoryId}
                        options={[{ value: "", label: "Выберите категорию…" }, ...categoryOptions]}
                      />
                    )}
                    {appTarget === "item" && (
                      <CustomSelect
                        value={itemId}
                        onChange={setItemId}
                        options={[{ value: "", label: "Выберите блюдо…" }, ...itemOptions]}
                      />
                    )}
                    {appTarget === "promo" && (
                      <CustomSelect
                        value={promoCode}
                        onChange={setPromoCode}
                        options={[{ value: "", label: "Выберите промокод…" }, ...promos.map(p => ({ value: p.code, label: p.code }))]}
                      />
                    )}
                  </div>
                )}
              </div>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="w-4 h-4 rounded accent-brand-500" />
                Показывать в карусели
              </label>
            </div>

            <div className="flex justify-end gap-2 px-6 py-4 border-t border-neutral-200">
              <button onClick={closeModal} className="btn-secondary btn-md">Отмена</button>
              <button onClick={save} disabled={saving || !title} className="btn-primary btn-md">
                {saving && <Loader2 size={14} className="animate-spin" />} Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
