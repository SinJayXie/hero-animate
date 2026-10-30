import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { HeroTransition } from "../lib/react";

const MENU_ITEMS = ["重命名", "复制链接", "移到废纸篓"];
const POPOVER_WIDTH = 240;

function ReactDemo() {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const btn = btnRef.current;
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    const x = Math.min(rect.right + 12, window.innerWidth - POPOVER_WIDTH - 12);
    const y = Math.min(rect.top, window.innerHeight - 260);

    // 先定位再打开：HeroTransition 挂载时 ghostOnly 才能量到正确矩形
    setPosition({ x: Math.max(12, x), y: Math.max(12, y) });
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
  };

  return (
    <div className="demo-trigger">
      <button
        ref={btnRef}
        type="button"
        className="icon-button icon-button--react"
        aria-label="打开操作菜单"
        aria-expanded={open}
        onClick={toggle}
      >
        <span className="icon-glyph" aria-hidden="true">
          ⚡
        </span>
      </button>

      <HeroTransition
        open={open}
        masked={false}
        ghostOnly
        anchor={() => btnRef.current}
        className="popover-panel"
        style={{ position: "fixed", left: position.x, top: position.y, width: POPOVER_WIDTH }}
      >
        <p className="popover-caption">操作</p>
        {MENU_ITEMS.map((label) => (
          <button key={label} type="button" className="menu-item" onClick={close}>
            {label}
          </button>
        ))}
        <button type="button" className="menu-close" onClick={close}>
          关闭
        </button>
      </HeroTransition>
    </div>
  );
}

const container = document.getElementById("react-demo");
if (container) createRoot(container).render(<ReactDemo />);
