import type { HomeLayoutProps } from "../schemas/layout-props";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { Html } from "./components/Html";

export { HomeLayoutPropsSchema as propsSchema } from "../schemas/layout-props";

export default function Home(props: HomeLayoutProps) {
  const { site, featuredArticles, featuredSeries, stats } = props;
  const bp = site.basePath ?? "";
  const { profile, profileActions } = site.home;

  return (
    <Html title={site.home.pageTitle} description={site.home.pageDescription} url="/" site={site}>
      <Header site={site} slug="/" />
      <main class="main-content main-home">
        {/* ── Profile ── */}
        <section class="home-profile">
          <h1 class="home-name">{profile.name}</h1>
          <p class="home-title">{profile.title}</p>
          <p class="home-bio">{profile.bio}</p>
          <div class="home-actions">
            {profileActions.linkedin ? (
              <a href={site.social.linkedin.url} class="home-action" target="_blank" rel="noopener">
                {profileActions.linkedin}
              </a>
            ) : null}
            {profileActions.viewCv ? (
              <a href={`${bp}/cv`} class="home-action">
                {profileActions.viewCv}
              </a>
            ) : null}
            {profileActions.allArticles ? (
              <a href={`${bp}/articles`} class="home-action">
                {profileActions.allArticles}
              </a>
            ) : null}
          </div>
        </section>

        <hr class="home-divider" />

        {/* ── Knowledge Hub (featured series) ── */}
        {featuredSeries && featuredSeries.length > 0 ? (
          <section class="home-section">
            <div class="home-section-header">
              <h2>Knowledge Hub</h2>
              {stats ? (
                <p class="home-stats">
                  {stats.totalArticles} articles &middot; {stats.totalSeries} topics
                </p>
              ) : null}
            </div>
            <p class="home-section-desc">
              Deep-dive articles for engineers who want to understand how things actually work.
            </p>
            <div class="home-series-grid">
              {featuredSeries.map((s) => (
                <a href={`${bp}/articles#${s.slug}`} class="home-series-card">
                  <span class="home-series-name">{s.displayName}</span>
                  <span class="home-series-count">{s.articles.length} articles</span>
                  {s.description ? <span class="home-series-desc">{s.description}</span> : null}
                </a>
              ))}
            </div>
            <a href={`${bp}/articles`} class="home-see-all">
              Browse all articles &rarr;
            </a>
          </section>
        ) : null}

        <hr class="home-divider" />

        {/* ── Featured Articles ── */}
        {featuredArticles && featuredArticles.length > 0 ? (
          <section class="home-section">
            <div class="home-section-header">
              <p class="home-section-label">Featured Articles</p>
              <p class="home-section-meta">Hand-picked reads</p>
            </div>
            <ul class="home-featured-list">
              {featuredArticles.map((a) => (
                <li class="home-featured-item">
                  <a href={a.url}>
                    <span class="home-featured-title">{a.title}</span>
                    {a.description ? <span class="home-featured-desc">{a.description}</span> : null}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <Footer site={site} />
      </main>
    </Html>
  );
}
