/**
 * Student Admission Portal - Centralized Theme Management
 * Light / Dark Mode Controller with Persistent Storage and Zero-FOUC
 */

export function getPreferredTheme() {
  try {
    const saved = localStorage.getItem("portal_theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch (e) {}

  if (typeof window !== "undefined" && window.matchMedia) {
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
  }
  return "light";
}

export function applyTheme(theme, save = true) {
  const active = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", active);

  if (save) {
    try {
      localStorage.setItem("portal_theme", active);
    } catch (e) {}
  }

  updateToggleButtons(active);

  try {
    window.dispatchEvent(new CustomEvent("theme-change", { detail: { theme: active } }));
  } catch (e) {}

  return active;
}

export function updateToggleButtons(theme) {
  const isDark = theme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  document.querySelectorAll("#theme-toggle, .theme-toggle").forEach(btn => {
    btn.setAttribute("aria-label", label);
    btn.setAttribute("title", label);
    btn.setAttribute("aria-pressed", isDark ? "true" : "false");
  });
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || getPreferredTheme();
  const next = current === "dark" ? "light" : "dark";
  return applyTheme(next, true);
}

export function initThemeToggle() {
  const current = document.documentElement.getAttribute("data-theme") || getPreferredTheme();
  applyTheme(current, false);

  // Bind click listener using event delegation for dynamic headers
  document.addEventListener("click", e => {
    const btn = e.target.closest("#theme-toggle, .theme-toggle");
    if (!btn) return;
    e.preventDefault();
    toggleTheme();
  });

  // Listen to OS theme changes if user hasn't explicitly set a preference
  if (typeof window !== "undefined" && window.matchMedia) {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = e => {
      try {
        if (!localStorage.getItem("portal_theme")) {
          applyTheme(e.matches ? "dark" : "light", false);
        }
      } catch (err) {}
    };
    if (mql.addEventListener) mql.addEventListener("change", handler);
    else if (mql.addListener) mql.addListener(handler);
  }
}

// Auto-initialize when loaded
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initThemeToggle);
  } else {
    initThemeToggle();
  }
}
