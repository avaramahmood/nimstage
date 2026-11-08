// "Add to calendar" helpers. Pure functions: no DOM, so they are unit-tested.

const pad = (n: number) => String(n).padStart(2, "0");

/** 20260311T193000Z */
export function icsDate(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** Escapes text per RFC 5545 (backslash, semicolon, comma, newline). */
export function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Folds lines longer than 75 octets, as the spec requires. */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) parts.push(" " + line.slice(i, i + 74));
  return parts.join("\r\n");
}

export type CalendarEvent = { uid: string; title: string; description?: string; url?: string; start: Date; durationMin: number };

export function buildIcs(e: CalendarEvent): string {
  const end = new Date(e.start.getTime() + e.durationMin * 60_000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NimStage//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${e.uid}@nimstage`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(e.start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(e.title)}`,
    ...(e.description ? [`DESCRIPTION:${icsEscape(e.description)}`] : []),
    ...(e.url ? [`URL:${e.url}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** A Google Calendar "create event" link: works in any browser, no file download needed. */
export function googleCalendarUrl(e: CalendarEvent): string {
  const end = new Date(e.start.getTime() + e.durationMin * 60_000);
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${icsDate(e.start)}/${icsDate(end)}`,
    details: [e.description, e.url].filter(Boolean).join("\n\n"),
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}
