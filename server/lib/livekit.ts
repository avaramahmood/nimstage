// LiveKit Cloud: live video rooms. The server only ever mints short-lived tokens; the browser talks to
// LiveKit directly. Who gets a token (and whether it can publish) is decided in routes/shows.ts using
// the same access rules as everything else.
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

export const livekitConfigured = () => !!(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);

export const roomFor = (showId: string) => `show-${showId}`;

export async function mintToken(opts: { showId: string; identity: string; name: string; host: boolean; ttlSec: number }): Promise<string> {
  const at = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, { identity: opts.identity, name: opts.name, ttl: opts.ttlSec });
  at.addGrant({
    room: roomFor(opts.showId),
    roomJoin: true,
    canSubscribe: true,
    // Only the artist can send media. Chat and reactions use the app's own endpoints, not LiveKit data.
    canPublish: opts.host,
    canPublishData: false,
  });
  return at.toJwt();
}

/** Closes the room, which disconnects everyone. Used when the artist ends the stream. */
export async function endRoom(showId: string): Promise<void> {
  const http = process.env.LIVEKIT_URL!.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
  const svc = new RoomServiceClient(http, process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!);
  try {
    await svc.deleteRoom(roomFor(showId));
  } catch {
    // The room may already be gone (nobody joined, or it timed out): that is the state we wanted.
  }
}
