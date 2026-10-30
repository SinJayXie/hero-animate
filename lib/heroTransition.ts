// ============================================================
// createHeroTransition：iOS 式「图标 ⇄ 窗口」形变转场
//
// 通用化的「图标放大成窗口 / 窗口塌回图标」交叉淡化效果：
//   图标层 = 触发元素的克隆（1:1，尺寸就是触发元素）
//   窗口层 = 弹窗面板的克隆（按面板自身尺寸摆放）
//   两者用互逆的 transform 在两块矩形之间同步缩放，同时一淡出一淡入
//   ⇒ 视觉上图标自己长成窗口／窗口自己塌回图标
//
// 打开：
//   图标层 translate(dx,dy) scale(1/k) ... 不动 → 放大到面板矩形，1 → 0
//   窗口层 translate(-dx,-dy) scale(k)   → 归位到自身矩形，始终不透明
//   遮罩淡入
// 关闭：
//   窗口层 归位 → translate(-dx,-dy) scale(k)，1 → 0
//   图标层 从面板矩形 → 归位到触发元素矩形，0 → 1
//   遮罩同步淡出
//   两者落在同一块矩形上，交叉完成即无缝交回真实元素
//
// 图层挂在 document.body（position: fixed），z-index 取遮罩 z-index 加偏移，
// 不受遮罩淡出连带、也不会被祖先裁剪。
//
// 无触发源 / 触发源已消失 → 本体中心缩放；
// reduced motion → 即时显隐。
// ============================================================
import { createTimeline, type Timeline } from "animejs";
import { DURATION, SCALE, prefersReducedMotion, springEase, type HeroSpringParams } from "./motion";
import {
  consumeSource,
  installModalSourceTracking,
  isRectOnScreen,
  type SourceRect,
} from "./modalSource";

export interface HeroHandlers {
  onEnter: (el: Element, done: () => void) => void;
  onLeave: (el: Element, done: () => void) => void;
  /** 取消当前转场：清理时间线、克隆层与内联样式，并立即还原真实元素 */
  cancel: () => void;
}

export interface HeroOptions {
  /**
   * 是否存在独立遮罩（根 el = 遮罩，内部 getPanel() = 面板）。
   * false：根 el 就是面板（无背景遮罩的锚定浮层）。
   */
  masked?: boolean;
  /**
   * 无指针来源时的锚点（快捷键打开场景）：用它作为展开起点与收回终点。
   * 有指针来源（点击打开）时优先用点击的那个元素。
   */
  anchor?: () => HTMLElement | null;
  /**
   * 只操作 ghost 模式（适合 AppSelect 下拉 / CSV 菜单这类 JS 定位的小浮层）：
   *   · 打开与关闭都只动克隆体，真实浮层飞行期间 opacity 0 让位、结束同帧交回；
   *   · 不生成「图标层」，也不隐藏触发元素本体（控件本体保持可见更自然）；
   *   · 不写真实浮层的内联 transform，避免干扰它自己的定位计算。
   */
  ghostOnly?: boolean;
  /**
   * 面板选择器，默认 `.modal-panel`，用于 resolvePanel 兜底
   * （getPanel 取不到真实元素时，按此选择器在根元素内查找面板）。
   */
  panelSelector?: string;
  /**
   * 打开曲线（anime.js spring）参数：mass / stiffness / damping / velocity。
   * 只需传入想覆盖的字段，其余回落到默认值。
   */
  spring?: HeroSpringParams;
  /** 关闭曲线（anime.js spring）参数；未提供的字段回落到默认值。 */
  springAccel?: HeroSpringParams;
}

/**
 * 遮罩淡入淡出只动背景色 alpha，绝不动 opacity ——
 * 面板是遮罩的子节点，用 opacity 会把弹窗内容（含图标）一起淡掉，
 * 表现为「动画途中弹窗内容很淡、几乎看不见」。参考实现同样是动背景色。
 */
const MASK_BG_START = "rgba(0, 0, 0, 0)";
const MASK_BG_END = "rgba(0, 0, 0, 0.4)";
/** 遮罩模糊的「无」端；另一端取 .modal-mask 的自然值，避免在 TS 里重复维护 4px */
const MASK_BLUR_NONE = "blur(0px)";

/** 读取遮罩的自然模糊（来自 .modal-mask 的 backdrop-filter）；须在写 inline 值之前调用 */
function naturalMaskBlur(mask: HTMLElement): string {
  const cs = getComputedStyle(mask);
  const v =
    cs.backdropFilter ||
    (cs as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter;
  return v && v !== "none" ? v : MASK_BLUR_NONE;
}

export function createHeroTransition(
  getPanel: (root: Element) => HTMLElement | null,
  options: HeroOptions = {}
): HeroHandlers {
  // 业务方无需手动安装：函数本身幂等
  installModalSourceTracking();

  const masked = options.masked ?? true;
  const anchor = options.anchor;
  const ghostOnly = options.ghostOnly ?? false;
  const panelSelector = options.panelSelector ?? ".modal-panel";
  /** 打开/关闭缓动：用户配置按字段覆盖默认弹簧参数 */
  const openEase = springEase(options.spring);
  const closeEase = springEase(options.springAccel);
  /** 转场代次：延后一帧建 ghost 时用于判断这次转场是否已被打断 */
  let gen = 0;
  let timeline: Timeline | null = null;
  /** 窗口层：目标（面板）的克隆，负责形变 */
  let ghost: HTMLElement | null = null;
  /** 图标层：触发元素的克隆 */
  let face: HTMLElement | null = null;
  /** 打开时的触发元素；关闭时实时读取其位置 */
  let sourceEl: HTMLElement | null = null;
  let savedRect: SourceRect | null = null;
  /** 转场期间被隐藏的触发元素（避免与图标层重影） */
  let hiddenTrigger: HTMLElement | null = null;
  let hiddenTriggerOpacity: string | null = null;
  /** 当前转场涉及的遮罩与面板（供 cancel 清理） */
  let activeMask: HTMLElement | null = null;
  let activePanel: HTMLElement | null = null;

  /** 隐藏触发元素本体（记录原值以便还原） */
  function hideTrigger(el: HTMLElement): void {
    hiddenTrigger = el;
    hiddenTriggerOpacity = el.style.opacity !== "" ? el.style.opacity : null;
    el.style.opacity = "0";
  }

  /** 还原触发元素本体的可见性 */
  function restoreTrigger(): void {
    if (!hiddenTrigger) return;
    if (hiddenTriggerOpacity !== null) hiddenTrigger.style.opacity = hiddenTriggerOpacity;
    else hiddenTrigger.style.removeProperty("opacity");
    hiddenTrigger = null;
    hiddenTriggerOpacity = null;
  }

  /** 读取元素圆角（px） */
  function radiusOf(el: HTMLElement): number {
    return parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
  }

  /**
   * 解析面板元素。调用方多传 template ref，但 Vue 在下发 leave 之前就会把
   * v-if 子树里的 ref 置为 null（实测先于 leave-hook 1ms），此时元素其实
   * 还挂在文档里，所以兜底用根元素查一次。
   */
  function resolvePanel(root: Element): HTMLElement | null {
    const viaGetter = getPanel(root);
    if (viaGetter) return viaGetter;
    if (!(root instanceof HTMLElement)) return null;
    const found = root.matches(panelSelector)
      ? root
      : root.querySelector<HTMLElement>(panelSelector);
    // masked=false 的锚定浮层没有 .modal-panel 类，其根元素本身就是面板
    return found ?? (masked ? null : root);
  }

  function clearLayers(): void {
    ghost?.remove();
    ghost = null;
    face?.remove();
    face = null;
  }

  /** 回收目标：优先触发元素当前实时矩形；元素已不在 DOM 时用打开时保存的 */
  function sourceRectForLeave(): SourceRect | null {
    if (sourceEl?.isConnected) {
      const r = sourceEl.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        return { left: r.left, top: r.top, width: r.width, height: r.height };
      }
    }
    if (savedRect && savedRect.width > 0 && isRectOnScreen(savedRect)) return savedRect;
    return null;
  }

  /** 快捷键打开：用配置的锚点元素当来源（与指针来源同构） */
  function anchorSource(): { el: HTMLElement; rect: SourceRect } | null {
    const el = anchor?.();
    if (!el?.isConnected) return null;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    return { el, rect: { left: r.left, top: r.top, width: r.width, height: r.height } };
  }

  /**
   * 克隆一个元素并 1:1 固定在 rect 上（origin 取左上角），挂到 body。
   * 层序用 root（遮罩或面板）的 z-index 加偏移。
   */
  function cloneAt(
    root: Element,
    origin: HTMLElement,
    rect: SourceRect,
    layerOffset: number
  ): HTMLElement {
    const el = origin.cloneNode(true) as HTMLElement;
    el.style.removeProperty("transform");
    el.style.removeProperty("transform-origin");
    // 克隆体不继承原元素的 opacity：真实元素常在飞行期间被设为 0 让位，
    // 若一并复制过去，克隆体也会全透明（表现为「动画看不见、到点直接弹出」）。
    el.style.removeProperty("opacity");
    el.style.removeProperty("right");
    el.style.removeProperty("bottom");
    el.style.position = "fixed";
    el.style.left = `${rect.left}px`;
    el.style.top = `${rect.top}px`;
    el.style.width = `${rect.width}px`;
    el.style.height = `${rect.height}px`;
    el.style.margin = "0";
    el.style.pointerEvents = "none";
    el.style.transformOrigin = "0 0";

    const base = root instanceof HTMLElement ? Number(getComputedStyle(root).zIndex) || 0 : 0;
    el.style.zIndex = String(base + layerOffset);
    document.body.appendChild(el);
    return el;
  }

  /** 把表单控件的实时值同步进克隆体（cloneNode 不带 value/checked） */
  function syncFieldValues(origin: HTMLElement, clone: HTMLElement): void {
    const src = origin.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      "input, textarea, select"
    );
    const dst = clone.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      "input, textarea, select"
    );
    if (src.length !== dst.length) return;
    src.forEach((s, i) => {
      const d = dst[i];
      if (s instanceof HTMLInputElement && d instanceof HTMLInputElement) {
        d.checked = s.checked;
        d.indeterminate = s.indeterminate;
      }
      if (d.value !== s.value) d.value = s.value;
    });
  }

  /**
   * 清掉面板动效留下的内联样式。
   * keepHidden：关闭结束时保持 opacity 0 —— 真实面板即将被卸载，
   * 若此时恢复可见，会在卸载前多渲染一帧，表现为「关闭后闪一下」。
   */
  function resetEl(el: HTMLElement, keepHidden = false): void {
    el.style.removeProperty("transform");
    el.style.removeProperty("transform-origin");
    el.style.removeProperty("border-radius");
    if (keepHidden) el.style.opacity = "0";
    else el.style.removeProperty("opacity");
  }

  function onEnter(el: Element, done: () => void): void {
    const mask = el as HTMLElement;
    const panel = resolvePanel(el);
    activeMask = mask;
    activePanel = panel;

    timeline?.cancel();
    clearLayers();
    // 清掉上一轮可能残留的隐藏状态
    restoreTrigger();
    // 遮罩自然模糊要在写 inline 之前读
    const maskBlur = masked ? naturalMaskBlur(mask) : MASK_BLUR_NONE;
    if (masked) {
      mask.style.removeProperty("background-color");
      mask.style.removeProperty("backdrop-filter");
      mask.style.removeProperty("opacity");
    }

    if (prefersReducedMotion() || !panel) {
      panel?.style.removeProperty("opacity");
      done();
      return;
    }

    resetEl(panel);
    // 指针来源优先；快捷键打开时退回锚点元素（同样能作为收回终点）
    const source = consumeSource() ?? anchorSource();

    if (!source) {
      // 无触发源：本体从中心轻微放大浮现
      panel.style.opacity = "0";
      if (masked) {
        mask.style.backgroundColor = MASK_BG_START;
        mask.style.backdropFilter = MASK_BLUR_NONE;
      }
      timeline = createTimeline({
        onComplete: () => {
          resetEl(panel);
          if (masked) {
            mask.style.removeProperty("background-color");
            mask.style.removeProperty("backdrop-filter");
          }
          done();
        },
      });
      if (masked)
        timeline.add(
          mask,
          {
            backgroundColor: [MASK_BG_START, MASK_BG_END],
            backdropFilter: [MASK_BLUR_NONE, maskBlur],
            duration: DURATION.base,
            ease: openEase,
          },
          0
        );
      timeline.add(
        panel,
        {
          opacity: [0, 1],
          scaleX: [SCALE.dismiss, 1],
          scaleY: [SCALE.dismiss, 1],
          duration: DURATION.base,
          ease: openEase,
        },
        0
      );
      return;
    }

    sourceEl = source.el;
    savedRect = source.rect;

    // 图标矩形（触发元素）与窗口矩形（面板）
    const src = source.rect;
    const pr = panel.getBoundingClientRect();
    // 窗口层按面板自身尺寸摆放，故缩放比是 触发元素/面板（互逆）
    const kx = src.width / pr.width;
    const ky = src.height / pr.height;
    const dx = pr.left - src.left;
    const dy = pr.top - src.top;
    const startRadius = radiusOf(source.el);
    const endRadius = radiusOf(panel);

    // ── 只操作 ghost：克隆浮层从图标矩形长到自身矩形，真实浮层让位 ──
    if (ghostOnly) {
      // 先当帧隐藏真实浮层（不写它的 transform，避免干扰 JS 定位），
      // 再延后一帧克隆：Iconify 等异步内容需要一帧才渲染完，否则快照会是空 svg。
      panel.style.opacity = "0";
      const myGen = ++gen;
      requestAnimationFrame(() => {
        if (myGen !== gen || !panel.isConnected) return;

        // 在延后的一帧里重新测量：AppSelect 这类浮层的位置是 nextTick 之后
        // 才写上去的，enter 钩子里量到的还是 (0,0) 的初始盒。
        const box = panel.getBoundingClientRect();
        if (box.width <= 0 || box.height <= 0) {
          // 量不到就放弃形变，至少把浮层显示出来
          resetEl(panel);
          done();
          return;
        }
        const gkx = src.width / box.width;
        const gky = src.height / box.height;
        const gdx = box.left - src.left;
        const gdy = box.top - src.top;

        ghost = cloneAt(
          el,
          panel,
          { left: box.left, top: box.top, width: box.width, height: box.height },
          1
        );
        ghost.style.transform = `translate(${-gdx}px, ${-gdy}px) scale(${gkx}, ${gky})`;
        ghost.style.borderRadius = `${startRadius}px`;

        if (masked) {
          mask.style.backgroundColor = MASK_BG_START;
          mask.style.backdropFilter = MASK_BLUR_NONE;
        }

        timeline = createTimeline({
          onComplete: () => {
            clearLayers();
            resetEl(panel);
            if (masked) {
              mask.style.removeProperty("background-color");
              mask.style.removeProperty("backdrop-filter");
            }
            done();
          },
        });

        if (masked)
          timeline.add(
            mask,
            {
              backgroundColor: [MASK_BG_START, MASK_BG_END],
              backdropFilter: [MASK_BLUR_NONE, maskBlur],
              duration: DURATION.base,
              ease: openEase,
            },
            0
          );

        timeline.add(
          ghost,
          {
            translateX: [-gdx, 0],
            translateY: [-gdy, 0],
            scaleX: [gkx, 1],
            scaleY: [gky, 1],
            borderRadius: [startRadius, radiusOf(panel)],
            duration: DURATION.pop,
            ease: openEase,
          },
          0
        );
      });
      return;
    }

    // ── 打开时用【真实面板】做形变，不克隆 ──
    // 面板刚插入那一帧，Iconify 还没把 <path> 填进 <svg>（异步渲染），
    // 此刻 cloneNode 会得到一个空壳 svg 且永远不会补上内容 ——
    // 表现为「飞行途中弹窗图标不显示，动画结束才出现」。用真实面板即可避免。
    panel.style.transformOrigin = "0 0";
    panel.style.transform = `translate(${-dx}px, ${-dy}px) scale(${kx}, ${ky})`;
    panel.style.borderRadius = `${startRadius}px`;

    // 图标层：触发元素的克隆（按钮早已渲染完毕，克隆内容完整）
    face = cloneAt(el, source.el, src, 2);

    // 触发元素本体让位：否则图标层飞走后本体立刻露出来，形成重影
    hideTrigger(source.el);

    if (masked) {
      mask.style.backgroundColor = MASK_BG_START;
      mask.style.backdropFilter = MASK_BLUR_NONE;
    }

    timeline = createTimeline({
      onComplete: () => {
        clearLayers();
        resetEl(panel);
        if (masked) {
          mask.style.removeProperty("background-color");
          mask.style.removeProperty("backdrop-filter");
        }
        done();
      },
    });

    if (masked)
      timeline.add(
        mask,
        {
          backgroundColor: [MASK_BG_START, MASK_BG_END],
          backdropFilter: [MASK_BLUR_NONE, maskBlur],
          duration: DURATION.base,
          ease: openEase,
        },
        0
      );

    timeline
      // 面板：图标矩形 → 面板自身矩形（位置 / 尺寸 / 圆角）
      .add(
        panel,
        {
          translateX: [-dx, 0],
          translateY: [-dy, 0],
          scaleX: [kx, 1],
          scaleY: [ky, 1],
          borderRadius: [startRadius, endRadius],
          duration: DURATION.pop,
          ease: openEase,
        },
        0
      )
      // 图标层：同向放大到面板矩形，同时淡出（前半程淡完，与参考实现一致）
      .add(
        face,
        {
          translateX: [0, dx],
          translateY: [0, dy],
          scaleX: [1, 1 / kx],
          scaleY: [1, 1 / ky],
          duration: DURATION.pop,
          ease: openEase,
        },
        0
      )
      .add(face, { opacity: [1, 0, 0], duration: DURATION.pop, ease: openEase }, 0);
  }

  function onLeave(el: Element, done: () => void): void {
    const mask = el as HTMLElement;
    const panel = resolvePanel(el);
    activeMask = mask;
    activePanel = panel;
    // 关闭期间触发元素保持隐藏，等收回动画结束再还原成 1

    const finish = () => {
      restoreTrigger();
      if (masked && mask) {
        mask.style.removeProperty("pointer-events");
      }
      done();
    };

    timeline?.cancel();
    // 打断可能仍在等待建 ghost 的打开流程
    gen++;
    clearLayers();
    if (panel) {
      resetEl(panel);
    }
    // 清掉打开阶段留下的 inline，起点取自然值；收回时背景色 alpha 与
    // backdrop 模糊一起淡掉（两者都在遮罩自身上，不会连带遮罩内的面板）
    if (masked) {
      mask.style.removeProperty("background-color");
      mask.style.removeProperty("backdrop-filter");
      mask.style.removeProperty("opacity");
      mask.style.pointerEvents = "none";
    }
    const maskBlur = masked ? naturalMaskBlur(mask) : MASK_BLUR_NONE;

    if (prefersReducedMotion() || !panel) {
      if (panel) panel.style.opacity = "0";
      finish();
      return;
    }

    const pr = panel.getBoundingClientRect();
    const target = sourceRectForLeave();

    if (!target) {
      // 无锚点（如启动时自动弹出的弹窗）：缩向中心退场，保证有明确的关闭动效
      timeline = createTimeline({
        onComplete: () => {
          resetEl(panel, true);
          finish();
        },
      });
      timeline.add(
        panel,
        {
          scaleX: [1, SCALE.dismiss],
          scaleY: [1, SCALE.dismiss],
          opacity: [1, 0],
          duration: DURATION.base,
          ease: closeEase,
        },
        0
      );
      if (masked)
        timeline.add(
          mask,
          {
            backgroundColor: [MASK_BG_END, MASK_BG_START],
            backdropFilter: [maskBlur, MASK_BLUR_NONE],
            duration: DURATION.base,
            ease: closeEase,
          },
          0
        );
      return;
    }

    // 窗口层按面板自身尺寸摆放、图标层按触发元素自身尺寸摆放，
    // 两者坐标基准不同：gapX 表示「图标左上角 − 面板左上角」的偏移。
    const kx = target.width / pr.width;
    const ky = target.height / pr.height;
    const gapX = target.left - pr.left;
    const gapY = target.top - pr.top;
    const startRadius = radiusOf(panel);
    const endRadius = sourceEl?.isConnected ? radiusOf(sourceEl) : startRadius;

    // 窗口层：承接关闭动画（真实面板即将被卸载），从自身矩形塌回图标矩形
    ghost = cloneAt(el, panel, { left: pr.left, top: pr.top, width: pr.width, height: pr.height }, 2);
    syncFieldValues(panel, ghost);
    ghost.style.borderRadius = `${startRadius}px`;

    // 只操作 ghost：不生成图标层（触发元素本体可见，无需再克隆一份），
    // 克隆体直接收回触发元素矩形并淡出
    if (ghostOnly) {
      panel.style.opacity = "0";
      timeline = createTimeline({
        onComplete: () => {
          clearLayers();
          resetEl(panel, true);
          finish();
        },
      });
      if (masked) timeline.add(mask, { opacity: 0, duration: DURATION.panel, ease: closeEase }, 0);
      timeline
        .add(
          ghost,
          {
            translateX: [0, gapX],
            translateY: [0, gapY],
            scaleX: [1, kx],
            scaleY: [1, ky],
            borderRadius: [startRadius, endRadius],
            duration: DURATION.panel,
            ease: closeEase,
          },
          0
        )
        .add(ghost, { opacity: [1, 0], duration: DURATION.panel, ease: closeEase }, 0);
      return;
    }

    // 图标层：与窗口层互逆 —— 起点先摆到窗口矩形（translate(-gap)），缩回图标矩形
    face = cloneAt(el, sourceEl ?? panel, target, 1);
    face.style.transform = `translate(${-gapX}px, ${-gapY}px) scale(${1 / kx}, ${1 / ky})`;
    face.style.opacity = "0";

    panel.style.opacity = "0";

    timeline = createTimeline({
      onComplete: () => {
        clearLayers();
        resetEl(panel, true);
        finish();
      },
    });

    if (masked)
      timeline.add(
        mask,
        {
          backgroundColor: [MASK_BG_END, MASK_BG_START],
          backdropFilter: [maskBlur, MASK_BLUR_NONE],
          duration: DURATION.panel,
          ease: closeEase,
        },
        0
      );

    timeline
      // 窗口层：面板矩形 → 图标矩形，同时淡出
      .add(
        ghost,
        {
          translateX: [0, gapX],
          translateY: [0, gapY],
          scaleX: [1, kx],
          scaleY: [1, ky],
          borderRadius: [startRadius, endRadius],
          duration: DURATION.panel,
          ease: closeEase,
        },
        0
      )
      .add(ghost, { opacity: [1, 0], duration: DURATION.panel, ease: closeEase }, 0)
      // 图标层：窗口矩形 → 图标矩形，同时淡入（与窗口层交叉）
      .add(
        face,
        {
          translateX: [-gapX, 0],
          translateY: [-gapY, 0],
          scaleX: [1 / kx, 1],
          scaleY: [1 / ky, 1],
          duration: DURATION.panel,
          ease: closeEase,
        },
        0
      )
      .add(face, { opacity: [0, 0.8, 1], duration: DURATION.panel, ease: closeEase }, 0);
  }

  /**
   * 取消当前转场：停掉时间线、作废延后的 ghost 构建、移除克隆层，
   * 把遮罩与面板的内联样式恢复成自然状态。
   */
  function cancel(): void {
    timeline?.cancel();
    timeline = null;
    gen++;
    clearLayers();
    restoreTrigger();
    if (activePanel) {
      resetEl(activePanel);
      activePanel.style.removeProperty("opacity");
    }
    if (activeMask) {
      activeMask.style.removeProperty("background-color");
      activeMask.style.removeProperty("backdrop-filter");
      activeMask.style.removeProperty("opacity");
      activeMask.style.removeProperty("pointer-events");
    }
  }

  return { onEnter, onLeave, cancel };
}

/**
 * 便捷工厂：外层 <Transition :css="false"> 包住整个弹窗组件时使用。
 * 面板通过根元素内的选择器定位（弹窗面板通常带 .modal-panel）。
 */
export function createDialogHero(
  selector = ".modal-panel",
  options: HeroOptions = {}
): HeroHandlers {
  return createHeroTransition((root) => {
    if (!(root instanceof HTMLElement)) return null;
    // 兜底：hooks 可能挂在遮罩上（取内部面板），也可能直接挂在面板上
    return root.matches(selector) ? root : root.querySelector<HTMLElement>(selector);
  }, { panelSelector: selector, ...options });
}
