/**
 * 首页空状态组件
 * 展示产品入口信息和可点击的示例问数问题
 */
import { LineChart, Search, ShoppingBag, Sparkles } from "lucide-react";

type EmptyStateProps = {
  examples: string[];
  onUseExample: (example: string) => void;
};

const highlights = [
  { label: "混合检索", icon: Search },
  { label: "SQL 闭环", icon: LineChart },
  { label: "电商数仓", icon: ShoppingBag },
];

export function EmptyState({ examples, onUseExample }: EmptyStateProps) {
  return (
    <div className="stagger-in mx-auto flex min-h-full max-w-5xl flex-col justify-center px-4 py-12">
      <div className="mb-10 max-w-3xl">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3 py-1.5 text-sm font-semibold text-accent">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          Ecommerce Ask-Data Agent
        </div>
        <h1 className="text-balance text-4xl font-semibold leading-tight text-ink sm:text-6xl">
          电商问数
        </h1>
      </div>

      <div className="stagger-in grid gap-3 sm:grid-cols-3">
        {highlights.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-xl border border-rule bg-white/60 px-4 py-4 shadow-glow backdrop-blur">
              <Icon className="mb-5 h-5 w-5 text-accent-deep" aria-hidden="true" />
              <div className="text-sm font-semibold text-ink">{item.label}</div>
            </div>
          );
        })}
      </div>

      <div className="stagger-in mt-6 grid gap-3 md:grid-cols-2">
        {examples.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onUseExample(example)}
            data-ripple
            className="min-h-20 rounded-xl border border-rule bg-white/65 px-4 py-4 text-left text-[15px] leading-6 text-ink shadow-glow backdrop-blur transition hover:-translate-y-0.5 hover:border-accent/40 hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-accent/35"
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}
