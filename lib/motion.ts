// ============================================================
// 全局动效基线（Motion Tokens）
// 所有动画的时长 / 曲线 / spring / 级联 / 缩放峰值一律从这里取，
// 组件内不允许散落硬编码。CSS 关键帧定义点可引用同名 CSS 变量。
// ============================================================
import { spring } from "animejs";

// ──────────── 时长（ms） ────────────
export const DURATION = {
  /** 极短：描边、图标状态切换 */
  micro: 100,
  /** 按压/小型状态 */
  press: 130,
  /** 悬停过渡 */
  hover: 150,
  /** 短促入场（遮罩、下拉） */
  short: 180,
  /** 标准入场 */
  base: 420,
  /** 面板 / 选中指示 */
  panel: 420,
  /** 整页转场 */
  page: 350,
  /** 点击放大弹出的感知时长（与 SPRING.pop 对齐） */
  pop: 420,
} as const;

// ──────────── 曲线（anime.js spring） ────────────
/**
 * 默认弹簧参数：苹果进场/离场曲线共用同一组物理参数。
 * 业务方可通过 HeroOptions.spring / springAccel 覆盖其中任意字段，
 * 未提供的字段回落到这里。
 */
export const SPRING_PARAMS = {
  mass: 1,
  stiffness: 250,
  damping: 35,
  velocity: 20,
} as const;

export interface HeroSpringParams {
  mass?: number;
  stiffness?: number;
  damping?: number;
  velocity?: number;
}

/** 按默认值补齐后创建 anime.js spring 缓动 */
export function springEase(overrides?: HeroSpringParams) {
  return spring({ ...SPRING_PARAMS, ...overrides });
}

// ──────────── 缩放峰值 ────────────
export const SCALE = {
  /** 悬停 */
  hover: 1.04,
  /** 按下（需要收缩感时） */
  press: 0.96,
  /** 无锚点弹层的退场收缩（缩到中心消失） */
  dismiss: 0.9,
} as const;

// ──────────── 无障碍：减少动态效果 ────────────
let cachedQuery: MediaQueryList | null = null;

function mediaQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || !window.matchMedia) return null;
  if (!cachedQuery) cachedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  return cachedQuery;
}

/** 系统是否要求减少动态效果 */
export function prefersReducedMotion(): boolean {
  return mediaQuery()?.matches ?? false;
}
