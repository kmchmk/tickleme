/** Central place for environment-driven switches. Everything degrades gracefully when unset. */

import { AUTH_ENABLED as PUBLIC_AUTH } from "./config-public";

/** Clerk sign-in is on only when its publishable key is configured. */
export const AUTH_ENABLED = PUBLIC_AUTH;

/** Base of the PUBLIC bucket, e.g. https://<endpoint>/avatars-free (empty = /public). */
export const PUBLIC_BASE = (process.env.NEXT_PUBLIC_ASSET_BASE_URL ?? "").replace(/\/$/, "");

export const PRIVATE_BUCKET = process.env.PRIVATE_BUCKET ?? "avatars-private";

/** Solana: the wallet that receives payments (public address) and the USDC mint. */
export const SOLANA_RECIPIENT = process.env.SOLANA_RECIPIENT ?? "";
export const USDC_MINT = process.env.USDC_MINT ?? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // mainnet USDC
export const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

/** Payments need a recipient wallet and a database to record orders. */
export const paymentsConfigured = () => !!SOLANA_RECIPIENT && !!process.env.DATABASE_URL;

/** The fake "pay" button only ever exists outside production. */
export const MOCK_PAYMENTS = process.env.NODE_ENV !== "production" && process.env.PAYMENTS_MOCK === "1";

export const ORDER_TTL_MINUTES = 30;
