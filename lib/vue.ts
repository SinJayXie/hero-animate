// ============================================================
// Vue 3 适配：<HeroTransition> 组件
//
// 把核心库的 createHeroTransition 包成「v-if 语义」的容器组件：
//   · open=true  → 渲染根元素并播放 enter 动画
//   · open=false → 播放 leave 动画，结束后卸载根元素
// 根元素既可以是遮罩（masked=true，面板在内部），也可以是面板本身
// （masked=false，无遮罩的锚定浮层）。
// ============================================================
import {
  defineComponent,
  h,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type PropType,
} from "vue";
import { createHeroTransition, type HeroHandlers, type HeroSpringParams } from "./index";

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
}

export const HeroTransition = defineComponent({
  name: "HeroTransition",
  inheritAttrs: false,
  props: {
    open: { type: Boolean, required: true },
    masked: { type: Boolean, default: true },
    ghostOnly: { type: Boolean, default: false },
    panelSelector: { type: String, default: ".modal-panel" },
    anchor: {
      type: Function as PropType<() => HTMLElement | null>,
      default: undefined,
    },
    spring: {
      type: Object as PropType<HeroSpringParams>,
      default: undefined,
    },
    springAccel: {
      type: Object as PropType<HeroSpringParams>,
      default: undefined,
    },
  },
  emits: ["entered", "exited"],
  setup(props, { slots, attrs, emit }) {
    /** 根元素是否挂载在 DOM 中（等价于 v-if） */
    const visible = ref(props.open);
    const rootEl = ref<HTMLElement | null>(null);
    /** 转场代次：快速切换时让旧动画的回调失效 */
    let seq = 0;

    const hero: HeroHandlers = createHeroTransition(
      (root) => (root instanceof HTMLElement ? root.querySelector(props.panelSelector) : null),
      {
        masked: props.masked,
        ghostOnly: props.ghostOnly,
        panelSelector: props.panelSelector,
        anchor: () => props.anchor?.() ?? null,
        spring: props.spring,
        springAccel: props.springAccel,
      }
    );

    async function enter(): Promise<void> {
      const my = ++seq;
      if (!visible.value) {
        visible.value = true;
        await nextTick();
      }
      if (my !== seq) return;
      const root = rootEl.value;
      if (!root) return;
      hero.onEnter(root, () => {
        if (my !== seq) return;
        emit("entered");
      });
    }

    function leave(): void {
      const my = ++seq;
      const root = rootEl.value;
      if (!root) {
        visible.value = false;
        emit("exited");
        return;
      }
      hero.onLeave(root, () => {
        if (my !== seq) return;
        visible.value = false;
        emit("exited");
      });
    }

    watch(
      () => props.open,
      (open) => {
        if (open) void enter();
        else leave();
      }
    );

    onMounted(() => {
      if (props.open) void enter();
    });

    onBeforeUnmount(() => {
      seq++;
      hero.cancel();
    });

    return () =>
      visible.value ? h("div", { ...attrs, ref: rootEl }, slots.default?.()) : null;
  },
});
