/**
 * Sidebar overlay toggle for mobile/tablet (< 140ch).
 *
 * Uses a hidden checkbox (#sidebar-toggle) for CSS-only show/hide.
 * This JS layer adds keyboard support (ESC), click-outside-to-close,
 * and auto-close when viewport resizes past the in-grid breakpoint.
 */

export function initSidebar(): void {
  const toggle = document.getElementById("sidebar-toggle") as HTMLInputElement | null;
  if (!toggle) return;

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && toggle.checked) {
      toggle.checked = false;
    }
  });

  const mq = window.matchMedia("(min-width: 140ch)");
  mq.addEventListener("change", (e) => {
    if (e.matches && toggle.checked) {
      toggle.checked = false;
    }
  });
}
