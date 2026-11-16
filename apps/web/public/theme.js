// Applies the saved theme before the first paint, so a dark window does not flash white while the
// app loads. A classic script from the same origin, because the desktop CSP forbids inline ones.
// Mirrors applyPreferences in plugins/settings/src/preferences.ts, which takes over once loaded
// (a plugin's `app.storage` keys are stored as `lydie:plugin:<plugin id>:<key>`; before that, and so
// on a device that has not opened the app since, `lydie:plugin:<key>`).
(function () {
  var theme = "light";
  try {
    var raw =
      localStorage.getItem("lydie:plugin:settings:appearance.theme") ||
      localStorage.getItem("lydie:plugin:appearance.theme");
    if (raw) theme = JSON.parse(raw);
  } catch (_) {}
  var dark =
    theme === "dark" ||
    (theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  var root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.classList.toggle("system", theme !== "light" && theme !== "dark");
})();
