/**
 * Static reference card (rendered server-side only; never hydrated, so it ships zero JS).
 *
 * Leak rule (§3): an `upcoming` card (draft target) receives no slug and no url, and renders no `href`
 * and no slug-bearing attribute; only the title, archetype and a "Coming Soon" badge.
 */
interface Props {
  title: string;
  archetypeLabel: string;
  upcoming: boolean;
  url?: string;
  pageTitle?: string;
  sectionTitle?: string;
  note?: string;
}

export default function ArticleRefCard({ title, archetypeLabel, upcoming, url, pageTitle, sectionTitle, note }: Props) {
  const where = [pageTitle, sectionTitle ? `§ ${sectionTitle}` : undefined].filter(Boolean).join(' › ');
  const body = (
    <>
      <span className="sp-ref-card-kicker">{archetypeLabel}</span>
      <span className="sp-ref-card-title">{title}</span>
      {where && <span className="sp-ref-card-where">{where}</span>}
      {note && <span className="sp-ref-card-note">{note}</span>}
    </>
  );
  if (upcoming || !url) {
    return (
      <span className="sp-ref-card sp-ref-card-upcoming" role="group" aria-label={`${title} (coming soon)`}>
        <span className="sp-ref-card-main">{body}</span>
        <span className="sp-badge-upcoming">Coming Soon</span>
      </span>
    );
  }
  return (
    <a className="sp-ref-card" href={url}>
      <span className="sp-ref-card-main">{body}</span>
      <span className="sp-ref-card-arrow" aria-hidden="true">
        →
      </span>
    </a>
  );
}
