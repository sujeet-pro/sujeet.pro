type Props = {
  basePath?: string;
};

/**
 * Preload the JetBrains Mono code font alongside the Open Sans body font that
 * `@pagesmith/site`'s document head already preloads. Both faces ship from
 * `@pagesmith/site/css/fonts` and are copied to the stable `/assets/fonts/`
 * path at build time (mirroring the packaged Open Sans preload byte-for-byte,
 * so the two resolve the same way). Passed to `SiteDocument` via
 * `headChildren` so code-heavy pages avoid a mono-font FOUT.
 */
export function FontPreload({ basePath }: Props) {
  const base = basePath || "";
  return (
    <link
      rel="preload"
      href={`${base}/assets/fonts/jetbrains-mono-variable.woff2`}
      as="font"
      type="font/woff2"
      crossorigin=""
    />
  );
}
