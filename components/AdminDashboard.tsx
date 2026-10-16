"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AdminOrder, AdminStats, AdminUser, UserFilter } from "@/lib/admin";
import type { Product } from "@/lib/types";

type Avatar = { id: string; name: string };
type Pending = { email: string; avatar_id: string; product: Product; granted_by: string; note: string | null; created_at: string };
type Audit = { at: string; actor: string; action: string; target_email: string | null; target_user_id: string | null; avatar_id: string | null; product: string | null; note: string | null };
type Health = {
  configured: boolean;
  mock: boolean;
  rpcConfigured: boolean;
  siteUrl: string | null;
  health: { recipientValid?: boolean; rpcOk?: boolean; rpcPublic?: boolean; rpcHost?: string; tokenAccounts?: string[]; balanceUsdc?: string; error?: string } | null;
};
type Tab = "overview" | "people" | "orders" | "activity";
type Toast = { id: number; text: string; ok: boolean; undo?: () => void };

const PRODUCT_LABEL: Record<Product, string> = { taps: "More taps", explicit: "Explicit", bundle: "Bundle" };
const PRODUCTS: Product[] = ["explicit", "taps", "bundle"];

function ago(v: string | number | null | undefined): string {
  if (!v) return "—";
  const s = (Date.now() - new Date(v).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(v).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

const initials = (u: { email: string; name: string }) => (u.name || u.email || "?").replace(/[^a-zA-Z0-9]/g, " ").trim().slice(0, 1).toUpperCase() || "?";
const short = (s: string, n = 6) => (s.length > n * 2 + 1 ? `${s.slice(0, n)}…${s.slice(-n)}` : s);

async function getJSON<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { cache: "no-store" }).catch(() => null);
  return res?.ok ? ((await res.json()) as T) : null;
}

async function post(body: Record<string, unknown>): Promise<{ ok: boolean; message?: string; error?: string }> {
  const res = await fetch("/api/admin/grants", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (!res) return { ok: false, error: "No connection." };
  return res.json().catch(() => ({ ok: false, error: "Unexpected response." }));
}

function Icon({ d, className = "adm-ico" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d={d} />
    </svg>
  );
}
const I = {
  overview: "M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 4v3h6V4z",
  people: "M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.15a3.5 3.5 0 0 1 0 6.7",
  orders: "M4 7h16v12H4zM4 11h16M8 15h3",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  plus: "M12 5v14M5 12h14",
  close: "M6 6l12 12M18 6 6 18",
  ok: "m5 12.5 4.5 4.5L19 7",
  warn: "M12 8v5M12 17h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20 20l-4-4",
  ext: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  back: "M15 18l-6-6 6-6",
};

/* ---------------------------------------------------------------- shell */

export default function AdminDashboard({ email, meId, avatars }: { email: string; meId: string; avatars: Avatar[] }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [openUser, setOpenUser] = useState<string | null>(null);
  const [giving, setGiving] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [version, setVersion] = useState(0); // bumped after any change so every view reloads
  const avatarName = useCallback((id: string | null) => (id === "*" ? "All avatars" : (avatars.find((a) => a.id === id)?.name ?? id ?? "")), [avatars]);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((x) => [...x.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), t.undo ? 6000 : 3500);
  }, []);
  const changed = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    const fromHash = location.hash.slice(1) as Tab;
    if (["overview", "people", "orders", "activity"].includes(fromHash)) setTab(fromHash);
  }, []);
  const go = (t: Tab) => {
    setTab(t);
    history.replaceState(null, "", `#${t}`);
    window.scrollTo({ top: 0 });
  };

  const ctx = { avatars, avatarName, meId, toast, changed, version, openUser: setOpenUser };

  return (
    <div className="adm">
      <header className="adm-top">
        <Link href="/" className="adm-brand" aria-label="Back to the site">
          <Icon d={I.back} />
          <span>
            Tickle Me <em>Admin</em>
          </span>
        </Link>
        <span className="adm-me" title={email}>
          {email}
        </span>
      </header>

      <nav className="adm-tabs" aria-label="Sections">
        {(["overview", "people", "orders", "activity"] as Tab[]).map((t) => (
          <button key={t} type="button" className={`adm-tab ${tab === t ? "adm-tab--on" : ""}`} aria-current={tab === t ? "page" : undefined} onClick={() => go(t)}>
            <Icon d={I[t]} />
            <span>{t[0].toUpperCase() + t.slice(1)}</span>
          </button>
        ))}
      </nav>

      <main className="adm-main">
        {tab === "overview" && <Overview {...ctx} goOrders={() => go("orders")} />}
        {tab === "people" && <People {...ctx} />}
        {tab === "orders" && <Orders {...ctx} />}
        {tab === "activity" && <Activity {...ctx} />}
      </main>

      <button type="button" className="adm-fab" onClick={() => setGiving(true)}>
        <Icon d={I.plus} />
        <span>Give access</span>
      </button>

      {openUser && <UserSheet key={openUser} userId={openUser} onClose={() => setOpenUser(null)} {...ctx} />}
      {giving && <GiveSheet onClose={() => setGiving(false)} {...ctx} />}

      <div className="adm-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`adm-toast ${t.ok ? "" : "adm-toast--bad"}`}>
            <span>{t.text}</span>
            {t.undo && (
              <button
                type="button"
                onClick={() => {
                  t.undo!();
                  setToasts((x) => x.filter((y) => y.id !== t.id));
                }}
              >
                Undo
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

type Ctx = {
  avatars: Avatar[];
  avatarName: (id: string | null) => string;
  meId: string;
  toast: (t: Omit<Toast, "id">) => void;
  changed: () => void;
  version: number;
  openUser: (id: string) => void;
};

/* ---------------------------------------------------------------- overview */

function Overview({ version, avatarName, openUser, goOrders }: Ctx & { goOrders: () => void }) {
  const [data, setData] = useState<{ stats: AdminStats; sales: AdminOrder[]; pending: Pending[] } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    void getJSON<{ stats: AdminStats; sales: AdminOrder[]; pending: Pending[] }>("/api/admin/overview").then((d) => (d ? setData(d) : setFailed(true)));
  }, [version]);
  const s = data?.stats;
  const tiles: { label: string; value: string; sub?: string; strong?: boolean }[] = s
    ? [
        { label: "Revenue · 30 days", value: `${s.revenue30Usdc}`, sub: `USDC · ${s.revenueUsdc} all time`, strong: true },
        { label: "Sales · 30 days", value: String(s.sales30), sub: `${s.sales} all time` },
        { label: "People", value: s.users == null ? "—" : String(s.users), sub: `${s.adults} confirmed 18+${s.invites ? ` · ${s.invites} invited` : ""}` },
        { label: "Paying", value: String(s.paying), sub: `${s.granted} with granted access` },
        { label: "Open orders · 24 h", value: String(s.pending24), sub: "started, not paid yet" },
      ]
    : [];
  return (
    <div className="adm-stack">
      {failed && <p className="adm-error">Couldn&apos;t load the numbers. Pull to refresh or try again.</p>}
      <section className="adm-stats" aria-busy={!data}>
        {data
          ? tiles.map((t) => (
              <div key={t.label} className={`adm-stat ${t.strong ? "adm-stat--strong" : ""}`}>
                <span className="adm-stat-label">{t.label}</span>
                <strong className="adm-stat-value">{t.value}</strong>
                {t.sub && <span className="adm-stat-sub">{t.sub}</span>}
              </div>
            ))
          : Array.from({ length: 5 }, (_, i) => <div key={i} className={`adm-stat adm-skel ${i ? "" : "adm-stat--strong"}`} />)}
      </section>

      <PaymentsHealth version={version} />

      <section className="adm-card">
        <div className="adm-card-head">
          <h2>Recent sales</h2>
          <button type="button" className="adm-link" onClick={goOrders}>
            All orders
          </button>
        </div>
        {!data ? (
          <ListSkeleton />
        ) : data.sales.length === 0 ? (
          <p className="adm-empty">No sales yet. They show up here the moment a payment lands.</p>
        ) : (
          <ul className="adm-list">
            {data.sales.map((o) => (
              <OrderRow key={o.id} o={o} avatarName={avatarName} onUser={openUser} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PaymentsHealth({ version }: { version: number }) {
  const [h, setH] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    void getJSON<Health>("/api/admin/health").then((d) => {
      setH(d);
      setLoading(false);
    });
  }, []);
  useEffect(load, [load, version]);
  const x = h?.health;
  const rows: { ok: boolean | "info"; title: string; text: string }[] = [];
  if (h && !h.configured)
    rows.push({ ok: false, title: "Receiving wallet", text: "SOLANA_RECIPIENT is not set, so nobody can pay yet. Add your Solana wallet address in Vercel → Settings → Environment Variables." });
  if (h?.configured && x) {
    rows.push({ ok: !!x.recipientValid, title: "Receiving wallet", text: x.recipientValid ? "Valid Solana address." : "SOLANA_RECIPIENT is not a valid Solana address." });
    rows.push(
      x.tokenAccounts?.length
        ? { ok: true, title: "USDC account", text: `Ready · balance ${x.balanceUsdc ?? "?"} USDC` }
        : { ok: "info", title: "USDC account", text: "Not created yet. The first buyer's wallet creates it (a tiny one-off SOL fee for them). Receiving any USDC once avoids that." },
    );
    rows.push(
      !x.rpcOk
        ? { ok: false, title: "Solana connection", text: `Can't reach ${x.rpcHost ?? "the RPC"}${x.error ? `: ${x.error}` : ""}` }
        : x.rpcPublic
          ? { ok: "info", title: "Solana connection", text: "Using the free public endpoint, which rate-limits. Set SOLANA_RPC_URL to a Helius (free tier) URL for reliable checks." }
          : { ok: true, title: "Solana connection", text: `Connected (${x.rpcHost})` },
    );
  }
  if (h && !h.siteUrl) rows.push({ ok: "info", title: "Site address", text: "NEXT_PUBLIC_SITE_URL is not set. Set it to your domain (https://…) for search engines and link previews." });
  if (h?.mock) rows.push({ ok: "info", title: "Test mode", text: "Simulated payments are on (development only)." });
  const bad = rows.some((r) => r.ok === false);
  return (
    <section className="adm-card">
      <div className="adm-card-head">
        <h2>
          Setup
          {h && <span className={`adm-pill ${bad ? "adm-pill--bad" : "adm-pill--ok"}`}>{bad ? "Needs attention" : "Working"}</span>}
        </h2>
        <button type="button" className="adm-link" onClick={load} disabled={loading}>
          {loading ? "Checking…" : "Check again"}
        </button>
      </div>
      {!h ? (
        <ListSkeleton n={3} />
      ) : (
        <ul className="adm-checks">
          {rows.map((r) => (
            <li key={r.title} className={r.ok === true ? "is-ok" : r.ok === false ? "is-bad" : "is-info"}>
              <Icon d={r.ok === true ? I.ok : I.warn} />
              <div>
                <strong>{r.title}</strong>
                <span>{r.text}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ListSkeleton({ n = 4 }: { n?: number }) {
  return (
    <div className="adm-list">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="adm-skel adm-skel--row" />
      ))}
    </div>
  );
}

function OrderRow({ o, avatarName, onUser }: { o: AdminOrder; avatarName: Ctx["avatarName"]; onUser?: (id: string) => void }) {
  const mock = o.txSignature?.startsWith("mock-");
  return (
    <li className="adm-row">
      <div className={`adm-dot ${o.status === "paid" ? "adm-dot--ok" : ""}`} aria-hidden />
      <div className="adm-row-main">
        <strong>
          {PRODUCT_LABEL[o.product]} · {avatarName(o.avatarId)}
        </strong>
        <span>
          {onUser ? (
            <button type="button" className="adm-inline" onClick={() => onUser(o.userId)}>
              {o.email || short(o.userId, 8)}
            </button>
          ) : (
            o.email || short(o.userId, 8)
          )}{" "}
          · {ago(o.paidAt ?? o.createdAt)}
          {o.manual && " · exact-amount transfer"}
          {mock && " · test"}
        </span>
      </div>
      <div className="adm-row-end">
        <strong>{o.amountUsdc}</strong>
        {o.status === "paid" ? (
          o.txSignature && !mock ? (
            <a href={`https://solscan.io/tx/${o.txSignature}`} target="_blank" rel="noreferrer" className="adm-link adm-link--small">
              Solscan <Icon d={I.ext} className="adm-ico adm-ico--tiny" />
            </a>
          ) : (
            <span className="adm-pill adm-pill--ok">Paid</span>
          )
        ) : (
          <span className="adm-pill">Open</span>
        )}
      </div>
    </li>
  );
}

/* ---------------------------------------------------------------- people */

const FILTERS: { key: UserFilter; label: string }[] = [
  { key: "all", label: "Everyone" },
  { key: "paying", label: "Paying" },
  { key: "granted", label: "Granted" },
  { key: "adult", label: "18+ confirmed" },
];

function People({ version, openUser, meId, avatarName, toast, changed }: Ctx) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<UserFilter>("all");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Pending[]>([]);
  const req = useRef(0);

  const load = useCallback(
    async (p: number) => {
      const id = ++req.current;
      setLoading(true);
      const d = await getJSON<{ users: AdminUser[]; total: number }>(`/api/admin/users?q=${encodeURIComponent(q)}&filter=${filter}&page=${p}`);
      if (id !== req.current) return; // a newer search is on its way
      setLoading(false);
      if (!d) return toast({ ok: false, text: "Couldn't load people." });
      setUsers((u) => (p === 0 ? d.users : [...u, ...d.users]));
      setTotal(d.total);
      setPage(p);
    },
    [q, filter, toast],
  );
  useEffect(() => {
    const t = setTimeout(() => void load(0), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, version, q]);
  useEffect(() => {
    void getJSON<{ pending: Pending[] }>("/api/admin/overview").then((d) => d && setPending(d.pending));
  }, [version]);

  const invites = Object.values(
    pending.reduce<Record<string, Pending[]>>((m, p) => {
      (m[p.email] ??= []).push(p);
      return m;
    }, {}),
  );

  return (
    <div className="adm-stack">
      <div className="adm-search">
        <Icon d={I.search} />
        <input type="search" placeholder="Search by email or name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" enterKeyHint="search" />
      </div>
      <div className="adm-chips" role="tablist" aria-label="Filter">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} className={`adm-chip ${filter === f.key ? "adm-chip--on" : ""}`} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      {filter === "all" && !q && invites.length > 0 && (
        <section className="adm-card">
          <div className="adm-card-head">
            <h2>Invited · not signed up yet</h2>
          </div>
          <ul className="adm-list">
            {invites.map((g) => (
              <li key={g[0].email} className="adm-row">
                <div className="adm-avatar adm-avatar--ghost">{initials({ email: g[0].email, name: "" })}</div>
                <div className="adm-row-main">
                  <strong>{g[0].email}</strong>
                  <span className="adm-tags">
                    {g.map((p) => (
                      <span key={p.avatar_id + p.product} className="adm-tag adm-tag--admin">
                        {PRODUCT_LABEL[p.product]} · {avatarName(p.avatar_id)}
                        <button
                          type="button"
                          aria-label="Remove this pending access"
                          onClick={async () => {
                            const r = await post({ action: "revoke_pending", email: p.email, avatarId: p.avatar_id, product: p.product });
                            toast({ ok: r.ok, text: r.ok ? "Pending access removed." : (r.error ?? "Failed.") });
                            changed();
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="adm-card adm-card--flush">
        <div className="adm-card-head">
          <h2>{loading && !users.length ? "Loading…" : `${total} ${total === 1 ? "person" : "people"}`}</h2>
          {loading && users.length > 0 && <span className="adm-spin" aria-label="Loading" />}
        </div>
        {loading && !users.length ? (
          <ListSkeleton n={6} />
        ) : users.length === 0 ? (
          <p className="adm-empty">{q ? `Nobody matches “${q}”.` : "Nobody here yet."}</p>
        ) : (
          <ul className="adm-list">
            {users.map((u) => {
              const paid = u.access.filter((a) => a.source === "payment").length;
              const granted = u.access.filter((a) => a.source === "admin").length;
              return (
                <li key={u.id}>
                  <button type="button" className="adm-row adm-row--btn" onClick={() => openUser(u.id)}>
                    {u.imageUrl ? <img src={u.imageUrl} alt="" className="adm-avatar" /> : <div className="adm-avatar">{initials(u)}</div>}
                    <div className="adm-row-main">
                      <strong>
                        {u.email || u.name || u.id}
                        {u.id === meId && <span className="adm-pill">You</span>}
                      </strong>
                      <span className="adm-tags">
                        {paid > 0 && <span className="adm-tag adm-tag--paid">{paid} paid</span>}
                        {granted > 0 && <span className="adm-tag adm-tag--admin">{granted} granted</span>}
                        {u.ageConfirmed ? <span className="adm-tag">18+</span> : <span className="adm-tag adm-tag--dim">not 18+ yet</span>}
                        <span className="adm-muted">joined {ago(u.createdAt)}</span>
                      </span>
                    </div>
                    <span className="adm-chev" aria-hidden>
                      ›
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {users.length < total && (
          <button type="button" className="adm-more" onClick={() => load(page + 1)} disabled={loading}>
            {loading ? "Loading…" : `Show more (${total - users.length} left)`}
          </button>
        )}
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------- one person */

function Sheet({ title, onClose, children, wide }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="adm-sheet-back" onClick={onClose} role="presentation">
      <div ref={panel} tabIndex={-1} className={`adm-sheet ${wide ? "adm-sheet--wide" : ""}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="adm-sheet-grip" aria-hidden />
        <div className="adm-sheet-head">
          <div className="adm-sheet-title">{title}</div>
          <button type="button" className="adm-x" onClick={onClose} aria-label="Close">
            <Icon d={I.close} />
          </button>
        </div>
        <div className="adm-sheet-body">{children}</div>
      </div>
    </div>
  );
}

function UserSheet({ userId, onClose, avatars, avatarName, meId, toast, changed }: Ctx & { userId: string; onClose: () => void }) {
  const [d, setD] = useState<{ user: AdminUser; orders: AdminOrder[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const r = await getJSON<{ user: AdminUser; orders: AdminOrder[] }>(`/api/admin/users/${encodeURIComponent(userId)}`);
    if (r) setD(r);
    else setFailed(true);
  }, [userId]);
  useEffect(() => void load(), [load]);

  const u = d?.user;
  const has = (avatarId: string, product: Product, source: "payment" | "admin") => !!u?.access.some((a) => a.avatarId === avatarId && a.product === product && a.source === source);

  const set = async (avatarId: string, product: Product, on: boolean, quiet = false): Promise<boolean> => {
    if (!u) return false;
    const key = `${avatarId}:${product}`;
    setBusy(key);
    // Optimistic: flip it right away, put it back if the server says no.
    setD((x) =>
      x && {
        ...x,
        user: {
          ...x.user,
          access: on
            ? [...x.user.access, ...(avatarId === "*" ? avatars.map((a) => a.id) : [avatarId]).map((id) => ({ avatarId: id, product, source: "admin" as const, grantedBy: "you" }))]
            : x.user.access.filter((a) => !(a.source === "admin" && a.product === product && (avatarId === "*" || a.avatarId === avatarId))),
        },
      },
    );
    const r = await post({ action: on ? "grant" : "revoke", userId: u.id, avatarId, product, note: note || undefined });
    setBusy(null);
    await load();
    changed();
    if (!r.ok) toast({ ok: false, text: r.error ?? "That didn't work." });
    else if (!quiet)
      toast({
        ok: true,
        text: `${on ? "Granted" : "Removed"} ${PRODUCT_LABEL[product]} · ${avatarName(avatarId)}`,
        undo: () => void set(avatarId, product, !on, true),
      });
    return r.ok;
  };

  const grantedCount = u?.access.filter((a) => a.source === "admin").length ?? 0;

  return (
    <Sheet
      onClose={onClose}
      wide
      title={
        u ? (
          <div className="adm-who">
            {u.imageUrl ? <img src={u.imageUrl} alt="" className="adm-avatar adm-avatar--big" /> : <div className="adm-avatar adm-avatar--big">{initials(u)}</div>}
            <div>
              <strong>
                {u.email || u.id}
                {u.id === meId && <span className="adm-pill">You</span>}
              </strong>
              <span>
                {u.name && `${u.name} · `}joined {ago(u.createdAt)} · last seen {ago(u.lastSignInAt)}
              </span>
            </div>
          </div>
        ) : (
          <strong>{failed ? "Not found" : "Loading…"}</strong>
        )
      }
    >
      {failed && <p className="adm-error">Couldn&apos;t load this person.</p>}
      {!u && !failed && <ListSkeleton n={5} />}
      {u && (
        <>
          <div className="adm-facts">
            <span className={`adm-tag ${u.ageConfirmed ? "" : "adm-tag--dim"}`}>{u.ageConfirmed ? "18+ confirmed" : "Has not confirmed 18+"}</span>
            <button type="button" className="adm-tag adm-tag--btn" onClick={() => void navigator.clipboard?.writeText(u.id).then(() => toast({ ok: true, text: "User id copied." }))}>
              id {short(u.id, 5)}
            </button>
          </div>
          {!u.ageConfirmed && <p className="adm-note">Granted access only shows once they confirm they&apos;re 18+ on the site.</p>}

          <h3 className="adm-h3">Access</h3>
          <p className="adm-muted adm-legend">
            <span className="adm-tag adm-tag--paid">Paid</span> bought (permanent) · <span className="adm-tag adm-tag--admin">On</span> given by an admin. Bundle includes the other two.
          </p>
          <div className="adm-grid" role="table" aria-label="Access per avatar">
            <div className="adm-grid-row adm-grid-head" role="row">
              <span role="columnheader">Avatar</span>
              {PRODUCTS.map((p) => (
                <span key={p} role="columnheader">
                  {PRODUCT_LABEL[p]}
                </span>
              ))}
            </div>
            {avatars.map((a) => {
              const bundled = has(a.id, "bundle", "payment") || has(a.id, "bundle", "admin");
              return (
                <div key={a.id} className="adm-grid-row" role="row">
                  <span role="rowheader" className="adm-grid-name">
                    {a.name}
                  </span>
                  {PRODUCTS.map((p) => {
                    const paid = has(a.id, p, "payment");
                    const granted = has(a.id, p, "admin");
                    const key = `${a.id}:${p}`;
                    return (
                      <span key={p} role="cell" className="adm-grid-cell">
                        {paid ? (
                          <span className="adm-tag adm-tag--paid">Paid</span>
                        ) : bundled && !granted && p !== "bundle" ? (
                          <span className="adm-tag adm-tag--dim" title="Included in the bundle">
                            Incl.
                          </span>
                        ) : (
                          <button
                            type="button"
                            role="switch"
                            aria-checked={granted}
                            aria-label={`${PRODUCT_LABEL[p]} for ${a.name}`}
                            className={`adm-switch ${granted ? "adm-switch--on" : ""}`}
                            disabled={busy === key}
                            onClick={() => void set(a.id, p, !granted)}
                          >
                            <span />
                          </button>
                        )}
                      </span>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <label className="adm-field">
            <span>Note for new grants (optional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="e.g. tester, giveaway winner" />
          </label>
          <div className="adm-actions">
            <button type="button" className="adm-btn adm-btn--main" disabled={!!busy} onClick={() => void set("*", "bundle", true)}>
              Give everything
            </button>
            {grantedCount > 0 && (
              <button
                type="button"
                className="adm-btn"
                disabled={!!busy}
                onClick={async () => {
                  const products = [...new Set(u.access.filter((a) => a.source === "admin").map((a) => a.product))];
                  for (const p of products) await set("*", p, false, true);
                  toast({ ok: true, text: "Removed all granted access. Paid access is untouched." });
                }}
              >
                Remove all granted
              </button>
            )}
          </div>

          <h3 className="adm-h3">Orders</h3>
          {d.orders.length === 0 ? (
            <p className="adm-empty">No orders.</p>
          ) : (
            <ul className="adm-list">
              {d.orders.map((o) => (
                <OrderRow key={o.id} o={o} avatarName={avatarName} />
              ))}
            </ul>
          )}
        </>
      )}
    </Sheet>
  );
}

/* ---------------------------------------------------------------- give access by email */

function GiveSheet({ onClose, avatars, toast, changed }: Ctx & { onClose: () => void }) {
  const [f, setF] = useState({ email: "", avatarId: "*", product: "bundle" as Product, note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim());
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return setError("Enter a valid email address.");
    setBusy(true);
    setError("");
    const r = await post({ action: "grant", email: f.email.trim(), avatarId: f.avatarId, product: f.product, note: f.note || undefined });
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "That didn't work.");
    toast({ ok: true, text: r.message ?? "Done." });
    changed();
    onClose();
  };
  return (
    <Sheet title={<strong>Give access</strong>} onClose={onClose}>
      <form className="adm-form" onSubmit={submit}>
        <p className="adm-muted">Works for anyone: if they already have an account it applies right away; otherwise they get an invitation and it applies when they sign up.</p>
        <label className="adm-field">
          <span>Email</span>
          <input type="email" inputMode="email" autoComplete="off" autoFocus value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="name@example.com" required />
        </label>
        <div className="adm-field">
          <span>What</span>
          <div className="adm-seg" role="radiogroup">
            {(["bundle", "explicit", "taps"] as Product[]).map((p) => (
              <button key={p} type="button" role="radio" aria-checked={f.product === p} className={f.product === p ? "is-on" : ""} onClick={() => setF({ ...f, product: p })}>
                {p === "bundle" ? "Everything" : PRODUCT_LABEL[p]}
              </button>
            ))}
          </div>
        </div>
        <label className="adm-field">
          <span>Which avatar</span>
          <select value={f.avatarId} onChange={(e) => setF({ ...f, avatarId: e.target.value })}>
            <option value="*">All avatars</option>
            {avatars.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="adm-field">
          <span>Note (optional)</span>
          <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={200} placeholder="Only admins see this" />
        </label>
        {error && <p className="adm-error">{error}</p>}
        <button type="submit" className="adm-btn adm-btn--main adm-btn--block" disabled={busy}>
          {busy ? "Saving…" : "Give access"}
        </button>
      </form>
    </Sheet>
  );
}

/* ---------------------------------------------------------------- orders */

function Orders({ version, avatarName, openUser, toast }: Ctx) {
  const [status, setStatus] = useState<"all" | "paid" | "pending">("paid");
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const load = useCallback(
    async (p: number) => {
      setLoading(true);
      const d = await getJSON<{ orders: AdminOrder[]; total: number }>(`/api/admin/orders?status=${status}&page=${p}`);
      setLoading(false);
      if (!d) return toast({ ok: false, text: "Couldn't load orders." });
      setOrders((o) => (p === 0 ? d.orders : [...o, ...d.orders]));
      setTotal(d.total);
      setPage(p);
    },
    [status, toast],
  );
  useEffect(() => void load(0), [load, version]);
  return (
    <div className="adm-stack">
      <div className="adm-chips" role="tablist" aria-label="Order status">
        {(
          [
            ["paid", "Paid"],
            ["pending", "Open"],
            ["all", "All"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={status === k} className={`adm-chip ${status === k ? "adm-chip--on" : ""}`} onClick={() => setStatus(k)}>
            {l}
          </button>
        ))}
      </div>
      <section className="adm-card adm-card--flush">
        <div className="adm-card-head">
          <h2>{loading && !orders.length ? "Loading…" : `${total} ${status === "pending" ? "open" : status === "paid" ? "paid" : ""} order${total === 1 ? "" : "s"}`}</h2>
        </div>
        {loading && !orders.length ? (
          <ListSkeleton n={6} />
        ) : orders.length === 0 ? (
          <p className="adm-empty">No orders here.</p>
        ) : (
          <ul className="adm-list">
            {orders.map((o) => (
              <OrderRow key={o.id} o={o} avatarName={avatarName} onUser={openUser} />
            ))}
          </ul>
        )}
        {orders.length < total && (
          <button type="button" className="adm-more" onClick={() => load(page + 1)} disabled={loading}>
            {loading ? "Loading…" : "Show more"}
          </button>
        )}
      </section>
      {status === "pending" && <p className="adm-muted adm-pad">Open orders are payment requests people started. Paid ones that arrive late are still matched automatically when the buyer comes back.</p>}
    </div>
  );
}

/* ---------------------------------------------------------------- activity */

function Activity({ version, avatarName, openUser }: Ctx) {
  const [rows, setRows] = useState<Audit[] | null>(null);
  useEffect(() => {
    void getJSON<{ audit: Audit[] }>("/api/admin/overview").then((d) => setRows(d?.audit ?? []));
  }, [version]);
  const verb: Record<string, string> = { grant: "gave", revoke: "removed", invite: "invited", revoke_pending: "cancelled the invite for" };
  return (
    <section className="adm-card adm-card--flush">
      <div className="adm-card-head">
        <h2>Admin activity</h2>
      </div>
      {!rows ? (
        <ListSkeleton n={6} />
      ) : rows.length === 0 ? (
        <p className="adm-empty">Nothing yet. Grants, removals and invitations are recorded here.</p>
      ) : (
        <ul className="adm-list">
          {rows.map((r, i) => (
            <li key={i} className="adm-row">
              <div className={`adm-dot ${r.action === "grant" || r.action === "invite" ? "adm-dot--ok" : "adm-dot--bad"}`} aria-hidden />
              <div className="adm-row-main">
                <strong>
                  {r.actor.split("@")[0]} {verb[r.action] ?? r.action}{" "}
                  {r.target_user_id ? (
                    <button type="button" className="adm-inline" onClick={() => openUser(r.target_user_id!)}>
                      {r.target_email ?? short(r.target_user_id, 6)}
                    </button>
                  ) : (
                    r.target_email
                  )}
                </strong>
                <span>
                  {r.product ? `${PRODUCT_LABEL[r.product as Product] ?? r.product} · ${avatarName(r.avatar_id)}` : ""}
                  {r.note ? ` · “${r.note}”` : ""} · {ago(r.at)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
