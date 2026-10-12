import "server-only";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { objectKey } from "./avatars";
import { PRIVATE_BUCKET, PUBLIC_BASE } from "./config";
import type { VariantDef } from "./types";

let client: S3Client | null = null;
function s3(): S3Client {
  const { NEON_S3_ENDPOINT: endpoint, NEON_S3_ACCESS_KEY_ID: accessKeyId, NEON_S3_SECRET_ACCESS_KEY: secretAccessKey } = process.env;
  if (!endpoint || !accessKeyId || !secretAccessKey) throw new Error("Private storage is not configured");
  return (client ??= new S3Client({
    endpoint,
    region: process.env.NEON_S3_REGION ?? "ap-southeast-1",
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  }));
}

/** A URL the browser can fetch a variant file from: direct if public, short-lived signed link if private. */
export async function fileUrl(v: VariantDef, file: string, ttlSeconds = 900): Promise<string> {
  const key = objectKey(v, file);
  if (v.bucket === "public") return `${PUBLIC_BASE}/${key}`;
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: PRIVATE_BUCKET, Key: key }), { expiresIn: ttlSeconds });
}
