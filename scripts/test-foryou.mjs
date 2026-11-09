// "For you": what the artists you follow are doing, shown first.
//   PGLITE_DIR=.data/test-foryou NIMSTAGE_DEMO=1 DATABASE_URL= S3_BUCKET= PORT=3012 npx tsx server/index.ts
//   BASE=http://localhost:3012 node scripts/test-foryou.mjs
const base = process.env.BASE ?? "http://localhost:3012";
const post = async (path, body, token) => {
  const r = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  return { status: r.status, ...(await r.json().catch(() => ({}))) };
};
const get = async (path, token) => {
  const r = await fetch(base + path, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { status: r.status, ...(await r.json().catch(() => ({}))) };
};
let failed = 0;
const check = (name, pass, extra = "") => {
  if (!pass) failed++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${pass ? "" : "  " + extra}`);
};

const fan = (await post("/api/auth/demo", { persona: "fan" })).token;
const artist = (await post("/api/auth/demo", { persona: "artist" })).token;

// who the artist persona is, and what the home page lists
const home = await get("/api/home");
const lineup = home.lineup ?? [];
const mira = lineup.find((a) => a.handle === "miravale") ?? lineup[0];
check("the demo data has artists to follow", !!mira, JSON.stringify(Object.keys(home)));

const none = await get("/api/me/foryou", fan);
check("following nobody: an empty For you, no dot", none.status === 200 && none.following === 0 && none.fresh === 0 && none.live.length === 0 && none.tracks.length === 0, JSON.stringify(none).slice(0, 200));
check("For you needs you to be signed in", (await get("/api/me/foryou")).status === 401);

// the artist posts something public and a new track appears via the seed; follow and look again
const { id: showId } = await post("/api/studio/shows", { title: "Follow Test Live", description: "", startsAt: new Date(Date.now() - 60_000).toISOString(), durationMin: 30, priceNim: 0, kind: "live" }, artist);
check("the artist can schedule a show that is live right now", !!showId);
await post("/api/studio/posts", { body: "A public post for followers", tierId: null }, artist);

const before = await get("/api/me/foryou", fan);
check("not following yet: their live show is NOT in For you", !before.live.some((s) => s.id === showId));

check("following an artist works", (await post("/api/follow", { artistId: mira.id }, fan)).following === true);
const t0 = new Date(Date.now() - 3_600_000).toISOString();
const fy = await get(`/api/me/foryou?since=${encodeURIComponent(t0)}`, fan);
check("now their live show is in For you, first", fy.live.some((s) => s.id === showId), JSON.stringify(fy.live.map((s) => s.title)));
check("the followed artist's id is returned (used to sort Discover and Library)", fy.ids.includes(mira.id));
check("their public post is there", fy.posts.some((p) => p.post.body.includes("public post")), JSON.stringify(fy.posts).slice(0, 200));
check("something new is counted (the dot)", fy.fresh >= 1, "fresh=" + fy.fresh);
check("other artists' shows are not mixed in", fy.live.every((s) => fy.ids.includes(s.artistId)) && fy.upcoming.every((s) => fy.ids.includes(s.artistId)));
check("no wallet addresses of other users leak through posts", !JSON.stringify(fy.posts).includes('"userId"'));

const later = await get(`/api/me/foryou?since=${encodeURIComponent(new Date(Date.now() + 60_000).toISOString())}`, fan);
check("after looking (since = later), nothing counts as new any more, so the dot clears", later.fresh === 0 && later.live.some((s) => s.id === showId), "fresh=" + later.fresh);

check("unfollowing removes it again", (await post("/api/follow", { artistId: mira.id }, fan)).following === false && (await get("/api/me/foryou", fan)).following === 0);

console.log(failed ? `\n${failed} check(s) failed` : "\nAll For-you checks passed.");
process.exit(failed ? 1 : 0);
