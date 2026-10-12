#!/usr/bin/env node
// Maintenance tool for the Neon storage buckets (S3 API). Needs a credential with
// storage:read + storage:write, passed as environment variables (never commit them):
//   NEON_S3_ENDPOINT, NEON_S3_ACCESS_KEY_ID, NEON_S3_SECRET_ACCESS_KEY [, NEON_S3_REGION]
//
//   node scripts/bucket.mjs ls  <bucket> [prefix]
//   node scripts/bucket.mjs cp  <srcBucket> <dstBucket> <prefix> [excludeRegex]   copy + verify sizes
//   node scripts/bucket.mjs mv  <srcBucket> <dstBucket> <prefix> [excludeRegex]   copy, verify, then delete the source
//   node scripts/bucket.mjs rm  <bucket> <prefix> [keepRegex]
//
// Buckets: avatars-free (public), avatars-private (signed links only), avatars-inbox (private landing zone).
import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const { NEON_S3_ENDPOINT: endpoint, NEON_S3_ACCESS_KEY_ID: accessKeyId, NEON_S3_SECRET_ACCESS_KEY: secretAccessKey } = process.env;
if (!endpoint || !accessKeyId || !secretAccessKey) {
  console.error("Set NEON_S3_ENDPOINT, NEON_S3_ACCESS_KEY_ID and NEON_S3_SECRET_ACCESS_KEY.");
  process.exit(1);
}
const s3 = new S3Client({ endpoint, region: process.env.NEON_S3_REGION ?? "ap-southeast-1", forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });

async function list(Bucket, Prefix = "") {
  const out = [];
  let ContinuationToken;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket, Prefix, ContinuationToken }));
    out.push(...(r.Contents ?? []));
    ContinuationToken = r.NextContinuationToken;
  } while (ContinuationToken);
  return out;
}

async function copy(src, dst, prefix, exclude) {
  let n = 0;
  for (const o of await list(src, prefix)) {
    if (exclude && new RegExp(exclude).test(o.Key)) continue;
    if (o.Size === 0 && o.Key.endsWith("Placeholder")) continue;
    try {
      await s3.send(new CopyObjectCommand({ Bucket: dst, Key: o.Key, CopySource: `${src}/${o.Key}` }));
    } catch {
      const g = await s3.send(new GetObjectCommand({ Bucket: src, Key: o.Key }));
      await s3.send(new PutObjectCommand({ Bucket: dst, Key: o.Key, Body: Buffer.from(await g.Body.transformToByteArray()), ContentType: g.ContentType }));
    }
    const h = await s3.send(new HeadObjectCommand({ Bucket: dst, Key: o.Key }));
    if (h.ContentLength !== o.Size) throw new Error(`size mismatch for ${o.Key}`);
    n++;
  }
  return n;
}

async function remove(bucket, prefix, keep) {
  let n = 0;
  for (const o of await list(bucket, prefix)) {
    if (keep && new RegExp(keep).test(o.Key)) continue;
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: o.Key }));
    n++;
  }
  return n;
}

const [cmd, ...a] = process.argv.slice(2);
if (cmd === "ls") for (const o of await list(a[0], a[1])) console.log(String(o.Size).padStart(9), o.Key);
else if (cmd === "cp") console.log(`copied + verified ${await copy(a[0], a[1], a[2], a[3])} objects`);
else if (cmd === "mv") {
  const n = await copy(a[0], a[1], a[2], a[3]);
  // anything excluded from the copy is also left in place at the source
  console.log(`copied + verified ${n} objects; deleted ${await remove(a[0], a[2], a[3])} from the source`);
} else if (cmd === "rm") console.log(`deleted ${await remove(a[0], a[1], a[2])} objects`);
else console.log("usage: ls | cp | mv | rm (see the header of this file)");
