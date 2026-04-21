import type { DisplayTag, ListingEntry } from "../lib/content";

type Props = {
  entries: ListingEntry[];
  showDates?: boolean;
  showTags?: boolean;
};

function formatDate(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function renderTags(tags: DisplayTag[]) {
  if (!tags.length) return null;
  return (
    <ul class="site-tag-list site-card-tags" aria-label="Tags">
      {tags.map((tag) => (
        <li class="site-pill site-pill-subtle">{tag.name}</li>
      ))}
    </ul>
  );
}

export function EntryCardList({ entries, showDates = false, showTags = true }: Props) {
  if (entries.length === 0) return null;

  return (
    <ul class="site-card-list">
      {entries.map((entry) => {
        const published = showDates ? formatDate(entry.publishedDate) : null;
        // Cards prefer the punchier `cardTitle` and gracefully fall back to
        // the canonical title when no override is set.
        const cardTitle = entry.cardTitle ?? entry.title;
        return (
          <li class="site-card">
            <a href={entry.path} class="site-card-title">
              {cardTitle}
            </a>
            {published ? <span class="site-card-meta">{published}</span> : null}
            {entry.description ? <span class="site-card-desc">{entry.description}</span> : null}
            {showTags ? renderTags(entry.tags) : null}
          </li>
        );
      })}
    </ul>
  );
}
