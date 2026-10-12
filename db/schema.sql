-- Applied to the Neon database (and to the in-memory dev database). Idempotent.
create table if not exists profiles (
  user_id text primary key,                 -- Clerk user id
  age_confirmed_at timestamptz,             -- set when the user clicked "I'm 18+"
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  avatar_id text not null,
  product text not null check (product in ('taps','explicit','bundle')),
  amount_micro bigint not null check (amount_micro > 0),   -- USDC, 6 decimals
  reference text not null unique,           -- Solana Pay reference public key
  status text not null default 'pending' check (status in ('pending','paid')),
  tx_signature text unique,                 -- a payment can only ever fulfil one order
  payer text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,          -- UI hint only; late payments are still honoured
  paid_at timestamptz
);
create index if not exists orders_user_idx on orders (user_id, created_at desc);

create table if not exists entitlements (
  user_id text not null,
  avatar_id text not null,
  product text not null check (product in ('taps','explicit','bundle')),
  order_id uuid references orders(id),
  created_at timestamptz not null default now(),
  primary key (user_id, avatar_id, product)
);
