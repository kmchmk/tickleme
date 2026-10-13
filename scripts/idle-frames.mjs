#!/usr/bin/env node
// Writes the first frame of every outfit's idle video to <outdir>/<set>.png, for scripts/gen-zones.py.
// Needs ffmpeg and a read credential: NEON_S3_ENDPOINT, NEON_S3_ACCESS_KEY_ID, NEON_S3_SECRET_ACCESS_KEY.
//   node scripts/idle-frames.mjs <outdir>
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { NEON_S3_ENDPOINT: endpoint, NEON_S3_ACCESS_KEY_ID: accessKeyId, NEON_S3_SECRET_ACCESS_KEY: secretAccessKey } = process.env;
const out = process.argv[2];
if (!endpoint || !accessKeyId || !secretAccessKey || !out) {
  console.error("usage: NEON_S3_* set; node scripts/idle-frames.mjs <outdir>");
  process.exit(1);
}
mkdirSync(out, { recursive: true });
const s3 = new S3Client({ endpoint, region: "ap-southeast-1", forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });
const tmp = mkdtempSync(join(tmpdir(), "idle-"));
const dir = new URL("../content/avatars/", import.meta.url);
for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const avatar = JSON.parse(readFileSync(new URL(f, dir), "utf8"));
  for (const v of Object.values(avatar.variants)) {
    const Bucket = v.bucket === "public" ? "avatars-free" : "avatars-private";
    const g = await s3.send(new GetObjectCommand({ Bucket, Key: `avatars/${v.set}/${v.idle}` }));
    const mp4 = join(tmp, `${v.set}.mp4`);
    writeFileSync(mp4, Buffer.from(await g.Body.transformToByteArray()));
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", mp4, "-frames:v", "1", join(out, `${v.set}.png`)]);
    console.log("frame", v.set);
  }
}
rmSync(tmp, { recursive: true, force: true });
