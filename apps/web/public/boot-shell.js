// Paints the app's frame (window background, content card) before any JavaScript module arrives,
// so a reload shows the shell instead of a blank page or a spinner. It sits behind #root and
// mirrors LydieApp's geometry (packages/app/src/shell/LydieApp.tsx) and the colours of the theme
// theme.js applied; src/boot-shell.ts removes it once the app or another screen renders. A classic
// script from the same origin, because the desktop CSP forbids inline ones.
(function () {
  try {
    // Pages outside the workspace (src/App.tsx routes) have no shell.
    var path = location.pathname;
    if (/\/invite\/?$|\/s\/[^/]+|\/oauth\/consent\/?$|\/playground\/?$/.test(path)) return;

    var shell = { sidebarOpen: true, sidebarWidth: 260 };
    try {
      var saved = JSON.parse(localStorage.getItem("lydie:shell") || "null");
      if (saved) shell = saved;
    } catch (_) {}
    // Embed mode narrows the sidebar on boot (src/LydieWeb.tsx).
    if (new URLSearchParams(location.search).get("embed") === "1") {
      shell = { sidebarOpen: true, sidebarWidth: 220 };
    }
    var left = shell.sidebarOpen ? Math.min(420, Math.max(200, shell.sidebarWidth || 260)) : 6;

    var dark = document.documentElement.classList.contains("dark");
    var background = dark ? "#161616" : "#faf9f6";
    var card = dark ? "#0e0e0e" : "#fffefc";
    var border = dark ? "rgb(255 255 255 / 0.07)" : "rgb(0 0 0 / 0.05)";

    var el = document.createElement("div");
    el.id = "boot-shell";
    el.setAttribute("aria-hidden", "true");
    el.style.cssText = "position:fixed;inset:0;z-index:-1;background:" + background;
    el.innerHTML =
      '<div style="position:absolute;box-sizing:border-box;top:40px;right:6px;bottom:6px;left:' +
      left +
      "px;border-radius:8px;background:" +
      card +
      ";border:1px solid " +
      border +
      ';box-shadow:0 1px 2px -1px rgb(0 0 0 / 0.06)"></div>';
    document.body.insertBefore(el, document.body.firstChild);
  } catch (_) {}
})();
