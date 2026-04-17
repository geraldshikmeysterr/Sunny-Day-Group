"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type Option = { value: string; label: string };
type DropdownPos = { top: number; left: number; width: number };

function useDropdown(open: boolean, calcPos: () => void, btnRef: React.RefObject<HTMLButtonElement | null>, dropRef: React.RefObject<HTMLDivElement | null>, setOpen: (v: boolean) => void) {
  useEffect(() => {
    if (!open) return;
    function onScroll() { calcPos(); }
    function onMouseDown(e: MouseEvent) {
      if (btnRef.current?.contains(e.target as Node)) return;
      if (dropRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    globalThis.window.addEventListener("scroll", onScroll, true);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      globalThis.window.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [open, calcPos, btnRef, dropRef, setOpen]);
}

// Обычный select — одиночный выбор без галочек
export function CustomSelect({ value, onChange, options, className, placeholder }: Readonly<{
  value: string; onChange: (v: string) => void;
  options: Option[]; className?: string; placeholder?: string;
}>) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<DropdownPos>({ top: 0, left: 0, width: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);

  const calcPos = useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: r.width });
  }, []);

  useDropdown(open, calcPos, btnRef, dropRef, setOpen);

  function toggle() { calcPos(); setOpen(p => !p); }

  return (
    <div className={cn("relative", className)}>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className={cn(
          "input text-left flex items-center justify-between gap-2 cursor-pointer w-full",
          open && "border-brand-500 ring-2 ring-brand-500/20"
        )}>
        <span className={selected ? "text-neutral-900" : "text-neutral-400"}>
          {selected?.label ?? placeholder ?? "Выберите..."}
        </span>
        <ChevronDown size={14} className={cn("shrink-0 text-neutral-400 transition-transform", open && "rotate-180")} />
      </button>

      {open && globalThis.window !== undefined && createPortal(
        <div
          ref={dropRef}
          className="fixed z-[200] bg-white rounded-xl shadow-card-lg border border-neutral-200 py-1 animate-scale-in max-h-64 overflow-y-auto"
          style={{ top: pos.top, left: pos.left, width: pos.width }}
        >
          {options.map(opt => (
            <button key={opt.value} type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={cn(
                "w-full px-3 py-2 text-sm text-left transition-colors hover:bg-neutral-50",
                value === opt.value ? "text-brand-600 font-medium bg-brand-50/50" : "text-neutral-700"
              )}>
              {opt.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

// Мульти-select с галочками — для выбора нескольких значений (Рестораны → города)
export function MultiSelect({ values, onChange, options, className, placeholder }: Readonly<{
  values: string[]; onChange: (v: string[]) => void;
  options: Option[]; className?: string; placeholder?: string;
}>) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<DropdownPos>({ top: 0, left: 0, width: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const calcPos = useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: r.width });
  }, []);

  useDropdown(open, calcPos, btnRef, dropRef, setOpen);

  function toggle() { calcPos(); setOpen(p => !p); }

  function toggleItem(v: string) {
    onChange(values.includes(v) ? values.filter(x => x !== v) : [...values, v]);
  }

  const labelText = (() => {
    if (values.length === 0) return placeholder ?? "Выберите...";
    if (values.length === options.length) return "Все";
    return options.filter(o => values.includes(o.value)).map(o => o.label).join(", ");
  })();

  return (
    <div className={cn("relative", className)}>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className={cn(
          "input text-left flex items-center justify-between gap-2 cursor-pointer w-full",
          open && "border-brand-500 ring-2 ring-brand-500/20"
        )}>
        <span className={cn("truncate", values.length ? "text-neutral-900" : "text-neutral-400")}>
          {labelText}
        </span>
        <ChevronDown size={14} className={cn("shrink-0 text-neutral-400 transition-transform", open && "rotate-180")} />
      </button>

      {open && globalThis.window !== undefined && createPortal(
        <div
          ref={dropRef}
          className="fixed z-[200] bg-white rounded-xl shadow-card-lg border border-neutral-200 py-1 animate-scale-in max-h-64 overflow-y-auto"
          style={{ top: pos.top, left: pos.left, width: pos.width }}
        >
          <div className="flex gap-2 px-3 py-2 border-b border-neutral-100">
            <button onClick={() => onChange(options.map(o => o.value))} className="text-xs text-brand-500 hover:text-brand-600">Все</button>
            <span className="text-neutral-300">·</span>
            <button onClick={() => onChange([])} className="text-xs text-neutral-500 hover:text-neutral-700">Снять</button>
          </div>
          {options.map(opt => (
            <button key={opt.value} type="button"
              onClick={() => toggleItem(opt.value)}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-left hover:bg-neutral-50 transition-colors">
              <div className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                values.includes(opt.value) ? "bg-brand-500 border-brand-500" : "border-neutral-300")}>
                {values.includes(opt.value) && <Check size={10} className="text-white" />}
              </div>
              <span className="truncate">{opt.label}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
