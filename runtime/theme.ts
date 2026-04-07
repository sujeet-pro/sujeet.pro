/**
 * Theme switcher enhancement.
 *
 * The core toggle works via CSS (radio inputs + body:has() selectors).
 * JS adds: localStorage persistence, data-theme/data-variant for FOUC
 * prevention, OS theme change detection, and footer dropdown control.
 *
 * Two-dimensional state:
 *  - Mode  (auto | light | dark)  → data-theme attribute
 *  - Variant (regular | reader | contrast) → data-variant attribute
 */

type Mode = "auto" | "light" | "dark";
type Variant = "regular" | "reader" | "contrast";

const MODE_KEY = "pagesmith-theme";
const VARIANT_KEY = "pagesmith-variant";

function getStoredMode(): Mode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (v === "light" || v === "dark" || v === "auto") return v;
  } catch {
    /* private browsing */
  }
  return "auto";
}

function getStoredVariant(): Variant {
  try {
    const v = localStorage.getItem(VARIANT_KEY);
    if (v === "reader" || v === "contrast") return v;
  } catch {
    /* private browsing */
  }
  return "regular";
}

function applyMode(mode: Mode): void {
  const root = document.documentElement;
  if (mode === "auto") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", mode);
  }
  const radio = document.getElementById(`theme-${mode}`) as HTMLInputElement | null;
  if (radio && !radio.checked) radio.checked = true;
}

function applyVariant(variant: Variant): void {
  const root = document.documentElement;
  if (variant === "regular") {
    root.removeAttribute("data-variant");
  } else {
    root.setAttribute("data-variant", variant);
  }
}

function syncFooterRadios(mode: Mode, variant: Variant): void {
  const modeRadio = document.querySelector<HTMLInputElement>(
    `input[name="footer-mode"][value="${mode}"]`,
  );
  if (modeRadio) modeRadio.checked = true;

  const variantRadio = document.querySelector<HTMLInputElement>(
    `input[name="footer-variant"][value="${variant}"]`,
  );
  if (variantRadio) variantRadio.checked = true;
}

function initFooterDropdown(): void {
  const picker = document.querySelector(".footer-theme-picker");
  if (!picker) return;

  const btn = picker.querySelector<HTMLButtonElement>(".footer-theme-btn");
  const dropdown = picker.querySelector<HTMLElement>(".footer-theme-dropdown");
  if (!btn || !dropdown) return;

  dropdown.removeAttribute("hidden");
  dropdown.classList.add("closed");

  function toggle() {
    const open = !dropdown!.classList.contains("closed");
    dropdown!.classList.toggle("closed", open);
    btn!.setAttribute("aria-expanded", String(!open));
  }

  function close() {
    dropdown!.classList.add("closed");
    btn!.setAttribute("aria-expanded", "false");
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggle();
  });

  document.addEventListener("click", (e) => {
    if (!picker.contains(e.target as Node)) close();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  picker.querySelectorAll<HTMLInputElement>('input[name="footer-mode"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      const mode = radio.value as Mode;
      try {
        localStorage.setItem(MODE_KEY, mode);
      } catch {}
      applyMode(mode);
    });
  });

  picker.querySelectorAll<HTMLInputElement>('input[name="footer-variant"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      const variant = radio.value as Variant;
      try {
        localStorage.setItem(VARIANT_KEY, variant);
      } catch {}
      applyVariant(variant);
    });
  });
}

export function initTheme(): void {
  const mode = getStoredMode();
  const variant = getStoredVariant();

  applyMode(mode);
  applyVariant(variant);
  syncFooterRadios(mode, variant);

  document.querySelectorAll<HTMLInputElement>('input[name="theme"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      const m = radio.id.replace("theme-", "") as Mode;
      try {
        localStorage.setItem(MODE_KEY, m);
      } catch {}
      applyMode(m);
      syncFooterRadios(m, getStoredVariant());
    });
  });

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (getStoredMode() === "auto") applyMode("auto");
  });

  initFooterDropdown();
}
