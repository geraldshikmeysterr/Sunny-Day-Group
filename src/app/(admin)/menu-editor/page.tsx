"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent, DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus, GripVertical, Edit2, Trash2, Eye, EyeOff,
  X, Loader2, Check, ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { validateImageFile } from "@/lib/validateImageFile";
import { toast } from "sonner";

type MenuType = { id: string; slug: string; name: string };
type Category = { id: string; name: string; menu_type_id: string; sort_order: number; is_active: boolean };
type MenuItem = {
  id: string; category_id: string; name: string; description: string | null;
  weight_grams: number | null; calories: number | null;
  proteins: number | null; fats: number | null; carbs: number | null;
  image_url: string | null; is_global_active: boolean; sort_order: number;
  active_from: string | null; active_until: string | null;
  box_quantity: number | null;
};

const EMPTY_FORM = {
  name: "", description: "", weight_grams: "",
  calories: "", proteins: "", fats: "", carbs: "", image_url: "", is_global_active: false,
  active_from: "10:00", active_until: "20:00", box_quantity: "",
};

const getTypeName = (name: string) =>
  name === "Мороженое / Замороженные" ? "Замороженная продукция" : name;

async function compressImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const maxDim = 800;
  const scale = bitmap.width > maxDim || bitmap.height > maxDim
    ? maxDim / Math.max(bitmap.width, bitmap.height)
    : 1;
  const canvas = document.createElement("canvas");
  canvas.width  = Math.round(bitmap.width  * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>(res => canvas.toBlob(b => res(b!), "image/webp", 0.85));
  return new File([blob], file.name.replace(/\.[^.]+$/, ".webp"), { type: "image/webp" });
}

function SortableItemRow({ item, onEdit, onDelete, onToggle }: Readonly<{
  item: MenuItem; onEdit: (i: MenuItem) => void;
  onDelete: (id: string) => void; onToggle: (i: MenuItem) => void;
}>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 bg-white border-b border-neutral-50 transition-all group",
        isDragging && "opacity-40 z-50",
        !item.is_global_active && "opacity-60 bg-neutral-50/50"
      )}
    >
      <button {...listeners} {...attributes}
        className="cursor-grab active:cursor-grabbing text-neutral-300 hover:text-neutral-400 shrink-0 touch-none">
        <GripVertical size={14} />
      </button>
      {item.image_url
        ? <img src={item.image_url} className="w-9 h-9 rounded-lg object-cover shrink-0" alt="" />
        : <div className="w-9 h-9 rounded-lg bg-neutral-100 flex items-center justify-center shrink-0"><ImageIcon size={14} className="text-neutral-400" /></div>
      }
      <div className="flex-1 min-w-0">
        <p className="font-medium text-neutral-800 text-sm truncate">{item.name}</p>
        {item.description && <p className="text-xs text-neutral-400 truncate">{item.description}</p>}
      </div>
      {item.weight_grams && <span className="text-xs text-neutral-400 shrink-0">{item.weight_grams} г</span>}
      {(item.active_from || item.active_until) && (
        <span className="text-xs text-neutral-400 shrink-0 font-mono">
          {item.active_from ?? "?"} – {item.active_until ?? "?"}
        </span>
      )}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button onClick={() => onEdit(item)} className="btn-ghost btn-sm text-brand-500"><Edit2 size={14} /></button>
        <button onClick={() => onToggle(item)} className={cn("btn-ghost btn-sm", item.is_global_active ? "text-success-500" : "text-neutral-300")}>
          {item.is_global_active ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
        <button onClick={() => onDelete(item.id)} className="btn-ghost btn-sm text-danger-500"><Trash2 size={14} /></button>
      </div>
    </div>
  );
}

function SortableCategoryBlock({ cat, items, onEditCatName, onToggleCat, onDeleteCat, onAddItem, onEditItem, onDeleteItem, onToggleItem, deletingCat }: Readonly<{
  cat: Category; items: MenuItem[];
  onEditCatName: (c: Category) => void; onToggleCat: (c: Category) => void;
  onDeleteCat: (c: Category) => void; onAddItem: (catId: string) => void;
  onEditItem: (i: MenuItem) => void; onDeleteItem: (id: string) => void;
  onToggleItem: (i: MenuItem) => void; deletingCat: string | null;
}>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: cat.id });

  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(cat.name);

  function commitName() {
    if (nameVal.trim() && nameVal !== cat.name) { onEditCatName({ ...cat, name: nameVal.trim() }); }
    setEditingName(false);
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "card overflow-hidden transition-all",
        !cat.is_active && "opacity-60",
        isDragging && "opacity-40 shadow-card-lg"
      )}
    >
      <div className="flex items-center gap-2 px-4 py-3 bg-neutral-50 border-b border-neutral-100 group">
        <button
          {...listeners} {...attributes}
          className="cursor-grab active:cursor-grabbing text-neutral-300 hover:text-neutral-400 shrink-0 touch-none">
          <GripVertical size={16} />
        </button>

        {editingName ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              value={nameVal}
              onChange={e => setNameVal(e.target.value)}
              autoFocus
              onKeyDown={e => { if (e.key === "Enter") commitName(); if (e.key === "Escape") { setNameVal(cat.name); setEditingName(false); } }}
              className="input h-8 text-sm flex-1"
              onClick={e => e.stopPropagation()}
            />
            <button onClick={commitName} className="btn-ghost btn-sm text-success-600"><Check size={14} /></button>
            <button onClick={() => { setNameVal(cat.name); setEditingName(false); }} className="btn-ghost btn-sm"><X size={14} /></button>
          </div>
        ) : (
          <span
            className="font-semibold text-sm text-neutral-800 flex-1 cursor-pointer hover:text-brand-600 transition-colors"
            onDoubleClick={() => setEditingName(true)}>
            {cat.name}
            <span className="ml-2 text-xs font-normal text-neutral-400">{items.length} блюд</span>
          </span>
        )}

        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => setEditingName(true)} className="btn-ghost btn-sm text-brand-500"><Edit2 size={13} /></button>
          <button onClick={() => onToggleCat(cat)} className={cn("btn-ghost btn-sm", cat.is_active ? "text-success-500" : "text-neutral-400")}>
            {cat.is_active ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
          <button onClick={() => onDeleteCat(cat)} disabled={deletingCat === cat.id} className="btn-ghost btn-sm text-danger-500">
            {deletingCat === cat.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
        </div>
      </div>

      <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
        <div>
          {items.length === 0 && (
            <p className="px-4 py-3 text-sm text-neutral-400 italic">Нет блюд — добавьте первое</p>
          )}
          {items.map(item => (
            <SortableItemRow
              key={item.id} item={item}
              onEdit={onEditItem} onDelete={onDeleteItem} onToggle={onToggleItem}
            />
          ))}
          <div className="px-4 py-2.5">
            <button onClick={() => onAddItem(cat.id)} className="btn-ghost btn-sm text-brand-500">
              <Plus size={14} /> Добавить блюдо
            </button>
          </div>
        </div>
      </SortableContext>
    </div>
  );
}

export default function MenuEditorPage() {
  const supabase = createClient();
  const [menuTypes,  setMenuTypes]  = useState<MenuType[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items,      setItems]      = useState<MenuItem[]>([]);
  const [activeType, setActiveType] = useState("");
  const [loading,    setLoading]    = useState(true);
  const [modal,      setModal]      = useState<{ open: boolean; item: MenuItem | null; catId: string }>({ open: false, item: null, catId: "" });
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [saving,     setSaving]     = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [addingCat,  setAddingCat]  = useState(false);
  const [deletingCat,setDeletingCat]= useState<string | null>(null);
  const [activeId,   setActiveId]   = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoFile,    setPhotoFile]    = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [{ data: types }, { data: cats }, { data: mi }] = await Promise.all([
      supabase.from("menu_types").select("*"),
      supabase.from("categories").select("*").order("sort_order"),
      supabase.from("menu_items").select("*").order("sort_order"),
    ]);
    setMenuTypes(types ?? []);
    setCategories(cats ?? []);
    setItems((mi as MenuItem[]) ?? []);
    if (types?.length && !activeType) setActiveType(types[0].id);
    setLoading(false);
  }, [activeType]);

  useEffect(() => { fetchAll(); }, []);

  const visibleCats = categories
    .filter(c => c.menu_type_id === activeType)
    .sort((a, b) => a.sort_order - b.sort_order);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const activeIdStr = String(active.id);
    const overIdStr   = String(over.id);

    const isCat = categories.some(c => c.id === activeIdStr);
    if (isCat) {
      const oldIdx = visibleCats.findIndex(c => c.id === activeIdStr);
      const newIdx = visibleCats.findIndex(c => c.id === overIdStr);
      if (oldIdx < 0 || newIdx < 0) return;
      const reordered = arrayMove(visibleCats, oldIdx, newIdx);
      setCategories(prev => {
        const other = prev.filter(c => c.menu_type_id !== activeType);
        return [...other, ...reordered.map((c, i) => ({ ...c, sort_order: i }))];
      });
      await Promise.all(reordered.map((c, i) =>
        supabase.from("categories").update({ sort_order: i }).eq("id", c.id)
      ));
      toast.success("Порядок категорий сохранён");
      return;
    }

    const activeItem = items.find(i => i.id === activeIdStr);
    if (!activeItem) return;
    const overItem = items.find(i => i.id === overIdStr);
    const catId = overItem ? overItem.category_id : activeItem.category_id;

    if (activeItem.category_id === catId) {
      const catItems = items.filter(i => i.category_id === catId).sort((a, b) => a.sort_order - b.sort_order);
      const oldIdx = catItems.findIndex(i => i.id === activeIdStr);
      const newIdx = catItems.findIndex(i => i.id === overIdStr);
      if (oldIdx < 0 || newIdx < 0) return;
      const reordered = arrayMove(catItems, oldIdx, newIdx);
      setItems(prev => {
        const other = prev.filter(i => i.category_id !== catId);
        return [...other, ...reordered.map((i, idx) => ({ ...i, sort_order: idx }))];
      });
      await Promise.all(reordered.map((i, idx) =>
        supabase.from("menu_items").update({ sort_order: idx }).eq("id", i.id)
      ));
      toast.success("Порядок сохранён");
    } else {
      setItems(prev => prev.map(i => i.id === activeIdStr ? { ...i, category_id: catId } : i));
      await supabase.from("menu_items").update({ category_id: catId }).eq("id", activeIdStr);
      toast.success("Блюдо перемещено");
    }
  }

  async function updateCatName(cat: Category) {
    await supabase.from("categories").update({ name: cat.name }).eq("id", cat.id);
    setCategories(p => p.map(c => c.id === cat.id ? { ...c, name: cat.name } : c));
    toast.success("Название сохранено");
  }

  async function toggleCat(cat: Category) {
    await supabase.from("categories").update({ is_active: !cat.is_active }).eq("id", cat.id);
    setCategories(p => p.map(c => c.id === cat.id ? { ...c, is_active: !c.is_active } : c));
  }

  async function deleteCat(cat: Category) {
    const count = items.filter(i => i.category_id === cat.id).length;
    if (!confirm(count > 0 ? `Удалить категорию вместе с ${count} блюдами?` : "Удалить категорию?")) return;
    setDeletingCat(cat.id);
    if (count > 0) { await supabase.from("menu_items").delete().eq("category_id", cat.id); }
    await supabase.from("categories").delete().eq("id", cat.id);
    await fetchAll();
    setDeletingCat(null);
    toast.success("Категория удалена");
  }

  async function addCategory() {
    if (!newCatName.trim()) return;
    const currentType = activeType;
    const slug = `${newCatName.toLowerCase().replaceAll(/\s+/g, "-").replaceAll(/[^a-z0-9-]/gi, "")}-${Date.now()}`;
    const { data: newCat } = await supabase.from("categories")
      .insert({ name: newCatName.trim(), slug, menu_type_id: currentType, sort_order: visibleCats.length, is_active: true })
      .select().single();
    if (newCat) {
      setCategories(prev => [...prev, newCat]);
    }
    setNewCatName("");
    setAddingCat(false);
    toast.success("Категория добавлена");
  }

  function openAdd(catId: string) {
    setForm(EMPTY_FORM); setPhotoFile(null); setPhotoPreview(null);
    setModal({ open: true, item: null, catId });
  }

  function openEdit(item: MenuItem) {
    setForm({
      name: item.name, description: item.description ?? "",
      weight_grams: String(item.weight_grams ?? ""), calories: String(item.calories ?? ""),
      proteins: String(item.proteins ?? ""), fats: String(item.fats ?? ""),
      carbs: String(item.carbs ?? ""), image_url: item.image_url ?? "",
      is_global_active: item.is_global_active,
      active_from: item.active_from ?? "", active_until: item.active_until ?? "",
      box_quantity: String(item.box_quantity ?? ""),
    });
    setPhotoPreview(item.image_url); setPhotoFile(null);
    setModal({ open: true, item, catId: item.category_id });
  }

  async function saveItem() {
    setSaving(true);
    let imageUrl = form.image_url || null;
    if (photoFile) {
      try {
        const extMap: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
        const ext = extMap[photoFile.type] ?? "jpg";
        const path = `menu/${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from("dish-photos").upload(path, photoFile, { upsert: true });
        if (error) throw error;
        imageUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/dish-photos/${path}`;
      } catch (e: any) {
        toast.error("Фото не загружено: " + (e.message ?? "создайте bucket dish-photos в Storage"));
        setSaving(false);
        return;
      }
    }
    const payload = {
      name: form.name, description: form.description || null,
      weight_grams: form.weight_grams ? Number.parseInt(form.weight_grams) : null,
      calories: form.calories ? Number.parseFloat(form.calories) : null,
      proteins: form.proteins ? Number.parseFloat(form.proteins) : null,
      fats: form.fats ? Number.parseFloat(form.fats) : null,
      carbs: form.carbs ? Number.parseFloat(form.carbs) : null,
      image_url: imageUrl, is_global_active: form.is_global_active,
      category_id: modal.catId,
      active_from: form.active_from || null,
      active_until: form.active_until || null,
      box_quantity: form.box_quantity ? Number.parseInt(form.box_quantity) : null,
    };
    if (modal.item) {
      await supabase.from("menu_items").update(payload).eq("id", modal.item.id);
      toast.success("Сохранено");
    } else {
      const { data: newItem } = await supabase
        .from("menu_items")
        .insert({ ...payload, sort_order: items.filter(i => i.category_id === modal.catId).length })
        .select("id")
        .single();
      if (newItem?.id) {
        const { data: cities } = await supabase.from("cities").select("id");
        if (cities?.length) {
          await supabase.from("city_menu_items").upsert(
            cities.map(c => ({ city_id: c.id, menu_item_id: newItem.id, price: 0, is_available: true })),
            { onConflict: "city_id,menu_item_id" }
          );
        }
      }
      toast.success("Добавлено");
    }
    setModal({ open: false, item: null, catId: "" });
    await fetchAll();
    setSaving(false);
  }

  async function deleteItem(id: string) {
    if (!confirm("Удалить блюдо?")) return;
    await supabase.from("menu_items").delete().eq("id", id);
    setItems(p => p.filter(i => i.id !== id));
    toast.success("Удалено");
  }

  async function toggleItem(item: MenuItem) {
    await supabase.from("menu_items").update({ is_global_active: !item.is_global_active }).eq("id", item.id);
    setItems(p => p.map(i => i.id === item.id ? { ...i, is_global_active: !i.is_global_active } : i));
  }

  if (loading) return (
    <div className="p-6 max-w-3xl mx-auto space-y-3">
      <div className="skeleton h-10 w-48 mb-6" />
      {Array.from({ length: 3 }, (_, i) => i).map(i => (
        <div key={`sk-${i}`} className="card p-5"><div className="skeleton h-5 w-32 mb-3" /><div className="skeleton h-4 w-full" /></div>
      ))}
    </div>
  );

  const activeCategory = categories.find(c => c.id === activeId);
  const activeItem     = items.find(i => i.id === activeId);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Редактор меню</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Перетащите категории и блюда для изменения порядка</p>
        </div>
        <div className="flex gap-2">
          {menuTypes.map(t => (
            <button key={t.id} onClick={() => setActiveType(t.id)}
              className={cn("btn btn-sm", activeType === t.id ? "btn-primary" : "btn-secondary")}>
              {getTypeName(t.name)}
            </button>
          ))}
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={e => setActiveId(String(e.active.id))}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <SortableContext items={visibleCats.map(c => c.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {visibleCats.map(cat => {
              const catItems = items
                .filter(i => i.category_id === cat.id)
                .sort((a, b) => a.sort_order - b.sort_order);
              return (
                <SortableCategoryBlock
                  key={cat.id} cat={cat} items={catItems}
                  onEditCatName={updateCatName} onToggleCat={toggleCat}
                  onDeleteCat={deleteCat} onAddItem={openAdd}
                  onEditItem={openEdit} onDeleteItem={deleteItem}
                  onToggleItem={toggleItem} deletingCat={deletingCat}
                />
              );
            })}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeCategory && (
            <div className="card px-4 py-3 bg-white shadow-card-lg border-2 border-brand-400 opacity-95">
              <span className="font-semibold text-sm text-neutral-800">{activeCategory.name}</span>
            </div>
          )}
          {activeItem && (
            <div className="flex items-center gap-3 px-4 py-2.5 bg-white shadow-card-lg border-2 border-brand-400 rounded-xl opacity-95">
              {activeItem.image_url
                ? <img src={activeItem.image_url} className="w-9 h-9 rounded-lg object-cover shrink-0" alt="" />
                : <div className="w-9 h-9 rounded-lg bg-neutral-100 shrink-0" />
              }
              <p className="font-medium text-sm text-neutral-800">{activeItem.name}</p>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <div className="card p-4 border-2 border-dashed border-neutral-200 bg-transparent shadow-none">
        {addingCat ? (
          <div className="flex items-center gap-2">
            <input value={newCatName} onChange={e => setNewCatName(e.target.value)}
              placeholder="Название категории" autoFocus
              onKeyDown={e => { if (e.key === "Enter") { addCategory(); } if (e.key === "Escape") { setAddingCat(false); setNewCatName(""); } }}
              className="input flex-1" />
            <button onClick={addCategory} disabled={!newCatName.trim()} className="btn-primary btn-sm"><Check size={13} /> Добавить</button>
            <button onClick={() => { setAddingCat(false); setNewCatName(""); }} className="btn-secondary btn-sm"><X size={13} /></button>
          </div>
        ) : (
          <button onClick={() => setAddingCat(true)} className="btn-ghost btn-sm text-brand-500 w-full justify-center">
            <Plus size={14} /> Добавить категорию
          </button>
        )}
      </div>

      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-card-lg w-full max-w-lg max-h-[90vh] flex flex-col animate-scale-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
              <h2 className="text-xl font-semibold">{modal.item ? modal.item.name : "Новое блюдо"}</h2>
              <button onClick={() => setModal({ open: false, item: null, catId: "" })} className="btn-ghost btn-sm"><X size={16} /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-6 space-y-4">
              <div>
                <label htmlFor="item-file" className="label">Фото</label>
                <div onClick={() => fileRef.current?.click()}
                  role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && fileRef.current?.click()}
                  className="border-2 border-dashed border-neutral-300 rounded-xl p-4 flex items-center gap-4 cursor-pointer hover:border-brand-400 hover:bg-brand-50/30 transition-all">
                  {photoPreview
                    ? <img src={photoPreview} className="w-16 h-16 object-cover rounded-lg shrink-0" alt="" />
                    : <div className="w-16 h-16 bg-neutral-100 rounded-lg flex items-center justify-center shrink-0"><ImageIcon size={24} className="text-neutral-400" /></div>
                  }
                  <div>
                    <p className="text-sm font-medium text-neutral-700">{photoFile ? photoFile.name : "Нажмите для загрузки"}</p>
                    <p className="text-xs text-neutral-400">JPEG, PNG, WebP · до 5 МБ</p>
                  </div>
                </div>
                <input id="item-file" ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                  onChange={async e => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const result = await validateImageFile(f);
                    if (!result.ok) { toast.error(result.error); e.target.value = ""; return; }
                    const compressed = await compressImage(f);
                    setPhotoFile(compressed); setPhotoPreview(URL.createObjectURL(compressed));
                    setForm(p => ({ ...p, image_url: "" }));
                  }} />
              </div>
              <div><label htmlFor="item-name" className="label">Название *</label><input id="item-name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="input" placeholder="Название блюда" autoComplete="off" /></div>
              <div><p className="label">Цена (руб.)</p><p className="text-xs text-neutral-400 -mt-0.5 mb-1">Устанавливается в разделе «По городам»</p></div>
              <div><label htmlFor="item-desc" className="label">Описание</label><textarea id="item-desc" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3} className="textarea" placeholder="Описание блюда" /></div>
              <div>
                <p className="label mb-2">КБЖУ</p>
                <div className="grid grid-cols-4 gap-2">
                  {([["calories", "Калории"], ["proteins", "Белки"], ["fats", "Жиры"], ["carbs", "Углеводы"]] as const).map(([k, l]) => (
                    <div key={k}>
                      <label className="text-xs text-neutral-500 block mb-1">{l}</label>
                      <input type="number" value={form[k as keyof typeof form] as string}
                        onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))}
                        className="input text-sm text-center" placeholder="0" style={{ appearance: "textfield", MozAppearance: "textfield" }} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="item-weight" className="label">Вес (г)</label>
                  <input id="item-weight" type="number" placeholder="Вес блюда" value={form.weight_grams} onChange={e => setForm(p => ({ ...p, weight_grams: e.target.value }))} className="input" />
                </div>
                <div>
                  <label htmlFor="item-box-qty" className="label">Количество в коробке</label>
                  <input id="item-box-qty" type="number" placeholder="Укажите шт. для коробки" value={form.box_quantity} onChange={e => setForm(p => ({ ...p, box_quantity: e.target.value }))} className="input" min={1} />
                </div>
              </div>
              <div className="border-t border-neutral-200 pt-3">
                <p className="label mb-1">Расписание активности</p>
                <p className="text-xs text-neutral-400 mb-3">Блюдо будет автоматически включаться и выключаться по времени. Оставьте пустым — всегда активно.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="item-active-from" className="text-xs text-neutral-500 block mb-1">Начало</label>
                    <input id="item-active-from" type="time" value={form.active_from} onChange={e => setForm(p => ({ ...p, active_from: e.target.value }))} className="input text-sm" />
                  </div>
                  <div>
                    <label htmlFor="item-active-until" className="text-xs text-neutral-500 block mb-1">Конец</label>
                    <input id="item-active-until" type="time" value={form.active_until} onChange={e => setForm(p => ({ ...p, active_until: e.target.value }))} className="input text-sm" />
                  </div>
                </div>
                {(form.active_from || form.active_until) && (
                  <button type="button" onClick={() => setForm(p => ({ ...p, active_from: "", active_until: "" }))}
                    className="text-xs text-neutral-400 hover:text-danger-500 mt-2 transition-colors">
                    Очистить расписание
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-200">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.is_global_active}
                  onChange={e => setForm(p => ({ ...p, is_global_active: e.target.checked }))}
                  className="w-4 h-4 rounded accent-brand-500" /> Активно
              </label>
              <div className="flex gap-2">
                <button onClick={() => setModal({ open: false, item: null, catId: "" })} className="btn-secondary btn-md">Отмена</button>
                <button onClick={saveItem} disabled={saving || !form.name} className="btn-primary btn-md">
                  {saving && <Loader2 size={14} className="animate-spin" />} Сохранить детали
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
