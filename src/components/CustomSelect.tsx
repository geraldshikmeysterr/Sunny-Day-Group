"use client";
import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type Option = { value: string; label: string };

// Обычный select — одиночный выбор без галочек
export function CustomSelect({ value, onChange, options, className, placeholder, upward }: {
  value: string; onChange: (v: string) => void;
  options: Option[]; className?: string; placeholder?: string; upward?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        className={cn(
          "input text-left flex items-center justify-between gap-2 cursor-pointer w-full",
          open && "border-brand-500 ring-2 ring-brand-500/20"
        )}>
        <span className={selected ? "text-neutral-900" : "text-neutral-400"}>
          {selected?.label ?? placeholder ?? "Выберите..."}
        </span>
        <ChevronDown size={14} className={cn("shrink-0 text-neutral-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className={cn("absolute left-0 z-20 bg-white rounded-xl shadow-card-lg border border-neutral-200 w-full py-1 animate-scale-in max-h-64 overflow-y-auto", upward ? "bottom-[calc(100%+4px)]" : "top-[calc(100%+4px)]")}>
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
          </div>
        </>
      )}
    </div>
  );
}

// Мульти-select с галочками — для выбора нескольких значений (Рестораны → города)
export function MultiSelect({ values, onChange, options, className, placeholder }: {
  values: string[]; onChange: (v: string[]) => void;
  options: Option[]; className?: string; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function toggle(v: string) {
    onChange(values.includes(v) ? values.filter(x => x !== v) : [...values, v]);
  }

  const label = values.length === 0
    ? (placeholder ?? "Выберите...")
    : values.length === options.length
    ? "Все"
    : options.filter(o => values.includes(o.value)).map(o => o.label).join(", ");

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        className={cn(
          "input text-left flex items-center justify-between gap-2 cursor-pointer w-full",
          open && "border-brand-500 ring-2 ring-brand-500/20"
        )}>
        <span className={cn("truncate", values.length ? "text-neutral-900" : "text-neutral-400")}>
          {label}
        </span>
        <ChevronDown size={14} className={cn("shrink-0 text-neutral-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-[calc(100%+4px)] z-20 bg-white rounded-xl shadow-card-lg border border-neutral-200 w-full py-1 animate-scale-in max-h-64 overflow-y-auto">
            <div className="flex gap-2 px-3 py-2 border-b border-neutral-100">
              <button onClick={() => onChange(options.map(o => o.value))} className="text-xs text-brand-500 hover:text-brand-600">Все</button>
              <span className="text-neutral-300">·</span>
              <button onClick={() => onChange([])} className="text-xs text-neutral-500 hover:text-neutral-700">Снять</button>
            </div>
            {options.map(opt => (
              <button key={opt.value} type="button"
                onClick={() => toggle(opt.value)}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-left hover:bg-neutral-50 transition-colors">
                <div className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                  values.includes(opt.value) ? "bg-brand-500 border-brand-500" : "border-neutral-300")}>
                  {values.includes(opt.value) && <Check size={10} className="text-white" />}
                </div>
                <span className="truncate">{opt.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
