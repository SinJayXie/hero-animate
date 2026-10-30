// ============================================================
// 代码高亮：Prism.js
// 只处理 pre > code[class*="language-"]；markup / javascript / css / clike
// 由 prismjs 默认入口带入，其余语言按需引入。
// ============================================================
import Prism from "prismjs";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-bash";

// 关闭 Prism 的自动执行，统一由 highlightCode 控制时机
Prism.manual = true;

export function highlightCode(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("pre code[class*='language-']").forEach((code) => {
    if (code.dataset.highlighted === "yes") return;
    Prism.highlightElement(code);
    code.dataset.highlighted = "yes";
  });
}
