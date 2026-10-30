// ============================================================
// 代码复制：给每个 .code-card 的 header 右侧注入复制按钮
// 复制内容取 code.textContent，因此与高亮产生的 span 无关。
// ============================================================
const FEEDBACK_MS = 1600;

function fallbackCopy(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  textarea.remove();
  return ok;
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 权限被拒绝时回落到 execCommand
  }
  return fallbackCopy(text);
}

function createButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "code-copy";
  button.textContent = "复制";
  button.setAttribute("aria-label", "复制代码");
  return button;
}

export function setupCodeCopy(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>(".code-card").forEach((card) => {
    const header = card.querySelector("header");
    const code = card.querySelector("pre code");
    if (!header || !code || header.querySelector(".code-copy")) return;

    const button = createButton();
    let timer = 0;

    button.addEventListener("click", async () => {
      const ok = await writeClipboard(code.textContent ?? "");
      button.textContent = ok ? "已复制" : "复制失败";
      button.classList.toggle("is-copied", ok);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        button.textContent = "复制";
        button.classList.remove("is-copied");
      }, FEEDBACK_MS);
    });

    header.appendChild(button);
  });
}
