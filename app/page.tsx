import Link from "next/link";
import { assetUrl, comingSoon, getAvatars } from "@/lib/avatars";

export default function Home() {
  return (
    <main className="home">
      <header className="hero">
        <span className="hero-badge">🐾 Interactive pets</span>
        <h1 className="hero-title">
          Tickle <span>Me</span>
        </h1>
        <p className="hero-sub">Tap a nose, poke a belly, tickle an ear. Every spot gets a different reaction.</p>
      </header>

      <section aria-labelledby="pets-heading">
        <h2 id="pets-heading" className="section-title">
          Pick a friend
        </h2>
        <ul className="grid">
          {getAvatars().map((a) => (
            <li key={a.id}>
              <Link href={`/a/${a.id}`} className="card">
                <div className="card-media" style={{ "--ar": a.aspectRatio } as React.CSSProperties}>
                  {a.poster && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={assetUrl(a, a.poster)} alt="" loading="lazy" />
                  )}
                  <span className="pill pill--free">{a.premium ? "Premium" : "Free"}</span>
                </div>
                <div className="card-body">
                  <strong>{a.name}</strong>
                  <span>{a.actions.length} touch spots</span>
                </div>
              </Link>
            </li>
          ))}
          {comingSoon.map((c) => (
            <li key={c.name}>
              <div className="card card--soon" aria-disabled>
                <div className="card-media card-media--emoji">
                  <span className="card-emoji" aria-hidden>
                    {c.emoji}
                  </span>
                  <span className="pill">🔒 Soon</span>
                </div>
                <div className="card-body">
                  <strong>{c.name}</strong>
                  <span>Coming soon</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <footer className="home-footer">Made for petting. Best on your phone.</footer>
    </main>
  );
}
