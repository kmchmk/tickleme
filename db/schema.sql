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
  source text not null default 'payment' check (source in ('payment','admin')),  -- who gave the access
  granted_by text,                          -- admin email, for source = 'admin'
  note text,
  primary key (user_id, avatar_id, product, source)
);

-- Access an admin promised to an email address that has not signed up yet; applied at its first sign-in.
create table if not exists pending_grants (
  email text not null,                      -- lower case
  avatar_id text not null,
  product text not null check (product in ('taps','explicit','bundle')),
  granted_by text not null,
  note text,
  created_at timestamptz not null default now(),
  primary key (email, avatar_id, product)
);

-- Users whose pending grants have been looked at (done once, at the first sign-in).
create table if not exists grant_checks (
  user_id text primary key,
  checked_at timestamptz not null default now()
);

create table if not exists admin_audit (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor text not null,                      -- admin email
  action text not null,                     -- grant | revoke | invite | revoke_pending
  target_user_id text,
  target_email text,
  avatar_id text,
  product text,
  note text
);
