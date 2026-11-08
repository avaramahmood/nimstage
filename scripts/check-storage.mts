// Proves the configured media storage works end to end: write, size, ranged read, delete.
//   npx tsx --env-file=.env.local scripts/check-storage.mts
// Uses a throwaway key and removes it afterwards. Prints no secrets.
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { mediaSize, openMedia, saveMediaAs } from "../server/lib/storage";

const where = process.env.S3_BUCKET ? `S3 bucket "${process.env.S3_BUCKET}"` : "local disk";
const key = `healthcheck-${randomUUID()}.txt`;
const data = Buffer.from("NimStage storage check 0123456789");

console.log(`Storage: ${where}`);
await saveMediaAs(key, data);
console.log("PASS  write");
assert.equal(await mediaSize(key), data.length);
console.log("PASS  size matches");
const chunks: Buffer[] = [];
for await (const c of (await openMedia(key, 8, 14)) as unknown as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(c));
assert.equal(Buffer.concat(chunks).toString(), data.subarray(8, 15).toString());
console.log("PASS  ranged read (what audio seeking uses)");

if (process.env.S3_BUCKET) {
  const { S3Client, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  await new S3Client({
    region: process.env.S3_REGION ?? "auto",
    endpoint: process.env.S3_ENDPOINT,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! },
  }).send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
  assert.equal(await mediaSize(key), null);
  console.log("PASS  delete");
} else {
  const { rm } = await import("node:fs/promises");
  await rm(`${process.env.MEDIA_DIR ?? "./.data/media"}/${key}`, { force: true });
}
console.log("Storage OK");
