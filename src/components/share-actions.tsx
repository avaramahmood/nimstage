import { CalendarPlus, Share2 } from "lucide-react";
import { useToast } from "@/components/toast";
import { buildIcs, googleCalendarUrl } from "@shared/calendar";
import { haptic } from "@/lib/fun";

/** Native share sheet when available, otherwise copy the link. */
export function ShareButton({ title, text, path, className = "btn btn-ghost btn-sm" }: { title: string; text: string; path: string; className?: string }) {
  const toast = useToast();

  async function share() {
    const url = new URL(path, window.location.origin).toString();
    haptic(8);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (e) {
        if ((e as DOMException).name === "AbortError") return; // user closed the sheet
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied. Paste it anywhere.", "ok");
    } catch {
      toast(url); // last resort: show the link so it can be copied by hand
    }
  }

  return (
    <button type="button" onClick={share} className={className}>
      <Share2 aria-hidden="true" size={16} />
      Share
    </button>
  );
}

/** Google Calendar link (works in any browser) plus a downloadable .ics for other calendars. */
export function CalendarButtons({ id, title, startsAt, durationMin, description, path }: { id: string; title: string; startsAt: string; durationMin: number; description: string; path: string }) {
  const event = () => ({
    uid: id,
    title,
    description,
    url: new URL(path, window.location.origin).toString(),
    start: new Date(startsAt),
    durationMin: Math.min(durationMin, 240), // a week-long "open room" shouldn't block a calendar
  });

  function download() {
    const blob = new Blob([buildIcs(event())], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "show"}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          window.open(googleCalendarUrl(event()), "_blank", "noopener,noreferrer");
        }}
        className="btn btn-ghost btn-sm"
      >
        <CalendarPlus aria-hidden="true" size={16} />
        Add to calendar
      </a>
      <button type="button" onClick={download} className="text-sm text-muted underline underline-offset-4">
        .ics file
      </button>
    </span>
  );
}
