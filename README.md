# hero-animate

iOS 风格「图标 ⇄ 窗口」形变转场：窗口从触发元素（按钮 / 图标）的矩形展开，关闭时沿同一条路径收回原处。框架无关核心 + Vue 3 / React 开箱即用组件。

[![npm](https://img.shields.io/npm/v/hero-animate.svg)](https://www.npmjs.com/package/hero-animate)
[![license](https://img.shields.io/npm/l/hero-animate.svg)](./LICENSE)
[![docs](https://img.shields.io/badge/docs-GitHub%20Pages-5b5bd6)](https://sinjayxie.github.io/hero-animate/)

- **形变转场**：遮罩 + 面板 + 图标克隆三层交叉，视觉上「图标长成窗口 / 窗口塌回图标」
- **零配置**：自动记录 pointerdown 触发源；无触发源时回落到本体中心缩放
- **Vue / React 组件**：`open` 状态驱动，内置挂载 / 卸载与离场动画管理
- **弹簧可调**：`mass / stiffness / damping / velocity` 任意字段覆盖，其余用默认值
- **无障碍**：`prefers-reduced-motion` 下自动跳过动画
- **ESM + 类型**：核心入口零框架依赖，`vue` / `react` 为可选 peer

## 安装

```bash
pnpm add hero-animate animejs
# Vue 项目额外安装 vue（已有可跳过）
# React 项目额外安装 react（已有可跳过）
```

`animejs@^4` 为必装 peer 依赖；`vue` / `react` 仅在引入对应子入口时需要。

## 快速开始

### Vue 3

```vue
<script setup lang="ts">
import { ref } from "vue";
import { HeroTransition } from "hero-animate/vue";

const open = ref(false);
</script>

<template>
  <button class="icon-button" @click="open = true">📁</button>

  <HeroTransition :open="open" class="modal-mask" @exited="open = false">
    <div class="modal-panel">
      <h3>从图标长出来的窗口</h3>
      <button @click="open = false">关闭</button>
    </div>
  </HeroTransition>
</template>
```

### React

```tsx
import { useState } from "react";
import { HeroTransition } from "hero-animate/react";

export function Demo() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="icon-button" onClick={() => setOpen(true)}>📁</button>

      <HeroTransition open={open} className="modal-mask" onExited={() => {}}>
        <div className="modal-panel">
          <h3>从图标长出来的窗口</h3>
          <button onClick={() => setOpen(false)}>关闭</button>
        </div>
      </HeroTransition>
    </>
  );
}
```

### 锚定浮层（下拉 / 菜单）

`masked={false}` 时根元素本身就是面板；配合 `ghostOnly`，浮层只动克隆体，真实浮层在飞行期间让位，适合 JS 定位的小浮层。

```tsx
<HeroTransition
  open={open}
  masked={false}
  ghostOnly
  anchor={() => buttonRef.current}
  className="popover-panel"
  style={{ position: "fixed", left: x, top: y }}
>
  …
</HeroTransition>
```

### 核心 API（任意框架 / 原生）

```ts
import { createHeroTransition } from "hero-animate";

const hero = createHeroTransition(
  (root) => root.querySelector(".modal-panel"),
  { masked: true }
);

// CSS hooks 语义：动画结束调用 done
hero.onEnter(maskEl, () => {});
hero.onLeave(maskEl, () => {});
hero.cancel(); // 中断并清理
```

`createDialogHero(selector = ".modal-panel", options?)` 是外层 `<Transition :css="false">` 场景的语法糖。

## CSS 约定

转场不注入任何样式，但会读取元素的自然样式来对齐：

```css
.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px); /* 会被读取为遮罩动画的终点模糊值 */
}

.modal-panel {
  width: 420px;
  border-radius: 20px;
  background: #fff;
}
```

- 面板选择器默认 `.modal-panel`，可用 `panelSelector` 覆盖
- 组件在原地渲染：若祖先节点带 `transform` / `filter` / `backdrop-filter`，`position: fixed` 会以该祖先为包含块。建议将弹窗挂到 `body`（Vue `Teleport` / React Portal）

## API

### HeroOptions

| 选项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `masked` | `boolean` | `true` | 根元素是遮罩（内部找面板）；`false` 时根元素本身就是面板 |
| `panelSelector` | `string` | `".modal-panel"` | 面板选择器，用于在根元素内定位面板 |
| `anchor` | `() => HTMLElement \| null` | — | 无指针来源时的锚点（快捷键打开等场景） |
| `ghostOnly` | `boolean` | `false` | 只动画克隆体，不写真实浮层 transform |
| `spring` | `HeroSpringParams` | 见下 | 打开曲线弹簧参数 |
| `springAccel` | `HeroSpringParams` | 见下 | 关闭曲线弹簧参数 |

### HeroHandlers

| 成员 | 类型 | 说明 |
| --- | --- | --- |
| `onEnter` | `(el: Element, done: () => void) => void` | 打开转场，结束调用 `done` |
| `onLeave` | `(el: Element, done: () => void) => void` | 关闭转场，结束调用 `done` |
| `cancel` | `() => void` | 中断时间线、移除克隆层、还原被隐藏的触发元素 |

### 组件 Props

| Prop | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `open` | `boolean` | — | 必填，驱动打开 / 关闭 |
| `masked` | `boolean` | `true` | 同 `HeroOptions.masked` |
| `panelSelector` | `string` | `".modal-panel"` | 同 `HeroOptions.panelSelector` |
| `anchor` | `() => HTMLElement \| null` | — | 同 `HeroOptions.anchor` |
| `ghostOnly` | `boolean` | `false` | 同 `HeroOptions.ghostOnly` |
| `spring` / `springAccel` | `HeroSpringParams` | 见下 | 弹簧参数 |

- Vue：`entered` / `exited` 事件，其余 attrs 透传根元素
- React：`onEntered` / `onExited` 回调，额外支持 `className` / `style` / `children`

## 弹簧参数

默认值与 `SPRING_PARAMS` 一致：

```ts
import { SPRING_PARAMS } from "hero-animate";

// { mass: 1, stiffness: 250, damping: 35, velocity: 20 }
```

只传想覆盖的字段，其余自动回落：

```ts
createHeroTransition(getPanel, {
  spring: { stiffness: 300, damping: 32 },      // 打开
  springAccel: { stiffness: 280, damping: 30 }, // 关闭
});
```

| 字段 | 含义 | 默认值 |
| --- | --- | --- |
| `mass` | 质量，越大越迟滞 | `1` |
| `stiffness` | 刚度，越大越快 | `250` |
| `damping` | 阻尼，越小回弹越明显 | `35` |
| `velocity` | 初速度 | `20` |

## 触发源追踪

库在创建转场时自动在 window 捕获阶段安装一次监听，记录最近一次 pointerdown 命中的 `button / [role="button"] / a / label` 及其矩形（800ms 内有效）。如需提前安装：

```ts
import { installModalSourceTracking } from "hero-animate";
installModalSourceTracking();
```

## 开发与发布

```bash
pnpm install
pnpm dev          # 本地文档 + 演示（http://localhost:5173）
pnpm typecheck    # 类型检查
pnpm build        # 构建 dist/（ESM + d.ts）
pnpm docs:build   # 构建文档站到 docs-dist/
npm publish       # 发布（prepublishOnly 会自动构建）
```

文档站通过 [deploy-docs.yml](./.github/workflows/deploy-docs.yml) 在 push 到 `main` 时自动发布到 GitHub Pages。首次部署前需在仓库 **Settings → Pages → Build and deployment** 将 Source 设为 **GitHub Actions**（`GITHUB_TOKEN` 无权自动创建 Pages 站点）。

## License

[MIT](./LICENSE) © SinJayXie
