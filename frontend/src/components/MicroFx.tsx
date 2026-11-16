/**
 * 全局微交互特效组件
 * 圈点自定义光标（圆环缓动跟随并钳制在环内，圆点永不跑出圆圈）
 * 以及点击 [data-ripple] 元素时的全局水波纹层
 */
import { useEffect, useRef } from "react";

const RING_LERP = 0.28;
const RING_MAX_OFFSET = 9;

export function MicroFx() {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const dotRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const handRef = useRef<HTMLDivElement | null>(null);
  const rippleLayerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!finePointer || reduceMotion) return;

    const layer = layerRef.current;
    const dot = dotRef.current;
    const ring = ringRef.current;
    const hand = handRef.current;
    const rippleLayer = rippleLayerRef.current;
    if (!layer || !dot || !ring || !hand || !rippleLayer) return;

    let mouseX = -100;
    let mouseY = -100;
    let ringX = -100;
    let ringY = -100;
    let raf = 0;
    let tracking = false;

    const tick = () => {
      dot.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, -50%)`;
      hand.style.transform = `translate3d(${mouseX + 8}px, ${mouseY + 8}px, 0)`;
      ringX += (mouseX - ringX) * RING_LERP;
      ringY += (mouseY - ringY) * RING_LERP;

      const offsetX = ringX - mouseX;
      const offsetY = ringY - mouseY;
      const distance = Math.hypot(offsetX, offsetY);
      if (distance > RING_MAX_OFFSET) {
        ringX = mouseX + (offsetX / distance) * RING_MAX_OFFSET;
        ringY = mouseY + (offsetY / distance) * RING_MAX_OFFSET;
      }

      ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%)`;
      raf = requestAnimationFrame(tick);
    };

    const onMouseMove = (event: MouseEvent) => {
      mouseX = event.clientX;
      mouseY = event.clientY;

      const target = event.target as Element | null;
      const overText = target?.closest?.("input, textarea, [contenteditable='true']");
      layer.classList.toggle("cursorfx-hidden", Boolean(overText));
      const overButton = target?.closest?.("button, a[href], [role='button'], [data-ripple]");
      layer.classList.toggle("cursorfx-on-button", Boolean(overButton));

      if (!tracking) {
        tracking = true;
        ringX = mouseX;
        ringY = mouseY;
        layer.style.opacity = "1";
        raf = requestAnimationFrame(tick);
      }
    };

    const onMouseDown = () => ring.classList.add("cursorfx-press");
    const onMouseUp = () => ring.classList.remove("cursorfx-press");
    const onLeaveWindow = () => {
      tracking = false;
      layer.style.opacity = "0";
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const host = target?.closest?.("[data-ripple]");
      if (!host) return;

      const rect = host.getBoundingClientRect();
      const size = (Math.max(rect.width, rect.height) * 2) / 3;
      const ripple = document.createElement("span");
      ripple.className = "cursorfx-ripple";
      ripple.style.width = `${size}px`;
      ripple.style.height = `${size}px`;
      ripple.style.left = `${event.clientX - size / 2}px`;
      ripple.style.top = `${event.clientY - size / 2}px`;
      ripple.style.background =
        host.getAttribute("data-ripple") === "light"
          ? "rgba(255, 255, 255, 0.45)"
          : "rgba(91, 94, 214, 0.25)";
      rippleLayer.appendChild(ripple);
      window.setTimeout(() => ripple.remove(), 650);
    };

    document.body.classList.add("cursorfx-active");
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    document.documentElement.addEventListener("mouseleave", onLeaveWindow);
    window.addEventListener("click", onClick);

    return () => {
      document.body.classList.remove("cursorfx-active");
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      document.documentElement.removeEventListener("mouseleave", onLeaveWindow);
      window.removeEventListener("click", onClick);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      <div ref={layerRef} className="cursorfx-layer" aria-hidden="true">
        <div ref={ringRef} className="cursorfx-ring" />
        <div ref={dotRef} className="cursorfx-dot" />
        <div ref={handRef} className="cursorfx-hand">
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden="true">
            <path
              d="M4.2 8.6 9.8 12.8"
              stroke="currentColor"
              strokeWidth="3.2"
              strokeLinecap="round"
              fill="none"
            />
            <rect x="10.1" y="1.8" width="3.6" height="11.4" rx="1.8" />
            <circle cx="13.7" cy="15.4" r="5.2" />
          </svg>
        </div>
      </div>
      <div ref={rippleLayerRef} className="cursorfx-ripples" aria-hidden="true" />
    </>
  );
}
