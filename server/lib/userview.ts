import type { SessionUser } from "./session";

/**
  What the client is told about the signed-in user. `needsUsername` drives the setup screen: everyone needs a
  public @username, and accounts created before usernames existed are asked to pick one on their next visit.
*/
export function sessionUserView(u: SessionUser) {
  return {
    id: u.id,
    name: u.displayName,
    username: u.username,
    avatarKey: u.avatarKey,
    accent: u.accent,
    role: u.role,
    address: u.address,
    needsUsername: !u.username,
  };
}
