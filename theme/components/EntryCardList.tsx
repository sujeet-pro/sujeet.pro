import type { ListingEntry } from "../lib/content";

type Props = {
  entries: ListingEntry[];
  showDates?: boolean;
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

export function EntryCardList({ entries, showDates = false }: Props) {
  if (entries.length === 0) return null;

  return (
    <ul class="site-card-list">
      {entries.map((entry) => {
        const published = showDates ? formatDate(entry.publishedDate) : null;
        return (
          <li class="site-card">
            <a href={entry.path} class="site-card-title">
              {entry.title}
            </a>
            {published ? <span class="site-card-meta">{published}</span> : null}
            {entry.description ? <span class="site-card-desc">{entry.description}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}
