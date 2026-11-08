import {
  bigint,
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Amounts are stored in Luna (1 NIM = 100_000 Luna). Max supply ≈ 2.1e15 < 2^53,
// so JS numbers are safe.
const luna = (name: string) => bigint(name, { mode: "number" });
const now = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  address: text("address").notNull().unique(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull().default("fan"), // fan | artist | admin
  createdAt: now(),
});

export const artists = pgTable("artists", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  handle: text("handle").notNull().unique(),
  name: text("name").notNull(),
  bio: text("bio").notNull().default(""),
  genre: text("genre").notNull().default("Indie"),
  payoutAddress: text("payout_address").notNull(),
  verified: boolean("verified").notNull().default(false),
  status: text("status").notNull().default("active"), // active | suspended
  createdAt: now(),
});

export const tiers = pgTable("tiers", {
  id: text("id").primaryKey(),
  artistId: text("artist_id").notNull(),
  name: text("name").notNull(),
  perks: text("perks").notNull().default(""),
  priceLuna: luna("price_luna").notNull(),
  createdAt: now(),
});

export const tracks = pgTable("tracks", {
  id: text("id").primaryKey(),
  artistId: text("artist_id").notNull(),
  title: text("title").notNull(),
  durationSec: integer("duration_sec").notNull().default(0),
  priceLuna: luna("price_luna").notNull().default(0), // 0 = free
  previewSec: integer("preview_sec").notNull().default(30),
  mediaKey: text("media_key").notNull(),
  mime: text("mime").notNull().default("audio/mpeg"),
  plays: integer("plays").notNull().default(0),
  status: text("status").notNull().default("published"), // published | removed
  createdAt: now(),
});

export const shows = pgTable("shows", {
  id: text("id").primaryKey(),
  artistId: text("artist_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  durationMin: integer("duration_min").notNull().default(30),
  priceLuna: luna("price_luna").notNull().default(0),
  trackId: text("track_id"), // premiere audio; live shows set this null
  kind: text("kind").notNull().default("premiere"), // premiere | live
  streamUrl: text("stream_url"), // HLS/audio URL for live shows (phase 2)
  status: text("status").notNull().default("scheduled"), // scheduled | removed
  createdAt: now(),
});

export const posts = pgTable("posts", {
  id: text("id").primaryKey(),
  artistId: text("artist_id").notNull(),
  body: text("body").notNull(),
  tierId: text("tier_id"), // null = public; otherwise supporters of this tier or higher
  status: text("status").notNull().default("published"),
  createdAt: now(),
});

export const follows = pgTable(
  "follows",
  {
    userId: text("user_id").notNull(),
    artistId: text("artist_id").notNull(),
    createdAt: now(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.artistId] })],
);

export const paymentIntents = pgTable("payment_intents", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  artistId: text("artist_id").notNull(),
  kind: text("kind").notNull(), // ticket | tip | membership | track
  refId: text("ref_id"), // show / tier / track id
  amountLuna: luna("amount_luna").notNull(),
  recipient: text("recipient").notNull(),
  memo: text("memo").notNull(), // <= 64 bytes, goes on-chain via sendBasicTransactionWithData
  status: text("status").notNull().default("pending"), // pending | confirmed | failed
  txHash: text("tx_hash"),
  failReason: text("fail_reason"),
  createdAt: now(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
});

export const entitlements = pgTable(
  "entitlements",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    artistId: text("artist_id").notNull(),
    kind: text("kind").notNull(), // show | track | tier
    refId: text("ref_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }), // null = forever
    intentId: text("intent_id").notNull(),
    createdAt: now(),
  },
  (t) => [uniqueIndex("entitlements_user_kind_ref").on(t.userId, t.kind, t.refId)],
);

export const chatMessages = pgTable("chat_messages", {
  id: text("id").primaryKey(),
  showId: text("show_id").notNull(),
  userId: text("user_id").notNull(),
  body: text("body").notNull(),
  createdAt: now(),
});

export const reports = pgTable("reports", {
  id: text("id").primaryKey(),
  reporterId: text("reporter_id").notNull(),
  targetKind: text("target_kind").notNull(), // track | show | artist | post
  targetId: text("target_id").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("open"), // open | actioned | dismissed
  createdAt: now(),
});

/** Running totals of emoji reactions per show (cheap to update, cheap to read). */
export const showReactions = pgTable(
  "show_reactions",
  {
    showId: text("show_id").notNull(),
    emoji: text("emoji").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.showId, t.emoji] })],
);

/** Who is in a show right now: one row per anonymous client id, refreshed by the live poll. */
export const presence = pgTable(
  "presence",
  {
    showId: text("show_id").notNull(),
    cid: text("cid").notNull(),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.showId, t.cid] })],
);

export const polls = pgTable("polls", {
  id: text("id").primaryKey(),
  artistId: text("artist_id").notNull(),
  question: text("question").notNull(),
  tierId: text("tier_id"), // null = any signed-in fan may vote; otherwise this tier or higher
  status: text("status").notNull().default("open"), // open | closed | removed
  createdAt: now(),
});

export const pollOptions = pgTable("poll_options", {
  id: text("id").primaryKey(),
  pollId: text("poll_id").notNull(),
  label: text("label").notNull(),
  position: integer("position").notNull().default(0),
});

export const pollVotes = pgTable(
  "poll_votes",
  {
    pollId: text("poll_id").notNull(),
    userId: text("user_id").notNull(),
    optionId: text("option_id").notNull(),
    createdAt: now(),
  },
  (t) => [primaryKey({ columns: [t.pollId, t.userId] })],
);

export const authChallenges = pgTable("auth_challenges", {
  nonce: text("nonce").primaryKey(),
  message: text("message").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  used: boolean("used").notNull().default(false),
});
