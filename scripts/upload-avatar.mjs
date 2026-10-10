// Upload an avatar's clips to Vercel Blob (public store).
// Usage: BLOB_READ_WRITE_TOKEN=... node scripts/upload-avatar.mjs <avatar-id> <dir-with-clips>
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";

const [id, dir] = process.argv.slice(2);
if (!id || !dir || !process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("Usage: BLOB_READ_WRITE_TOKEN=... node scripts/upload-avatar.mjs <avatar-id> <dir>");
  process.exit(1);
}

const types = { ".mp4": "video/mp4", ".webm": "video/webm", ".jpg": "image/jpeg", ".png": "image/png" };
for (const file of await readdir(dir)) {
  const contentType = types[path.extname(file).toLowerCase()];
  if (!contentType) continue;
  const blob = await put(`avatars/${id}/${file}`, await readFile(path.join(dir, file)), {
    access: "public",
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  console.log(blob.url);
}
console.log("\nSet NEXT_PUBLIC_ASSET_BASE_URL to the origin of the URLs above.");
