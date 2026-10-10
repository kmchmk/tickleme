// Upload an avatar's clips to the public Neon storage bucket (S3-compatible).
// Usage:
//   NEON_S3_ENDPOINT=https://<branch>.storage.<region>.aws.neon.tech \
//   NEON_S3_ACCESS_KEY_ID=... NEON_S3_SECRET_ACCESS_KEY=... \
//   node scripts/upload-avatar.mjs <avatar-id> <dir-with-clips> [bucket=avatars-free]
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const [id, dir, bucket = "avatars-free"] = process.argv.slice(2);
const { NEON_S3_ENDPOINT: endpoint, NEON_S3_ACCESS_KEY_ID, NEON_S3_SECRET_ACCESS_KEY } = process.env;
if (!id || !dir || !endpoint || !NEON_S3_ACCESS_KEY_ID || !NEON_S3_SECRET_ACCESS_KEY) {
  console.error("See usage at the top of scripts/upload-avatar.mjs");
  process.exit(1);
}

const s3 = new S3Client({
  endpoint,
  region: process.env.NEON_S3_REGION ?? "ap-southeast-1",
  forcePathStyle: true,
  credentials: { accessKeyId: NEON_S3_ACCESS_KEY_ID, secretAccessKey: NEON_S3_SECRET_ACCESS_KEY },
});

const types = { ".mp4": "video/mp4", ".webm": "video/webm", ".jpg": "image/jpeg", ".png": "image/png" };
for (const file of await readdir(dir)) {
  const ContentType = types[path.extname(file).toLowerCase()];
  if (!ContentType) continue;
  const Key = `avatars/${id}/${file}`;
  await s3.send(
    new PutObjectCommand({ Bucket: bucket, Key, Body: await readFile(path.join(dir, file)), ContentType }),
  );
  console.log(`${endpoint}/${bucket}/${Key}`);
}
