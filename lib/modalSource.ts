// ============================================================
// modalSource：记录「最近一次触发点击」的元素与其矩形
// 弹窗 hero 转场消费它：克隆该元素，从其 rect 飞行展开；
// 关闭时收回至同一元素。
// 在 window 捕获阶段监听 pointerdown：拿到的是未被任何动效影响过的原始矩形
// ============================================================

export interface SourceRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ModalSource {
  el: HTMLElement;
  rect: SourceRect;
}

const TRIGGER_SEL = "button, [role='button'], a, label";

let last: { source: ModalSource; at: number } | null = null;
let installed = false;

function onPointerDown(e: PointerEvent): void {
  const target = e.target as Element | null;
  if (!target || !target.closest) return;
  const trigger = target.closest(TRIGGER_SEL);
  if (!trigger) return;
  const r = trigger.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return;
  last = {
    source: {
      el: trigger as HTMLElement,
      rect: { left: r.left, top: r.top, width: r.width, height: r.height },
    },
    at: performance.now(),
  };
}

/** 在应用启动时调用一次 */
export function installModalSourceTracking(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("pointerdown", onPointerDown, { capture: true });
}

/**
 * 取最近的触发源（含元素引用）；超过 maxAge（ms）视为无效。
 * 不清除记录：弹窗关闭时仍需以同一元素作为收回目标。
 */
export function consumeSource(maxAge = 800): ModalSource | null {
  if (!last) return null;
  if (performance.now() - last.at > maxAge) return null;
  return last.source;
}

/** 矩形当前是否仍在窗口可视区域内（防止收回时飞向屏外） */
export function isRectOnScreen(r: SourceRect): boolean {
  return (
    r.left + r.width > 0 &&
    r.top + r.height > 0 &&
    r.left < window.innerWidth &&
    r.top < window.innerHeight
  );
}
