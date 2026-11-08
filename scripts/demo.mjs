// Fast local demo: build once, then serve the built app and the API from one process.
//   npm run demo      ->  http://localhost:3000
// Production mode refuses to start sessions without SESSION_SECRET, so a throwaway one is made for
// local use if you haven't set your own. Never use this script's defaults on a public server.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const env = { ...process.env };
if (!env.SESSION_SECRET) {
  env.SESSION_SECRET = randomBytes(24).toString("hex");
  console.log("No SESSION_SECRET set: using a throwaway one for this local run.");
}
env.PORT ??= "3000";

console.log("Building…");
const build = spawnSync("npm", ["run", "build"], { stdio: "inherit", shell: true, env });
if (build.status !== 0) process.exit(build.status ?? 1);

console.log(`\nStarting on http://localhost:${env.PORT}`);
const server = spawn("npm", ["start"], { stdio: "inherit", shell: true, env });
server.on("exit", (code) => process.exit(code ?? 0));
