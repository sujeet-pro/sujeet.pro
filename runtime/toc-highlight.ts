/**
 * Active TOC highlighting via IntersectionObserver.
 *
 * Progressive enhancement — TOC works without this, but with JS
 * the currently visible section gets highlighted in the right sidebar.
 * When the active heading changes, the TOC scrolls to keep it visible.
 */

export function initTocHighlight(): void {
  const tocLinks = document.querySelectorAll<HTMLAnchorElement>(".sidebar-right .toc-item a");
  if (tocLinks.length === 0) return;

  const headingIds = Array.from(tocLinks)
    .map((a) => a.getAttribute("href")?.slice(1))
    .filter((id): id is string => !!id);

  const headings = headingIds
    .map((id) => document.getElementById(id))
    .filter((el): el is HTMLElement => el !== null);

  if (headings.length === 0) return;

  // Track which heading is visible
  let currentId = "";

  const observer = new IntersectionObserver(
    (entries) => {
      const prevId = currentId;
      for (const entry of entries) {
        if (entry.isIntersecting) {
          currentId = entry.target.id;
          break;
        }
      }
      // Update TOC active state
      tocLinks.forEach((link) => {
        const li = link.parentElement;
        if (li) {
          li.classList.toggle("active", link.getAttribute("href") === `#${currentId}`);
        }
      });
      // Scroll active TOC item into view when it changes
      if (currentId !== prevId) {
        const activeLi = document.querySelector(
          ".sidebar-right .toc-item.active",
        ) as HTMLElement | null;
        if (activeLi) {
          activeLi.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      }
    },
    {
      rootMargin: "-80px 0px -66% 0px",
      threshold: 0,
    },
  );

  headings.forEach((h) => observer.observe(h));
}
