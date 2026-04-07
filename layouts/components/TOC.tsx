import type { Heading } from "@pagesmith/core";

type Props = {
  headings: Heading[];
  title?: string;
};

export function TOC({ headings, title = "On this page" }: Props) {
  const filtered = headings.filter((h) => h.depth >= 2 && h.depth <= 3);
  if (filtered.length === 0) return <></>;

  return (
    <nav class="toc" aria-label="Table of contents">
      <p class="toc-title">{title}</p>
      <ul class="toc-list">
        {filtered.map((heading) => (
          <li class={`toc-item depth-${heading.depth}`}>
            <a href={`#${heading.slug}`}>{heading.text}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
