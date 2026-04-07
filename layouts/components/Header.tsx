import type { SiteConfig } from "../../schemas/config";

type Props = {
  site: SiteConfig;
  slug: string;
  hasLeftSidebar?: boolean;
};

const hamburgerIcon =
  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 5h14M3 10h14M3 15h14"/></svg>';
const autoIcon =
  '<svg viewBox="0 0 20 20" fill="currentColor"><circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 3a7 7 0 010 14V3z"/></svg>';
const sunIcon =
  '<svg viewBox="0 0 20 20" fill="currentColor"><circle cx="10" cy="10" r="4"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.93 4.93l1.41 1.41M13.66 13.66l1.41 1.41M4.93 15.07l1.41-1.41M13.66 6.34l1.41-1.41" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>';
const moonIcon =
  '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.003 8.003 0 1010.586 10.586z"/></svg>';

export function Header({ site, slug, hasLeftSidebar }: Props) {
  const bp = site.basePath ?? "";
  return (
    <header class="site-header">
      <div class="header-inner">
        <div class="header-nav-group">
          {hasLeftSidebar ? (
            <label
              for="sidebar-toggle"
              class="sidebar-toggle-label"
              role="button"
              aria-label="Toggle navigation"
              innerHTML={hamburgerIcon}
            />
          ) : null}
          <a href={`${bp}/`} class="site-logo">
            {site.name}
          </a>
        </div>
        <div class="header-nav-group">
          <nav class="site-nav">
            {site.navItems.map((item) => (
              <a
                href={`${bp}${item.path}`}
                class={`/${slug}`.startsWith(item.path) ? "active" : ""}
              >
                {item.label}
              </a>
            ))}
          </nav>
          <label
            for="theme-light"
            class="theme-toggle-label theme-toggle-to-light"
            aria-label="Switch to light theme"
            innerHTML={autoIcon}
          />
          <label
            for="theme-dark"
            class="theme-toggle-label theme-toggle-to-dark"
            aria-label="Switch to dark theme"
            innerHTML={sunIcon}
          />
          <label
            for="theme-auto"
            class="theme-toggle-label theme-toggle-to-auto"
            aria-label="Switch to auto theme"
            innerHTML={moonIcon}
          />
        </div>
      </div>
    </header>
  );
}
