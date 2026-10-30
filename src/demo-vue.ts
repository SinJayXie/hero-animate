import { createApp, defineComponent, h, ref } from "vue";
import { HeroTransition } from "../lib/vue";

const VueDemo = defineComponent({
  name: "VueDemo",
  setup() {
    const open = ref(false);

    const close = () => {
      open.value = false;
    };

    return () =>
      h("div", { class: "demo-trigger" }, [
        h(
          "button",
          {
            type: "button",
            class: "icon-button icon-button--vue",
            "aria-label": "打开示例弹窗",
            "aria-expanded": open.value,
            onClick: () => {
              open.value = !open.value;
            },
          },
          h("span", { class: "icon-glyph", "aria-hidden": "true" }, "🗂️")
        ),
        h(
          HeroTransition,
          {
            open: open.value,
            class: "modal-mask",
            // 弹簧参数可只覆盖部分字段，其余用默认值（mass 1 / stiffness 250 / damping 35 / velocity 20）
            spring: { stiffness: 300, damping: 32 },
            springAccel: { stiffness: 280, damping: 30 },
            onClick: (e: MouseEvent) => {
              if (e.target === e.currentTarget) close();
            },
          },
          {
            default: () => [
              h(
                "div",
                {
                  class: "modal-panel",
                  role: "dialog",
                  "aria-modal": "true",
                  "aria-labelledby": "vue-modal-title",
                },
                [
                  h(
                    "h3",
                    { class: "modal-title", id: "vue-modal-title" },
                    "从图标长出来的窗口"
                  ),
                  h(
                    "p",
                    { class: "modal-text" },
                    "这个面板由按钮的矩形展开而来。关闭时它会沿着同一条路径收回按钮，全程无需手写关键帧。"
                  ),
                  h(
                    "div",
                    { class: "modal-actions" },
                    h(
                      "button",
                      { type: "button", class: "primary-button", onClick: close },
                      "关闭"
                    )
                  ),
                ]
              ),
            ],
          }
        ),
      ]);
  },
});

createApp(VueDemo).mount("#vue-demo");
