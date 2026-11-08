/**
  Date and time helpers for the show scheduler. The scheduler uses plain dropdowns instead of the browser's
  native date-time picker, which is unreliable inside embedded WebViews (it can hang the host app).
  Values use the same format <input type="datetime-local"> had: "2026-11-09T19:30", in the device's local time.
*/
const pad = (n: number) => String(n).padStart(2, "0");

export const toLocalValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** The next quarter hour, at least 15 minutes from `now`: a sensible default start time. */
export function nextSlot(now = new Date()): Date {
  const d = new Date(now.getTime() + 15 * 60_000);
  d.setSeconds(0, 0);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15); // 60 rolls over into the next hour
  return d;
}

export type LocalParts = { date: string; hour: number; minute: number };

export function splitLocalValue(v: string): LocalParts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v);
  if (!m) return null;
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  return hour < 24 && minute < 60 ? { date: `${m[1]}-${m[2]}-${m[3]}`, hour, minute } : null;
}

export const joinLocalValue = (p: LocalParts) => `${p.date}T${pad(p.hour)}:${pad(p.minute)}`;

/** The next `days` calendar days, starting today, labelled for a dropdown. */
export function dayOptions(now = new Date(), days = 60): { value: string; label: string }[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const text = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    return { value: toLocalValue(d).slice(0, 10), label: i === 0 ? `Today · ${text}` : i === 1 ? `Tomorrow · ${text}` : text };
  });
}
