import AvatarCard from "@/components/AvatarCard";
import { AccountArea } from "@/components/AuthControls";
import { getAvatars, summarize } from "@/lib/avatars";

export default function Home() {
  return (
    <main className="home">
      <div className="home-top">
        <AccountArea />
      </div>
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
          {getAvatars().map((a) => (
            <li key={a.id}>
              <AvatarCard avatar={summarize(a)} />
            </li>
          ))}
        </ul>
      </section>

      <footer className="home-footer">Best on your phone. Some outfits are for adults only (18+).</footer>
    </main>
  );
}
