import { useSyncExternalStore } from "react";

export type Theme = "dark" | "light";

const listeners = new Set<() => void>();

function current(): Theme {
  return (localStorage.getItem("rc_theme") as Theme) || "dark";
}

export function applyTheme(theme: Theme = current()) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function setTheme(theme: Theme) {
  localStorage.setItem("rc_theme", theme);
  applyTheme(theme);
  listeners.forEach((l) => l());
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const theme = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    current,
  );
  return [theme, setTheme];
}
