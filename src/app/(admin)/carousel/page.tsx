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
import { Plus, Edit2, Trash2, X, Loader2, ImageIcon, Eye, EyeOff, GripVertical, Link, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
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
type AppTarget = "menu" | "category" | "factory" | "promo" | "item";

const APP_TARGETS: { value: AppTarget; label: string }[] = [
  { value: "menu",     label: "Меню (главная)" },
  { value: "category", label: "Категория" },
  { value: "factory",  label: "Завод" },
  { value: "promo",    label: "Промокод" },
  { value: "item",     label: "Блюдо" },
];

// Парсим сохранённый action_url обратно в UI-состояние
function parseActionUrl(url: string | null): { type: ActionType; appTarget: AppTarget; categoryId: string; itemId: string; promoCode: string; externalUrl: string } {
  const base = { appTarget: "menu" as AppTarget, categoryId: "", itemId: "", promoCode: "", externalUrl: "" };
  if (!url) return { ...base, type: "none" };
  if (url.startsWith("http://") || url.startsWith("https://")) return { ...base, type: "url", externalUrl: url };
  if (url === "app://menu") return { ...base, type: "app", appTarget: "menu" };
  if (url === "app://factory") return { ...base, type: "app", appTarget: "factory" };
  const catMatch = url.match(/^app:\/\/menu\?category=(.+)$/);
  if (catMatch) return { ...base, type: "app", appTarget: "category", categoryId: catMatch[1] };
  const itemMatch = url.match(/^app:\/\/menu\?item=(.+)$/);
  if (itemMatch) return { ...base, type: "app", appTarget: "item", itemId: itemMatch[1] };
  const promoMatch = url.match(/^app:\/\/promo\?code=(.+)$/);
  if (promoMatch) return { ...base, type: "app", appTarget: "promo", promoCode: promoMatch[1] };
  return { ...base, type: "url", externalUrl: url };
}

// Собираем action_url из UI-состояния
function buildActionUrl(type: ActionType, appTarget: AppTarget, categoryId: string, itemId: string, promoCode: string, externalUrl: string): string | null {
  if (type === "none") return null;
  if (type === "url") return externalUrl || null;
  if (appTarget === "menu") return "app://menu";
  if (appTarget === "factory") return "app://factory";
  if (appTarget === "category") return categoryId ? `app://menu?category=${categoryId}` : null;
  if (appTarget === "item") return itemId ? `app://menu?item=${itemId}` : null;
  if (appTarget === "promo") return promoCode ? `app://promo?code=${promoCode}` : null;
  return null;
}

// ── Sortable row ──────────────────────────────────────────────────────────────
function SortableCard({ card, onEdit, onDelete, onToggle }: {
  card: Card;
  onEdit: (c: Card) => void;
  onDelete: (c: Card) => void;
  onToggle: (c: Card) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });

  const actionLabel = (() => {
    if (!card.action_url) return null;
    if (card.action_url.startsWith("http")) return card.action_url;
    if (card.action_url === "app://menu") return "Меню";
    if (card.action_url === "app://factory") return "Завод";
    if (card.action_url.includes("category=")) return "Категория";
    if (card.action_url.includes("item=")) return "Блюдо";
    if (card.action_url.includes("promo?code=")) return "Промокод: " + card.action_url.split("code=")[1];
    return card.action_url;
  })();

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
        {actionLabel && (
          <p className="text-xs text-neutral-400 mt-0.5 truncate max-w-xs">{actionLabel}</p>
        )}
        {!card.action_url && (
          <p className="text-xs text-neutral-300 mt-0.5">Кнопка «Подробнее» отключена</p>
        )}
      </div>

      <span className={cn("badge text-xs shrink-0", card.is_active ? "bg-success-50 text-success-700" : "bg-neutral-100 text-neutral-500")}>
        {card.is_active ? "Активна" : "Скрыта"}
      </span>

      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button onClick={() => onToggle(card)} className={cn("btn-ghost btn-sm", card.is_active ? "text-success-500" : "text-neutral-300")}>
          {card.is_active ? <Eye size={15} /> : <EyeOff size={15} />}
        </button>
        <button onClick={() => onEdit(card)} className="btn-ghost btn-sm text-brand-500"><Edit2 size={15} /></button>
        <button onClick={() => onDelete(card)} className="btn-ghost btn-sm text-danger-500"><Trash2 size={15} /></button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CarouselPage() {
  const supabase = createClient();
  const [cards, setCards] = useState<Card[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [menuItems, setMenuItems] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; editing: Card | null }>({ open: false, editing: null });

  // Основная форма
  const [title, setTitle] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  // Action URL форма
  const [actionType, setActionType] = useState<ActionType>("none");
  const [appTarget, setAppTarget] = useState<AppTarget>("menu");
  const [categoryId, setCategoryId] = useState("");
  const [itemId, setItemId] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [externalUrl, setExternalUrl] = useState("");

  const [saving, setSaving] = useState(false);
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
    supabase.from("categories").select("id,name").eq("is_active", true).order("name")
      .then(({ data }) => setCategories(data ?? []));
    supabase.from("menu_items").select("id,name").eq("is_global_active", true).order("name")
      .then(({ data }) => setMenuItems(data ?? []));
  }, [fetchCards]);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = cards.findIndex(c => c.id === active.id);
    const newIndex = cards.findIndex(c => c.id === over.id);
    const reordered = arrayMove(cards, oldIndex, newIndex);
    setCards(reordered);
    await Promise.all(reordered.map((c, i) => supabase.from("carousel_cards").update({ sort_order: i }).eq("id", c.id)));
  }

  function openAdd() {
    setTitle(""); setIsActive(true);
    setPhotoFile(null); setPhotoPreview(null);
    setActionType("none"); setAppTarget("menu");
    setCategoryId(""); setItemId(""); setPromoCode(""); setExternalUrl("");
    setModal({ open: true, editing: null });
  }

  function openEdit(card: Card) {
    setTitle(card.title); setIsActive(card.is_active);
    setPhotoFile(null); setPhotoPreview(card.image_url);
    const parsed = parseActionUrl(card.action_url);
    setActionType(parsed.type); setAppTarget(parsed.appTarget);
    setCategoryId(parsed.categoryId); setItemId(parsed.itemId);
    setPromoCode(parsed.promoCode); setExternalUrl(parsed.externalUrl);
    setModal({ open: true, editing: card });
  }

  function closeModal() {
    setModal({ open: false, editing: null });
    setPhotoFile(null); setPhotoPreview(null);
  }

  async function save() {
    if (!title) return;
    setSaving(true);
    let imageUrl = modal.editing?.image_url ?? null;

    if (photoFile) {
      try {
        const ext = photoFile.name.split(".").pop();
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

    const action_url = buildActionUrl(actionType, appTarget, categoryId, itemId, promoCode, externalUrl);
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

  const categoryOptions = categories.map(c => ({ value: c.id, label: c.name }));
  const itemOptions = menuItems.map(i => ({ value: i.id, label: i.name }));

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
              {/* Фото */}
              <div>
                <label className="label">Фото</label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="relative w-full h-44 rounded-xl border-2 border-dashed border-neutral-200 bg-neutral-50 hover:bg-neutral-100 cursor-pointer transition-colors flex items-center justify-center overflow-hidden"
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
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setPhotoFile(f);
                    setPhotoPreview(URL.createObjectURL(f));
                  }} />
                {photoPreview && (
                  <button type="button" onClick={() => { setPhotoFile(null); setPhotoPreview(null); }} className="mt-1 text-xs text-danger-500 hover:underline">
                    Удалить фото
                  </button>
                )}
              </div>

              {/* Название */}
              <div>
                <label className="label">Название *</label>
                <input value={title} onChange={e => setTitle(e.target.value)} className="input" placeholder="Весенняя акция" autoComplete="off" />
              </div>

              {/* Кнопка «Подробнее» */}
              <div className="space-y-3">
                <label className="label">Кнопка «Подробнее»</label>

                {/* Выбор типа */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: "none", label: "Отключена" },
                    { value: "url",  label: "Ссылка" },
                    { value: "app",  label: "В приложении" },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setActionType(opt.value as ActionType)}
                      className={cn(
                        "flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all",
                        actionType === opt.value
                          ? "border-brand-500 bg-brand-50 text-brand-700"
                          : "border-neutral-200 text-neutral-500 hover:border-neutral-300"
                      )}
                    >
                      {opt.value === "url" && <Link size={13} />}
                      {opt.value === "app" && <Smartphone size={13} />}
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Внешняя ссылка */}
                {actionType === "url" && (
                  <input
                    value={externalUrl}
                    onChange={e => setExternalUrl(e.target.value)}
                    className="input"
                    placeholder="https://t.me/yourchannel"
                    autoComplete="off"
                  />
                )}

                {/* В приложении */}
                {actionType === "app" && (
                  <div className="space-y-3">
                    <CustomSelect
                      value={appTarget}
                      onChange={v => setAppTarget(v as AppTarget)}
                      options={APP_TARGETS}
                    />
                    {appTarget === "category" && (
                      <div>
                        <p className="label">Категория</p>
                        <CustomSelect
                          value={categoryId}
                          onChange={setCategoryId}
                          options={[{ value: "", label: "Выберите категорию…" }, ...categoryOptions]}
                        />
                      </div>
                    )}
                    {appTarget === "item" && (
                      <div>
                        <p className="label">Блюдо</p>
                        <CustomSelect
                          value={itemId}
                          onChange={setItemId}
                          options={[{ value: "", label: "Выберите блюдо…" }, ...itemOptions]}
                        />
                      </div>
                    )}
                    {appTarget === "promo" && (
                      <div>
                        <p className="label">Код промокода</p>
                        <input
                          value={promoCode}
                          onChange={e => setPromoCode(e.target.value.toUpperCase())}
                          className="input font-mono"
                          placeholder="SUMMER20"
                          autoComplete="off"
                        />
                      </div>
                    )}
                    {/* Превью итогового URL */}
                    {buildActionUrl(actionType, appTarget, categoryId, itemId, promoCode, externalUrl) && (
                      <p className="text-xs text-neutral-400 font-mono bg-neutral-50 rounded-lg px-3 py-2 break-all">
                        {buildActionUrl(actionType, appTarget, categoryId, itemId, promoCode, externalUrl)}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Активна */}
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
