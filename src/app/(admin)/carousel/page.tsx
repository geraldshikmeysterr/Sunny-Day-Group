"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, Edit2, Trash2, X, Loader2, ImageIcon, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Card = {
  id: string;
  title: string;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

const EMPTY = { title: "", image_url: "", sort_order: 0, is_active: true };

export default function CarouselPage() {
  const supabase = createClient();
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; editing: Card | null }>({ open: false, editing: null });
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchCards = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("carousel_cards").select("*").order("sort_order").order("created_at");
    setCards(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchCards(); }, [fetchCards]);

  function openAdd() {
    setForm({ ...EMPTY, sort_order: cards.length });
    setPhotoFile(null);
    setPhotoPreview(null);
    setModal({ open: true, editing: null });
  }

  function openEdit(card: Card) {
    setForm({ title: card.title, image_url: card.image_url ?? "", sort_order: card.sort_order, is_active: card.is_active });
    setPhotoFile(null);
    setPhotoPreview(card.image_url);
    setModal({ open: true, editing: card });
  }

  function closeModal() {
    setModal({ open: false, editing: null });
    setPhotoFile(null);
    setPhotoPreview(null);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function save() {
    if (!form.title) return;
    setSaving(true);
    let imageUrl = form.image_url || null;

    if (photoFile) {
      try {
        const ext = photoFile.name.split(".").pop();
        const path = `carousel/${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from("carousel-images").upload(path, photoFile, { upsert: true });
        if (error) throw error;
        imageUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/carousel-images/${path}`;
      } catch (e: any) {
        toast.error("Фото не загружено: " + (e.message ?? "создайте bucket carousel-images в Storage"));
        setSaving(false);
        return;
      }
    }

    const payload = {
      title: form.title,
      image_url: imageUrl,
      sort_order: Number(form.sort_order) || 0,
      is_active: form.is_active,
    };

    if (modal.editing) {
      await supabase.from("carousel_cards").update(payload).eq("id", modal.editing.id);
      toast.success("Карточка обновлена");
    } else {
      await supabase.from("carousel_cards").insert(payload);
      toast.success("Карточка добавлена");
    }

    closeModal();
    await fetchCards();
    setSaving(false);
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

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Карусель</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Баннеры главного экрана</p>
        </div>
        <button onClick={openAdd} className="btn-primary btn-md"><Plus size={16} /> Добавить</button>
      </div>

      <div className="card overflow-hidden">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 64 }}>Фото</th>
              <th>Название</th>
              <th style={{ width: 80 }}>Порядок</th>
              <th style={{ width: 100 }}>Статус</th>
              <th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 3 }).map((_, i) => (
              <tr key={i}>{Array.from({ length: 5 }).map((_, j) => <td key={j}><div className="skeleton h-4" /></td>)}</tr>
            ))}
            {!loading && cards.map(card => (
              <tr key={card.id} className={cn(!card.is_active && "opacity-50")}>
                <td>
                  {card.image_url
                    ? <img src={card.image_url} alt="" className="w-12 h-12 rounded-lg object-cover" />
                    : <div className="w-12 h-12 rounded-lg bg-neutral-100 flex items-center justify-center"><ImageIcon size={16} className="text-neutral-400" /></div>
                  }
                </td>
                <td className="font-medium text-neutral-900">{card.title}</td>
                <td className="text-sm text-neutral-500 num">{card.sort_order}</td>
                <td>
                  <span className={cn("badge text-xs", card.is_active ? "bg-success-50 text-success-700" : "bg-neutral-100 text-neutral-500")}>
                    {card.is_active ? "Активна" : "Скрыта"}
                  </span>
                </td>
                <td>
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => toggleActive(card)} className={cn("btn-ghost btn-sm", card.is_active ? "text-success-500" : "text-neutral-300")} title={card.is_active ? "Скрыть" : "Показать"}>
                      {card.is_active ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button onClick={() => openEdit(card)} className="btn-ghost btn-sm text-brand-500"><Edit2 size={14} /></button>
                    <button onClick={() => deleteCard(card)} className="btn-ghost btn-sm text-danger-500"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && !cards.length && (
              <tr><td colSpan={5} className="py-16 text-center text-neutral-400">Нет карточек</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-card-lg w-full max-w-md animate-scale-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
              <h2 className="text-xl font-semibold">{modal.editing ? "Редактировать карточку" : "Новая карточка"}</h2>
              <button onClick={closeModal} className="btn-ghost btn-sm"><X size={16} /></button>
            </div>
            <div className="p-6 space-y-4">
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
                  {photoPreview && (
                    <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center">
                      <p className="text-white text-sm font-medium opacity-0 hover:opacity-100">Заменить</p>
                    </div>
                  )}
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
                {photoPreview && (
                  <button
                    type="button"
                    onClick={() => { setPhotoFile(null); setPhotoPreview(null); setForm(p => ({ ...p, image_url: "" })); }}
                    className="mt-1 text-xs text-danger-500 hover:underline"
                  >
                    Удалить фото
                  </button>
                )}
              </div>

              {/* Название */}
              <div>
                <label className="label">Название *</label>
                <input
                  value={form.title}
                  onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  className="input"
                  placeholder="Весенняя акция"
                  autoComplete="off"
                />
              </div>

              {/* Порядок */}
              <div>
                <label className="label">Порядок отображения</label>
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={e => setForm(p => ({ ...p, sort_order: Number(e.target.value) }))}
                  className="input"
                  min={0}
                />
              </div>

              {/* Активна */}
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} className="w-4 h-4 rounded accent-brand-500" />
                Показывать в карусели
              </label>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-neutral-200">
              <button onClick={closeModal} className="btn-secondary btn-md">Отмена</button>
              <button onClick={save} disabled={saving || !form.title} className="btn-primary btn-md">
                {saving && <Loader2 size={14} className="animate-spin" />} Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
