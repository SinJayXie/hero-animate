import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createHeroTransition } from "./heroTransition";
import type { HeroSpringParams } from "./motion";

/** 当前转场阶段（用 ref 保存，不参与渲染） */
type Phase = "closed" | "entering" | "open" | "leaving";

export interface HeroTransitionProps {
  open: boolean;
  masked?: boolean;
  ghostOnly?: boolean;
  panelSelector?: string;
  anchor?: () => HTMLElement | null;
  /** 打开曲线弹簧参数（未提供的字段用默认值） */
  spring?: HeroSpringParams;
  /** 关闭曲线弹簧参数（未提供的字段用默认值） */
  springAccel?: HeroSpringParams;
  onEntered?: () => void;
  onExited?: () => void;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/**
 * hero 转场的 React 适配：负责挂载/卸载时序，动画本身交给核心库。
 * 离场动画期间保持挂载，done 之后才卸载。
 */
export function HeroTransition({
  open,
  masked = true,
  ghostOnly = false,
  panelSelector = ".modal-panel",
  anchor,
  spring,
  springAccel,
  onEntered,
  onExited,
  className,
  style,
  children,
}: HeroTransitionProps): JSX.Element | null {
  const [mounted, setMounted] = useState(open);
  const rootRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef<Phase>("closed");
  const seqRef = useRef(0);

  const anchorRef = useRef(anchor);
  const onEnteredRef = useRef(onEntered);
  const onExitedRef = useRef(onExited);

  useEffect(() => {
    anchorRef.current = anchor;
    onEnteredRef.current = onEntered;
    onExitedRef.current = onExited;
  });

  // 弹簧参数常以对象字面量传入，用序列化值做依赖，避免每次渲染重建 hero 打断动画
  const springKey = JSON.stringify(spring ?? null);
  const springAccelKey = JSON.stringify(springAccel ?? null);

  const hero = useMemo(
    () =>
      createHeroTransition(
        (root) => (root instanceof HTMLElement ? root.querySelector<HTMLElement>(panelSelector) : null),
        {
          masked,
          ghostOnly,
          panelSelector,
          anchor: () => anchorRef.current?.() ?? null,
          spring,
          springAccel,
        }
      ),
    [masked, ghostOnly, panelSelector, springKey, springAccelKey]
  );

  useEffect(() => {
    if (open) {
      if (!mounted) {
        setMounted(true);
        return;
      }
      const el = rootRef.current;
      if (!el) return;
      const phase = phaseRef.current;
      if (phase === "entering" || phase === "open") return;
      const my = ++seqRef.current;
      phaseRef.current = "entering";
      hero.onEnter(el, () => {
        if (my !== seqRef.current) return;
        phaseRef.current = "open";
        onEnteredRef.current?.();
      });
      return;
    }

    if (!mounted) return;
    const el = rootRef.current;
    if (!el) {
      setMounted(false);
      return;
    }
    if (phaseRef.current === "leaving") return;
    const my = ++seqRef.current;
    phaseRef.current = "leaving";
    hero.onLeave(el, () => {
      if (my !== seqRef.current) return;
      phaseRef.current = "closed";
      setMounted(false);
      onExitedRef.current?.();
    });
  }, [open, mounted, hero]);

  // 卸载 / hero 重建时中断转场；StrictMode 下 effect 双调用后 phase 必须复位
  useEffect(
    () => () => {
      seqRef.current++;
      phaseRef.current = "closed";
      hero.cancel();
    },
    [hero]
  );

  if (!mounted) return null;

  return (
    <div ref={rootRef} className={className} style={style}>
      {children}
    </div>
  );
}
