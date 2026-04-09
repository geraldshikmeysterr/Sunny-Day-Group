import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(kopecks: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency", currency: "RUB", minimumFractionDigits: 0,
  }).format(kopecks / 100);
}

export function rublesToKopecks(rubles: number): number {
  return Math.round(rubles * 100);
}

export function kopecksToRubles(kopecks: number): number {
  return kopecks / 100;
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

export function formatDateTime(date: string): string {
  return new Date(date).toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

export type OrderStatus = "new" | "preparing" | "on_the_way" | "ready_for_pickup" | "completed" | "cancelled";
export type AdminRole = "superadmin" | "operator";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new:              "Новый",
  preparing:        "Готовится",
  on_the_way:       "В пути",
  ready_for_pickup: "Готов к выдаче",
  completed:        "Выполнен",
  cancelled:        "Отменён",
};

export const ORDER_STATUS_COLORS: Record<OrderStatus, { bg: string; text: string; dot: string }> = {
  new:              { bg: "bg-blue-50",    text: "text-blue-700",    dot: "bg-blue-500" },
  preparing:        { bg: "bg-yellow-50",  text: "text-yellow-700",  dot: "bg-yellow-500" },
  on_the_way:       { bg: "bg-purple-50",  text: "text-purple-700",  dot: "bg-purple-500" },
  ready_for_pickup: { bg: "bg-brand-50",   text: "text-brand-700",   dot: "bg-brand-500" },
  completed:        { bg: "bg-success-50", text: "text-success-700", dot: "bg-success-500" },
  cancelled:        { bg: "bg-danger-50",  text: "text-danger-700",  dot: "bg-danger-500" },
};

export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  new:              ["preparing", "cancelled"],
  preparing:        ["on_the_way", "ready_for_pickup", "cancelled"],
  on_the_way:       ["completed", "cancelled"],
  ready_for_pickup: ["completed", "cancelled"],
  completed:        [],
  cancelled:        [],
};
