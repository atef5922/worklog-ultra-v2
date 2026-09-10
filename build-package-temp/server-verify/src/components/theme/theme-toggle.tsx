"use client";

import { MoonStar, SunMedium } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type ThemeMode = "dark" | "light";

function getThemeFromDom(): ThemeMode {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<ThemeMode>("dark");

  useEffect(() => {
    const syncTheme = () => setTheme(getThemeFromDom());
    syncTheme();
    window.addEventListener("worklog-theme-change", syncTheme as EventListener);
    return () => window.removeEventListener("worklog-theme-change", syncTheme as EventListener);
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("worklog-theme", nextTheme);
    setTheme(nextTheme);
    window.dispatchEvent(new Event("worklog-theme-change"));
  }

  return (
    <Button
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className={className}
      onClick={toggleTheme}
      size="icon"
      type="button"
      variant="secondary"
    >
      {theme === "dark" ? <SunMedium className="h-6 w-6" /> : <MoonStar className="h-6 w-6" />}
    </Button>
  );
}
