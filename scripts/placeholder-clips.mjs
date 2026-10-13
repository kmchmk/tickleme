#!/usr/bin/env node
// Fills in clips that don't exist yet by copying a nearby older clip (content/placeholder-clips.json),
// inside the same bucket. Never overwrites a clip that already exists, so real clips uploaded later win.
// Then, with --prune, deletes the obsolete numbered clips that no zone uses any more.
//
//   node scripts/placeholder-clips.mjs [--prune]
//
// Needs NEON_S3_ENDPOINT, NEON_S3_ACCESS_KEY_ID, NEON_S3_SECRET_ACCESS_KEY (never commit them).
import { CopyObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { readFileSync, readdirSync } from "node:fs";

const { NEON_S3_ENDPOINT: endpoint, NEON_S3_ACCESS_KEY_ID: accessKeyId, NEON_S3_SECRET_ACCESS_KEY: secretAccessKey } = process.env;
if (!endpoint || !accessKeyId || !secretAccessKey) {
  console.error("Set NEON_S3_ENDPOINT, NEON_S3_ACCESS_KEY_ID and NEON_S3_SECRET_ACCESS_KEY.");
  process.exit(1);
}
const s3 = new S3Client({ endpoint, region: "ap-southeast-1", forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });
const placeholders = JSON.parse(readFileSync(new URL("../content/placeholder-clips.json", import.meta.url), "utf8"));
const prune = process.argv.includes("--prune");

const exists = (Bucket, Key) => s3.send(new HeadObjectCommand({ Bucket, Key })).then(() => true, () => false);
const bucketOf = (v) => (v.bucket === "public" ? "avatars-free" : "avatars-private");

const dir = new URL("../content/avatars/", import.meta.url);
for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const avatar = JSON.parse(readFileSync(new URL(f, dir), "utf8"));
  for (const v of Object.values(avatar.variants)) {
    const Bucket = bucketOf(v);
    const base = `avatars/${v.set}/`;
    const wanted = new Set(v.actions.map((a) => a.video));
    let copied = 0, kept = 0;
    for (const file of wanted) {
      const Key = base + file;
      if (await exists(Bucket, Key)) { kept++; continue; }
      const src = placeholders[file.replace(/\.mp4$/, "")];
      await s3.send(new CopyObjectCommand({ Bucket, Key, CopySource: `${Bucket}/${base}${src}.mp4` }));
      copied++;
    }
    let pruned = 0;
    if (prune) {
      const l = await s3.send(new ListObjectsV2Command({ Bucket, Prefix: base }));
      for (const o of l.Contents ?? []) {
        const name = o.Key.slice(base.length);
        if (/^\d\d-.*\.mp4$/.test(name) && !wanted.has(name)) { await s3.send(new DeleteObjectCommand({ Bucket, Key: o.Key })); pruned++; }
      }
    }
    console.log(`${avatar.id} ${v.set}: ${copied} placeholder copies, ${kept} already present${prune ? `, ${pruned} obsolete removed` : ""}`);
  }
}
