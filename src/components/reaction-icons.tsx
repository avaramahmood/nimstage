import { Compass, Disc3, Flame, Gift, Guitar, Heart, MessageCircle, Sparkles, Ticket, Vote, type LucideIcon } from "lucide-react";

/*
  One icon set for the whole app, in the brand colours, instead of system emojis (which look different on every
  phone and clash with the design). The reaction keys below are what is stored and sent to the server, so they
  must not change; only how they are drawn does.
*/

type Look = { Icon: LucideIcon; label: string; color: string; fill: boolean };

export const REACTIONS: Record<string, Look> = {
  "🔥": { Icon: Flame, label: "Fire", color: "#fa5d29", fill: true },
  "❤️": { Icon: Heart, label: "Love", color: "#ff7ab8", fill: true },
  "👏": { Icon: Sparkles, label: "Bravo", color: "#ffc857", fill: true },
  "🎸": { Icon: Guitar, label: "Rock on", color: "#49b3fc", fill: false },
};

export const reactionLabel = (key: string) => REACTIONS[key]?.label ?? "Reaction";

/** One reaction, drawn as an icon. */
export function ReactionIcon({ name, size = 24 }: { name: string; size?: number }) {
  const r = REACTIONS[name];
  if (!r) return null;
  const { Icon } = r;
  return <Icon aria-hidden="true" size={size} strokeWidth={r.fill ? 1.75 : 2} color={r.color} fill={r.fill ? r.color : "none"} fillOpacity={r.fill ? 0.35 : 0} />;
}

const BADGES: Record<string, { Icon: LucideIcon; color: string }> = {
  "first-ticket": { Icon: Ticket, color: "#fa5d29" },
  backer: { Icon: Heart, color: "#ffc857" },
  generous: { Icon: Gift, color: "#ff7ab8" },
  chatterbox: { Icon: MessageCircle, color: "#49b3fc" },
  explorer: { Icon: Compass, color: "#5be3a4" },
  collector: { Icon: Disc3, color: "#b48cff" },
  voice: { Icon: Vote, color: "#f4f0e8" },
};

/** A Fan Pass badge: in its colour when unlocked, plain when locked. */
export function BadgeIcon({ id, unlocked, size = 26 }: { id: string; unlocked: boolean; size?: number }) {
  const b = BADGES[id] ?? { Icon: Sparkles, color: "#f4f0e8" };
  const { Icon } = b;
  return <Icon aria-hidden="true" size={size} strokeWidth={1.75} color={unlocked ? b.color : "#a4a4b8"} fill={unlocked ? b.color : "none"} fillOpacity={unlocked ? 0.25 : 0} />;
}
