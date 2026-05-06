import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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

export type OrderStatus = "new" | "confirmed" | "preparing" | "delivering" | "delivered" | "cancelled";

export function getTypeName(name: string): string {
  return name === "Мороженое / Замороженные" ? "Замороженная продукция" : name;
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new:        "Новый",
  confirmed:  "Подтверждён",
  preparing:  "Готовится",
  delivering: "В пути",
  delivered:  "Доставлен",
  cancelled:  "Отменён",
};

export const ORDER_STATUS_COLORS: Record<OrderStatus, { bg: string; text: string; dot: string }> = {
  new:        { bg: "bg-blue-50",    text: "text-blue-700",    dot: "bg-blue-500" },
  confirmed:  { bg: "bg-sky-50",     text: "text-sky-700",     dot: "bg-sky-500" },
  preparing:  { bg: "bg-yellow-50",  text: "text-yellow-700",  dot: "bg-yellow-500" },
  delivering: { bg: "bg-purple-50",  text: "text-purple-700",  dot: "bg-purple-500" },
  delivered:  { bg: "bg-success-50", text: "text-success-700", dot: "bg-success-500" },
  cancelled:  { bg: "bg-danger-50",  text: "text-danger-700",  dot: "bg-danger-500" },
};

export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  new:        ["confirmed", "cancelled"],
  confirmed:  ["preparing", "cancelled"],
  preparing:  ["delivering", "cancelled"],
  delivering: ["delivered", "cancelled"],
  delivered:  [],
  cancelled:  [],
};
