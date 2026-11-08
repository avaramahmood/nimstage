// Idempotent DDL mirroring schema.ts. Kept as plain statements so the same
// bootstrap works on PGlite (local) and Neon (production) without a CLI step.
export const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id text PRIMARY KEY,
    address text NOT NULL UNIQUE,
    display_name text NOT NULL,
    role text NOT NULL DEFAULT 'fan',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS artists (
    id text PRIMARY KEY,
    user_id text NOT NULL UNIQUE,
    handle text NOT NULL UNIQUE,
    name text NOT NULL,
    bio text NOT NULL DEFAULT '',
    genre text NOT NULL DEFAULT 'Indie',
    payout_address text NOT NULL,
    verified boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS tiers (
    id text PRIMARY KEY,
    artist_id text NOT NULL,
    name text NOT NULL,
    perks text NOT NULL DEFAULT '',
    price_luna bigint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS tracks (
    id text PRIMARY KEY,
    artist_id text NOT NULL,
    title text NOT NULL,
    duration_sec integer NOT NULL DEFAULT 0,
    price_luna bigint NOT NULL DEFAULT 0,
    preview_sec integer NOT NULL DEFAULT 30,
    media_key text NOT NULL,
    mime text NOT NULL DEFAULT 'audio/mpeg',
    plays integer NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'published',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS shows (
    id text PRIMARY KEY,
    artist_id text NOT NULL,
    title text NOT NULL,
    description text NOT NULL DEFAULT '',
    starts_at timestamptz NOT NULL,
    duration_min integer NOT NULL DEFAULT 30,
    price_luna bigint NOT NULL DEFAULT 0,
    track_id text,
    kind text NOT NULL DEFAULT 'premiere',
    stream_url text,
    status text NOT NULL DEFAULT 'scheduled',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS posts (
    id text PRIMARY KEY,
    artist_id text NOT NULL,
    body text NOT NULL,
    tier_id text,
    status text NOT NULL DEFAULT 'published',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS follows (
    user_id text NOT NULL,
    artist_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, artist_id)
  )`,
  `CREATE TABLE IF NOT EXISTS payment_intents (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    artist_id text NOT NULL,
    kind text NOT NULL,
    ref_id text,
    amount_luna bigint NOT NULL,
    recipient text NOT NULL,
    memo text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    tx_hash text,
    fail_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    confirmed_at timestamptz
  )`,
  `CREATE TABLE IF NOT EXISTS entitlements (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    artist_id text NOT NULL,
    kind text NOT NULL,
    ref_id text NOT NULL,
    expires_at timestamptz,
    intent_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS entitlements_user_kind_ref ON entitlements (user_id, kind, ref_id)`,
  `CREATE TABLE IF NOT EXISTS chat_messages (
    id text PRIMARY KEY,
    show_id text NOT NULL,
    user_id text NOT NULL,
    body text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS chat_show_time ON chat_messages (show_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS reports (
    id text PRIMARY KEY,
    reporter_id text NOT NULL,
    target_kind text NOT NULL,
    target_id text NOT NULL,
    reason text NOT NULL,
    status text NOT NULL DEFAULT 'open',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS show_reactions (
    show_id text NOT NULL,
    emoji text NOT NULL,
    count integer NOT NULL DEFAULT 0,
    PRIMARY KEY (show_id, emoji)
  )`,
  `CREATE TABLE IF NOT EXISTS presence (
    show_id text NOT NULL,
    cid text NOT NULL,
    last_seen timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (show_id, cid)
  )`,
  `CREATE TABLE IF NOT EXISTS polls (
    id text PRIMARY KEY,
    artist_id text NOT NULL,
    question text NOT NULL,
    tier_id text,
    status text NOT NULL DEFAULT 'open',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS poll_options (
    id text PRIMARY KEY,
    poll_id text NOT NULL,
    label text NOT NULL,
    position integer NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS poll_votes (
    poll_id text NOT NULL,
    user_id text NOT NULL,
    option_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (poll_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS auth_challenges (
    nonce text PRIMARY KEY,
    message text NOT NULL,
    expires_at timestamptz NOT NULL,
    used boolean NOT NULL DEFAULT false
  )`,
];
