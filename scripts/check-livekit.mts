// Proves the LiveKit keys work: asks LiveKit Cloud to list rooms with a signed request. Prints no secrets.
//   npx tsx --env-file=.env.local scripts/check-livekit.mts
import { RoomServiceClient } from "livekit-server-sdk";

const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  console.error("Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET first.");
  process.exit(1);
}
const svc = new RoomServiceClient(LIVEKIT_URL.replace(/^wss:/, "https:"), LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
const rooms = await svc.listRooms();
console.log(`PASS  LiveKit accepted the keys (${rooms.length} active room${rooms.length === 1 ? "" : "s"})`);
