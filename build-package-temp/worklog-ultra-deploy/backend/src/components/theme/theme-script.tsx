import Script from "next/script";

const script = `
(() => {
  const key = "worklog-theme";
  const storedTheme = window.localStorage.getItem(key);
  const theme = storedTheme === "dark" || storedTheme === "light" ? storedTheme : "light";
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.documentElement.style.backgroundColor = theme === "dark" ? "#0f1725" : "#eef3fb";
  document.body?.style.setProperty("background-color", theme === "dark" ? "#0f1725" : "#eef3fb");
  window.localStorage.setItem(key, theme);
  window.dispatchEvent(new Event("worklog-theme-change"));
})();
`;

export function ThemeScript() {
  return <Script dangerouslySetInnerHTML={{ __html: script }} id="worklog-theme-script" strategy="beforeInteractive" />;
}
