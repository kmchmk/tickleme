import Link from "next/link";
import { assetUrl, getAvatars } from "@/lib/avatars";

export default function Home() {
  return (
    <main className="home">
      <header className="hero">
        <span className="hero-badge">✨ Interactive avatars</span>
        <h1 className="hero-title">
          Tickle <span>Me</span>
        </h1>
        <p className="hero-sub">Tap a nose, poke a belly, tickle an ear. Every spot gets a different reaction.</p>
      </header>

      <section aria-labelledby="avatars-heading">
        <h2 id="avatars-heading" className="section-title">
          Pick a friend
        </h2>
        <ul className="grid">
          {getAvatars().map((a) => {
            const media = (
              // Locked teasers are blurred, so they can be cropped to the default card shape.
              <div className="card-media" style={a.locked ? undefined : ({ "--ar": a.aspectRatio } as React.CSSProperties)}>
                {a.poster && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={assetUrl(a, a.poster)} alt="" loading="lazy" />
                )}
                {a.locked ? (
                  <>
                    <span className="pill">18+</span>
                    <span className="lock-badge" aria-hidden>
                      <svg viewBox="0 0 24 24">
                        <rect x="5" y="11" width="14" height="9" rx="2" />
                        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                      </svg>
                    </span>
                  </>
                ) : (
                  <span className="pill pill--free">{a.premium ? "Premium" : "Free"}</span>
                )}
              </div>
            );
            return (
              <li key={a.id}>
                {a.locked ? (
                  <div className="card card--locked" aria-disabled="true" role="group" aria-label={`${a.name}, locked`}>
                    {media}
                    <div className="card-body">
                      <strong>{a.name}</strong>
                      <span>Locked</span>
                    </div>
                  </div>
                ) : (
                  <Link href={`/a/${a.id}`} className="card">
                    {media}
                    <div className="card-body">
                      <strong>{a.name}</strong>
                      <span>{a.actions.length} touch spots</span>
                    </div>
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <footer className="home-footer">Best on your phone.</footer>
    </main>
  );
}
