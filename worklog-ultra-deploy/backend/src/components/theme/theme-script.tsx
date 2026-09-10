"use client";

import { useEffect } from "react";

type ThemeMode = "dark" | "light";

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.documentElement.style.backgroundColor = theme === "dark" ? "#0f1725" : "#eef3fb";
  document.body?.style.setProperty("background-color", theme === "dark" ? "#0f1725" : "#eef3fb");
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
