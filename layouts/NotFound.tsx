import type { BaseLayoutProps } from "../schemas/layout-props";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { Html } from "./components/Html";

export { BaseLayoutPropsSchema as propsSchema } from "../schemas/layout-props";

export default function NotFound(props: BaseLayoutProps) {
  const { site } = props;
  const bp = site.basePath ?? "";

  return (
    <Html
      title={`Page Not Found — ${site.title}`}
      description="The page you're looking for doesn't exist. Browse articles or head home."
      noindex={true}
      site={site}
    >
      <Header site={site} slug="" />
      <main class="main-content main-narrow">
        <section class="not-found">
          <div class="not-found-container">
            <h1 class="not-found-code">404</h1>
            <h2 class="not-found-title">Page Not Found</h2>
            <p class="not-found-text">
              The page you're looking for doesn't exist or has been moved. Try browsing all articles
              or head back home.
            </p>
            <div class="not-found-actions">
              <a href={`${bp}/articles`} class="not-found-btn not-found-btn-primary">
                All Articles
              </a>
              <a href={`${bp}/`} class="not-found-btn not-found-btn-outline">
                Home
              </a>
            </div>
          </div>
        </section>
        <Footer site={site} />
      </main>
    </Html>
  );
}
