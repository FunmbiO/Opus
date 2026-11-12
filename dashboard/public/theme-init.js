// Applies the saved theme before the page paints, so there is no flash. Kept as a file (not inline) so the
// Content-Security-Policy can forbid inline scripts.
try { var t = localStorage.getItem("aide-theme") || "dark"; if (t !== "system") document.documentElement.dataset.theme = t; } catch (e) { /* private mode */ }
