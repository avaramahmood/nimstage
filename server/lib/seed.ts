import { and, count, eq, gt } from "drizzle-orm";
import type { DB } from "@srv/db";
import { schema } from "@srv/db";
import { saveMediaAs } from "@srv/storage";
import { nimToLuna } from "@shared/units";

const { users, artists, tiers, tracks, shows, posts, polls, pollOptions } = schema;

// Placeholder for demo artists. This is Nimiq's null/burn address: demo artists can
// never receive real funds (see createIntent, which blocks real payments to them).
const DEMO_ADDRESS = "NQ07 0000 0000 0000 0000 0000 0000 0000 0000";

/* ------------------------- tiny synth: original demo audio ------------------------- */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Voice = { root: number; scale: number[]; bpm: number; wave: "sine" | "tri" | "saw"; seed: number };

function synthWav(v: Voice, secs: number): Buffer {
  const sr = 16000;
  const n = sr * secs;
  const out = new Float32Array(n);
  const rnd = mulberry32(v.seed);
  const stepLen = Math.floor((60 / v.bpm / 2) * sr); // eighth notes
  const hz = (semi: number) => 440 * 2 ** ((semi - 9) / 12);
  const osc = (ph: number) =>
    v.wave === "sine" ? Math.sin(2 * Math.PI * ph) : v.wave === "tri" ? 4 * Math.abs(ph - Math.floor(ph + 0.5)) - 1 : 2 * (ph - Math.floor(ph + 0.5));
  const steps = Math.floor(n / stepLen);
  for (let s = 0; s < steps; s++) {
    const bar = Math.floor(s / 8) % 4;
    const chordShift = [0, 5, 7, 3][bar];
    const degree = v.scale[Math.floor(rnd() * v.scale.length)];
    const freq = hz(v.root + 12 + chordShift + degree);
    const start = s * stepLen;
    for (let i = 0; i < stepLen * 2 && start + i < n; i++) {
      const t = i / sr;
      out[start + i] += osc((freq * t) % 1) * Math.exp(-t * 7) * 0.28;
    }
    if (s % 4 === 0) {
      const bass = hz(v.root - 12 + chordShift);
      for (let i = 0; i < stepLen * 4 && start + i < n; i++) {
        const t = i / sr;
        out[start + i] += Math.sin(2 * Math.PI * bass * t) * Math.exp(-t * 2.2) * 0.3;
      }
    }
    if (s % 2 === 0) {
      // kick
      for (let i = 0; i < sr * 0.18 && start + i < n; i++) {
        const t = i / sr;
        out[start + i] += Math.sin(2 * Math.PI * (120 * Math.exp(-t * 22) + 42) * t) * Math.exp(-t * 14) * 0.5;
      }
    } else {
      for (let i = 0; i < sr * 0.04 && start + i < n; i++) out[start + i] += (rnd() * 2 - 1) * Math.exp(-(i / sr) * 90) * 0.08;
    }
  }
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, out[i] * 0.8)) * 32767), 44 + i * 2);
  return buf;
}

/* --------------------------------- demo content --------------------------------- */

const MAJOR = [0, 2, 4, 7, 9];
const MINOR = [0, 3, 5, 7, 10];

const DEMO = [
  {
    id: "demo-artist-1", handle: "miravale", name: "Mira Vale", genre: "Dream pop", verified: true,
    bio: "Bedroom dream-pop from a fourth-floor window. Synths, soft drums, and songs written between midnight and sunrise.",
    voice: { root: 57, scale: MINOR, bpm: 92, wave: "tri", seed: 11 } as Voice,
    tracks: [["Window Seat", 0], ["Soft Static", 0], ["Midnight Cue", 2]],
  },
  {
    id: "demo-artist-2", handle: "kofistatic", name: "Kofi & The Static", genre: "Afro-indie", verified: true,
    bio: "Four friends, one broken amp. Highlife guitars tangled with indie-rock bounce, recorded live in a garage in Accra.",
    voice: { root: 55, scale: MAJOR, bpm: 118, wave: "saw", seed: 23 } as Voice,
    tracks: [["Garage Sun", 0], ["Loose Wire", 3]],
  },
  {
    id: "demo-artist-3", handle: "junohex", name: "Juno Hex", genre: "Electronic", verified: false,
    bio: "Modular synth explorer. Long-form pulses, slow builds, and the occasional drop nobody saw coming.",
    voice: { root: 52, scale: MINOR, bpm: 128, wave: "saw", seed: 37 } as Voice,
    tracks: [["Pulse Garden", 0], ["Hex Loop 04", 3]],
  },
  {
    id: "demo-artist-4", handle: "paperlanterns", name: "Paper Lanterns", genre: "Folk", verified: false,
    bio: "Two voices, one acoustic guitar, and a lot of porch light. Gentle songs for long evenings.",
    voice: { root: 50, scale: MAJOR, bpm: 84, wave: "sine", seed: 41 } as Voice,
    tracks: [["Porch Light", 0], ["Lantern Hill", 0]],
  },
  {
    id: "demo-artist-5", handle: "sablerook", name: "Sable Rook", genre: "Lo-fi hip-hop", verified: false,
    bio: "Dusty drums and late-night loops. Beats made to be rapped over, or just to think to.",
    voice: { root: 53, scale: MINOR, bpm: 76, wave: "tri", seed: 53 } as Voice,
    tracks: [["Rainy Tuesday", 0], ["Corner Store", 1]],
  },
] as const;

const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000);

const synthesizing = new Map<string, Promise<void>>();

/**
 * Demo audio is generated the first time it is requested (about 100 ms) instead of up front, which
 * keeps a fresh start fast. Returns null for keys that aren't demo tracks.
 */
export function ensureDemoMedia(key: string): Promise<void> | null {
  const m = /^demo-([a-z0-9]+)-(\d+)\.wav$/.exec(key);
  const artist = m && DEMO.find((d) => d.handle === m[1]);
  const j = m ? Number(m[2]) : -1;
  if (!artist || !artist.tracks[j]) return null;
  let job = synthesizing.get(key);
  if (!job) {
    job = Promise.resolve()
      .then(() => saveMediaAs(key, synthWav({ ...artist.voice, seed: artist.voice.seed + j * 7, root: artist.voice.root + j }, 30)))
      .finally(() => synthesizing.delete(key));
    synthesizing.set(key, job);
  }
  return job;
}

export async function seedIfEmpty(db: DB) {
  if (process.env.NIMSTAGE_SEED === "0") return;
  const [{ n }] = await db.select({ n: count() }).from(artists);
  if (n === 0) await seedAll(db);
  await keepDemoLive(db);
  await seedPolls(db);
}

/** Two demo polls: one open to every fan, one only for Backstage supporters. Idempotent. */
async function seedPolls(db: DB) {
  const [{ n }] = await db.select({ n: count() }).from(polls);
  if (n > 0) return;
  const mk = async (id: string, artistId: string, question: string, tierId: string | null, options: string[]) => {
    await db.insert(polls).values({ id, artistId, question, tierId });
    await db.insert(pollOptions).values(options.map((label, position) => ({ id: `${id}-o${position}`, pollId: id, label, position })));
  };
  await mk("poll-kofi-1", "a-kofistatic", "Which song should open Release Night?", null, ["Garage Sun", "Loose Wire", "Something brand new"]);
  await mk("poll-mira-1", "a-miravale", "What should I play in the next listening room?", "t-miravale-2", ["Window Seat (acoustic)", "Soft Static (live)", "An unreleased demo"]);
}

async function seedAll(db: DB) {
  await db.insert(users).values([
    { id: "demo-fan", address: "DEMO-FAN", displayName: "Demo Fan", username: "demo_fan", role: "fan" },
    { id: "demo-admin", address: "DEMO-ADMIN", displayName: "Demo Admin", username: "demo_admin", role: "admin" },
    ...DEMO.map((a) => ({ id: a.id, address: `DEMO-${a.handle.toUpperCase()}`, displayName: a.name, username: a.handle, role: "artist" as const })),
  ]);

  for (const [i, a] of DEMO.entries()) {
    await db.insert(artists).values({ id: `a-${a.handle}`, userId: a.id, handle: a.handle, name: a.name, bio: a.bio, genre: a.genre, payoutAddress: DEMO_ADDRESS, verified: a.verified });
    await db.insert(tiers).values([
      { id: `t-${a.handle}-1`, artistId: `a-${a.handle}`, name: "Front Row", perks: "Every show and track from this artist, plus supporter-only posts.", priceLuna: nimToLuna(2) },
      { id: `t-${a.handle}-2`, artistId: `a-${a.handle}`, name: "Backstage", perks: "Everything in Front Row, plus voting on the next setlist.", priceLuna: nimToLuna(3) },
    ]);
    for (const [j, [title, price]] of a.tracks.entries()) {
      const key = `demo-${a.handle}-${j}.wav`; // the audio itself is synthesized on first play: see ensureDemoMedia()
      await db.insert(tracks).values({ id: `tr-${a.handle}-${j}`, artistId: `a-${a.handle}`, title, durationSec: 30, priceLuna: nimToLuna(Number(price)), previewSec: 10, mediaKey: key, mime: "audio/wav", plays: 40 - i * 5 - j * 3 });
    }
    await db.insert(posts).values([
      { id: `p-${a.handle}-1`, artistId: `a-${a.handle}`, body: `New demos are up. Which one should open the next show? Reply in the show chat.`, tierId: null },
      { id: `p-${a.handle}-2`, artistId: `a-${a.handle}`, body: `Front Row exclusive: the unreleased voice memo behind "${a.tracks[0][0]}". Thank you for keeping this going.`, tierId: `t-${a.handle}-1` },
    ]);
  }

  await db.insert(shows).values([
    { id: "s-kofi-1", artistId: "a-kofistatic", title: "Garage Sun: Release Night", description: "A full-band premiere of the new EP, played straight through. Chat opens at doors.", startsAt: hoursFromNow(5), durationMin: 60, priceLuna: nimToLuna(3), trackId: "tr-kofistatic-0", kind: "premiere" },
    { id: "s-juno-1", artistId: "a-junohex", title: "Pulse Garden Live Set", description: "One continuous modular set. No cuts, no edits, one take.", startsAt: hoursFromNow(26), durationMin: 45, priceLuna: nimToLuna(2), trackId: "tr-junohex-0", kind: "premiere" },
    { id: "s-lantern-1", artistId: "a-paperlanterns", title: "Porch Sessions Vol. 3", description: "A free evening of songs and stories. Tips go straight to the band.", startsAt: hoursFromNow(72), durationMin: 40, priceLuna: 0, trackId: "tr-paperlanterns-0", kind: "premiere" },
    { id: "s-sable-1", artistId: "a-sablerook", title: "Rainy Tuesday: Replay", description: "The full beat tape session, now on replay.", startsAt: hoursFromNow(-30), durationMin: 30, priceLuna: nimToLuna(1), trackId: "tr-sablerook-0", kind: "premiere" },
  ]);
}

/** Keeps one always-on demo premiere live so a reviewer can always see the live state. */
async function keepDemoLive(db: DB) {
  const now = new Date();
  const live = await db
    .select({ id: shows.id, startsAt: shows.startsAt, durationMin: shows.durationMin })
    .from(shows)
    .where(and(eq(shows.artistId, "a-miravale"), eq(shows.status, "scheduled"), gt(shows.startsAt, new Date(now.getTime() - 40 * 86_400_000))));
  const active = live.some((s) => s.startsAt <= now && s.startsAt.getTime() + s.durationMin * 60_000 > now.getTime());
  if (active) return;
  await db.insert(shows).values({
    id: `s-mira-${now.getTime().toString(36)}`,
    artistId: "a-miravale",
    title: "Window Seat: Listening Room",
    description: "An always-on listening room for Mira's latest songs. Ticket holders and supporters get the full set; everyone hears a preview.",
    startsAt: new Date(now.getTime() - 10 * 60_000),
    durationMin: 60 * 24 * 7,
    priceLuna: nimToLuna(2),
    trackId: "tr-miravale-0",
    kind: "premiere",
  });
}
