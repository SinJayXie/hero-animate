// ============================================================
// 文档站主题：亮 / 暗模式
// 首帧由 index.html 内联脚本按 localStorage / 系统偏好写入 data-theme，
// 这里负责按钮状态、手动切换，以及用户未手动选择时跟随系统变化。
// ============================================================
const STORAGE_KEY = "hero-animate-theme";

type Theme = "light" | "dark";

const root = document.documentElement;
const media = window.matchMedia("(prefers-color-scheme: dark)");

function readStored(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function store(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // 隐私模式等场景下忽略持久化失败
  }
}

function current(): Theme {
  return root.dataset.theme === "dark" ? "dark" : "light";
}

function apply(theme: Theme): void {
  root.dataset.theme = theme;
  const button = document.querySelector<HTMLButtonElement>("#theme-toggle");
  if (!button) return;
  const dark = theme === "dark";
  const label = dark ? "切换到浅色模式" : "切换到暗色模式";
  button.setAttribute("aria-pressed", String(dark));
  button.setAttribute("aria-label", label);
  button.title = label;
}

document.querySelector<HTMLButtonElement>("#theme-toggle")?.addEventListener("click", () => {
  const next: Theme = current() === "dark" ? "light" : "dark";
  store(next);
  apply(next);
});

// 未手动选择过主题时，跟随系统偏好变化
media.addEventListener("change", (event) => {
  if (readStored()) return;
  apply(event.matches ? "dark" : "light");
});

apply(current());
