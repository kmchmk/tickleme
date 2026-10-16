import AvatarCard from "@/components/AvatarCard";
import { HomeTransitionsProvider } from "@/components/HomeTransitions";
import { AccountArea } from "@/components/AuthControls";
import { getAvatars, posterUrl, summarize } from "@/lib/avatars";
import { DESCRIPTION, FAQ, SITE_NAME, SITE_URL } from "@/lib/site";

/** Structured data: the site, the avatars as a list, and the FAQ (shown on the page too). */
function jsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", "@id": `${SITE_URL}/#site`, url: `${SITE_URL}/`, name: SITE_NAME, description: DESCRIPTION, inLanguage: "en" },
      {
        "@type": "ItemList",
        name: "Avatars",
        itemListElement: getAvatars().map((a, i) => ({
          "@type": "ListItem",
          position: i + 1,
          url: `${SITE_URL}/a/${a.id}`,
          name: a.name,
          image: posterUrl(a.variants.jeans),
        })),
      },
      { "@type": "FAQPage", mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    ],
  };
}

export default function Home() {
  return (
    <main className="home">
      <header className="hero">
        <div className="hero-text">
          <h1 className="hero-title">
            Tickle <span>Me</span>
          </h1>
          <p className="hero-sub">Tap a nose, poke a belly, tickle an ear. Every spot gets a different reaction.</p>
        </div>
        <AccountArea />
      </header>

      <HomeTransitionsProvider>
        <ul className="grid">
          {getAvatars().map((a) => (
            <li key={a.id}>
              <AvatarCard avatar={summarize(a)} />
            </li>
          ))}
        </ul>
      </HomeTransitionsProvider>

      <section className="faq" aria-labelledby="faq-title">
        <h2 id="faq-title" className="faq-title">
          How it works
        </h2>
        <div className="faq-list">
          {FAQ.map((f) => (
            <details key={f.q} className="faq-item">
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="home-footer">Best on your phone. Some outfits are for adults only (18+).</footer>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd()).replace(/</g, "\\u003c") }} />
    </main>
  );
}
