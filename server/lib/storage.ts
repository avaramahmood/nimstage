import { createReadStream } from "node:fs";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

/**
 * Media store. Two backends, chosen by env:
 *  - S3-compatible (Cloudflare R2, AWS S3, MinIO) when S3_BUCKET is set. Use this on serverless hosts.
 *  - Local disk otherwise (./.data/media), which is for development and single-server hosting.
 * The rest of the app only uses saveMedia / saveMediaAs / mediaSize / openMedia.
 * NOTE: the S3 backend is written to the AWS SDK's documented API but has not been run against a live bucket.
 */
const ROOT = path.resolve(process.env.MEDIA_DIR ?? "./.data/media");
const BUCKET = process.env.S3_BUCKET;

export const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;
/**
  Uploaded audio is MP3 only. One format everywhere keeps playback, seeking and the byte-based preview limit
  predictable on every device. The file is checked by what is inside it, not just by its name or declared type.
*/
export const AUDIO_EXT = "mp3";
export const AUDIO_MIME = "audio/mpeg";
const MP3_TYPES = new Set(["audio/mpeg", "audio/mp3", "audio/x-mpeg", "audio/mpeg3", "audio/x-mpeg-3"]);
const GENERIC_TYPES = new Set(["", "application/octet-stream", "binary/octet-stream"]);

/** Declared as MP3, or (some phones send no type) generic with a .mp3 name. Anything else is refused. */
export function isMp3Upload(file: { type: string; name: string }): boolean {
  const t = file.type.toLowerCase();
  return MP3_TYPES.has(t) || (GENERIC_TYPES.has(t) && /\.mp3$/i.test(file.name));
}

/** Looks inside: an optional ID3 tag, then an MPEG Layer III frame header within the first 8 KB. */
export function looksLikeMp3(buf: Buffer): boolean {
  let start = 0;
  if (buf.length >= 10 && buf.toString("latin1", 0, 3) === "ID3") start = 10 + (((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f));
  const end = Math.min(buf.length - 3, start + 8192);
  for (let i = start; i < end; i++) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) continue; // frame sync
    const version = (buf[i + 1] >> 3) & 3;
    const layer = (buf[i + 1] >> 1) & 3;
    const bitrate = buf[i + 2] >> 4;
    const rate = (buf[i + 2] >> 2) & 3;
    if (version !== 1 && layer === 1 && bitrate !== 15 && rate !== 3) return true; // not reserved; Layer III; sane bitrate and sample rate
  }
  return false;
}

let s3Client: Promise<import("@aws-sdk/client-s3").S3Client> | undefined;
async function s3() {
  s3Client ??= import("@aws-sdk/client-s3").then(
    ({ S3Client }) =>
      new S3Client({
        region: process.env.S3_REGION ?? "auto",
        endpoint: process.env.S3_ENDPOINT, // e.g. https://<account>.r2.cloudflarestorage.com
        forcePathStyle: true,
        credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "", secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "" },
      }),
  );
  return s3Client;
}

const safeKey = (key: string) => path.basename(key);

export async function saveMediaAs(key: string, data: Buffer): Promise<void> {
  const k = safeKey(key);
  if (BUCKET) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await (await s3()).send(new PutObjectCommand({ Bucket: BUCKET, Key: k, Body: data }));
    return;
  }
  await mkdir(ROOT, { recursive: true });
  await writeFile(path.join(ROOT, k), data);
}

export async function saveMedia(data: Buffer, ext: string): Promise<string> {
  const key = `${randomUUID()}.${ext}`;
  await saveMediaAs(key, data);
  return key;
}

/** Best-effort removal (replaced or removed artwork). A missing file is fine. */
export async function deleteMedia(key: string): Promise<void> {
  const k = safeKey(key);
  try {
    if (BUCKET) {
      const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
      await (await s3()).send(new DeleteObjectCommand({ Bucket: BUCKET, Key: k }));
    } else await unlink(path.join(ROOT, k));
  } catch {
    /* already gone */
  }
}

export async function mediaSize(key: string): Promise<number | null> {
  const k = safeKey(key);
  try {
    if (BUCKET) {
      const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
      const head = await (await s3()).send(new HeadObjectCommand({ Bucket: BUCKET, Key: k }));
      return head.ContentLength ?? null;
    }
    return (await stat(path.join(ROOT, k))).size;
  } catch {
    return null;
  }
}

/** Streams bytes [start, end] (inclusive) of a stored file. */
export async function openMedia(key: string, start: number, end: number): Promise<ReadableStream> {
  const k = safeKey(key);
  if (BUCKET) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const res = await (await s3()).send(new GetObjectCommand({ Bucket: BUCKET, Key: k, Range: `bytes=${start}-${end}` }));
    if (!res.Body) throw new Error("Empty media body");
    return res.Body.transformToWebStream();
  }
  return Readable.toWeb(createReadStream(path.join(ROOT, k), { start, end })) as unknown as ReadableStream;
}
