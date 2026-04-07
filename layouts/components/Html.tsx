import type { SiteConfig } from "../../schemas/config";
import { Fragment } from "@pagesmith/core/jsx-runtime";

type Props = {
  title: string;
  description?: string;
  url?: string;
  image?: string;
  pageType?: string;
  noindex?: boolean;
  hasLeftSidebar?: boolean;
  site: SiteConfig;
  children?: any;
};

export function Html({
  title,
  description,
  url,
  image,
  pageType,
  noindex,
  hasLeftSidebar,
  site,
  children,
}: Props) {
  const origin = site.origin.replace(/\/$/, "");
  const bp = site.basePath ?? "";
  const canonicalUrl = url ? `${origin}${bp}/${url.replace(/^\//, "")}` : undefined;
  const locale = site.seo?.locale || "en_US";
  const twitterHandle = site.seo?.twitterHandle;
  const ogType = pageType || site.seo?.defaultOgType || "website";
  const lightColor = site.theme?.lightColor || "#f8fafc";
  const darkColor = site.theme?.darkColor || "#020617";
  const gaId = site.analytics?.googleAnalytics;

  return (
    <html lang="en" class="no-js">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
        <title>{title}</title>
        {description ? <meta name="description" content={description} /> : null}
        {noindex ? <meta name="robots" content="noindex, nofollow" /> : null}

        {/* Canonical URL */}
        {canonicalUrl ? <link rel="canonical" href={canonicalUrl} /> : null}

        {/* OpenGraph */}
        <meta property="og:type" content={ogType} />
        {canonicalUrl ? <meta property="og:url" content={canonicalUrl} /> : null}
        <meta property="og:title" content={title} />
        {description ? <meta property="og:description" content={description} /> : null}
        {image ? (
          <meta
            property="og:image"
            content={image.startsWith("http") ? image : `${origin}${bp}${image}`}
          />
        ) : null}
        <meta property="og:locale" content={locale} />
        <meta property="og:site_name" content={site.name} />

        {/* Twitter Card */}
        <meta name="twitter:card" content={image ? "summary_large_image" : "summary"} />
        {twitterHandle ? <meta name="twitter:site" content={twitterHandle} /> : null}
        <meta name="twitter:title" content={title} />
        {description ? <meta name="twitter:description" content={description} /> : null}
        {image ? (
          <meta
            name="twitter:image"
            content={image.startsWith("http") ? image : `${origin}${bp}${image}`}
          />
        ) : null}

        {/* Theme color */}
        <meta name="theme-color" content={lightColor} media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content={darkColor} media="(prefers-color-scheme: dark)" />
        <meta name="msapplication-TileColor" content={darkColor} />

        {/* Favicons */}
        <link rel="icon" type="image/x-icon" href={`${bp}/favicons/favicon.ico`} />
        <link rel="icon" type="image/png" sizes="16x16" href={`${bp}/favicons/favicon-16x16.png`} />
        <link rel="icon" type="image/png" sizes="32x32" href={`${bp}/favicons/favicon-32x32.png`} />
        <link rel="icon" type="image/png" sizes="96x96" href={`${bp}/favicons/favicon-96x96.png`} />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href={`${bp}/favicons/apple-icon-180x180.png`}
        />
        <link
          rel="apple-touch-icon"
          sizes="152x152"
          href={`${bp}/favicons/apple-icon-152x152.png`}
        />
        <link
          rel="apple-touch-icon"
          sizes="144x144"
          href={`${bp}/favicons/apple-icon-144x144.png`}
        />
        <link
          rel="apple-touch-icon"
          sizes="120x120"
          href={`${bp}/favicons/apple-icon-120x120.png`}
        />
        <link
          rel="apple-touch-icon"
          sizes="114x114"
          href={`${bp}/favicons/apple-icon-114x114.png`}
        />
        <link rel="apple-touch-icon" sizes="76x76" href={`${bp}/favicons/apple-icon-76x76.png`} />
        <link rel="apple-touch-icon" sizes="72x72" href={`${bp}/favicons/apple-icon-72x72.png`} />
        <link rel="apple-touch-icon" sizes="60x60" href={`${bp}/favicons/apple-icon-60x60.png`} />
        <link rel="apple-touch-icon" sizes="57x57" href={`${bp}/favicons/apple-icon-57x57.png`} />
        <meta name="msapplication-TileImage" content={`${bp}/favicons/ms-icon-144x144.png`} />

        {/* Manifest & feeds */}
        <link rel="manifest" href={`${bp}/manifest.json`} />
        <link
          rel="alternate"
          type="application/rss+xml"
          title={`${site.name} RSS`}
          href={`${bp}/rss.xml`}
        />
        <link rel="sitemap" type="application/xml" href={`${bp}/sitemap.xml`} />

        {/* Fonts */}
        <link
          rel="preload"
          href={`${bp}/assets/open-sans-latin-wght-normal.woff2`}
          as="font"
          type="font/woff2"
          crossorigin=""
        />
        <link
          rel="preload"
          href={`${bp}/assets/jetbrains-mono-latin-400-normal.woff2`}
          as="font"
          type="font/woff2"
          crossorigin=""
        />

        {/* CSS */}
        <link rel="stylesheet" href={`${bp}/assets/style.css`} />

        {/* Theme init (before paint) */}
        <script innerHTML="(function(){var d=document.documentElement;d.classList.remove('no-js');try{var t=localStorage.getItem('pagesmith-theme');if(t==='light'||t==='dark'){d.setAttribute('data-theme',t);var r=document.getElementById('theme-'+t);if(r)r.checked=true}var v=localStorage.getItem('pagesmith-variant');if(v==='reader'||v==='contrast'){d.setAttribute('data-variant',v)}}catch(e){}})()" />

        {/* Google Analytics */}
        {gaId ? (
          <Fragment>
            <script async src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} />
            <script
              innerHTML={`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gaId}');`}
            />
          </Fragment>
        ) : null}
      </head>
      <body>
        <input type="radio" id="theme-auto" name="theme" class="sr-only" checked />
        <input type="radio" id="theme-light" name="theme" class="sr-only" />
        <input type="radio" id="theme-dark" name="theme" class="sr-only" />
        {hasLeftSidebar ? <input type="checkbox" id="sidebar-toggle" class="sr-only" /> : null}
        {hasLeftSidebar ? <label for="sidebar-toggle" class="sidebar-overlay" /> : null}
        {children}
        <script src={`${bp}/assets/main.js`} defer />
      </body>
    </html>
  );
}
