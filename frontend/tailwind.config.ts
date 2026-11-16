/**
 * Tailwind CSS 主题配置
 * 玻璃渐变风格（原型 D）：靛蓝-青绿渐变氛围 + 半透明磨砂卡片
 */
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "-apple-system",
          '"Segoe UI"',
          '"PingFang SC"',
          '"Microsoft YaHei"',
          "sans-serif",
        ],
        mono: ['"JetBrains Mono"', '"SFMono-Regular"', "Consolas", "monospace"],
      },
      colors: {
        canvas: "#eef1fa",
        ink: "#26253c",
        muted: "#62617f",
        faint: "#a2a1bd",
        rule: "rgba(93, 94, 214, 0.16)",
        accent: "#5b5ed6",
        "accent-deep": "#6366f1",
        teal: "#14b8a6",
        ok: "#0d9488",
        warn: "#d97706",
        danger: "#e11d48",
      },
      backgroundImage: {
        ambient:
          "radial-gradient(720px 420px at 12% -5%, rgba(99,102,241,0.12), transparent 65%), radial-gradient(640px 420px at 95% 20%, rgba(20,184,166,0.12), transparent 65%), radial-gradient(560px 420px at 55% 105%, rgba(217,70,239,0.07), transparent 65%)",
        "brand-gradient": "linear-gradient(135deg, #6366f1, #14b8a6)",
      },
      boxShadow: {
        glow: "0 1px 0 rgba(255, 255, 255, 0.6) inset, 0 12px 32px rgba(91, 94, 214, 0.12)",
        pop: "0 24px 60px rgba(91, 94, 214, 0.2)",
      },
    },
  },
  plugins: [],
} satisfies Config;
