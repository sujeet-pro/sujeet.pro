/**
 * Copy-to-clipboard for code blocks.
 *
 * Reads the source code from data-code attribute on the button.
 * Progressive enhancement — buttons are hidden without JS via .no-js.
 */

export function initCopyCode(): void {
  document.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest(".code-copy-btn") as HTMLElement | null;
    if (!btn) return;

    const code = btn.getAttribute("data-code");
    if (!code) return;

    navigator.clipboard.writeText(code).then(() => {
      btn.textContent = "Copied!";
      btn.setAttribute("data-copied", "");
      setTimeout(() => {
        btn.textContent = "Copy";
        btn.removeAttribute("data-copied");
      }, 2000);
    });
  });
}
