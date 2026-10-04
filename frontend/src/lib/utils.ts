import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const timeStr = date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (diffDays === 0) return timeStr;
  if (diffDays === 1) return `Вчера, ${timeStr}`;
  if (diffDays < 7) {
    const dayNames = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
    return `${dayNames[date.getDay()]}, ${timeStr}`;
  }
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  }) + `, ${timeStr}`;
}

export function getInitials(username: string): string {
  return username.slice(0, 2).toUpperCase();
}

/** Stable YYYY-MM-DD key used to decide where date separators go. */
export function dayKey(isoString: string): string {
  const d = new Date(isoString);
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Human label for a message date divider. */
export function formatDayLabel(isoString: string): string {
  const date = new Date(isoString);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86400000);

  if (diffDays === 0) return "Сегодня";
  if (diffDays === 1) return "Вчера";
  if (diffDays < 7) {
    const dayNames = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
    return dayNames[date.getDay()];
  }
  const monthNames = [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
  ];
  const base = `${date.getDate()} ${monthNames[date.getMonth()]}`;
  return date.getFullYear() === today.getFullYear() ? base : `${base} ${date.getFullYear()}`;
}

export function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
