// ============ frontend/js/theme.js ============
// Dark/light theme toggle with persisted preference (localStorage).
// Applied before other scripts run so there's no flash of wrong theme.

(function () {
  const STORAGE_KEY = "campusdesk-theme";

  function getPreferredTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "dark" || saved === "light") return saved;
    // fall back to OS preference on first visit
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEY, theme);
    updateToggleIcon(theme);
  }

  function updateToggleIcon(theme) {
    const btn = document.getElementById("themeToggleBtn");
    if (!btn) return;
    btn.textContent = theme === "dark" ? "☀️ Light" : "🌙 Dark";
    btn.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    applyTheme(current === "dark" ? "light" : "dark");
  }

  // apply immediately (before DOM paints body) to avoid flash
  applyTheme(getPreferredTheme());

  // wire up the button once DOM is ready
  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("themeToggleBtn");
    if (btn) {
      updateToggleIcon(document.documentElement.getAttribute("data-theme"));
      btn.addEventListener("click", toggleTheme);
    }
  });
})();