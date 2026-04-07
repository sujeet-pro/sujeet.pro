/**
 * Theme switcher enhancement.
 *
 * The core toggle works via CSS (radio inputs + body:has() selectors).
 * JS adds: localStorage persistence, data-theme for FOUC prevention,
 * and OS theme change detection.
 */

const STORAGE_KEY = "pagesmith-theme";
type Theme = "auto" | "light" | "dark";

function getStored(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "auto") return v;
  } catch {
    /* private browsing */
  }
  return "auto";
}

function apply(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "auto") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
  // Sync radio state
  const radio = document.getElementById(`theme-${theme}`) as HTMLInputElement | null;
  if (radio && !radio.checked) radio.checked = true;
}

export function initTheme(): void {
  // Apply stored theme (also done in inline script, but sync radio here)
  apply(getStored());

  // Listen for radio changes from label clicks
  document.querySelectorAll<HTMLInputElement>('input[name="theme"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      const theme = radio.id.replace("theme-", "") as Theme;
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch {}
      apply(theme);
    });
  });

  // OS theme change — re-apply if in auto mode
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (getStored() === "auto") apply("auto");
  });
}
