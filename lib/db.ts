import "server-only";
import { neon } from "@neondatabase/serverless";
import fs from "node:fs";
import path from "node:path";

export type Row = Record<string, unknown>;
type Query = (text: string, params?: unknown[]) => Promise<Row[]>;

const g = globalThis as unknown as { __db?: Promise<Query> };

async function connect(): Promise<Query> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const sql = neon(url);
    return (text, params = []) => sql.query(text, params) as Promise<Row[]>;
  }
  if (process.env.NODE_ENV === "production") throw new Error("DATABASE_URL is not configured");
  // Local development / tests only: an in-memory Postgres with the same schema.
  const modName = "@electric-sql/pglite";
  const { PGlite } = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ modName);
  const db = new PGlite();
  await db.exec(fs.readFileSync(path.join(process.cwd(), "db/schema.sql"), "utf8"));
  return async (text, params = []) => (await db.query(text, params)).rows as Row[];
}

/** Run a parameterised query ($1, $2, ...) and get the rows back. */
export async function query(text: string, params: unknown[] = []): Promise<Row[]> {
  g.__db ??= connect();
  return (await g.__db)(text, params);
}

export const dbConfigured = () => !!process.env.DATABASE_URL || process.env.NODE_ENV !== "production";
