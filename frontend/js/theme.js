// ============ frontend/js/theme.js ============


(function () {
  const STORAGE_KEY = "campusdesk-theme";

  function getPreferredTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "dark" || saved === "light") return saved;
    
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

  
  applyTheme(getPreferredTheme());

  
  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("themeToggleBtn");
    if (btn) {
      updateToggleIcon(document.documentElement.getAttribute("data-theme"));
      btn.addEventListener("click", toggleTheme);
    }
  });
})();