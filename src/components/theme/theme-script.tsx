"use client";

import { useEffect } from "react";

type ThemeMode = "dark" | "light";

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
}

export function ThemeScript() {
  useEffect(() => {
    const key = "worklog-theme";
    const storedTheme = window.localStorage.getItem(key);
    const theme: ThemeMode = storedTheme === "dark" || storedTheme === "light" ? storedTheme : "light";

    applyTheme(theme);
    window.localStorage.setItem(key, theme);
    window.dispatchEvent(new Event("worklog-theme-change"));
  }, []);

  return null;
}
